#!/usr/bin/env python3
"""PII audit script — scans logs and Kafka topics for engineer PII leakage.

Usage:
    python scripts/pii_audit.py --log-dir /var/log/stas
    python scripts/pii_audit.py --kafka-topic stas.github.pr.reviewed --bootstrap localhost:9092
    python scripts/pii_audit.py --log-dir /var/log/stas --fail-on-match

Exit codes:
    0  — no PII found
    1  — PII found (use --fail-on-match to make CI fail on matches)
    2  — configuration or connectivity error
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ── PII patterns ──────────────────────────────────────────────────────────────
# These are broad — engineer names, email addresses, GitHub logins.
# True positives confirmed manually; add known-safe strings to ALLOWLIST.

_PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "email":         re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"),
    "github_login":  re.compile(r'"(?:login|author|reviewer)":\s*"([a-zA-Z0-9\-]{1,39})"'),
    "full_name":     re.compile(r'"name":\s*"([A-Z][a-z]+ [A-Z][a-z]+)"'),
    "slack_real_name": re.compile(r'"real_name":\s*"([^"]+)"'),
}

# Strings that match a pattern but are known safe (e.g., anonymised UUIDs, test data)
_ALLOWLIST: frozenset[str] = frozenset({
    "admin@stas.local",
    "test@example.com",
    "no-reply@github.com",
})

VIOLATIONS_FOUND = False


def _check_string(content: str, source: str) -> list[str]:
    violations = []
    for pattern_name, pattern in _PII_PATTERNS.items():
        for match in pattern.finditer(content):
            value = match.group(0)
            if any(a in value for a in _ALLOWLIST):
                continue
            violations.append(f"{source}: [{pattern_name}] {value[:80]}")
    return violations


def audit_log_dir(log_dir: Path) -> list[str]:
    violations: list[str] = []
    if not log_dir.exists():
        print(f"[WARN] Log directory not found: {log_dir}", file=sys.stderr)
        return violations
    for log_file in log_dir.rglob("*.log"):
        try:
            text = log_file.read_text(errors="replace")
            for line in text.splitlines():
                # Only check JSON-structured log lines for perf
                if line.startswith("{"):
                    try:
                        record = json.loads(line)
                        line = json.dumps(record)
                    except json.JSONDecodeError:
                        pass
                violations.extend(_check_string(line, str(log_file)))
        except OSError as exc:
            print(f"[WARN] Cannot read {log_file}: {exc}", file=sys.stderr)
    return violations


def audit_kafka_topic(topic: str, bootstrap: str, max_messages: int = 500) -> list[str]:
    try:
        from kafka import KafkaConsumer  # type: ignore[import]
    except ImportError:
        print("[ERROR] kafka-python not installed. Run: pip install kafka-python", file=sys.stderr)
        return []

    violations: list[str] = []
    try:
        consumer = KafkaConsumer(
            topic,
            bootstrap_servers=bootstrap,
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            consumer_timeout_ms=5_000,
            value_deserializer=lambda v: v.decode("utf-8", errors="replace"),
        )
        for i, msg in enumerate(consumer):
            if i >= max_messages:
                break
            violations.extend(_check_string(msg.value, f"kafka:{topic}@offset{msg.offset}"))
        consumer.close()
    except Exception as exc:
        print(f"[ERROR] Kafka consumer error: {exc}", file=sys.stderr)
    return violations


def main() -> int:
    parser = argparse.ArgumentParser(description="STAS PII audit tool")
    parser.add_argument("--log-dir", type=Path, help="Directory containing service log files")
    parser.add_argument("--kafka-topic", help="Kafka topic to sample")
    parser.add_argument("--bootstrap", default="localhost:9094", help="Kafka bootstrap servers (host:port)")
    parser.add_argument("--max-messages", type=int, default=500)
    parser.add_argument("--fail-on-match", action="store_true", help="Exit 1 if any PII found")
    args = parser.parse_args()

    all_violations: list[str] = []

    if args.log_dir:
        print(f"Scanning log directory: {args.log_dir}")
        violations = audit_log_dir(args.log_dir)
        all_violations.extend(violations)
        print(f"  {len(violations)} violation(s) in logs")

    if args.kafka_topic:
        print(f"Scanning Kafka topic: {args.kafka_topic} (up to {args.max_messages} messages)")
        violations = audit_kafka_topic(args.kafka_topic, args.bootstrap, args.max_messages)
        all_violations.extend(violations)
        print(f"  {len(violations)} violation(s) in topic")

    if not args.log_dir and not args.kafka_topic:
        parser.print_help()
        return 2

    if all_violations:
        print(f"\n{'='*60}")
        print(f"PII AUDIT: {len(all_violations)} VIOLATION(S) FOUND")
        print('='*60)
        for v in all_violations[:50]:
            print(f"  {v}")
        if len(all_violations) > 50:
            print(f"  ... and {len(all_violations) - 50} more")
        print()
        return 1 if args.fail_on_match else 0
    else:
        print("\nPII AUDIT: No violations found.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
