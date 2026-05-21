"""Pydantic v2 models for graph entities.

These are the canonical data shapes that cross service boundaries.
No raw Neo4j records should leave graph_service.py — everything is
converted to one of these models first.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

Seniority = Literal["junior", "mid", "senior", "staff"]
RelationshipType = Literal[
    "REVIEWS_PR_OF",
    "RESOLVES_DOUBT_FOR",
    "BLOCKS_TICKET_OF",
    "PAIR_PROGRAMS_WITH",
    "SHARES_DOMAIN_WITH",
]


class EngineerNode(BaseModel):
    id: str
    name: str
    skills: list[str]
    seniority: Seniority
    team: str


class CandidateNode(BaseModel):
    id: str
    name: str
    skills: list[str]
    github_url: str = ""
    collaboration_vector: list[float] = Field(default_factory=list)


class GraphEdge(BaseModel):
    source_id: str
    target_id: str
    relationship: RelationshipType
    weight: float


class GraphSnapshot(BaseModel):
    team_id: str
    snapshot_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    captured_at: datetime = Field(default_factory=datetime.utcnow)
    nodes: list[EngineerNode]
    edges: list[GraphEdge]

    @property
    def node_count(self) -> int:
        return len(self.nodes)

    @property
    def edge_count(self) -> int:
        return len(self.edges)


class CentralityScore(BaseModel):
    engineer_id: str
    closeness: float
    betweenness: float
    degree: int


class PathResult(BaseModel):
    from_id: str
    to_id: str
    distance: int
    path: list[str]  # ordered sequence of node IDs


class CandidateInsert(BaseModel):
    id: str = Field(default_factory=lambda: f"cand_{uuid.uuid4().hex[:8]}")
    name: str
    skills: list[str]
    github_url: str = ""
    collaboration_vector: list[float] = Field(default_factory=list)
    team_id: str

    def model_post_init(self, __context: object) -> None:
        if not self.id:
            self.id = f"cand_{uuid.uuid4().hex[:8]}"


# ── NLP agent output models ───────────────────────────────────────────────────

Proficiency = Literal["beginner", "intermediate", "advanced", "expert"]
GraphPosition = Literal[
    "knowledge hub",
    "cross-team connector",
    "domain specialist",
    "emerging contributor",
    "generalist",
]


class SkillWithProficiency(BaseModel):
    skill: str
    proficiency: Proficiency
    evidence: str  # one sentence observed from the repo


class CollaborationVector(BaseModel):
    """5-dimension collaboration style vector; each value in [0, 1].

    Dimensions:
      async_preference    — prefers written/async communication
      pr_review_depth     — depth and thoroughness of PR reviews
      documentation_habit — proactively writes docs and READMEs
      pairing_affinity    — enjoys pair/mob programming sessions
      mentoring_tendency  — provides detailed feedback to junior engineers
    """

    async_preference: Annotated[float, Field(ge=0.0, le=1.0)]
    pr_review_depth: Annotated[float, Field(ge=0.0, le=1.0)]
    documentation_habit: Annotated[float, Field(ge=0.0, le=1.0)]
    pairing_affinity: Annotated[float, Field(ge=0.0, le=1.0)]
    mentoring_tendency: Annotated[float, Field(ge=0.0, le=1.0)]

    def as_list(self) -> list[float]:
        return [
            self.async_preference,
            self.pr_review_depth,
            self.documentation_habit,
            self.pairing_affinity,
            self.mentoring_tendency,
        ]


class CandidateProfile(BaseModel):
    """Enriched candidate profile produced by the NLP agent (Sprint 5)."""

    candidate_id: str
    github_url: str
    skills: list[SkillWithProficiency]
    collaboration_vector: CollaborationVector
    domain_expertise: list[str]
    graph_position_estimate: GraphPosition
    extraction_summary: str
    extracted_at: datetime = Field(default_factory=datetime.utcnow)
    transcript_hash: str | None = None

    def to_candidate_insert(self, name: str = "", team_id: str = "") -> CandidateInsert:
        """Convert to CandidateInsert for graph storage (strips proficiency detail)."""
        return CandidateInsert(
            id=self.candidate_id,
            name=name,
            skills=[s.skill for s in self.skills],
            github_url=self.github_url,
            collaboration_vector=self.collaboration_vector.as_list(),
            team_id=team_id,
        )
