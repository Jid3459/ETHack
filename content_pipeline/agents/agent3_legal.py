"""
Agent 3 — Legal & Regulatory Reviewer

Per-claim RAG evaluation. Each factual claim in the draft is checked
individually against retrieved regulatory chunks from Qdrant.
Parallel async evaluation for efficiency.

HIGH risk flags route back to Agent 1 for revision.
MEDIUM/LOW flags pass through to the human gate.

Reads from state:  current_draft, run_id, company_id, channel
Writes to state:   legal_flags, legal_passed, legal_revision_count
"""

from __future__ import annotations

import json
import pprint
import re

from langchain_core.messages import HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState, LegalFlag
from content_pipeline.core.utils import clean_llm_response
from content_pipeline.tools.retriever import get_retriever

_retriever = get_retriever()

# ── Claim extraction ──────────────────────────────────────────────────────────

# Rule-based claim extraction — no LLM cost.
# A "claim" is any sentence making a factual assertion about the product.
_CLAIM_SIGNALS = [
    # Numeric/quantitative assertions
    r"\d+\s*%",  # percentages
    r"\d+\s*(hour|day|minute|second)",  # time claims
    r"₹\s*\d+",  # money amounts
    # Superlatives and absolutes
    r"\b(fastest|lowest|highest|best|first|only|always|never|zero|instant)\b",
    # Product capability verbs
    r"\b(settle[sd]?|process(?:ed|es)?|protect[sd]?|secur(?:ed|es)?|"
    r"disburse[sd]?|credit[sd]?|deliver[sd]?|guarantee[sd]?)\b",
    # Compliance/security claims
    r"\b(compliant|certified|secure|safe|encrypted|protected)\b",
]

_CLAIM_SIGNAL_RE = re.compile(
    "|".join(_CLAIM_SIGNALS),
    re.IGNORECASE,
)


def _extract_claims(draft: str) -> list[str]:
    """
    Extract sentences from draft that make factual product claims.
    Returns a deduplicated list of claim sentences.
    """
    # Split into sentences
    sentences = re.split(r"(?<=[.!?])\s+", draft.strip())

    claims: list[str] = []
    seen: set[str] = set()

    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 15:
            continue
        if _CLAIM_SIGNAL_RE.search(sentence):
            normalised = sentence.lower()
            if normalised not in seen:
                seen.add(normalised)
                claims.append(sentence)

    return claims


# ── Per-claim evaluation ──────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a marketing compliance reviewer for an Indian fintech company.

Your ONLY job is to check whether marketing claims are PERMITTED or PROHIBITED
under the retrieved regulatory text.

IMPORTANT CONTEXT:
- You are reviewing MARKETING CONTENT, not operational procedures
- Regulations about escrow accounts, refund routing, KYC, and internal 
  bank operations do NOT apply to marketing claims
- You are looking for: prohibited advertising claims, misleading statements 
  about product capabilities, and required disclosures in advertising

A HIGH risk flag means: this exact claim is explicitly prohibited in 
the retrieved regulation for advertising/marketing purposes.

Do NOT flag:
- General business language ("faster", "efficient", "helps you")  
- Claims that are true but qualified ("typically within hours")
- Standard fintech marketing language that any company uses
- Operational regulations that apply to internal processes, not advertising

If the retrieved regulation does not explicitly restrict this type of 
marketing claim, return risk_level: "NONE".

Always respond with valid JSON only.
"""

_CLAIM_EVAL_PROMPT = """\
<claim>
{claim}
</claim>

<regulatory_context>
{regulatory_context}
</regulatory_context>

<task>
Does the regulatory context EXPLICITLY PROHIBIT or RESTRICT this exact 
type of marketing claim for a payment aggregator's advertising?

Only flag HIGH if the regulation directly addresses this type of 
advertising claim. Operational regulations about fund flow, escrow, 
KYC, or internal processes are NOT relevant to marketing content.

If uncertain, return NONE — it is better to under-flag than to block 
legitimate marketing content.

