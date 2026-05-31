"use client"

/**
 * ForceGraphInner — thin client wrapper around react-force-graph-2d.
 *
 * WHY THIS EXISTS:
 * `next/dynamic(() => import("react-force-graph-2d"), { ssr: false })` does NOT
 * forward React refs to the loaded component. That silently turned every
 * `fgRef.current?.d3Force(...)` / `zoomToFit()` call in TeamGraph into a no-op,
 * so the graph rendered with react-force-graph's DEFAULT forces (tight clump,
 * overlapping nodes) and the zoom controls did nothing.
 *
 * The fix: accept the ref as an ordinary prop (`innerRef`) — which next/dynamic
 * passes through like any other prop — and attach it to ForceGraph2D here.
 */

import ForceGraph2D from "react-force-graph-2d"
import type { Ref } from "react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ForceGraphProps = Record<string, any>

export default function ForceGraphInner({
  innerRef,
  ...props
}: ForceGraphProps & { innerRef?: Ref<unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ForceGraph2D ref={innerRef as any} {...props} />
}
