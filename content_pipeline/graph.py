"""
graph.py — LangGraph pipeline orchestration

Defines the full ContentState graph:
  profile_loader → agent0 → [user confirms] → agent1 → agent2
  → (brand loop) → agent3 → (legal loop) → human_gate
  → agent4 → agent5 → END

Persistence: SQLite checkpointer for INTERRUPT/resume at human_gate.
"""

from __future__ import annotations

import uuid
from typing import Literal

from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from content_pipeline.agents.agent0_strategy import agent0_strategy_advisor
from content_pipeline.agents.agent1_drafter import agent1_drafter
from content_pipeline.agents.agent2_quality import agent2_quality_guardian
from content_pipeline.agents.agent3_legal import agent3_legal_reviewer
from content_pipeline.agents.agent4_localizer import agent4_localizer
from content_pipeline.agents.agent5_distributor import agent5_distributor
from content_pipeline.agents.agent6_image_generator import agent6_image_generator
from content_pipeline.core import audit
from content_pipeline.core.settings import MAX_BRAND_REVISIONS, MAX_LEGAL_REVISIONS
from content_pipeline.core.state import ContentState

# ── Profile loader node ───────────────────────────────────────────────────────


def profile_loader(state: ContentState) -> ContentState:
    """
    Load company profile from Qdrant before any agent runs.
    TODO Replace stub with real Qdrant company_profiles query.
    """
    company_id = state["company_id"]

    # Use profile already in state (from /onboard), else fall back to demo/generic
    if state.get("company_profile"):
        profile = state["company_profile"]
    elif company_id == "razorpay_demo":
        profile = _RAZORPAY_DEMO_PROFILE
    else:
        profile = {
            "name": company_id,
            "industry": "Fintech",
            "tone": "Professional",
            "brand_voice": "Direct and clear",
            "required_disclaimers": ["Terms and conditions apply"],
            "approved_terms": {},
            "default_persona": "Business owner",
            "writing_rules": "Write clearly and concisely.",
            "permitted_language": """The following types of statements are ALWAYS permitted and must NOT be flagged:
- Comparative claims with qualifiers: "faster than traditional methods",
  "more efficient than before"
- Hedged outcome claims: "can help improve", "may receive", "typically within"
- Feature descriptions: stating what a product does is not a guarantee
- Professional aspirational language: "grow your business", "take control"
Standard fintech marketing language is permitted. Only flag genuine
violations of specific brand rules.""",
        }

    return {
        **state,
        "company_profile": profile,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="profile_loader",
                action="profile_loaded",
                decision="pass",
                detail={"company_id": company_id},
            ),
        ),
    }


_RAZORPAY_DEMO_PROFILE = {
    "name": "Razorpay",
    "industry": "Payment Aggregator / Fintech",
    "tone": "Professional but approachable. Direct. No jargon.",
    "brand_voice": (
        "Speak to merchants as a partner, not a vendor. "
        "Lead with business outcomes. Use short sentences."
    ),
    "required_disclaimers": [
        # "Terms and conditions apply",
        # "Subject to eligibility and Razorpay's terms of service",
    ],
    "approved_terms": {
        "magic checkout": "Magic Checkout",
        "razorpayx": "RazorpayX",
        "razor pay": "Razorpay",
    },
    "banned_concepts": [
        "absolute fraud protection",
        "unconditional settlement guarantees",
        "superiority claims without data",
    ],
    "default_persona": "SMB merchant owner, 30-45, running an e-commerce business",
    "writing_rules": (
        "Sentence length: max 20 words. "
        "Paragraphs: max 3 sentences. "
        "Voice: second person — address the merchant directly. "
        "Always lead with business outcome, not the feature name."
    ),
}


# ── Human gate node ───────────────────────────────────────────────────────────


def human_gate(state: ContentState) -> ContentState:
    """
    LangGraph INTERRUPT node.

    Serialises state to SQLite and halts. The pipeline physically cannot
    proceed until POST /approve/{run_id} is called by the FastAPI backend.

    The interrupt() call returns the human's decision dict:
      {"decision": "approve" | "reject", "feedback": "..."}
    """
    # Build the approval payload shown to the human in the UI
    approval_payload = {
        "run_id": state["run_id"],
        "draft": state.get("current_draft", ""),
        "brand_score": state.get("brand_score"),
        "brand_violations": state.get("brand_violations", []),
        "legal_flags": state.get("legal_flags", []),  # MEDIUM/LOW only at this point
        "strategy_card": state.get("strategy_card"),
        "revision_count": state.get("revision_count", 0),
    }

    # interrupt() serialises state and raises an interrupt exception.
    # Execution resumes here when the graph is resumed with a Command.
    human_response = interrupt(approval_payload)

    decision = human_response.get("decision", "reject")
    feedback = human_response.get("feedback", "")

    return {
        **state,
        "awaiting_human": False,
        "human_decision": decision,
        "human_feedback": feedback,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="human_gate",
                action="human_decision_received",
                decision=decision,
                detail={
                    "feedback": feedback,
                    "legal_flags_shown": len(state.get("legal_flags", [])),
                },
            ),
        ),
    }


# ── Conditional edge functions ────────────────────────────────────────────────


def route_after_brand_check(
    state: ContentState,
) -> Literal["agent1_drafter", "agent3_legal_reviewer", "human_gate"]:
    """
    After Agent 2:
    - PASS → forward to Agent 3
    - FAIL + revisions remaining → back to Agent 1
    - FAIL + max revisions hit → escalate to human gate
    """
    if state["brand_passed"] or state.get("escalated"):
        return "agent3_legal_reviewer"  # always go to legal
    return "agent1_drafter"  # still has revisions left