Return JSON:
{{
  "risk_level": "HIGH | MEDIUM | LOW | NONE",
  "regulation": "exact rule that restricts this claim, or empty if NONE",
  "circular_number": "...",
  "section": "...",
  "fix_suggestion": "..."
}}
</task>
"""


def _evaluate_claims_sequential(
    claims: list[str],
    regulatory_contexts: dict[str, str],
    llm,
) -> list[LegalFlag]:
    """
    Evaluate each claim against its retrieved regulatory chunks.
    """
    flags: list[LegalFlag] = []

    for claim in claims:
        regulatory_context = regulatory_contexts.get(claim, "")
        if not regulatory_context:
            continue

        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=_CLAIM_EVAL_PROMPT.format(
                    claim=claim,
                    regulatory_context=regulatory_context,
                )
            ),
        ]

        response = llm.invoke(messages)
        raw = response.content.strip()
        raw = clean_llm_response(raw)

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue

        risk = parsed.get("risk_level", "NONE")
        if risk == "NONE":
            continue

        flags.append(
            LegalFlag(
                claim=claim,
                regulation=parsed.get("regulation", ""),
                circular_number=parsed.get("circular_number", "N/A"),
                section=parsed.get("section", "N/A"),
                risk_level=risk,
                fix_suggestion=parsed.get("fix_suggestion", ""),
            )
        )
    print("Claims Evaluated")
    pprint.pprint(flags)
    return flags


# ── Node function ─────────────────────────────────────────────────────────────


def agent3_legal_reviewer(state: ContentState) -> ContentState:
    print("Starting Legal Review.")
    llm = get_llm()
    draft = state.get("current_draft", "")

    claims = _extract_claims(draft)

    if not claims:
        return {
            **state,
            "legal_flags": [],
            "legal_passed": True,
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent3_legal_reviewer",
                    action="no_claims_found",
                    decision="pass",
                    detail={"draft_length": len(draft)},
                ),
            ),
        }

    regulatory_contexts = _retriever.retrieve_for_claims(claims, limit_per_claim=3)

    # Sequential — no asyncio, no event loop conflict
    flags = _evaluate_claims_sequential(claims, regulatory_contexts, llm)

    high_flags = [f for f in flags if f["risk_level"] == "HIGH"]
    legal_passed = len(high_flags) == 0
    new_legal_revision_count = state.get("legal_revision_count", 0) + (
        0 if legal_passed else 1
    )
    print("Legal Review Completed.")
    pprint.pprint(
        {
            **state,
            "legal_flags": flags,
            "legal_passed": legal_passed,
            "legal_revision_count": new_legal_revision_count,
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent3_legal_reviewer",
                    action="legal_compliance_checked",
                    decision="pass" if legal_passed else "fail_high_risk",
                    detail={
                        "claims_checked": len(claims),
                        "high_flags": len(high_flags),
                        "medium_flags": len(
                            [f for f in flags if f["risk_level"] == "MEDIUM"]
                        ),
                        "low_flags": len(
                            [f for f in flags if f["risk_level"] == "LOW"]
                        ),
                        "citations": [
                            f"{f['circular_number']} {f['section']}" for f in high_flags
                        ],
                    },
                ),
            ),
        }
    )
    return {
        **state,
        "legal_flags": flags,
        "legal_passed": legal_passed,
        "legal_revision_count": new_legal_revision_count,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="agent3_legal_reviewer",
                action="legal_compliance_checked",
                decision="pass" if legal_passed else "fail_high_risk",
                detail={
                    "claims_checked": len(claims),
                    "high_flags": len(high_flags),
                    "medium_flags": len(
                        [f for f in flags if f["risk_level"] == "MEDIUM"]
                    ),
                    "low_flags": len([f for f in flags if f["risk_level"] == "LOW"]),
                    "citations": [
                        f"{f['circular_number']} {f['section']}" for f in high_flags
                    ],
                },
            ),
        ),
    }
