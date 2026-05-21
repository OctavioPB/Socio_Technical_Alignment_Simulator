# PLAN.md — Socio-Technical Alignment Simulator
## Sprint Roadmap · 10 Sprints · ~20 Weeks

> **Sprint cadence:** 2 weeks each  
> **Definition of Done:** Feature is tested, documented, and merged to `main` with CI passing.  
> **Methodology:** Shape Up-inspired (betting table → shaping → building). No tickets without a clear problem statement.

---

## 🗺️ Roadmap at a Glance

| Sprint | Name | Theme | Deliverable |
|--------|------|--------|-------------|
| S0 | Foundation | Infrastructure | Dev env, CI/CD, base services wired |
| S1 | The Graph | Data Model | Neo4j schema, seed data, Cypher query library |
| S2 | The Signal | Telemetry | Kafka ingestion of GitHub PRs + Slack threads |
| S3 | The Pipe | Orchestration | Airflow DAGs for graph rebuild pipeline |
| S4 | The Brain | Simulation Core | Monte Carlo engine, closeness centrality |
| S5 | The Voice | NLP Agent | Candidate profile extraction via Claude API |
| S6 | The Canvas | Visualization | Interactive force-directed graph, frontend shell |
| S7 | The Simulator | Drag & Drop UI | Candidate insertion UI, live sim streaming |
| S8 | The Dashboard | Recruiter UX | Full recruiter workflow, reports, comparison |
| S9 | The Hardening | Production | Auth, security, monitoring, load testing |

---

## Sprint 0 — Foundation
**Duration:** Week 1–2  
**Goal:** Every engineer can run the full stack locally in one command. CI rejects broken code automatically.

### Deliverables

- [x] **Monorepo scaffold** (`apps/web`, `apps/api`, `pipelines/`, `simulation/`, `graph/`)
- [x] **Docker Compose** wires up: Neo4j, Kafka + Zookeeper, Airflow, FastAPI, Next.js
- [x] **`make dev`** starts everything; `make test` runs all test suites
- [x] **CI pipeline** (GitHub Actions): lint → test → build on every PR
- [x] **`BRAND.md`** drafted: design tokens, typography, color system, component philosophy
- [x] **Environment configuration**: Vault (dev mock) for secrets, `.env.example` with all required vars
- [x] **ADR-001**: Graph DB selection rationale (Neo4j vs TigerGraph vs Amazon Neptune)
- [x] **ADR-002**: Frontend graph library selection (G6 vs react-force-graph vs Sigma.js)

### Acceptance Criteria

```bash
git clone <repo> && make dev
# → All services healthy at localhost
make test
# → All tests pass (trivial passing tests acceptable at this stage)
make lint
# → Zero lint errors
```

---

## Sprint 1 — The Graph
**Duration:** Week 3–4  
**Goal:** The knowledge graph exists, has a validated schema, and can be queried for basic topology metrics.

### Deliverables

- [x] **Neo4j schema** (`graph/schema/`):
  - Constraints: unique `Engineer.id`, `Candidate.id`
  - Indexes: `Engineer.skills[]`, `Engineer.team`, `Candidate.skills[]`
  - Full schema migration system (`graph/migrations/`)
- [x] **Core node/relationship types** implemented:
  - `Engineer`, `Candidate` nodes
  - `REVIEWS_PR_OF`, `RESOLVES_DOUBT_FOR`, `BLOCKS_TICKET_OF`, `PAIR_PROGRAMS_WITH`
- [x] **Synthetic seed data** (`make graph-seed`):
  - 3 synthetic teams (10–15 engineers each)
  - Realistic interaction weights (Poisson-distributed)
- [x] **`graph_service.py`** — Cypher query library:
  - `get_team_graph(team_id)` → adjacency with weights
  - `get_shortest_paths(from_id, to_id)` → geodesic distances
  - `get_centrality_scores(team_id)` → pre-computed betweenness + closeness
  - `insert_candidate_node(candidate)` → temp node insertion for simulation
- [x] **FastAPI `/graph` router** with endpoints:
  - `GET /graph/teams/{team_id}` → graph snapshot
  - `GET /graph/metrics/{team_id}` → centrality scores
