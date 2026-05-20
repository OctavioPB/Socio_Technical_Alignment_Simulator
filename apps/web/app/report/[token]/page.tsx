/**
 * /report/[token] — Shareable simulation report (no auth required).
 *
 * Server Component: fetches the simulation result from GET /simulation/report/{token},
 * renders a full-page report with centrality ring chart, metrics, and recommendation.
 * The token IS the authorization — valid for 7 days after creation.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { CentralityRingChart } from "@/components/simulator/CentralityRingChart"
import type { SimulationResult } from "@/lib/api/types"

interface PageProps {
  params: { token: string }
}

const API = process.env.API_URL ?? "http://localhost:8000"

async function fetchReport(token: string): Promise<SimulationResult | null> {
  try {
    const res = await fetch(`${API}/simulation/report/${token}`, { cache: "no-store" })
    if (res.status === 404) return null
    if (!res.ok) return null
    return res.json() as Promise<SimulationResult>
  } catch {
    return null
  }
}

function siloLabel(mean: number): { label: string; color: string; bg: string } {
  if (mean < 0.33) return { label: "Low risk",  color: "#0D5C3A", bg: "#E0F7EF" }
  if (mean < 0.66) return { label: "Moderate",  color: "#7A3800", bg: "#FEF0E6" }
  return              { label: "High risk", color: "#7A1020", bg: "#FDEAEA" }
}

function recommendation(result: SimulationResult): string {
  const cc = result.closeness_centrality.mean
  const ttv = result.time_to_value_weeks.mean
  const silo = result.silo_risk_score.mean

  if (cc >= 0.55 && ttv <= 6 && silo < 0.33) {
    return "Strong hire signal. This candidate is predicted to become a knowledge hub quickly, reducing team isolation and covering key skill gaps with low integration risk."
  }
  if (cc >= 0.45 && silo < 0.66) {
    return "Positive hire signal. The candidate shows good integration potential. Monitor early onboarding milestones against the predicted Time-to-Value window."
  }
  if (silo >= 0.66) {
    return "Proceed with caution. High silo risk suggests this candidate may not integrate well with the team's current knowledge flow. Consider pairing with a high-centrality mentor."
  }
  return "Neutral signal. The candidate is predicted to integrate at an average rate. Validate against the identified skill gaps and team structure changes."
}

export default async function ReportPage({ params }: PageProps) {
  const result = await fetchReport(params.token)
  if (!result) notFound()

  const silo = siloLabel(result.silo_risk_score.mean)
  const rec = recommendation(result)
  const topGaps = result.knowledge_gap_coverage
    .filter((g) => g.candidate_has_skill && g.coverage_delta > 0)
    .slice(0, 10)

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
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Eyebrow light>Simulation Report</Eyebrow>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 36,
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.2,
              marginBottom: 12,
            }}
          >
            Candidate{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>
              {result.candidate_id}
            </em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 600,
              marginBottom: 28,
            }}
          >
            Monte Carlo simulation across {result.n_iterations.toLocaleString()} iterations
            against snapshot{" "}
            <span style={{ color: "rgba(255,255,255,0.85)", fontFamily: "monospace", fontSize: 12 }}>
              {result.snapshot_id.slice(0, 8)}…
            </span>
          </p>

          {/* KPI stat row */}
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {[
              {
                value: result.closeness_centrality.mean.toFixed(3),
                label: "Closeness centrality",
              },
              {
                value: `${result.time_to_value_weeks.mean.toFixed(1)} wks`,
                label: "Time to value",
              },
              {
                value: silo.label,
                label: "Silo risk",
              },
              {
                value: (result.betweenness_delta.mean >= 0 ? "+" : "") +
                  result.betweenness_delta.mean.toFixed(3),
                label: "Betweenness Δ",
              },
            ].map((s) => (
              <div key={s.label} style={{ borderLeft: "2px solid var(--gold)", paddingLeft: 14 }}>
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 18,
                    fontWeight: 300,
                    color: "var(--gold-light)",
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
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
          maxWidth: 1100,
          margin: "0 auto",
          padding: "56px 48px",
          flex: 1,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            marginBottom: 24,
          }}
        >
          {/* ── Centrality ─────────────────────────────────────────────── */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
            <div style={{ padding: "24px 28px" }}>
              <Eyebrow>Closeness Centrality</Eyebrow>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <CentralityRingChart
                  distribution={result.closeness_centrality}
                  size={140}
                  slot="A"
                />
                <div>
                  <MetricDetail
                    label="Mean"
                    value={result.closeness_centrality.mean.toFixed(4)}
                  />
                  <MetricDetail
                    label="Std dev"
                    value={result.closeness_centrality.std.toFixed(4)}
                  />
                  <MetricDetail
                    label="95% CI"
                    value={`[${result.closeness_centrality.ci_95[0].toFixed(3)}, ${result.closeness_centrality.ci_95[1].toFixed(3)}]`}
                  />
                  <MetricDetail
                    label="p50"
                    value={result.closeness_centrality.percentiles["p50"]?.toFixed(4) ?? "—"}
                  />
                  <MetricDetail
                    label="p95"
                    value={result.closeness_centrality.percentiles["p95"]?.toFixed(4) ?? "—"}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Time to Value ───────────────────────────────────────────── */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--primary-60)" }} />
            <div style={{ padding: "24px 28px" }}>
              <Eyebrow>Time to Value</Eyebrow>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  marginBottom: 16,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 52,
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
                    fontSize: 16,
                    color: "var(--mid)",
                  }}
                >
                  weeks
                </span>
              </div>
              <MetricDetail
                label="95% CI"
                value={`[${result.time_to_value_weeks.ci_95[0].toFixed(1)}, ${result.time_to_value_weeks.ci_95[1].toFixed(1)}] wks`}
              />
              <MetricDetail
                label="Std dev"
                value={`${result.time_to_value_weeks.std.toFixed(2)} wks`}
              />
              <MetricDetail
                label="Best case (p5)"
                value={`${result.time_to_value_weeks.percentiles["p5"]?.toFixed(1) ?? "—"} wks`}
              />
              <MetricDetail
                label="Worst case (p95)"
                value={`${result.time_to_value_weeks.percentiles["p95"]?.toFixed(1) ?? "—"} wks`}
              />
            </div>
          </div>

          {/* ── Silo Risk ───────────────────────────────────────────────── */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 3, backgroundColor: silo.color }} />
            <div style={{ padding: "24px 28px" }}>
              <Eyebrow>Silo Risk</Eyebrow>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: silo.bg,
                  borderRadius: 20,
                  padding: "6px 16px",
                  marginBottom: 14,
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: silo.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: silo.color,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {silo.label}
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  backgroundColor: "var(--primary-10)",
                  borderRadius: 4,
                  height: 6,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: `${Math.round(result.silo_risk_score.mean * 100)}%`,
                    height: "100%",
                    backgroundColor: silo.color,
                    borderRadius: 4,
                  }}
                />
              </div>

              <MetricDetail
                label="Mean score"
                value={result.silo_risk_score.mean.toFixed(3)}
              />
              <MetricDetail
                label="95% CI"
                value={`[${result.silo_risk_score.ci_95[0].toFixed(3)}, ${result.silo_risk_score.ci_95[1].toFixed(3)}]`}
              />
            </div>
          </div>

          {/* ── Betweenness Δ ───────────────────────────────────────────── */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--primary)" }} />
            <div style={{ padding: "24px 28px" }}>
              <Eyebrow>Betweenness Delta</Eyebrow>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  marginBottom: 16,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 42,
                    fontWeight: 300,
                    color: result.betweenness_delta.mean >= 0 ? "#0D5C3A" : "#7A1020",
                    lineHeight: 1,
                  }}
                >
                  {result.betweenness_delta.mean >= 0 ? "+" : ""}
                  {result.betweenness_delta.mean.toFixed(3)}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 11,
                  color: "var(--mid)",
                  lineHeight: 1.55,
                  marginBottom: 12,
                }}
              >
                Change in team betweenness centrality after candidate insertion. Positive values
                indicate improved knowledge flow paths across the team graph.
              </div>
              <MetricDetail
                label="95% CI"
                value={`[${result.betweenness_delta.ci_95[0].toFixed(3)}, ${result.betweenness_delta.ci_95[1].toFixed(3)}]`}
              />
            </div>
          </div>
        </div>

        {/* ── Knowledge Gap Coverage ────────────────────────────────────────── */}
        {topGaps.length > 0 && (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              overflow: "hidden",
              marginBottom: 24,
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
            <div style={{ padding: "24px 28px" }}>
              <Eyebrow>Knowledge Gap Coverage</Eyebrow>
              <p
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 12,
                  color: "var(--mid)",
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                Skills this candidate brings that the team currently lacks, with predicted
                coverage increase.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topGaps.map((g) => (
                  <div
                    key={g.skill}
                    style={{
                      backgroundColor: "#E0F7EF",
                      borderRadius: 8,
                      padding: "8px 14px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#0D5C3A",
                        marginBottom: 2,
                      }}
                    >
                      {g.skill}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fb)",
                        fontSize: 10,
                        color: "#27B97C",
                      }}
                    >
                      +{(g.coverage_delta * 100).toFixed(0)}% coverage
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Recommendation ────────────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <div style={{ height: 3, backgroundColor: "var(--primary)" }} />
          <div style={{ padding: "24px 28px" }}>
            <Eyebrow>Recommendation</Eyebrow>
            <p
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: 18,
                fontWeight: 300,
                color: "var(--dark)",
                lineHeight: 1.6,
                marginTop: 8,
              }}
            >
              {rec}
            </p>
          </div>
        </div>

        {/* ── Footer callout ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 11,
              color: "var(--mid)",
              lineHeight: 1.55,
            }}
          >
            Simulation ID:{" "}
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--dark)" }}>
              {result.result_id}
            </span>{" "}
            · {result.n_iterations.toLocaleString()} iterations · seed {result.seed}
          </div>
          <Link href="/simulate" style={{ textDecoration: "none" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "var(--primary)",
                color: "#ffffff",
                fontFamily: "var(--fb)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                padding: "10px 20px",
                borderRadius: 8,
              }}
            >
              Run New Simulation →
            </div>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function MetricDetail({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingBottom: 6,
        marginBottom: 6,
        borderBottom: "1px solid var(--primary-10)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--fb)",
          fontSize: 11,
          color: "var(--mid)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 13,
          fontWeight: 300,
          color: "var(--dark)",
        }}
      >
        {value}
      </span>
    </div>
  )
}
