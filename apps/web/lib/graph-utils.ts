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
const NODE_RADIUS_MIN = 5
const NODE_RADIUS_MAX = 18

export function nodeRadius(betweenness: number, maxBetweenness: number): number {
  if (maxBetweenness === 0) return NODE_RADIUS_MIN
  const normalised = Math.min(1, betweenness / maxBetweenness)
  return NODE_RADIUS_MIN + normalised * (NODE_RADIUS_MAX - NODE_RADIUS_MIN)
}

/**
 * Edge weight → opacity [0.12, 0.80].
 * Log-scale so low-weight edges remain visible while high-weight edges stand out.
 */
export function edgeOpacity(weight: number, maxWeight: number): number {
  if (maxWeight === 0) return 0.15
  const logW = Math.log1p(weight)
  const logMax = Math.log1p(maxWeight)
  return 0.12 + (logW / logMax) * 0.68
}

/**
 * Edge weight → stroke width [0.5, 3].
 */
export function edgeWidth(weight: number, maxWeight: number): number {
  if (maxWeight === 0) return 0.5
  return 0.5 + (weight / maxWeight) * 2.5
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