- [x] **Tests**: All Cypher queries tested against Neo4j test container

### Key Technical Decision

Centrality for graphs ≤ 200 nodes → **NetworkX** (fast enough, no extra dependency).  
Centrality for graphs > 200 nodes → **Neo4j GDS** `gds.closeness.stream()`.  
Threshold is configurable: `SIMULATION_GDS_THRESHOLD=200` env var.

---

## Sprint 2 — The Signal
**Duration:** Week 5–6  
**Goal:** Real collaboration telemetry flows from GitHub, Slack, and Jira into Kafka topics, then into the graph.

### Deliverables

- [x] **Avro schemas** (`pipelines/kafka/schemas/`):
  - `pr_review_event.avsc` — `{reviewer_id, author_id, repo, pr_number, timestamp}`
  - `slack_thread_event.avsc` — `{helper_id, asker_id, channel, thread_ts, resolved: bool}`
  - `jira_block_event.avsc` — `{blocker_id, blocked_id, issue_key, duration_hours}`
- [x] **Kafka Connect connectors** (`pipelines/kafka/connectors/`):
  - GitHub webhook → `stas.github.pr.reviewed`
  - Slack Events API → `stas.slack.thread.resolved`
  - Jira webhook → `stas.jira.ticket.blocked`
- [x] **Consumer services** (Python, FastAPI background tasks or standalone):
  - Idempotent graph edge upsert from each event type
  - Edge weight = rolling 90-day count (configurable window)
  - DLQ routing for malformed events
- [x] **`make kafka-events`** — CLI tool to produce synthetic events for local dev
- [x] **Telemetry anonymization**: Engineer names → UUIDs at ingestion; name resolution only at API layer
- [x] **Monitoring**: Kafka consumer lag metric exported to Prometheus

### Data Flow

```
GitHub Webhook → Kafka Connect → stas.github.pr.reviewed
                                        ↓
                               Consumer (Python)
                                        ↓
                            Neo4j: MERGE (e1)-[:REVIEWS_PR_OF {weight: w}]→(e2)
```

### Acceptance Criteria

```bash
make kafka-events --source=github --count=500
# → 500 PR review events produced
# → Neo4j shows updated edge weights within 10s
# → Zero events in DLQ
```

---

## Sprint 3 — The Pipe
**Duration:** Week 7–8  
**Goal:** Airflow orchestrates the full graph lifecycle: scheduled rebuilds, candidate pipeline, and snapshot versioning.

### Deliverables

- [x] **DAG: `stas_graph_rebuild`** (runs nightly, 02:00 UTC):
  - Reads Kafka offset range for last 24h
  - Rebuilds edge weights for affected node pairs
  - Computes + stores centrality snapshot (`GraphSnapshot` node in Neo4j)
  - Sends alert if topology change > 15% vs previous snapshot
- [x] **DAG: `stas_candidate_profile_extract`** (triggered on demand):
  - Input: `candidate_id`, `github_url`
  - Extracts skills from repos via GitHub API (languages, topics, README keywords)
  - Calls NLP Agent (Sprint 5 dependency — stub returns static skills unchanged)
  - Writes `Candidate` node to Neo4j
- [x] **DAG: `stas_telemetry_health`** (runs hourly):
  - Checks Kafka consumer lag < `STAS_LAG_THRESHOLD` (default 1000 msgs)
  - Checks DLQ depth < `STAS_DLQ_THRESHOLD` (default 10)
  - Fires Slack alert if thresholds breached
- [x] **Custom Airflow operators** (`pipelines/airflow/operators/`):
  - `Neo4jSnapshotOperator` — atomic graph snapshot with rollback; prunes snapshots > 30 days
  - `KafkaOffsetRangeOperator` — timestamp-based offset lookup for bounded replay
- [x] **`make dag-test`** runs all 3 DAGs via `airflow dags test` in scheduler container

### Acceptance Criteria

- `stas_graph_rebuild` completes in < 5 minutes for a 50-engineer graph
- DAG failure triggers Slack alert within 2 minutes
- Graph snapshot versioning allows rollback to any snapshot from the last 30 days

