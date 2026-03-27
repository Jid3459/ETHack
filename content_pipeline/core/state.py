"""
ContentState — the single shared state object passed through the entire pipeline.

Design rules:
  - Every field any agent will ever read or write is defined here.
  - Agents read only their relevant fields, write only their output fields.
  - No agent receives a messages history chain — only structured fields.
  - This file is frozen after Day 1. Changes require team sync.
"""

import operator
from typing import Annotated, Optional, TypedDict


class BrandViolation(TypedDict):
    phrase: str  # exact phrase in the draft that violates
    reason: str  # why it violates
    rule: str  # which brand rule it violates
    fix_suggestion: str  # specific suggested replacement


class LegalFlag(TypedDict):
    claim: str  # exact claim in draft
    regulation: str  # human-readable regulation description
    circular_number: str  # e.g. "RBI/2019-20/174"
    section: str  # e.g. "Section 8.4"
    risk_level: str  # "HIGH" | "MEDIUM" | "LOW"
    fix_suggestion: str  # suggested compliant alternative


class DistributionReceipt(TypedDict):
    channel: str  # "linkedin" | "blog" | "email"
    platform_id: str  # post ID or URL returned by platform
    published_at: str  # ISO timestamp
    status: str  # "published" | "scheduled" | "failed"
    error: Optional[str]  # error message if failed


class AuditEntry(TypedDict):
    run_id: str
    agent: str
    timestamp: str
    action: str
    decision: str
    detail: str  # json-serialisable detail string


class ContentState(TypedDict):
    # ── Identity ──────────────────────────────────────────────────────────────
    run_id: str
    company_id: str

    # ── User inputs ───────────────────────────────────────────────────────────
    brief: str  # raw topic + context from user
    channel: str  # "linkedin" | "blog" | "email"
    content_type: str  # "post" | "article" | "newsletter"
    target_languages: list[str]  # ["en", "hi", "ta"]
    scheduled_time: Optional[str]  # ISO string or None

    # ── Strategy (Agent 0) ────────────────────────────────────────────────────
    strategy_card: Optional[dict]  # Agent 0 full recommendation output
    confirmed_platforms: list[str]  # platforms user selected from recs

    # ── Company profile (loaded by profile_loader) ────────────────────────────
    company_profile: Optional[dict]  # full profile dict from Qdrant

    # ── Draft (Agent 1) ───────────────────────────────────────────────────────
    current_draft: Optional[str]  # the live draft being checked
    blog_outline: Optional[dict]  # outline for long-form only
    blog_sections: Optional[dict]  # {heading: drafted_text}
    revision_count: int  # increments each time Agent 1 reruns

    # ── Brand compliance (Agent 2) ────────────────────────────────────────────
    brand_score: Optional[float]  # 0.0 – 1.0
    brand_violations: list[BrandViolation]
    brand_passed: bool

    # ── Legal compliance (Agent 3) ────────────────────────────────────────────
    legal_flags: list[LegalFlag]
    legal_passed: bool  # True only when no HIGH flags remain
    legal_revision_count: int  # separate counter for legal loop

    # ── Human gate ────────────────────────────────────────────────────────────
    awaiting_human: bool
    human_decision: Optional[str]  # "approve" | "reject"
    human_feedback: Optional[str]  # free-text rejection reason
    escalated: bool  # True if max revisions exceeded

    # ── Localization (Agent 4) ────────────────────────────────────────────────
    localized_versions: dict  # {"hi": "...", "ta": "..."}

    # ── Distribution (Agent 5) ────────────────────────────────────────────────
    distribution_receipts: list[DistributionReceipt]

    # ── Analytics (Agent 6 — written async post-publish) ─────────────────────
    engagement_data: Optional[dict]
    patterns_written: bool

    # ── Pipeline meta ─────────────────────────────────────────────────────────
    audit_trail: list[AuditEntry]
    pipeline_complete: bool
    error: Optional[str]
