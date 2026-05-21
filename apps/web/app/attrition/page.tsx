"use client"

import { useState, useEffect, useCallback } from "react"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type EngineerNode = {
  id: string
  name: string
  skills: string[]
  seniority: "junior" | "mid" | "senior" | "staff"
  team: string
}

type EngineerImpact = {
  engineer_id: string
  name: string
  closeness_before: number
  closeness_after: number
  closeness_delta_pct: number
  betweenness_before: number
  betweenness_after: number
}

type AttritionResult = {
  team_id: string
  removed_engineer_id: string
  removed_engineer_name: string
  removed_engineer_seniority: string
  removed_engineer_skills: string[]
  baseline_avg_closeness: number
  post_removal_avg_closeness: number
  closeness_drop_pct: number
  baseline_components: number
  post_removal_components: number
  graph_fragmented: boolean
  engineer_impacts: EngineerImpact[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SENIORITY_RANK = { junior: 0, mid: 1, senior: 2, staff: 3 }
const SENIORITY_COLOR: Record<string, string> = {
  junior: "#6b7280",
  mid:    "#336699",
  senior: "#003366",
  staff:  "#c8982a",
}

function dropColor(pct: number): string {
  if (pct >= 20) return "var(--status-red)"
  if (pct >= 10) return "var(--status-orange)"
  if (pct >= 5)  return "#e8a020"
  return "var(--status-green)"
}

function dropLabel(pct: number): string {
  if (pct >= 20) return "Critical risk"
  if (pct >= 10) return "High risk"
  if (pct >= 5)  return "Moderate risk"
  return "Low risk"
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SeniorityBadge({ s }: { s: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--fb)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: SENIORITY_COLOR[s] ?? "var(--mid)",
        border: `1px solid ${SENIORITY_COLOR[s] ?? "var(--mid)"}`,
        borderRadius: 4,
        padding: "2px 6px",
      }}
    >
      {s}
    </span>
  )
}

