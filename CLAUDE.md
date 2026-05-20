# CLAUDE.md — Socio-Technical Alignment Simulator

> This file is the source of truth for Claude Code working in this repository.
> Read it fully before writing a single line of code.

---

## 🧭 Project Identity

**Name:** Socio-Technical Alignment Simulator (STAS)
**Codename:** `digital-twin`
**Mission:** Replace subjective "culture fit" with graph-topology simulation — predicting how a candidate reshapes a team's knowledge flow before they are hired.

**Core metaphor for all engineering decisions:**
> This system is a *network physics engine*, not a CRUD app. Every design choice — data model, API shape, UI component — should reflect that we are modeling *relationships*, not records.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                  │
│         Graph Simulator · Dashboard · Recruiter UI        │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                  API GATEWAY (FastAPI)                    │
│         Auth · Rate Limiting · SSE for sim updates       │
└────┬──────────────┬──────────────┬────────────────┬──────┘
     │              │              │                │
┌────▼────┐  ┌──────▼──────┐  ┌───▼────┐  ┌───────▼──────┐
│ Graph   │  │  Simulation │  │ NLP    │  │  Telemetry   │
│ Service │  │  Engine     │  │ Agent  │  │  Ingestor    │
│(Neo4j)  │  │(Monte Carlo)│  │(LLM)   │  │  (Kafka)     │
└─────────┘  └─────────────┘  └────────┘  └──────────────┘
                       │
              ┌─────────▼────────┐
              │  Airflow DAGs    │
              │  (Orchestration) │
              └──────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR for initial graph load, React Server Components |
| Graph Visualization | `@antv/g6` or `react-force-graph` | D3-based, handles 500+ node graphs |
| Backend API | FastAPI (Python 3.11) | Async, native Pydantic, easy SSE |
| Graph DB | Neo4j 5.x | Native Cypher for shortest-path, centrality queries |
| Stream Processing | Apache Kafka | Telemetry ingestion from Slack/GitHub/Jira |
| Orchestration | Apache Airflow 2.8 | DAG-based pipeline for graph rebuilds |
| ML / Simulation | NetworkX + SciPy + custom Monte Carlo | Closeness centrality, simulation runs |
| NLP Agent | Claude API (claude-sonnet-4-20250514) | Candidate profile extraction from repos + interviews |
| Auth | Clerk | SSO with Google/GitHub for recruiter login |
| Infra | Docker Compose (dev) → Kubernetes (prod) | |
| Monitoring | Prometheus + Grafana | Track simulation latency, Kafka lag |

---

## 📁 Repository Structure

```
/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   │   ├── app/                # App Router pages
│   │   ├── components/
│   │   │   ├── graph/          # Graph visualization components
│   │   │   ├── simulator/      # Drag-and-drop candidate insertion UI
│   │   │   └── ui/             # Design system (see BRAND.md)
│   │   ├── lib/
│   │   │   ├── graph-client.ts # Neo4j query helpers (client-side safe)
│   │   │   └── sim-socket.ts   # WebSocket client for live simulation
│   │   └── BRAND.md            # ← UI decisions live here. Always check before styling.
│   │
│   └── api/                    # FastAPI backend
│       ├── routers/
│       │   ├── graph.py        # Graph read/write endpoints
│       │   ├── simulation.py   # Monte Carlo simulation endpoints
│       │   └── candidates.py   # Candidate profile management
│       ├── services/
│       │   ├── graph_service.py
│       │   ├── simulation_engine.py
│       │   └── nlp_agent.py
│       └── models/             # Pydantic models
│
├── pipelines/
│   ├── airflow/
│   │   ├── dags/
│   │   │   ├── telemetry_ingestion.py
│   │   │   ├── graph_rebuild.py
│   │   │   └── candidate_profile_extraction.py
│   │   └── operators/          # Custom Airflow operators
│   └── kafka/
│       ├── connectors/         # Kafka Connect configs (Slack, GitHub, Jira)
│       └── schemas/            # Avro schemas for telemetry events
│
├── graph/
│   ├── schema/                 # Neo4j constraints + indexes (Cypher)
│   └── migrations/             # Graph schema migrations
│
├── simulation/
│   ├── monte_carlo.py          # Core simulation logic
│   ├── metrics.py              # Centrality, betweenness, silo detection
│   └── tests/
│
├── docker/                     # Dockerfiles per service
├── k8s/                        # Kubernetes manifests
├── docs/
│   ├── ADR/                    # Architecture Decision Records
│   └── math/                   # LaTeX docs for simulation math
│
├── CLAUDE.md                   # ← You are here
├── PLAN.md                     # Sprint roadmap
└── BRAND.md                    # UI & design decisions (referenced by CLAUDE.md)
```

