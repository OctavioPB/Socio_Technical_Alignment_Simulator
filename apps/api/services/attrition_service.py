"""Attrition impact and team risk analysis — deterministic NetworkX computation.

No Monte Carlo: removal impact is a structural fact about the graph, not a
probabilistic prediction.  Poisson weight variance matters for integration
forecasting (candidate simulation); it is not relevant when asking "what
happens to the graph topology if this edge set permanently disappears."
"""

from __future__ import annotations

import asyncio
import logging

import networkx as nx
import numpy as np
from neo4j import AsyncDriver

from apps.api.models.graph_models import (
    AttritionResult,
    EngineerImpact,
    EngineerRisk,
    GraphSnapshot,
    TeamRisk,
)
from apps.api.services.graph_service import GraphService

logger = logging.getLogger(__name__)

_BUS_FACTOR_THRESHOLD = 15.0   # % drop that qualifies an engineer as a single-point-of-failure


# ── Graph construction ─────────────────────────────────────────────────────────


def _to_nx(snapshot: GraphSnapshot) -> nx.Graph:
    G: nx.Graph = nx.Graph()
    for node in snapshot.nodes:
        G.add_node(node.id, name=node.name, skills=node.skills, seniority=node.seniority)
    for edge in snapshot.edges:
        if G.has_edge(edge.source_id, edge.target_id):
            G[edge.source_id][edge.target_id]["weight"] += float(edge.weight)
        else:
            G.add_edge(edge.source_id, edge.target_id, weight=float(edge.weight))
    return G


# ── Attrition impact ──────────────────────────────────────────────────────────


def _compute_attrition(snapshot: GraphSnapshot, engineer_id: str) -> AttritionResult:
    G = _to_nx(snapshot)

    if engineer_id not in G:
        raise ValueError(f"Engineer '{engineer_id}' not found in team graph")

    engineer_node = next((n for n in snapshot.nodes if n.id == engineer_id), None)
    if engineer_node is None:
        raise ValueError(f"Engineer '{engineer_id}' not found in snapshot nodes")

    # Baseline
    baseline_cc = nx.closeness_centrality(G)
    baseline_bc = nx.betweenness_centrality(G, normalized=True, weight="weight")
    baseline_components = nx.number_connected_components(G)

    peers = [n for n in snapshot.nodes if n.id != engineer_id]
    baseline_avg = float(np.mean([baseline_cc[n.id] for n in peers])) if peers else 0.0

    # Post-removal
    G_after = G.copy()
    G_after.remove_node(engineer_id)

    post_cc = nx.closeness_centrality(G_after)
    post_bc = nx.betweenness_centrality(G_after, normalized=True, weight="weight")
    post_components = nx.number_connected_components(G_after)

    post_avg = float(np.mean([post_cc.get(n.id, 0.0) for n in peers])) if peers else 0.0
    drop_pct = round(
        (baseline_avg - post_avg) / baseline_avg * 100 if baseline_avg > 0 else 0.0,
        2,
    )

    impacts: list[EngineerImpact] = []
    for eng in peers:
        before = baseline_cc.get(eng.id, 0.0)
        after = post_cc.get(eng.id, 0.0)
        delta_pct = round((before - after) / before * 100 if before > 0 else 0.0, 2)
        impacts.append(
            EngineerImpact(
                engineer_id=eng.id,
                name=eng.name,
                closeness_before=round(before, 6),
                closeness_after=round(after, 6),
                closeness_delta_pct=delta_pct,
                betweenness_before=round(baseline_bc.get(eng.id, 0.0), 6),
                betweenness_after=round(post_bc.get(eng.id, 0.0), 6),
            )
        )

    impacts.sort(key=lambda x: x.closeness_delta_pct, reverse=True)

    return AttritionResult(
        team_id=snapshot.team_id,
        removed_engineer_id=engineer_id,
        removed_engineer_name=engineer_node.name,
        removed_engineer_seniority=engineer_node.seniority,
        removed_engineer_skills=engineer_node.skills,
        baseline_avg_closeness=round(baseline_avg, 6),
        post_removal_avg_closeness=round(post_avg, 6),
        closeness_drop_pct=drop_pct,
        baseline_components=baseline_components,
        post_removal_components=post_components,
        graph_fragmented=post_components > baseline_components,
        engineer_impacts=impacts,
    )


async def run_attrition_analysis(
    driver: AsyncDriver,
    team_id: str,
    engineer_id: str,
) -> AttritionResult:
    graph_service = GraphService(driver)
    snapshot = await graph_service.get_team_graph(team_id)
    if not snapshot.nodes:
        raise ValueError(f"Team '{team_id}' not found or has no engineers")
    return await asyncio.to_thread(_compute_attrition, snapshot, engineer_id)


# ── Team risk / silo analysis ─────────────────────────────────────────────────


def _compute_team_risk(snapshot: GraphSnapshot) -> TeamRisk:
    G = _to_nx(snapshot)

    baseline_cc = nx.closeness_centrality(G)
    baseline_bc = nx.betweenness_centrality(G, normalized=True, weight="weight")
    baseline_avg = float(np.mean(list(baseline_cc.values()))) if baseline_cc else 0.0

    bw_values = list(baseline_bc.values())
    bw_mean = float(np.mean(bw_values)) if bw_values else 0.0
    bw_std = float(np.std(bw_values)) if len(bw_values) > 1 else 0.0
    critical_threshold = bw_mean + bw_std

    engineer_risks: list[EngineerRisk] = []
    for eng in snapshot.nodes:
        G_after = G.copy()
        G_after.remove_node(eng.id)

        if G_after.nodes:
            post_cc = nx.closeness_centrality(G_after)
            post_avg = float(np.mean(list(post_cc.values())))
        else:
            post_avg = 0.0

        impact_pct = round(
            (baseline_avg - post_avg) / baseline_avg * 100 if baseline_avg > 0 else 0.0,
            2,
        )
        engineer_risks.append(
            EngineerRisk(
                engineer_id=eng.id,
                name=eng.name,
                seniority=eng.seniority,
                skills=eng.skills,
                closeness=round(baseline_cc.get(eng.id, 0.0), 6),
                betweenness=round(baseline_bc.get(eng.id, 0.0), 6),
                degree=G.degree(eng.id),
                removal_impact_pct=impact_pct,
                is_critical_path=baseline_bc.get(eng.id, 0.0) > critical_threshold,
            )
        )

    engineer_risks.sort(key=lambda e: e.removal_impact_pct, reverse=True)

    bus_factor = sum(1 for e in engineer_risks if e.removal_impact_pct > _BUS_FACTOR_THRESHOLD)
    max_impact = engineer_risks[0].removal_impact_pct if engineer_risks else 0.0
    resilience = round(max(0.0, 1.0 - max_impact / 100.0), 4)

    return TeamRisk(
        team_id=snapshot.team_id,
        resilience_score=resilience,
        bus_factor=bus_factor,
        graph_density=round(nx.density(G), 6),
        engineer_count=len(snapshot.nodes),
        engineers=engineer_risks,
    )


async def run_team_risk_analysis(driver: AsyncDriver, team_id: str) -> TeamRisk:
    graph_service = GraphService(driver)
    snapshot = await graph_service.get_team_graph(team_id)
    if not snapshot.nodes:
        raise ValueError(f"Team '{team_id}' not found or has no engineers")
    return await asyncio.to_thread(_compute_team_risk, snapshot)
