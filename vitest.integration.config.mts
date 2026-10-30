import { defineConfig } from "vitest/config";

// Integration tests run against the real Supabase dev project (network, secret key). They are not
// part of `npm test`: run them with `npm run test:integration`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/env.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
