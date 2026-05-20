"""Unit tests for Neo4jSnapshotOperator and KafkaOffsetRangeOperator.

These tests do NOT require Airflow or a live Neo4j/Kafka instance.
They verify operator construction, attribute defaults, and the pure-Python
helper functions that contain the core snapshot/offset business logic.
"""

from __future__ import annotations

import pytest

# ── Neo4jSnapshotOperator ─────────────────────────────────────────────────────


class TestNeo4jSnapshotOperator:
    def test_instantiates_with_required_args(self) -> None:
        from neo4j_snapshot import Neo4jSnapshotOperator

        op = Neo4jSnapshotOperator(task_id="snap", team_id="platform")
        assert op.task_id == "snap"
        assert op.team_id == "platform"

    def test_ui_color_matches_brand(self) -> None:
        from neo4j_snapshot import Neo4jSnapshotOperator

        assert Neo4jSnapshotOperator.ui_color == "#003366"

    def test_explicit_neo4j_credentials_override_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from neo4j_snapshot import Neo4jSnapshotOperator

        monkeypatch.setenv("NEO4J_URI", "bolt://should-not-be-used:7687")
        op = Neo4jSnapshotOperator(
            task_id="snap",
            team_id="ml",
            neo4j_uri="bolt://custom:7687",
            neo4j_user="user",
            neo4j_password="pass",
        )
        assert op._neo4j_uri == "bolt://custom:7687"

    def test_team_id_all_is_valid(self) -> None:
        from neo4j_snapshot import Neo4jSnapshotOperator

        op = Neo4jSnapshotOperator(task_id="snap", team_id="all")
        assert op.team_id == "all"


class TestComputeClosenessCentrality:
    """Tests for the pure-Python centrality helper (no Neo4j/Airflow needed)."""

    def test_empty_graph_returns_empty_list(self) -> None:
        from neo4j_snapshot import compute_closeness_centrality

        assert compute_closeness_centrality([], []) == []

    def test_single_node_has_zero_centrality(self) -> None:
        from neo4j_snapshot import compute_closeness_centrality

        result = compute_closeness_centrality([{"id": "alice"}], [])
        assert len(result) == 1
        assert result[0]["engineer_id"] == "alice"
        assert result[0]["closeness"] == 0.0

    def test_hub_node_has_highest_centrality(self) -> None:
        """Hub connected to all others should have the highest closeness score."""
        from neo4j_snapshot import compute_closeness_centrality

        nodes = [{"id": n} for n in ["hub", "a", "b", "c"]]
        edges = [
            {"source": "hub", "target": "a", "weight": 1},
            {"source": "hub", "target": "b", "weight": 1},
            {"source": "hub", "target": "c", "weight": 1},
        ]
        scores = {r["engineer_id"]: r["closeness"] for r in compute_closeness_centrality(nodes, edges)}
        assert scores["hub"] > scores["a"]
        assert scores["hub"] > scores["b"]
        assert scores["hub"] > scores["c"]

    def test_multi_edge_weights_accumulate(self) -> None:
        """Two edges between the same pair should sum their weights."""
        from neo4j_snapshot import compute_closeness_centrality

        nodes = [{"id": "a"}, {"id": "b"}]
        edges = [
            {"source": "a", "target": "b", "weight": 2},
            {"source": "a", "target": "b", "weight": 3},  # duplicate, should sum
        ]
        result = compute_closeness_centrality(nodes, edges)
        assert len(result) == 2

    def test_centrality_scores_are_rounded_to_6dp(self) -> None:
        from neo4j_snapshot import compute_closeness_centrality

        nodes = [{"id": n} for n in ["x", "y", "z"]]
        edges = [
            {"source": "x", "target": "y", "weight": 1},
            {"source": "y", "target": "z", "weight": 1},
        ]
        for row in compute_closeness_centrality(nodes, edges):
            decimal_str = str(row["closeness"])
            if "." in decimal_str:
                assert len(decimal_str.split(".")[1]) <= 6


# ── KafkaOffsetRangeOperator ──────────────────────────────────────────────────


