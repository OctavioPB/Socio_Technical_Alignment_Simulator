import type { SimulationResult } from "@/lib/api/types"
import { CentralityRingChart } from "./CentralityRingChart"

interface Props {
  slotA: SimulationResult
  slotB: SimulationResult
  nameA?: string
  nameB?: string
}

interface MetricRowProps {
  label: string
  valueA: number
  valueB: number
  lowerIsBetter?: boolean
}

function MetricRow({ label, valueA, valueB, lowerIsBetter = false }: MetricRowProps) {
  const aWins = lowerIsBetter ? valueA < valueB : valueA > valueB
  const bWins = lowerIsBetter ? valueB < valueA : valueB > valueA

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--primary-10)",
      }}
    >
      {/* Slot A value */}
      <div
        style={{
          textAlign: "right",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 17,
            fontWeight: 300,
            color: aWins ? "var(--dark)" : "var(--mid)",
          }}
        >
          {valueA.toFixed(3)}
        </span>
        {aWins && (
          <span style={{ fontSize: 9, color: "#27B97C", fontWeight: 700 }}>▲</span>
        )}
      </div>

      {/* Metric label */}
      <div
        style={{
          fontFamily: "var(--fb)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--mid)",
          textAlign: "center",
          minWidth: 70,
        }}
      >
        {label}
      </div>

      {/* Slot B value */}
      <div
        style={{
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {bWins && (
          <span style={{ fontSize: 9, color: "#27B97C", fontWeight: 700 }}>▲</span>
        )}
        <span
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 17,
            fontWeight: 300,
            color: bWins ? "var(--dark)" : "var(--mid)",
          }}
        >
          {valueB.toFixed(3)}
        </span>
      </div>
    </div>
  )
}

export function ComparisonPanel({ slotA, slotB, nameA, nameB }: Props) {
  return (
    <div
      data-testid="comparison-panel"
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 1px 6px rgba(0,51,102,0.09)",
        overflow: "hidden",
      }}
    >
      {/* Dual-color accent bar */}
      <div style={{ display: "flex", height: 3 }}>
        <div style={{ flex: 1, backgroundColor: "var(--gold)" }} />
        <div style={{ flex: 1, backgroundColor: "var(--primary-60)" }} />
      </div>

      <div style={{ padding: "18px 20px" }}>
        {/* Header */}
        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--mid)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ width: 24, height: 1, backgroundColor: "var(--gold)" }} />
          Head-to-head
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              textAlign: "right",
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            {nameA ?? "Candidate A"}
          </div>
          <div style={{ minWidth: 70 }} />
          <div
            style={{
              textAlign: "left",
              fontFamily: "var(--fb)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--primary-60)",
            }}
          >
            {nameB ?? "Candidate B"}
          </div>
        </div>

        {/* Ring charts side by side */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <CentralityRingChart
              distribution={slotA.closeness_centrality}
              size={90}
              slot="A"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <CentralityRingChart
              distribution={slotB.closeness_centrality}
              size={90}
              slot="B"
            />
          </div>
        </div>

        {/* Metric comparison rows */}
        <MetricRow
          label="Closeness"
          valueA={slotA.closeness_centrality.mean}
          valueB={slotB.closeness_centrality.mean}
        />
        <MetricRow
          label="TTV (wks)"
          valueA={slotA.time_to_value_weeks.mean}
          valueB={slotB.time_to_value_weeks.mean}
          lowerIsBetter
        />
        <MetricRow
          label="Silo risk"
          valueA={slotA.silo_risk_score.mean}
          valueB={slotB.silo_risk_score.mean}
          lowerIsBetter
        />
        <MetricRow
          label="Betweenness Δ"
          valueA={slotA.betweenness_delta.mean}
          valueB={slotB.betweenness_delta.mean}
        />
      </div>
    </div>
  )
}
