"""FastAPI /analysis router.

POST /analysis/attrition          — impact of removing one engineer
GET  /analysis/risk/{team_id}     — silo + bus-factor risk for a team
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from neo4j import AsyncDriver

from apps.api.models.graph_models import AttritionRequest, AttritionResult, TeamRisk
from apps.api.services.attrition_service import run_attrition_analysis, run_team_risk_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["analysis"])


def _get_driver(request: Request) -> AsyncDriver:
    return request.app.state.neo4j_driver  # type: ignore[no-any-return]


@router.post(
    "/attrition",
    response_model=AttritionResult,
    summary="Compute connectivity impact of removing an engineer",
)
async def attrition_impact(
    body: AttritionRequest,
    driver: AsyncDriver = Depends(_get_driver),
) -> AttritionResult:
    """Deterministic analysis of how team connectivity degrades if one engineer leaves.

    Returns per-engineer closeness delta and aggregate team metrics
    (avg closeness before/after, graph fragmentation).
    """
    try:
        return await run_attrition_analysis(driver, body.team_id, body.engineer_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Attrition analysis failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {exc}",
        )


@router.get(
    "/risk/{team_id}",
    response_model=TeamRisk,
    summary="Silo and bus-factor risk analysis for a team",
)
async def team_risk(
    team_id: str,
    driver: AsyncDriver = Depends(_get_driver),
) -> TeamRisk:
    """Compute removal impact for every engineer in a team.

    Returns a resilience score, bus factor count, and per-engineer risk
    ranked by how much team connectivity drops if that engineer leaves.
    Engineers with betweenness > mean + 1σ are flagged as critical-path.
    """
    try:
        return await run_team_risk_analysis(driver, team_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Team risk analysis failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Risk analysis failed: {exc}",
        )
