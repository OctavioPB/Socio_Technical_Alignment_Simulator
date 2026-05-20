/**
 * /dashboard — recruiter command centre.
 *
 * Server Component: parallel-fetches team health metrics and recent candidates.
 * Shows team topology health cards, quick-action CTAs, and recent profile list.
 */

import Link from "next/link"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { SectionTitle } from "@/components/ui/SectionTitle"
import type { CentralityScore, CandidateProfile } from "@/lib/api/types"

const API = process.env.API_URL ?? "http://localhost:8000"

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchTeams(): Promise<string[]> {
  try {
    const r = await fetch(`${API}/graph/teams`, { next: { revalidate: 60 } })
    return r.ok ? (r.json() as Promise<string[]>) : []
  } catch { return [] }
}

async function fetchCentrality(teamId: string): Promise<CentralityScore[]> {
  try {
    const r = await fetch(`${API}/graph/metrics/${teamId}`, { next: { revalidate: 300 } })
    return r.ok ? (r.json() as Promise<CentralityScore[]>) : []
  } catch { return [] }
}

async function fetchCandidates(): Promise<CandidateProfile[]> {
  try {
    const r = await fetch(`${API}/candidates/?limit=6`, { next: { revalidate: 60 } })
    return r.ok ? (r.json() as Promise<CandidateProfile[]>) : []
  } catch { return [] }
}

// ── Team health helpers ───────────────────────────────────────────────────────

interface TeamHealth {
  teamId: string
  engineerCount: number
  avgCloseness: number
  topHub: string
}

function computeHealth(teamId: string, scores: CentralityScore[]): TeamHealth {
  if (scores.length === 0) return { teamId, engineerCount: 0, avgCloseness: 0, topHub: "—" }
  const avg = scores.reduce((s, c) => s + c.closeness, 0) / scores.length
  const top = scores.reduce((a, b) => (a.closeness > b.closeness ? a : b))
  return {
    teamId,
    engineerCount: scores.length,
    avgCloseness: avg,
    topHub: top.engineer_id,
  }
}

function healthColor(avg: number): { fill: string; label: string } {
  if (avg >= 0.55) return { fill: "#27B97C", label: "Highly connected" }
  if (avg >= 0.40) return { fill: "#F07020", label: "Moderate cohesion" }
  return { fill: "#E03448", label: "Low cohesion" }
}

