/** BRAND.md: semantic status badge system. Pill shape, 6px dot indicator. */

type Status = "complete" | "in-progress" | "pending" | "error" | "warning"

const STATUS_COLORS: Record<Status, { bg: string; text: string; dot: string }> = {
  complete:    { bg: "#E0F7EF", text: "#0D5C3A", dot: "#27B97C" },
  "in-progress": { bg: "#FEF0E6", text: "#7A3800", dot: "#F07020" },
  pending:     { bg: "#E0EAF4", text: "#001F4D", dot: "#003366" },
  error:       { bg: "#FDEAEA", text: "#7A1020", dot: "#E03448" },
  warning:     { bg: "#FEF0E6", text: "#7A3800", dot: "#F07020" },
}

interface StatusBadgeProps {
  status: Status
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status]
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize: 10,
        fontFamily: "var(--fb)",
        fontWeight: 500,
        letterSpacing: "1px",
        padding: "4px 10px",
        borderRadius: 20,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: colors.dot,
          flexShrink: 0,
        }}
      />
      {label ?? status}
    </span>
  )
}