---

## 🎨 UI & Design Decisions

**All UI decisions — colors, typography, spacing, component style, icon sets, animation curves — are defined in `apps/web/BRAND.md`.**

Before writing any:
- Tailwind class
- CSS variable
- Component style
- Color hex code
- Font family

→ **Read `BRAND.md` first.** Do not invent visual decisions. If BRAND.md does not cover a case, add it there before implementing it.

**Never hardcode values that belong in BRAND.md** (e.g., `text-blue-500`, `font-mono`, `rounded-xl`). Use the design tokens defined there.

---

## 🧠 Domain Model

### Core Entities

```python
# Neo4j Node Labels

Engineer:
  - id: str          # GitHub handle or internal ID
  - name: str
  - skills: list[str]
  - seniority: "junior" | "mid" | "senior" | "staff"
  - team: str

Candidate:
  - id: str
  - name: str
  - skills: list[str]          # Extracted by NLP agent
  - github_url: str
  - collaboration_vector: list[float]   # Embedding of collaboration style

# Neo4j Relationship Types

REVIEWS_PR_OF       # Engineer → Engineer (weight = count per quarter)
RESOLVES_DOUBT_FOR  # Engineer → Engineer (Slack-derived)
BLOCKS_TICKET_OF    # Engineer → Engineer (Jira-derived)
PAIR_PROGRAMS_WITH  # Engineer ↔ Engineer
SHARES_DOMAIN_WITH  # Engineer → Candidate (projected, from simulation)
```

### Key Metric: Closeness Centrality

```
C_C(v) = (n - 1) / Σ d(u, v)   for all u ≠ v
```

- Computed for the candidate node `v` inserted into the graph
- `d(u, v)` = geodesic distance (shortest path) between candidate and each team member
- High `C_C` → candidate integrates quickly, becomes a knowledge hub
- Low `C_C` → candidate is isolated, high Time-to-Value risk

---

## ⚙️ Engineering Standards

### Python (Backend / Pipelines)

- Python **3.11+**. Use `match` statements over long `if/elif` chains.
- Type hints **everywhere**. No untyped function signatures.
- Pydantic v2 for all data models. Never use raw dicts for inter-service data.
- Use `async/await` throughout FastAPI routes. No blocking I/O on the event loop.
- Graph queries go through `graph_service.py` only. No raw Cypher in routers.
- Simulation runs are **always idempotent** — same candidate + same graph snapshot → same distribution.

```python
# ✅ Correct
async def get_centrality(candidate_id: str, snapshot_id: str) -> CentralityResult:
    ...

# ❌ Wrong — blocking, untyped
def get_centrality(candidate_id, snapshot_id):
    result = neo4j_driver.session().run(...)  # blocking
```

### TypeScript (Frontend)

- **Strict mode** enabled. No `any`. Use `unknown` + type narrowing instead.
- Server Components by default; opt into `"use client"` only when needed (interactivity, browser APIs).
- Graph state lives in **Zustand** (`apps/web/lib/store/`). Do not use React state for graph topology.
- All API calls go through `apps/web/lib/api/` — never `fetch()` directly in components.
- Graph components receive `GraphSnapshot` props, never raw Neo4j records.

```typescript
// ✅ Correct
import { useGraphStore } from "@/lib/store/graph"
const { insertCandidate, runSimulation } = useGraphStore()

// ❌ Wrong — fetching in component, no types
const res = await fetch("/api/simulate")
const data = await res.json()
```

### Graph / Cypher

- Every query must include `EXPLAIN` validation in tests.
- Always use **parameterized queries** — never string interpolation.
- Index all high-cardinality lookup properties: `Engineer.id`, `Candidate.id`, `skills`.
- Closeness centrality for graphs > 200 nodes → use Neo4j's `gds.closeness.stream()` (Graph Data Science library), not Python NetworkX.

### Kafka / Telemetry

