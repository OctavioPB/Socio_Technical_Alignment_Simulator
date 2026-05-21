/**
 * /candidates/[id] — Candidate detail page.
 *
 * Server Component: fetches the candidate profile from the candidates API,
 * displays extracted skills, collaboration vector, and domain expertise,
 * with a CTA to run a simulation in the simulator workspace.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"
import type { CandidateProfile } from "@/lib/api/types"

interface PageProps {
  params: { id: string }
}

const API = process.env.API_URL ?? "http://localhost:8000"

async function fetchCandidate(id: string): Promise<CandidateProfile | null> {
  try {
    const res = await fetch(`${API}/candidates/${id}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json() as Promise<CandidateProfile>
  } catch {
    return null
  }
}

const COLLAB_LABELS: Record<string, string> = {
  async_preference:     "Async preference",
  pr_review_depth:      "PR review depth",
  documentation_habit:  "Documentation habit",
  pairing_affinity:     "Pairing affinity",
  mentoring_tendency:   "Mentoring tendency",
}

const POSITION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "knowledge hub":        { bg: "#E0F7EF", text: "#0D5C3A", dot: "#27B97C" },
  "cross-team connector": { bg: "#F0EBF9", text: "#3D1F70", dot: "#7C4DBD" },
  "domain specialist":    { bg: "#E0EAF4", text: "#001F4D", dot: "#003366" },
  "emerging contributor": { bg: "#FEF0E6", text: "#7A3800", dot: "#F07020" },
  "generalist":           { bg: "#F4F6F9", text: "#6B7280", dot: "#9CA3AF" },
}

const PROFICIENCY_COLORS: Record<string, { bg: string; text: string }> = {
  expert:       { bg: "#E0F7EF", text: "#0D5C3A" },
  advanced:     { bg: "#E0EAF4", text: "#001F4D" },
  intermediate: { bg: "#FEF0E6", text: "#7A3800" },
  beginner:     { bg: "#F4F6F9", text: "#6B7280" },
}

export default async function CandidatePage({ params }: PageProps) {
  const candidate = await fetchCandidate(params.id)
  if (!candidate) notFound()

  const posStyle = POSITION_COLORS[candidate.graph_position_estimate] ?? POSITION_COLORS.generalist
  const collabEntries = Object.entries(candidate.collaboration_vector) as [string, number][]

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
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Eyebrow light>Candidate Profile</Eyebrow>
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
            {candidate.candidate_id}{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>profile</em>
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
            {candidate.extraction_summary}
          </p>

          {/* KPI stat row */}
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 28 }}>
            {[
              { value: String(candidate.skills.length), label: "Skills extracted" },
              {
                value: candidate.graph_position_estimate,
                label: "Graph position",
              },
              {
                value: candidate.domain_expertise.join(", ") || "N/A",
                label: "Domain expertise",
              },
            ].map((s) => (
              <div key={s.label} style={{ borderLeft: "2px solid var(--gold)", paddingLeft: 14 }}>
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 16,
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

          {/* Run simulation CTA */}
          <Link
            href="/simulate"
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "var(--gold)",
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
              Run Simulation →
            </div>
          </Link>
        </div>
      </section>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "56px 48px",
          flex: 1,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "3fr 2fr",
            gap: 24,
          }}
        >
          {/* ── Skills ─────────────────────────────────────────────────── */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
            <div style={{ padding: "28px" }}>
              <Eyebrow>Skills</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {candidate.skills.map((s) => {
                  const pc = PROFICIENCY_COLORS[s.proficiency] ?? PROFICIENCY_COLORS.beginner
                  return (
                    <div
                      key={s.skill}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        paddingBottom: 12,
                        borderBottom: "1px solid var(--primary-10)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: "'Fraunces', Georgia, serif",
                            fontSize: 15,
                            fontWeight: 400,
                            color: "#0a1628",
                          }}
                        >
                          {s.skill}
                        </span>
                        {s.evidence && (
                          <p
                            style={{
                              fontFamily: "var(--fb)",
                              fontSize: 11,
                              color: "var(--mid)",
                              marginTop: 3,
                              lineHeight: 1.5,
                            }}
                          >
                            {s.evidence}
                          </p>
                        )}
                      </div>
                      <span
                        style={{
                          backgroundColor: pc.bg,
                          color: pc.text,
                          fontSize: 9,
                          fontFamily: "var(--fb)",
                          fontWeight: 600,
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          borderRadius: 4,
                          flexShrink: 0,
                          marginLeft: 12,
                        }}
                      >
                        {s.proficiency}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right column ────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Graph position card */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 12,
                boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                overflow: "hidden",
              }}
            >
              <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
              <div style={{ padding: "20px 22px" }}>
                <Eyebrow>Graph position</Eyebrow>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: posStyle.bg,
                    borderRadius: 20,
                    padding: "6px 14px",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: posStyle.dot,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--fb)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: posStyle.text,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    {candidate.graph_position_estimate}
                  </span>
                </div>

                {/* Domain expertise tags */}
                {candidate.domain_expertise.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {candidate.domain_expertise.map((d) => (
                      <span
                        key={d}
                        style={{
                          fontFamily: "var(--fb)",
                          fontSize: 10,
                          fontWeight: 500,
                          color: "var(--primary)",
                          backgroundColor: "var(--primary-10)",
                          borderRadius: 20,
                          padding: "3px 10px",
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Collaboration vector card */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 12,
                boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                overflow: "hidden",
              }}
            >
              <div style={{ height: 3, backgroundColor: "var(--gold)" }} />
              <div style={{ padding: "20px 22px" }}>
                <Eyebrow>Collaboration vector</Eyebrow>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {collabEntries.map(([dim, val]) => (
                    <div key={dim}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 5,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 12,
                            color: "#0a1628",
                          }}
                        >
                          {COLLAB_LABELS[dim] ?? dim}
                        </span>
                        <span
                          style={{
                            fontFamily: "'Fraunces', Georgia, serif",
                            fontSize: 13,
                            fontWeight: 300,
                            color: "var(--primary)",
                          }}
                        >
                          {(val as number).toFixed(2)}
                        </span>
                      </div>
                      <div
                        style={{
                          backgroundColor: "var(--primary-10)",
                          borderRadius: 4,
                          height: 5,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.round((val as number) * 100)}%`,
                            height: "100%",
                            backgroundColor: "var(--primary)",
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* GitHub link + run simulation */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 12,
                boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {candidate.github_url && (
                <a
                  href={candidate.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 12,
                    color: "var(--primary)",
                    textDecoration: "none",
                    borderBottom: "1px solid var(--primary-30)",
                    paddingBottom: 2,
                  }}
                >
                  {candidate.github_url} ↗
                </a>
              )}

              <Link href="/simulate" style={{ textDecoration: "none" }}>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "#ffffff",
                    backgroundColor: "var(--primary)",
                    borderRadius: 8,
                    padding: "10px 0",
                    textAlign: "center",
                  }}
                >
                  Run New Simulation →
                </div>
              </Link>

              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 10,
                  color: "var(--mid)",
                  lineHeight: 1.55,
                }}
              >
                Extracted {new Date(candidate.extracted_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
