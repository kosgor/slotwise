import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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

// Sentry's build wrapper only for builds, not for `next dev`: in dev its Turbopack loader on
// instrumentation-client.ts makes every HMR connection report the client entry as changed, and the
// page reloads in an endless loop (docs/ai-catches.md, 2026-10-26). Sentry is off in dev anyway
// (no DSN); instrumentation files still load, so nothing else changes.
// Source maps go to Sentry only when SENTRY_AUTH_TOKEN is set (CI/deploy); they are not served to
// browsers.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) return nextConfig;
  return withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  });
}
