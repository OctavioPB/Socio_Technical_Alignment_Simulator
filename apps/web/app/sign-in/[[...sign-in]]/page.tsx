import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--primary)",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        {/* Monogram */}
        <div>
          <span
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 32,
              fontWeight: 300,
              color: "#ffffff",
            }}
          >
            O
          </span>
          <em
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 32,
              fontWeight: 300,
              fontStyle: "italic",
              color: "var(--gold-light)",
            }}
          >
            PB
          </em>
        </div>

        <SignIn
          appearance={{
            elements: {
              card: {
                boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
                borderRadius: 14,
              },
            },
          }}
          redirectUrl="/dashboard"
        />
      </div>
    </main>
  )
}
