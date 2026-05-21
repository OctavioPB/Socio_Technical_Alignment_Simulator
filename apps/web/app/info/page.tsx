"use client"

import { useState } from "react"
import { Nav } from "@/components/ui/Nav"
import { Footer } from "@/components/ui/Footer"
import { Eyebrow } from "@/components/ui/Eyebrow"

type View = "business" | "engineering"

// ── Raw hex constants — SVG fill/stroke cannot use CSS custom properties ──────
const H = {
  navy:   "#003366",
  n80:    "#1a4d80",
  n60:    "#336699",
  n30:    "#99bbdd",
  n10:    "#e0eaf4",
  gold:   "#c8982a",
  goldL:  "#e8c46a",
  dark:   "#1c1c2e",
  mid:    "#6b7280",
  white:  "#ffffff",
  light:  "#f4f6f9",
}

// ── Shared style objects ───────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  padding: "28px",
  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
  border: "1px solid #e0eaf4",
}

const bodyWrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "48px 48px 72px",
}

const divider: React.CSSProperties = {
  height: 1,
  backgroundColor: "#e0eaf4",
  margin: "56px 0",
}

const h2: React.CSSProperties = {
  fontFamily: "var(--fd)",
  fontSize: 24,
  fontWeight: 300,
  color: "var(--dark)",
  marginBottom: 12,
  marginTop: 0,
}

const prose: React.CSSProperties = {
  fontFamily: "var(--fb)",
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.75,
  maxWidth: 740,
  marginBottom: 32,
  marginTop: 0,
}

// ── Architecture diagram ───────────────────────────────────────────────────────

