import Link from "next/link"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"
import type { CentralityScore } from "@/lib/api/types"

const API = process.env.API_URL ?? "http://localhost:8000"

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

function healthColor(avg: number): { fill: string; label: string; bg: string; text: string } {
  if (avg >= 0.55) return { fill: "#27B97C", label: "Highly connected", bg: "#E0F7EF", text: "#0D5C3A" }
  if (avg >= 0.40) return { fill: "#F07020", label: "Moderate cohesion", bg: "#FEF0E6", text: "#7A3800" }
  return { fill: "#E03448", label: "Low cohesion", bg: "#FDEAEA", text: "#7A1020" }
}

const card: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
}

export default async function TeamsPage() {
  const teams = await fetchTeams()
  const healthData = await Promise.all(
    teams.map(async (teamId) => {
      const scores = await fetchCentrality(teamId)
      const avg = scores.length
        ? scores.reduce((s, c) => s + c.closeness, 0) / scores.length
        : 0
      return { teamId, engineerCount: scores.length, avgCloseness: avg }
    }),
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
          padding: "56px 48px 48px",
        }}
      >
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <Eyebrow light>Knowledge Graph</Eyebrow>
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
            Engineering{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>teams.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 520,
              marginBottom: 32,
            }}
          >
            Select a team to explore its knowledge graph topology and run candidate simulations.
          </p>

          <div style={{ display: "flex", gap: 32 }}>
            {[
              { value: String(teams.length), label: "Active teams" },
              {
                value: String(healthData.reduce((s, h) => s + h.engineerCount, 0)),
                label: "Engineers in graph",
              },
            ].map((s) => (
              <div key={s.label} style={{ borderLeft: "2px solid var(--gold)", paddingLeft: 18 }}>
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 34,
                    fontWeight: 300,
                    color: "var(--gold-light)",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontFamily: "var(--fb)", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {s.label}
                </div>
              </div>
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
          padding: "48px 48px 64px",
          width: "100%",
        }}
      >
        {healthData.length === 0 ? (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: "48px 32px",
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              textAlign: "center",
              color: "var(--mid)",
              fontFamily: "var(--fb)",
              fontSize: 14,
            }}
          >
            No teams found — seed the graph with{" "}
            <code style={{ fontFamily: "Courier New", fontSize: 13 }}>make graph-seed</code>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            {healthData.map((h) => {
              const hc = healthColor(h.avgCloseness)
              const barPct = Math.round(Math.min(1, h.avgCloseness) * 100)
              return (
                <div key={h.teamId} style={card}>
                  <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
                  <div style={{ padding: "24px 28px" }}>
                    <div
                      style={{
                        fontFamily: "var(--fd)",
                        fontSize: 20,
                        fontWeight: 400,
                        color: "var(--dark)",
                        marginBottom: 16,
                      }}
                    >
                      {h.teamId}
                    </div>

                    <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: "var(--mid)",
                            marginBottom: 3,
                          }}
                        >
                          Engineers
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--fd)",
                            fontSize: 26,
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
                            marginBottom: 3,
                          }}
                        >
                          Avg closeness
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--fd)",
                            fontSize: 26,
                            fontWeight: 300,
                            color: hc.fill,
                          }}
                        >
                          {h.avgCloseness > 0 ? h.avgCloseness.toFixed(3) : "—"}
                        </div>
                      </div>
                    </div>

                    {h.avgCloseness > 0 && (
                      <div
                        style={{
                          backgroundColor: "var(--primary-10)",
                          borderRadius: 4,
                          height: 5,
                          marginBottom: 14,
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
                    )}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      {h.avgCloseness > 0 ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            backgroundColor: hc.bg,
                            borderRadius: 20,
                            padding: "3px 10px",
                          }}
                        >
                          <div
                            style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: hc.fill }}
                          />
                          <span
                            style={{
                              fontFamily: "var(--fb)",
                              fontSize: 9,
                              fontWeight: 600,
                              color: hc.text,
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                            }}
                          >
                            {hc.label}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontFamily: "var(--fb)", fontSize: 11, color: "var(--mid)" }}>
                          No metrics yet
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
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
                          padding: "8px 0",
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
                          padding: "8px 0",
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

      <Footer />
    </main>
  )
}
