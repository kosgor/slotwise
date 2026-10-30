import { defineConfig, devices } from "@playwright/test";

// Tests that need accounts read the Supabase secret key from .env.local (they skip without it).
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides variables directly.
}

// E2E_PORT=3000 runs against an already running dev server (e.g. with stripe:listen forwarding
// to it for the real-Checkout test). Default: a production build on 3100.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Tests run against the production build (`npm run test:e2e` builds first): the same HTML,
  // caching and prerendering users get, not the dev server.
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