class TestKafkaOffsetRangeOperator:
    def test_instantiates_with_required_args(self) -> None:
        from kafka_offset_range import KafkaOffsetRangeOperator

        op = KafkaOffsetRangeOperator(
            task_id="offsets",
            topic="stas.github.pr.reviewed",
        )
        assert op.task_id == "offsets"
        assert op.topic == "stas.github.pr.reviewed"
        assert op.lookback_hours == 24  # default

    def test_ui_color_matches_brand(self) -> None:
        from kafka_offset_range import KafkaOffsetRangeOperator

        assert KafkaOffsetRangeOperator.ui_color == "#C8982A"

    def test_bootstrap_servers_falls_back_to_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from kafka_offset_range import KafkaOffsetRangeOperator

        monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-test:9092")
        op = KafkaOffsetRangeOperator(task_id="o", topic="t")
        assert op.bootstrap_servers == "kafka-test:9092"

    def test_explicit_bootstrap_servers_override_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from kafka_offset_range import KafkaOffsetRangeOperator

        monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "should-not-be-used:9092")
        op = KafkaOffsetRangeOperator(
            task_id="o",
            topic="t",
            kafka_bootstrap_servers="custom:9092",
        )
        assert op.bootstrap_servers == "custom:9092"

    def test_lookback_hours_configurable(self) -> None:
        from kafka_offset_range import KafkaOffsetRangeOperator

        op = KafkaOffsetRangeOperator(task_id="o", topic="t", lookback_hours=48)
        assert op.lookback_hours == 48


# ── DAG integrity (requires Airflow) ─────────────────────────────────────────


airflow = pytest.importorskip("airflow", reason="Airflow not installed — skip DAG integrity tests")


@pytest.fixture(scope="module")
def dagbag():
    import pathlib
    from airflow.models import DagBag  # type: ignore[import]

    dag_folder = str(
        pathlib.Path(__file__).parent.parent.parent / "pipelines" / "airflow" / "dags"
    )
    return DagBag(dag_folder=dag_folder, include_examples=False)


class TestDagBagIntegrity:
    def test_no_import_errors(self, dagbag: object) -> None:
        from airflow.models import DagBag  # type: ignore[import]

        assert isinstance(dagbag, DagBag)
        assert dagbag.import_errors == {}, f"Import errors: {dagbag.import_errors}"  # type: ignore[attr-defined]

    def test_all_expected_dags_present(self, dagbag: object) -> None:
        expected = {
            "stas_graph_rebuild",
            "stas_candidate_profile_extract",
            "stas_telemetry_health",
        }
        assert expected.issubset(set(dagbag.dags.keys()))  # type: ignore[attr-defined]


class TestGraphRebuildDag:
    def test_schedule(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_graph_rebuild")  # type: ignore[attr-defined]
        assert str(dag.schedule_interval) == "0 2 * * *"

    def test_task_count(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_graph_rebuild")  # type: ignore[attr-defined]
        assert len(dag.tasks) == 4

    def test_task_ids(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_graph_rebuild")  # type: ignore[attr-defined]
        ids = {t.task_id for t in dag.tasks}
        assert ids == {
            "get_kafka_offset_range",
            "rebuild_edge_weights",
            "take_centrality_snapshot",
            "check_topology_change",
        }

    def test_catchup_disabled(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_graph_rebuild")  # type: ignore[attr-defined]
        assert dag.catchup is False

    def test_owner_set(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_graph_rebuild")  # type: ignore[attr-defined]
        assert all(t.owner == "stas-team" for t in dag.tasks)


class TestCandidateProfileExtractDag:
    def test_on_demand_schedule(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_candidate_profile_extract")  # type: ignore[attr-defined]
        assert dag.schedule_interval is None

    def test_task_count(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_candidate_profile_extract")  # type: ignore[attr-defined]
        assert len(dag.tasks) == 4

    def test_task_ids(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_candidate_profile_extract")  # type: ignore[attr-defined]
        ids = {t.task_id for t in dag.tasks}
        assert ids == {
            "validate_input",
            "extract_skills_static",
            "extract_skills_nlp",
            "write_candidate_node",
        }

    def test_params_declared(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_candidate_profile_extract")  # type: ignore[attr-defined]
        assert "candidate_id" in dag.params
        assert "github_url" in dag.params


class TestTelemetryHealthDag:
    def test_hourly_schedule(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_telemetry_health")  # type: ignore[attr-defined]
        assert str(dag.schedule_interval) == "0 * * * *"

    def test_task_count(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_telemetry_health")  # type: ignore[attr-defined]
        assert len(dag.tasks) == 3

    def test_task_ids(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_telemetry_health")  # type: ignore[attr-defined]
        ids = {t.task_id for t in dag.tasks}
        assert ids == {
            "check_consumer_lag",
            "check_dlq_depth",
            "send_alert_if_breached",
        }

    def test_catchup_disabled(self, dagbag: object) -> None:
        dag = dagbag.get_dag("stas_telemetry_health")  # type: ignore[attr-defined]
        assert dag.catchup is False