function ArchDiagram() {
  const { navy, n80, n60, n30, n10, gold, mid, white } = H
  return (
    <svg
      viewBox="0 0 760 456"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label="STAS system architecture diagram"
    >
      {/* ── FRONTEND ── */}
      <rect x="20" y="16" width="720" height="62" rx="8" fill={n10} stroke={navy} strokeWidth="1.5" />
      <text x="380" y="38" textAnchor="middle" fill={navy} fontSize="9" fontWeight="700" letterSpacing="3" fontFamily="Plus Jakarta Sans,sans-serif">FRONTEND</text>
      <text x="380" y="56" textAnchor="middle" fill={n60} fontSize="11" fontFamily="Plus Jakarta Sans,sans-serif">Next.js 14 App Router · TypeScript strict · React Server Components</text>
      <text x="380" y="71" textAnchor="middle" fill={mid} fontSize="10" fontFamily="Plus Jakarta Sans,sans-serif">Dashboard · Teams · Simulator · Info</text>

      {/* Arrow ↓ REST+SSE */}
      <line x1="380" y1="78" x2="380" y2="108" stroke={n60} strokeWidth="1.5" strokeDasharray="4,3" />
      <polygon points="375,108 385,108 380,118" fill={n60} />
      <text x="394" y="97" fill={mid} fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">REST · SSE</text>

      {/* ── API GATEWAY ── */}
      <rect x="20" y="118" width="720" height="62" rx="8" fill={navy} stroke={n80} strokeWidth="1.5" />
      <text x="380" y="140" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9" fontWeight="700" letterSpacing="3" fontFamily="Plus Jakarta Sans,sans-serif">API GATEWAY</text>
      <text x="380" y="158" textAnchor="middle" fill={white} fontSize="11" fontFamily="Plus Jakarta Sans,sans-serif">FastAPI · Python 3.11 · Pydantic v2 · slowapi rate limiting</text>
      <text x="380" y="173" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="Plus Jakarta Sans,sans-serif">Auth · CORS · SSE streaming · Clerk JWT (optional)</text>

      {/* Arrows ↓ x3 to services */}
      <line x1="130" y1="180" x2="130" y2="208" stroke={n60} strokeWidth="1.5" strokeDasharray="4,3" />
      <polygon points="125,208 135,208 130,218" fill={n60} />
      <line x1="380" y1="180" x2="380" y2="208" stroke={n60} strokeWidth="1.5" strokeDasharray="4,3" />
      <polygon points="375,208 385,208 380,218" fill={n60} />
      <line x1="630" y1="180" x2="630" y2="208" stroke={n60} strokeWidth="1.5" strokeDasharray="4,3" />
      <polygon points="625,208 635,208 630,218" fill={n60} />

      {/* ── SERVICE: Graph ── */}
      <rect x="20" y="218" width="215" height="100" rx="8" fill={white} stroke={navy} strokeWidth="1.5" />
      <rect x="20" y="218" width="215" height="3" rx="2" fill={gold} />
      <text x="127" y="240" textAnchor="middle" fill={navy} fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="Plus Jakarta Sans,sans-serif">GRAPH SERVICE</text>
      <text x="127" y="258" textAnchor="middle" fill={n60} fontSize="11" fontFamily="Plus Jakarta Sans,sans-serif">Neo4j 5.x · Cypher · GDS</text>
      <text x="127" y="274" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Engineer + Candidate nodes</text>
      <text x="127" y="289" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Weighted collaboration edges</text>
      <text x="127" y="304" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Immutable graph snapshots</text>

      {/* ── SERVICE: Simulation ── */}
      <rect x="272" y="218" width="215" height="100" rx="8" fill={white} stroke={navy} strokeWidth="1.5" />
      <rect x="272" y="218" width="215" height="3" rx="2" fill={gold} />
      <text x="380" y="240" textAnchor="middle" fill={navy} fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="Plus Jakarta Sans,sans-serif">SIMULATION ENGINE</text>
      <text x="380" y="258" textAnchor="middle" fill={n60} fontSize="11" fontFamily="Plus Jakarta Sans,sans-serif">Monte Carlo · NetworkX · SciPy</text>
      <text x="380" y="274" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">1,000 iterations per run (max 10k)</text>
      <text x="380" y="289" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Closeness centrality · TTV</text>
      <text x="380" y="304" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Silo risk · Betweenness Δ</text>

      {/* ── SERVICE: NLP Agent ── */}
      <rect x="524" y="218" width="215" height="100" rx="8" fill={white} stroke={navy} strokeWidth="1.5" />
      <rect x="524" y="218" width="215" height="3" rx="2" fill={gold} />
      <text x="631" y="240" textAnchor="middle" fill={navy} fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="Plus Jakarta Sans,sans-serif">NLP AGENT</text>
      <text x="631" y="258" textAnchor="middle" fill={n60} fontSize="11" fontFamily="Plus Jakarta Sans,sans-serif">Claude API · Tool use</text>
      <text x="631" y="274" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">GitHub repo analysis</text>
      <text x="631" y="289" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Interview transcript NLP</text>
      <text x="631" y="304" textAnchor="middle" fill={mid} fontSize="9.5" fontFamily="Plus Jakarta Sans,sans-serif">Redis cache · 24 h TTL</text>

      {/* Arrow ↑ pipeline → graph */}
      <line x1="127" y1="392" x2="127" y2="328" stroke={n60} strokeWidth="1.5" strokeDasharray="4,3" />
      <polygon points="122,328 132,328 127,318" fill={n60} />
      <text x="142" y="368" fill={mid} fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">Graph rebuild</text>

      {/* ── EVENT PIPELINE ── */}
      <rect x="20" y="392" width="720" height="54" rx="8" fill={n10} stroke={navy} strokeWidth="1.5" />
      <text x="380" y="414" textAnchor="middle" fill={navy} fontSize="9" fontWeight="700" letterSpacing="3" fontFamily="Plus Jakarta Sans,sans-serif">EVENT PIPELINE</text>
      <text x="380" y="432" textAnchor="middle" fill={n60} fontSize="11" fontFamily="Plus Jakarta Sans,sans-serif">Apache Kafka 3.7 · Airflow 2.8 DAGs</text>
      <text x="380" y="446" textAnchor="middle" fill={mid} fontSize="10" fontFamily="Plus Jakarta Sans,sans-serif">Slack · GitHub · Jira connectors → telemetry_ingestion + graph_rebuild DAGs</text>
    </svg>
  )
}

// ── Graph model diagram ────────────────────────────────────────────────────────

