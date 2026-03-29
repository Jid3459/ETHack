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
import io

from content_pipeline.graph import create_initial_state, get_compiled_graph
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi import UploadFile, File, Form  #new addition by me for upload file or pdf point
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
    target_audience: Optional[str] = None  # e.g. "first-time investors", "SMB finance teams"
    target_languages: list[str] = ["en"]
    scheduled_time: Optional[str] = None


class ApproveRequest(BaseModel):
    decision: str  # "approve" | "reject"
    feedback: Optional[str] = None
    
    
# --new addition-- by me     
class ScheduleRequest(BaseModel):
    """Body for POST /schedule/{run_id}"""
    scheduled_time: str          # ISO-8601 string, e.g. "2026-04-01T09:00:00+05:30"
    channels: Optional[list[str]] = None   # optional override of distribution channels
    
    
#new additional featre of a/b variant    
class ABRunRequest(BaseModel):
    company_id: str
    brief: str
    channel: str = "linkedin"
    content_type: str = "post"
    target_languages: list[str] = ["en"]
    scheduled_time: Optional[str] = None


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
        print(f"[API] Feedback collection complete for run {run_id}: {result['feedback_records']} record(s)")

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


# ----- new addition for dashboard by me ----

@app.post("/schedule/{run_id}")
async def update_schedule(run_id: str, req: ScheduleRequest):
    """
    Set or update the scheduled_time for a run that is already approved
    but hasn't distributed yet (pipeline_complete == False).
 
    The distributor agent reads scheduled_time from state — updating it
    here via graph.update_state() propagates it before Agent 5 runs.
    """
    if run_id not in _run_registry:
        raise HTTPException(status_code=404, detail="Run not found")
 
    thread_config = _run_registry[run_id]["thread_config"]
 
    try:
        _graph.update_state(
            thread_config,
            {"scheduled_time": req.scheduled_time},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not update state: {exc}")
 
    # Also cache in registry for dashboard reads (fast path — no graph query needed)
    _run_registry[run_id]["scheduled_time"] = req.scheduled_time
    if req.channels:
        _run_registry[run_id]["channels"] = req.channels
 
    return {
        "run_id": run_id,
        "scheduled_time": req.scheduled_time,
        "status": "updated",
    }
 
 
@app.get("/dashboard/{company_id}")
async def get_dashboard(company_id: str, limit: int = 50):
    """
    Return a full dashboard payload for a company.
 
    Aggregates across all runs to produce:
      - runs[]          — every run with its live status + engagement snapshot
      - summary         — counts by status bucket (drafts / scheduled / published / failed)
      - engagement_totals — summed likes / shares / comments / reach across all runs
      - knowledge_sources — ingested doc count from product_knowledge collection
 
    Frontend polls this every 10s to refresh the dashboard.
    Individual run cards call GET /status/{run_id} for deeper detail.
    """
    # ── 1. Collect all runs for this company ────────────────────────────────
    company_runs = [
        (run_id, meta)
        for run_id, meta in _run_registry.items()
        if meta["company_id"] == company_id
    ]
    company_runs.sort(key=lambda x: x[1]["started_at"], reverse=True)
    company_runs = company_runs[:limit]
 
    # ── 2. Enrich each run with live state ──────────────────────────────────
    runs_payload = []
    summary = {
        "total": 0,
        "drafting": 0,       # pipeline running
        "awaiting_approval": 0,
        "scheduled": 0,      # approved + has scheduled_time, not yet published
        "published": 0,
        "failed": 0,
    }
 
    engagement_totals = {"likes": 0, "comments": 0, "shares": 0, "clicks": 0, "reach": 0}
 
    for run_id, meta in company_runs:
        thread_config = meta["thread_config"]
        summary["total"] += 1
 
        # Fast state read
        try:
            snap = _graph.get_state(thread_config)
            values = snap.values if snap else {}
            next_nodes = list(snap.next) if snap and snap.next else []
        except Exception:
            values = {}
            next_nodes = []
 
        # Derive status bucket
        pipeline_complete = values.get("pipeline_complete", False)
        awaiting_human = values.get("awaiting_human", False) or (
            next_nodes and "human_gate" in str(next_nodes)
        )
        receipts = values.get("distribution_receipts", [])
        scheduled_time = values.get("scheduled_time") or meta.get("scheduled_time")
 
        has_published = any(r.get("status") == "published" for r in receipts)
        has_scheduled = any(r.get("status") == "scheduled" for r in receipts)
        has_failed    = any(r.get("status") == "failed"    for r in receipts)
 
        if pipeline_complete and has_published:
            bucket = "published"
            summary["published"] += 1
        elif pipeline_complete and has_scheduled:
            bucket = "scheduled"
            summary["scheduled"] += 1
        elif awaiting_human:
            bucket = "awaiting_approval"
            summary["awaiting_approval"] += 1
        elif has_failed and pipeline_complete:
            bucket = "failed"
            summary["failed"] += 1
        else:
            bucket = "drafting"
            summary["drafting"] += 1
 
        # Engagement snapshot from registry cache (populated by POST /feedback)
        feedback = meta.get("feedback_result", {})
        run_engagement = {"likes": 0, "comments": 0, "shares": 0, "clicks": 0, "reach": 0}
        channel_analytics = []
 
        for detail in feedback.get("details", []):
            a = detail.get("analytics", {})
            for k in run_engagement:
                run_engagement[k] += a.get(k, 0)
                engagement_totals[k] += a.get(k, 0)
            channel_analytics.append({
                "channel": detail["channel"],
                "engagement_rate": detail.get("engagement_rate", "0"),
                "analytics": a,
                "stored_at": detail.get("stored_at"),
            })
 
        runs_payload.append({
            "run_id": run_id,
            "brief": meta.get("brief", "")[:120],
            "started_at": meta["started_at"],
            "status_bucket": bucket,       # drafting | awaiting_approval | scheduled | published | failed
            "scheduled_time": scheduled_time,
            "channel": values.get("channel") or meta.get("channel", ""),
            "content_type": values.get("content_type", ""),
            "brand_score": values.get("brand_score"),
            "pipeline_complete": pipeline_complete,
            "awaiting_human": awaiting_human,
            "receipts": [
                {
                    "channel": r.get("channel"),
                    "status": r.get("status"),
                    "platform_id": r.get("platform_id"),
                    "published_at": r.get("published_at"),
                }
                for r in receipts
            ],
            "engagement": run_engagement,
            "channel_analytics": channel_analytics,
            "feedback_collected": bool(feedback),
            #----new fro neew featires
            "ab_group": meta.get("ab_group"),
            "variant": meta.get("variant"),
            "variant_label": meta.get("variant_label"),
            
        })
 
    # ── 3. Knowledge sources count ──────────────────────────────────────────
    try:
        from content_pipeline.tools.product_knowledge import ProductKnowledgeStore
        store = ProductKnowledgeStore()
        sources = store.list_sources(company_id=company_id)
        knowledge_count = len(sources)
        knowledge_chunks = sum(s["chunks"] for s in sources)
    except Exception:
        knowledge_count = 0
        knowledge_chunks = 0
 
    return {
        "company_id": company_id,
        "summary": summary,
        "engagement_totals": engagement_totals,
        "knowledge_sources": {"files": knowledge_count, "chunks": knowledge_chunks},
        "runs": runs_payload,
    }
 
 
 # ─────────────────────────────────────────────────────────────────────────────
# POST /ingest/{company_id}  — upload internal doc for Knowledge-to-Content
# ─────────────────────────────────────────────────────────────────────────────
 
@app.post("/ingest/{company_id}")
async def ingest_document(
    company_id: str,
    file: UploadFile = File(...),
    source_name: str = Form(default=""),
):
    """
    Upload an internal document (PDF, DOCX, CSV, TXT, MD) for a company.
 
    The file is chunked, embedded, and stored in the product_knowledge
    Qdrant collection. Agent 1 automatically queries this on subsequent
    runs for the same company — enriching drafts with accurate product
    details, feature specs, and internal positioning.
 
    Supported formats: .pdf, .docx, .csv, .txt, .md
 
    Returns:
        chunks_stored: number of text chunks indexed
        source_file:   filename stored
        message:       instructions for use
    """
    from content_pipeline.tools.product_knowledge import ProductKnowledgeStore
 
    filename = file.filename or "uploaded_file"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
 
    raw_bytes = await file.read()
    text = ""
 
    # ── Extract text by file type ──────────────────────────────────────────
    if ext == "pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"PDF parse error: {exc}")
 
    elif ext == "docx":
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(raw_bytes))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"DOCX parse error: {exc}")
 
    elif ext == "csv":
        try:
            text = raw_bytes.decode("utf-8", errors="replace")
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"CSV parse error: {exc}")
 
    elif ext in ("txt", "md"):
        text = raw_bytes.decode("utf-8", errors="replace")
 
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '.{ext}'. Use: pdf, docx, csv, txt, md",
        )
 
    if not text.strip():
        raise HTTPException(status_code=422, detail="Document appears to be empty.")
 
    # ── Ingest into Qdrant ─────────────────────────────────────────────────
    store = ProductKnowledgeStore()
    chunks = store.ingest_text(
        text=text,
        source_file=source_name or filename,
        file_type=ext,
        company_id=company_id,
    )
 
    return {
        "company_id": company_id,
        "source_file": source_name or filename,
        "file_type": ext,
        "chunks_stored": chunks,
        "characters_indexed": len(text),
        "message": (
            f"✓ '{filename}' indexed as {chunks} chunks. "
            "Agent 1 will automatically use this knowledge on the next run."
        ),
    }
 
 
