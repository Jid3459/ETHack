"""
FastAPI backend — exposes the content pipeline as a REST API.

Endpoints:
  POST /onboard              — register a new company
  POST /run                  — start a pipeline run
  GET  /status/{run_id}      — poll pipeline status
  POST /approve/{run_id}     — submit human decision (resume INTERRUPT)
  GET  /audit/{run_id}       — get full audit trail
  GET  /runs/{company_id}    — list all runs for a company
"""

from __future__ import annotations

import os
import threading
import traceback
from datetime import datetime, timedelta, timezone
from typing import Optional

from content_pipeline.graph import create_initial_state, get_compiled_graph
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langgraph.types import Command
from pydantic import BaseModel

# Delay before Agent 7 collects analytics after distribution.
# Default: 24h. Set FEEDBACK_DELAY_SECONDS=60 in .env for quick testing.
FEEDBACK_DELAY_SECONDS = int(os.getenv("FEEDBACK_DELAY_SECONDS", str(24 * 3600)))

app = FastAPI(title="Content Pipeline API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compiled graph is a module-level singleton
_graph = get_compiled_graph()

# In-memory run registry (replace with DB in production)
# Maps run_id → thread_config used for LangGraph checkpointer
_run_registry: dict[str, dict] = {}

# In-memory company profile store — populated by POST /onboard
_company_profiles: dict[str, dict] = {}


# ── Request / Response schemas ────────────────────────────────────────────────


class OnboardRequest(BaseModel):
    company_id: str
    name: str
    industry: str
    tone: str
    brand_voice: str
    required_disclaimers: list[str] = []
    approved_terms: dict[str, str] = {}
    default_persona: str = ""
    permitted_language: str = ""
    writing_rules: str = ""


class RunRequest(BaseModel):
    company_id: str
    brief: str
    channel: str = ""  # optional — Agent 0 decides if empty
    content_type: str = ""  # optional — Agent 0 decides if empty
    target_audience: Optional[str] = (
        None  # e.g. "first-time investors", "SMB finance teams"
    )
    target_languages: list[str] = ["en"]
    scheduled_time: Optional[str] = None


class ApproveRequest(BaseModel):
    decision: str  # "approve" | "reject"
    feedback: Optional[str] = None


# ── Background pipeline runner ────────────────────────────────────────────────


def _run_pipeline_background(initial_state: dict, thread_config: dict) -> None:
    """
    Run the graph in a background thread.
    The graph will INTERRUPT at human_gate and wait.
    After Agent 5 completes distribution, automatically schedules Agent 7
    to collect engagement analytics after FEEDBACK_DELAY_SECONDS.
    """
    try:
        for _ in _graph.stream(initial_state, config=thread_config):
            pass  # each yielded value is a node output — streamed to frontend via SSE in production
    except Exception as exc:
        # Log error — don't crash the background task
        print(f"[Pipeline error] {exc}")
        traceback.print_exc()
        return

    # After stream ends, check if distribution completed and auto-schedule feedback
    try:
        state_snapshot = _graph.get_state(thread_config)
        if state_snapshot and state_snapshot.values.get("pipeline_complete"):
            run_id = state_snapshot.values.get("run_id")
            if run_id and run_id in _run_registry:
                # Only schedule if not already scheduled or collected
                entry = _run_registry[run_id]
                if not entry.get("feedback_scheduled_at") and not entry.get("feedback_result"):
                    _auto_schedule_feedback(run_id, thread_config)
    except Exception as exc:
        print(f"[Pipeline] Could not auto-schedule feedback: {exc}")


def _auto_schedule_feedback(run_id: str, thread_config: dict) -> None:
    """
    Schedule Agent 7 feedback collection FEEDBACK_DELAY_SECONDS after distribution.
    Uses a daemon threading.Timer so it does not block server shutdown.

    The timer fires once and calls collect_feedback() exactly as the manual
    POST /feedback/{run_id} endpoint does — results land in _run_registry under
    'feedback_result' and are readable via GET /feedback/{run_id}.
    """
    delay = FEEDBACK_DELAY_SECONDS
    eta = datetime.now(timezone.utc) + timedelta(seconds=delay)

    _run_registry[run_id]["feedback_scheduled_at"] = datetime.now(timezone.utc).isoformat()
    _run_registry[run_id]["feedback_eta"] = eta.isoformat()

    print(
        f"[API] Auto-scheduled Agent 7 for run {run_id} "
        f"in {delay}s (ETA: {eta.isoformat()})"
    )

    def _run_feedback():
        try:
            state_snapshot = _graph.get_state(thread_config)
            if state_snapshot is None:
                print(f"[API] Auto-feedback: state not found for run {run_id}")
                return
            values = state_snapshot.values
            from content_pipeline.agents.agent7_feedback import collect_feedback
            result = collect_feedback(
                run_id=run_id,
                company_id=values.get("company_id", ""),
                distribution_receipts=values.get("distribution_receipts", []),
                current_draft=values.get("current_draft", ""),
                content_type=values.get("content_type", ""),
                target_audience=values.get("target_audience") or "default",
            )
            _run_registry[run_id]["feedback_result"] = result
            print(
                f"[API] Auto-feedback complete for run {run_id}: "
                f"{result['feedback_records']} record(s)"
            )
        except Exception as exc:
            print(f"[API] Auto-feedback failed for run {run_id}: {exc}")
            traceback.print_exc()

    timer = threading.Timer(delay, _run_feedback)
    timer.daemon = True  # don't block server shutdown
    timer.start()
    _run_registry[run_id]["_feedback_timer"] = timer


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.post("/onboard")
async def onboard_company(req: OnboardRequest):
    """
    Register a new company profile.
    TODO: persist to Qdrant company_profiles collection.
    Returns the company_id for use in subsequent /run calls.
    """
    profile = req.model_dump()
    profile["created_at"] = datetime.now(timezone.utc).isoformat()
    _company_profiles[req.company_id] = profile
    return {"company_id": req.company_id, "status": "created", "profile": profile}


@app.post("/run")
async def start_run(req: RunRequest, background_tasks: BackgroundTasks):
    """
    Start a new content pipeline run.
    Returns run_id immediately. Pipeline runs in the background.
    Poll GET /status/{run_id} to track progress.
    """
    initial_state = create_initial_state(
        company_id=req.company_id,
        brief=req.brief,
        channel=req.channel,
        content_type=req.content_type,
        target_audience=req.target_audience,
        target_languages=req.target_languages,
        scheduled_time=req.scheduled_time,
        company_profile=_company_profiles.get(req.company_id),
    )
    run_id = initial_state["run_id"]

    # LangGraph uses thread_id for checkpointing
    thread_config = {"configurable": {"thread_id": run_id}}
    _run_registry[run_id] = {
        "thread_config": thread_config,
        "company_id": req.company_id,
        "brief": req.brief[:120],
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    background_tasks.add_task(_run_pipeline_background, initial_state, thread_config)

    return {"run_id": run_id, "status": "started"}


@app.get("/status/{run_id}")
async def get_status(run_id: str):
    """
    Return current pipeline status.
    Frontend polls this every 2 seconds.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")

    thread_config = _run_registry[run_id]["thread_config"]

    try:
        state_snapshot = _graph.get_state(thread_config)
    except Exception:
        return {"run_id": run_id, "status": "not_started"}

    if state_snapshot is None:
        return {"run_id": run_id, "status": "not_started"}

    values = state_snapshot.values
    next_nodes = state_snapshot.next

    # Determine status
    if values.get("pipeline_complete"):
        status = "complete"
    elif values.get("awaiting_human") or (
        next_nodes and "human_gate" in str(next_nodes)
    ):
        status = "awaiting_human"
    elif values.get("error"):
        status = "error"
    elif next_nodes:
        status = "running"
    else:
        status = "complete"

    return {
        "run_id": run_id,
        "status": status,
        "current_node": list(next_nodes)[0] if next_nodes else None,
        "revision_count": values.get("revision_count", 0),
        "brand_score": values.get("brand_score"),
        "brand_passed": values.get("brand_passed", False),
        "legal_passed": values.get("legal_passed", False),
        "legal_flags_count": len(values.get("legal_flags", [])),
        "draft_preview": (values.get("current_draft") or "")[:300],
        "strategy_card": values.get("strategy_card"),
        "awaiting_human": status == "awaiting_human",
        "pipeline_complete": values.get("pipeline_complete", False),
        # Full approval payload when awaiting human
        "approval_data": (
            {
                "draft": values.get("current_draft"),
                "brand_score": values.get("brand_score"),
                "brand_violations": values.get("brand_violations", []),
                "legal_flags": values.get("legal_flags", []),
                "strategy_card": values.get("strategy_card"),
                "seo_suggestions": values.get("seo_notes"),
            }
            if status == "awaiting_human"
            else None
        ),
    }


@app.post("/approve/{run_id}")
async def submit_approval(
    run_id: str, req: ApproveRequest, background_tasks: BackgroundTasks
):
    """
    Submit human decision to resume a pipeline that is waiting at human_gate.

    Approve → pipeline resumes to localisation + distribution.
    Reject + feedback → pipeline routes back to Agent 1.
    Reject (no feedback) → pipeline ends.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")

    if req.decision not in ("approve", "reject"):
        raise HTTPException(
            status_code=400,
            detail="decision must be 'approve' or 'reject'",
        )

    thread_config = _run_registry[run_id]["thread_config"]

    # Resume the graph by sending the human's response to the interrupt
    human_response = {
        "decision": req.decision,
        "feedback": req.feedback or "",
    }

    # LangGraph Command resumes from INTERRUPT with the provided value
    resume_command = Command(resume=human_response)

    background_tasks.add_task(_run_pipeline_background, resume_command, thread_config)

    return {
        "run_id": run_id,
        "status": "resumed" if req.decision == "approve" else "resuming_with_feedback",
        "decision": req.decision,
    }


@app.get("/audit/{run_id}")
async def get_audit_trail(run_id: str):
    """
    Return the complete audit trail for a run.
    Each entry includes agent, timestamp, action, decision, and detail.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")

    thread_config = _run_registry[run_id]["thread_config"]

    try:
        state_snapshot = _graph.get_state(thread_config)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not retrieve state")

    if state_snapshot is None:
        return {"run_id": run_id, "entries": []}

    return {
        "run_id": run_id,
        "entries": state_snapshot.values.get("audit_trail", []),
        "distribution_receipts": state_snapshot.values.get("distribution_receipts", []),
    }


@app.post("/feedback/{run_id}")
async def trigger_feedback_collection(run_id: str, background_tasks: BackgroundTasks):
    """
    Manually trigger Agent 7 — Feedback Collector for a completed run.

    Normally Agent 7 is auto-scheduled FEEDBACK_DELAY_SECONDS after distribution
    (default 24h). Call this endpoint to trigger immediately — useful for testing
    or to collect analytics earlier than the scheduled time.

    If an auto-schedule timer is still pending, it will be cancelled first.

    Results are stored in the feedback_memory Qdrant collection.
    Agent 1 will use this data on the next run for this company to improve content.

    Output: GET /feedback/{run_id} returns the collected analytics JSON.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")

    thread_config = _run_registry[run_id]["thread_config"]

    try:
        state_snapshot = _graph.get_state(thread_config)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not retrieve run state")

    if state_snapshot is None:
        raise HTTPException(status_code=404, detail="Run state not found")

    values = state_snapshot.values
    if not values.get("pipeline_complete"):
        raise HTTPException(
            status_code=400,
            detail="Pipeline not yet complete — wait for distribution to finish first",
        )

    # Cancel any pending auto-schedule timer so both don't fire
    existing_timer: threading.Timer | None = _run_registry[run_id].get("_feedback_timer")
    if existing_timer is not None:
        existing_timer.cancel()
        _run_registry[run_id]["_feedback_timer"] = None
        print(f"[API] Cancelled auto-schedule timer for run {run_id} (manual trigger)")

    from content_pipeline.agents.agent7_feedback import collect_feedback

    def _run_feedback():
        result = collect_feedback(
            run_id=run_id,
            company_id=values.get("company_id", ""),
            distribution_receipts=values.get("distribution_receipts", []),
            current_draft=values.get("current_draft", ""),
            content_type=values.get("content_type", ""),
            target_audience=values.get("target_audience") or "default",
        )
        _run_registry[run_id]["feedback_result"] = result
        print(f"[API] Manual feedback collection complete for run {run_id}: {result['feedback_records']} record(s)")

    background_tasks.add_task(_run_feedback)

    return {
        "run_id": run_id,
        "status": "collecting",
        "message": "Agent 7 is polling analytics APIs. Check GET /feedback/{run_id} in ~10 seconds.",
    }


@app.get("/feedback/{run_id}")
async def get_feedback(run_id: str):
    """
    Return engagement analytics collected by Agent 7 for a run.

    Possible statuses:
      - "scheduled"      — Agent 7 will auto-fire at feedback_eta (set after distribution)
      - "collected"      — Analytics are available (auto or manual trigger completed)
      - "not_collected"  — Pipeline not yet complete or feedback never triggered

    Analytics are also stored in feedback_memory Qdrant collection and used
    automatically by Agent 1 on future runs for the same company.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")

    entry = _run_registry[run_id]
    feedback = entry.get("feedback_result")

    if feedback:
        return {"run_id": run_id, "status": "collected", **feedback}

    if entry.get("feedback_scheduled_at"):
        return {
            "run_id": run_id,
            "status": "scheduled",
            "feedback_scheduled_at": entry["feedback_scheduled_at"],
            "feedback_eta": entry.get("feedback_eta"),
            "message": (
                f"Agent 7 will auto-collect analytics at {entry.get('feedback_eta')}. "
                "Call POST /feedback/{run_id} to trigger immediately instead."
            ),
        }

    return {
        "run_id": run_id,
        "status": "not_collected",
        "message": "No feedback collected yet. Call POST /feedback/{run_id} to trigger manually.",
    }


@app.get("/knowledge/{company_id}")
async def list_product_knowledge(company_id: str):
    """
    List all product knowledge documents ingested for a company.

    Documents are ingested via: python ingest_docs.py path/to/file.pdf --company {company_id}
    They are used by Agent 1 to enrich drafts with accurate product details.
    """
    from content_pipeline.tools.product_knowledge import ProductKnowledgeStore

    store = ProductKnowledgeStore()
    sources = store.list_sources(company_id=company_id)
    return {
        "company_id": company_id,
        "sources": sources,
        "total_chunks": sum(s["chunks"] for s in sources),
        "message": (
            "Ingest more docs with: python ingest_docs.py path/to/file.pdf "
            f"--company {company_id}"
        ),
    }


@app.get("/runs/{company_id}")
async def list_runs(company_id: str, limit: int = 20):
    """
    Return paginated list of all runs for a company.
    """
    company_runs = [
        {
            "run_id": run_id,
            "brief": meta["brief"],
            "started_at": meta["started_at"],
            "company_id": meta["company_id"],
        }
        for run_id, meta in _run_registry.items()
        if meta["company_id"] == company_id
    ]
    # Most recent first
    company_runs.sort(key=lambda x: x["started_at"], reverse=True)
    return {"company_id": company_id, "runs": company_runs[:limit]}
