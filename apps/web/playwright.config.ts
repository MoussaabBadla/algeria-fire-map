import { defineConfig, devices } from "@playwright/test";

// E2E / visual config. `npm run e2e` reuses a dev server already running on
// :3000, or starts one, then runs the specs in ./e2e.
// NOTE: after changing .env.local, restart your dev server so the run picks up
// the new values (Next only reads env at boot).
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    // Pixel 5 is a Chromium-based device, so no extra WebKit download is needed.
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
