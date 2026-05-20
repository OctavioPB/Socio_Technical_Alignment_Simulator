"use client"

/**
 * GraphSnapshotSelector — date picker for switching between team graph snapshots.
 * Calls the API to load the selected snapshot into the Zustand store.
 */

import { useState, useTransition } from "react"
import { useGraphStore } from "@/lib/store/graph"
import { formatSnapshotDate } from "@/lib/graph-utils"
import type { SnapshotMeta } from "@/lib/api/types"

interface Props {
  teamId: string
  snapshots: SnapshotMeta[]
}

export function GraphSnapshotSelector({ teamId, snapshots }: Props) {
  const { activeSnapshotId, setActiveSnapshotId, setSnapshot } = useGraphStore()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (snapshots.length === 0) return null

  async function handleSelect(snapshotId: string) {
    if (snapshotId === activeSnapshotId) return
    setError(null)

    startTransition(async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
        const res = await fetch(
          `${apiBase}/graph/teams/${teamId}/snapshot/${snapshotId}`,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const snapshot = await res.json()
        setSnapshot(snapshot)
        setActiveSnapshotId(snapshotId)
      } catch {
        setError("Failed to load snapshot.")
      }
    })
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <label
        htmlFor="snapshot-select"
        style={{
          fontFamily: "var(--fb)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--mid)",
          flexShrink: 0,
        }}
      >
        Snapshot
      </label>

      <select
        id="snapshot-select"
        data-testid="snapshot-selector"
        value={activeSnapshotId ?? ""}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={isPending}
        style={{
          fontFamily: "var(--fb)",
          fontSize: 12,
          color: "var(--dark)",
          backgroundColor: "#ffffff",
          border: "1px solid var(--primary-10)",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
          opacity: isPending ? 0.5 : 1,
          transition: "opacity 0.15s",
          maxWidth: 240,
        }}
      >
        {snapshots.map((snap) => (
          <option key={snap.snapshot_id} value={snap.snapshot_id}>
            {formatSnapshotDate(snap.captured_at)} ({snap.node_count} engineers)
          </option>
        ))}
      </select>

      {isPending && (
        <span
          style={{
            fontFamily: "var(--fb)",
            fontSize: 10,
            color: "var(--gold)",
            letterSpacing: "1px",
          }}
        >
          Loading…
        </span>
      )}

      {error && (
        <span
          style={{
            fontFamily: "var(--fb)",
            fontSize: 10,
            color: "#E03448",
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
