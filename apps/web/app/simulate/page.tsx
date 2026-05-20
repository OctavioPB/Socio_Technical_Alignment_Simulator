/**
 * /simulate — Sprint 7: The Simulator
 *
 * Server Component shell: fetches available team IDs from the API,
 * then mounts the client-side SimulatorWorkspace.
 */

import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { SimulatorWorkspace } from "./SimulatorWorkspace"

const API_URL = process.env.API_URL ?? "http://localhost:8000"

async function fetchTeams(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/graph/teams`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    return res.json() as Promise<string[]>
  } catch {
    return []
  }
}

export default async function SimulatePage() {
  const teams = await fetchTeams()

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--light)",
      }}
    >
      <Nav />

      {teams.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--fb)",
            fontSize: 14,
            color: "var(--mid)",
          }}
        >
          No teams available — seed the graph first with{" "}
          <code
            style={{
              fontFamily: "Courier New",
              fontSize: 13,
              backgroundColor: "var(--primary-10)",
              borderRadius: 4,
              padding: "2px 6px",
              marginLeft: 6,
            }}
          >
            make graph-seed
          </code>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <SimulatorWorkspace teams={teams} />
        </div>
      )}

      <Footer />
    </main>
  )
}
