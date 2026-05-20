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
  edgeOpacity,
  edgeWidth,
  extractTeams,
  getTeamColor,
  maxBetweenness,
  maxEdgeWeight,
  nodeRadius,
} from "@/lib/graph-utils"
import type { ForceGraphNode, ForceGraphLink } from "@/lib/api/types"
import type { Slot } from "@/lib/store/simulation"
import { EngineerPanel } from "./EngineerPanel"
import { NodeTooltip } from "./NodeTooltip"

// SSR-safe import — canvas APIs are browser-only
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

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

export function TeamGraph({ width, height, onCandidateDrop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<{ screen2GraphCoords: (x: number, y: number) => { x: number; y: number } } | null>(null)
  const [dims, setDims] = useState({ w: width ?? 800, h: height ?? 600 })
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

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
        ctx.arc(en.x, en.y, r + 4, 0, 2 * Math.PI, false)
        ctx.fillStyle = isSelected
          ? "rgba(200,152,42,0.25)"
          : "rgba(232,196,106,0.15)"
        ctx.fill()
      }

      // Main circle
      ctx.beginPath()
      ctx.arc(en.x, en.y, r, 0, 2 * Math.PI, false)
      ctx.fillStyle = color
      ctx.fill()

      // Stroke
      ctx.strokeStyle = isSelected
        ? "#C8982A"
        : isHovered
        ? "rgba(232,196,106,0.8)"
        : "rgba(255,255,255,0.25)"
      ctx.lineWidth = isSelected ? 2 : 1
      ctx.stroke()

      // Label — only show when zoomed in
      if (globalScale >= 1.8) {
        const fontSize = Math.max(10 / globalScale, 2)
        ctx.font = `${fontSize}px 'Plus Jakarta Sans', sans-serif`
        ctx.fillStyle = "#1C1C2E"
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText(en.name.split(" ")[0] ?? en.id, en.x, en.y + r + 2)
      }
    },
    [hoveredNodeId, selectedNodeId, teams, mxBetweenness],
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

      // Regular edge
      const opacity = edgeOpacity(l.weight, mxEdgeWeight)
      const strokeWidth = edgeWidth(l.weight, mxEdgeWeight)
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
      ctx.strokeStyle = `rgba(0, 51, 102, ${opacity})`
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

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!mergedData || mergedData.nodes.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 400,
          backgroundColor: "#ffffff",
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
  const warmupTicks = nodeCount > 300 ? 200 : 50
  const cooldownTicks = nodeCount > 500 ? 0 : undefined

  return (
    <div
      style={{
        position: "relative",
        backgroundColor: "#ffffff",
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
          ref={fgRef as never}
          graphData={mergedData as never}
          width={dims.w}
          height={dims.h}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => "replace"}
          onNodeHover={handleNodeHover as never}
          onNodeClick={handleNodeClick as never}
          warmupTicks={warmupTicks}
          cooldownTicks={cooldownTicks}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          minZoom={0.2}
          maxZoom={8}
        />
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
