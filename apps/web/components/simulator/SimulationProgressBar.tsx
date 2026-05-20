interface Props {
  progress: number       // 0–1
  iterationCount: number
}

export function SimulationProgressBar({ progress, iterationCount }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontFamily: "var(--fb)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--gold)",
          }}
        >
          Simulating
        </div>
        <div
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 13,
            fontWeight: 300,
            color: "var(--dark)",
          }}
        >
          {iterationCount.toLocaleString()}
          <span
            style={{
              fontFamily: "var(--fb)",
              fontSize: 10,
              color: "var(--mid)",
              marginLeft: 3,
            }}
          >
            iter
          </span>
        </div>
      </div>

      {/* Track */}
      <div
        style={{
          height: 4,
          backgroundColor: "var(--primary-10)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {/* Fill */}
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: "var(--gold)",
            borderRadius: 4,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div
        style={{
          textAlign: "right",
          marginTop: 4,
          fontFamily: "var(--fb)",
          fontSize: 10,
          color: "var(--mid)",
        }}
      >
        {pct}%
      </div>
    </div>
  )
}
