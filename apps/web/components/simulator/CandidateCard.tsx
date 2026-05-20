"use client"

import type { Slot } from "@/lib/store/simulation"

export interface CandidateCardData {
  candidateId: string
  name: string
  skills: string[]
  githubUrl?: string
  collaborationVector?: number[]
}

interface Props {
  candidate: CandidateCardData
  slot: Slot
  draggable?: boolean
}

// BRAND.md STATUS BADGE semantic colors
const SLOT_COLOR: Record<Slot, string> = {
  A: "var(--gold)",
  B: "var(--primary-60)",
}

export function CandidateCard({ candidate, slot, draggable = true }: Props) {
  const topSkills = candidate.skills.slice(0, 5)
  const accentColor = SLOT_COLOR[slot]

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = "copy"
    e.dataTransfer.setData("application/x-candidate-id", candidate.candidateId)
    e.dataTransfer.setData("application/x-candidate-name", candidate.name)
    e.dataTransfer.setData(
      "application/x-candidate-skills",
      JSON.stringify(candidate.skills),
    )
    e.dataTransfer.setData("application/x-slot", slot)
    if (candidate.githubUrl) {
      e.dataTransfer.setData("application/x-github-url", candidate.githubUrl)
    }
    if (candidate.collaborationVector) {
      e.dataTransfer.setData(
        "application/x-collab-vector",
        JSON.stringify(candidate.collaborationVector),
      )
    }
  }

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      data-testid={`candidate-card-${slot}`}
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 10,
        boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
        overflow: "hidden",
        cursor: draggable ? "grab" : "default",
        userSelect: "none",
      }}
    >
      {/* Slot accent bar */}
      <div style={{ height: 3, backgroundColor: accentColor }} />

      <div style={{ padding: "14px 16px" }}>
        {/* Slot label */}
        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: accentColor,
            marginBottom: 8,
          }}
        >
          Candidate {slot}
        </div>

        {/* Name */}
        <div
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 16,
            fontWeight: 400,
            color: "var(--dark)",
            marginBottom: candidate.githubUrl ? 2 : 10,
          }}
        >
          {candidate.name}
        </div>

        {candidate.githubUrl && (
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 11,
              color: "var(--mid)",
              marginBottom: 10,
            }}
          >
            {candidate.githubUrl}
          </div>
        )}

        {/* Skills */}
        {topSkills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {topSkills.map((skill) => (
              <span
                key={skill}
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 10,
                  fontWeight: 500,
                  color: "var(--primary)",
                  backgroundColor: "var(--primary-10)",
                  borderRadius: 20,
                  padding: "3px 10px",
                  letterSpacing: "0.5px",
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {draggable && (
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--mid)",
              opacity: 0.7,
            }}
          >
            ↕ Drag onto graph
          </div>
        )}
      </div>
    </div>
  )
}
