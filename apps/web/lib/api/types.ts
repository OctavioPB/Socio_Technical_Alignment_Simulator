/**
 * TypeScript interfaces mirroring the backend Pydantic models.
 * These are the canonical shapes for all data crossing the API boundary.
 * Never pass raw fetch response objects into components — always cast to these types.
 */

export type Seniority = "junior" | "mid" | "senior" | "staff"

export type RelationshipType =
  | "REVIEWS_PR_OF"
  | "RESOLVES_DOUBT_FOR"
  | "BLOCKS_TICKET_OF"
  | "PAIR_PROGRAMS_WITH"
  | "SHARES_DOMAIN_WITH"

export type GraphPosition =
  | "knowledge hub"
  | "cross-team connector"
  | "domain specialist"
  | "emerging contributor"
  | "generalist"

// ── Graph entities ────────────────────────────────────────────────────────────

export interface EngineerNode {
  id: string
  name: string
  skills: string[]
  seniority: Seniority
  team: string
}

export interface GraphEdge {
  source_id: string
  target_id: string
  relationship: RelationshipType
  weight: number
}

export interface GraphSnapshot {
  team_id: string
  snapshot_id: string
  captured_at: string  // ISO-8601
  nodes: EngineerNode[]
  edges: GraphEdge[]
}

export interface CentralityScore {
  engineer_id: string
  closeness: number
  betweenness: number
  degree: number
}

export interface SnapshotMeta {
  snapshot_id: string
  team_id: string
  captured_at: string
  node_count: number
  edge_count: number
}

// ── Candidate ─────────────────────────────────────────────────────────────────

export interface SkillWithProficiency {
  skill: string
  proficiency: "beginner" | "intermediate" | "advanced" | "expert"
  evidence: string
}

export interface CollaborationVector {
  async_preference: number
  pr_review_depth: number
  documentation_habit: number
  pairing_affinity: number
  mentoring_tendency: number
}

export interface CandidateProfile {
  candidate_id: string
  github_url: string
  skills: SkillWithProficiency[]
  collaboration_vector: CollaborationVector
  domain_expertise: string[]
  graph_position_estimate: GraphPosition
  extraction_summary: string
  extracted_at: string
}

// ── Simulation ────────────────────────────────────────────────────────────────

export interface MetricDistribution {
  mean: number
  std: number
  ci_95: [number, number]
  percentiles: Record<string, number>  // p5, p25, p50, p75, p95
}

export interface SkillGapMatch {
  skill: string
  engineer_count_with_skill: number
  candidate_has_skill: boolean
  coverage_delta: number
}

export interface SimulationResult {
  result_id: string
  candidate_id: string
  snapshot_id: string
  n_iterations: number
  seed: number
  closeness_centrality: MetricDistribution
  betweenness_delta: MetricDistribution
  silo_risk_score: MetricDistribution
  time_to_value_weeks: MetricDistribution
  knowledge_gap_coverage: SkillGapMatch[]
  topology_change_map: Record<string, number>
}

// ── react-force-graph-2d graph data shapes ────────────────────────────────────

export interface ForceGraphNode extends EngineerNode {
  // Added by our transformation layer
  closeness: number
  betweenness: number
  // Added at runtime by d3-force (do not set manually)
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

export interface ForceGraphLink {
  source: string | ForceGraphNode
  target: string | ForceGraphNode
  weight: number
  relationship: RelationshipType
}

export interface ForceGraphData {
  nodes: ForceGraphNode[]
  links: ForceGraphLink[]
}