# ─────────────────────────────────────────────────────────────────────────────
# GET /ingest/{company_id}  — list ingested documents
# ─────────────────────────────────────────────────────────────────────────────
 
@app.get("/ingest/{company_id}")
async def list_ingested_documents(company_id: str):
    """
    List all documents ingested for a company.
    """
    from content_pipeline.tools.product_knowledge import ProductKnowledgeStore
    store = ProductKnowledgeStore()
    sources = store.list_sources(company_id=company_id)
    return {
        "company_id": company_id,
        "documents": sources,
        "total_chunks": sum(s["chunks"] for s in sources),
    }
 
 
# ─────────────────────────────────────────────────────────────────────────────
# POST /run/variants  — A/B variant generation
# ─────────────────────────────────────────────────────────────────────────────
 
@app.post("/run/variants")
async def start_ab_run(req: ABRunRequest, background_tasks: BackgroundTasks):
    """
    Generate two content variants (A/B) for the same brief.
 
    Variant A — Data-led angle: leads with metrics and proof points.
    Variant B — Story-led angle: leads with merchant narrative and emotion.
 
    Both variants run through the full pipeline independently:
      profile_loader → drafter → brand_checker → legal_reviewer → human_gate
 
    Returns both run_ids immediately. Poll GET /status/{run_id} for each.
    The dashboard shows both side by side with a "winner" badge based
    on engagement rate after Agent 7 collects analytics.
 
    After approval and distribution, POST /feedback for each run_id
    to collect engagement. The variant with higher engagement_rate
    is stored in content_patterns — Agent 0 uses this on next run.
    """
    base_profile = _company_profiles.get(req.company_id)
 
    # ── Variant A: Data-led ────────────────────────────────────────────────
    brief_a = (
        f"{req.brief}\n\n"
        "[VARIANT A — DATA-LED]\n"
        "Lead with a specific metric or statistic in the first sentence. "
        "Use numbers, percentages, or quantified outcomes. "
        "Structure: Stat hook → Problem → Solution → CTA. "
        "Tone: authoritative, evidence-based."
    )
    state_a = create_initial_state(
        company_id=req.company_id,
        brief=brief_a,
        channel=req.channel,
        content_type=req.content_type,
        target_languages=req.target_languages,
        scheduled_time=req.scheduled_time,
        company_profile=base_profile,
    )
    run_id_a = state_a["run_id"]
    thread_a = {"configurable": {"thread_id": run_id_a}}
    _run_registry[run_id_a] = {
        "thread_config": thread_a,
        "company_id": req.company_id,
        "brief": req.brief[:120],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "variant": "A",
        "variant_label": "Data-led",
        "ab_group": None,   # filled in below
    }
 
    # ── Variant B: Story-led ───────────────────────────────────────────────
    brief_b = (
        f"{req.brief}\n\n"
        "[VARIANT B — STORY-LED]\n"
        "Open with a merchant's real-world scenario or pain point. "
        "Make the reader feel the problem before presenting the solution. "
        "Structure: Scene → Tension → Resolution → CTA. "
        "Tone: empathetic, conversational, first-person friendly."
    )
    state_b = create_initial_state(
        company_id=req.company_id,
        brief=brief_b,
        channel=req.channel,
        content_type=req.content_type,
        target_languages=req.target_languages,
        scheduled_time=req.scheduled_time,
        company_profile=base_profile,
    )
    run_id_b = state_b["run_id"]
    thread_b = {"configurable": {"thread_id": run_id_b}}
    _run_registry[run_id_b] = {
        "thread_config": thread_b,
        "company_id": req.company_id,
        "brief": req.brief[:120],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "variant": "B",
        "variant_label": "Story-led",
        "ab_group": None,
    }
 
    # ── Link variants to each other ────────────────────────────────────────
    ab_group_id = f"ab_{run_id_a[:8]}"
    _run_registry[run_id_a]["ab_group"] = ab_group_id
    _run_registry[run_id_a]["ab_partner"] = run_id_b
    _run_registry[run_id_b]["ab_group"] = ab_group_id
    _run_registry[run_id_b]["ab_partner"] = run_id_a
 
    # ── Start both pipelines ───────────────────────────────────────────────
    background_tasks.add_task(_run_pipeline_background, state_a, thread_a)
    background_tasks.add_task(_run_pipeline_background, state_b, thread_b)
 
    return {
        "ab_group_id": ab_group_id,
        "variant_a": {
            "run_id": run_id_a,
            "label": "Data-led",
            "angle": "Leads with metrics and proof points",
        },
        "variant_b": {
            "run_id": run_id_b,
            "label": "Story-led",
            "angle": "Leads with merchant scenario and emotion",
        },
        "status": "both_running",
        "message": "Poll GET /status/{run_id} for each variant independently.",
    }
 
 
