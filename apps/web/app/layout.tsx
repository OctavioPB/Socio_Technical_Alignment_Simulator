import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"

export const metadata: Metadata = {
  title: "STAS — Socio-Technical Alignment Simulator",
  description:
    "Replace subjective culture fit with graph-topology simulation. Predict how a candidate reshapes a team's knowledge flow before the hire.",
}

const hasValidClerkKey = /^pk_(test|live)_[A-Za-z0-9+/]{30,}/.test(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const content = (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;1,9..144,300;1,9..144,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )

  return hasValidClerkKey ? <ClerkProvider>{content}</ClerkProvider> : content
}
