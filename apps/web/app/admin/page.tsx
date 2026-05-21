"use client"

import { useState, useEffect, useCallback } from "react"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type Stats = {
  teams: number
  engineers: number
  candidates: number
  edges: number
  redis_keys: number
}

type LogEntry = {
  id: number
  ts: string
  level: "info" | "success" | "error"
  message: string
}

let _logId = 0

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label, sub }: { value: number | string; label: string; sub?: string }) {
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 12,
        padding: "20px 24px",
        boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
        borderTop: "3px solid var(--gold)",
        minWidth: 120,
      }}
    >
      <div
        style={{
          fontFamily: "var(--fd)",
          fontSize: 34,
          fontWeight: 300,
          color: typeof value === "number" && value < 0 ? "var(--mid)" : "var(--dark)",
          lineHeight: 1,
          marginBottom: 6,
        }}
      >
        {typeof value === "number" && value < 0 ? "—" : value}
      </div>
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
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--fb)", fontSize: 10, color: "var(--mid)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Operation card ────────────────────────────────────────────────────────────

function OpCard({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions: React.ReactNode
}) {
  return (
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
            fontFamily: "var(--fd)",
            fontSize: 18,
            fontWeight: 400,
            color: "var(--dark)",
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <p
          style={{
            fontFamily: "var(--fb)",
            fontSize: 12,
            color: "var(--mid)",
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          {description}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
      </div>
    </div>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--fb)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: disabled ? "rgba(255,255,255,0.5)" : "#ffffff",
        backgroundColor: disabled ? "rgba(0,51,102,0.3)" : "var(--primary)",
        border: "none",
        borderRadius: 6,
        padding: "9px 18px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  )
}

function DangerBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--fb)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: disabled ? "var(--mid)" : "#c0192c",
        backgroundColor: "transparent",
        border: `1px solid ${disabled ? "var(--primary-30)" : "#e03448"}`,
        borderRadius: 6,
        padding: "9px 18px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  )
}

function GhostBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--fb)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: disabled ? "var(--mid)" : "var(--primary)",
        backgroundColor: "transparent",
        border: "1px solid var(--primary-30)",
        borderRadius: 6,
        padding: "9px 18px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  )
}

// ── Log level badge ───────────────────────────────────────────────────────────

