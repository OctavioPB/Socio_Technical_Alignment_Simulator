"""stas_graph_rebuild — nightly DAG that rebuilds edge weights and snapshots centrality.

Schedule: daily at 02:00 UTC | SLA: 1 hour

Pipeline:
  1. get_kafka_offset_range   — KafkaOffsetRangeOperator: finds the Kafka
     offset window covering the last 24 hours for the PR-review topic.
  2. rebuild_edge_weights     — @task: queries Neo4j for edges updated in the
     lookback window; logs the affected pair count for observability.
  3. take_centrality_snapshot — Neo4jSnapshotOperator: atomically snapshots
     the graph and computes closeness centrality; returns snapshot_id via XCom.
  4. check_topology_change    — @task: compares the new snapshot against the
     previous one; sends a Slack alert if edge count changed > 15%.
"""

from __future__ import annotations

import json
import os
from datetime import timedelta

from airflow.decorators import dag, task
from airflow.utils.dates import days_ago

# Operators are mounted as Airflow plugins (/opt/airflow/plugins).
# In tests, the conftest adds the operators directory to sys.path.
from neo4j_snapshot import Neo4jSnapshotOperator
from kafka_offset_range import KafkaOffsetRangeOperator

_PR_REVIEWED_TOPIC = "stas.github.pr.reviewed"


def _slack_alert(context: dict) -> None:
    webhook = os.environ.get("SLACK_ALERT_WEBHOOK_URL", "")
    if not webhook:
        return
    import requests  # Airflow ships with requests

    dag_id = context["dag"].dag_id
    task_id = context["task_instance"].task_id
    run_id = context.get("run_id", "")
    requests.post(
        webhook,
        json={
            "text": (
                f":red_circle: *STAS* — `{dag_id}` / `{task_id}` failed"
                f" (run: `{run_id}`)"
            )
        },
        timeout=5,
    )


@dag(
    dag_id="stas_graph_rebuild",
    schedule="0 2 * * *",
    start_date=days_ago(1),
    catchup=False,
    default_args={
        "owner": "stas-team",
        "retries": 1,
        "retry_delay": timedelta(minutes=5),
        "sla": timedelta(hours=1),
        "on_failure_callback": _slack_alert,
    },
    tags=["stas", "graph"],
    doc_md=__doc__,
)
def stas_graph_rebuild() -> None:
    # ── 1: Kafka offset range for the last 24 h ───────────────────────────────
    get_offsets = KafkaOffsetRangeOperator(
        task_id="get_kafka_offset_range",
        topic=_PR_REVIEWED_TOPIC,
        lookback_hours=24,
    )

    # ── 2: Count Neo4j edges updated in the window (idempotent read) ──────────
    @task
    def rebuild_edge_weights(offset_info: dict) -> str:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(
            os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.environ.get("NEO4J_USER", "neo4j"),
                os.environ.get("NEO4J_PASSWORD", "changeme_dev"),
            ),
        )
        try:
            with driver.session() as session:
                result = session.run(
                    """
                    MATCH (s:Engineer)-[r]->(t:Engineer)
                    WHERE r.last_event_at > datetime() - duration('P1D')
                    RETURN count(r) AS updated_edges
                    """
                )
                record = result.single()
                updated_edges = record["updated_edges"] if record else 0
        finally:
            driver.close()

        return json.dumps(
            {
                "updated_edges": updated_edges,
                "offset_partitions": list(offset_info.keys()),
            }
        )

    # ── 3: Atomic centrality snapshot ─────────────────────────────────────────
    take_snapshot = Neo4jSnapshotOperator(
        task_id="take_centrality_snapshot",
        team_id="all",
    )

    # ── 4: Topology change detection (> 15% edge delta → alert) ──────────────
    @task
    def check_topology_change(snapshot_id: str) -> None:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(
            os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.environ.get("NEO4J_USER", "neo4j"),
                os.environ.get("NEO4J_PASSWORD", "changeme_dev"),
            ),
        )
        try:
            with driver.session() as session:
                result = session.run(
                    """
                    MATCH (s:GraphSnapshot {team_id: 'all'})
                    RETURN s.snapshot_id AS id,
                           s.edge_count  AS edges,
                           s.captured_at AS ts
                    ORDER BY s.captured_at DESC
                    LIMIT 2
                    """
                )
                snapshots = result.data()
        finally:
            driver.close()

        if len(snapshots) < 2:
            return  # first run — nothing to compare

        current, previous = snapshots[0], snapshots[1]
        prev_edges = previous["edges"] or 0
        if prev_edges == 0:
            return

        change_pct = abs(current["edges"] - prev_edges) / prev_edges
        if change_pct <= 0.15:
            return

        webhook = os.environ.get("SLACK_ALERT_WEBHOOK_URL", "")
        if not webhook:
            return
        import requests

        requests.post(
            webhook,
            json={
                "text": (
                    f":warning: *STAS topology shift* — edge count changed"
                    f" {change_pct:.1%} vs previous snapshot"
                    f" (`{previous['id'][:8]}` → `{current['id'][:8]}`)"
                )
            },
            timeout=5,
        )

    # ── Wire up task dependencies ──────────────────────────────────────────────
    rebuild_result = rebuild_edge_weights(get_offsets.output)
    take_snapshot << rebuild_result  # snapshot runs after rebuild
    check_topology_change(take_snapshot.output)


stas_graph_rebuild_dag = stas_graph_rebuild()
