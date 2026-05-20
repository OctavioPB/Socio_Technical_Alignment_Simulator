"""Pydantic v2 models for Kafka telemetry events.

These mirror the Avro schemas in pipelines/kafka/schemas/ exactly.
Used by both producers (serialization) and consumers (validation after deserialization).
"""

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


class PrReviewEvent(BaseModel):
    """A pull request review from GitHub.

    reviewer_id → author_id maps to REVIEWS_PR_OF in Neo4j.
    """

    event_id: str = Field(default_factory=_new_id)
    reviewer_id: str
    author_id: str
    repo: str
    pr_number: int
    timestamp: datetime = Field(default_factory=_now_utc)


class SlackThreadEvent(BaseModel):
    """A resolved Slack thread where one engineer helped another.

    helper_id → asker_id maps to RESOLVES_DOUBT_FOR in Neo4j.
    Only events where resolved=True contribute to the graph.
    """

    event_id: str = Field(default_factory=_new_id)
    helper_id: str
    asker_id: str
    channel: str
    thread_ts: str
    resolved: bool
    timestamp: datetime = Field(default_factory=_now_utc)


class JiraBlockEvent(BaseModel):
    """A resolved Jira blocking dependency between engineers.

    blocker_id → blocked_id maps to BLOCKS_TICKET_OF in Neo4j.
    """

    event_id: str = Field(default_factory=_new_id)
    blocker_id: str
    blocked_id: str
    issue_key: str
    duration_hours: float
    timestamp: datetime = Field(default_factory=_now_utc)
