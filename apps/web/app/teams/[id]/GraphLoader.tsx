"use client"

/**
 * GraphLoader — hydrates the Zustand graph store with server-fetched snapshot data,
 * then renders TeamGraph. This boundary separates server data fetching from client
 * interactivity.
 */

import { useEffect } from "react"
import { useGraphStore } from "@/lib/store/graph"
import { TeamGraph } from "@/components/graph/TeamGraph"
import { GraphSnapshotSelector } from "@/components/graph/GraphSnapshotSelector"
import type { CentralityScore, GraphSnapshot, SnapshotMeta } from "@/lib/api/types"

interface Props {
  teamId: string
  initialSnapshot: GraphSnapshot
  snapshots: SnapshotMeta[]
  centrality: CentralityScore[]
}

export function GraphLoader({ teamId, initialSnapshot, snapshots, centrality }: Props) {
  const { setSnapshot, setSnapshots } = useGraphStore()

  useEffect(() => {
    const centralityMap = Object.fromEntries(
      centrality.map((c) => [
        c.engineer_id,
        { closeness: c.closeness, betweenness: c.betweenness },
      ]),
    )
    setSnapshot(initialSnapshot, centralityMap)
    setSnapshots(snapshots)
  }, [initialSnapshot, centrality, snapshots, setSnapshot, setSnapshots])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Snapshot selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 16px",
          backgroundColor: "#ffffff",
          borderRadius: 10,
          boxShadow: "0 1px 4px rgba(0,51,102,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "var(--mid)",
            }}
          >
            {initialSnapshot.nodes.length} engineers · {initialSnapshot.edges.length} edges
          </span>
        </div>
        <GraphSnapshotSelector teamId={teamId} snapshots={snapshots} />
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, minHeight: 680 }}>
        <TeamGraph height={720} />
      </div>
    </div>
  )
}
