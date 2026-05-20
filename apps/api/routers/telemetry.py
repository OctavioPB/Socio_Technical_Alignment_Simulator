"""Telemetry webhook receivers — GitHub, Slack, Jira → Kafka bridge.

These endpoints receive push webhooks from external systems, validate them,
map fields to our Avro event schema, and produce to the appropriate Kafka topic.

Security: HMAC-SHA256 signature validation implemented for GitHub and Slack.
Jira uses Bearer token validation. All validations are bypassed when the
corresponding secret env var is unset (dev mode).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Annotated

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Header, HTTPException, Request, status

from pipelines.kafka import topics
from pipelines.kafka.serialization import (
    JIRA_BLOCK_SCHEMA,
    PR_REVIEW_SCHEMA,
    SLACK_THREAD_SCHEMA,
    serialize,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["telemetry"])

GITHUB_WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
SLACK_SIGNING_SECRET = os.environ.get("SLACK_SIGNING_SECRET", "")
JIRA_WEBHOOK_SECRET = os.environ.get("JIRA_WEBHOOK_SECRET", "")


def _get_producer(request: Request) -> AIOKafkaProducer | None:
    return getattr(request.app.state, "kafka_producer", None)


def _now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


# ─── GitHub ───────────────────────────────────────────────────────────────────


def _verify_github_signature(body: bytes, signature_header: str | None) -> None:
    if not GITHUB_WEBHOOK_SECRET:
        return  # skip validation in dev if secret not configured
    if not signature_header or not signature_header.startswith("sha256="):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing GitHub signature.")
    expected = "sha256=" + hmac.new(
        GITHUB_WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid GitHub signature.")


@router.post("/github/webhook", status_code=status.HTTP_202_ACCEPTED)
async def receive_github_webhook(
    request: Request,
    x_github_event: Annotated[str | None, Header()] = None,
    x_hub_signature_256: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Receive GitHub pull_request_review webhook events.

    Filters to 'submitted' action only. Maps reviewer and author to Engineer IDs.
    The engineer mapping assumes GitHub logins match Engineer.id in Neo4j (dev assumption).
    In production, resolve GitHub logins to Engineer UUIDs via the anonymization service.
    """
    body = await request.body()
    _verify_github_signature(body, x_hub_signature_256)

    if x_github_event != "pull_request_review":
        return {"status": "ignored", "reason": f"event={x_github_event}"}

    payload = await request.json()
    action = payload.get("action")
    if action != "submitted":
        return {"status": "ignored", "reason": f"action={action}"}

    reviewer_id = payload.get("review", {}).get("user", {}).get("login", "")
    author_id = payload.get("pull_request", {}).get("user", {}).get("login", "")
    repo = payload.get("repository", {}).get("full_name", "unknown/unknown")
    pr_number = payload.get("pull_request", {}).get("number", 0)

    if not reviewer_id or not author_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing reviewer or author.")

    event = {
        "event_id": str(uuid.uuid4()),
        "reviewer_id": reviewer_id,
        "author_id": author_id,
        "repo": repo,
        "pr_number": pr_number,
        "timestamp": _now_ms(),
    }

    producer = _get_producer(request)
    if producer:
        await producer.send_and_wait(topics.PR_REVIEWED, serialize(event, PR_REVIEW_SCHEMA))
        logger.info("GitHub PR review event produced: %s → %s", reviewer_id, author_id)
    else:
        logger.warning("Kafka producer unavailable — event not published.")

    return {"status": "accepted", "event_id": event["event_id"]}


# ─── Slack ────────────────────────────────────────────────────────────────────