const LOG_COLORS = {
  info:    { bg: "var(--primary-10)", text: "var(--primary-60)", dot: "var(--primary-60)" },
  success: { bg: "#e0f7ef",           text: "#0d5c3a",           dot: "var(--status-green)" },
  error:   { bg: "#fdeaea",           text: "#7a1020",           dot: "var(--status-red)" },
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [confirmTarget, setConfirmTarget] = useState<"graph" | "redis" | null>(null)

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false })
    setLog((prev) => [...prev, { id: ++_logId, ts, level, message }])
  }, [])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const r = await fetch(`${API}/admin/stats`)
      if (r.ok) setStats(await r.json())
      else addLog("error", `Stats fetch failed: HTTP ${r.status}`)
    } catch {
      addLog("error", "Cannot reach API — is the docker stack running?")
    } finally {
      setStatsLoading(false)
    }
  }, [addLog])

  useEffect(() => { fetchStats() }, [fetchStats])

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      if (busy[key]) return
      setBusy((b) => ({ ...b, [key]: true }))
      try {
        await fn()
      } finally {
        setBusy((b) => ({ ...b, [key]: false }))
        await fetchStats()
      }
    },
    [busy, fetchStats],
  )

  const handleSeed = () =>
    run("seed", async () => {
      addLog("info", "Seeding synthetic data…")
      const r = await fetch(`${API}/admin/seed`, { method: "POST" })
      const body = await r.json()
      if (r.ok) {
        addLog(
          "success",
          `Seeded ${body.engineers_seeded} engineers · ${body.edges_seeded} edges · teams: ${body.teams?.join(", ")}`,
        )
      } else {
        addLog("error", `Seed failed: ${body.detail ?? r.statusText}`)
      }
    })

  const handleClearGraph = () =>
    run("clearGraph", async () => {
      setConfirmTarget(null)
      addLog("info", "Clearing graph database…")
      const r = await fetch(`${API}/admin/graph`, { method: "DELETE" })
      const body = await r.json()
      if (r.ok) {
        addLog("success", `Graph cleared — ${body.nodes_deleted} nodes, ${body.edges_deleted} edges deleted`)
      } else {
        addLog("error", `Clear failed: ${body.detail ?? r.statusText}`)
      }
    })

  const handleClearRedis = () =>
    run("clearRedis", async () => {
      setConfirmTarget(null)
      addLog("info", "Flushing Redis cache…")
      const r = await fetch(`${API}/admin/redis`, { method: "DELETE" })
      const body = await r.json()
      if (r.ok) {
        addLog("success", `Redis flushed — ${body.keys_deleted} stas:* keys deleted`)
      } else {
        addLog("error", `Redis clear failed: ${body.detail ?? r.statusText}`)
      }
    })

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
          <Eyebrow light>System</Eyebrow>
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
            Admin{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>console.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 480,
              marginBottom: 36,
            }}
          >
            Manage the graph database, seed synthetic demo data, and flush caches.
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { value: statsLoading ? "…" : (stats?.teams ?? 0),      label: "Teams" },
              { value: statsLoading ? "…" : (stats?.engineers ?? 0),  label: "Engineers" },
              { value: statsLoading ? "…" : (stats?.edges ?? 0),      label: "Edges" },
              {
                value: statsLoading ? "…" : (stats?.candidates ?? 0),
                label: "Candidates",
                sub: "temporary",
              },
              {
                value: statsLoading ? "…" : (stats?.redis_keys ?? -1),
                label: "Redis keys",
                sub: "stas:*",
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{ borderLeft: "2px solid var(--gold)", paddingLeft: 18 }}
              >
                <div
                  style={{
                    fontFamily: "var(--fd)",
                    fontSize: 34,
                    fontWeight: 300,
                    color: "var(--gold-light)",
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {s.value === -1 ? "—" : s.value}
                </div>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  {s.label}
                  {s.sub && (
                    <span style={{ opacity: 0.6, marginLeft: 4 }}>{s.sub}</span>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={fetchStats}
              disabled={statsLoading}
              style={{
                alignSelf: "flex-end",
                background: "none",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 6,
                color: "rgba(255,255,255,0.5)",
                cursor: statsLoading ? "not-allowed" : "pointer",
                fontFamily: "var(--fb)",
                fontSize: 9,
                letterSpacing: "2px",
                textTransform: "uppercase",
                padding: "7px 14px",
              }}
            >
              {statsLoading ? "Refreshing…" : "Refresh"}
            </button>
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
        {/* Operations */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
            marginBottom: 40,
          }}
        >
          {/* Seed */}
          <OpCard
            title="Seed demo data"
            description="Insert 4 teams (Platform, Data Engineering, Frontend, Backend API) with 24 engineers and ~150 collaboration edges. Uses MERGE — safe to run on an existing graph."
            actions={
              <PrimaryBtn onClick={handleSeed} disabled={!!busy.seed}>
                {busy.seed ? "Seeding…" : "Seed synthetic data →"}
              </PrimaryBtn>
            }
          />

          {/* Clear graph */}
          <OpCard
            title="Clear graph database"
            description="Delete every node and relationship in Neo4j. This removes all engineers, candidates, and edges. Use before re-seeding for a clean slate."
            actions={
              confirmTarget === "graph" ? (
                <>
                  <DangerBtn onClick={handleClearGraph} disabled={!!busy.clearGraph}>
                    {busy.clearGraph ? "Clearing…" : "Confirm delete"}
                  </DangerBtn>
                  <GhostBtn onClick={() => setConfirmTarget(null)}>Cancel</GhostBtn>
                </>
              ) : (
                <DangerBtn onClick={() => setConfirmTarget("graph")}>
                  Clear database
                </DangerBtn>
              )
            }
          />

          {/* Clear Redis */}
          <OpCard
            title="Flush Redis cache"
            description="Delete all stas:* keys — candidate profiles, simulation results, NLP extraction cache. Does not affect the graph database. Useful after data model changes."
            actions={
              confirmTarget === "redis" ? (
                <>
                  <DangerBtn onClick={handleClearRedis} disabled={!!busy.clearRedis}>
                    {busy.clearRedis ? "Flushing…" : "Confirm flush"}
                  </DangerBtn>
                  <GhostBtn onClick={() => setConfirmTarget(null)}>Cancel</GhostBtn>
                </>
              ) : (
                <GhostBtn onClick={() => setConfirmTarget("redis")}>
                  Flush cache
                </GhostBtn>
              )
            }
          />
        </div>

        {/* Quick-reset helper */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            padding: "20px 28px",
            boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 40,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--fb)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--mid)",
                marginBottom: 4,
              }}
            >
              Quick reset
            </div>
            <p style={{ fontFamily: "var(--fb)", fontSize: 12, color: "var(--mid)" }}>
              Clear the graph and Redis, then immediately re-seed with fresh demo data.
            </p>
          </div>
          {confirmTarget === "reset" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <DangerBtn
                disabled={!!busy.clearGraph || !!busy.clearRedis || !!busy.seed}
                onClick={async () => {
                  setConfirmTarget(null)
                  await run("clearGraph", async () => {
                    addLog("info", "Quick reset: clearing graph…")
                    const r = await fetch(`${API}/admin/graph`, { method: "DELETE" })
                    const b = await r.json()
                    if (r.ok) addLog("success", `Graph cleared — ${b.nodes_deleted} nodes deleted`)
                    else addLog("error", `Clear failed: ${b.detail}`)
                  })
                  await run("clearRedis", async () => {
                    addLog("info", "Quick reset: flushing Redis…")
                    const r = await fetch(`${API}/admin/redis`, { method: "DELETE" })
                    const b = await r.json()
                    if (r.ok) addLog("success", `Redis flushed — ${b.keys_deleted} keys deleted`)
                    else addLog("error", `Redis flush failed: ${b.detail}`)
                  })
                  await run("seed", async () => {
                    addLog("info", "Quick reset: seeding…")
                    const r = await fetch(`${API}/admin/seed`, { method: "POST" })
                    const b = await r.json()
                    if (r.ok) addLog("success", `Seeded ${b.engineers_seeded} engineers, ${b.edges_seeded} edges`)
                    else addLog("error", `Seed failed: ${b.detail}`)
                  })
                }}
              >
                Confirm reset
              </DangerBtn>
              <GhostBtn onClick={() => setConfirmTarget(null)}>Cancel</GhostBtn>
            </div>
          ) : (
            <DangerBtn onClick={() => setConfirmTarget("reset")}>
              Clear + reseed
            </DangerBtn>
          )}
        </div>

        {/* Activity log */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
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
              Activity log
            </div>
            {log.length > 0 && (
              <button
                onClick={() => setLog([])}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "var(--mid)",
                  padding: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
              minHeight: 120,
            }}
          >
            {log.length === 0 ? (
              <div
                style={{
                  padding: "32px 28px",
                  fontFamily: "var(--fb)",
                  fontSize: 12,
                  color: "var(--mid)",
                  textAlign: "center",
                }}
              >
                No activity yet — run an operation above.
              </div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {[...log].reverse().map((entry) => {
                  const c = LOG_COLORS[entry.level]
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 12,
                        padding: "10px 24px",
                        borderBottom: "1px solid rgba(0,51,102,0.04)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "Courier New, monospace",
                          fontSize: 10,
                          color: "var(--mid)",
                          flexShrink: 0,
                          minWidth: 58,
                        }}
                      >
                        {entry.ts}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: c.bg,
                          borderRadius: 20,
                          padding: "2px 8px",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            backgroundColor: c.dot,
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--fb)",
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: "1.5px",
                            textTransform: "uppercase",
                            color: c.text,
                          }}
                        >
                          {entry.level}
                        </span>
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--fb)",
                          fontSize: 12,
                          color: "var(--dark)",
                          lineHeight: 1.5,
                        }}
                      >
                        {entry.message}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
