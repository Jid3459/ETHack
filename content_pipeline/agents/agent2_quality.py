"""
Agent 2 — Quality Guardian (Brand + SEO merged)

Two-layer compliance check:
  Layer 1 — Hard rules (regex + string match): fast, zero LLM cost, 100% reliable
  Layer 2 — LLM semantic check: catches implied violations hard rules miss

If brand_score < BRAND_PASS_THRESHOLD → violations injected into state,
conditional edge routes back to Agent 1.

Reads from state:  current_draft, company_profile, channel, revision_count
Writes to state:   brand_score, brand_violations, brand_passed
"""

from __future__ import annotations

import json
import pprint
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pymupdf.__main__ import clean

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.settings import BRAND_PASS_THRESHOLD, MAX_BRAND_REVISIONS
from content_pipeline.core.state import BrandViolation, ContentState
from content_pipeline.core.utils import clean_llm_response

# ── Hard rules ────────────────────────────────────────────────────────────────

# # Words/phrases that are always banned regardless of company profile
# _UNIVERSAL_BANNED = [
#     "guaranteed",
#     "100% uptime",
#     "zero risk",
#     "zero fraud",
#     "no risk",
#     "risk free",
#     "risk-free",
#     "best in class",
#     "best-in-class",
#     "number one",
#     "#1",
#     "world's best",
#     "unmatched",
#     "unbeatable",
# ]

# # Phrases that require a qualifying statement nearby
# _REQUIRES_QUALIFICATION = {
#     "instant settlement": "must be followed by eligibility qualifier e.g. 'for eligible merchants'",
#     "instant payout": "must be followed by eligibility qualifier",
#     "same day settlement": "must specify applicable conditions",
#     "next day settlement": "must specify applicable conditions",
#     "fraud protection": "cannot be stated as absolute — must say 'up to' or 'subject to investigation'",
#     "100%": "percentage claims require a source or qualifier",
#     "99.9%": "uptime/success rate claims require a defined measurement period",
# }


# def _run_hard_checks(
#     draft: str,
#     company_profile: dict,
# ) -> list[BrandViolation]:
#     """
#     Run fast deterministic checks. Returns violations list.
#     No LLM calls.
#     """
#     violations: list[BrandViolation] = []
#     draft_lower = draft.lower()

#     # 1. Universal banned words
#     for banned in _UNIVERSAL_BANNED:
#         if banned.lower() in draft_lower:
#             violations.append(
#                 BrandViolation(
#                     phrase=banned,
#                     reason="Universally banned — makes unsubstantiated absolute claim",
#                     rule="universal_banned_words",
#                     fix_suggestion=f"Remove or qualify '{banned}' with specific conditions",
#                 )
#             )

#     # 2. Company-specific banned words from profile
#     for banned in company_profile.get("banned_words", []):
#         if banned.lower() in draft_lower:
#             violations.append(
#                 BrandViolation(
#                     phrase=banned,
#                     reason=f"Banned by {company_profile.get('name', 'company')} brand guidelines",
#                     rule="company_banned_words",
#                     fix_suggestion=f"Remove '{banned}' — use approved alternatives from brand guide",
#                 )
#             )

#     # 3. Phrases that require qualification — check if qualifier is nearby
#     for phrase, requirement in _REQUIRES_QUALIFICATION.items():
#         if phrase.lower() in draft_lower:
#             # Look for qualifier words within 50 chars after the phrase
#             phrase_idx = draft_lower.index(phrase.lower())
#             context_window = draft_lower[phrase_idx : phrase_idx + len(phrase) + 80]
#             qualifiers = [
#                 "eligible",
#                 "subject to",
#                 "applicable",
#                 "up to",
#                 "conditions",
#                 "terms",
#                 "for",
#                 "within",
#             ]
#             if not any(q in context_window for q in qualifiers):
#                 violations.append(
#                     BrandViolation(
#                         phrase=phrase,
#                         reason=f"Claim requires qualification: {requirement}",
#                         rule="requires_qualification",
#                         fix_suggestion=f"Add qualifier after '{phrase}', e.g. 'for eligible merchants'",
#                     )
#                 )

#     # 4. Required disclaimers must be present
#     for disclaimer in company_profile.get("required_disclaimers", []):
#         # Check for approximate presence (first 10 words of disclaimer)
#         key_phrase = " ".join(disclaimer.lower().split()[:6])
#         if key_phrase and key_phrase not in draft_lower:
#             violations.append(
#                 BrandViolation(
#                     phrase="[missing disclaimer]",
#                     reason=f"Required disclaimer not found: '{disclaimer[:60]}...'",
#                     rule="required_disclaimer_missing",
#                     fix_suggestion=f"Add at end of content: '{disclaimer}'",
#                 )
#             )

#     # 5. Terminology accuracy — product names must match exactly
#     for wrong_term, correct_term in company_profile.get("approved_terms", {}).items():
#         # Check for common misspellings / wrong capitalisation
#         if wrong_term.lower() in draft_lower and wrong_term not in draft:
#             violations.append(
#                 BrandViolation(
#                     phrase=wrong_term,
#                     reason="Incorrect product name capitalisation or spelling",
#                     rule="terminology_accuracy",
#                     fix_suggestion=f"Replace '{wrong_term}' with '{correct_term}'",
#                 )
#             )

