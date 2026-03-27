"""
Agent 1 — Content Drafter

Generates channel-native content with full brand + regulatory awareness
loaded into context BEFORE drafting (proactive, not reactive).

For short-form (LinkedIn, email): single generation call.
For long-form (blog): two-pass — outline first, then section-by-section.

In revision mode: surgical fixes only, not full regeneration.

Reads from state:  brief, strategy_card, company_profile,
                   channel, content_type, brand_violations,
                   legal_flags, revision_count, run_id
Writes to state:   current_draft, blog_outline, blog_sections,
                   revision_count
"""

from __future__ import annotations

import json
import pprint
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState
from content_pipeline.core.utils import clean_llm_response
from content_pipeline.tools.retriever import Retriever

# ── Regulatory pre-fetch ──────────────────────────────────────────────────────

_retriever = Retriever()


def _fetch_proactive_constraints(brief: str, content_type: str) -> str:
    """
    Retrieve top regulatory constraints BEFORE drafting so Agent 1
    writes compliant content from the start.
    Queries using topic + content_type as the search signal.
    """
    query = f"{brief} {content_type} marketing claims fintech"
    return _retriever.retrieve(query, limit=5)


# ── Prompt builders ───────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert content writer for a fintech company.
You write compelling, on-brand content that is fully compliant with
Indian financial regulations and advertising standards.
Always respond with valid JSON only. No preamble, no markdown fences.
"""

_DRAFT_PROMPT = """\
<company_identity>
{company_identity}
</company_identity>

<writing_rules>
{writing_rules}
</writing_rules>

<required_elements>
{required_elements}
</required_elements>

<regulatory_constraints>
{regulatory_constraints}
</regulatory_constraints>

<channel_format>
Platform: {channel}
Content type: {content_type}
{channel_instructions}
</channel_format>

<brief>
{brief}
</brief>

<persona>
{persona}
</persona>

<previous_feedback>
{previous_feedback}
</previous_feedback>

<task>
Write the content described in the brief for the specified channel.
Follow ALL writing rules, avoid ALL banned words, include ALL required elements.
Respect ALL regulatory constraints — they are legally binding.

Return JSON:
{{
  "draft": "the full content text",
  "disclaimer_included": true,
  "disclaimer_placement": "end | inline | none",
  "tone_used": "professional | casual | technical",
  "revision_notes": "what changed from previous version, or 'initial draft'"
}}
</task>
"""

_REVISION_PROMPT = """\
<previous_draft>
{previous_draft}
</previous_draft>

<violations_to_fix>
{violations_formatted}
</violations_to_fix>

<writing_rules>
{writing_rules}
</writing_rules>

<legal_flags>
{legal_flags}
</legal_flags>

<task>
You are making SURGICAL fixes to the draft above.

RULES:
1. Fix ONLY the exact phrases listed in violations_to_fix
2. Use the fix_suggestion provided for each violation as your guide
3. Do NOT rewrite sentences that have no violation
4. Do NOT shorten the draft — maintain similar length
5. Do NOT remove content that is not flagged

For each violation, replace only that phrase. Leave everything else identical.

Return JSON:
{{
  "draft": "the revised content",
  "disclaimer_included": true,
  "disclaimer_placement": "end",
  "tone_used": "professional",
  "revision_notes": "list exactly what phrases were changed"
}}
</task>
"""

_OUTLINE_PROMPT = """\
<company_identity>
{company_identity}
</company_identity>

<brief>
{brief}
</brief>

<channel_format>
Platform: blog article
Target length: 800-1000 words across 4-5 sections
</channel_format>

<task>
Create a structured outline for a blog article on this brief.

Return JSON:
{{
  "title": "SEO-optimised article title",
  "meta_description": "150-160 char meta description",
  "sections": [
    {{
      "heading": "H2 heading text",
      "key_point": "one sentence summary of what this section covers",
      "word_target": 180
    }}
  ],
  "disclaimer_placement": "after which section heading the disclaimer appears",
  "cta": "call to action text for the end"
}}
</task>
"""

_SECTION_PROMPT = """\
<company_identity>
{company_identity}
</company_identity>

<writing_rules>
{writing_rules}
</writing_rules>

<regulatory_constraints>
{regulatory_constraints}
</regulatory_constraints>

<section_to_write>
Heading: {section_heading}
Key point: {key_point}
Target word count: {word_target}
</section_to_write>

<task>
Write this single blog section. Be specific, on-brand, and compliant.
Do not include the heading in the text — just the body paragraphs.