# ─────────────────────────────────────────────────────────────────────────────
# GET /variants/{ab_group_id}  — compare A/B results
# ─────────────────────────────────────────────────────────────────────────────
 
@app.get("/variants/{ab_group_id}")
async def get_ab_results(ab_group_id: str):
    """
    Compare results for an A/B test group.
 
    Returns both variants' status, brand scores, and engagement (if collected).
    Declares a winner based on engagement_rate when both have feedback.
    """
    matching = [
        (rid, meta)
        for rid, meta in _run_registry.items()
        if meta.get("ab_group") == ab_group_id
    ]
 
    if not matching:
        raise HTTPException(status_code=404, detail="AB group not found")
 
    variants = []
    for run_id, meta in matching:
        thread_config = meta["thread_config"]
        try:
            snap = _graph.get_state(thread_config)
            values = snap.values if snap else {}
        except Exception:
            values = {}
 
        feedback = meta.get("feedback_result", {})
        total_engagement = sum(
            d.get("analytics", {}).get("likes", 0)
            + d.get("analytics", {}).get("comments", 0)
            + d.get("analytics", {}).get("shares", 0)
            for d in feedback.get("details", [])
        )
        reach = sum(
            d.get("analytics", {}).get("reach", 0)
            for d in feedback.get("details", [])
        )
        engagement_rate = round(total_engagement / reach, 4) if reach > 0 else 0.0
 
        variants.append({
            "run_id": run_id,
            "variant": meta.get("variant", "?"),
            "label": meta.get("variant_label", ""),
            "brand_score": values.get("brand_score"),
            "pipeline_complete": values.get("pipeline_complete", False),
            "draft_preview": (values.get("current_draft") or "")[:300],
            "engagement_rate": engagement_rate,
            "feedback_collected": bool(feedback),
        })
 
    # Declare winner if both have feedback
    winner = None
    if all(v["feedback_collected"] for v in variants) and len(variants) == 2:
        winner = max(variants, key=lambda v: v["engagement_rate"])["run_id"]
 
    return {
        "ab_group_id": ab_group_id,
        "variants": variants,
        "winner_run_id": winner,
        "winner_label": next(
            (v["label"] for v in variants if v["run_id"] == winner), None
        ) if winner else None,
    }
 
 
