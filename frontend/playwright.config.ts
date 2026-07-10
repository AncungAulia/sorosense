import { defineConfig, devices } from "@playwright/test";

/**
 * The app is mobile-first, so one project at a phone viewport is the honest default. Freighter is
 * stubbed at the `lib/wallet.ts` seam under NEXT_PUBLIC_E2E, which is why device-mode — the trap
 * that forced U13–U16 to capture evidence at a desktop viewport — no longer applies here.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // MockVaultClient is a module singleton; specs share one dev server
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    env: { NEXT_PUBLIC_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
