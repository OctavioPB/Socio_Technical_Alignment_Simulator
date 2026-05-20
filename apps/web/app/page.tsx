export default function Home() {
  const navStyle: React.CSSProperties = {
    backgroundColor: "rgba(0,51,102,.97)",
    backdropFilter: "blur(12px)",
    height: 52,
    position: "sticky",
    top: 0,
    display: "flex",
    alignItems: "center",
    padding: "0 40px",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    justifyContent: "space-between",
    zIndex: 100,
  }

  const heroStyle: React.CSSProperties = {
    backgroundColor: "#003366",
    backgroundImage:
      "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    padding: "96px 48px",
  }

  const statRowStyle: React.CSSProperties = {
    display: "flex",
    gap: 48,
    marginTop: 56,
    paddingTop: 40,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  }

  const statStyle: React.CSSProperties = {
    borderLeft: "2px solid #C8982A",
    paddingLeft: 18,
  }

  const footerStyle: React.CSSProperties = {
    backgroundColor: "var(--primary)",
    padding: "20px 48px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontFamily: "var(--fb)",
    fontSize: 9,
    letterSpacing: "3px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  }

  const sprints = [
    { num: "S0", name: "Foundation", status: "complete", desc: "Dev env, CI/CD, base services" },
    { num: "S1", name: "The Graph", status: "complete", desc: "Neo4j schema, seed data, Cypher library" },
    { num: "S2", name: "The Signal", status: "complete", desc: "Kafka telemetry ingestion" },
    { num: "S3", name: "The Pipe", status: "complete", desc: "Airflow orchestration DAGs" },
    { num: "S4", name: "The Brain", status: "complete", desc: "Monte Carlo simulation engine" },
    { num: "S5", name: "The Voice", status: "complete", desc: "Claude NLP candidate extraction" },
    { num: "S6", name: "The Canvas", status: "complete", desc: "Interactive force-directed graph" },
    { num: "S7", name: "The Simulator", status: "next", desc: "Drag-and-drop candidate UI" },
    { num: "S8", name: "The Dashboard", status: "pending", desc: "Full recruiter workflow" },
    { num: "S9", name: "The Hardening", status: "pending", desc: "Auth, security, monitoring" },
  ]

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    complete: { bg: "#E0F7EF", text: "#0D5C3A", dot: "#27B97C" },
    next: { bg: "#FEF0E6", text: "#7A3800", dot: "#F07020" },
    pending: { bg: "#E0EAF4", text: "#001F4D", dot: "#003366" },
  }

  return (
    <main>
      {/* Navigation */}
      <nav style={navStyle}>
        <span>
          <span
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 20,
              fontWeight: 300,
              color: "#ffffff",
            }}
          >
            O
          </span>
          <em
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 20,
              fontWeight: 300,
              fontStyle: "italic",
              color: "var(--gold-light)",
            }}
          >
            PB
          </em>
        </span>
        <span
          style={{
            fontFamily: "var(--fb)",
            fontSize: 9,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,.4)",
          }}
        >
          Socio-Technical Alignment Simulator
        </span>
        <div style={{ width: 40 }} />
      </nav>

      {/* Hero */}
      <section style={heroStyle}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 48,
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.2,
              marginBottom: 20,
              maxWidth: 700,
            }}
          >
            Graph physics for{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold-light)" }}>hiring.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--fb)",
              fontSize: 15,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.75,
              maxWidth: 580,
            }}
          >
            Predict how a candidate reshapes a team&apos;s knowledge flow — before the hire.
            Replace subjective culture fit with closeness centrality simulation.
          </p>

          {/* Stat row */}
          <div style={statRowStyle}>
            {[
              { value: "10×", label: "Sprints to production" },
              { value: "C_C(v)", label: "Core metric: closeness centrality" },
              { value: "1,000", label: "Monte Carlo iterations (default)" },
              { value: "95% CI", label: "Every output includes confidence interval" },
            ].map((s) => (
              <div key={s.label} style={statStyle}>
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 34,
                    fontWeight: 300,
                    color: "#E8C46A",
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontFamily: "var(--fb)",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.55,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sprint roadmap */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 48px" }}>
        {/* Eyebrow */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 9,
            fontFamily: "var(--fb)",
            fontWeight: 500,
            letterSpacing: "4px",
            textTransform: "uppercase",
            color: "var(--gold)",
            marginBottom: 16,
          }}
        >
          <div style={{ width: 24, height: 1, backgroundColor: "var(--gold)", flexShrink: 0 }} />
          Sprint Roadmap
        </div>
        <h2
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 22,
            fontWeight: 300,
            color: "#0a1628",
            marginBottom: 4,
          }}
        >
          10 sprints · 20 weeks to production
        </h2>
        <p
          style={{
            fontFamily: "var(--fb)",
            fontSize: 13,
            color: "var(--mid)",
            marginBottom: 32,
          }}
        >
          Shape Up methodology. Two-week cadence. No sprint closes without tests, lint, and docs passing.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {sprints.map((sprint) => {
            const colors = statusColors[sprint.status]
            return (
              <div
                key={sprint.num}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: "20px 24px",
                  boxShadow: "0 1px 4px rgba(0,51,102,0.08)",
                  borderTop: sprint.status === "complete" ? "3px solid #C8982A" : "3px solid transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "'Fraunces', Georgia, serif",
                      fontSize: 36,
                      fontWeight: 300,
                      color: "#f1f5f9",
                      lineHeight: 1,
                    }}
                  >
                    {sprint.num}
                  </span>
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
                    {sprint.status}
                  </span>
                </div>
                <div style={{ width: 28, height: 3, backgroundColor: "#C8982A", borderRadius: 2, margin: "6px 0 10px" }} />
                <p
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 15,
                    fontWeight: 400,
                    color: "#0a1628",
                    marginBottom: 6,
                  }}
                >
                  {sprint.name}
                </p>
                <p style={{ fontFamily: "var(--fb)", fontSize: 12, color: "#475569", lineHeight: 1.65 }}>
                  {sprint.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <footer style={footerStyle}>
        <span>OPB · Octavio Pérez Bravo · STAS</span>
        <span>
          {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" }).toUpperCase()}
        </span>
      </footer>
    </main>
  )
}
