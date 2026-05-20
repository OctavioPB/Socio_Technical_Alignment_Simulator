/** BRAND.md: Section title in Fraunces 22px weight 300. */

interface SectionTitleProps {
  children: React.ReactNode
}

export function SectionTitle({ children }: SectionTitleProps) {
  return (
    <h2
      style={{
        fontFamily: "'Fraunces', Georgia, serif",
        fontSize: 22,
        fontWeight: 300,
        color: "#0a1628",
        margin: "0 0 4px",
        lineHeight: 1.25,
      }}
    >
      {children}
    </h2>
  )
}
