import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration — runs against localhost:3000 only.
 * Start the dev server manually before running:  npm run dev
 *
 * Safety guarantees:
 *   ✓ baseURL is localhost — no production domain
 *   ✓ No webServer auto-start (avoids production DB connection)
 *   ✓ No real payment flows
 *   ✓ No production credentials in test files
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 1,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // No webServer block — start `npm run dev` manually before running tests.
  // This prevents accidental connection to the production database.
});
