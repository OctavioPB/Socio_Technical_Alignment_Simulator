"use client"

/**
 * TeamGraph — interactive force-directed graph using react-force-graph-2d.
 *
 * Architecture:
 *  - Client Component with `ssr: false` dynamic import (canvas requires browser APIs)
 *  - Receives ForceGraphData from parent (Server Component fetched, stored in Zustand)
 *  - nodeCanvasObject: team-colored circle, centrality-proportional radius, hover glow
 *    + gold diamond shape for candidate overlay nodes
 *  - linkCanvasObject: opacity + width proportional to interaction weight
 *    + dashed gold pulse for predicted (candidate) edges
 *  - onCandidateDrop: optional prop; enables graph-canvas drop zone for drag-and-drop
 *  - Virtualization: warmupTicks=100 pre-computes layout; cooldown halts for 500+ nodes
 */

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGraphStore, computePredictedEdges } from "@/lib/store/graph"
import type { CandidateForceNode, PredictedForceLink } from "@/lib/store/graph"
import {
  edgeColor,
  edgeOpacity,
  edgeWidth,
  extractTeams,
  getTeamColor,
  maxBetweenness,
  maxEdgeWeight,
  nodeRadius,
  RELATIONSHIP_META,
} from "@/lib/graph-utils"
import type { ForceGraphNode, ForceGraphLink } from "@/lib/api/types"
import type { Slot } from "@/lib/store/simulation"
import { EngineerPanel } from "./EngineerPanel"
import { NodeTooltip } from "./NodeTooltip"

// SSR-safe import — canvas APIs are browser-only.
// We import a wrapper (not react-force-graph-2d directly) because next/dynamic
// does not forward refs; the wrapper takes the ref as an `innerRef` prop instead.
const ForceGraph2D = dynamic(() => import("./ForceGraphInner"), { ssr: false })

