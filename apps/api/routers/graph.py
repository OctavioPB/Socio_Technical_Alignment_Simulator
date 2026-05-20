"""FastAPI /graph router.

All graph read/write operations go through GraphService — no raw Cypher here.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from neo4j import AsyncDriver

from apps.api.models.graph_models import (
    CandidateInsert,
    CentralityScore,
    GraphSnapshot,
    PathResult,
)
from apps.api.services.graph_service import GraphService

router = APIRouter(prefix="/graph", tags=["graph"])


def _get_driver(request: Request) -> AsyncDriver:
    return request.app.state.neo4j_driver  # type: ignore[no-any-return]


def _get_service(driver: AsyncDriver = Depends(_get_driver)) -> GraphService:
    return GraphService(driver)


# ─── Team graph ───────────────────────────────────────────────────────────────


@router.get(
    "/teams",
    response_model=list[str],
    summary="List all team identifiers",
)
async def list_teams(
    service: GraphService = Depends(_get_service),
) -> list[str]:
    """Return a sorted list of all team IDs that have engineers in the graph."""
    return await service.list_teams()


@router.get(
    "/teams/{team_id}",
    response_model=GraphSnapshot,
    summary="Get team graph snapshot",
)
async def get_team_graph(
    team_id: str,
    service: GraphService = Depends(_get_service),
) -> GraphSnapshot:
    """Return the full adjacency snapshot for a team: nodes, edges, weights."""
    snapshot = await service.get_team_graph(team_id)
    if not snapshot.nodes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team '{team_id}' not found or has no engineers.",
        )
    return snapshot


# ─── Centrality metrics ───────────────────────────────────────────────────────


@router.get(
    "/metrics/{team_id}",
    response_model=list[CentralityScore],
    summary="Get centrality scores for a team",
)
async def get_team_metrics(
    team_id: str,
    service: GraphService = Depends(_get_service),
) -> list[CentralityScore]:
    """Closeness + betweenness centrality for every engineer in the team.

    Uses NetworkX for graphs ≤ SIMULATION_GDS_THRESHOLD nodes,
    Neo4j GDS for larger graphs.
    """
    scores = await service.get_centrality_scores(team_id)
    if not scores:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team '{team_id}' not found or has no engineers.",
        )
    return scores


# ─── Shortest paths ───────────────────────────────────────────────────────────


@router.get(
    "/paths/{from_id}/{to_id}",
    response_model=list[PathResult],
    summary="Shortest path between two engineers",
)
async def get_paths(
    from_id: str,
    to_id: str,
    service: GraphService = Depends(_get_service),
) -> list[PathResult]:
    """Geodesic shortest path between two engineers across all relationship types."""
    paths = await service.get_shortest_paths(from_id, to_id)
    if not paths:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No path found between '{from_id}' and '{to_id}'.",
        )
    return paths


# ─── Candidate simulation support ─────────────────────────────────────────────


@router.post(
    "/candidates",
    response_model=dict[str, str],
    status_code=status.HTTP_201_CREATED,
    summary="Insert temporary candidate node for simulation",
)
async def insert_candidate(
    candidate: CandidateInsert,
    service: GraphService = Depends(_get_service),
) -> dict[str, str]:
    """Insert a candidate node and project SHARES_DOMAIN_WITH edges.

    The node is temporary (is_temporary=true) and must be cleaned up
    after simulation via DELETE /graph/candidates/{candidate_id}.
    """
    candidate_id = await service.insert_candidate_node(candidate)
    return {"candidate_id": candidate_id}


@router.delete(
    "/candidates/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove temporary candidate node",
)
async def delete_candidate(
    candidate_id: str,
    service: GraphService = Depends(_get_service),
) -> None:
    """Remove a temporary candidate node and all its projected edges."""
    await service.delete_candidate_node(candidate_id)
