# Socio-Technical Alignment Simulator

**Replace subjective "culture fit" with graph-topology simulation.**

STAS predicts how a candidate reshapes a team's knowledge flow *before* they are hired. It models the organisation as a network, inserts the candidate as a node, and runs a Monte Carlo simulation to quantify integration risk — returning closeness centrality, time-to-value, and silo risk with 95% confidence intervals.

---

## The Problem

Hiring decisions that affect team topology are made on gut feel. "Culture fit" is an undefined term that correlates with bias, not performance. When a new engineer joins, their actual impact on knowledge flow, review coverage, and cross-team connectivity is unknown until 6–12 months in.

The cost of a misfit hire is rarely measured in interviews — it is measured in blocked PRs, orphaned domains, and rising time-to-value for everyone on the team.

## The Solution

STAS treats a software team as a graph. Engineers are nodes. Relationships — code reviews, resolved Slack threads, unblocked Jira tickets — are weighted edges, ingested in real time from GitHub, Slack, and Jira via Kafka.

When evaluating a candidate:

1. **NLP Agent** — Analyses the candidate's GitHub repository and optional interview transcript using the Claude API. Extracts skills with proficiency evidence, derives a collaboration vector, and estimates graph position.

2. **Graph Insertion** — The candidate node is inserted into the live team topology. Edges are projected based on skill overlap (`SHARES_DOMAIN_WITH`).

3. **Monte Carlo Simulation** — 1,000 iterations of Poisson-perturbed graph dynamics compute the candidate's predicted closeness centrality distribution with a 95% CI, alongside time-to-value (weeks), silo risk, betweenness delta, and knowledge gap coverage.

4. **Simulator UI** — Recruiters drag candidate cards onto the live force-directed graph. Results stream via SSE in real time. Two candidates can be compared side-by-side.

5. **Shareable Report** — A token-based shareable link (7-day TTL, no auth required) contains all metrics, a recommendation statement, and knowledge gap coverage — suitable for sending to hiring managers.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   FRONTEND  (Next.js 14)                      │
│        Graph Simulator · Dashboard · Candidate Intake         │
└──────────────────────┬───────────────────────────────────────┘
                       │ REST + SSE
┌──────────────────────▼───────────────────────────────────────┐
│                  API GATEWAY  (FastAPI 0.4.0)                 │
│     JWT Auth · Rate Limiting · Prometheus Metrics · SSE       │
└────┬──────────────┬──────────────┬───────────────┬───────────┘
     │              │              │               │
┌────▼────┐  ┌──────▼──────┐  ┌───▼────┐  ┌──────▼──────┐
│  Graph  │  │ Simulation  │  │  NLP   │  │  Telemetry  │
│ Service │  │   Engine    │  │ Agent  │  │  Ingestor   │
│ (Neo4j) │  │(Monte Carlo)│  │(Claude)│  │   (Kafka)   │
└─────────┘  └──────┬──────┘  └────────┘  └─────────────┘
                    │
           ┌────────▼────────┐
           │   Redis Cache   │
           │ (results 24h,   │
           │  reports 7d)    │
           └─────────────────┘
                    │
           ┌────────▼────────┐
           │  Airflow DAGs   │
           │ (graph rebuild, │
           │  NLP extract)   │
           └─────────────────┘
