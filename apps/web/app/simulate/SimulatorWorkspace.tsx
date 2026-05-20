"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useGraphStore } from "@/lib/store/graph"
import type { CandidateForceNode } from "@/lib/store/graph"
import { useSimulationStore } from "@/lib/store/simulation"
import { useSimulationStream } from "@/lib/hooks/useSimulationStream"
import { useEscapeKey } from "@/lib/hooks/useEscapeKey"
import { TeamGraph } from "@/components/graph/TeamGraph"
import { CandidateSlot } from "@/components/simulator/CandidateSlot"
import { SimulationResultsPanel } from "@/components/simulator/SimulationResultsPanel"
import { ComparisonPanel } from "@/components/simulator/ComparisonPanel"
import type { CentralityScore } from "@/lib/api/types"
import type { Slot } from "@/lib/store/simulation"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

interface StagedCandidate {
  candidateId: string
  name: string
  skills: string[]
  githubUrl?: string
}

interface Props {
  teams: string[]
}

// Inline style constants (BRAND.md)
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--fb)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "3px",
  textTransform: "uppercase",
  color: "var(--gold)",
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
  gap: 8,
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--fb)",
  fontSize: 13,
  color: "var(--dark)",
  border: "1px solid var(--primary-10)",
  borderRadius: 8,
  padding: "8px 12px",
  backgroundColor: "#ffffff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

const btnStyle: React.CSSProperties = {
  fontFamily: "var(--fb)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "#ffffff",
  backgroundColor: "var(--primary)",
  border: "none",
  borderRadius: 8,
  padding: "8px 0",
  cursor: "pointer",
  width: "100%",
}

const btnDisabledStyle: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.4,
  cursor: "not-allowed",
}