const POSITION_COLORS: Record<string, string> = {
  "knowledge hub":        "#27B97C",
  "cross-team connector": "#7C4DBD",
  "domain specialist":    "#003366",
  "emerging contributor": "#F07020",
  "generalist":           "#6B7280",
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [teams, candidates] = await Promise.all([fetchTeams(), fetchCandidates()])

  const healthData: TeamHealth[] = await Promise.all(
    teams.map(async (t) => computeHealth(t, await fetchCentrality(t))),
  )

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
          padding: "64px 48px 48px",
        }}
      >
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 40,
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.2,
              marginBottom: 12,
            }}
          >
            Recruiter{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>
              command centre.
            </em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 540,
              marginBottom: 32,
            }}
          >
            Team topology health, candidate profiles, and simulation history — all in one place.
          </p>

          {/* KPI stat row */}
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {[
              {
                value: String(healthData.reduce((s, h) => s + h.engineerCount, 0)),
                label: "Engineers in graph",
              },
              { value: String(teams.length), label: "Active teams" },
              { value: String(candidates.length), label: "Candidate profiles" },
            ].map((s) => (
              <div key={s.label} style={{ borderLeft: "2px solid var(--gold)", paddingLeft: 18 }}>
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 34,
                    fontWeight: 300,
                    color: "var(--gold-light)",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.55,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1300,
          margin: "0 auto",
          padding: "48px 48px 0",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/simulate" style={{ textDecoration: "none" }}>
            <div
              style={{
                backgroundColor: "var(--primary)",
                color: "#ffffff",
                fontFamily: "var(--fb)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                padding: "10px 20px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Run Simulation →
            </div>
          </Link>
          <Link href="/candidates/new" style={{ textDecoration: "none" }}>
            <div
              style={{
                backgroundColor: "#ffffff",
                color: "var(--primary)",
                border: "1px solid var(--primary-30)",
                fontFamily: "var(--fb)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                padding: "10px 20px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Extract Candidate Profile →
            </div>
          </Link>
        </div>
      </section>

      {/* ── Team health grid ──────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1300,
          margin: "0 auto",
          padding: "48px 48px",
          width: "100%",
        }}
      >
        <Eyebrow>Team health</Eyebrow>
        <SectionTitle>Topology cohesion by team</SectionTitle>
        <p
          style={{
            fontFamily: "var(--fb)",
            fontSize: 13,
            color: "var(--mid)",
            marginBottom: 28,
          }}
        >
          Average closeness centrality measures how quickly knowledge flows across the team.
        </p>

        {healthData.length === 0 ? (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: "40px 32px",
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              textAlign: "center",
              color: "var(--mid)",
              fontFamily: "var(--fb)",
              fontSize: 14,
            }}
          >
            No teams available — seed the graph with{" "}
            <code style={{ fontFamily: "Courier New", fontSize: 13 }}>make graph-seed</code>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {healthData.map((h) => {
              const hc = healthColor(h.avgCloseness)
              const barPct = Math.round(Math.min(1, h.avgCloseness) * 100)
              return (
                <div
                  key={h.teamId}
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  }}
                >
                  {/* Top accent */}
                  <div style={{ height: 3, backgroundColor: "var(--gold)" }} />

                  <div style={{ padding: "22px 24px" }}>
                    {/* Ghosted watermark number */}
                    <div
                      style={{
                        fontFamily: "'Fraunces', Georgia, serif",
                        fontSize: 40,
                        fontWeight: 300,
                        color: "#f1f5f9",
                        lineHeight: 1,
                        marginBottom: 2,
                        userSelect: "none",
                      }}
                    >
                      #
                    </div>
                    <div style={{ width: 28, height: 3, backgroundColor: "var(--gold)", borderRadius: 2, margin: "6px 0 12px" }} />

                    <div
                      style={{
                        fontFamily: "'Fraunces', Georgia, serif",
                        fontSize: 18,
                        fontWeight: 400,
                        color: "#0a1628",
                        marginBottom: 14,
                      }}
                    >
                      {h.teamId}
                    </div>

                    {/* Metrics */}
                    <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: "var(--mid)",
                            marginBottom: 2,
                          }}
                        >
                          Engineers
                        </div>
                        <div
                          style={{
                            fontFamily: "'Fraunces', Georgia, serif",
                            fontSize: 22,
                            fontWeight: 300,
                            color: "var(--dark)",
                          }}
                        >
                          {h.engineerCount}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: "var(--mid)",
                            marginBottom: 2,
                          }}
                        >
                          Avg closeness
                        </div>
                        <div
                          style={{
                            fontFamily: "'Fraunces', Georgia, serif",
                            fontSize: 22,
                            fontWeight: 300,
                            color: hc.fill,
                          }}
                        >
                          {h.avgCloseness.toFixed(3)}
                        </div>
                      </div>
                    </div>

                    {/* Closeness bar */}
                    <div
                      style={{
                        backgroundColor: "var(--primary-10)",
                        borderRadius: 4,
                        height: 5,
                        marginBottom: 8,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barPct}%`,
                          height: "100%",
                          backgroundColor: hc.fill,
                          borderRadius: 4,
                        }}
                      />
                    </div>

                    {/* Status + Top hub */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          backgroundColor:
                            hc.fill === "#27B97C"
                              ? "#E0F7EF"
                              : hc.fill === "#F07020"
                              ? "#FEF0E6"
                              : "#FDEAEA",
                          borderRadius: 20,
                          padding: "3px 10px",
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: hc.fill,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 9,
                            fontWeight: 600,
                            color:
                              hc.fill === "#27B97C"
                                ? "#0D5C3A"
                                : hc.fill === "#F07020"
                                ? "#7A3800"
                                : "#7A1020",
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                          }}
                        >
                          {hc.label}
                        </span>
                      </div>

                      {h.topHub !== "—" && (
                        <div
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 10,
                            color: "var(--mid)",
                          }}
                        >
                          Hub: <strong style={{ color: "var(--primary)" }}>{h.topHub}</strong>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                      <Link
                        href={`/teams/${h.teamId}`}
                        style={{
                          flex: 1,
                          fontFamily: "var(--fb)",
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "2px",
                          textTransform: "uppercase",
                          color: "var(--primary)",
                          textDecoration: "none",
                          border: "1px solid var(--primary-30)",
                          borderRadius: 6,
                          padding: "6px 0",
                          textAlign: "center",
                        }}
                      >
                        View Graph
                      </Link>
                      <Link
                        href="/simulate"
                        style={{
                          flex: 1,
                          fontFamily: "var(--fb)",
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "2px",
                          textTransform: "uppercase",
                          color: "#ffffff",
                          textDecoration: "none",
                          backgroundColor: "var(--primary)",
                          borderRadius: 6,
                          padding: "6px 0",
                          textAlign: "center",
                        }}
                      >
                        Simulate →
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Recent candidates ─────────────────────────────────────────────── */}
      {candidates.length > 0 && (
        <section
          style={{
            maxWidth: 1300,
            margin: "0 auto",
            padding: "0 48px 64px",
            width: "100%",
          }}
        >
          <div
            style={{
              height: 1,
              backgroundColor: "var(--primary-10)",
              marginBottom: 48,
            }}
          />
          <Eyebrow>Candidate profiles</Eyebrow>
          <SectionTitle>Recently extracted</SectionTitle>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 13,
              color: "var(--mid)",
              marginBottom: 28,
            }}
          >
            Profiles extracted by the NLP agent from GitHub repositories. Click to view details.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 14,
            }}
          >
            {candidates.map((c) => {
              const posColor = POSITION_COLORS[c.graph_position_estimate] ?? "#6B7280"
              return (
                <Link
                  key={c.candidate_id}
                  href={`/candidates/${c.candidate_id}`}
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: 12,
                      overflow: "hidden",
                      boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ height: 3, backgroundColor: posColor }} />
                    <div style={{ padding: "16px 18px" }}>
                      {/* Position badge */}
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: posColor,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "1px",
                            textTransform: "uppercase",
                            color: posColor,
                          }}
                        >
                          {c.graph_position_estimate}
                        </span>
                      </div>

                      <div
                        style={{
                          fontFamily: "'Fraunces', Georgia, serif",
                          fontSize: 15,
                          fontWeight: 400,
                          color: "#0a1628",
                          marginBottom: 6,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.candidate_id}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                          marginBottom: 8,
                        }}
                      >
                        {c.skills.slice(0, 4).map((s) => (
                          <span
                            key={s.skill}
                            style={{
                              fontFamily: "var(--fb)",
                              fontSize: 9,
                              fontWeight: 500,
                              color: "var(--primary)",
                              backgroundColor: "var(--primary-10)",
                              borderRadius: 20,
                              padding: "2px 8px",
                            }}
                          >
                            {s.skill}
                          </span>
                        ))}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--fb)",
                          fontSize: 10,
                          color: "var(--gold)",
                          fontWeight: 700,
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                        }}
                      >
                        View profile →
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}

            {/* "Add new" card */}
            <Link href="/candidates/new" style={{ textDecoration: "none" }}>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  padding: "16px 18px",
                  border: "2px dashed var(--primary-30)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 140,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 32,
                    fontWeight: 300,
                    color: "var(--primary-30)",
                  }}
                >
                  +
                </div>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--primary-60)",
                  }}
                >
                  Extract new profile
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      <Footer />
    </main>
  )
}