```

Telemetry flows: GitHub → `stas.github.pr.reviewed` · Slack → `stas.slack.thread.resolved` · Jira → `stas.jira.ticket.blocked`

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, React Server Components, recruiter UI |
| Graph visualisation | `react-force-graph-2d` | Canvas 2D, 60fps at 500+ nodes |
| State management | Zustand | Graph topology + simulation slot state |
| Backend API | FastAPI (Python 3.11) | Async REST + SSE simulation streaming |
| Graph database | Neo4j 5.19 Community + GDS | Cypher queries, closeness centrality, GDS for large graphs |
| Simulation engine | NetworkX + SciPy + custom Monte Carlo | Poisson perturbation, Wasserman-Faust centrality |
| NLP agent | Anthropic Claude API (`claude-sonnet-4-20250514`) | Structured candidate profile extraction via tool use |
| Stream processing | Apache Kafka 3.7 (KRaft) | Telemetry ingestion from GitHub / Slack / Jira |
| Orchestration | Apache Airflow 2.8 | DAG-based graph rebuilds, candidate extraction pipeline |
| Cache | Redis 7 | Simulation results (24h), candidate profiles (7d), shareable reports (7d) |
| Auth | Clerk v5 | Google/GitHub SSO; JWT verification via JWKS on API |
| Rate limiting | slowapi + Redis | 100 simulations/hour, 20 extractions/hour per tenant |
| Metrics | Prometheus + Grafana | Simulation latency, NLP latency, Kafka lag, HTTP p99 |
| Logging | python-json-logger | Structured JSON with `trace_id` per request |
| Error tracking | Sentry | Frontend + API; `send_default_pii=False` |
| Infra (dev) | Docker Compose | Full stack in one command |
| Infra (prod) | Kubernetes + Helm | Deployments, HPA, Ingress, cert-manager TLS |

---

## Prerequisites

- **Docker** ≥ 24 and **Docker Compose** ≥ 2.24
- **Node.js** ≥ 20 (for running frontend outside Docker)
- **Python** ≥ 3.11 (for running API outside Docker)
- An **Anthropic API key** — required for NLP candidate extraction
- A **Clerk account** — required for authentication (free tier works)

Optional for local development:
- **k6** — for load testing (`brew install k6` / [k6.io](https://k6.io/docs/get-started/installation/))
- **kubectl** + **helm** ≥ 3.14 — for Kubernetes deployment

---

## Setup

### 1. Clone and configure environment

```bash
git clone https://github.com/your-org/Socio_Technical_Alignment_Simulator.git
cd Socio_Technical_Alignment_Simulator

cp .env.example .env
```

Open `.env` and fill in the required values:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...          # Anthropic Console → API Keys
CLERK_SECRET_KEY=sk_test_...          # Clerk Dashboard → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Set a secure password for Neo4j
NEO4J_PASSWORD=your_secure_password_here

# Optional — leave blank in dev to skip JWT validation and webhook signatures
CLERK_JWKS_URL=
GITHUB_WEBHOOK_SECRET=
SLACK_SIGNING_SECRET=
JIRA_WEBHOOK_SECRET=
```

All other values in `.env.example` are pre-configured for the Docker Compose network and work without changes.

### 2. Start the full stack

```bash
make dev
```

This builds and starts all services. First run takes 3–5 minutes to pull images.

| Service | URL |
|---|---|
| Next.js app | http://localhost:3000 |
| FastAPI docs | http://localhost:8000/docs |
| Neo4j Browser | http://localhost:7474 |
| Airflow UI | http://localhost:8080 (admin / admin) |
| Grafana | http://localhost:3001 (admin / admin) |
| Prometheus | http://localhost:9091 |

### 3. Seed the graph

```bash
make graph-seed
```

Creates 35 synthetic engineers across 3 teams (`platform`, `data`, `mobile`) with realistic collaboration relationships and Poisson-weighted edges. Required before running any simulation.

---

## Quick Start

After `make dev` and `make graph-seed`:

**Option A — UI walkthrough:**

1. Open http://localhost:3000 and sign in via Clerk
2. Go to **Dashboard** → click **Extract Candidate Profile**
3. Paste a public GitHub repository URL (e.g. `https://github.com/tiangolo/fastapi`) → **Extract candidate profile**
4. Wait 10–30s for the NLP agent to run → you land on the candidate detail page
5. Click **Run New Simulation →** → the Simulator workspace opens
6. Select a team from the dropdown → drag the candidate card onto the graph canvas
7. Watch the simulation stream → results appear in the right panel with ring chart, TTV, and silo risk
8. Click **Share report** → copies a 7-day shareable link to clipboard

**Option B — API directly:**

```bash
# Extract a candidate profile
curl -X POST http://localhost:8000/candidates/extract \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/tiangolo/fastapi"}'

# Run a simulation (use candidate_id from above response)
curl -X POST http://localhost:8000/simulation/run \
  -H "Content-Type: application/json" \
  -d '{
    "team_id": "platform",
    "candidate": {
      "id": "cand_001",
      "name": "FastAPI Author",
      "skills": ["python", "fastapi", "pydantic", "async"],
      "github_url": "https://github.com/tiangolo/fastapi",
      "collaboration_vector": [0.8, 0.9, 0.9, 0.5, 0.7],
      "team_id": "platform"
    },
    "n_iterations": 1000,
    "seed": 42
  }'
```

---

## Development Workflow

