"""Graph-theoretic metrics for the STAS simulation engine.

All functions are pure — they take a NetworkX graph and return a scalar.
No I/O, no side effects, no global state.  This makes them trivially
testable with hypothesis and safe to call in parallel threads.

Closeness centrality formula (from docs/math/closeness_centrality.tex):

    C_C(v) = (n_r - 1)² / ((n - 1) · Σ d(u, v))

where n = |V|, n_r = number of nodes reachable from v (including v),
and the sum is over all u ≠ v reachable from v.

The (n_r - 1)² / (n - 1) factor is the Wasserman-Faust normalisation that
ensures disconnected graphs never produce a score > 1.0 and that an
isolated node → 0.0 exactly.
"""

from __future__ import annotations

import networkx as nx
import numpy as np


# ── Closeness centrality ──────────────────────────────────────────────────────


def closeness_centrality(G: nx.Graph, v: object) -> float:
    """Compute C_C(v) per the STAS domain model.

    Returns a value in [0, 1]:
      - 1.0 for a universally connected hub (distance 1 to all peers)
      - 0.0 for an isolated node (no reachable peers)
    """
    if v not in G:
        return 0.0

    paths = nx.single_source_shortest_path_length(G, v)
    reachable = {u: d for u, d in paths.items() if u != v and d > 0}

    if not reachable:
        return 0.0

    n = len(G.nodes)
    n_r = len(reachable) + 1  # include v itself

    total_distance = sum(reachable.values())
    if total_distance == 0:
        return 0.0

    # Wasserman-Faust normalisation for disconnected components
    raw = n_r / total_distance
    norm = (n_r - 1) / (n - 1) if n > 1 else 0.0
    return float(raw * norm)


# ── Betweenness centrality delta ──────────────────────────────────────────────


def betweenness_centrality_delta(G_with: nx.Graph, v: object) -> float:
    """Change in mean betweenness centrality of existing nodes after v is inserted.

    A negative delta means v reduces existing bottlenecks (knowledge flows
    more freely).  A positive delta means v is itself a new bottleneck or
    routes traffic away from previously short paths.

    Computed on the full graph (G_with) by comparing betweenness of nodes
    other than v against a baseline computed on G_with minus v.
    """
    if v not in G_with:
        return 0.0

    G_without = G_with.copy()
    G_without.remove_node(v)

    if not G_without.nodes:
        return 0.0

    bc_without = nx.betweenness_centrality(G_without, normalized=True, weight="weight")
    bc_with_all = nx.betweenness_centrality(G_with, normalized=True, weight="weight")

    # Compare only for nodes that existed before insertion
    peers = list(G_without.nodes)
    before = np.mean([bc_without[u] for u in peers])
    after = np.mean([bc_with_all[u] for u in peers])

    return float(after - before)


# ── Silo risk score ───────────────────────────────────────────────────────────


def silo_risk_score(G_with: nx.Graph, v: object) -> float:
    """Change in average clustering coefficient after inserting v.

    Clustering coefficient measures how tightly clustered each node's
    neighbours are.  Adding a bridge node that spans clusters lowers the
    average (good — breaks down silos).  Adding a node that only connects
    to one existing cluster raises it (bad — reinforces the silo).

    Returned value:
      positive → candidate reinforces silos (risk)
      negative → candidate bridges clusters (benefit)
      zero      → no effect on clustering topology
    """
    if v not in G_with:
        return 0.0

    G_without = G_with.copy()
    G_without.remove_node(v)

    if len(G_without.nodes) < 2:
        return 0.0

    cc_before = nx.average_clustering(G_without)
    cc_after = nx.average_clustering(G_with)

    return float(cc_after - cc_before)


# ── Time-to-value estimate ────────────────────────────────────────────────────


def time_to_value_estimate(mean_closeness: float) -> float:
    """Heuristic: weeks before candidate becomes a productive knowledge node.

    Calibrated so that:
      C_C = 1.0 → 2 weeks  (immediate integration into the network)
      C_C = 0.5 → 4 weeks  (moderate integration path)
      C_C = 0.1 → 20 weeks (high isolation risk)
      C_C = 0.0 → capped at 52 weeks (effectively never integrates)

    Formula: ttv = 2.0 / max(C_C, 1/26)
    The 1/26 floor prevents division by zero and caps output at 52 weeks.
    """
    clamped = max(float(mean_closeness), 1.0 / 26.0)
    return round(2.0 / clamped, 1)


# ── Distribution helpers ──────────────────────────────────────────────────────


def make_distribution(samples: np.ndarray) -> dict:
    """Convert a 1-D numpy array of samples into a MetricDistribution dict."""
    if len(samples) == 0:
        zero_dist: dict = {
            "mean": 0.0,
            "std": 0.0,
            "ci_95": (0.0, 0.0),
            "percentiles": {"p5": 0.0, "p25": 0.0, "p50": 0.0, "p75": 0.0, "p95": 0.0},
        }
        return zero_dist

    mean = float(np.mean(samples))
    std = float(np.std(samples, ddof=1) if len(samples) > 1 else 0.0)
    n = len(samples)
    # 95% CI via normal approximation (valid for n ≥ 30)
    z = 1.96
    margin = z * std / (n**0.5)

    return {
        "mean": round(mean, 6),
        "std": round(std, 6),
        "ci_95": (round(mean - margin, 6), round(mean + margin, 6)),
        "percentiles": {
            "p5": round(float(np.percentile(samples, 5)), 6),
            "p25": round(float(np.percentile(samples, 25)), 6),
            "p50": round(float(np.percentile(samples, 50)), 6),
            "p75": round(float(np.percentile(samples, 75)), 6),
            "p95": round(float(np.percentile(samples, 95)), 6),
        },
    }
