"use client"

import { useState } from "react"
import { useSimulationStore } from "@/lib/store/simulation"
import type { Slot } from "@/lib/store/simulation"
import { CandidateCard } from "./CandidateCard"
import { SimulationProgressBar } from "./SimulationProgressBar"

interface StagedCandidate {
  candidateId: string
  name: string
  skills: string[]
  githubUrl?: string
}

interface Props {
  slot: Slot
  stagedCandidate: StagedCandidate | null
  onStage: (slot: Slot, candidateId: string, name: string, skills: string[]) => void
  onClear: (slot: Slot) => void
}

const SLOT_COLOR: Record<Slot, string> = {
  A: "var(--gold)",
  B: "var(--primary-60)",
}

export function CandidateSlot({ slot, stagedCandidate, onStage, onClear }: Props) {
  const [isDragOver, setIsDragOver] = useState(false)
  const slotState = useSimulationStore((s) => (slot === "A" ? s.slotA : s.slotB))

  const color = SLOT_COLOR[slot]
  const colorBg = slot === "A" ? "rgba(200,152,42,0.06)" : "rgba(51,102,153,0.06)"
  const isFilled = !!stagedCandidate

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const candidateId = e.dataTransfer.getData("application/x-candidate-id")
    const name = e.dataTransfer.getData("application/x-candidate-name")
    const skillsRaw = e.dataTransfer.getData("application/x-candidate-skills")
    if (!candidateId) return
    let skills: string[] = []
    try {
      skills = JSON.parse(skillsRaw) as string[]
    } catch {
      /* fallback to empty */
    }
    onStage(slot, candidateId, name, skills)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`candidate-slot-${slot}`}
      style={{
        borderRadius: 10,
        border: `2px dashed ${isDragOver ? color : isFilled ? color : "rgba(0,51,102,0.15)"}`,
        backgroundColor: isDragOver ? colorBg : isFilled ? colorBg : "#ffffff",
        padding: isFilled ? 0 : "14px 16px",
        transition: "border-color 0.15s, background-color 0.15s",
        minHeight: 72,
      }}
    >
      {isFilled ? (
        <div>
          <CandidateCard
            candidate={{
              candidateId: stagedCandidate.candidateId,
              name: stagedCandidate.name,
              skills: stagedCandidate.skills,
              githubUrl: stagedCandidate.githubUrl,
            }}
            slot={slot}
            draggable={slotState.status === "idle"}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--fb)",
                fontSize: 10,
                color:
                  slotState.status === "running"
                    ? "var(--gold)"
                    : slotState.status === "complete"
                    ? "#27B97C"
                    : slotState.status === "error"
                    ? "#E03448"
                    : "var(--mid)",
              }}
            >
              {slotState.status === "running"
                ? "Simulating…"
                : slotState.status === "complete"
                ? "Simulation complete"
                : slotState.status === "error"
                ? slotState.error
                : "Staged — drag onto graph to run"}
            </div>
            <button
              onClick={() => onClear(slot)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--fb)",
                fontSize: 9,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--mid)",
                padding: "2px 6px",
              }}
            >
              Clear ✕
            </button>
          </div>

          {slotState.status === "running" && (
            <div style={{ padding: "0 16px 14px" }}>
              <SimulationProgressBar
                progress={slotState.progress}
                iterationCount={slotState.iterationCount}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 12,
            color: "var(--mid)",
            textAlign: "center",
            paddingTop: 6,
            opacity: isDragOver ? 1 : 0.6,
          }}
        >
          {isDragOver ? "Release to stage candidate" : `Drop a candidate card here — Slot ${slot}`}
        </div>
      )}
    </div>
  )
}
