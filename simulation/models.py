"""Pydantic v2 models for the Monte Carlo simulation layer.

These are the canonical shapes that cross the simulation ↔ API boundary.
No raw numpy arrays or NetworkX objects leave simulation/.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, Field

from apps.api.models.graph_models import CandidateInsert


class MetricDistribution(BaseModel):
    """Statistical summary of a single metric across all simulation iterations."""

    mean: float
    std: float
    ci_95: tuple[float, float]  # (lower, upper) 95% confidence interval
    percentiles: dict[str, float]  # keys: "p5", "p25", "p50", "p75", "p95"


class SkillGapMatch(BaseModel):
    """How much a single skill's team coverage changes with the candidate inserted."""

    skill: str
    engineer_count_with_skill: int
    candidate_has_skill: bool
    coverage_delta: float  # fraction of team with skill after − before insertion


class SimulationResult(BaseModel):
    """Full output of a Monte Carlo simulation run."""

    result_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    snapshot_id: str
    n_iterations: int
    seed: int

    # ── Metric distributions (one per simulated quantity) ────────────────────
    closeness_centrality: MetricDistribution
    betweenness_delta: MetricDistribution
    silo_risk_score: MetricDistribution
    time_to_value_weeks: MetricDistribution

    # ── Deterministic skill analysis ─────────────────────────────────────────
    knowledge_gap_coverage: list[SkillGapMatch]

    # ── Edge-level topology prediction ───────────────────────────────────────
    # key: "source_id->target_id", value: predicted mean weight change
    topology_change_map: dict[str, float]


class SimulationRequest(BaseModel):
    """Payload for POST /simulation/run and /simulation/run-stream."""

    candidate: CandidateInsert
    team_id: str
    n_iterations: Annotated[int, Field(ge=1, le=10_000)] = 1_000
    seed: int = 42
