/**
 * Sentry Node.js SDK initialisation for Next.js Server Components and API Routes.
 * Only active when NEXT_PUBLIC_SENTRY_DSN is set.
 */

import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
