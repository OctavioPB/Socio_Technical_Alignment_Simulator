import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { type NextRequest, NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/teams(.*)",
  "/candidates(.*)",
  "/simulate(.*)",
])

// Real Clerk keys are pk_test_<base64, 40+ chars> or pk_live_<base64, 40+ chars>
const hasValidClerkKey = /^pk_(test|live)_[A-Za-z0-9+/]{30,}/.test(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
)

// Skip Clerk entirely when no valid key is configured (local dev without Clerk)
const devPassthrough = (_req: NextRequest) => NextResponse.next()

export default hasValidClerkKey
  ? clerkMiddleware((auth, req) => {
      if (isProtectedRoute(req)) {
        auth().protect()
      }
    })
  : devPassthrough

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