export function SimulatorWorkspace({ teams }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>(teams[0] ?? "")
  const [isLoadingGraph, setIsLoadingGraph] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)

  // Local staged candidate data (skills not in simulation store)
  const [stagedA, setStagedA] = useState<StagedCandidate | null>(null)
  const [stagedB, setStagedB] = useState<StagedCandidate | null>(null)
  const [formA, setFormA] = useState({ name: "", skills: "" })
  const [formB, setFormB] = useState({ name: "", skills: "" })

  const { setSnapshot, setCandidateNode, clearAllCandidates, candidateNodes, snapshot } =
    useGraphStore()
  const { slotA, slotB, stageCandidate, clearSlot, resetAll, isComparisonMode } =
    useSimulationStore()

  const { run: runA } = useSimulationStream("A")
  const { run: runB } = useSimulationStream("B")

  // Load graph + centrality when team changes
  useEffect(() => {
    if (!selectedTeam) return
    setIsLoadingGraph(true)
    setGraphError(null)

    Promise.all([
      fetch(`${BASE}/graph/teams/${selectedTeam}`).then((r) => {
        if (!r.ok) throw new Error(`Graph fetch failed: ${r.statusText}`)
        return r.json()
      }),
      fetch(`${BASE}/graph/metrics/${selectedTeam}`).then((r) => {
        if (!r.ok) return []
        return r.json() as Promise<CentralityScore[]>
      }),
    ])
      .then(([snap, scores]) => {
        const centralityMap = (scores as CentralityScore[]).reduce(
          (acc, s) => {
            acc[s.engineer_id] = { closeness: s.closeness, betweenness: s.betweenness }
            return acc
          },
          {} as Record<string, { closeness: number; betweenness: number }>,
        )
        setSnapshot(snap, centralityMap)
        clearAllCandidates()
        resetAll()
        setStagedA(null)
        setStagedB(null)
      })
      .catch((err: unknown) => {
        setGraphError((err as Error).message ?? "Failed to load team graph")
      })
      .finally(() => setIsLoadingGraph(false))
  }, [selectedTeam, setSnapshot, clearAllCandidates, resetAll])

  // Escape key → reset all candidate overlay + simulation
  const handleReset = useCallback(() => {
    clearAllCandidates()
    resetAll()
    setStagedA(null)
    setStagedB(null)
  }, [clearAllCandidates, resetAll])

  useEscapeKey(handleReset, !!(candidateNodes.A || candidateNodes.B))

  // Stage a candidate in the given slot (from form)
  const handleStage = useCallback(
    (slot: Slot, name: string, skills: string[]) => {
      const candidateId = `cand_${slot.toLowerCase()}_${Date.now()}`
      const staged: StagedCandidate = { candidateId, name, skills }
      if (slot === "A") setStagedA(staged)
      else setStagedB(staged)
      stageCandidate(slot, candidateId, name)
    },
    [stageCandidate],
  )

  // Handle candidate drop onto the graph canvas
  const handleCandidateDrop = useCallback(
    (slot: Slot, candidateId: string, name: string, skills: string[], x: number, y: number) => {
      if (!snapshot) return

      const node: CandidateForceNode = {
        id: candidateId,
        name,
        skills,
        seniority: "mid",
        team: "candidate",
        closeness: 0,
        betweenness: 0,
        isCandidate: true,
        slot,
        x,
        y,
        fx: x,
        fy: y,
      }

      setCandidateNode(slot, node)

      // Also stage in simulation store if not already staged
      stageCandidate(slot, candidateId, name)

      const runner = slot === "A" ? runA : runB
      void runner({
        candidate: {
          id: candidateId,
          name,
          skills,
          github_url: "",
          collaboration_vector: [],
          team_id: selectedTeam,
        },
        teamId: selectedTeam,
        nIterations: 1000,
        seed: 42,
      })
    },
    [snapshot, selectedTeam, setCandidateNode, stageCandidate, runA, runB],
  )

  // Clear a slot
  const handleClear = useCallback(
    (slot: Slot) => {
      if (slot === "A") setStagedA(null)
      else setStagedB(null)
      clearSlot(slot)
      // Remove candidate node from graph overlay
      setCandidateNode(slot, null)
    },
    [clearSlot, setCandidateNode],
  )

  // Handle drop ON the slot (pre-stage)
  const handleSlotDrop = useCallback(
    (slot: Slot, candidateId: string, name: string, skills: string[]) => {
      const staged: StagedCandidate = { candidateId, name, skills }
      if (slot === "A") setStagedA(staged)
      else setStagedB(staged)
      stageCandidate(slot, candidateId, name)
    },
    [stageCandidate],
  )

  const comparison = isComparisonMode()
  const showA = slotA.status === "complete" && !!slotA.result
  const showB = slotB.status === "complete" && !!slotB.result
  const showResults = showA || showB

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 52px)",
        backgroundColor: "var(--light)",
        overflow: "hidden",
      }}
    >
      {/* ── Left sidebar ───────────────────────────────────────────────────── */}
      <div
        style={{
          width: 272,
          flexShrink: 0,
          backgroundColor: "#ffffff",
          borderRight: "1px solid var(--primary-10)",
          overflowY: "auto",
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Team selector */}
        <div>
          <div style={labelStyle}>
            <div style={{ width: 24, height: 1, backgroundColor: "var(--gold)" }} />
            Team
          </div>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {graphError && (
            <div
              style={{
                marginTop: 6,
                fontFamily: "var(--fb)",
                fontSize: 11,
                color: "#E03448",
              }}
            >
              {graphError}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "var(--primary-10)" }} />

        {/* Slot A form + slot */}
        <CandidateFormSection
          slot="A"
          form={formA}
          onFormChange={setFormA}
          onStage={handleStage}
          stagedCandidate={stagedA}
          onSlotDrop={handleSlotDrop}
          onClear={handleClear}
        />

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "var(--primary-10)" }} />

        {/* Slot B form + slot */}
        <CandidateFormSection
          slot="B"
          form={formB}
          onFormChange={setFormB}
          onStage={handleStage}
          stagedCandidate={stagedB}
          onSlotDrop={handleSlotDrop}
          onClear={handleClear}
        />

        {/* Escape hint */}
        {(candidateNodes.A ?? candidateNodes.B) && (
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 10,
              color: "var(--mid)",
              textAlign: "center",
              paddingTop: 4,
            }}
          >
            Press{" "}
            <kbd
              style={{
                fontFamily: "Courier New",
                border: "1px solid var(--primary-10)",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 10,
              }}
            >
              Esc
            </kbd>{" "}
            to reset graph
          </div>
        )}
      </div>

      {/* ── Main graph area ─────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isLoadingGraph ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--fb)",
              color: "var(--mid)",
              fontSize: 14,
            }}
          >
            Loading team graph…
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            <TeamGraph onCandidateDrop={handleCandidateDrop} />
          </div>
        )}
      </div>

      {/* ── Right results panel ─────────────────────────────────────────────── */}
      {showResults && (
        <div
          style={{
            width: 308,
            flexShrink: 0,
            backgroundColor: "var(--light)",
            borderLeft: "1px solid var(--primary-10)",
            overflowY: "auto",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {comparison && showA && showB ? (
            <>
              <ComparisonPanel
                slotA={slotA.result!}
                slotB={slotB.result!}
                nameA={slotA.candidateName || undefined}
                nameB={slotB.candidateName || undefined}
              />
              <SimulationResultsPanel
                result={slotA.result!}
                candidateName={slotA.candidateName || undefined}
                slot="A"
              />
              <SimulationResultsPanel
                result={slotB.result!}
                candidateName={slotB.candidateName || undefined}
                slot="B"
              />
            </>
          ) : (
            <>
              {showA && (
                <SimulationResultsPanel
                  result={slotA.result!}
                  candidateName={slotA.candidateName || undefined}
                  slot="A"
                />
              )}
              {showB && (
                <SimulationResultsPanel
                  result={slotB.result!}
                  candidateName={slotB.candidateName || undefined}
                  slot="B"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Candidate form + slot section ─────────────────────────────────────────────

interface FormState {
  name: string
  skills: string
}

interface FormSectionProps {
  slot: Slot
  form: FormState
  onFormChange: (form: FormState) => void
  onStage: (slot: Slot, name: string, skills: string[]) => void
  stagedCandidate: StagedCandidate | null
  onSlotDrop: (slot: Slot, candidateId: string, name: string, skills: string[]) => void
  onClear: (slot: Slot) => void
}

function CandidateFormSection({
  slot,
  form,
  onFormChange,
  onStage,
  stagedCandidate,
  onSlotDrop,
  onClear,
}: FormSectionProps) {
  const accentColor = slot === "A" ? "var(--gold)" : "var(--primary-60)"

  function handleStage() {
    const skills = form.skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (!form.name.trim()) return
    onStage(slot, form.name.trim(), skills)
  }

  const canStage = form.name.trim().length > 0 && !stagedCandidate

  return (
    <div>
      <div
        style={{
          ...labelStyle,
          color: accentColor,
        }}
      >
        <div
          style={{ width: 24, height: 1, backgroundColor: accentColor }}
        />
        Candidate {slot}
      </div>

      {!stagedCandidate ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") handleStage() }}
            style={inputStyle}
            data-testid={`candidate-name-input-${slot}`}
          />
          <input
            placeholder="Skills (comma-separated)"
            value={form.skills}
            onChange={(e) => onFormChange({ ...form, skills: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") handleStage() }}
            style={inputStyle}
            data-testid={`candidate-skills-input-${slot}`}
          />
          <button
            disabled={!canStage}
            onClick={handleStage}
            style={canStage ? btnStyle : btnDisabledStyle}
            data-testid={`stage-btn-${slot}`}
          >
            Stage Candidate {slot}
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: stagedCandidate ? 0 : 10 }}>
        <CandidateSlot
          slot={slot}
          stagedCandidate={stagedCandidate}
          onStage={onSlotDrop}
          onClear={onClear}
        />
      </div>
    </div>
  )
}
