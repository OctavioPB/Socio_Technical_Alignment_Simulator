"use client"

/**
 * EngineerPanel — right-side slide-in panel showing full engineer profile.
 * Opens when a graph node is clicked. Closes on X or by clicking the same node.
 */

import type { ForceGraphNode } from "@/lib/api/types"

interface Props {
  node: ForceGraphNode | null
  onClose: () => void
}

export function EngineerPanel({ node, onClose }: Props) {
  if (!node) return null

  return (
    <div
      data-testid="engineer-panel"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        backgroundColor: "#ffffff",
        borderLeft: "1px solid var(--primary-10)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 16px rgba(0,51,102,0.08)",
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "var(--primary)",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          padding: "20px 20px 16px",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close engineer panel"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>

        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--gold-light)",
            marginBottom: 6,
          }}
        >
          Engineer Profile
        </div>

        <div
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 18,
            fontWeight: 300,
            color: "#ffffff",
            lineHeight: 1.2,
          }}
        >
          {node.name}
        </div>

        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 10,
            color: "rgba(255,255,255,0.5)",
            marginTop: 4,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {node.seniority} · {node.team}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {/* Centrality metrics */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {[
            { label: "Closeness", value: node.closeness.toFixed(3) },
            { label: "Betweenness", value: node.betweenness.toFixed(3) },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                backgroundColor: "var(--light)",
                borderRadius: 8,
                padding: "12px 14px",
                borderLeft: "3px solid var(--gold)",
              }}
            >
              <div
                style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontSize: 22,
                  fontWeight: 300,
                  color: "var(--dark)",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {m.value}
              </div>
              <div
                style={{
                  fontFamily: "var(--fb)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "var(--mid)",
                }}
              >
                {m.label}
              </div>
            </div>
          ))}
        </div>

        {/* Skills */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "var(--gold)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ width: 24, height: 1, backgroundColor: "var(--gold)" }} />
            Skills
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {node.skills.map((skill) => (
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
                  padding: "4px 8px",
                  borderRadius: 4,
                }}
              >
                {skill}
              </span>
            ))}
            {node.skills.length === 0 && (
              <span style={{ fontFamily: "var(--fb)", fontSize: 12, color: "var(--mid)" }}>
                No skills recorded
              </span>
            )}
          </div>
        </div>

        {/* ID */}
        <div
          style={{
            borderTop: "1px solid var(--primary-10)",
            paddingTop: 14,
            fontFamily: "var(--fb)",
            fontSize: 11,
            color: "var(--mid)",
          }}
        >
          <span style={{ fontWeight: 600 }}>ID: </span>
          <code style={{ fontFamily: "Courier New", fontSize: 12 }}>{node.id}</code>
        </div>
      </div>
    </div>
  )
}
