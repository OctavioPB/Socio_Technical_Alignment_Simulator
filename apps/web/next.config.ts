import type { NextConfig } from "next"

const withBundleAnalyzer =
  process.env.ANALYZE === "true"
    ? require("@next/bundle-analyzer")({ enabled: true })
    : (config: NextConfig) => config

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",

  // Expose Sentry DSN to client bundle (empty string = Sentry disabled)
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
  },

  // Source maps in production for Sentry stack traces
  productionBrowserSourceMaps: process.env.NODE_ENV === "production",
}

export default withBundleAnalyzer(nextConfig)