# ─────────────────────────────────────────────────────────────────────────────
# GET /roi/{company_id}  — ROI impact metrics
# ─────────────────────────────────────────────────────────────────────────────
 
@app.get("/roi/{company_id}")
async def get_roi_metrics(company_id: str):
    """
    Calculate quantified ROI / business impact for a company.
 
    Aggregates across all completed runs to compute:
      - Hours saved (vs manual 5h/piece benchmark)
      - Brand violations caught and auto-fixed
      - Legal flags prevented from going live
      - Pieces published successfully
      - Estimated cost savings (at ₹800/hr copywriter rate)
      - Average brand compliance score
 
    These numbers are displayed on the ROI Impact Dashboard section.
    """
    company_runs = [
        (rid, meta)
        for rid, meta in _run_registry.items()
        if meta["company_id"] == company_id
    ]
 
    total_runs = len(company_runs)
    completed_runs = 0
    brand_violations_caught = 0
    legal_flags_prevented = 0
    revisions_automated = 0
    brand_scores = []
    pieces_published = 0
 
    for run_id, meta in company_runs:
        thread_config = meta["thread_config"]
        try:
            snap = _graph.get_state(thread_config)
            values = snap.values if snap else {}
        except Exception:
            continue
 
        if values.get("pipeline_complete"):
            completed_runs += 1
 
        brand_violations_caught += len(values.get("brand_violations", []))
        legal_flags_prevented += len(values.get("legal_flags", []))
        revisions_automated += values.get("revision_count", 0)
 
        score = values.get("brand_score")
        if score is not None:
            brand_scores.append(score)
 
        receipts = values.get("distribution_receipts", [])
        if any(r.get("status") == "published" for r in receipts):
            pieces_published += 1
 
    # Impact calculations
    MANUAL_HOURS_PER_PIECE = 5.0    # industry benchmark
    PIPELINE_HOURS_PER_PIECE = 0.75  # ~45 min including human review
    COPYWRITER_RATE_INR = 800        # ₹/hr
 
    hours_saved = completed_runs * (MANUAL_HOURS_PER_PIECE - PIPELINE_HOURS_PER_PIECE)
    cost_saved_inr = hours_saved * COPYWRITER_RATE_INR
    avg_brand_score = round(sum(brand_scores) / len(brand_scores) * 100, 1) if brand_scores else 0
    cycle_time_reduction = round(
        (1 - PIPELINE_HOURS_PER_PIECE / MANUAL_HOURS_PER_PIECE) * 100, 1
    )
 
    return {
        "company_id": company_id,
        "metrics": {
            "total_runs": total_runs,
            "completed_runs": completed_runs,
            "pieces_published": pieces_published,
            "brand_violations_caught": brand_violations_caught,
            "legal_flags_prevented": legal_flags_prevented,
            "revisions_automated": revisions_automated,
            "hours_saved": round(hours_saved, 1),
            "cost_saved_inr": round(cost_saved_inr),
            "avg_brand_score": avg_brand_score,
            "cycle_time_reduction_pct": cycle_time_reduction,
        },
        "benchmarks": {
            "manual_hours_per_piece": MANUAL_HOURS_PER_PIECE,
            "pipeline_hours_per_piece": PIPELINE_HOURS_PER_PIECE,
            "copywriter_rate_inr_per_hour": COPYWRITER_RATE_INR,
        },
    }