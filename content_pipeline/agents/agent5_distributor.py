"""
Agent 5 — Distributor

Publishes or schedules approved content across all confirmed platforms.
Each channel has its own integration. Failures are logged and reported
without crashing — other channels continue publishing.

Reads from state:  localized_versions, confirmed_platforms,
                   strategy_card, scheduled_time, run_id
Writes to state:   distribution_receipts, pipeline_complete
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import requests

from content_pipeline.core import audit
from content_pipeline.core.state import ContentState, DistributionReceipt


# ── Channel credentials (loaded from env) ─────────────────────────────────────

_BUFFER_ACCESS_TOKEN = os.getenv("BUFFER_ACCESS_TOKEN", "")
_BUFFER_PROFILE_IDS: dict[str, str] = {
    "linkedin": os.getenv("BUFFER_LINKEDIN_PROFILE_ID", ""),
    "twitter": os.getenv("BUFFER_TWITTER_PROFILE_ID", ""),
}

_WORDPRESS_URL = os.getenv("WORDPRESS_URL", "")
_WORDPRESS_USER = os.getenv("WORDPRESS_USER", "")
_WORDPRESS_APP_PASSWORD = os.getenv("WORDPRESS_APP_PASSWORD", "")

_SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
_SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "")
_SENDGRID_LIST_ID = os.getenv("SENDGRID_LIST_ID", "")


# ── Channel publishers ────────────────────────────────────────────────────────

def _publish_to_buffer(
    content: str,
    platform: str,
    scheduled_at: str | None,
) -> DistributionReceipt:
    """Publish or schedule a post via Buffer API."""
    profile_id = _BUFFER_PROFILE_IDS.get(platform, "")
    if not profile_id or not _BUFFER_ACCESS_TOKEN:
        return DistributionReceipt(
            channel=platform,
            platform_id="",
            published_at=datetime.now(timezone.utc).isoformat(),
            status="failed",
            error="Buffer credentials not configured",
        )

    payload: dict = {
        "text": content,
        "profile_ids": [profile_id],
    }
    if scheduled_at:
        payload["scheduled_at"] = scheduled_at

    try:
        resp = requests.post(
            "https://api.bufferapp.com/1/updates/create.json",
            headers={"Authorization": f"Bearer {_BUFFER_ACCESS_TOKEN}"},
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        post_id = data.get("updates", [{}])[0].get("id", "unknown")
        return DistributionReceipt(
            channel=platform,
            platform_id=post_id,
            published_at=datetime.now(timezone.utc).isoformat(),
            status="scheduled" if scheduled_at else "published",
            error=None,
        )
    except Exception as exc:
        return DistributionReceipt(
            channel=platform,
            platform_id="",
            published_at=datetime.now(timezone.utc).isoformat(),
            status="failed",
            error=str(exc),
        )


def _publish_to_wordpress(
    content: str,
    title: str,
    scheduled_at: str | None,
) -> DistributionReceipt:
    """Publish or schedule a blog post via WordPress REST API."""
    if not _WORDPRESS_URL or not _WORDPRESS_USER:
        return DistributionReceipt(
            channel="blog",
            platform_id="",
            published_at=datetime.now(timezone.utc).isoformat(),
            status="failed",
            error="WordPress credentials not configured",
        )

    status = "future" if scheduled_at else "publish"
    payload: dict = {
        "title": title,
        "content": content,
        "status": status,
    }
    if scheduled_at:
        payload["date"] = scheduled_at

    try:
        resp = requests.post(
            f"{_WORDPRESS_URL.rstrip('/')}/wp-json/wp/v2/posts",
            auth=(_WORDPRESS_USER, _WORDPRESS_APP_PASSWORD),
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return DistributionReceipt(
            channel="blog",
            platform_id=str(data.get("id", "unknown")),
            published_at=datetime.now(timezone.utc).isoformat(),
            status="scheduled" if scheduled_at else "published",
            error=None,
        )
    except Exception as exc:
        return DistributionReceipt(
            channel="blog",
            platform_id="",
            published_at=datetime.now(timezone.utc).isoformat(),
            status="failed",
            error=str(exc),
        )


def _publish_to_sendgrid(
    content: str,
    subject: str,
    scheduled_at: str | None,
) -> DistributionReceipt:
    """Send email newsletter via SendGrid."""
    if not _SENDGRID_API_KEY or not _SENDGRID_FROM_EMAIL:
        return DistributionReceipt(
            channel="email",
            platform_id="",
            published_at=datetime.now(timezone.utc).isoformat(),
            status="failed",
            error="SendGrid credentials not configured",
        )

    payload = {
        "name": f"Newsletter {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
        "send_to": {"list_ids": [_SENDGRID_LIST_ID]},
        "email_config": {
            "subject": subject,
            "sender_id": 1,
            "html_content": content.replace("\n", "<br>"),
        },
    }

    try:
        resp = requests.post(
            "https://api.sendgrid.com/v3/marketing/singlesends",
            headers={
                "Authorization": f"Bearer {_SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        send_id = data.get("id", "unknown")

        # Schedule or send immediately
        if scheduled_at:
            requests.put(
                f"https://api.sendgrid.com/v3/marketing/singlesends/{send_id}/schedule",
                headers={"Authorization": f"Bearer {_SENDGRID_API_KEY}"},
                json={"send_at": scheduled_at},
                timeout=10,
            )
            status = "scheduled"
        else:
            requests.post(
                f"https://api.sendgrid.com/v3/marketing/singlesends/{send_id}/schedule",
                headers={"Authorization": f"Bearer {_SENDGRID_API_KEY}"},
                json={"send_at": "now"},
                timeout=10,
            )
            status = "published"

        return DistributionReceipt(
            channel="email",
            platform_id=send_id,
            published_at=datetime.now(timezone.utc).isoformat(),
            status=status,
            error=None,
        )
    except Exception as exc:
        return DistributionReceipt(
            channel="email",
            platform_id="",
            published_at=datetime.now(timezone.utc).isoformat(),
            status="failed",
            error=str(exc),
        )


# ── Routing ───────────────────────────────────────────────────────────────────

def _get_content_for_channel(
    platform: str,
    localized_versions: dict[str, str],
    primary_lang: str = "en",
) -> str:
    """Get the appropriate language version for a channel."""
    # Use English as default; localised versions can be routed per region
    return localized_versions.get(primary_lang, localized_versions.get("en", ""))


def _extract_blog_title(draft: str) -> str:
    """Extract H1 title from markdown blog draft."""
    for line in draft.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "New Article"


def _extract_email_subject(draft: str) -> str:
    """Try to extract subject line if email format is used."""
    for line in draft.splitlines():
        if line.lower().startswith("subject:"):
            return line.split(":", 1)[1].strip()
    return "Update from Razorpay"


# ── Node function ─────────────────────────────────────────────────────────────

def agent5_distributor(state: ContentState) -> ContentState:
    """
    LangGraph node — Agent 5: Distributor.

    Publishes to each confirmed platform. Failures are logged
    individually — a failure on one channel does not stop others.
    """
    platforms = state.get("confirmed_platforms", [state.get("channel", "linkedin")])
    localized = state.get("localized_versions", {"en": state.get("current_draft", "")})
    scheduled_at = state.get("scheduled_time")

    receipts: list[DistributionReceipt] = []

    for platform in platforms:
        content = _get_content_for_channel(platform, localized)

        if platform in ("linkedin", "twitter"):
            receipt = _publish_to_buffer(content, platform, scheduled_at)

        elif platform == "blog":
            title = _extract_blog_title(content)
            receipt = _publish_to_wordpress(content, title, scheduled_at)

        elif platform == "email":
            subject = _extract_email_subject(content)
            receipt = _publish_to_sendgrid(content, subject, scheduled_at)

        else:
            receipt = DistributionReceipt(
                channel=platform,
                platform_id="",
                published_at=datetime.now(timezone.utc).isoformat(),
                status="failed",
                error=f"Unsupported platform: {platform}",
            )

        receipts.append(receipt)

    failed = [r for r in receipts if r["status"] == "failed"]

    return {
        **state,
        "distribution_receipts": receipts,
        "pipeline_complete": True,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="agent5_distributor",
                action="distribution_complete",
                decision="pass" if not failed else "partial_failure",
                detail={
                    "total_channels": len(receipts),
                    "successful": len(receipts) - len(failed),
                    "failed": [f["channel"] for f in failed],
                    "receipts": [
                        {"channel": r["channel"], "status": r["status"],
                         "platform_id": r["platform_id"]}
                        for r in receipts
                    ],
                },
            ),
        ),
    }
