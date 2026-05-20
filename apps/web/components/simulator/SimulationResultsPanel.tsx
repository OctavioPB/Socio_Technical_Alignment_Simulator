"use client"

import { useState, useCallback } from "react"
import type { SimulationResult, SkillGapMatch } from "@/lib/api/types"
import type { Slot } from "@/lib/store/simulation"
import { CentralityRingChart } from "./CentralityRingChart"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

interface Props {
  result: SimulationResult
  candidateName?: string
  slot: Slot
}

// BRAND.md STATUS BADGE semantic colors
function siloLabel(mean: number): { label: string; color: string; bg: string } {
  if (mean < 0.33) return { label: "Low risk",  color: "#0D5C3A", bg: "#E0F7EF" }
  if (mean < 0.66) return { label: "Moderate",  color: "#7A3800", bg: "#FEF0E6" }
  return              { label: "High risk", color: "#7A1020", bg: "#FDEAEA" }
}

const SLOT_COLOR: Record<Slot, string> = {
  A: "var(--gold)",
  B: "var(--primary-60)",
}

function ShareButton({ resultId }: { resultId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">("idle")

  const handleShare = useCallback(async () => {
    setState("loading")
    try {
      const res = await fetch(`${BASE}/simulation/share/${resultId}`, { method: "POST" })
      if (!res.ok) throw new Error("Share failed")
      const { token } = (await res.json()) as { token: string }
      const url = `${APP_URL}/report/${token}`
      await navigator.clipboard.writeText(url)
      setState("copied")
      setTimeout(() => setState("idle"), 3000)
    } catch {
      setState("error")
      setTimeout(() => setState("idle"), 3000)
    }
  }, [resultId])

  const label =
    state === "loading" ? "Sharing…"
    : state === "copied" ? "Link copied ✓"
    : state === "error"  ? "Error — retry"
    : "Share report"

  return (
    <button
      onClick={handleShare}
      disabled={state === "loading"}
      style={{
        fontFamily: "var(--fb)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: state === "copied" ? "#0D5C3A" : "var(--primary)",
        backgroundColor: state === "copied" ? "#E0F7EF" : "var(--primary-10)",
        border: "none",
        borderRadius: 8,
        padding: "8px 14px",
        cursor: state === "loading" ? "not-allowed" : "pointer",
        width: "100%",
        transition: "background-color 0.15s, color 0.15s",
      }}
    >
      {label}
    </button>
  )
}

export function SimulationResultsPanel({ result, candidateName, slot }: Props) {
  const silo = siloLabel(result.silo_risk_score.mean)
  const accentColor = SLOT_COLOR[slot]
  const gaps: SkillGapMatch[] = result.knowledge_gap_coverage
    .filter((g) => g.candidate_has_skill && g.coverage_delta > 0)
    .slice(0, 8)

  return (
    <div
      data-testid={`simulation-results-${slot}`}
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 1px 6px rgba(0,51,102,0.09)",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, backgroundColor: accentColor }} />

      <div style={{ padding: "18px 20px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: accentColor,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: accentColor,
            }}
          >
            Candidate {slot}
            {candidateName ? ` · ${candidateName}` : ""}
          </div>
        </div>

        {/* Ring chart + key KPIs */}
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <CentralityRingChart
            distribution={result.closeness_centrality}
            size={108}
            slot={slot}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Time-to-Value */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "var(--mid)",
                  marginBottom: 2,
                }}
              >
                Time to Value
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 26,
                    fontWeight: 300,
                    color: "var(--dark)",
                    lineHeight: 1,
                  }}
                >
                  {result.time_to_value_weeks.mean.toFixed(1)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 11,
                    color: "var(--mid)",
                  }}
                >
                  wks
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 10,
                  color: "var(--mid)",
                  marginTop: 2,
                }}
              >
                95% CI [{result.time_to_value_weeks.ci_95[0].toFixed(1)},{" "}
                {result.time_to_value_weeks.ci_95[1].toFixed(1)}]
              </div>
            </div>

            {/* Silo risk badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: silo.bg,
                borderRadius: 20,
                padding: "4px 12px",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: silo.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 10,
                  fontWeight: 500,
                  color: silo.color,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                {silo.label}
              </span>
            </div>
          </div>
        </div>

        {/* CI footnote */}
        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 10,
            color: "var(--mid)",
            marginBottom: 14,
          }}
        >
          Closeness 95% CI [{result.closeness_centrality.ci_95[0].toFixed(3)},{" "}
          {result.closeness_centrality.ci_95[1].toFixed(3)}] · σ{" "}
          {result.closeness_centrality.std.toFixed(4)}
        </div>

        {/* Knowledge gap coverage */}
        {gaps.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ width: 24, height: 1, backgroundColor: "var(--gold)", flexShrink: 0 }}
              />
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                }}
              >
                Skill gaps covered
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {gaps.map((g) => (
                <span
                  key={g.skill}
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 10,
                    fontWeight: 500,
                    color: "#0D5C3A",
                    backgroundColor: "#E0F7EF",
                    borderRadius: 20,
                    padding: "3px 10px",
                  }}
                >
                  {g.skill} +{(g.coverage_delta * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </>
        )}

        {/* Share report */}
        <div style={{ marginTop: 16 }}>
          <ShareButton resultId={result.result_id} />
        </div>
      </div>
    </div>
  )
}