function GraphModelDiagram() {
  const { navy, n80, n30, gold, goldL, mid } = H

  type Node = { id: string; x: number; y: number; label: string; sub: string; isCandidate: boolean }
  type Edge = { x1: number; y1: number; x2: number; y2: number; dash: boolean }

  const nodes: Node[] = [
    { id: "alice", x: 100, y: 130, label: "Alice",     sub: "senior",      isCandidate: false },
    { id: "bob",   x: 280, y:  65, label: "Bob",       sub: "staff",       isCandidate: false },
    { id: "carol", x: 460, y:  65, label: "Carol",     sub: "senior",      isCandidate: false },
    { id: "dave",  x: 580, y: 165, label: "Dave",      sub: "mid",         isCandidate: false },
    { id: "eve",   x: 280, y: 225, label: "Eve",       sub: "junior",      isCandidate: false },
    { id: "cand",  x: 460, y: 225, label: "Candidate", sub: "simulated",   isCandidate: true  },
  ]

  const edges: Edge[] = [
    { x1: 100, y1: 130, x2: 280, y2:  65, dash: false },
    { x1: 280, y1:  65, x2: 460, y2:  65, dash: false },
    { x1: 460, y1:  65, x2: 580, y2: 165, dash: false },
    { x1: 100, y1: 130, x2: 280, y2: 225, dash: false },
    { x1: 280, y1: 225, x2: 460, y2:  65, dash: false },
    { x1: 580, y1: 165, x2: 280, y2: 225, dash: false },
    // Simulated edges from candidate
    { x1: 460, y1: 225, x2: 280, y2:  65, dash: true  },
    { x1: 460, y1: 225, x2: 460, y2:  65, dash: true  },
    { x1: 460, y1: 225, x2: 580, y2: 165, dash: true  },
  ]

  return (
    <svg
      viewBox="0 0 700 300"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label="Knowledge graph with candidate node insertion"
    >
      {edges.map((e, i) => (
        <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke={e.dash ? gold : n30}
          strokeWidth={e.dash ? 1.5 : 1}
          strokeDasharray={e.dash ? "5,3" : undefined}
          opacity={0.8}
        />
      ))}

      {nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={28}
            fill={n.isCandidate ? gold : navy}
            stroke={n.isCandidate ? goldL : n80}
            strokeWidth={n.isCandidate ? 2 : 1}
            strokeDasharray={n.isCandidate ? "5,3" : undefined}
          />
          <text x={n.x} y={n.y - 4} textAnchor="middle"
            fill={n.isCandidate ? "#1c1c2e" : "#ffffff"}
            fontSize="10" fontWeight="600" fontFamily="Plus Jakarta Sans,sans-serif">
            {n.label}
          </text>
          <text x={n.x} y={n.y + 12} textAnchor="middle"
            fill={n.isCandidate ? "rgba(28,28,46,0.65)" : "rgba(255,255,255,0.6)"}
            fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">
            {n.sub}
          </text>
        </g>
      ))}

      {/* Legend */}
      <rect x="16" y="272" width="668" height="22" rx="5" fill="#f4f6f9" stroke="#e0eaf4" strokeWidth="1" />
      <circle cx="34" cy="283" r="5" fill={navy} />
      <text x="44" y="287" fill={mid} fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">Engineer node</text>
      <circle cx="170" cy="283" r="5" fill={gold} />
      <text x="180" y="287" fill={mid} fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">Candidate (simulated insertion)</text>
      <line x1="338" y1="283" x2="358" y2="283" stroke={n30} strokeWidth="1.5" />
      <text x="364" y="287" fill={mid} fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">Existing collaboration edge</text>
      <line x1="510" y1="283" x2="530" y2="283" stroke={gold} strokeWidth="1.5" strokeDasharray="4,3" />
      <text x="536" y="287" fill={mid} fontSize="9" fontFamily="Plus Jakarta Sans,sans-serif">Simulated SHARES_DOMAIN edge</text>
    </svg>
  )
}

// ── Simulation flow diagram ────────────────────────────────────────────────────

