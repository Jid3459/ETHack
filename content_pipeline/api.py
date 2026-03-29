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

import traceback
from datetime import datetime, timezone
from typing import Optional

from content_pipeline.graph import create_initial_state, get_compiled_graph
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langgraph.types import Command
from pydantic import BaseModel

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
    """
    try:
        for _ in _graph.stream(initial_state, config=thread_config):
            pass  # each yielded value is a node output — streamed to frontend via SSE in production
    except Exception as exc:
        # Log error — don't crash the background task
        print(f"[Pipeline error] {exc}")
        traceback.print_exc()


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
    Trigger Agent 7 — Feedback Collector for a completed run.

    Call this 24-48h after distribution to pull engagement analytics
    (likes, shares, comments, clicks, reach) from Buffer, WordPress, and SendGrid.

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
        # Store result in registry for GET /feedback/{run_id}
        _run_registry[run_id]["feedback_result"] = result
        print(
            f"[API] Feedback collection complete for run {run_id}: {result['feedback_records']} record(s)"
        )

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

    Shows:
      - Per-channel engagement stats (likes, comments, shares, clicks, reach)
      - Engagement rate calculated per channel
      - Timestamp of when analytics were polled

    This data is also stored in feedback_memory Qdrant collection and used
    automatically by Agent 1 on future runs for the same company.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")

    feedback = _run_registry[run_id].get("feedback_result")
    if not feedback:
        return {
            "run_id": run_id,
            "status": "not_collected",
            "message": "No feedback collected yet. Call POST /feedback/{run_id} first.",
        }

    return {"run_id": run_id, "status": "collected", **feedback}


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
