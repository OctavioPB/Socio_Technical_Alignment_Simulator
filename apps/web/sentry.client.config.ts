/**
 * Sentry browser SDK initialisation.
 * Imported automatically by Next.js when the file exists at this path.
 * Only active when NEXT_PUBLIC_SENTRY_DSN is set.
 */

import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,

    // Capture 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,

    // Session replay: 1% of normal sessions, 100% of error sessions
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text content to avoid capturing PII
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    sendDefaultPii: false,

    // Ignore noisy errors from browser extensions and network blips
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      /^Network Error$/,
      /^Request aborted$/,
    ],
  })
}
