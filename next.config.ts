import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Node-only push library: load it at runtime instead of bundling it.
  serverExternalPackages: ["web-push"],
  // The service worker must never be served stale, or reminder fixes wouldn't reach the phone.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  partialPrefetching: true,
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
