"use client"

/**
 * NodeTooltip — follows the cursor, shows engineer name, top-3 skills,
 * closeness centrality. Positioned fixed relative to viewport.
 */

import type { ForceGraphNode } from "@/lib/api/types"

interface Props {
  nodeId: string
  nodes: ForceGraphNode[]
  x: number
  y: number
}

export function NodeTooltip({ nodeId, nodes, x, y }: Props) {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null

  const top3Skills = node.skills.slice(0, 3)

  return (
    <div
      style={{
        position: "fixed",
        left: x + 14,
        top: y - 10,
        zIndex: 200,
        backgroundColor: "#ffffff",
        borderRadius: 10,
        padding: "12px 16px",
        boxShadow: "0 4px 16px rgba(0,51,102,0.14)",
        borderTop: "3px solid var(--gold)",
        pointerEvents: "none",
        minWidth: 180,
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 14,
          fontWeight: 400,
          color: "#0a1628",
          marginBottom: 4,
        }}
      >
        {node.name}
      </div>

      <div
        style={{
          fontFamily: "var(--fb)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--gold)",
          marginBottom: 8,
        }}
      >
        {node.seniority} · {node.team}
      </div>

      {top3Skills.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {top3Skills.map((skill) => (
            <span
              key={skill}
              style={{
                backgroundColor: "var(--primary-10)",
                color: "var(--primary)",
                fontSize: 9,
                fontFamily: "var(--fb)",
                fontWeight: 600,
                letterSpacing: "1px",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid var(--primary-10)",
          paddingTop: 8,
          fontFamily: "var(--fb)",
          fontSize: 11,
          color: "var(--mid)",
        }}
      >
        <span>Closeness: </span>
        <strong style={{ color: "var(--dark)", fontWeight: 600 }}>
          {node.closeness.toFixed(3)}
        </strong>
        {" · "}
        <span>Betweenness: </span>
        <strong style={{ color: "var(--dark)", fontWeight: 600 }}>
          {node.betweenness.toFixed(3)}
        </strong>
      </div>
    </div>
  )
}
