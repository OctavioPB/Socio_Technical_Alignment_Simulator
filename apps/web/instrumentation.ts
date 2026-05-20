/**
 * Next.js 14 instrumentation hook — initialises Sentry on server and edge runtimes.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * This file runs once at server startup. Client-side Sentry is initialised by
 * sentry.client.config.ts, which is imported via next.config.ts.
 */

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@sentry/nextjs")
    const { nodeProfilingIntegration } = await import("@sentry/profiling-node")
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      integrations: [nodeProfilingIntegration()],
      sendDefaultPii: false,
    })
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { init } = await import("@sentry/nextjs")
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    })
  }
}