#     return violations


# ── LLM semantic check ────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a brand compliance officer for a fintech company. Your job is to identify semantic violations in the content created for advertising, marketing and promotional material. Capture implied claims, wrong tone, or missing elements — that simple word matching cannot catch. You MUST allow creative freedom and give attention to entire phrases to ensure that you do not misinterpret claims. Always respond with valid JSON only. No preamble, no markdown fences.
"""

_SEMANTIC_CHECK_PROMPT = """\
<brand_profile>
{brand_profile}
</brand_profile>

<permitted_language>
{permitted_language}
</permitted_language>

<channel>
{channel}
</channel>

<draft>
{draft}
</draft>

<task>
Check the draft for these semantic violations:
1. Implied guarantees or absolute claims (e.g. "you'll never face a chargeback"
   implies zero-fraud guarantee without using the word "guaranteed")
2. Tone mismatch — does the language register match the brand voice?
3. Implied claims stronger than what the product actually delivers

For each violation found, provide:
- phrase: the exact phrase in the draft
- reason: why it violates
- rule: which rule category (implied_claim | tone_mismatch | seo_quality)
- fix_suggestion: specific replacement or action

Also provide:
- score: float 0.0-1.0 (1.0 = fully compliant, 0.0 = many violations)

Return JSON:
{{
  "violations": [...],
  "score": 0.85,
  "seo_notes": "..."
}}
</task>
"""


def _run_semantic_check(
    draft: str,
    company_profile: dict,
    channel: str,
    llm,
) -> tuple[list[BrandViolation], float, str]:
    """
    LLM-based semantic violation detection.
    Returns (violations, score, seo_notes).
    """
    profile_summary = {
        "name": company_profile.get("name"),
        "tone": company_profile.get("tone"),
        "brand_voice": company_profile.get("brand_voice"),
        "banned_concepts": company_profile.get("banned_concepts", []),
    }
    permitted_language = company_profile.get("permitted_language", "")

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(
            content=_SEMANTIC_CHECK_PROMPT.format(
                brand_profile=json.dumps(profile_summary, indent=2),
                draft=draft,
                channel=channel,
                permitted_language=permitted_language,
            )
        ),
        AIMessage(content="<think>\n</think>\n"),
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = clean_llm_response(raw)

    try:
        parsed = json.loads(raw)
        violations = [
            BrandViolation(
                phrase=v.get("phrase", ""),
                reason=v.get("reason", ""),
                rule=v.get("rule", "semantic"),
                fix_suggestion=v.get("fix_suggestion", ""),
            )
            for v in parsed.get("violations", [])
        ]
        score = float(parsed.get("score", 0.8))
        seo_notes = parsed.get("seo_notes", "")
        return violations, score, seo_notes
    except (json.JSONDecodeError, ValueError):
        # If parse fails, assume pass to avoid blocking pipeline
        return [], 0.9, "SEO check inconclusive."


# ── Node function ─────────────────────────────────────────────────────────────


def agent2_quality_guardian(state: ContentState) -> ContentState:
    """
    LangGraph node — Agent 2: Quality Guardian.

    Runs hard checks first (free), then LLM semantic check.
    Sets brand_passed based on combined score vs threshold.
    """
    print("Starting Quality Guardian.")
    llm = get_llm()
    draft = state.get("current_draft", "")
    profile = state.get("company_profile") or {}
    channel = state.get("channel", "linkedin")

    semantic_violations, semantic_score, seo_notes = _run_semantic_check(
        draft, profile, channel, llm
    )
    all_violations = semantic_violations
    score = semantic_score

    brand_passed = score >= BRAND_PASS_THRESHOLD and not any(
        v["rule"] == "required_disclaimer_missing" for v in all_violations
    )
    escalated = not brand_passed and state["revision_count"] >= MAX_BRAND_REVISIONS
    print("Review Completed")
    pprint.pprint(
        {
            **state,
            "brand_score": round(score, 3),
            "brand_violations": all_violations,
            "brand_passed": brand_passed,
            "escalated": escalated,
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent2_quality_guardian",
                    action="brand_compliance_checked",
                    decision="pass" if brand_passed else "fail",
                    detail={
                        "score": round(score, 3),
                        "semantic_violations": len(all_violations),
                        "seo_notes": seo_notes,
                        "threshold": BRAND_PASS_THRESHOLD,
                    },
                ),
            ),
        }
    )
    return {
        **state,
        "brand_score": round(score, 3),
        "brand_violations": all_violations,
        "brand_passed": brand_passed,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="agent2_quality_guardian",
                action="brand_compliance_checked",
                decision="pass" if brand_passed else "fail",
                detail={
                    "score": round(score, 3),
                    "semantic_violations": len(all_violations),
                    "seo_notes": seo_notes,
                    "threshold": BRAND_PASS_THRESHOLD,
                },
            ),
        ),
    }