Return JSON:
{{
  "text": "the section body text",
  "word_count": 180
}}
</task>
"""


# ── Channel instructions ──────────────────────────────────────────────────────

_CHANNEL_INSTRUCTIONS = {
    "linkedin": (
        "Structure: Hook line (one sentence that opens with a merchant pain point or "
        "business outcome) → 2-3 short paragraphs (max 3 sentences each) → "
        "CTA → 3 relevant hashtags.\n"
        "Length: 150-200 words.\n"
        "Tone: Professional but conversational. No corporate jargon."
    ),
    "email": (
        "Structure: Subject line | Preview text | Personalised greeting | "
        "Body (2-3 paragraphs) | CTA button text.\n"
        "Length: 200-300 words.\n"
        "Format your JSON with separate fields: subject, preview_text, body, cta_text"
    ),
    "blog": (
        "This is a long-form blog article. The outline is already determined. "
        "Write each section as instructed."
    ),
    "twitter": (
        "Length: Under 280 characters.\n"
        "Include 1-2 hashtags.\n"
        "Lead with the most compelling point."
    ),
}

# ── Profile helpers ───────────────────────────────────────────────────────────


def _extract_profile_fields(profile: dict) -> dict:
    """Pull the fields Agent 1 needs from the company profile."""
    return {
        "company_identity": (
            f"Company: {profile.get('name', 'Unknown')}\n"
            f"Industry: {profile.get('industry', '')}\n"
            f"Tone: {profile.get('tone', '')}\n"
            f"Brand voice: {profile.get('brand_voice', '')}"
        ),
        "writing_rules": profile.get("writing_rules", "Write clearly and concisely."),
        "required_elements": "\n".join(profile.get("required_disclaimers", [])),
        "persona": profile.get("default_persona", "SMB merchant owner, 30-45"),
        "approved_terms": profile.get("approved_terms", {}),
    }


def _load_previous_feedback(company_id: str, channel: str, n: int = 3) -> str:
    """
    Load the last n feedback entries for this company+channel from Qdrant.
    TODO (ML engineer): replace stub with real Qdrant feedback_memory query.
    """
    return "No previous feedback available yet."


# ── Formatting violations ─────────────────────────────────────────────────────


def _format_violations_for_revision(violations: list) -> str:
    lines = []
    for i, v in enumerate(violations, 1):
        lines.append(
            f"{i}. PHRASE TO FIX: \"{v['phrase']}\"\n"
            f"   REASON: {v['reason']}\n"
            f"   SUGGESTED FIX: {v['fix_suggestion']}"
        )
    return "\n\n".join(lines)


# ── Short-form generation ─────────────────────────────────────────────────────


def _generate_short_form(
    state: ContentState,
    profile_fields: dict,
    regulatory_context: str,
    llm,
) -> str:
    """Single-call generation for LinkedIn, email, Twitter."""
    if state["revision_count"] > 0:
        # Revision mode — surgical fixes
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=_REVISION_PROMPT.format(
                    previous_draft=state.get("current_draft", ""),
                    violations_formatted=_format_violations_for_revision(
                        state.get("brand_violations", [])
                    ),
                    legal_flags=[
                        f
                        for f in state.get("legal_flags", [])
                        if f.get("risk_level") == "HIGH"
                    ],
                    writing_rules=profile_fields["writing_rules"],
                )
            ),
        ]
    else:
        # Fresh draft
        feedback = _load_previous_feedback(state["company_id"], state["channel"])
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=_DRAFT_PROMPT.format(
                    company_identity=profile_fields["company_identity"],
                    writing_rules=profile_fields["writing_rules"],
                    required_elements=profile_fields["required_elements"],
                    regulatory_constraints=regulatory_context,
                    channel=state["channel"],
                    content_type=state.get("content_type", "post"),
                    channel_instructions=_CHANNEL_INSTRUCTIONS.get(
                        state["channel"], ""
                    ),
                    brief=state["brief"],
                    persona=profile_fields["persona"],
                    previous_feedback=feedback,
                )
            ),
            AIMessage(content="<think>\n</think>\n"),
        ]

    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = clean_llm_response(raw)

    try:
        parsed = json.loads(raw)
        return parsed.get("draft", raw)
    except json.JSONDecodeError:
        return raw  # return raw text if JSON parse fails


# ── Long-form (blog) generation ───────────────────────────────────────────────


def _generate_blog_outline(
    state: ContentState,
    profile_fields: dict,
    llm,
) -> dict:
    """Pass 1: generate blog outline."""
    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(
            content=_OUTLINE_PROMPT.format(
                company_identity=profile_fields["company_identity"],
                brief=state["brief"],
            )
        ),
        AIMessage(content="<think>\n</think>\n"),
    ]
    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = clean_llm_response(raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Minimal fallback outline
        return {
            "title": state["brief"][:80],
            "meta_description": state["brief"][:155],
            "sections": [
                {"heading": "Overview", "key_point": state["brief"], "word_target": 200}
            ],
            "disclaimer_placement": "Overview",
            "cta": "Learn more",
        }


def _generate_blog_sections(
    outline: dict,
    profile_fields: dict,
    llm,
) -> dict[str, str]:
    """Pass 2: draft each section individually with targeted constraints."""
    sections: dict[str, str] = {}
    for section in outline.get("sections", []):
        # Retrieve regulatory constraints specific to this section's topic
        section_constraints = _retriever.retrieve(section["key_point"], limit=3)
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=_SECTION_PROMPT.format(
                    company_identity=profile_fields["company_identity"],
                    writing_rules=profile_fields["writing_rules"],
                    regulatory_constraints=section_constraints,
                    section_heading=section["heading"],
                    key_point=section["key_point"],
                    word_target=section.get("word_target", 180),
                )
            ),
            AIMessage(content="<think>\n</think>\n"),
        ]
        response = llm.invoke(messages)
        raw = response.content.strip()
        raw = clean_llm_response(raw)
        try:
            parsed = json.loads(raw)
            sections[section["heading"]] = parsed.get("text", raw)
        except json.JSONDecodeError:
            sections[section["heading"]] = raw

    return sections


def _assemble_blog(outline: dict, sections: dict[str, str]) -> str:
    """Stitch outline + sections into a single markdown-formatted article."""
    parts = [f"# {outline.get('title', 'Article')}\n"]
    for section in outline.get("sections", []):
        heading = section["heading"]
        parts.append(f"\n## {heading}\n")
        parts.append(sections.get(heading, ""))
    parts.append(f"\n\n---\n{outline.get('cta', '')}")
    return "\n".join(parts)


# ── Node function ─────────────────────────────────────────────────────────────


def agent1_drafter(state: ContentState) -> ContentState:
    """
    LangGraph node — Agent 1: Content Drafter.

    Routes to short-form or long-form generation based on channel.
    In revision mode, makes surgical fixes only.
    """
    print("Starting Draft.")
    llm = get_llm()
    profile = state.get("company_profile") or {}
    profile_fields = _extract_profile_fields(profile)
    channel = state.get("channel", "linkedin")
    new_revision_count = state["revision_count"] + 1

    if channel == "blog":
        # ── Long-form path ────────────────────────────────────────────────────
        if state["revision_count"] == 0:
            # Fetch proactive constraints for the full brief
            regulatory_context = _fetch_proactive_constraints(
                state["brief"], "blog article"
            )
            outline = _generate_blog_outline(state, profile_fields, llm)
            sections = _generate_blog_sections(outline, profile_fields, llm)
            draft = _assemble_blog(outline, sections)
        else:
            # Revision: only regenerate sections that had violations
            # For simplicity, regenerate full draft in revision mode for blogs
            # TODO: implement section-level targeted revision
            outline = state.get("blog_outline") or {}
            sections = dict(state.get("blog_sections") or {})
            # Re-run short-form revision logic on the assembled draft
            state_for_revision = {**state, "channel": "linkedin"}  # use short-form path
            regulatory_context = _fetch_proactive_constraints(
                state["brief"], "blog article"
            )
            draft = _generate_short_form(
                {**state, "channel": "blog"},
                profile_fields,
                regulatory_context,
                llm,
            )
            outline = state.get("blog_outline") or {}
            sections = state.get("blog_sections") or {}
        print("Drafting Completed.")
        pprint.pprint(
            {
                **state,
                "current_draft": draft,
                "blog_outline": outline,
                "blog_sections": sections,
                "revision_count": new_revision_count,
                "brand_passed": False,
                "legal_passed": False,
                "audit_trail": audit.append(
                    state["audit_trail"],
                    audit.make_entry(
                        run_id=state["run_id"],
                        agent="agent1_drafter",
                        action="blog_drafted",
                        decision="pass",
                        detail={
                            "revision_count": new_revision_count,
                            "sections": list(sections.keys()),
                        },
                    ),
                ),
            }
        )
        return {
            **state,
            "current_draft": draft,
            "blog_outline": outline,
            "blog_sections": sections,
            "revision_count": new_revision_count,
            "brand_passed": False,
            "legal_passed": False,
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent1_drafter",
                    action="blog_drafted",
                    decision="pass",
                    detail={
                        "revision_count": new_revision_count,
                        "sections": list(sections.keys()),
                    },
                ),
            ),
        }

    else:
        # ── Short-form path (LinkedIn, email, Twitter) ────────────────────────
        regulatory_context = _fetch_proactive_constraints(state["brief"], channel)
        draft = _generate_short_form(state, profile_fields, regulatory_context, llm)
        print("Drafting Complete.")
        pprint.pprint(
            {
                **state,
                "current_draft": draft,
                "revision_count": new_revision_count,
                "brand_passed": False,
                "legal_passed": False,
                "audit_trail": audit.append(
                    state["audit_trail"],
                    audit.make_entry(
                        run_id=state["run_id"],
                        agent="agent1_drafter",
                        action="short_form_drafted",
                        decision="pass",
                        detail={
                            "channel": channel,
                            "revision_count": new_revision_count,
                            "draft_length": len(draft),
                        },
                    ),
                ),
            }
        )
        return {
            **state,
            "current_draft": draft,
            "revision_count": new_revision_count,
            "brand_passed": False,
            "legal_passed": False,
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent1_drafter",
                    action="short_form_drafted",
                    decision="pass",
                    detail={
                        "channel": channel,
                        "revision_count": new_revision_count,
                        "draft_length": len(draft),
                    },
                ),
            ),
        }