def route_after_legal_review(
    state: ContentState,
) -> Literal["agent1_drafter", "human_gate"]:
    """
    After Agent 3:
    - legal_passed (no HIGH flags) → human gate
    - HIGH flags remain + revisions left → back to Agent 1
    - HIGH flags + max legal revisions → human gate (escalated)
    """
    if state["legal_passed"]:
        return "human_gate"

    if state.get("legal_revision_count", 0) < MAX_LEGAL_REVISIONS:
        return "agent1_drafter"

    # Legal revision limit reached — escalate to human
    return "human_gate"


def route_after_human_gate(
    state: ContentState,
) -> Literal["agent6_image_generator", "agent1_drafter", "__end__"]:
    """
    After human decision:
    - approve → generate images → localise
    - reject with feedback → back to Agent 1 with feedback injected
    - reject without feedback → end pipeline
    """
    decision = state.get("human_decision", "reject")

    if decision == "approve":
        return "agent6_image_generator"

    feedback = state.get("human_feedback", "").strip()
    if feedback:
        return "agent1_drafter"  # Agent 1 will read human_feedback from state

    return "__end__"


# ── Graph builder ─────────────────────────────────────────────────────────────


def build_graph() -> StateGraph:
    """
    Build and compile the content pipeline graph with SQLite persistence.

    Returns a compiled graph ready for invocation.
    """
    graph = StateGraph(ContentState)

    # ── Register nodes ────────────────────────────────────────────────────────
    graph.add_node("profile_loader", profile_loader)
    graph.add_node("agent0_strategy_advisor", agent0_strategy_advisor)
    graph.add_node("agent1_drafter", agent1_drafter)
    graph.add_node("agent2_quality_guardian", agent2_quality_guardian)
    graph.add_node("agent3_legal_reviewer", agent3_legal_reviewer)
    graph.add_node("human_gate", human_gate)
    graph.add_node("agent4_localizer", agent4_localizer)
    graph.add_node("agent5_distributor", agent5_distributor)
    graph.add_node("agent6_image_generator", agent6_image_generator)

    # ── Entry point ───────────────────────────────────────────────────────────
    graph.set_entry_point("profile_loader")

    # ── Unconditional edges ───────────────────────────────────────────────────
    graph.add_edge("profile_loader", "agent0_strategy_advisor")
    graph.add_edge("agent0_strategy_advisor", "agent1_drafter")
    graph.add_edge("agent6_image_generator", "agent4_localizer")
    graph.add_edge("agent4_localizer", "agent5_distributor")
    graph.add_edge("agent5_distributor", END)

    # ── Conditional edges ─────────────────────────────────────────────────────
    graph.add_edge("agent1_drafter", "agent2_quality_guardian")

    graph.add_conditional_edges(
        "agent2_quality_guardian",
        route_after_brand_check,
        {
            "agent1_drafter": "agent1_drafter",
            "agent3_legal_reviewer": "agent3_legal_reviewer",
            "human_gate": "human_gate",
        },
    )

    graph.add_conditional_edges(
        "agent3_legal_reviewer",
        route_after_legal_review,
        {
            "agent1_drafter": "agent1_drafter",
            "human_gate": "human_gate",
        },
    )

    graph.add_conditional_edges(
        "human_gate",
        route_after_human_gate,
        {
            "agent6_image_generator": "agent6_image_generator",
            "agent1_drafter": "agent1_drafter",
            "__end__": END,
        },
    )

    return graph


def get_compiled_graph():
    """
    Returns a compiled graph with an in-memory checkpointer for INTERRUPT/resume.

    MemorySaver holds all state in RAM — zero setup, works immediately.
    Full INTERRUPT/resume works correctly within a single server process.
    State is lost on server restart (fine for dev and demo).

    To upgrade to persistent storage later:
            checkpointer = SqliteSaver.from_conn_string('./checkpoints.db')
    """
    from langgraph.checkpoint.memory import MemorySaver

    checkpointer = MemorySaver()
    graph = build_graph()
    compiled = graph.compile(checkpointer=checkpointer)
    return compiled


# ── Run initialiser ───────────────────────────────────────────────────────────


def create_initial_state(
    company_id: str,
    brief: str,
    channel: str = "",
    content_type: str = "",
    target_audience: str | None = None,
    target_languages: list[str] | None = None,
    scheduled_time: str | None = None,
    company_profile: dict | None = None,
) -> ContentState:
    """
    Build the initial ContentState for a new pipeline run.
    Called by POST /run in the FastAPI backend.
    """
    return ContentState(
        run_id=str(uuid.uuid4()),
        company_id=company_id,
        brief=brief,
        channel=channel.lower().strip(),
        content_type=content_type.lower().strip(),
        target_audience=target_audience,
        target_languages=target_languages or ["en"],
        scheduled_time=scheduled_time,
        strategy_card=None,
        confirmed_platforms=[],
        company_profile=company_profile,
        current_draft=None,
        blog_outline=None,
        blog_sections=None,
        revision_count=0,
        brand_score=None,
        brand_violations=[],
        brand_passed=False,
        legal_flags=[],
        legal_passed=False,
        legal_revision_count=0,
        awaiting_human=False,
        human_decision=None,
        human_feedback=None,
        escalated=False,
        localized_versions={},
        generated_images={},
        distribution_receipts=[],
        engagement_data=None,
        patterns_written=False,
        audit_trail=[],
        pipeline_complete=False,
        error=None,
    )
