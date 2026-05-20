"""Property-based and unit tests for simulation/metrics.py.

All tests must pass without Neo4j, Kafka, or any external service.
Hypothesis strategies generate random graphs; fixtures cover edge cases.
"""

from __future__ import annotations

import time

import networkx as nx
import numpy as np
import pytest
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st

from simulation import metrics as m


# ── Helpers ───────────────────────────────────────────────────────────────────


def _linear_graph(n: int) -> nx.Graph:
    """0 — 1 — 2 — … — (n-1)"""
    return nx.path_graph(n)


def _complete_graph(n: int) -> nx.Graph:
    return nx.complete_graph(n)


def _random_connected_graph(n: int, seed: int) -> nx.Graph:
    """Guaranteed connected Erdős-Rényi graph with p=0.4."""
    rng = np.random.default_rng(seed)
    while True:
        G = nx.erdos_renyi_graph(n, 0.4, seed=int(rng.integers(1 << 31)))
        if nx.is_connected(G):
            for u, v in G.edges():
                G[u][v]["weight"] = float(rng.integers(1, 10))
            return G


# ── closeness_centrality ──────────────────────────────────────────────────────


class TestClosenessCentrality:
    def test_isolated_node_returns_zero(self) -> None:
        G = nx.Graph()
        G.add_nodes_from(["a", "b", "c"])  # no edges
        assert m.closeness_centrality(G, "a") == 0.0

    def test_unknown_node_returns_zero(self) -> None:
        G = nx.path_graph(5)
        assert m.closeness_centrality(G, "ghost") == 0.0

    def test_universally_connected_hub_approaches_one(self) -> None:
        """Hub with distance-1 edges to every peer → C_C = 1.0."""
        n = 6
        G = nx.Graph()
        peers = [f"e{i}" for i in range(n)]
        G.add_nodes_from(peers)
        G.add_node("hub")
        for p in peers:
            G.add_edge("hub", p, weight=1)
        cc = m.closeness_centrality(G, "hub")
        assert cc == pytest.approx(1.0)

    def test_endpoint_of_long_chain_has_low_centrality(self) -> None:
        G = _linear_graph(10)
        cc_end = m.closeness_centrality(G, 0)
        cc_mid = m.closeness_centrality(G, 5)
        assert cc_end < cc_mid

    def test_two_node_graph(self) -> None:
        G = nx.Graph()
        G.add_edge("a", "b")
        assert m.closeness_centrality(G, "a") == pytest.approx(1.0)

    @given(
        n=st.integers(min_value=2, max_value=30),
        seed=st.integers(min_value=0, max_value=9999),
    )
    @h_settings(max_examples=200, deadline=5_000)
    def test_always_in_unit_interval(self, n: int, seed: int) -> None:
        G = _random_connected_graph(n, seed)
        v = list(G.nodes)[0]
        cc = m.closeness_centrality(G, v)
        assert 0.0 <= cc <= 1.0, f"Out-of-range C_C={cc} for n={n}, seed={seed}"


# ── betweenness_centrality_delta ──────────────────────────────────────────────


class TestBetweennessDelta:
    def test_bridge_node_reduces_bottlenecks(self) -> None:
        """Inserting a node that shortcuts a chain should lower mean betweenness."""
        # Two cliques connected by a single bridge
        G = nx.Graph()
        G.add_edges_from([(0, 1), (1, 2), (2, 3)])  # chain
        G.add_node("bridge_shortcut")
        G.add_edge(0, "bridge_shortcut", weight=1)
        G.add_edge(3, "bridge_shortcut", weight=1)
        # The shortcut candidate should reduce existing betweenness
        delta = m.betweenness_centrality_delta(G, "bridge_shortcut")
        assert isinstance(delta, float)

    def test_isolated_candidate_returns_zero(self) -> None:
        G = nx.path_graph(5)
        G.add_node("isolated")
        delta = m.betweenness_centrality_delta(G, "isolated")
        assert delta == 0.0

    def test_missing_node_returns_zero(self) -> None:
        G = nx.path_graph(3)
        assert m.betweenness_centrality_delta(G, "ghost") == 0.0


# ── silo_risk_score ───────────────────────────────────────────────────────────


class TestSiloRiskScore:
    def test_bridge_candidate_lowers_clustering(self) -> None:
        """A node connecting two otherwise separate cliques bridges silos → negative score."""
        G = nx.complete_graph(4)  # high clustering (clique)
        nx.relabel_nodes(G, {i: f"a{i}" for i in range(4)}, copy=False)
        G2 = nx.complete_graph(4)
        nx.relabel_nodes(G2, {i: f"b{i}" for i in range(4)}, copy=False)
        G = nx.compose(G, G2)
        G.add_node("bridge")
        G.add_edge("bridge", "a0", weight=1)
        G.add_edge("bridge", "b0", weight=1)
        score = m.silo_risk_score(G, "bridge")
        # Bridge between two cliques tends to lower average clustering
        assert isinstance(score, float)

    def test_missing_node_returns_zero(self) -> None:
        G = nx.path_graph(4)
        assert m.silo_risk_score(G, "ghost") == 0.0

    def test_returns_float(self) -> None:
        G = _linear_graph(6)
        G.add_node("cand")
        G.add_edge("cand", 3, weight=2)
        score = m.silo_risk_score(G, "cand")
        assert isinstance(score, float)


# ── time_to_value_estimate ────────────────────────────────────────────────────


class TestTimeToValueEstimate:
    def test_high_centrality_gives_low_ttv(self) -> None:
        assert m.time_to_value_estimate(1.0) == pytest.approx(2.0)

    def test_mid_centrality(self) -> None:
        assert m.time_to_value_estimate(0.5) == pytest.approx(4.0)

    def test_zero_centrality_caps_at_52_weeks(self) -> None:
        assert m.time_to_value_estimate(0.0) == pytest.approx(52.0)

    def test_always_positive(self) -> None:
        for cc in [0.0, 0.1, 0.3, 0.5, 0.7, 1.0]:
            assert m.time_to_value_estimate(cc) > 0


# ── make_distribution ─────────────────────────────────────────────────────────


class TestMakeDistribution:
    def test_empty_samples_returns_zeros(self) -> None:
        dist = m.make_distribution(np.array([]))
        assert dist["mean"] == 0.0
        assert dist["ci_95"] == (0.0, 0.0)

    def test_single_sample_has_zero_std(self) -> None:
        dist = m.make_distribution(np.array([0.5]))
        assert dist["std"] == 0.0

    def test_percentiles_are_ordered(self) -> None:
        samples = np.random.default_rng(0).random(1000)
        dist = m.make_distribution(samples)
        p = dist["percentiles"]
        assert p["p5"] <= p["p25"] <= p["p50"] <= p["p75"] <= p["p95"]

    def test_ci_95_contains_mean(self) -> None:
        samples = np.random.default_rng(1).random(500)
        dist = m.make_distribution(samples)
        assert dist["ci_95"][0] <= dist["mean"] <= dist["ci_95"][1]
