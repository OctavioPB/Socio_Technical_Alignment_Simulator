"""Avro serialization helpers using fastavro (no Schema Registry).

Schemas are loaded from pipelines/kafka/schemas/*.avsc and parsed once at
import time. Calling parse_schema is expensive — do it at module level.
"""

from __future__ import annotations

import io
from pathlib import Path

import fastavro

_SCHEMA_DIR = Path(__file__).parent / "schemas"


def _load(filename: str) -> dict:
    raw = fastavro.parse_schema(
        __import__("json").loads((_SCHEMA_DIR / filename).read_text())
    )
    return raw  # type: ignore[return-value]


PR_REVIEW_SCHEMA = _load("pr_review_event.avsc")
SLACK_THREAD_SCHEMA = _load("slack_thread_event.avsc")
JIRA_BLOCK_SCHEMA = _load("jira_block_event.avsc")


def serialize(record: dict, schema: dict) -> bytes:
    """Serialize a dict to Avro bytes (schemaless — no magic byte/schema ID)."""
    buf = io.BytesIO()
    fastavro.schemaless_writer(buf, schema, record)
    return buf.getvalue()


def deserialize(data: bytes, schema: dict) -> dict:
    """Deserialize Avro bytes to a dict."""
    buf = io.BytesIO(data)
    return fastavro.schemaless_reader(buf, schema)  # type: ignore[return-value]
