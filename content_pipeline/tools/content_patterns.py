"""
ContentPatternsStore — reads and writes to the content_patterns Qdrant collection.

Lifecycle:
  Agent 5 (Distributor) calls write_pattern() after each run completes.
  Agent 0 (Strategy Advisor) calls load_engagement_history() at the start of
  the next run for the same company.

Cold-start:
  If the collection does not exist yet, _ensure_collection() creates it
  automatically. If no records exist for a company yet, load_engagement_history()
  returns a generic bootstrap message so Agent 0 still has reasonable priors.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from langchain_huggingface import HuggingFaceEmbeddings
from qdrant_client import QdrantClient, models

from content_pipeline.core.settings import (
    CONTENT_PATTERNS_COLLECTION,
    EMBEDDING_NAME,
    QDRANT_URL,
)

if TYPE_CHECKING:
    from content_pipeline.core.state import ContentState

# Reuse the singleton embedding model (loaded once at import time)
_embedding = HuggingFaceEmbeddings(model_name=EMBEDDING_NAME)

# ── Cold-start fallback ───────────────────────────────────────────────────────

_COLD_START_MESSAGE = (
    "No engagement history available yet for this company — this is the first run. "
    "Use general fintech B2B content best practices: "
    "LinkedIn is the strongest B2B channel, best posted Tuesday-Thursday mornings. "
    "Blog articles build long-term SEO traction. "
    "Email newsletters perform well for warm audiences with personalised subject lines. "
    "Twitter/X is effective for short product announcements and trend-jacking only."
)


# ── Store ─────────────────────────────────────────────────────────────────────

class ContentPatternsStore:
    """
    Manages the content_patterns Qdrant collection.

    Each point represents one completed pipeline run and stores:
      - channel, content_type, target_audience
      - brand_score, revision_count, legal flag counts
      - distribution outcome (published / partial / failed)
      - published_at timestamp

    The vector is a semantic embedding of a summary sentence, allowing
    future semantic search (e.g. "what worked for SMB merchant audience on LinkedIn").
    Current reads use scroll+filter for aggregation; vector search is ready for later.
    """

    def __init__(self) -> None:
        self.client = QdrantClient(url=QDRANT_URL)

    # ── Collection bootstrap ──────────────────────────────────────────────────

    def _ensure_collection(self) -> None:
        """
        Create the content_patterns collection if it doesn't exist.
        Safe to call on every read/write — checks before creating.
        """
        if self.client.collection_exists(CONTENT_PATTERNS_COLLECTION):
            return

        sample_vector = _embedding.embed_query("dimension probe")
        self.client.create_collection(
            CONTENT_PATTERNS_COLLECTION,
            vectors_config=models.VectorParams(
                size=len(sample_vector),
                distance=models.Distance.COSINE,
            ),
        )
        print(
            f"[ContentPatternsStore] Created collection "
            f"'{CONTENT_PATTERNS_COLLECTION}' (dim={len(sample_vector)})"
        )

    # ── Write ─────────────────────────────────────────────────────────────────

    def write_pattern(self, state: "ContentState") -> None:
        """
        Persist a content pattern record for a completed pipeline run.

        Called by Agent 5 after distribution so the data is available
        for Agent 0 on the company's next run.

        Uses run_id as the Qdrant point ID so re-writing the same run
        is idempotent (upsert semantics).
        """
        self._ensure_collection()

        receipts = state.get("distribution_receipts", [])
        channels_published = [
            r["channel"] for r in receipts
            if r.get("status") in ("published", "scheduled")
        ]
        channels_failed = [
            r["channel"] for r in receipts
            if r.get("status") == "failed"
        ]

        if channels_failed and channels_published:
            distribution_status = "partial"
        elif channels_failed:
            distribution_status = "failed"
        else:
            distribution_status = "published"

        brand_score = state.get("brand_score")
        legal_flags = state.get("legal_flags", [])
        high_legal_count = sum(
            1 for f in legal_flags if f.get("risk_level") == "HIGH"
        )

        # Text embedded for semantic search — describes what this run was
        summary_text = (
            f"company:{state['company_id']} "
            f"channel:{state.get('channel', '')} "
            f"content_type:{state.get('content_type', '')} "
            f"audience:{state.get('target_audience') or 'default'} "
            f"brand_score:{f'{brand_score:.2f}' if brand_score is not None else 'N/A'} "
            f"revisions:{state.get('revision_count', 0)} "
            f"legal_flags:{len(legal_flags)} "
            f"high_legal:{high_legal_count} "
            f"status:{distribution_status}"
        )
        vector = _embedding.embed_query(summary_text)

        payload = {
            "company_id": state["company_id"],
            "run_id": state["run_id"],
            "channel": state.get("channel", ""),
            "content_type": state.get("content_type", ""),
            "target_audience": state.get("target_audience") or "default",
            "brand_score": brand_score,
            "brand_violations_count": len(state.get("brand_violations", [])),
            "legal_flags_count": len(legal_flags),
            "high_legal_flags_count": high_legal_count,
            "revision_count": state.get("revision_count", 0),
            "distribution_status": distribution_status,
            "channels_published": channels_published,
            "channels_failed": channels_failed,
            "published_at": datetime.now(timezone.utc).isoformat(),
        }

        self.client.upsert(
            collection_name=CONTENT_PATTERNS_COLLECTION,
            points=[
                models.PointStruct(
                    id=state["run_id"],  # UUID string — idempotent upsert
                    vector=vector,
                    payload=payload,
                )
            ],
        )
        print(
            f"[ContentPatternsStore] Wrote pattern for run {state['run_id']} "
            f"(company={state['company_id']}, channel={state.get('channel')}, "
            f"status={distribution_status})"
        )

    # ── Read ──────────────────────────────────────────────────────────────────

    def load_engagement_history(
        self,
        company_id: str,
        limit: int = 50,
    ) -> str:
        """
        Return a formatted engagement history string for Agent 0's prompt.

        Scrolls all records for the company (no semantic search needed —
        we want the full history, not a topic-filtered subset), computes
        per-channel aggregates, and formats them into a human-readable
        summary that Agent 0 can reason over.

        Returns the cold-start fallback string if the collection is empty
        or has no records for this company yet.
        """
        self._ensure_collection()

        try:
            results, _ = self.client.scroll(
                collection_name=CONTENT_PATTERNS_COLLECTION,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="company_id",
                            match=models.MatchValue(value=company_id),
                        )
                    ]
                ),
                limit=limit,
                with_payload=True,
                with_vectors=False,
            )
        except Exception as exc:
            print(f"[ContentPatternsStore] Scroll failed: {exc} — using cold-start fallback")
            return _COLD_START_MESSAGE

        if not results:
            return _COLD_START_MESSAGE

        # ── Aggregate per channel ─────────────────────────────────────────────
        by_channel: dict[str, dict] = {}
        for point in results:
            p = point.payload or {}
            ch = p.get("channel", "unknown")
            if ch not in by_channel:
                by_channel[ch] = {
                    "count": 0,
                    "brand_scores": [],
                    "revision_counts": [],
                    "success_count": 0,
                    "audiences": [],
                }
            by_channel[ch]["count"] += 1
            if p.get("brand_score") is not None:
                by_channel[ch]["brand_scores"].append(p["brand_score"])
            by_channel[ch]["revision_counts"].append(p.get("revision_count", 0))
            if p.get("distribution_status") in ("published", "partial"):
                by_channel[ch]["success_count"] += 1
            audience = p.get("target_audience", "default")
            if audience and audience != "default":
                by_channel[ch]["audiences"].append(audience)

        lines: list[str] = [
            f"Engagement history — {len(results)} completed run(s) for this company:"
        ]

        # Sort channels by number of runs descending
        for ch, stats in sorted(
            by_channel.items(), key=lambda x: x[1]["count"], reverse=True
        ):
            scores = stats["brand_scores"]
            revisions = stats["revision_counts"]
            avg_score = sum(scores) / len(scores) if scores else None
            avg_revisions = sum(revisions) / len(revisions) if revisions else 0
            success_rate = (
                f"{stats['success_count']}/{stats['count']} published"
            )
            score_str = (
                f"avg brand score {avg_score:.0%}" if avg_score is not None else ""
            )
            top_audiences = list(dict.fromkeys(stats["audiences"]))[:3]  # deduplicated
            audience_str = (
                f"audiences: {', '.join(top_audiences)}" if top_audiences else ""
            )
            parts = [
                f"- {ch}: {stats['count']} run(s)",
                score_str,
                f"avg {avg_revisions:.1f} revision(s)",
                success_rate,
            ]
            if audience_str:
                parts.append(audience_str)
            lines.append(", ".join(p for p in parts if p))

        # ── Most recent 3 runs ────────────────────────────────────────────────
        recent = sorted(
            results,
            key=lambda pt: (pt.payload or {}).get("published_at", ""),
            reverse=True,
        )[:3]

        lines.append("Most recent runs:")
        for pt in recent:
            p = pt.payload or {}
            score = p.get("brand_score")
            score_str = f"{score:.0%}" if score is not None else "N/A"
            lines.append(
                f"  • {p.get('channel', '?')} {p.get('content_type', '')} — "
                f"brand score {score_str}, "
                f"{p.get('revision_count', 0)} revision(s), "
                f"audience: {p.get('target_audience', 'default')}, "
                f"status: {p.get('distribution_status', 'unknown')}"
            )

        # ── Smarter scheduling: per-platform optimal time ─────────────────────
        lines.append("\nRecommended publish times based on this company's history:")
        for platform in by_channel:
            optimal = self.get_optimal_schedule(company_id, platform)
            lines.append(f"  {platform}: {optimal}")

        return "\n".join(lines)

    def get_optimal_schedule(self, company_id: str, platform: str) -> str:
        """
        Analyze historical successful runs to recommend optimal publish time.

        Looks at published_at timestamps of successful runs (published/partial)
        converted to IST, finds the most common hour and day of week.

        Returns a human-readable string like:
          "Tuesday 9am IST (based on 3 successful run(s))"
        Falls back to platform best-practice defaults when no history exists.

        Output visible in:  strategy_card.recommendations[].suggested_time
                            via GET /status/{run_id}
        """
        _PLATFORM_DEFAULTS = {
            "linkedin": "Tuesday or Wednesday 9am IST (LinkedIn B2B best practice)",
            "twitter": "Weekday 12pm or 5pm IST (Twitter peak engagement)",
            "instagram": "Wednesday or Friday 11am IST (Instagram fintech best practice)",
            "blog": "Tuesday morning IST — SEO crawlers index new content early week",
            "email": "Tuesday or Thursday 9am IST (email open rate best practice)",
        }

        self._ensure_collection()

        try:
            results, _ = self.client.scroll(
                collection_name=CONTENT_PATTERNS_COLLECTION,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="company_id",
                            match=models.MatchValue(value=company_id),
                        ),
                        models.FieldCondition(
                            key="channel",
                            match=models.MatchValue(value=platform),
                        ),
                    ]
                ),
                limit=20,
                with_payload=True,
                with_vectors=False,
            )
        except Exception:
            return _PLATFORM_DEFAULTS.get(platform, "As soon as approved")

        if not results:
            return _PLATFORM_DEFAULTS.get(platform, "As soon as approved")

        # Keep only successful runs
        successful = [
            pt for pt in results
            if (pt.payload or {}).get("distribution_status") in ("published", "partial")
        ]

        if not successful:
            return _PLATFORM_DEFAULTS.get(platform, "As soon as approved")

        # Analyze IST hour-of-day and day-of-week from published_at
        from collections import Counter
        from datetime import timedelta

        hour_counts: Counter = Counter()
        day_counts: Counter = Counter()

        for pt in successful:
            ts = (pt.payload or {}).get("published_at", "")
            if not ts:
                continue
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                ist = dt + timedelta(hours=5, minutes=30)
                hour_counts[ist.hour] += 1
                day_counts[ist.strftime("%A")] += 1
            except Exception:
                pass

        if not hour_counts:
            return _PLATFORM_DEFAULTS.get(platform, "As soon as approved")

        best_hour = hour_counts.most_common(1)[0][0]
        best_day = day_counts.most_common(1)[0][0] if day_counts else "Weekday"
        am_pm = "am" if best_hour < 12 else "pm"
        hour_12 = best_hour % 12 or 12

        return (
            f"{best_day} {hour_12}{am_pm} IST "
            f"(based on {len(successful)} successful run(s) for this company)"
        )
