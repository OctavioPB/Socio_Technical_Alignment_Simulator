"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs"

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/teams", label: "Teams" },
  { href: "/simulate", label: "Simulate" },
]

const navLink: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.45)",
  cursor: "pointer",
  fontFamily: "var(--fb)",
  fontSize: 9,
  letterSpacing: "2px",
  textTransform: "uppercase",
  padding: "5px 8px",
  borderRadius: 6,
  transition: "color 0.15s",
  textDecoration: "none",
}

const navLinkActive: React.CSSProperties = {
  color: "var(--gold-light)",
  backgroundColor: "rgba(201,168,76,0.12)",
}

const signInBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 6,
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  fontFamily: "var(--fb)",
  fontSize: 9,
  letterSpacing: "2px",
  textTransform: "uppercase",
  padding: "5px 10px",
}

export function Nav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
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
      }}
    >
      {/* OPB Monogram */}
      <Link href="/" style={{ textDecoration: "none" }}>
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
      </Link>

      {/* App title */}
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

      {/* Right cluster: nav links + auth */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <SignedIn>
          {NAV_LINKS.map((link) => {
            const isActive = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                style={isActive ? { ...navLink, ...navLinkActive } : navLink}
              >
                {link.label}
              </Link>
            )
          })}
          <UserButton
            appearance={{
              elements: {
                avatarBox: { width: 26, height: 26 },
              },
            }}
          />
        </SignedIn>

        <SignedOut>
          <SignInButton mode="modal">
            <button style={signInBtn}>Sign in</button>
          </SignInButton>
        </SignedOut>
      </div>
    </nav>
  )
}
