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
from logging import exception
import re
import traceback

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState
from content_pipeline.core.utils import clean_llm_response
from content_pipeline.tools.feedback_memory import FeedbackMemoryStore
from content_pipeline.tools.product_knowledge import ProductKnowledgeStore
from content_pipeline.tools.retriever import Retriever, get_retriever

# ── Module-level singletons ───────────────────────────────────────────────────

_retriever = get_retriever()
_feedback_store = FeedbackMemoryStore()
_product_store = ProductKnowledgeStore()


def _fetch_proactive_constraints(
    brief: str, content_type: str, industry: str = ""
) -> str:
    """
    Retrieve top regulatory constraints BEFORE drafting so Agent 1
    writes compliant content from the start.
    Queries using topic + content_type + industry as the search signal.
    """
    query = f"{brief} {content_type} marketing claims {industry}".strip()
    return _retriever.retrieve(query, limit=5)


# ── Prompt builders ───────────────────────────────────────────────────────────

_SYSTEM_PROMPT_TEMPLATE = """\
You are an expert content writer for a {industry} company.
You write compelling, on-brand content that is fully compliant with
applicable regulations and advertising standards for the {industry} industry.
Always respond with valid JSON only. No preamble, no markdown fences.
"""


def _build_system_prompt(profile_fields: dict) -> str:
    industry = profile_fields.get("industry", "enterprise")
    return _SYSTEM_PROMPT_TEMPLATE.format(industry=industry)


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

<target_audience>
{target_audience}
Tailor vocabulary, examples, and pain points specifically for this audience.
Use terminology they recognise. Address their specific concerns and goals.
</target_audience>

<previous_feedback>
{previous_feedback}
Use this feedback to improve tone, structure, and format compared to past posts.
</previous_feedback>

<trending_context>
{trending_context}
Where natural, reference relevant current events to make the content timely.
</trending_context>

<product_knowledge>
{product_knowledge}
Use these internal product facts accurately — they override generic knowledge.
</product_knowledge>

<task>
Write the content described in the brief for the specified channel.
Follow ALL writing rules, avoid ALL banned words, include ALL required elements.
Respect ALL regulatory constraints — they are legally binding.
Pitch language, complexity, and examples squarely at the target_audience above.
Reference trending_context where relevant to make content timely.
Use product_knowledge for accurate product-specific claims and details.

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
<brief>
{brief}
</brief>

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

<human_feedback>
{human_feedback}
</human_feedback>

<task>
You are making SURGICAL fixes to the draft above.

RULES:
1. Fix ONLY the exact phrases listed in violations_to_fix
2. Use the fix_suggestion provided for each violation as your guide
3. Do NOT rewrite sentences that have no violation
4. Do NOT shorten the draft — maintain similar length
5. Do NOT remove content that is not flagged
6. Use the human feedback to improve upon the draft

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