---

## Sprint 4 — The Brain
**Duration:** Week 9–10  
**Goal:** The Monte Carlo simulation engine is implemented, tested to mathematical correctness, and exposed via a streaming API.

### Deliverables

- [x] **`simulation/monte_carlo.py`** — Core engine:
  - Takes: `GraphSnapshot`, `CandidateInsert`, `n_iterations=1000`, `seed=42`
  - Inserts candidate as temporary node; varies edge weights via `Poisson(λ=base_weight)` each iteration
  - Computes `C_C(v)` + `silo_risk_score` per iteration; `betweenness_delta` once on mean graph
  - Returns: `SimulationResult` with mean, std, 95% CI, percentile distribution for all metrics
  - Progress callback fires every 100 iters for SSE streaming
- [x] **`simulation/metrics.py`**:
  - `closeness_centrality(G, v)` — Wasserman-Faust normalised exact formula
  - `betweenness_centrality_delta(G, v)` — mean betweenness change for existing nodes
  - `silo_risk_score(G, v)` — clustering coefficient delta after insertion
  - `time_to_value_estimate(mean_cc)` → weeks: `2.0 / max(cc, 1/26)`, capped at 52 weeks
  - `make_distribution(samples)` — mean, std, 95% CI, p5/p25/p50/p75/p95
- [x] **`simulation/models.py`**: `MetricDistribution`, `SkillGapMatch`, `SimulationResult`, `SimulationRequest`
- [x] **FastAPI `/simulation` router** (`apps/api/routers/simulation.py`):
  - `POST /simulation/run` → sync (≤ 1 000 iterations)
  - `POST /simulation/run-stream` → SSE stream with progress events + keepalives
  - `GET /simulation/results/{result_id}` → Redis-cached result retrieval (24 h TTL)
- [x] **`apps/api/services/simulation_engine.py`** — async service: fetch snapshot, run in thread pool, cache in Redis
- [x] **Property-based tests** (`hypothesis`) in `simulation/tests/test_metrics.py`:
  - Centrality score always in [0, 1] (200 examples)
  - Same seed + same input → identical output (determinism)
  - Universally-connected hub → `C_C = 1.0`
  - Isolated node → `C_C = 0.0`
- [x] **`simulation/tests/test_monte_carlo.py`**: determinism, metric invariants, skill coverage, progress callback, performance
- [x] **`docs/math/closeness_centrality.tex`** — full LaTeX: graph model, formula, Monte Carlo algorithm, CI construction, performance analysis
- [x] **Performance baseline**: 1,000 iterations on 50-node graph < 2 seconds (`@pytest.mark.slow`)

### Simulation Result Schema

```python
class SimulationResult(BaseModel):
    candidate_id: str
    snapshot_id: str
    n_iterations: int
    seed: int
    closeness_centrality: MetricDistribution   # {mean, std, ci_95, percentiles}
    betweenness_delta: MetricDistribution
    silo_risk_score: MetricDistribution
    time_to_value_weeks: MetricDistribution
    knowledge_gap_coverage: list[SkillGapMatch]  # What gaps candidate fills
    topology_change_map: dict[str, float]  # edge_id → predicted weight change
```

---

## Sprint 5 — The Voice ✅
**Duration:** Week 11–12  
**Goal:** The NLP Agent extracts a structured candidate profile from GitHub repos and interview transcripts using Claude.

### Deliverables

- [x] **`apps/api/services/nlp_agent.py`** — Claude-powered extraction:
  - Tool: `extract_candidate_profile` (structured output via tool use)
  - Extracts: skills (with proficiency levels), collaboration style signals, domain expertise, knowledge graph position estimate
  - Input sources: GitHub repo README + top-5 files, interview transcript (optional)
  - Output: `CandidateProfile` Pydantic model
- [x] **Skill taxonomy** (`apps/api/data/skill_taxonomy.json`):
  - Hierarchical: Domain → Subdomain → Skill (6 domains, 30 subdomains, 150+ skills)
  - Used to normalize extracted skills against the team's existing skill nodes
