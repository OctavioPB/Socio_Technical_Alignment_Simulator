# ADR-001 — Graph Database Selection

**Date:** 2026-05-15  
**Status:** Accepted  
**Deciders:** Octavio Pérez Bravo

---

## Context

STAS models engineers and candidates as nodes, and their collaboration patterns (PR reviews, Slack threads, Jira blockers, pair programming sessions) as weighted directed edges. The core computation — closeness centrality — requires efficient shortest-path traversal across a graph of up to 500 nodes and tens of thousands of edges.

We evaluated three graph databases: **Neo4j 5.x**, **TigerGraph**, and **Amazon Neptune**.

---

## Decision

**Use Neo4j 5.x (Community Edition).**

---

## Evaluation

### Neo4j 5.x
| Factor | Assessment |
|---|---|
| Query language | Cypher — expressive, readable, first-class shortest-path (`shortestPath()`, `allShortestPaths()`) |
| Centrality at scale | Graph Data Science (GDS) library: `gds.closeness.stream()`, `gds.betweenness.stream()` — production-grade, parallelised |
| Python driver | `neo4j` 5.x — async/await native, matches our FastAPI stack |
| Local dev | Official Docker image; Neo4j Browser at `:7474` |
| Scale ceiling | Community Edition handles our target (≤500 nodes); Enterprise adds clustering for >100M node graphs |
| Cost | Community Edition: free. GDS plugin: free for Community. |
| Community + docs | Large, English-first, mature ecosystem |

### TigerGraph
| Factor | Assessment |
|---|---|
| Query language | GSQL — more powerful for massively parallel graph ML, but steeper learning curve than Cypher |
| Scale | Optimised for billions of nodes — overkill for our current scale |
| Local dev | Docker image exists but setup is heavier; no equivalent to Neo4j Browser for exploration |
| Cost | Free tier limited; production licensing costs are opaque |
| Verdict | **Rejected** — engineering overhead exceeds benefit at our scale |

### Amazon Neptune
| Factor | Assessment |
|---|---|
| Query language | Gremlin or SPARQL — neither is as ergonomic as Cypher for shortest-path patterns |
| Local dev | No official local Docker image; requires AWS for any real testing |
| Cost | Serverless pricing model is unpredictable under simulation workloads (many graph traversals) |
| Centrality | No built-in centrality library; must implement in Python and shuttle data |
| Vendor lock-in | Tight AWS coupling conflicts with Docker Compose → Kubernetes portability goal |
| Verdict | **Rejected** — no local dev story; query language mismatch; pricing risk |

---

## Consequences

- **Centrality threshold:** Graphs ≤ 200 nodes compute centrality via NetworkX in Python (fast, no extra infra). Graphs > 200 nodes offload to Neo4j GDS `gds.closeness.stream()`. Threshold is configurable via `SIMULATION_GDS_THRESHOLD` env var.
- **GDS plugin:** Added to Neo4j Docker container via `NEO4J_PLUGINS=["apoc","graph-data-science"]` in Sprint 1.
- **Migration path:** If the graph grows beyond Community Edition limits, the Cypher query surface is identical in Enterprise — a config change, not a rewrite.
- **No GDS mocking in tests:** Per engineering standards, graph tests spin up a real Neo4j test container. No mock driver.

---

## Related

- ADR-002 — Frontend graph library selection
- `graph/schema/schema.cypher` — constraint and index definitions
- `apps/api/services/graph_service.py` — all Cypher queries
