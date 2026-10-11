import type { NextConfig } from "next";

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"
const posthogEu = posthogHost.includes("eu.")
const posthogApi = posthogEu ? "https://eu.i.posthog.com" : "https://us.i.posthog.com"
const posthogAssets = posthogEu ? "https://eu-assets.i.posthog.com" : "https://us-assets.i.posthog.com"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogAssets}/static/:path*`,
      },
      {
        source: "/ingest/array/:path*",
        destination: `${posthogAssets}/array/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogApi}/:path*`,
      },
    ]
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.scdn.co" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