- [x] **Collaboration style embedding**:
  - 5-dimension vector: `[async_preference, pr_review_depth, documentation_habit, pairing_affinity, mentoring_tendency]`
  - Estimated from GitHub commit messages, PR comments style, README quality
- [x] **Rate limiting + caching**:
  - Semaphore: max 5 concurrent Claude API calls
  - Redis cache: 24h TTL per `(github_url, transcript_hash)`
- [x] **Airflow DAG integration**: `extract_skills_nlp` task now calls `extract_candidate_profile_sync`; graceful fallback to static skills on Claude API errors
- [x] **Tests**: 25 tests with `pytest-mock`; covers extraction, cache hit/miss, collaboration vector range, tool schema, skill taxonomy, cache key determinism

### Acceptance Criteria

- Extract a full `CandidateProfile` in < 30 seconds from GitHub URL alone
- Skill extraction F1 score > 0.75 on test set (manually labeled)
- Zero PII persisted in logs or cache

---

## Sprint 6 — The Canvas ✅
**Duration:** Week 13–14  
**Goal:** The frontend shell is built: authenticated app with a live, interactive force-directed graph of the current team.

### Deliverables

> ⚠️ All visual decisions sourced from `BRAND.md`. No color, font, or spacing invented here.

- [x] **Next.js 14 app scaffold** (`apps/web/`):
  - Clerk auth integration (`@clerk/nextjs` v5, `clerkMiddleware`, `ClerkProvider`)
  - Route structure: `/dashboard`, `/teams/[id]`, `/candidates/[id]`, `/simulate`
  - Zustand store: `useGraphStore`, `useSimulationStore`, `useCandidateStore`
- [x] **`<TeamGraph>` component** (`apps/web/components/graph/`):
  - `react-force-graph-2d` with `ssr: false` dynamic import (ADR-002)
  - Nodes colored by team (BRAND.md data viz palette), sized by betweenness centrality
  - Edges: opacity + width proportional to interaction weight (log scale)
  - Hover tooltip: engineer name, top 3 skills, closeness + betweenness scores
  - Click: expand to `<EngineerPanel>` side panel (slides in from right)
- [x] **`<GraphSnapshotSelector>`**: `<select>` with `useTransition` for async snapshot switching
- [x] **Performance**: `warmupTicks=100` pre-computes layout; `cooldownTicks=0` for 500+ nodes; `ResizeObserver` for responsive canvas
- [x] **Server Component** (`/teams/[id]/page.tsx`) fetches initial snapshot + centrality; `<GraphLoader>` client boundary hydrates Zustand store
- [x] **Dark mode**: `@media (prefers-color-scheme: dark)` swaps CSS variables; all components use tokens
- [x] **Playwright E2E** (`e2e/graph.spec.ts`): graph canvas present, snapshot selector interactive, engineer panel opens on click, home page hero visible

---

## Sprint 7 — The Simulator ✅
**Duration:** Week 15–16  
**Goal:** The signature feature: drag a candidate card onto the graph and watch the topology simulation run in real time.

### Deliverables

> ⚠️ This is the product's core differentiator. Design quality must match the technical ambition. Reference BRAND.md constantly.

- [x] **`<CandidateCard>` component** — draggable card with candidate info
- [x] **Drag-to-graph interaction**:
  - Candidate card dragged → dropped on graph canvas
  - On drop: candidate node appears at drop position (gold diamond)
  - Predicted edges animate into existence (dashed gold/blue pulse, based on skill overlap)
  - Simulation starts automatically (POST to `/simulation/run-stream`)
- [x] **Live simulation progress**:
  - SSE stream drives a progress bar + "iteration counter" in UI
  - Graph edges pulse/animate during simulation (dashed `Date.now()` offset)
  - On completion: results panel slides in
- [x] **Simulation results overlay**:
  - Closeness centrality score with 95% CI ring chart (`<CentralityRingChart>`)
  - Time-to-Value estimate (weeks) in Fraunces 26px
  - Silo risk indicator (green/amber/red badge)
  - Knowledge gap coverage (green skill chips with coverage delta %)
