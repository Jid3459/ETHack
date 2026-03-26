"""
Audit helpers — every agent calls make_entry() before returning state.
The complete trail is persisted to Qdrant at pipeline end.
"""
import json
from datetime import datetime, timezone
from typing import Any

from content_pipeline.core.state import AuditEntry


def make_entry(
    run_id: str,
    agent: str,
    action: str,
    decision: str,
    detail: Any = None,
) -> AuditEntry:
    """
    Build a single audit trail entry.

    Args:
        run_id:   pipeline run identifier
        agent:    node name, e.g. "agent1_drafter"
        action:   what the agent did, e.g. "draft_generated"
        decision: outcome, e.g. "pass" | "fail" | "escalate"
        detail:   any extra context (will be JSON-serialised)
    """
    return AuditEntry(
        run_id=run_id,
        agent=agent,
        timestamp=datetime.now(timezone.utc).isoformat(),
        action=action,
        decision=decision,
        detail=json.dumps(detail, default=str) if detail else "",
    )


def append(state_audit: list[AuditEntry], entry: AuditEntry) -> list[AuditEntry]:
    """Return a new list with entry appended (keeps state immutable-ish)."""
    return [*state_audit, entry]