- All events use **Avro schemas** defined in `pipelines/kafka/schemas/`.
- Topic naming convention: `stas.{source}.{entity}.{action}` (e.g., `stas.github.pr.reviewed`)
- Consumers must be **idempotent** — the same event processed twice must not corrupt the graph.
- Dead-letter queue for all consumer groups: `stas.dlq.{consumer-group}`

### Airflow DAGs

- All DAGs use `TaskFlow API` (`@task` decorators). No legacy operators unless unavoidable.
- DAG IDs: `stas_{domain}_{action}` (e.g., `stas_graph_rebuild`, `stas_candidate_profile_extract`)
- Every DAG must have: `owner`, `sla`, `on_failure_callback` set.
- Never put business logic in DAGs. DAGs orchestrate; services execute.

---

## 🤖 AI / Agent Guidelines

The NLP Agent extracts candidate profiles using the Claude API.

- Model: `claude-sonnet-4-20250514` — do not change without updating this file.
- System prompt lives in `apps/api/services/nlp_agent.py::CANDIDATE_EXTRACTION_PROMPT`.
- Always request **structured JSON output** via tool use / structured output — never parse free text.
- Rate limit: max 5 concurrent candidate extractions. Use a semaphore.
- Cache extraction results in Redis for 24h — GitHub repos don't change that fast.

---

## 🧪 Testing Standards

| Layer | Tool | Minimum Coverage |
|---|---|---|
| Simulation engine | `pytest` + `hypothesis` | 90% (property-based) |
| FastAPI routes | `pytest` + `httpx.AsyncClient` | 85% |
| Graph queries | `pytest` + Neo4j test container | 80% |
| Frontend components | `vitest` + `@testing-library/react` | 75% |
| E2E | `Playwright` | Critical paths only |

- Simulation tests use **seeded random** for reproducibility. Never test with `random.random()`.
- Graph tests spin up a **Neo4j test container** — no mocking the graph DB.
- Frontend graph components are tested with **snapshot + interaction tests**.

---

## 🚦 Simulation Engine Rules

The Monte Carlo simulation is the system's core value. Treat it like financial modeling code:

1. **Snapshot isolation:** Simulations always run against a frozen graph snapshot, never the live graph.
2. **Run count:** Default 1,000 iterations. Configurable per request, max 10,000.
3. **Confidence intervals:** Every metric output includes a 95% CI. Never return a point estimate alone.
4. **Determinism:** Given the same `snapshot_id` + `candidate_id` + `seed`, results must be byte-identical.
5. **Async streaming:** Long simulations (>500 nodes, >5,000 iterations) stream progress via SSE.

---

## 🔐 Security

- **No PII in Kafka topics.** Engineer names are anonymized to UUIDs in telemetry. Resolve to names only at the API layer, after auth.
- Candidate data is **tenant-isolated**. Row-level security enforced at the graph DB query level.
- API keys for Slack/GitHub/Jira connectors live in **Vault**, never in `.env` files committed to git.
- Claude API key is injected via environment — never logged, never serialized.

---

## 📋 Claude Code Workflow

When working in this repo, Claude Code must:

1. **Check `BRAND.md`** before any UI work.
2. **Check `docs/ADR/`** before changing architectural decisions.
3. **Run tests** after every non-trivial change: `make test`.
4. **Never modify `simulation/monte_carlo.py`** without updating `docs/math/` LaTeX docs.
5. **Use `make lint`** before committing — `ruff` (Python) + `eslint` (TS) are enforced.
6. **Prefer graph-native operations** — if you're writing a loop over nodes in Python that could be a Cypher query, write the Cypher query.

### Useful Commands

```bash
make dev          # Start full stack via Docker Compose
make test         # Run all tests
make lint         # Lint Python + TypeScript
make graph-seed   # Seed Neo4j with synthetic team data
make sim-run      # Run a test simulation from CLI
make dag-test     # Test Airflow DAGs locally with dag.test()
make kafka-events # Produce synthetic telemetry events to Kafka
```

---

## 🔗 Key References

- `PLAN.md` — Sprint roadmap and feature delivery schedule
- `BRAND.md` — UI/design system (all visual decisions)
- `docs/ADR/` — Architecture Decision Records
- `docs/math/closeness_centrality.tex` — Formal definition of simulation metrics
- `simulation/tests/` — Property-based tests that define correct simulation behavior