function SimFlowDiagram() {
  const { navy, n10, n30, gold, mid } = H

  const steps = [
    { n: "1", title: "Freeze snapshot",     code: "graph_service.freeze(team_id)",               note: "Immutable copy — live mutations have no effect on the run" },
    { n: "2", title: "Sample edge weights", code: "w ~ Beta(α=skill_overlap, β=1−overlap)",        note: "Draws from a Beta distribution per engineer; introduces statistical variance" },
    { n: "3", title: "Insert candidate",    code: "G.add_node(candidate_id); G.add_edges(…)",    note: "Candidate node and weighted edges added to the in-memory graph copy" },
    { n: "4", title: "Compute centrality",  code: "nx.closeness_centrality(G, u=candidate_id)",  note: "Delegates to gds.closeness.stream() for graphs > 200 nodes" },
    { n: "5", title: "Aggregate results",   code: "DistributionResult(mean, std, ci_95, p50, p95)", note: "Across all N iterations — output includes 95% CI, never a point estimate alone" },
  ]

  return (
    <svg
      viewBox="0 0 760 92"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label="Monte Carlo simulation iteration flow"
    >
      {steps.map((s, i) => {
        const x = 20 + i * 148
        const isKey = i === 2
        return (
          <g key={s.n}>
            <rect x={x} y="10" width="132" height="70" rx="7"
              fill={isKey ? navy : n10}
              stroke={isKey ? "#1a4d80" : "#99bbdd"}
              strokeWidth="1.5"
            />
            {isKey && <rect x={x} y="10" width="132" height="3" rx="2" fill={gold} />}
            <text x={x + 66} y={isKey ? 34 : 32} textAnchor="middle"
              fill={isKey ? "rgba(255,255,255,0.5)" : "#6b7280"}
              fontSize="8" fontWeight="700" letterSpacing="2" fontFamily="Plus Jakarta Sans,sans-serif">
              STEP {s.n}
            </text>
            <text x={x + 66} y={isKey ? 50 : 48} textAnchor="middle"
              fill={isKey ? "#ffffff" : navy}
              fontSize="10.5" fontWeight="600" fontFamily="Plus Jakarta Sans,sans-serif">
              {s.title}
            </text>
            <text x={x + 66} y={isKey ? 66 : 64} textAnchor="middle"
              fill={isKey ? "rgba(255,255,255,0.55)" : "#6b7280"}
              fontSize="8.5" fontFamily="Courier New,monospace">
              {s.code.length > 22 ? s.code.slice(0, 22) + "…" : s.code}
            </text>
            {i < steps.length - 1 && (
              <text x={x + 140} y="49" textAnchor="middle"
                fill={n30} fontSize="16" fontFamily="Plus Jakarta Sans,sans-serif">
                →
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Business view ─────────────────────────────────────────────────────────────

function BusinessView() {
  return (
    <div style={{ backgroundColor: "var(--light)", flex: 1 }}>
      <div style={bodyWrap}>

        {/* Problem */}
        <Eyebrow>The problem</Eyebrow>
        <h2 style={h2}>Hiring decisions rest on signals that do not predict team integration.</h2>
        <p style={prose}>
          Interview panels assess individual capability — coding performance, system design, and domain
          knowledge. They rarely assess how the candidate will alter the flow of information across the
          existing team. Culture fit attempts to fill this gap, but it is qualitative, inconsistent across
          interviewers, and disconnected from the structural properties of the team itself.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginBottom: 56 }}>
          {[
            {
              n: "01", title: "Subjective evaluation",
              body: "Culture fit is assessed differently by each interviewer. The same candidate can receive opposing assessments on the same criterion from two senior engineers reviewing independently.",
            },
            {
              n: "02", title: "Unknown onboarding timeline",
              body: "Time-to-Value is estimated informally, often after the hire. Teams discover that a new hire's skills do not overlap with their active knowledge gaps only after ramp-up falls behind.",
            },
            {
              n: "03", title: "Knowledge silo formation",
              body: "Engineers who do not integrate into the team's communication graph become isolated contributors. This is invisible at hire time and structurally expensive to reverse.",
            },
            {
              n: "04", title: "Topology blindness",
              body: "Interviews evaluate candidates in isolation. No standard method exists for predicting how a hire reshapes the team's collaboration graph before the hire is made.",
            },
          ].map(p => (
            <div key={p.n} style={card}>
              <div style={{ fontFamily: "var(--fd)", fontSize: 36, fontWeight: 300, color: "var(--primary-30)", lineHeight: 1, marginBottom: 4, userSelect: "none" }}>
                {p.n}
              </div>
              <div style={{ width: 28, height: 3, backgroundColor: "var(--gold)", borderRadius: 2, margin: "6px 0 12px" }} />
              <div style={{ fontFamily: "var(--fd)", fontSize: 15, fontWeight: 400, color: "var(--dark)", marginBottom: 8 }}>{p.title}</div>
              <p style={{ fontFamily: "var(--fb)", fontSize: 13, color: "#475569", lineHeight: 1.65, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>

        <div style={divider} />

        {/* How it works */}
        <Eyebrow>How it works</Eyebrow>
        <h2 style={h2}>Graph simulation as a pre-hire measurement tool.</h2>
        <p style={prose}>
          The system models the engineering team as a directed knowledge graph built from real collaboration
          data: pull request reviews, Slack question resolution threads, and Jira ticket dependencies. When
          a candidate is evaluated, a synthetic node is inserted into the graph and the resulting topology
          is measured via Monte Carlo simulation across 1,000 iterations. The output is a statistical
          distribution — not a score.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 56 }}>
          {[
            {
              step: "1", title: "Build the team graph",
              body: "Kafka connectors ingest collaboration events from GitHub, Slack, and Jira. Airflow DAGs aggregate these into a weighted directed graph in Neo4j, where each edge represents a collaboration channel and its weight reflects frequency over the trailing 90 days. The graph is rebuilt on a schedule and on significant topology events.",
            },
            {
              step: "2", title: "Extract the candidate profile",
              body: "The Claude NLP agent reads the candidate's GitHub repository — README, source files, language composition — and optionally an interview transcript. It outputs a structured profile: skills with proficiency evidence, a collaboration vector across five behavioural dimensions (async preference, PR review depth, documentation habit, pairing affinity, mentoring tendency), and a predicted graph position label.",
            },
            {
              step: "3", title: "Run the simulation",
              body: "The simulation engine freezes a snapshot of the current team graph, inserts the candidate node, and draws edges to existing engineers based on skill overlap scores. This insertion is repeated 1,000 times with edge weights sampled from a Beta distribution calibrated to the overlap score. Each iteration records closeness centrality, time-to-value, silo risk, and betweenness delta.",
            },
            {
              step: "4", title: "Interpret the output",
              body: "The report presents each metric as a full distribution: mean, standard deviation, 95% confidence interval, and a percentile table (p5 through p95). Recruiters receive a plain-language hire signal category. Engineering managers receive the full statistical output, the knowledge gap coverage list, and the betweenness delta — which quantifies how the candidate changes the team's internal pathway structure.",
            },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", gap: 20, padding: "20px 24px", backgroundColor: "#ffffff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,51,102,0.06)", borderLeft: "3px solid var(--gold)" }}>
              <div style={{ fontFamily: "var(--fd)", fontSize: 30, fontWeight: 300, color: "var(--primary-30)", lineHeight: 1, flexShrink: 0, width: 32, paddingTop: 4 }}>{s.step}</div>
              <div>
                <div style={{ fontFamily: "var(--fd)", fontSize: 16, fontWeight: 400, color: "var(--dark)", marginBottom: 6 }}>{s.title}</div>
                <p style={{ fontFamily: "var(--fb)", fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={divider} />

        {/* Output metrics */}
        <Eyebrow>Output metrics</Eyebrow>
        <h2 style={h2}>Four measurable signals, each with a 95% confidence interval.</h2>
        <p style={prose}>
          Every metric is the output of a distribution, not a point estimate. The confidence interval width
          reflects the genuine uncertainty in how the candidate will integrate. Dense, well-connected teams
          produce narrower intervals; sparse or siloed teams produce wider ones.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 56 }}>
          {[
            {
              label: "Closeness Centrality", range: "0 → 1",
              meaning: "How quickly the candidate reaches any other team member through the collaboration graph. Values above 0.55 indicate fast knowledge access; values below 0.40 indicate structural isolation risk.",
            },
            {
              label: "Time to Value", range: "in weeks",
              meaning: "Estimated time until the candidate transitions from net consumer to net contributor of team knowledge. Derived from edge density and weight in the candidate's simulated graph neighbourhood.",
            },
            {
              label: "Silo Risk", range: "0 → 1",
              meaning: "Probability the candidate ends up structurally isolated — connected to fewer than two engineers through high-weight paths after 90 days. Scores above 0.66 are flagged as high risk.",
            },
            {
              label: "Betweenness Delta", range: "−1 → +1",
              meaning: "Change in the number of shortest paths between existing team members that pass through the candidate. Positive values indicate the candidate bridges currently disconnected sub-graphs.",
            },
          ].map(m => (
            <div key={m.label} style={{ ...card, borderTop: "3px solid var(--gold)", paddingTop: 20 }}>
              <div style={{ fontFamily: "var(--fb)", fontSize: 9, textTransform: "uppercase", letterSpacing: "3px", color: "var(--mid)", marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontFamily: "var(--fd)", fontSize: 22, fontWeight: 300, color: "var(--primary)", marginBottom: 10 }}>{m.range}</div>
              <p style={{ fontFamily: "var(--fb)", fontSize: 12, color: "#475569", lineHeight: 1.65, margin: 0 }}>{m.meaning}</p>
            </div>
          ))}
        </div>

        <div style={divider} />

        {/* Workflow */}
        <Eyebrow>Workflow</Eyebrow>
        <h2 style={h2}>Where it fits in the hiring process.</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[
            {
              role: "Recruiter",
              body: "After initial technical screens, before the final panel. The recruiter submits the candidate's GitHub URL and any available interview notes. The system returns a hire signal category within 30–60 seconds. Profiles are cached for 24 hours — the same candidate submitted to multiple team simulations incurs no additional extraction cost.",
            },
            {
              role: "Engineering Manager",
              body: "During team planning and headcount decisions. The graph topology view shows current team cohesion and identifies which structural positions the team is missing. The simulation report provides statistical evidence for sequencing hires — which role, added to which sub-graph, produces the largest improvement in team-wide closeness centrality.",
            },
          ].map(r => (
            <div key={r.role} style={{ ...card, borderLeft: "3px solid var(--gold)" }}>
              <div style={{ fontFamily: "var(--fb)", fontSize: 9, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>{r.role}</div>
              <p style={{ fontFamily: "var(--fb)", fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>{r.body}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// ── Engineering view ──────────────────────────────────────────────────────────

function EngineeringView() {
  return (
    <div style={{ backgroundColor: "var(--light)", flex: 1 }}>
      <div style={bodyWrap}>

        {/* Architecture */}
        <Eyebrow>Architecture</Eyebrow>
        <h2 style={h2}>Five independently deployable layers.</h2>
        <p style={prose}>
          The frontend communicates exclusively with the FastAPI gateway over REST and SSE. No service is
          directly addressable from the browser. Service-to-service calls are internal to the Docker or
          Kubernetes network. The read path (graph queries, simulation runs, NLP extraction) is separated
          from the write path (telemetry ingestion, graph rebuilds) via the Kafka event pipeline.
        </p>
        <div style={{ ...card, padding: "20px", marginBottom: 56 }}>
          <ArchDiagram />
        </div>

        <div style={divider} />

        {/* Graph data model */}
        <Eyebrow>Graph data model</Eyebrow>
        <h2 style={h2}>Nodes, edges, and the candidate insertion point.</h2>
        <p style={prose}>
          The graph is a directed multigraph stored in Neo4j. Engineers are permanent nodes with skill
          arrays and seniority labels. Candidates are ephemeral nodes inserted for simulation only — they
          are not written to the live graph. Relationship types encode distinct collaboration channels,
          each contributing a separate signal to edge weight.
        </p>
        <div style={{ ...card, padding: "20px", marginBottom: 24 }}>
          <GraphModelDiagram />
        </div>

        {/* Relationship schema table */}
        <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 56 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--primary)" }}>
                {["Relationship type", "Direction", "Source system", "Semantic meaning"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 10, fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "#ffffff", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["REVIEWS_PR_OF",       "Eng → Eng",           "GitHub",     "PR review activity; weight = count per trailing quarter"],
                ["RESOLVES_DOUBT_FOR",  "Eng → Eng",           "Slack",      "Direct technical answers in monitored channels"],
                ["BLOCKS_TICKET_OF",    "Eng → Eng",           "Jira",       "Ticket dependency relationships; indicates cross-domain coupling"],
                ["PAIR_PROGRAMS_WITH",  "Eng ↔ Eng",           "Inferred",   "Co-authored commits and co-located session signals"],
                ["SHARES_DOMAIN_WITH",  "Eng → Candidate",     "Simulation", "Projected edge; created during each Monte Carlo iteration and discarded afterward"],
              ].map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "var(--primary-10)" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "Courier New, monospace", fontSize: 12, color: "var(--primary)", whiteSpace: "nowrap" }}>{row[0]}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 12, color: "var(--mid)", whiteSpace: "nowrap" }}>{row[1]}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 12, color: "var(--dark)" }}>{row[2]}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={divider} />

        {/* Simulation engine */}
        <Eyebrow>Simulation engine</Eyebrow>
        <h2 style={h2}>Monte Carlo candidate insertion over frozen snapshots.</h2>
        <p style={prose}>
          Each simulation run is deterministic given a fixed seed. The same candidate, snapshot, and seed
          always produce byte-identical output — a deliberate constraint that makes results auditable and
          diff-able over time as the team graph evolves. Long simulations (
          {">"} 500 nodes, {">"} 5,000 iterations) stream progress via SSE.
        </p>

        {/* Simulation flow */}
        <div style={{ ...card, padding: "20px", marginBottom: 24 }}>
          <SimFlowDiagram />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 16 }}>
            {[
              "A point-in-time copy of the graph is taken. All N iterations run against the same frozen state.",
              "Per engineer in the candidate's skill neighbourhood, an edge weight is drawn from Beta(α, β) parameterised by skill cosine similarity.",
              "The candidate node and its sampled edges are added to an in-memory copy of the frozen graph.",
              "Closeness centrality is computed for the candidate node. Delegates to Neo4j GDS for graphs > 200 nodes.",
              "After all iterations: mean, std, 95% CI, and percentile table are computed. No point estimates in output.",
            ].map((note, i) => (
              <p key={i} style={{ fontFamily: "var(--fb)", fontSize: 11, color: "var(--mid)", lineHeight: 1.55, margin: 0 }}>{note}</p>
            ))}
          </div>
        </div>

        {/* Centrality formula */}
        <div style={{ ...card, backgroundColor: "var(--primary-10)", borderLeft: "3px solid var(--gold)", marginBottom: 56 }}>
          <div style={{ fontFamily: "var(--fb)", fontSize: 9, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>
            Closeness centrality — Bavelas 1950, normalised by Freeman 1979
          </div>
          <code style={{ fontFamily: "Courier New, monospace", fontSize: 15, color: "var(--primary)", display: "block", marginBottom: 10 }}>
            {"C_C(v) = (n − 1) / Σ d(u, v)   for all u ≠ v"}
          </code>
          <p style={{ fontFamily: "var(--fb)", fontSize: 13, color: "var(--mid)", lineHeight: 1.65, margin: 0 }}>
            <code style={{ fontFamily: "Courier New", fontSize: 12 }}>v</code> is the candidate node.{" "}
            <code style={{ fontFamily: "Courier New", fontSize: 12 }}>n</code> is the total node count.{" "}
            <code style={{ fontFamily: "Courier New", fontSize: 12 }}>d(u, v)</code> is the geodesic distance
            (shortest weighted path) between the candidate and each engineer. The numerator normalises the
            result to [0, 1] so values are comparable across graphs of different sizes.
          </p>
        </div>

        <div style={divider} />

        {/* NLP pipeline */}
        <Eyebrow>NLP pipeline</Eyebrow>
        <h2 style={h2}>Structured extraction via Claude tool use — no free-text parsing.</h2>
        <p style={prose}>
          The NLP agent uses the Anthropic API's tool use feature to force output into a typed schema. The
          model fills an <code style={{ fontFamily: "Courier New", fontSize: 13 }}>extract_candidate_profile</code>{" "}
          tool call with structured JSON, which is validated by a Pydantic v2 model before being persisted.
          A semaphore limits concurrent Claude calls to five to stay within rate limits.
        </p>

        {/* Pipeline step flow */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginBottom: 24, overflowX: "auto" }}>
          {[
            { label: "GitHub URL",     sub: "input",                  key: false },
            { label: "httpx fetch",    sub: "README + top 5 files",   key: false },
            { label: "Claude API",     sub: "tool use call",          key: true  },
            { label: "Pydantic parse", sub: "CandidateProfile model", key: false },
            { label: "Redis write",    sub: "24 h TTL per URL hash",  key: false },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ backgroundColor: s.key ? "var(--primary)" : "var(--primary-10)", border: `1px solid ${s.key ? "#1a4d80" : "var(--primary-30)"}`, borderRadius: 8, padding: "12px 18px", textAlign: "center", minWidth: 120 }}>
                <div style={{ fontFamily: "var(--fb)", fontSize: 11, fontWeight: 600, color: s.key ? "#ffffff" : "var(--dark)" }}>{s.label}</div>
                <div style={{ fontFamily: "var(--fb)", fontSize: 10, color: s.key ? "rgba(255,255,255,0.55)" : "var(--mid)", marginTop: 3 }}>{s.sub}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ padding: "0 8px", color: "var(--primary-30)", fontSize: 18, flexShrink: 0 }}>→</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ ...card, marginBottom: 56 }}>
          <div style={{ fontFamily: "var(--fb)", fontSize: 9, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "var(--mid)", marginBottom: 12 }}>
            Extracted schema fields
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {[
              { field: "skills[]",                  type: "SkillWithProficiency",   note: "Each skill has name + proficiency level + evidence string" },
              { field: "collaboration_vector",       type: "CollaborationVector",    note: "Five float dimensions normalised to [0, 1]" },
              { field: "domain_expertise[]",         type: "list[str]",              note: "High-level domain labels inferred from repository content" },
              { field: "graph_position_estimate",    type: "Literal[5 values]",      note: "knowledge hub · cross-team connector · domain specialist · emerging contributor · generalist" },
              { field: "extraction_summary",         type: "str",                    note: "1–2 sentence plain-language summary generated by the model" },
            ].map(f => (
              <div key={f.field} style={{ backgroundColor: "var(--primary-10)", borderRadius: 8, padding: "10px 14px" }}>
                <code style={{ fontFamily: "Courier New", fontSize: 12, color: "var(--primary)", display: "block", marginBottom: 4 }}>{f.field}</code>
                <div style={{ fontFamily: "var(--fb)", fontSize: 10, color: "var(--mid)", marginBottom: 4 }}>{f.type}</div>
                <p style={{ fontFamily: "var(--fb)", fontSize: 11, color: "#475569", lineHeight: 1.5, margin: 0 }}>{f.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={divider} />

        {/* Tech stack */}
        <Eyebrow>Tech stack</Eyebrow>
        <h2 style={h2}>Component choices and rationale.</h2>

        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--primary)" }}>
                {["Layer", "Technology", "Version", "Rationale"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 10, fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "#ffffff", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Frontend",       "Next.js + TypeScript",   "14 / 5.x",          "App Router enables server-side graph data fetch without client waterfall; RSC for initial render, client components only for interactive state"],
                ["Visualisation",  "react-force-graph",      "latest",             "D3-based force simulation handles 500+ node graphs; WebGL renderer via three.js for large snapshots"],
                ["API",            "FastAPI",                 "0.111",              "Async Python, native Pydantic v2 serialisation, built-in OpenAPI docs at /docs; SSE via StreamingResponse without WebSocket overhead"],
                ["Graph DB",       "Neo4j Community",        "5.19",               "Native Cypher shortest-path and GDS centrality — avoids O(n²) Python NetworkX for production-scale graphs above 200 nodes"],
                ["Simulation",     "NetworkX + SciPy",       "3.3 / 1.14",         "Centrality and betweenness algorithms with NumPy array backend; seeded RNG via numpy.random.default_rng for deterministic output"],
                ["NLP",            "Anthropic SDK",          "claude-sonnet-4",    "Tool use API forces typed JSON output; structured extraction avoids regex parsing of model prose; 5-semaphore concurrency control"],
                ["Event bus",      "Apache Kafka",           "3.7.0",              "Decouples telemetry producers (Slack/GitHub/Jira) from the graph rebuild pipeline; durable replay on consumer restart"],
                ["Orchestration",  "Apache Airflow",         "2.8.0",              "DAG-based graph rebuild scheduling with TaskFlow API; on_failure_callback for all DAGs; never embeds business logic in DAGs"],
                ["Cache",          "Redis",                  "7-alpine",           "NLP profiles cached 24 h per sha256(url + transcript_hash); simulation results cached 7 days per result_id"],
                ["Auth",           "Clerk",                  "latest",             "SSO with GitHub/Google; JWT verified at the FastAPI gateway via JWKS URL; bypassed in dev when key is placeholder"],
                ["Monitoring",     "Prometheus + Grafana",   "2.51 / 10.4",        "NLP latency histogram, simulation run counter, Kafka consumer lag — all exposed at /metrics via PrometheusMiddleware"],
                ["Infra (dev)",    "Docker Compose",         "v2",                 "Full stack in one compose file; volume mounts for hot reload on API and web; named project for port isolation"],
              ].map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "var(--primary-10)" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 12, fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>{row[0]}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "Courier New, monospace", fontSize: 12, color: "var(--dark)" }}>{row[1]}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 11, color: "var(--mid)", whiteSpace: "nowrap" }}>{row[2]}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fb)", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InfoPage() {
  const [view, setView] = useState<View>("business")

  const tabStyle = (id: View): React.CSSProperties => ({
    background: "none",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--fb)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "2px",
    textTransform: "uppercase",
    padding: "14px 22px",
    color: view === id ? "var(--gold-light)" : "rgba(255,255,255,0.4)",
    borderBottom: `2px solid ${view === id ? "var(--gold-light)" : "transparent"}`,
    marginBottom: -1,
    transition: "color 0.15s",
  })

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />

      {/* ── Hero with tab bar ─────────────────────────────────────────────── */}
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
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Eyebrow light>Documentation</Eyebrow>
          <h1
            style={{
              fontFamily: "var(--fd)",
              fontSize: 40,
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.2,
              marginBottom: 12,
              marginTop: 0,
            }}
          >
            Socio-Technical{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>
              Alignment Simulator.
            </em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 580,
              marginBottom: 40,
              marginTop: 0,
            }}
          >
            A graph-topology simulation system that predicts how engineering candidates integrate
            into existing teams — replacing subjective culture-fit assessment with measurable
            network physics.
          </p>
        </div>

        {/* Tab bar — sits on the hero bottom edge */}
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
          }}
        >
          {(["business", "engineering"] as View[]).map((id) => (
            <button key={id} onClick={() => setView(id)} style={tabStyle(id)}>
              {id === "business" ? "Business View" : "Engineering View"}
            </button>
          ))}
        </div>
      </section>

      {view === "business" ? <BusinessView /> : <EngineeringView />}

      <Footer />
    </main>
  )
}
