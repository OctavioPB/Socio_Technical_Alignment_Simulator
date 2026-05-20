# ADR-002 — Frontend Graph Visualization Library

**Date:** 2026-05-15  
**Status:** Accepted  
**Deciders:** Octavio Pérez Bravo

---

## Context

The signature UI of STAS is an interactive force-directed graph showing engineers as nodes and collaboration edges between them. The drag-to-drop candidate insertion in Sprint 7 requires:

- Real-time node/edge insertion without full re-render
- 60fps at 200 nodes; acceptable at 500 nodes (with virtualization)
- WebGL or Canvas rendering (DOM-based SVG does not scale past ~100 nodes)
- React integration that works with Server Components + Client hydration model
- TypeScript typings
- Customizable node appearance (size by centrality, color by team, glow on simulation)
- Edge animation during Monte Carlo streaming

We evaluated: **react-force-graph**, **@antv/g6**, and **Sigma.js**.

---

## Decision

**Use `react-force-graph` (specifically `react-force-graph-2d`).**

---

## Evaluation

### react-force-graph
| Factor | Assessment |
|---|---|
| Rendering | Canvas 2D + optional WebGL via `react-force-graph-3d` |
| React integration | Thin wrapper over `d3-force` and `three.js`; props-driven, works cleanly as a `"use client"` component |
| Performance | 500-node graph at 60fps on mid-range hardware (Canvas2D); 3D mode handles thousands of nodes |
| Customization | `nodeCanvasObject`, `linkCanvasObject` callbacks give full control over node/edge rendering |
| TypeScript | Full types via `@types/react-force-graph` |
| Bundle size | ~120KB gzipped (2D variant). Acceptable within our <200KB first-load JS target when code-split |
| Node insertion | `graphData` prop is reactive; updating nodes/links array triggers incremental re-layout |
| Verdict | **Selected** — best React ergonomics + Canvas performance for our node count |

### @antv/g6
| Factor | Assessment |
|---|---|
| Rendering | Canvas + WebGL |
| React integration | Requires manual imperative API; no idiomatic React bindings; state sync is verbose |
| Performance | Excellent — designed for enterprise diagram tools |
| Customization | Rich but complex; better suited to schema diagrams than real-time force simulations |
| TypeScript | Types exist but documentation is primarily in Chinese |
| Bundle size | ~280KB gzipped — too large for our first-load JS target without heavy tree-shaking |
| Verdict | **Rejected** — bundle size and React integration ergonomics |

### Sigma.js
| Factor | Assessment |
|---|---|
| Rendering | WebGL-first; designed for graphs with tens of thousands of nodes |
| React integration | `@react-sigma/core` exists but is lightly maintained |
| Performance | Exceptional at scale (10k+ nodes) — overcapable for our 500-node ceiling |
| Force layout | Requires separate `graphology-layout-force` — more moving parts |
| Customization | Node programs are GLSL shader-level — powerful but excessive for our use case |
| Verdict | **Rejected** — over-engineered for our scale; React bindings are not production-grade |

---

## Consequences

- `react-force-graph-2d` is added to `apps/web/package.json` in Sprint 6.
- The `<TeamGraph>` component wraps it in a `"use client"` boundary; initial data is fetched in a Server Component and passed as props.
- Node rendering uses `nodeCanvasObject` for: team color fill, centrality-proportional radius, glow effect during simulation.
- Edge rendering uses `linkCanvasObject` for: opacity proportional to weight, pulse animation during Monte Carlo streaming.
- If the graph grows past 500 nodes, the 3D variant (`react-force-graph-3d` with three.js WebGL) is a drop-in replacement — same API.

---

## Related

- ADR-001 — Graph database selection
- `apps/web/components/graph/TeamGraph.tsx` (Sprint 6)
- `apps/web/lib/store/graph.ts` — Zustand store for graph topology state
