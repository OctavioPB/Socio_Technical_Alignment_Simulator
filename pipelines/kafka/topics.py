"""Kafka topic and consumer group name constants.

Naming convention: stas.{source}.{entity}.{action}
DLQ convention:    stas.dlq.{consumer-group}
"""

# ─── Source topics ────────────────────────────────────────────────────────────
PR_REVIEWED = "stas.github.pr.reviewed"
SLACK_THREAD_RESOLVED = "stas.slack.thread.resolved"
JIRA_TICKET_BLOCKED = "stas.jira.ticket.blocked"

# ─── Consumer group IDs ───────────────────────────────────────────────────────
GROUP_PR_REVIEW = "stas-pr-review-consumer"
GROUP_SLACK_THREAD = "stas-slack-thread-consumer"
GROUP_JIRA_BLOCK = "stas-jira-block-consumer"

# ─── Dead-letter queues ───────────────────────────────────────────────────────
DLQ_PR_REVIEW = f"stas.dlq.{GROUP_PR_REVIEW}"
DLQ_SLACK_THREAD = f"stas.dlq.{GROUP_SLACK_THREAD}"
DLQ_JIRA_BLOCK = f"stas.dlq.{GROUP_JIRA_BLOCK}"

ALL_TOPICS = (PR_REVIEWED, SLACK_THREAD_RESOLVED, JIRA_TICKET_BLOCKED)
ALL_DLQ_TOPICS = (DLQ_PR_REVIEW, DLQ_SLACK_THREAD, DLQ_JIRA_BLOCK)
