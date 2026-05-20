interface Distribution {
  mean: number
  ci_95: [number, number]
}

interface Props {
  distribution: Distribution
  size?: number
  slot?: "A" | "B"
}

/**
 * SVG arc ring chart representing a closeness centrality distribution.
 *
 * Visual layers (bottom → top):
 *   1. Background track (full circle, --light)
 *   2. CI arc (ci_95[0]→ci_95[1], gold semi-transparent)
 *   3. Mean arc (0→mean, gold solid, thinner)
 *   4. Mean point marker (filled circle at mean angle)
 *   5. Center text (mean value + "closeness" label)
 *
 * The domain [0, 1] maps linearly to angles [−π/2, 3π/2] (full circle, top to top).
 */
export function CentralityRingChart({ distribution, size = 120, slot = "A" }: Props) {
  const { mean, ci_95 } = distribution
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.37
  const trackW = size * 0.10
  const meanArcW = size * 0.065
  const ciArcW = trackW

  const mainColor = slot === "A" ? "#C8982A" : "#336699"
  const ciColor = slot === "A" ? "rgba(200,152,42,0.30)" : "rgba(51,102,153,0.30)"

  // Map value ∈ [0,1] to angle in radians (start from top, clockwise)
  function angle(v: number): number {
    return (v * 2 * Math.PI) - Math.PI / 2
  }

  function polarXY(a: number, radius: number): { x: number; y: number } {
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }
  }

  function arcPath(from: number, to: number, radius: number): string {
    if (Math.abs(to - from) < 0.0001) return ""
    const clampedTo = Math.min(to, 0.9999) // avoid complete-circle degenerate case
    const start = polarXY(angle(from), radius)
    const end = polarXY(angle(clampedTo), radius)
    const large = (to - from) > 0.5 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`
  }

  const meanPt = polarXY(angle(mean), r)
  const clampedMean = Math.min(Math.max(mean, 0), 1)
  const clampedLow = Math.min(Math.max(ci_95[0], 0), 1)
  const clampedHigh = Math.min(Math.max(ci_95[1], 0), 1)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block" }}
      aria-label={`Closeness centrality ${mean.toFixed(3)}, 95% CI [${ci_95[0].toFixed(3)}, ${ci_95[1].toFixed(3)}]`}
    >
      {/* 1. Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--primary-10)"
        strokeWidth={trackW}
      />

      {/* 2. CI arc */}
      {clampedHigh > clampedLow && (
        <path
          d={arcPath(clampedLow, clampedHigh, r)}
          fill="none"
          stroke={ciColor}
          strokeWidth={ciArcW}
          strokeLinecap="round"
        />
      )}

      {/* 3. Mean arc */}
      {clampedMean > 0 && (
        <path
          d={arcPath(0, clampedMean, r)}
          fill="none"
          stroke={mainColor}
          strokeWidth={meanArcW}
          strokeLinecap="round"
        />
      )}

      {/* 4. Mean point marker */}
      <circle
        cx={meanPt.x}
        cy={meanPt.y}
        r={trackW * 0.42}
        fill={mainColor}
      />

      {/* 5. Center: value */}
      <text
        x={cx}
        y={cy - size * 0.06}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: size * 0.175,
          fontWeight: 300,
          fill: "var(--dark)",
        }}
      >
        {mean.toFixed(3)}
      </text>

      {/* 5. Center: label */}
      <text
        x={cx}
        y={cy + size * 0.13}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--fb)",
          fontSize: size * 0.075,
          fill: "var(--mid)",
        }}
      >
        closeness
      </text>
    </svg>
  )
}