def _verify_slack_signature(body: bytes, timestamp: str | None, signature: str | None) -> None:
    """Verify Slack request signature (HMAC-SHA256 over version:timestamp:body)."""
    if not SLACK_SIGNING_SECRET:
        return
    if not timestamp or not signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Slack signature headers.")
    # Replay attack guard: reject requests older than 5 minutes
    import time
    if abs(time.time() - float(timestamp)) > 300:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Slack request timestamp too old.")
    sig_basestring = f"v0:{timestamp}:{body.decode()}"
    expected = "v0=" + hmac.new(
        SLACK_SIGNING_SECRET.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Slack signature.")


@router.post("/slack/webhook", status_code=status.HTTP_202_ACCEPTED)
async def receive_slack_event(
    request: Request,
    x_slack_request_timestamp: Annotated[str | None, Header()] = None,
    x_slack_signature: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Receive Slack Events API callbacks.

    Handles:
      - url_verification challenge (Slack requires echoing back the challenge).
      - reaction_added events where the reaction is a positive resolution indicator.

    Engineer mapping: Slack user IDs must be mapped to Engineer IDs via a lookup table.
    For dev, Slack user IDs are used directly as Engineer IDs.
    """
    body = await request.body()
    _verify_slack_signature(body, x_slack_request_timestamp, x_slack_signature)
    payload = await request.json()

    # Slack URL verification handshake
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}

    event = payload.get("event", {})
    event_type = event.get("type")
    if event_type != "reaction_added":
        return {"status": "ignored", "reason": f"event_type={event_type}"}

    reaction = event.get("reaction", "")
    positive = {"white_check_mark", "+1", "thumbsup", "thanks", "heavy_check_mark"}
    if reaction not in positive:
        return {"status": "ignored", "reason": f"reaction={reaction} not positive"}

    helper_id = event.get("item_user", "")   # user who sent the original message
    asker_id = event.get("user", "")          # user who reacted (= asker saying "thanks")
    channel = event.get("item", {}).get("channel", "")
    thread_ts = event.get("item", {}).get("ts", "")

    if not helper_id or not asker_id:
        return {"status": "ignored", "reason": "missing user IDs"}

    record = {
        "event_id": str(uuid.uuid4()),
        "helper_id": helper_id,
        "asker_id": asker_id,
        "channel": channel,
        "thread_ts": thread_ts,
        "resolved": True,
        "timestamp": _now_ms(),
    }

    producer = _get_producer(request)
    if producer:
        await producer.send_and_wait(topics.SLACK_THREAD_RESOLVED, serialize(record, SLACK_THREAD_SCHEMA))
        logger.info("Slack resolved thread produced: helper=%s asker=%s", helper_id, asker_id)
    else:
        logger.warning("Kafka producer unavailable — event not published.")

    return {"status": "accepted", "event_id": record["event_id"]}


# ─── Jira ─────────────────────────────────────────────────────────────────────


@router.post("/jira/webhook", status_code=status.HTTP_202_ACCEPTED)
async def receive_jira_webhook(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Receive Jira issue_link_deleted webhooks (blocking dependency resolved).

    The blocker is the assignee of the blocking issue.
    The blocked is the assignee of the blocked issue.
    Duration is computed from the link creation time (Jira provides this).
    """
    if JIRA_WEBHOOK_SECRET and authorization != f"Bearer {JIRA_WEBHOOK_SECRET}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Jira token.")

    payload = await request.json()
    webhook_event = payload.get("webhookEvent", "")

    if webhook_event != "jira:issue_link_deleted":
        return {"status": "ignored", "reason": f"webhookEvent={webhook_event}"}

    issue_link = payload.get("issueLink", {})
    if issue_link.get("issueLinkType", {}).get("name", "").lower() != "blocks":
        return {"status": "ignored", "reason": "not a blocks link"}

    blocker_id = (
        issue_link.get("sourceIssueId", {})
        if isinstance(issue_link.get("sourceIssueId"), str)
        else str(issue_link.get("sourceIssueId", ""))
    )
    blocked_id = (
        issue_link.get("destinationIssueId", {})
        if isinstance(issue_link.get("destinationIssueId"), str)
        else str(issue_link.get("destinationIssueId", ""))
    )
    issue_key = payload.get("issue", {}).get("key", "UNKNOWN-0")
    duration_hours = float(payload.get("issue", {}).get("fields", {}).get("timespent", 0)) / 3600

    if not blocker_id or not blocked_id:
        return {"status": "ignored", "reason": "missing issue IDs"}

    record = {
        "event_id": str(uuid.uuid4()),
        "blocker_id": blocker_id,
        "blocked_id": blocked_id,
        "issue_key": issue_key,
        "duration_hours": max(duration_hours, 0.5),  # floor at 30 min
        "timestamp": _now_ms(),
    }

    producer = _get_producer(request)
    if producer:
        await producer.send_and_wait(topics.JIRA_TICKET_BLOCKED, serialize(record, JIRA_BLOCK_SCHEMA))
        logger.info("Jira block event produced: blocker=%s blocked=%s", blocker_id, blocked_id)
    else:
        logger.warning("Kafka producer unavailable — event not published.")

    return {"status": "accepted", "event_id": record["event_id"]}
