"use client"

import { create } from "zustand"
import type {
  ForceGraphData,
  ForceGraphLink,
  ForceGraphNode,
  GraphSnapshot,
  RelationshipType,
  SnapshotMeta,
} from "@/lib/api/types"

// Candidate nodes carry extra fields for canvas rendering
export interface CandidateForceNode extends ForceGraphNode {
  isCandidate: true
  slot: "A" | "B"
}

// Predicted edges carry an extra flag for pulse animation
export interface PredictedForceLink extends ForceGraphLink {
  isPredicted: true
  slot: "A" | "B"
}

interface GraphState {
  // Base graph (from server snapshot)
  graphData: ForceGraphData | null
  snapshot: GraphSnapshot | null
  snapshots: SnapshotMeta[]
  activeSnapshotId: string | null

  // Candidate nodes overlaid on top of base graph (one per slot)
  candidateNodes: { A: CandidateForceNode | null; B: CandidateForceNode | null }

  // Interaction state
  hoveredNodeId: string | null
  selectedNodeId: string | null

  // Actions — base graph
  setSnapshot: (snapshot: GraphSnapshot, centrality?: Record<string, { closeness: number; betweenness: number }>) => void
  setSnapshots: (snapshots: SnapshotMeta[]) => void
  setActiveSnapshotId: (id: string) => void
  setHoveredNodeId: (id: string | null) => void
  setSelectedNodeId: (id: string | null) => void
  getSelectedNode: () => ForceGraphNode | null

  // Actions — candidate overlay
  setCandidateNode: (slot: "A" | "B", node: CandidateForceNode | null) => void
  clearCandidateNode: (slot: "A" | "B") => void
  clearAllCandidates: () => void
}

function buildForceGraphData(
  snapshot: GraphSnapshot,
  centrality: Record<string, { closeness: number; betweenness: number }> = {},
): ForceGraphData {
  return {
    nodes: snapshot.nodes.map((n) => ({
      ...n,
      closeness: centrality[n.id]?.closeness ?? 0,
      betweenness: centrality[n.id]?.betweenness ?? 0,
    })),
    links: snapshot.edges.map((e) => ({
      source: e.source_id,
      target: e.target_id,
      weight: e.weight,
      relationship: e.relationship,
    })),
  }
}

/**
 * Compute predicted edges for a candidate node based on skill overlap with
 * each engineer in the base graph. Used only for canvas rendering — the actual
 * simulation is authoritative.
 */
export function computePredictedEdges(
  candidate: CandidateForceNode,
  baseNodes: ForceGraphNode[],
): PredictedForceLink[] {
  const skills = new Set(candidate.skills)
  const links: PredictedForceLink[] = []
  for (const engineer of baseNodes) {
    const overlap = engineer.skills.filter((s) => skills.has(s)).length
    if (overlap > 0) {
      links.push({
        source: candidate.id,
        target: engineer.id,
        weight: overlap,
        relationship: "SHARES_DOMAIN_WITH" as RelationshipType,
        isPredicted: true,
        slot: candidate.slot,
      })
    }
  }
  return links
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graphData: null,
  snapshot: null,
  snapshots: [],
  activeSnapshotId: null,
  candidateNodes: { A: null, B: null },
  hoveredNodeId: null,
  selectedNodeId: null,

  setSnapshot(snapshot, centrality) {
    set({
      snapshot,
      graphData: buildForceGraphData(snapshot, centrality),
      activeSnapshotId: snapshot.snapshot_id,
    })
  },

  setSnapshots(snapshots) {
    set({ snapshots })
  },

  setActiveSnapshotId(id) {
    set({ activeSnapshotId: id })
  },

  setHoveredNodeId(id) {
    set({ hoveredNodeId: id })
  },

  setSelectedNodeId(id) {
    set({ selectedNodeId: id })
  },

  getSelectedNode() {
    const { graphData, selectedNodeId, candidateNodes } = get()
    if (!selectedNodeId) return null
    const cA = candidateNodes.A?.id === selectedNodeId ? candidateNodes.A : null
    const cB = candidateNodes.B?.id === selectedNodeId ? candidateNodes.B : null
    if (cA) return cA
    if (cB) return cB
    return graphData?.nodes.find((n) => n.id === selectedNodeId) ?? null
  },

  setCandidateNode(slot, node) {
    set((s) => ({ candidateNodes: { ...s.candidateNodes, [slot]: node } }))
  },

  clearCandidateNode(slot) {
    set((s) => ({ candidateNodes: { ...s.candidateNodes, [slot]: null } }))
  },

  clearAllCandidates() {
    set({ candidateNodes: { A: null, B: null } })
  },
}))
