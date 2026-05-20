/**
 * Graph API client.
 * All fetch calls go through here — never fetch() directly in components.
 * Works in both Server Component (direct API URL) and Client Component (same URL) contexts.
 */

import type {
  CentralityScore,
  GraphSnapshot,
  SnapshotMeta,
} from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`)
  }

  return res.json() as Promise<T>
}

// ── Graph snapshots ───────────────────────────────────────────────────────────

/**
 * Fetch the current (latest) graph snapshot for a team.
 * Called from Server Components — `cache: "no-store"` ensures fresh data.
 */
export async function getTeamGraph(
  teamId: string,
  snapshotId?: string,
): Promise<GraphSnapshot> {
  const path = snapshotId
    ? `/graph/teams/${teamId}/snapshot/${snapshotId}`
    : `/graph/teams/${teamId}/snapshot`
  return apiFetch<GraphSnapshot>(path, { cache: "no-store" })
}

/**
 * List all available snapshots for a team (for the snapshot selector).
 */
export async function listSnapshots(teamId: string): Promise<SnapshotMeta[]> {
  return apiFetch<SnapshotMeta[]>(`/graph/teams/${teamId}/snapshots`, {
    next: { revalidate: 60 },
  })
}

/**
 * Fetch centrality scores for all engineers in a snapshot.
 */
export async function getCentralityScores(
  teamId: string,
  snapshotId: string,
): Promise<CentralityScore[]> {
  return apiFetch<CentralityScore[]>(
    `/graph/teams/${teamId}/snapshot/${snapshotId}/centrality`,
    { next: { revalidate: 300 } },
  )
}

/**
 * List all team IDs available in the system.
 */
export async function listTeams(): Promise<string[]> {
  return apiFetch<string[]>("/graph/teams", { next: { revalidate: 60 } })
}
