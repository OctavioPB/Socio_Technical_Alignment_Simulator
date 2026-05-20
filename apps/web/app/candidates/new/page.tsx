"use client"

/**
 * /candidates/new — Candidate intake form.
 *
 * Client Component: collects GitHub URL + optional interview transcript,
 * POST to /candidates/extract (triggers Claude NLP agent), then redirects
 * to /candidates/{id} on success.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"
import type { CandidateProfile } from "@/lib/api/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ── Inline styles (BRAND.md) ──────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--fb)",
  fontSize: 14,
  color: "var(--dark)",
  border: "1px solid var(--primary-10)",
  borderRadius: 10,
  padding: "12px 16px",
  backgroundColor: "#ffffff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--fb)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "3px",
  textTransform: "uppercase",
  color: "var(--mid)",
  marginBottom: 8,
  display: "block",
}

export default function NewCandidatePage() {
  const router = useRouter()
  const [githubUrl, setGithubUrl] = useState("")
  const [transcript, setTranscript] = useState("")
  const [candidateId, setCandidateId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!githubUrl.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${BASE}/candidates/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          github_url: githubUrl.trim(),
          candidate_id: candidateId.trim() || undefined,
          transcript: transcript.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(detail.detail ?? `HTTP ${res.status}`)
      }

      const profile = (await res.json()) as CandidateProfile
      router.push(`/candidates/${profile.candidate_id}`)
    } catch (err) {
      setError((err as Error).message ?? "Extraction failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />

      {/* Hero */}
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
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Eyebrow light>NLP Extraction</Eyebrow>
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
            Extract a{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>
              candidate profile.
            </em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 540,
            }}
          >
            The Claude NLP agent analyses the candidate&apos;s GitHub repository and optional
            interview transcript to build a structured engineering profile — skills, collaboration
            style, and graph position estimate.
          </p>
        </div>
      </section>

      {/* Form */}
      <section
        style={{
          flex: 1,
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
          padding: "56px 48px",
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 14,
            boxShadow: "0 1px 6px rgba(0,51,102,0.09)",
            overflow: "hidden",
          }}
        >
          {/* Gold top accent */}
          <div style={{ height: 3, backgroundColor: "var(--gold)" }} />

          <form onSubmit={handleSubmit} style={{ padding: "32px 36px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* GitHub URL */}
              <div>
                <label style={labelStyle} htmlFor="github-url">
                  GitHub Repository URL *
                </label>
                <input
                  id="github-url"
                  type="url"
                  required
                  placeholder="https://github.com/username/repository"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  disabled={loading}
                  style={inputStyle}
                  data-testid="github-url-input"
                />
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 11,
                    color: "var(--mid)",
                    marginTop: 6,
                  }}
                >
                  The agent will read the README, top source files, and language data.
                  Public repositories only.
                </div>
              </div>

              {/* Candidate ID (optional) */}
              <div>
                <label style={labelStyle} htmlFor="candidate-id">
                  Candidate ID
                  <span
                    style={{
                      fontWeight: 400,
                      textTransform: "none",
                      letterSpacing: 0,
                      color: "var(--mid)",
                      marginLeft: 8,
                    }}
                  >
                    (optional — auto-generated if blank)
                  </span>
                </label>
                <input
                  id="candidate-id"
                  type="text"
                  placeholder="e.g. alice_backend_2026"
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  disabled={loading}
                  style={inputStyle}
                  data-testid="candidate-id-input"
                />
              </div>

              {/* Interview transcript */}
              <div>
                <label style={labelStyle} htmlFor="transcript">
                  Interview transcript
                  <span
                    style={{
                      fontWeight: 400,
                      textTransform: "none",
                      letterSpacing: 0,
                      color: "var(--mid)",
                      marginLeft: 8,
                    }}
                  >
                    (optional — improves collaboration vector accuracy)
                  </span>
                </label>
                <textarea
                  id="transcript"
                  placeholder="Paste interview notes or transcript here…"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  disabled={loading}
                  rows={6}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                  data-testid="transcript-input"
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    backgroundColor: "#FDEAEA",
                    borderRadius: 8,
                    padding: "12px 16px",
                    fontFamily: "var(--fb)",
                    fontSize: 13,
                    color: "#7A1020",
                    borderLeft: "3px solid #E03448",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Loading state note */}
              {loading && (
                <div
                  style={{
                    backgroundColor: "var(--primary-10)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    fontFamily: "var(--fb)",
                    fontSize: 13,
                    color: "var(--primary)",
                    borderLeft: "3px solid var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚙</span>
                  Analysing repository with Claude NLP agent… this takes 10–30 seconds.
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !githubUrl.trim()}
                data-testid="extract-btn"
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "#ffffff",
                  backgroundColor:
                    loading || !githubUrl.trim() ? "var(--mid)" : "var(--primary)",
                  border: "none",
                  borderRadius: 10,
                  padding: "14px 0",
                  cursor: loading || !githubUrl.trim() ? "not-allowed" : "pointer",
                  transition: "background-color 0.15s",
                }}
              >
                {loading ? "Extracting profile…" : "Extract candidate profile →"}
              </button>
            </div>
          </form>
        </div>

        {/* Info callout */}
        <div
          style={{
            marginTop: 20,
            backgroundColor: "#ffffff",
            borderRadius: 10,
            padding: "14px 18px",
            boxShadow: "0 1px 3px rgba(0,51,102,0.07)",
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
              color: "var(--gold)",
              marginBottom: 6,
            }}
          >
            How it works
          </div>
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 12,
              color: "var(--mid)",
              lineHeight: 1.65,
            }}
          >
            The Claude API agent reads the repository README, top source files, and language
            metadata. It extracts skills with proficiency evidence, derives a collaboration
            vector from code patterns, and estimates graph position — predicting how the candidate
            will integrate into your team topology.
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
