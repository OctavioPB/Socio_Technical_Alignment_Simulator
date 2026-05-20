"""Structured logging configuration for the STAS API.

Configures the root logger to emit JSON (production) or pretty-printed text
(development) via python-json-logger. Every log record includes:

  timestamp   — ISO-8601 UTC
  level       — DEBUG / INFO / WARNING / ERROR / CRITICAL
  logger      — dotted module path
  message     — the log message
  trace_id    — propagated from X-Trace-Id request header (see TraceMiddleware)
  environment — from settings.environment

Usage:
    from apps.api.core.logging_config import configure_logging
    configure_logging(level="INFO", fmt="json")  # call once at startup
"""

from __future__ import annotations

import logging
import logging.config
import sys
from contextvars import ContextVar

# Context variable — set per request by TraceMiddleware
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="-")


class _TraceFilter(logging.Filter):
    """Inject trace_id from ContextVar into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = trace_id_var.get("-")  # type: ignore[attr-defined]
        return True


def configure_logging(level: str = "INFO", fmt: str = "json") -> None:
    """Set up root logger. Call exactly once at application startup."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()

    trace_filter = _TraceFilter()

    if fmt == "json":
        try:
            from pythonjsonlogger import jsonlogger  # type: ignore[import]

            handler = logging.StreamHandler(sys.stdout)
            formatter = jsonlogger.JsonFormatter(
                fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
                rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
                static_fields={"service": "stas-api"},
            )
            handler.setFormatter(formatter)
            handler.addFilter(trace_filter)
            root.addHandler(handler)
            return
        except ImportError:
            pass  # fall through to text format

    # Text format fallback (dev or when python-json-logger not installed)
    handler = logging.StreamHandler(sys.stdout)
    fmt_str = "[%(asctime)s] %(levelname)-8s [%(trace_id)s] %(name)s: %(message)s"
    handler.setFormatter(logging.Formatter(fmt_str, datefmt="%H:%M:%S"))
    handler.addFilter(trace_filter)
    root.addHandler(handler)

    # Quieten noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "neo4j", "aiokafka"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