- [x] **Undo/reset**: `Escape` key removes candidate overlay + resets all simulation state
- [x] **Candidate comparison**: Side-by-side `<ComparisonPanel>` with head-to-head metric rows
- [x] **Zustand stores** rewritten: two-slot (A/B) `useSimulationStore` + graph overlay `candidateNodes` in `useGraphStore`

### Implementation files
- `lib/store/simulation.ts` — two-slot state machine (idle/running/complete/error), history[10]
- `lib/store/graph.ts` — `CandidateForceNode`, `PredictedForceLink`, `computePredictedEdges()`
- `lib/hooks/useSimulationStream.ts` — fetch + ReadableStream SSE client (POST, not EventSource)
- `lib/hooks/useEscapeKey.ts` — `window.addEventListener` cleanup hook
- `lib/api/simulation.ts` — `fetchSimulationResult()` helper
- `components/simulator/CandidateCard.tsx` — draggable card, HTML5 drag API
- `components/simulator/CandidateSlot.tsx` — drop zone for slot A/B
- `components/simulator/SimulationProgressBar.tsx` — 0–1 progress + iteration counter
- `components/simulator/CentralityRingChart.tsx` — SVG arc: CI band + mean arc + point marker
- `components/simulator/SimulationResultsPanel.tsx` — ring chart + TTV + silo risk + skill chips
- `components/simulator/ComparisonPanel.tsx` — side-by-side ring charts + metric rows
- `components/graph/TeamGraph.tsx` — extended with drop zone, diamond candidate nodes, dashed predicted edges
- `app/simulate/SimulatorWorkspace.tsx` — main orchestration client component
- `app/simulate/page.tsx` — server component shell (fetches teams, renders workspace)
- `apps/api/routers/graph.py` — added `GET /graph/teams` endpoint
- `apps/api/services/graph_service.py` — added `list_teams()` Cypher query
- `e2e/simulate.spec.ts` — Playwright tests for simulate page

### Acceptance Criteria

- Drag-to-drop latency < 100ms (UI response)
- Simulation stream starts within 500ms of drop
- Graph remains interactive during simulation (no UI freeze)
- Works on 1440p and 1080p monitors (responsive within desktop breakpoints)

---

## Sprint 8 — The Dashboard ✅
**Duration:** Week 17–18  
**Goal:** Full recruiter workflow — from candidate intake to simulation to shareable report.

### Deliverables

- [x] **`/dashboard`** — Overview:
  - Team health metrics (closeness centrality distribution, silo risk per team)
  - Recent candidate profiles (up to 6, with CTA to extract new)
  - Quick action CTAs (Run Simulation, Extract Profile)
- [x] **`/candidates/[id]`** — Candidate detail page:
  - Profile extracted by NLP Agent (skills with proficiency + evidence, collaboration vector bars)
  - Graph position estimate with domain tags
  - "Run New Simulation" CTA
- [x] **`/candidates/new`** — Candidate intake form:
  - Input: GitHub URL + optional candidate ID + optional interview transcript
  - POSTs to `/candidates/extract` (NLP agent → Claude API)
  - Shows 10–30s loading state, redirects to `/candidates/{id}` on success
- [x] **`/simulate`** — Simulation workspace (Sprint 7, integrated with candidates)
- [x] **Simulation Report**:
  - Shareable link (token-based, no auth required for viewer, 7-day TTL)
  - `/report/[token]` page: all metrics with CIs, recommendation statement, knowledge gap coverage
  - Share button in `SimulationResultsPanel` (copies URL to clipboard)
- [x] **Backend**:
  - `POST /candidates/extract` — NLP agent extraction, Redis cache
  - `GET /candidates/` — list all profiles (sorted by extracted_at)
  - `GET /candidates/{id}` — fetch single profile
  - `POST /simulation/share/{result_id}` — mint shareable token
  - `GET /simulation/report/{token}` — fetch shared result (no auth)