// Inline collision force — prevents nodes from occupying the same canvas space.
// Does NOT scale by alpha: full correction is applied every tick so nodes
// stay separated even after the simulation has cooled.
function makeCollideForce(radiusFn: (n: unknown) => number, strength = 0.9, iterations = 4) {
  let nodes: unknown[] = []
  function force() {
    for (let k = 0; k < iterations; k++) {
      for (let i = 0; i < nodes.length; i++) {
        const ni = nodes[i] as { x?: number; y?: number; vx?: number; vy?: number }
        const ri = radiusFn(ni)
        for (let j = i + 1; j < nodes.length; j++) {
          const nj = nodes[j] as { x?: number; y?: number; vx?: number; vy?: number }
          const rj = radiusFn(nj)
          const minDist = ri + rj
          const dx = (nj.x ?? 0) - (ni.x ?? 0)
          const dy = (nj.y ?? 0) - (ni.y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
          if (dist < minDist) {
            const push = ((minDist - dist) / dist) * strength * 0.5
            const ox = dx * push
            const oy = dy * push
            ni.vx = (ni.vx ?? 0) - ox
            ni.vy = (ni.vy ?? 0) - oy
            nj.vx = (nj.vx ?? 0) + ox
            nj.vy = (nj.vy ?? 0) + oy
          }
        }
      }
    }
  }
  force.initialize = (ns: unknown[]) => { nodes = ns }
  return force
}

// Slot accent colors (matches BRAND.md series)
const SLOT_CANVAS_COLOR: Record<Slot, string> = {
  A: "#C8982A",
  B: "#336699",
}

interface Props {
  width?: number
  height?: number
  /**
   * Called when a candidate card is dropped onto the canvas.
   * `x` and `y` are graph-space coordinates at the drop point.
   */
  onCandidateDrop?: (
    slot: Slot,
    candidateId: string,
    name: string,
    skills: string[],
    x: number,
    y: number,
  ) => void
}

type FGRef = {
  screen2GraphCoords: (x: number, y: number) => { x: number; y: number }
  zoomToFit: (duration?: number, padding?: number) => void
  zoom: (k: number, duration?: number) => void
}

export function TeamGraph({ width, height, onCandidateDrop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<FGRef | null>(null)
  const hasZoomedToFit = useRef(false)
  const [dims, setDims] = useState({ w: width ?? 800, h: height ?? 600 })
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  // Tracks when ForceGraph2D (dynamically imported) has actually mounted so
  // the force-config effect fires after the ref is populated.
  const [fgMounted, setFgMounted] = useState(false)
  const fgCallbackRef = useCallback((instance: FGRef | null) => {
    fgRef.current = instance
    if (instance) setFgMounted(true)
  }, [])

  const {
    graphData,
    candidateNodes,
    hoveredNodeId,
    selectedNodeId,
    setHoveredNodeId,
    setSelectedNodeId,
    getSelectedNode,
  } = useGraphStore()

  // Responsive sizing — fill container if width/height not provided
  useEffect(() => {
    if (width && height) return
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight })
    })
    observer.observe(el)
    setDims({ w: el.clientWidth || 800, h: el.clientHeight || 600 })
    return () => observer.disconnect()
  }, [width, height])

  // Merge base graph with candidate overlay nodes + predicted edges
  const activeCandidates = useMemo(
    () =>
      [candidateNodes.A, candidateNodes.B].filter(
        (n): n is CandidateForceNode => n !== null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidateNodes.A, candidateNodes.B],
  )

  const mergedData = useMemo(() => {
    if (!graphData) return null
    if (activeCandidates.length === 0) return graphData
    const predictedLinks = activeCandidates.flatMap((c) =>
      computePredictedEdges(c, graphData.nodes),
    )
    return {
      nodes: [...graphData.nodes, ...activeCandidates],
      links: [...graphData.links, ...predictedLinks],
    }
  }, [graphData, activeCandidates])

  // Pre-computed graph statistics (memoised so canvas callbacks are stable)
  const teams = useMemo(
    () => extractTeams(graphData?.nodes ?? []),
    [graphData?.nodes],
  )
  const mxBetweenness = useMemo(
    () => maxBetweenness(graphData?.nodes ?? []),
    [graphData?.nodes],
  )
  const mxEdgeWeight = useMemo(
    () => maxEdgeWeight(mergedData?.links ?? []),
    [mergedData?.links],
  )

  // ── d3 force configuration ────────────────────────────────────────────────
  // react-force-graph-2d defaults: charge=-30, linkDistance=30.
  // These are appropriate for small abstract diagrams but produce tightly
  // packed clusters on knowledge graphs. We reconfigure whenever the data
  // changes and reheat so the new forces take effect.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fg = fgRef.current as any
    if (!fg || !mergedData) return

    const nodeCount = mergedData.nodes.length
    // Scale repulsion with graph size: more nodes need stronger repulsion
    const chargeStrength = nodeCount > 30 ? -1100 : nodeCount > 15 ? -650 : -420

    fg.d3Force("charge")?.strength(chargeStrength)
    // Rest length keeps linked pairs apart without flinging them off-canvas
    fg.d3Force("link")?.distance(120).strength(0.3)
    // Gentle gravity keeps the graph compact enough to frame cleanly
    fg.d3Force("center")?.strength(0.05)

    // Collision force: prevent nodes from physically occupying the same space.
    // 28px buffer ensures labels (drawn outside the circle) don't touch either.
    fg.d3Force("collision", makeCollideForce((node: unknown) => {
      const n = node as { betweenness?: number }
      const r = nodeRadius(n.betweenness ?? 0, mxBetweenness)
      return r + 28
    }, 0.9, 4))

    hasZoomedToFit.current = false
    fg.d3ReheatSimulation()
  // fgMounted ensures this runs after ForceGraph2D mounts, not just on data change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedData, mxBetweenness, fgMounted])

  // ── Canvas callbacks ──────────────────────────────────────────────────────

  const nodeCanvasObject = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as (ForceGraphNode | CandidateForceNode) & { x: number; y: number }
      if (n.x === undefined || n.y === undefined) return

      const isCandidate = (n as CandidateForceNode).isCandidate

      if (isCandidate) {
        const cn = n as CandidateForceNode & { x: number; y: number }
        const slotColor = SLOT_CANVAS_COLOR[cn.slot]
        const r = 10

        // Glow ring
        ctx.beginPath()
        ctx.arc(cn.x, cn.y, r + 7, 0, 2 * Math.PI)
        ctx.fillStyle =
          cn.slot === "A" ? "rgba(200,152,42,0.18)" : "rgba(51,102,153,0.18)"
        ctx.fill()

        // Diamond body
        ctx.beginPath()
        ctx.moveTo(cn.x, cn.y - r * 1.45)  // top
        ctx.lineTo(cn.x + r, cn.y)           // right
        ctx.lineTo(cn.x, cn.y + r * 1.45)   // bottom
        ctx.lineTo(cn.x - r, cn.y)           // left
        ctx.closePath()
        ctx.fillStyle = slotColor
        ctx.fill()
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Label always visible for candidates
        const fontSize = Math.max(10 / globalScale, 2.5)
        ctx.font = `600 ${fontSize}px 'Plus Jakarta Sans', sans-serif`
        ctx.fillStyle = slotColor
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText(cn.name.split(" ")[0] ?? cn.id, cn.x, cn.y + r * 1.45 + 3)
        return
      }

      // ── Regular engineer node ───────────────────────────────────────────
      const en = n as ForceGraphNode & { x: number; y: number }
      const r = nodeRadius(en.betweenness, mxBetweenness)
      const color = getTeamColor(en.team, teams)
      const isHovered = en.id === hoveredNodeId
      const isSelected = en.id === selectedNodeId

      // Glow ring for hovered / selected
      if (isHovered || isSelected) {
        ctx.beginPath()
        ctx.arc(en.x, en.y, r + 5, 0, 2 * Math.PI, false)
        ctx.fillStyle = isSelected
          ? "rgba(200,152,42,0.22)"
          : "rgba(232,196,106,0.14)"
        ctx.fill()
      }

      // Seniority outer ring (drawn behind the main circle fill)
      if (en.seniority === "staff") {
        ctx.beginPath()
        ctx.arc(en.x, en.y, r + 3, 0, 2 * Math.PI, false)
        ctx.strokeStyle = "#C8982A"
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (en.seniority === "senior") {
        ctx.beginPath()
        ctx.arc(en.x, en.y, r + 2.5, 0, 2 * Math.PI, false)
        ctx.strokeStyle = "rgba(255,255,255,0.55)"
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Main circle
      ctx.beginPath()
      ctx.arc(en.x, en.y, r, 0, 2 * Math.PI, false)
      ctx.fillStyle = color
      ctx.fill()

      // Inner stroke
      ctx.strokeStyle = isSelected
        ? "#C8982A"
        : isHovered
        ? "rgba(232,196,106,0.9)"
        : "rgba(255,255,255,0.35)"
      ctx.lineWidth = isSelected ? 2.5 : 1.5
      ctx.stroke()

      // Label — always for hovered/selected; zoom-gated otherwise
      const nodeCount = mergedData?.nodes.length ?? 0
      const showLabel =
        isHovered || isSelected || globalScale >= 1.2 || nodeCount <= 12

      if (showLabel) {
        const fontSize = Math.max(11 / globalScale, 2.5)
        ctx.font = `${fontSize}px 'Plus Jakarta Sans', sans-serif`
        // Shadow for legibility over edges
        ctx.shadowColor = "rgba(255,255,255,0.9)"
        ctx.shadowBlur = 4
        ctx.fillStyle = isSelected ? "#C8982A" : "#1C1C2E"
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        const label = en.name.split(" ").slice(0, 2).join(" ")
        ctx.fillText(label, en.x, en.y + r + 2.5)
        ctx.shadowBlur = 0
      }
    },
    // mergedData included so label threshold reacts to node count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoveredNodeId, selectedNodeId, teams, mxBetweenness, mergedData],
  )

  const linkCanvasObject = useCallback(
    (link: object, ctx: CanvasRenderingContext2D) => {
      const l = link as (ForceGraphLink | PredictedForceLink) & {
        source: { x?: number; y?: number }
        target: { x?: number; y?: number }
      }
      const sx = l.source.x
      const sy = l.source.y
      const tx = l.target.x
      const ty = l.target.y
      if (sx == null || sy == null || tx == null || ty == null) return

      const isPredicted = (l as PredictedForceLink).isPredicted

      if (isPredicted) {
        // Dashed gold/blue pulse — Date.now() is read live each frame
        const phase = (Date.now() / 350) % 1
        const slotColor = SLOT_CANVAS_COLOR[(l as PredictedForceLink).slot]

        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        ctx.setLineDash([5, 4])
        ctx.lineDashOffset = -phase * 9
        ctx.strokeStyle = slotColor
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.75
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        return
      }

      // Regular edge — colored by relationship type
      const opacity = edgeOpacity(l.weight, mxEdgeWeight)
      const strokeWidth = edgeWidth(l.weight, mxEdgeWeight)
      const baseColor = edgeColor(l.relationship)

      // Parse hex to apply opacity
      const r2 = parseInt(baseColor.slice(1, 3), 16)
      const g2 = parseInt(baseColor.slice(3, 5), 16)
      const b2 = parseInt(baseColor.slice(5, 7), 16)

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
      ctx.strokeStyle = `rgba(${r2},${g2},${b2},${opacity})`
      ctx.lineWidth = strokeWidth
      ctx.stroke()
    },
    [mxEdgeWeight],
  )

  const handleNodeHover = useCallback(
    (node: object | null, event?: MouseEvent) => {
      const n = node as (ForceGraphNode & { x?: number; y?: number }) | null
      setHoveredNodeId(n?.id ?? null)
      if (n && event) {
        setTooltipPos({ x: event.clientX, y: event.clientY })
      } else {
        setTooltipPos(null)
      }
    },
    [setHoveredNodeId],
  )

  const handleNodeClick = useCallback(
    (node: object) => {
      const n = node as ForceGraphNode
      setSelectedNodeId(selectedNodeId === n.id ? null : n.id)
    },
    [selectedNodeId, setSelectedNodeId],
  )

  // ── Drop zone handlers ─────────────────────────────────────────────────────

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onCandidateDrop) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setIsDragOver(true)
    },
    [onCandidateDrop],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onCandidateDrop) return
      e.preventDefault()
      setIsDragOver(false)

      const candidateId = e.dataTransfer.getData("application/x-candidate-id")
      const name = e.dataTransfer.getData("application/x-candidate-name")
      const skillsRaw = e.dataTransfer.getData("application/x-candidate-skills")
      const slotRaw = e.dataTransfer.getData("application/x-slot")
      if (!candidateId || !slotRaw) return

      const slot = slotRaw as Slot
      let skills: string[] = []
      try {
        skills = JSON.parse(skillsRaw) as string[]
      } catch {
        /* fall through with empty skills */
      }

      // Convert screen coordinates to graph-space via ForceGraph2D ref
      const rect = containerRef.current?.getBoundingClientRect()
      const screenX = e.clientX - (rect?.left ?? 0)
      const screenY = e.clientY - (rect?.top ?? 0)
      const graphCoords = fgRef.current?.screen2GraphCoords(screenX, screenY) ?? {
        x: 0,
        y: 0,
      }

      onCandidateDrop(slot, candidateId, name, skills, graphCoords.x, graphCoords.y)
    },
    [onCandidateDrop],
  )

  // Must be before any early return — hooks cannot be called conditionally
  const presentRelTypes = useMemo(() => {
    const types = new Set(
      (mergedData?.links ?? []).map((l) => (l as ForceGraphLink).relationship),
    )
    return Object.entries(RELATIONSHIP_META).filter(([key]) => types.has(key as never))
  }, [mergedData?.links])

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!mergedData || mergedData.nodes.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 400,
          backgroundColor: "var(--light)",
          borderRadius: 12,
          color: "var(--mid)",
          fontFamily: "var(--fb)",
          fontSize: 14,
        }}
      >
        No graph data — select a team to load the graph.
      </div>
    )
  }

  const nodeCount = mergedData.nodes.length
  // warmupTicks=0: let the live animation run so the collision force (configured
  // in the useEffect above) is active from tick 1 — not after 200 pre-computed ticks.
  const warmupTicks = 0
  const cooldownTicks = nodeCount > 500 ? 0 : undefined

  return (
    <div
      style={{
        position: "relative",
        backgroundColor: "var(--light)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 6px rgba(0,51,102,0.09)",
      }}
    >
      <div
        ref={containerRef}
        data-testid="team-graph-canvas"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          width: "100%",
          height: dims.h,
          outline: isDragOver
            ? "2px dashed var(--gold)"
            : "2px solid transparent",
          outlineOffset: -2,
          borderRadius: 12,
          transition: "outline-color 0.15s",
        }}
      >
        <ForceGraph2D
          innerRef={fgCallbackRef as never}
          graphData={mergedData as never}
          width={dims.w}
          height={dims.h}
          backgroundColor="#f4f6f9"
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => "replace"}
          onNodeHover={handleNodeHover as never}
          onNodeClick={handleNodeClick as never}
          warmupTicks={warmupTicks}
          cooldownTicks={cooldownTicks}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          minZoom={0.2}
          maxZoom={8}
          onEngineStop={() => {
            if (!hasZoomedToFit.current && fgRef.current) {
              // Generous padding: zoomToFit measures the library's default node
              // size (4px), not our custom-drawn radii (up to ~22px) + labels.
              fgRef.current.zoomToFit(600, 110)
              hasZoomedToFit.current = true
            }
          }}
        />
      </div>

      {/* ── Zoom controls ──────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 10,
        }}
      >
        {[
          {
            label: "⊞",
            title: "Fit graph to screen",
            action: () => fgRef.current?.zoomToFit(400, 110),
          },
          {
            label: "+",
            title: "Zoom in",
            action: () => fgRef.current?.zoom(1.4, 200),
          },
          {
            label: "−",
            title: "Zoom out",
            action: () => fgRef.current?.zoom(0.7, 200),
          },
        ].map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={btn.action}
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "1px solid var(--primary-30)",
              backgroundColor: "rgba(255,255,255,0.92)",
              color: "var(--primary)",
              fontSize: btn.label === "⊞" ? 14 : 16,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px rgba(0,51,102,0.10)",
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          backgroundColor: "rgba(255,255,255,0.93)",
          borderRadius: 8,
          padding: "10px 14px",
          boxShadow: "0 1px 6px rgba(0,51,102,0.10)",
          border: "1px solid var(--primary-10)",
          zIndex: 10,
          minWidth: 160,
        }}
      >
        {/* Teams */}
        {teams.length > 0 && (
          <div style={{ marginBottom: presentRelTypes.length > 0 ? 8 : 0 }}>
            <div
              style={{
                fontFamily: "var(--fb)",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--mid)",
                marginBottom: 5,
              }}
            >
              Teams
            </div>
            {teams.map((t) => (
              <div
                key={t}
                style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: getTeamColor(t, teams),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 10,
                    color: "var(--dark)",
                  }}
                >
                  {t}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Edge types */}
        {presentRelTypes.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: "var(--fb)",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--mid)",
                marginBottom: 5,
                marginTop: teams.length > 0 ? 6 : 0,
                paddingTop: teams.length > 0 ? 6 : 0,
                borderTop: teams.length > 0 ? "1px solid var(--primary-10)" : "none",
              }}
            >
              Edges
            </div>
            {presentRelTypes.map(([key, meta]) => (
              <div
                key={key}
                style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
              >
                <div
                  style={{
                    width: 18,
                    height: 2,
                    backgroundColor: meta.color,
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 10,
                    color: "var(--dark)",
                  }}
                >
                  {meta.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Node size */}
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid var(--primary-10)",
            fontFamily: "var(--fb)",
            fontSize: 9,
            color: "var(--mid)",
            lineHeight: 1.5,
          }}
        >
          Node size = betweenness
          <br />
          Gold ring = staff · white ring = senior
        </div>
      </div>

      {/* Drop zone hint overlay */}
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(200,152,42,0.08)",
            borderRadius: 12,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--gold)",
              letterSpacing: "1px",
            }}
          >
            Release to insert candidate
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {tooltipPos && hoveredNodeId && (
        <NodeTooltip
          nodeId={hoveredNodeId}
          nodes={graphData?.nodes ?? []}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}

      {/* Engineer profile panel — slides in on node click */}
      {selectedNodeId && (
        <EngineerPanel
          node={getSelectedNode()}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  )
}
