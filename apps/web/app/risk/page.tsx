"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type EngineerRiskFixed = {
  engineer_id: string
  name: string
  seniority: string
  skills: string[]
  closeness: number
  betweenness: number
  degree: number
  removal_impact_pct: number
  is_critical_path: boolean
}

type TeamRisk = {
  team_id: string
  resilience_score: number
  bus_factor: number
  graph_density: number
  engineer_count: number
  engineers: EngineerRiskFixed[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SENIORITY_COLOR: Record<string, string> = {
  junior: "#6b7280",
  mid:    "#336699",
  senior: "#003366",
  staff:  "#c8982a",
}

function resilienceColor(score: number): string {
  if (score >= 0.8) return "var(--status-green)"
  if (score >= 0.6) return "#e8a020"
  if (score >= 0.4) return "var(--status-orange)"
  return "var(--status-red)"
}

function resilienceLabel(score: number): string {
  if (score >= 0.8) return "Resilient"
  if (score >= 0.6) return "Moderate"
  if (score >= 0.4) return "Fragile"
  return "Critical"
}

function impactColor(pct: number): string {
  if (pct >= 20) return "var(--status-red)"
  if (pct >= 10) return "var(--status-orange)"
  if (pct >= 5)  return "#e8a020"
  return "var(--status-green)"
}

// ── Horizontal bar ────────────────────────────────────────────────────────────

function HBar({
  value,
  max,
  color,
  width = 160,
}: {
  value: number
  max: number
  color: string
  width?: number
}) {
  const fill = max > 0 ? Math.min(1, value / max) * 100 : 0
  return (
    <div
      style={{
        width,
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
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RiskPage() {
  const [teams, setTeams] = useState<string[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string>("")
  const [risk, setRisk] = useState<TeamRisk | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    fetch(`${API}/graph/teams`)
      .then((r) => r.json())
      .then((data) => {
        setTeams(data)
        if (data.length > 0) setSelectedTeam(data[0])
      })
      .catch(() => setError("Cannot reach API"))
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    setLoading(true)
    setError("")
    fetch(`${API}/analysis/risk/${selectedTeam}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setRisk)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedTeam])

  const maxImpact = risk
    ? Math.max(...risk.engineers.map((e) => e.removal_impact_pct), 0.1)
    : 1
  const maxBetweenness = risk
    ? Math.max(...risk.engineers.map((e) => e.betweenness), 0.001)
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
          padding: "56px 48px 0",
        }}
      >
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <Eyebrow light>Analysis</Eyebrow>
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
            Silo{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>&amp; risk.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 520,
              marginBottom: 36,
            }}
          >
            Engineers whose removal collapses team connectivity are single points of failure.
            Betweenness outliers sit on critical knowledge paths — they&apos;re the first hire
            priority when a team shows fragility.
          </p>

          {/* Team tab bar */}
          <div style={{ display: "flex", gap: 4 }}>
            {teams.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTeam(t)}
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: "6px 6px 0 0",
                  cursor: "pointer",
                  backgroundColor:
                    selectedTeam === t ? "#ffffff" : "rgba(255,255,255,0.08)",
                  color: selectedTeam === t ? "var(--primary)" : "rgba(255,255,255,0.5)",
                  marginBottom: selectedTeam === t ? -1 : 0,
                  position: "relative",
                  zIndex: selectedTeam === t ? 1 : 0,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          flex: 1,
          maxWidth: 1300,
          margin: "0 auto",
          padding: "40px 48px 64px",
          width: "100%",
        }}
      >
        {loading && (
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 12,
              color: "var(--mid)",
              padding: "48px 0",
              textAlign: "center",
            }}
          >
            Computing risk analysis…
          </div>
        )}

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

        {!loading && risk && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Key metrics row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>

              {/* Resilience */}
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
                    marginBottom: 12,
                  }}
                >
                  Resilience score
                </div>
                {/* Gauge bar */}
                <div
                  style={{
                    height: 6,
                    backgroundColor: "var(--primary-10)",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: `${risk.resilience_score * 100}%`,
                      height: "100%",
                      backgroundColor: resilienceColor(risk.resilience_score),
                      borderRadius: 3,
                      transition: "width 0.6s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 34,
                    fontWeight: 300,
                    color: resilienceColor(risk.resilience_score),
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {(risk.resilience_score * 100).toFixed(0)}
                  <span style={{ fontSize: 18 }}>/100</span>
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor:
                      risk.resilience_score >= 0.8 ? "#e0f7ef" :
                      risk.resilience_score >= 0.6 ? "#fff9e6" :
                      risk.resilience_score >= 0.4 ? "#fef0e6" : "#fdeaea",
                    borderRadius: 20,
                    padding: "3px 10px",
                  }}
                >
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      backgroundColor: resilienceColor(risk.resilience_score),
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: resilienceColor(risk.resilience_score),
                    }}
                  >
                    {resilienceLabel(risk.resilience_score)}
                  </span>
                </div>
              </div>

              {/* Bus factor */}
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
                    marginBottom: 12,
                  }}
                >
                  Bus factor
                </div>
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 56,
                    fontWeight: 300,
                    color: risk.bus_factor === 0 ? "var(--status-green)" :
                           risk.bus_factor <= 2 ? "var(--status-orange)" : "var(--status-red)",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {risk.bus_factor}
                </div>
                <p
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 11,
                    color: "var(--mid)",
                    lineHeight: 1.5,
                  }}
                >
                  {risk.bus_factor === 0
                    ? "No single points of failure"
                    : `engineer${risk.bus_factor !== 1 ? "s" : ""} whose departure drops connectivity >15%`}
                </p>
              </div>

              {/* Graph density */}
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
                    marginBottom: 12,
                  }}
                >
                  Graph density
                </div>
                <div
                  style={{
                    height: 6,
                    backgroundColor: "var(--primary-10)",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: `${risk.graph_density * 100}%`,
                      height: "100%",
                      backgroundColor: "var(--primary-60)",
                      borderRadius: 3,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 34,
                    fontWeight: 300,
                    color: "var(--dark)",
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {(risk.graph_density * 100).toFixed(1)}%
                </div>
                <div
                  style={{ fontFamily: "var(--fb)", fontSize: 11, color: "var(--mid)" }}
                >
                  of possible edges exist
                </div>
              </div>

              {/* Team size */}
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
                    marginBottom: 12,
                  }}
                >
                  Team size
                </div>
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 56,
                    fontWeight: 300,
                    color: "var(--dark)",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {risk.engineer_count}
                </div>
                <div style={{ fontFamily: "var(--fb)", fontSize: 11, color: "var(--mid)" }}>
                  engineers in graph
                </div>
              </div>
            </div>

            {/* Engineer risk table */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              }}
            >
              <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
              <div style={{ padding: "24px 28px 8px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 20,
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
                    }}
                  >
                    Engineer risk ranking — sorted by removal impact
                  </div>
                  <div
                    style={{ fontFamily: "var(--fb)", fontSize: 11, color: "var(--mid)" }}
                  >
                    Critical path = betweenness &gt; mean + 1σ
                  </div>
                </div>

                {/* Column headers */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 80px 60px 180px 180px 120px",
                    gap: 16,
                    padding: "0 4px 10px",
                    borderBottom: "1px solid var(--primary-10)",
                    marginBottom: 4,
                  }}
                >
                  {["Engineer", "Seniority", "Edges", "Betweenness", "Removal impact", ""].map((h) => (
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
              </div>

              {risk.engineers.map((eng, idx) => (
                <div
                  key={eng.engineer_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 80px 60px 180px 180px 120px",
                    gap: 16,
                    padding: "12px 32px",
                    borderBottom:
                      idx < risk.engineers.length - 1
                        ? "1px solid var(--primary-10)"
                        : "none",
                    alignItems: "center",
                    backgroundColor: idx === 0 && risk.bus_factor > 0
                      ? "rgba(224, 52, 72, 0.03)"
                      : "transparent",
                  }}
                >
                  {/* Name */}
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 13,
                        color: "var(--dark)",
                        fontWeight: 500,
                        marginBottom: 2,
                      }}
                    >
                      {eng.name}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                      {eng.skills.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 9,
                            color: "var(--primary-60)",
                            backgroundColor: "var(--primary-10)",
                            borderRadius: 3,
                            padding: "1px 5px",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                      {eng.skills.length > 4 && (
                        <span style={{ fontFamily: "var(--fb)", fontSize: 9, color: "var(--mid)" }}>
                          +{eng.skills.length - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Seniority */}
                  <span
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: SENIORITY_COLOR[eng.seniority] ?? "var(--mid)",
                    }}
                  >
                    {eng.seniority}
                  </span>

                  {/* Degree */}
                  <span
                    style={{
                      fontFamily: "var(--fd)",
                      fontSize: 18,
                      fontWeight: 300,
                      color: "var(--dark)",
                    }}
                  >
                    {eng.degree}
                  </span>

                  {/* Betweenness bar */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <HBar
                      value={eng.betweenness}
                      max={maxBetweenness}
                      color={eng.is_critical_path ? "var(--status-orange)" : "var(--primary-60)"}
                      width={160}
                    />
                    <span
                      style={{
                        fontFamily: "Courier New, monospace",
                        fontSize: 10,
                        color: "var(--mid)",
                      }}
                    >
                      {eng.betweenness.toFixed(4)}
                    </span>
                  </div>

                  {/* Removal impact bar */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <HBar
                      value={eng.removal_impact_pct}
                      max={maxImpact}
                      color={impactColor(eng.removal_impact_pct)}
                      width={160}
                    />
                    <span
                      style={{
                        fontFamily: "Courier New, monospace",
                        fontSize: 10,
                        color: impactColor(eng.removal_impact_pct),
                        fontWeight: eng.removal_impact_pct >= 15 ? 600 : 400,
                      }}
                    >
                      −{eng.removal_impact_pct.toFixed(1)}%
                    </span>
                  </div>

                  {/* Badges + action */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                    {eng.is_critical_path && (
                      <span
                        style={{
                          fontFamily: "var(--fb)",
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          color: "#7a3800",
                          backgroundColor: "#fef0e6",
                          borderRadius: 4,
                          padding: "2px 7px",
                        }}
                      >
                        Critical path
                      </span>
                    )}
                    {eng.removal_impact_pct >= 15 && (
                      <span
                        style={{
                          fontFamily: "var(--fb)",
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          color: "#7a1020",
                          backgroundColor: "#fdeaea",
                          borderRadius: 4,
                          padding: "2px 7px",
                        }}
                      >
                        Bus factor
                      </span>
                    )}
                    <Link
                      href={`/attrition?team=${risk.team_id}&engineer=${eng.engineer_id}`}
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        color: "var(--primary)",
                        textDecoration: "none",
                        border: "1px solid var(--primary-30)",
                        borderRadius: 4,
                        padding: "3px 8px",
                      }}
                    >
                      Simulate →
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Interpretation guide */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
              {[
                {
                  term: "Resilience score",
                  desc: "1 − (max removal impact / 100). A score of 100 means no single engineer collapses connectivity. Below 60 is a hiring signal.",
                },
                {
                  term: "Bus factor",
                  desc: "Count of engineers whose departure drops team average closeness by more than 15%. A bus factor of 1 means one resignation triggers a crisis.",
                },
                {
                  term: "Critical path",
                  desc: "Engineers with betweenness centrality above mean + 1σ. They sit on the shortest knowledge paths between the most pairs of colleagues.",
                },
              ].map((item) => (
                <div
                  key={item.term}
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: 10,
                    padding: "16px 20px",
                    boxShadow: "0 1px 4px rgba(0,51,102,0.06)",
                    borderLeft: "3px solid var(--gold)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: "var(--mid)",
                      marginBottom: 6,
                    }}
                  >
                    {item.term}
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 12,
                      color: "var(--dark)",
                      lineHeight: 1.65,
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  )
}