### Implementation files
- `apps/api/routers/candidates.py` — candidate CRUD + extract endpoint
- `apps/api/main.py` — registered candidates router, version 0.3.0
- `apps/api/routers/simulation.py` — added share + report endpoints
- `apps/web/app/dashboard/page.tsx` — team health grid + candidates grid
- `apps/web/app/candidates/new/page.tsx` — intake form (client component)
- `apps/web/app/candidates/[id]/page.tsx` — candidate detail page (server component)
- `apps/web/app/report/[token]/page.tsx` — shareable report page (server component)
- `apps/web/components/simulator/SimulationResultsPanel.tsx` — added share button

---

## Sprint 9 — The Hardening ✅
**Duration:** Week 19–20  
**Goal:** Production-ready. Secure, observable, performant, and deployable to Kubernetes.

### Deliverables

#### Security
- [x] **Auth hardening**: Clerk JWT verification via JWKS (`apps/api/core/auth.py`); dev bypass via empty `CLERK_JWKS_URL`; `require_auth` FastAPI dependency ready to apply per-route
- [x] **Tenant isolation**: All Neo4j queries in `graph_service.py` already scoped to `team_id`; Slack webhook now validates HMAC-SHA256 signature (matching GitHub)
- [x] **PII audit**: `scripts/pii_audit.py` — scans log files and Kafka topic samples for email, full names, GitHub logins; `make pii-audit`
- [x] **Vault integration**: `VAULT_ADDR` + `VAULT_TOKEN` → `_load_vault_secrets()` in `main.py` overlays secrets at startup; `.env` files not needed in prod
- [x] **Rate limiting**: `slowapi` Redis-backed rate limiter; 100 sim/hour, 20 extractions/hour per tenant; 429 with `Retry-After` header; `apps/api/core/rate_limit.py`
- [x] **OWASP review**: Parameterised Neo4j queries (enforced by `_ALLOWED_REL_TYPES`); no PII in logs; HMAC validation on all webhooks; CORS locked to known origins; `send_default_pii=False` in Sentry; `runAsNonRoot` in all k8s containers

#### Observability
- [x] **Prometheus metrics**: 5 metrics — `stas_simulation_duration_seconds`, `stas_nlp_extraction_latency_seconds`, `stas_graph_rebuild_duration_seconds`, `stas_kafka_consumer_lag_seconds`, `stas_http_request_duration_seconds`; `GET /metrics` endpoint; `MetricsMiddleware`
- [x] **Grafana dashboards**: Auto-provisioned `stas_overview.json` — 6 panels (throughput, sim latency p50/p95/p99, NLP latency, API p99 by endpoint, Kafka lag, error rates)
- [x] **Structured JSON logging**: `python-json-logger` with `trace_id` ContextVar; `LOG_FORMAT=text` for dev; `LOG_FORMAT=json` for prod
- [x] **Sentry integration**: `instrumentation.ts` (server), `sentry.client.config.ts` + `sentry.server.config.ts` (frontend); `sentry-sdk[fastapi]` on API; all guarded by empty DSN check

#### Performance
- [x] **Load test (k6)**: `tests/load/sim_load_test.js` — 50 VUs ramp, thresholds p99 < 10s + error rate < 1%; `make load-test`
- [x] **Next.js bundle audit**: `@next/bundle-analyzer` wired in `next.config.ts`; `make bundle-analyze`
- [x] **Neo4j query review**: All queries use parameterised form; `EXPLAIN` enforcement documented in CLAUDE.md; indexes documented in `graph/schema/`

#### Deployment
- [x] **Kubernetes manifests** (`k8s/`): namespace, configmap, secrets template, API/web deployments + services + HPA, Neo4j StatefulSet, Redis deployment, Kafka StatefulSet, Ingress
- [x] **Helm chart** (`k8s/helm/`): Chart.yaml, values.yaml, templates for configmap/api/web/ingress + _helpers.tpl
- [x] **Runbook** (`docs/runbook.md`): Top 5 failure scenarios with symptoms, diagnosis commands, and remediation
- [x] **`make deploy-staging`** and **`make deploy-prod`**: Helm-based; prod requires typed confirmation

