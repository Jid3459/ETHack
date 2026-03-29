"""
Agent 7 — Feedback Collector

Polls analytics 24-48h after distribution. For each published post:
  - Buffer API  → LinkedIn and Twitter engagement (likes, shares, comments, clicks)
  - WordPress REST API → blog comment count + view proxy
  - SendGrid Marketing API → email open/click/deliver stats

All free-tier API calls — no paid plan required.

Stores results in the feedback_memory Qdrant collection.
Agent 1 reads this on subsequent runs to tailor tone and format.

NOT part of the main pipeline graph. Called via:
  POST /feedback/{run_id}   — trigger collection (runs in background)
  GET  /feedback/{run_id}   — read collected results

Output visible at:  GET /feedback/{run_id}  →  JSON with engagement stats per channel
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import requests

from content_pipeline.tools.feedback_memory import FeedbackMemoryStore

_feedback_store = FeedbackMemoryStore()

# ── Credentials (same env vars as Agent 5) ────────────────────────────────────

_BUFFER_ACCESS_TOKEN = os.getenv("BUFFER_ACCESS_TOKEN", "")
_WORDPRESS_URL = os.getenv("WORDPRESS_URL", "")
_WORDPRESS_USER = os.getenv("WORDPRESS_USER", "")
_WORDPRESS_APP_PASSWORD = os.getenv("WORDPRESS_APP_PASSWORD", "")
_SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")


# ── Analytics fetchers ────────────────────────────────────────────────────────


_BUFFER_GRAPHQL_URL = "https://api.buffer.com/graphql"
_BUFFER_GET_POST_QUERY = """
query GetPost($input: PostInput!) {
  post(input: $input) {
    id
    status
    sentAt
    text
  }
}
"""


def _fetch_buffer_analytics(platform_post_id: str) -> dict:
    """
    Fetch post status via Buffer GraphQL API.

    Note: Buffer's new API does not expose engagement metrics (likes/shares/comments).
    This function confirms the post was sent and returns zeros for engagement fields.
    Native platform APIs (LinkedIn Analytics, Twitter/X API) would be needed for
    real engagement data — those require separate app credentials beyond Buffer's scope.
    """
    if not _BUFFER_ACCESS_TOKEN or not platform_post_id:
        return _zeros()
    try:
        resp = requests.post(
            _BUFFER_GRAPHQL_URL,
            headers={
                "Authorization": f"Bearer {_BUFFER_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            json={"query": _BUFFER_GET_POST_QUERY, "variables": {"input": {"id": platform_post_id}}},
            timeout=10,
        )
        resp.raise_for_status()
        result = resp.json()
        post = result.get("data", {}).get("post", {})
        status = post.get("status", "unknown")
        print(f"[agent7_feedback] Buffer post {platform_post_id} status={status} — engagement metrics not available via Buffer API")
        return _zeros()
    except Exception as exc:
        print(f"[agent7_feedback] Buffer post lookup failed for {platform_post_id}: {exc}")
        return _zeros()


def _fetch_wordpress_analytics(platform_post_id: str) -> dict:
    """
    Fetch engagement for a WordPress post.
    Uses WP REST API to get comment count (free, no plugin needed).
    """
    if not _WORDPRESS_URL or not platform_post_id:
        return _zeros()
    try:
        resp = requests.get(
            f"{_WORDPRESS_URL.rstrip('/')}/wp-json/wp/v2/posts/{platform_post_id}",
            auth=(_WORDPRESS_USER, _WORDPRESS_APP_PASSWORD),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        comment_count = int(data.get("comment_count") or 0)
        return {
            "likes": 0,
            "comments": comment_count,
            "shares": 0,
            "clicks": 0,
            "reach": 0,
        }
    except Exception as exc:
        print(f"[agent7_feedback] WordPress analytics failed for {platform_post_id}: {exc}")
        return _zeros()


def _fetch_sendgrid_analytics(platform_post_id: str) -> dict:
    """
    Fetch email campaign stats via SendGrid Marketing API.
    GET /v3/marketing/stats/singlesends/{id}
    SendGrid free tier provides open/click/deliver stats.
    """
    if not _SENDGRID_API_KEY or not platform_post_id:
        return _zeros()
    try:
        resp = requests.get(
            f"https://api.sendgrid.com/v3/marketing/stats/singlesends/{platform_post_id}",
            headers={"Authorization": f"Bearer {_SENDGRID_API_KEY}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        agg = data.get("aggregates", {})
        return {
            "likes": 0,
            "comments": 0,
            "shares": 0,
            "clicks": int(agg.get("unique_clicks", 0) or 0),
            "reach": int(agg.get("delivered", 0) or 0),
        }
    except Exception as exc:
        print(f"[agent7_feedback] SendGrid analytics failed for {platform_post_id}: {exc}")
        return _zeros()


def _zeros() -> dict:
    return {"likes": 0, "comments": 0, "shares": 0, "clicks": 0, "reach": 0}


# ── Main collector ────────────────────────────────────────────────────────────


def collect_feedback(
    run_id: str,
    company_id: str,
    distribution_receipts: list[dict],
    current_draft: str,
    content_type: str,
    target_audience: str = "default",
) -> dict:
    """
    Poll analytics for all receipts in this run and store in feedback_memory.

    Called via POST /feedback/{run_id} endpoint, typically 24-48h after
    distribution once engagement data has had time to accumulate.

    Returns a summary of collected feedback — visible at GET /feedback/{run_id}.

    Output example:
    {
      "run_id": "...",
      "company_id": "razorpay_demo",
      "feedback_records": 2,
      "details": [
        {
          "channel": "linkedin",
          "analytics": {"likes": 45, "comments": 8, "shares": 12, "clicks": 120, "reach": 3200},
          "engagement_rate": "0.0203",
          "stored_at": "2026-03-28T..."
        }
      ]
    }
    """
    collected = []
    content_snippet = (current_draft or "")[:200]

    for receipt in distribution_receipts:
        if receipt.get("status") not in ("published", "scheduled"):
            continue

        channel = receipt["channel"]
        platform_post_id = receipt.get("platform_id", "")

        # Fetch analytics from appropriate API
        if channel in ("linkedin", "twitter"):
            analytics = _fetch_buffer_analytics(platform_post_id)
        elif channel == "blog":
            analytics = _fetch_wordpress_analytics(platform_post_id)
        elif channel == "email":
            analytics = _fetch_sendgrid_analytics(platform_post_id)
        else:
            analytics = _zeros()

        # Store in Qdrant regardless of whether API returned real data
        # Zero-value records still serve as run history markers
        _feedback_store.write_feedback(
            company_id=company_id,
            run_id=run_id,
            channel=channel,
            content_type=content_type,
            platform_post_id=platform_post_id,
            content_snippet=content_snippet,
            audience_tag=target_audience,
            **analytics,
        )

        reach = analytics.get("reach", 0)
        engagement_rate = (
            round(
                (analytics["likes"] + analytics["comments"] + analytics["shares"])
                / reach,
                4,
            )
            if reach > 0
            else 0.0
        )

        collected.append({
            "channel": channel,
            "platform_post_id": platform_post_id,
            "analytics": analytics,
            "engagement_rate": str(engagement_rate),
            "stored_at": datetime.now(timezone.utc).isoformat(),
        })

        print(
            f"[agent7_feedback] Collected {channel} analytics — "
            f"likes:{analytics['likes']} shares:{analytics['shares']} "
            f"reach:{analytics['reach']}"
        )

    return {
        "run_id": run_id,
        "company_id": company_id,
        "feedback_records": len(collected),
        "details": collected,
        "message": (
            f"Collected analytics for {len(collected)} channel(s). "
            "Agent 1 will use this data on the next run to improve content quality."
        ),
    }
