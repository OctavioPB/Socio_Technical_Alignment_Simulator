/**
 * /teams/[id] — Server Component.
 *
 * Fetches the team's latest graph snapshot and centrality scores server-side,
 * then passes them to the <GraphLoader> client boundary for interactive rendering.
 */

import { notFound } from "next/navigation"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { GraphLoader } from "./GraphLoader"
import type { CentralityScore, GraphSnapshot } from "@/lib/api/types"

interface PageProps {
  params: { id: string }
}

// Server-side fetches use the internal Docker network URL, not the browser-facing one.
const API = process.env.API_URL ?? "http://localhost:8000"

async function fetchSnapshot(teamId: string): Promise<GraphSnapshot | null> {
  try {
    const res = await fetch(`${API}/graph/teams/${teamId}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function fetchCentrality(teamId: string): Promise<CentralityScore[]> {
  try {
    const res = await fetch(`${API}/graph/metrics/${teamId}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function TeamGraphPage({ params }: PageProps) {
  const teamId = params.id
  const snapshot = await fetchSnapshot(teamId)

  if (!snapshot) notFound()

  const centrality = await fetchCentrality(teamId)

  const capturedDate = new Date(snapshot.captured_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />

      {/* Page header */}
      <section
        style={{
          backgroundColor: "var(--primary)",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          padding: "48px 48px 40px",
        }}
      >
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <Eyebrow light>Knowledge Graph</Eyebrow>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 32,
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.25,
              marginBottom: 8,
            }}
          >
            {teamId}{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>
              topology
            </em>
          </h1>

          {/* Stat row */}
          <div style={{ display: "flex", gap: 32, marginTop: 20 }}>
            {[
              { value: String(snapshot.nodes.length), label: "Engineers" },
              { value: String(snapshot.edges.length), label: "Collaboration edges" },
              { value: capturedDate, label: "Snapshot date" },
            ].map((s) => (
              <div
                key={s.label}
                style={{ borderLeft: "2px solid var(--gold)", paddingLeft: 14 }}
              >
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 22,
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

      {/* Graph canvas area */}
      <section
        style={{
          maxWidth: 1300,
          margin: "0 auto",
          padding: "32px 48px 64px",
          flex: 1,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <GraphLoader
          teamId={teamId}
          initialSnapshot={snapshot}
          snapshots={[]}
          centrality={centrality}
        />
      </section>

      <Footer />
    </main>
  )
}