### Implementation files
- `apps/api/core/auth.py` — Clerk JWKS JWT verification dependency
- `apps/api/core/rate_limit.py` — slowapi per-tenant rate limiter
- `apps/api/core/metrics.py` — Prometheus metrics + MetricsMiddleware + /metrics endpoint
- `apps/api/core/logging_config.py` — structured JSON logging with trace_id ContextVar
- `apps/api/core/config.py` — new settings: auth, rate-limit, observability, Vault
- `apps/api/main.py` — wires Sentry, Vault, rate limiter, metrics middleware; version 0.4.0
- `apps/api/routers/simulation.py` — rate limit on /run and /run-stream
- `apps/api/routers/candidates.py` — rate limit on /extract
- `apps/api/routers/telemetry.py` — Slack HMAC-SHA256 signature validation
- `apps/api/services/simulation_engine.py` — SIM_DURATION histogram
- `apps/api/services/nlp_agent.py` — NLP_LATENCY histogram
- `apps/web/instrumentation.ts` — Next.js 14 Sentry server/edge init
- `apps/web/sentry.client.config.ts` — Sentry browser SDK init
- `apps/web/sentry.server.config.ts` — Sentry server SDK init
- `apps/web/next.config.ts` — bundle analyzer, Sentry DSN env
- `docker-compose.yml` — Prometheus + Grafana services
- `docker/prometheus/prometheus.yml` — scrape configs
- `docker/grafana/provisioning/` — datasource + dashboard auto-provisioning
- `k8s/` — full Kubernetes manifest set (10 files)
- `k8s/helm/` — Helm chart (7 files)
- `scripts/pii_audit.py` — PII scan tool
- `tests/load/sim_load_test.js` — k6 load test
- `docs/runbook.md` — incident response runbook
- `docs/ADR/ADR-003-auth-hardening.md`
- `docs/ADR/ADR-004-observability.md`
- `Makefile` — deploy-staging, deploy-prod, load-test, pii-audit, bundle-analyze targets
- `.env.example` — updated with Sprint 9 variables

---

## 📊 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Kafka connector for Slack changes API | Medium | High | Abstract behind custom operator; integration tests |
| Monte Carlo too slow for large graphs | Medium | High | GDS library fallback; async streaming UI |
| NLP extraction quality too low | Medium | High | Human-in-the-loop review step in intake flow |
| Graph rendering performance on 500+ nodes | High | Medium | Node virtualization; level-of-detail rendering |
| Candidate PII leaking into graph | Low | Critical | Anonymization layer at ingestion; automated PII scan in CI |
| Neo4j GDS license cost at scale | Medium | Medium | ADR documenting fallback to NetworkX + horizontal scaling |

---

## 🔄 Definition of Done (Per Sprint)

A sprint is complete when ALL of the following are true:

1. ✅ All deliverables implemented and merged to `main`
2. ✅ `make test` passes with no skipped tests
3. ✅ `make lint` passes with zero warnings
4. ✅ All new endpoints have OpenAPI docs (`/docs`)
5. ✅ Any new UI components reviewed against `BRAND.md`
6. ✅ ADR written for any architectural decision made
7. ✅ Sprint retrospective notes in `docs/retros/sprint-N.md`

---

## 📅 Timeline Summary

```
Week  1-2   S0  Foundation         ████░░░░░░░░░░░░░░░░░
Week  3-4   S1  The Graph          ░░░░████░░░░░░░░░░░░░
Week  5-6   S2  The Signal         ░░░░░░░░████░░░░░░░░░
Week  7-8   S3  The Pipe           ░░░░░░░░░░░░████░░░░░
Week  9-10  S4  The Brain          ░░░░░░░░░░░░░░░░████░
Week 11-12  S5  The Voice          ░░░░░░░░░░░░░░░░░░░░████
Week 13-14  S6  The Canvas         ░░░░░░░░░░░░░░░░░░░░░░░░████
Week 15-16  S7  The Simulator      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░████
Week 17-18  S8  The Dashboard      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████
Week 19-20  S9  The Hardening      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████
```

---

*PLAN.md is a living document. Update sprint deliverables as scope is clarified. Never change sprint goals without a team betting-table decision.*