```bash
make test              # Run all tests (pytest + vitest + Playwright)
make lint              # Ruff (Python) + ESLint (TypeScript)
make sim-run           # Run a test simulation from CLI
make dag-test          # Test all Airflow DAGs locally
make kafka-events      # Produce synthetic telemetry events to Kafka
make load-test         # k6 load test: 50 VUs, p99 < 10s threshold
make pii-audit ARGS="--log-dir /var/log/stas"   # Scan logs for PII
make bundle-analyze    # Next.js bundle size report
```

### Running services individually (without Docker)

```bash
# API
pip install -e ".[dev]"
uvicorn apps.api.main:app --reload --port 8000

# Frontend
cd apps/web
npm install
npm run dev
```

Both require Neo4j and Redis to be reachable at the URLs in your `.env`.

---

## Project Structure

```
/
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── core/               # Config, auth, rate limiting, metrics, logging
│   │   ├── routers/            # graph, simulation, candidates, telemetry
│   │   └── services/           # GraphService, SimulationService, NLP Agent
│   └── web/                    # Next.js 14 frontend
│       ├── app/                # App Router pages (dashboard, simulate, candidates, report)
│       ├── components/
│       │   ├── graph/          # TeamGraph (react-force-graph-2d)
│       │   └── simulator/      # CandidateCard, ResultsPanel, ComparisonPanel, RingChart
│       └── lib/                # Zustand stores, API helpers, hooks
│
├── simulation/
│   ├── monte_carlo.py          # Core simulation engine
│   └── metrics.py              # Centrality, betweenness, silo risk, TTV
│
├── pipelines/
│   ├── airflow/dags/           # stas_graph_rebuild, stas_candidate_profile_extract
│   └── kafka/                  # Connectors, Avro schemas, consumers
│
├── graph/
│   └── schema/                 # Neo4j constraints + indexes (Cypher)
│
├── k8s/                        # Kubernetes manifests + Helm chart
├── docs/
│   ├── ADR/                    # Architecture Decision Records
│   ├── math/                   # LaTeX — simulation metric definitions
│   └── runbook.md              # Incident response (top 5 failure scenarios)
├── scripts/
│   └── pii_audit.py            # PII scan tool for logs and Kafka topics
├── tests/
│   └── load/sim_load_test.js   # k6 load test
├── docker-compose.yml
├── Makefile
├── PLAN.md                     # Sprint roadmap (S0–S9, all complete)
└── CLAUDE.md                   # Engineering standards for this repo
```

---

## Key Simulation Metric

The core metric is **Wasserman-Faust closeness centrality** for the inserted candidate node `v`:

```
C_C(v) = (n_r / Σ d(u,v)) × (n_r - 1) / (n - 1)
```

Where `n_r` is the number of reachable nodes and `d(u,v)` is the geodesic distance. A high score predicts rapid knowledge diffusion — the candidate becomes a hub quickly. A low score predicts isolation and high time-to-value. Full derivation in [`docs/math/closeness_centrality.tex`](docs/math/closeness_centrality.tex).

---

## Deployment

### Staging

```bash
make deploy-staging VERSION=0.4.0
```

Builds and pushes Docker images to `ghcr.io/stas/`, then runs `helm upgrade --install` against your staging cluster. Requires `KUBECONFIG` pointing to staging.

### Production

```bash
make deploy-prod VERSION=0.4.0
```

Requires typed confirmation. Uses `k8s/helm/values.prod.yaml`. All secrets must be pre-loaded in the `stas-secrets` Kubernetes Secret (from Vault or CI secret injection — never from a committed `.env`).

See [`docs/runbook.md`](docs/runbook.md) for incident response procedures.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key for NLP extraction |
| `CLERK_SECRET_KEY` | Yes | — | Clerk backend secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | — | Clerk frontend key |
| `NEO4J_PASSWORD` | Yes | `changeme_dev` | Neo4j auth password |
| `CLERK_JWKS_URL` | No | `` | Clerk JWKS URL; empty = skip JWT validation (dev) |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection string |
| `KAFKA_BOOTSTRAP_SERVERS` | No | `kafka:9092` | Kafka broker(s) |
| `SENTRY_DSN` | No | `` | Sentry DSN for API error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | No | `` | Sentry DSN for frontend |
| `VAULT_ADDR` | No | `` | HashiCorp Vault address (prod secret injection) |
| `LOG_FORMAT` | No | `text` | `json` for production, `text` for dev |
| `RATE_LIMIT_SIM_PER_HOUR` | No | `100` | Simulation runs per tenant/hour |

Full list in [`.env.example`](.env.example).

---

## License

MIT
