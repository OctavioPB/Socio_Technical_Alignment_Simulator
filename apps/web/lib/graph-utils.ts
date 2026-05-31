/**
 * Graph rendering utilities — team colours, node sizing, edge styling.
 * All colour values come from BRAND.md data visualisation series.
 */

// BRAND.md: data visualisation colour series (use in order for multi-series)
const TEAM_COLORS = [
  "#003366", // corporate blue
  "#27B97C", // green
  "#7C4DBD", // purple
  "#F07020", // orange
  "#E05080", // pink
] as const

/**
 * Deterministic team → colour mapping.
 * Same team name always maps to the same colour within a session.
 */
export function getTeamColor(team: string, allTeams: string[]): string {
  const idx = allTeams.indexOf(team)
  return TEAM_COLORS[idx % TEAM_COLORS.length] ?? "#003366"
}

/**
 * Betweenness centrality → node radius (pixels).
 * Range: [NODE_RADIUS_MIN, NODE_RADIUS_MAX]
 */
const NODE_RADIUS_MIN = 7
const NODE_RADIUS_MAX = 22

export function nodeRadius(betweenness: number, maxBetweenness: number): number {
  if (maxBetweenness === 0) return NODE_RADIUS_MIN
  const normalised = Math.min(1, betweenness / maxBetweenness)
  return NODE_RADIUS_MIN + normalised * (NODE_RADIUS_MAX - NODE_RADIUS_MIN)
}

/**
 * Edge weight → opacity [0.22, 0.85].
 * Log-scale so light edges stay visible while heavy edges dominate.
 */
export function edgeOpacity(weight: number, maxWeight: number): number {
  if (maxWeight === 0) return 0.25
  const logW = Math.log1p(weight)
  const logMax = Math.log1p(maxWeight)
  return 0.22 + (logW / logMax) * 0.63
}

/**
 * Edge weight → stroke width [1, 4].
 */
export function edgeWidth(weight: number, maxWeight: number): number {
  if (maxWeight === 0) return 1
  return 1 + (weight / maxWeight) * 3
}

/**
 * Relationship type → colour + display label.
 * Each collaboration channel gets a distinct colour so the graph immediately
 * communicates what kind of connection two engineers have.
 */
export const RELATIONSHIP_META: Record<string, { color: string; label: string }> = {
  REVIEWS_PR_OF:      { color: "#003366", label: "PR Review" },
  RESOLVES_DOUBT_FOR: { color: "#27B97C", label: "Knowledge Help" },
  PAIR_PROGRAMS_WITH: { color: "#C8982A", label: "Pair Programming" },
  BLOCKS_TICKET_OF:   { color: "#E03448", label: "Ticket Block" },
  SHARES_DOMAIN_WITH: { color: "#7C4DBD", label: "Shared Domain" },
}

export function edgeColor(relationship: string): string {
  return RELATIONSHIP_META[relationship]?.color ?? "#003366"
}

/**
 * Extract the unique, sorted list of team names from a node list.
 */
export function extractTeams(nodes: Array<{ team: string }>): string[] {
  return [...new Set(nodes.map((n) => n.team))].sort()
}

/**
 * Find the maximum betweenness centrality across all nodes.
 */
export function maxBetweenness(nodes: Array<{ betweenness: number }>): number {
  return nodes.reduce((m, n) => Math.max(m, n.betweenness), 0)
}

/**
 * Find the maximum edge weight across all links.
 */
export function maxEdgeWeight(links: Array<{ weight: number }>): number {
  return links.reduce((m, l) => Math.max(m, l.weight), 0)
}

/**
 * Format ISO-8601 timestamp for display in the snapshot selector.
 */
export function formatSnapshotDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
