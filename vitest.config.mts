import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/rls/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