_SECTION_REVISION_PROMPT = """\
<section_heading>
{section_heading}
</section_heading>

<current_section_text>
{current_section_text}
</current_section_text>

<violations_to_fix>
{violations_formatted}
</violations_to_fix>

<writing_rules>
{writing_rules}
</writing_rules>

<regulatory_constraints>
{regulatory_constraints}
</regulatory_constraints>

<task>
Make SURGICAL fixes to this blog section only.

RULES:
1. Fix ONLY the exact phrases listed in violations_to_fix
2. Use the fix_suggestion provided for each violation as your guide
3. Do NOT rewrite sentences that have no violation
4. Maintain the same length and paragraph structure

Return JSON:
{{
  "text": "the revised section body text",
  "revision_notes": "list exactly what phrases were changed"
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
        "Length: Under 200 words.\n"
        "Include 2-3 hashtags.\n"
        "Lead with the most compelling point."
    ),
    "instagram": (
        "Structure: Hook line (one sentence that grabs attention) → 1-2 short paragraphs (max 2 sentences each) → "
        "CTA in caption (e.g., 'Tap the link in bio', 'Learn more' or 'Comment below') → Optional: emojis for emphasis.\n"
        "Length: 100-150 words.\n"
        "Tone: Friendly, visually engaging, and conversational. Avoid long blocks of text.\n"
        "Include 3-5 relevant hashtags at the end."
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
        "industry": profile.get("industry", "enterprise"),
        "writing_rules": profile.get("writing_rules", "Write clearly and concisely."),
        "required_elements": "\n".join(profile.get("required_disclaimers", [])),
        "default_persona": profile.get("default_persona", "target customer"),
        "approved_terms": profile.get("approved_terms", {}),
    }


def _resolve_persona(profile_fields: dict, state: ContentState) -> str:
    """
    Return the most specific audience description available.
    target_audience from the run request takes precedence over the
    company profile's generic default_persona.
    """
    return state.get("target_audience") or profile_fields["default_persona"]


def _load_previous_feedback(company_id: str, channel: str, n: int = 3) -> str:
    """
    Load the last n engagement feedback entries for this company+channel from Qdrant.
    Populated by Agent 7 (Feedback Collector) 24-48h after each distribution.
    """
    return _feedback_store.load_feedback(company_id=company_id, channel=channel, n=n)


def _fetch_trending_context(brief: str, channel: str) -> str:
    """
    Fetch 3 recent headlines related to the brief using DuckDuckGo (free, no API key).
    Injects current events into the draft to make content timely and resonant.

    Output: visible in generated draft — content references current trends/news.
    Falls back gracefully if duckduckgo-search is not installed or search fails.
    """
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS  # older package name

        # Add "india fintech" to keep results relevant to the domain
        query = f"{brief[:80]} india fintech news"
        with DDGS() as ddgs:
            results = list(ddgs.news(query, max_results=3))

        if not results:
            return "No trending context found for this topic."

        lines = ["Recent news and trends relevant to this topic:"]
        for r in results:
            title = r.get("title", "")
            source = r.get("source", "")
            date = r.get("date", "")
            lines.append(f"  • {title} ({source}, {date})")

        print(f"[agent1_drafter] Fetched {len(results)} trending context results")
        return "\n".join(lines)

    except ImportError:
        print("[agent1_drafter] duckduckgo-search not installed — skipping trends")
        return "Trending context unavailable (install duckduckgo-search)."
    except Exception as exc:
        print(f"[agent1_drafter] Trend fetch failed (non-fatal): {exc}")
        return "No trending context available."


def _fetch_product_knowledge(brief: str, company_id: str) -> str:
    """
    Retrieve relevant product knowledge chunks from Qdrant for the brief topic.
    Populated via ingest_docs.py — supports PDF, DOCX, CSV, TXT, MD.

    Output: visible in generated draft — accurate product details replace generic LLM knowledge.
    Returns empty string if no product docs have been ingested yet.
    """
    result = _product_store.retrieve(query=brief, company_id=company_id, limit=3)
    if result:
        print(f"[agent1_drafter] Retrieved product knowledge ({len(result)} chars)")
    return result or "No internal product knowledge ingested yet for this company."


# ── Section-level violation mapping ──────────────────────────────────────────


def _find_sections_with_violations(
    sections: dict[str, str],
    violations: list,
    legal_flags: list,
) -> set[str]:
    """
    Return the set of section headings that contain at least one flagged phrase.
    Matches brand violation phrases and HIGH-risk legal flag claims against
    each section's text (case-insensitive substring match).
    """
    flagged: set[str] = set()
    phrases_to_find: list[str] = []

    for v in violations:
        phrase = v.get("phrase", "")
        if phrase:
            phrases_to_find.append(phrase.lower())

    for f in legal_flags:
        if f.get("risk_level") == "HIGH":
            claim = f.get("claim", "")
            if claim:
                phrases_to_find.append(claim.lower())

    for heading, text in sections.items():
        text_lower = text.lower()
        if any(phrase in text_lower for phrase in phrases_to_find):
            flagged.add(heading)

    return flagged


def _revise_blog_sections(
    outline: dict,
    sections: dict[str, str],
    flagged_headings: set[str],
    violations: list,
    legal_flags: list,
    profile_fields: dict,
    llm,
) -> dict[str, str]:
    """
    Regenerate only the flagged blog sections with surgical fixes.
    Sections that have no violations are preserved unchanged.
    """
    revised = dict(sections)  # start with all existing sections

    high_legal = [f for f in legal_flags if f.get("risk_level") == "HIGH"]

    for section in outline.get("sections", []):
        heading = section["heading"]
        if heading not in flagged_headings:
            continue  # preserve this section as-is

        # Build violation list relevant to this specific section
        section_text_lower = sections.get(heading, "").lower()
        section_violations = [
            v for v in violations if v.get("phrase", "").lower() in section_text_lower
        ]
        section_legal = [
            f for f in high_legal if f.get("claim", "").lower() in section_text_lower
        ]

        # Retrieve regulatory constraints fresh for this section
        section_constraints = _retriever.retrieve(
            section.get("key_point", heading), limit=3
        )

        # Combine brand violations and legal flags into one violation list for prompt
        combined_violations = list(section_violations) + [
            {
                "phrase": f["claim"],
                "reason": f"Legal flag ({f['risk_level']}): {f['regulation']}",
                "rule": f.get("circular_number", ""),
                "fix_suggestion": f.get(
                    "fix_suggestion", "Rephrase to remove unsubstantiated claim"
                ),
            }
            for f in section_legal
        ]

        messages = [
            SystemMessage(content=_build_system_prompt(profile_fields)),
            HumanMessage(
                content=_SECTION_REVISION_PROMPT.format(
                    section_heading=heading,
                    current_section_text=sections.get(heading, ""),
                    violations_formatted=_format_violations_for_revision(
                        combined_violations
                    ),
                    writing_rules=profile_fields["writing_rules"],
                    regulatory_constraints=section_constraints,
                )
            ),
            AIMessage(content="<think>\n</think>\n"),
        ]
        response = llm.invoke(messages)
        raw = response.content.strip()
        raw = clean_llm_response(raw)
        try:
            parsed = json.loads(raw)
            revised[heading] = parsed.get("text", raw)
        except json.JSONDecodeError:
            revised[heading] = raw

    return revised


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
            SystemMessage(content=_build_system_prompt(profile_fields)),
            HumanMessage(
                content=_REVISION_PROMPT.format(
                    brief=state.get("brief"),
                    previous_draft=state.get("current_draft", ""),
                    human_feedback=state.get("human_feedback", ""),
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
        # Fresh draft — enrich with feedback, trends, and product knowledge
        feedback = _load_previous_feedback(state["company_id"], state["channel"])
        persona = _resolve_persona(profile_fields, state)
        trending = _fetch_trending_context(state["brief"], state["channel"])
        product_knowledge = _fetch_product_knowledge(
            state["brief"], state["company_id"]
        )
        messages = [
            SystemMessage(content=_build_system_prompt(profile_fields)),
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
                    target_audience=persona,
                    previous_feedback=feedback,
                    trending_context=trending,
                    product_knowledge=product_knowledge,
                )
            ),
        ]

    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = clean_llm_response(raw)
    print("RAW_TEXT:", raw)
    try:
        parsed = json.loads(raw)
        return parsed.get("draft", raw)
    except json.JSONDecodeError as exc:
        traceback.print_exc()
        return raw  # return raw text if JSON parse fails


# ── Long-form (blog) generation ───────────────────────────────────────────────


def _generate_blog_outline(
    state: ContentState,
    profile_fields: dict,
    llm,
) -> dict:
    """Pass 1: generate blog outline."""
    messages = [
        SystemMessage(content=_build_system_prompt(profile_fields)),
        HumanMessage(
            content=_OUTLINE_PROMPT.format(
                company_identity=profile_fields["company_identity"],
                brief=state["brief"],
            )
        ),
    ]
    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = clean_llm_response(raw)
    print("RAW_TEXT", raw)
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
            SystemMessage(content=_build_system_prompt(profile_fields)),
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
        flagged_headings: set[str] = set()
        if state["revision_count"] == 0:
            # Fetch proactive constraints for the full brief
            regulatory_context = _fetch_proactive_constraints(
                state["brief"], "blog article", profile_fields["industry"]
            )
            outline = _generate_blog_outline(state, profile_fields, llm)
            sections = _generate_blog_sections(outline, profile_fields, llm)
            draft = _assemble_blog(outline, sections)
        else:
            # Revision: surgical fixes only on sections that contain violations
            outline = state.get("blog_outline") or {}
            sections = dict(state.get("blog_sections") or {})

            flagged_headings = _find_sections_with_violations(
                sections,
                state.get("brand_violations", []),
                state.get("legal_flags", []),
            )
            # used in audit below

            if flagged_headings:
                sections = _revise_blog_sections(
                    outline,
                    sections,
                    flagged_headings,
                    state.get("brand_violations", []),
                    state.get("legal_flags", []),
                    profile_fields,
                    llm,
                )
            # else: no violations mapped to sections — keep all sections as-is

            draft = _assemble_blog(outline, sections)
        action = "blog_revised_targeted" if new_revision_count > 1 else "blog_drafted"
        audit_detail = {
            "revision_count": new_revision_count,
            "sections": list(sections.keys()),
            "flagged_sections": list(flagged_headings),
            "target_audience": state.get("target_audience") or "default",
        }
        print("Drafting Completed.")
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
                    action=action,
                    decision="pass",
                    detail=audit_detail,
                ),
            ),
        }

    else:
        # ── Short-form path (LinkedIn, email, Twitter) ────────────────────────
        regulatory_context = _fetch_proactive_constraints(
            state["brief"], channel, profile_fields["industry"]
        )
        draft = _generate_short_form(state, profile_fields, regulatory_context, llm)
        print("Drafting Complete.")
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
                        "target_audience": state.get("target_audience") or "default",
                    },
                ),
            ),
        }
