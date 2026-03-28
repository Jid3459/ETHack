"""
Agent 0 — Strategy Advisor

Reads engagement history from Qdrant and recommends 2-3 platforms
with reasoning, suggested format, persona, and schedule.
The user confirms or edits before Agent 1 drafts.

Reads from state:  brief, company_id, company_profile
Writes to state:   strategy_card
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState
from content_pipeline.core.utils import clean_llm_response
from content_pipeline.tools.content_patterns import ContentPatternsStore

_patterns_store = ContentPatternsStore()

# ── Prompt templates ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a content strategy advisor for a fintech company.
Your job is to recommend the best publishing strategy for a given content brief.
You have access to the company's historical engagement patterns.
Always respond with valid JSON only. No preamble, no markdown fences.
"""

_USER_PROMPT_TEMPLATE = """\
<company_profile>
{company_profile}
</company_profile>

<engagement_history>
{engagement_history}
</engagement_history>

<brief>
{brief}
</brief>

<task>
Recommend 2-3 publishing platforms for this brief.
For each platform provide:
  - platform: one of "linkedin" | "blog" | "email" | "twitter" | "instagram"
  - fit_score: 1-10
  - reasoning: 1-2 sentences explaining why
  - suggested_format: e.g. "Short post 150-200 words with 3 hashtags"
  - suggested_time: e.g. "Tuesday 9am IST" or "As soon as approved"
  - target_persona: who this content is for

Also provide:
  - content_type: "post" | "article" | "newsletter"
  - primary_platform: the single best pick
  - summary: one sentence strategy summary

Return JSON matching this exact structure:
{{
  "summary": "...",
  "primary_platform": "...",
  "content_type": "...",
  "recommendations": [
    {{
      "platform": "...",
      "fit_score": 8,
      "reasoning": "...",
      "suggested_format": "...",
      "suggested_time": "...",
      "target_persona": "..."
    }}
  ]
}}
</task>
"""


# ── Engagement history loader ─────────────────────────────────────────────────


def _load_engagement_history(company_id: str) -> str:
    """
    Fetch recent content patterns from the Qdrant content_patterns collection.

    On first run (cold start) the collection will be empty for this company —
    ContentPatternsStore.load_engagement_history() returns a generic best-practice
    fallback string so Agent 0 still has reasonable priors to work from.

    After each completed pipeline run, Agent 5 writes a record to the collection,
    so from the second run onwards this reflects the company's actual history.
    """
    return _patterns_store.load_engagement_history(company_id)


# ── Node function ─────────────────────────────────────────────────────────────


def agent0_strategy_advisor(state: ContentState) -> ContentState:
    """
    Agent 0: Strategy Advisor.

    If channel is already specified by the user, skip recommendation
    and build the strategy card directly from stated preferences.
    """
    llm = get_llm()

    # If user already specified a platform, skip LLM recommendation
    if state.get("channel") and state.get("content_type"):
        strategy_card = {
            "summary": f"User-specified: {state['content_type']} on {state['channel']}.",
            "primary_platform": state["channel"],
            "content_type": state["content_type"],
            "recommendations": [
                {
                    "platform": state["channel"],
                    "fit_score": 10,
                    "reasoning": "Specified directly by user.",
                    "suggested_format": f"{state['content_type']} format for {state['channel']}",
                    "suggested_time": state.get("scheduled_time")
                    or "As soon as approved",
                    "target_persona": "As specified in brief",
                }
            ],
        }
        return {
            **state,
            "strategy_card": strategy_card,
            "confirmed_platforms": [state["channel"]],
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent0_strategy_advisor",
                    action="strategy_skipped_user_specified",
                    decision="pass",
                    detail={"channel": state["channel"]},
                ),
            ),
        }

    # Build prompt
    profile_str = json.dumps(state.get("company_profile") or {}, indent=2)
    engagement_history = _load_engagement_history(state["company_id"])

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(
            content=_USER_PROMPT_TEMPLATE.format(
                company_profile=profile_str,
                engagement_history=engagement_history,
                brief=state["brief"],
            )
        ),
        AIMessage(content="<think>\n</think>"),
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()

    # Parse JSON — strip markdown fences if model adds them anyway
    raw = clean_llm_response(raw)

    try:
        strategy_card = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: default to LinkedIn post if parsing fails
        strategy_card = {
            "summary": "Defaulting to LinkedIn post due to parse error.",
            "primary_platform": "linkedin",
            "content_type": "post",
            "recommendations": [
                {
                    "platform": "linkedin",
                    "fit_score": 7,
                    "reasoning": "Safe default for B2B fintech content.",
                    "suggested_format": "Short post 150-200 words",
                    "suggested_time": "As soon as approved",
                    "target_persona": "SMB merchant",
                }
            ],
            "_parse_error": raw[:200],
        }

    return {
        **state,
        "strategy_card": strategy_card,
        # Pre-populate confirmed_platforms from primary recommendation.
        # Frontend will let user edit this before Agent 1 runs.
        "confirmed_platforms": [strategy_card.get("primary_platform", "linkedin")],
        "channel": strategy_card.get("primary_platform", "linkedin"),
        "content_type": strategy_card.get("content_type", "post"),
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="agent0_strategy_advisor",
                action="strategy_recommended",
                decision="pass",
                detail={
                    "primary_platform": strategy_card.get("primary_platform"),
                    "num_recommendations": len(
                        strategy_card.get("recommendations", [])
                    ),
                },
            ),
        ),
    }