function DeltaBar({ pct, max }: { pct: number; max: number }) {
  const fill = max > 0 ? Math.min(1, pct / max) * 100 : 0
  const color = dropColor(pct)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          backgroundColor: "var(--primary-10)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${fill}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--fd)",
          fontSize: 13,
          fontWeight: 300,
          color,
          minWidth: 42,
          textAlign: "right",
        }}
      >
        {pct > 0 ? `−${pct.toFixed(1)}%` : "0%"}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AttritionPage() {
  const [teams, setTeams] = useState<string[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string>("")
  const [engineers, setEngineers] = useState<EngineerNode[]>([])
  const [selectedEng, setSelectedEng] = useState<string>("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AttritionResult | null>(null)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    fetch(`${API}/graph/teams`)
      .then((r) => r.json())
      .then(setTeams)
      .catch(() => setError("Cannot reach API"))
  }, [])

  const loadEngineers = useCallback(async (teamId: string) => {
    setSelectedEng("")
    setResult(null)
    setError("")
    try {
      const r = await fetch(`${API}/graph/teams/${teamId}`)
      if (r.ok) {
        const snap = await r.json()
        const sorted: EngineerNode[] = [...snap.nodes].sort(
          (a: EngineerNode, b: EngineerNode) =>
            SENIORITY_RANK[b.seniority] - SENIORITY_RANK[a.seniority],
        )
        setEngineers(sorted)
      }
    } catch {
      setError("Failed to load team engineers")
    }
  }, [])

  useEffect(() => {
    if (selectedTeam) loadEngineers(selectedTeam)
  }, [selectedTeam, loadEngineers])

  const runAnalysis = async () => {
    if (!selectedTeam || !selectedEng) return
    setRunning(true)
    setResult(null)
    setError("")
    try {
      const r = await fetch(`${API}/analysis/attrition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: selectedTeam, engineer_id: selectedEng }),
      })
      const body = await r.json()
      if (r.ok) setResult(body)
      else setError(body.detail ?? "Analysis failed")
    } catch {
      setError("Cannot reach API")
    } finally {
      setRunning(false)
    }
  }

  const maxImpact = result
    ? Math.max(...result.engineer_impacts.map((e) => e.closeness_delta_pct), 0.1)
    : 1

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          backgroundColor: "var(--primary)",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          padding: "56px 48px 48px",
        }}
      >
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <Eyebrow light>Simulation</Eyebrow>
          <h1
            style={{
              fontFamily: "var(--fd)",
              fontSize: 40,
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.2,
              marginBottom: 12,
            }}
          >
            Attrition{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>impact.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 520,
            }}
          >
            Select an engineer and simulate their departure. See exactly how team
            connectivity degrades and which colleagues lose the most knowledge access.
          </p>
        </div>
      </section>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          flex: 1,
          maxWidth: 1300,
          margin: "0 auto",
          padding: "48px 48px 64px",
          width: "100%",
        }}
      >
        {/* Pickers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            marginBottom: 32,
          }}
        >
          {/* Team picker */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
            <div style={{ padding: "24px 28px" }}>
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "var(--mid)",
                  marginBottom: 12,
                }}
              >
                Step 1 — Select team
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {teams.length === 0 && (
                  <span style={{ fontFamily: "var(--fb)", fontSize: 12, color: "var(--mid)" }}>
                    No teams — seed the graph first.
                  </span>
                )}
                {teams.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTeam(t)}
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 11,
                      fontWeight: selectedTeam === t ? 700 : 400,
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: `1px solid ${selectedTeam === t ? "var(--primary)" : "var(--primary-30)"}`,
                      backgroundColor: selectedTeam === t ? "var(--primary)" : "transparent",
                      color: selectedTeam === t ? "#ffffff" : "var(--primary)",
                      cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Engineer picker */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
            <div style={{ padding: "24px 28px" }}>
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "var(--mid)",
                  marginBottom: 12,
                }}
              >
                Step 2 — Select engineer
              </div>
              {!selectedTeam ? (
                <span style={{ fontFamily: "var(--fb)", fontSize: 12, color: "var(--mid)" }}>
                  Pick a team first.
                </span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {engineers.map((eng) => (
                    <button
                      key={eng.id}
                      onClick={() => { setSelectedEng(eng.id); setResult(null) }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: `1px solid ${selectedEng === eng.id ? "var(--primary)" : "var(--primary-30)"}`,
                        backgroundColor: selectedEng === eng.id ? "var(--primary-10)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--fb)",
                          fontSize: 13,
                          color: "var(--dark)",
                          fontWeight: selectedEng === eng.id ? 600 : 400,
                        }}
                      >
                        {eng.name}
                      </span>
                      <SeniorityBadge s={eng.seniority} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Run button */}
        <div style={{ marginBottom: 40 }}>
          <button
            onClick={runAnalysis}
            disabled={!selectedTeam || !selectedEng || running}
            style={{
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: !selectedTeam || !selectedEng || running ? "rgba(255,255,255,0.4)" : "#ffffff",
              backgroundColor:
                !selectedTeam || !selectedEng || running
                  ? "rgba(0,51,102,0.3)"
                  : "var(--primary)",
              border: "none",
              borderRadius: 6,
              padding: "11px 28px",
              cursor: !selectedTeam || !selectedEng || running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "Computing…" : "Run impact analysis →"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              backgroundColor: "#fdeaea",
              borderRadius: 8,
              padding: "12px 16px",
              fontFamily: "var(--fb)",
              fontSize: 12,
              color: "#7a1020",
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Fragmentation warning */}
            {result.graph_fragmented && (
              <div
                style={{
                  backgroundColor: "#fdeaea",
                  borderLeft: "4px solid var(--status-red)",
                  borderRadius: "0 8px 8px 0",
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "var(--status-red)",
                    marginTop: 3,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#7a1020",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Graph fragmentation
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 12,
                      color: "#7a1020",
                      lineHeight: 1.6,
                    }}
                  >
                    Removing {result.removed_engineer_name} splits the team into{" "}
                    {result.post_removal_components} disconnected components (was{" "}
                    {result.baseline_components}). Some engineers will lose all direct
                    collaboration paths.
                  </p>
                </div>
              </div>
            )}

            {/* Impact headline + aggregate metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 1fr 1fr",
                gap: 20,
              }}
            >
              {/* Big impact number */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: "28px 36px",
                  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  borderTop: "3px solid var(--gold)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  minWidth: 200,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 56,
                    fontWeight: 300,
                    color: dropColor(result.closeness_drop_pct),
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {result.closeness_drop_pct > 0
                    ? `−${result.closeness_drop_pct.toFixed(1)}%`
                    : "0%"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--mid)",
                    marginBottom: 6,
                  }}
                >
                  Connectivity drop
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor:
                      result.closeness_drop_pct >= 20
                        ? "#fdeaea"
                        : result.closeness_drop_pct >= 10
                        ? "#fef0e6"
                        : "#e0f7ef",
                    borderRadius: 20,
                    padding: "3px 10px",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: dropColor(result.closeness_drop_pct),
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: dropColor(result.closeness_drop_pct),
                    }}
                  >
                    {dropLabel(result.closeness_drop_pct)}
                  </span>
                </div>
              </div>

              {/* Removed engineer details */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: "24px 28px",
                  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  borderTop: "3px solid var(--gold)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--mid)",
                    marginBottom: 10,
                  }}
                >
                  Engineer leaving
                </div>
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 22,
                    fontWeight: 400,
                    color: "var(--dark)",
                    marginBottom: 8,
                  }}
                >
                  {result.removed_engineer_name}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <SeniorityBadge s={result.removed_engineer_seniority} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {result.removed_engineer_skills.slice(0, 6).map((s) => (
                    <span
                      key={s}
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 10,
                        color: "var(--primary-60)",
                        backgroundColor: "var(--primary-10)",
                        borderRadius: 4,
                        padding: "2px 7px",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                  {result.removed_engineer_skills.length > 6 && (
                    <span
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 10,
                        color: "var(--mid)",
                        padding: "2px 4px",
                      }}
                    >
                      +{result.removed_engineer_skills.length - 6} more
                    </span>
                  )}
                </div>
              </div>

              {/* Avg closeness before/after */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: "24px 28px",
                  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  borderTop: "3px solid var(--gold)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--mid)",
                    marginBottom: 16,
                  }}
                >
                  Team avg closeness
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 9,
                        color: "var(--mid)",
                        marginBottom: 4,
                      }}
                    >
                      Before
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fd)",
                        fontSize: 26,
                        fontWeight: 300,
                        color: "var(--status-green)",
                      }}
                    >
                      {result.baseline_avg_closeness.toFixed(3)}
                    </div>
                  </div>
                  <div style={{ alignSelf: "center", color: "var(--mid)", fontSize: 18 }}>→</div>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 9,
                        color: "var(--mid)",
                        marginBottom: 4,
                      }}
                    >
                      After
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fd)",
                        fontSize: 26,
                        fontWeight: 300,
                        color: dropColor(result.closeness_drop_pct),
                      }}
                    >
                      {result.post_removal_avg_closeness.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fragmentation */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: "24px 28px",
                  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  borderTop: "3px solid var(--gold)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--mid)",
                    marginBottom: 16,
                  }}
                >
                  Graph components
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div
                      style={{ fontFamily: "var(--fb)", fontSize: 9, color: "var(--mid)", marginBottom: 4 }}
                    >
                      Before
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fd)",
                        fontSize: 26,
                        fontWeight: 300,
                        color: "var(--dark)",
                      }}
                    >
                      {result.baseline_components}
                    </div>
                  </div>
                  <div style={{ alignSelf: "center", color: "var(--mid)", fontSize: 18 }}>→</div>
                  <div>
                    <div
                      style={{ fontFamily: "var(--fb)", fontSize: 9, color: "var(--mid)", marginBottom: 4 }}
                    >
                      After
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fd)",
                        fontSize: 26,
                        fontWeight: 300,
                        color: result.graph_fragmented
                          ? "var(--status-red)"
                          : "var(--dark)",
                      }}
                    >
                      {result.post_removal_components}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-engineer impact list */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              }}
            >
              <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
              <div style={{ padding: "24px 28px" }}>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--mid)",
                    marginBottom: 20,
                  }}
                >
                  Individual connectivity loss
                </div>

                {/* Header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "200px 1fr 80px 80px",
                    gap: 16,
                    padding: "0 4px 10px",
                    borderBottom: "1px solid var(--primary-10)",
                    marginBottom: 8,
                  }}
                >
                  {["Engineer", "Closeness drop", "Before", "After"].map((h) => (
                    <div
                      key={h}
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        color: "var(--mid)",
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>

                {result.engineer_impacts.map((eng) => (
                  <div
                    key={eng.engineer_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "200px 1fr 80px 80px",
                      gap: 16,
                      padding: "10px 4px",
                      borderBottom: "1px solid var(--primary-10)",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 13,
                        color: "var(--dark)",
                        fontWeight: 500,
                      }}
                    >
                      {eng.name}
                    </div>
                    <DeltaBar pct={eng.closeness_delta_pct} max={maxImpact} />
                    <div
                      style={{
                        fontFamily: "Courier New, monospace",
                        fontSize: 11,
                        color: "var(--mid)",
                      }}
                    >
                      {eng.closeness_before.toFixed(3)}
                    </div>
                    <div
                      style={{
                        fontFamily: "Courier New, monospace",
                        fontSize: 11,
                        color:
                          eng.closeness_delta_pct > 10
                            ? "var(--status-red)"
                            : "var(--mid)",
                      }}
                    >
                      {eng.closeness_after.toFixed(3)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  )
}
