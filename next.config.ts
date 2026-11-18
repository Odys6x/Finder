import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM Postgres build; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Migrations and the first-run data snapshot are read from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./drizzle/**", "./data/snapshot/**"] },
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
