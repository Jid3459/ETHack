"""
FeedbackMemoryStore — stores and retrieves post-distribution engagement feedback.

Lifecycle:
  Agent 7 (Feedback Collector) calls write_feedback() 24-48h after distribution.
  Agent 1 (Drafter) calls load_feedback() before each fresh draft to tailor
  vocabulary and format based on what resonated in past posts.

Cold-start:
  Returns generic best-practice fallback when no feedback exists yet.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone

from langchain_huggingface import HuggingFaceEmbeddings
from qdrant_client import QdrantClient, models

from content_pipeline.core.settings import (
    EMBEDDING_NAME,
    FEEDBACK_MEMORY_COLLECTION,
    QDRANT_URL,
)

_embedding = HuggingFaceEmbeddings(model_name=EMBEDDING_NAME)

_COLD_START_MESSAGE = (
    "No engagement feedback available yet for this company. "
    "Use content best practices: action-oriented CTAs improve clicks 2-3x, "
    "posts with data/statistics earn 40% more shares on LinkedIn, "
    "first-person merchant stories outperform corporate tone on social. "
    "Keep LinkedIn posts under 200 words with a clear hook in line 1."
)


class FeedbackMemoryStore:
    """
    Manages the feedback_memory Qdrant collection.

    Each point represents analytics collected from one published post:
      - channel, content_type, platform_post_id
      - likes, comments, shares, clicks, reach, engagement_rate
      - content_snippet (first 200 chars for semantic search)
      - audience_tag, polled_at timestamp
    """

    def __init__(self) -> None:
        self.client = QdrantClient(url=QDRANT_URL)

    def _ensure_collection(self) -> None:
        """Create feedback_memory collection if it doesn't exist."""
        if self.client.collection_exists(FEEDBACK_MEMORY_COLLECTION):
            return
        sample = _embedding.embed_query("dimension probe")
        self.client.create_collection(
            FEEDBACK_MEMORY_COLLECTION,
            vectors_config=models.VectorParams(
                size=len(sample),
                distance=models.Distance.COSINE,
            ),
        )
        print(f"[FeedbackMemoryStore] Created collection '{FEEDBACK_MEMORY_COLLECTION}'")

    def write_feedback(
        self,
        company_id: str,
        run_id: str,
        channel: str,
        content_type: str,
        platform_post_id: str,
        content_snippet: str,
        likes: int = 0,
        comments: int = 0,
        shares: int = 0,
        clicks: int = 0,
        reach: int = 0,
        audience_tag: str = "default",
    ) -> None:
        """
        Persist engagement analytics for a post.
        Called by Agent 7 after polling distribution APIs.
        Idempotent per run_id+channel combination.
        """
        self._ensure_collection()

        engagement_rate = (
            round((likes + comments + shares) / reach, 4) if reach > 0 else 0.0
        )

        text_for_embedding = (
            f"company:{company_id} channel:{channel} content_type:{content_type} "
            f"snippet:{content_snippet[:150]} "
            f"engagement_rate:{engagement_rate:.2%}"
        )
        vector = _embedding.embed_query(text_for_embedding)

        payload = {
            "company_id": company_id,
            "run_id": run_id,
            "channel": channel,
            "content_type": content_type,
            "platform_post_id": platform_post_id,
            "content_snippet": content_snippet[:200],
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "clicks": clicks,
            "reach": reach,
            "engagement_rate": engagement_rate,
            "audience_tag": audience_tag,
            "polled_at": datetime.now(timezone.utc).isoformat(),
        }

        self.client.upsert(
            collection_name=FEEDBACK_MEMORY_COLLECTION,
            points=[
                models.PointStruct(
                    id=str(_uuid.uuid4()),
                    vector=vector,
                    payload=payload,
                )
            ],
        )
        print(
            f"[FeedbackMemoryStore] Wrote feedback for run {run_id} "
            f"(channel={channel}, engagement_rate={engagement_rate:.2%})"
        )

    def load_feedback(
        self,
        company_id: str,
        channel: str,
        n: int = 3,
    ) -> str:
        """
        Return the last n feedback entries for this company+channel.
        Called by Agent 1 before drafting to inform tone and format decisions.
        """
        self._ensure_collection()

        try:
            results, _ = self.client.scroll(
                collection_name=FEEDBACK_MEMORY_COLLECTION,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="company_id",
                            match=models.MatchValue(value=company_id),
                        ),
                        models.FieldCondition(
                            key="channel",
                            match=models.MatchValue(value=channel),
                        ),
                    ]
                ),
                limit=50,
                with_payload=True,
                with_vectors=False,
            )
        except Exception as exc:
            print(f"[FeedbackMemoryStore] Scroll failed: {exc}")
            return _COLD_START_MESSAGE

        if not results:
            return _COLD_START_MESSAGE

        # Sort by polled_at descending, take most recent n
        sorted_results = sorted(
            results,
            key=lambda pt: (pt.payload or {}).get("polled_at", ""),
            reverse=True,
        )[:n]

        lines = [f"Past {channel} post engagement for this company (most recent first):"]
        for pt in sorted_results:
            p = pt.payload or {}
            er = p.get("engagement_rate", 0)
            snippet = (p.get("content_snippet") or "")[:80]
            lines.append(
                f'  • "{snippet}..." — '
                f"engagement {er:.1%}, "
                f"likes:{p.get('likes', 0)} "
                f"comments:{p.get('comments', 0)} "
                f"shares:{p.get('shares', 0)}"
            )

        # Highlight the best-performing post
        best = max(
            sorted_results,
            key=lambda pt: (pt.payload or {}).get("engagement_rate", 0),
        )
        bp = best.payload or {}
        lines.append(
            f"Best performer: {bp.get('content_type', '')} post "
            f"with {bp.get('engagement_rate', 0):.1%} engagement. "
            f'Opening: "{(bp.get("content_snippet") or "")[:80]}..."'
        )

        return "\n".join(lines)
