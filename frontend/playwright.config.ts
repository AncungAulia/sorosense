import { defineConfig, devices } from "@playwright/test";

/**
 * Port 3100, not 3000: an e2e server is defined by its environment (NEXT_PUBLIC_E2E swaps the wallet
 * for a stub and turns the dev seed off), so adopting whatever happens to be listening would silently
 * test the wrong app — a hand-run `pnpm dev` on 3000 pops the real Stellar Wallets Kit modal. Always
 * start our own; `reuseExistingServer: false` plus a private port keep the two from colliding.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

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
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    env: { NEXT_PUBLIC_E2E: "1" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
