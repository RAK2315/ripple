import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Client-only app (state in localStorage): no server caching or instant-navigation validation needed.
  cacheComponents: false,
  partialPrefetching: false,
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
