/** @type {import('next').NextConfig} */
const withBundleAnalyzer =
  process.env.ANALYZE === "true"
    ? (await import("@next/bundle-analyzer")).default({ enabled: true })
    : (config) => config

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
  },

  productionBrowserSourceMaps: process.env.NODE_ENV === "production",
}

export default withBundleAnalyzer(nextConfig)
