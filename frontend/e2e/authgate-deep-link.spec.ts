import { expect, test } from "@playwright/test";
import { connectWallet } from "./support/journey";

/**
 * STE-43. React runs effects child → parent, so on a hard load AuthGate's effect
 * decided "disconnected" before WalletProvider hydrated `address`. A deep link to a
 * gated route bounced to `/`; a returning user was forced back through onboarding.
 * These two specs pin both symptoms.
 */

/**
 * Wait FOR the STE-43 bounce rather than asserting the URL directly. The redirect is fired from
 * AuthGate's effect a beat after `goto` resolves, so a plain `toHaveURL(/\/home$/)` matches the
 * still-correct URL on its first poll and returns before the redirect ever runs — it would pass
 * even with the bug present. This waits for the URL to reach the landing (`pathname === "/"`); if
 * that happens within the window the deep link bounced, which must not.
 */
async function bouncedToLanding(page: import("@playwright/test").Page): Promise<boolean> {
  return page
    .waitForURL((url) => url.pathname === "/", { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}

test("a hard load of a gated route keeps a stored session on that route", async ({ page }) => {
  await connectWallet(page); // stores soro.wallet in this context

  await page.goto("/home");
  expect(await bouncedToLanding(page), "hard load of /home bounced to landing (STE-43)").toBe(false);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("navigation")).toBeVisible(); // the app shell, not the landing

  // A deeper gated route survives a hard load too.
  await page.goto("/account");
  expect(await bouncedToLanding(page), "hard load of /account bounced to landing (STE-43)").toBe(false);
  await expect(page).toHaveURL(/\/account$/);
});

test("landing forwards a stored session to /home without a second connect", async ({ page }) => {
  await connectWallet(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  // Proof it was the auto-forward, not us clicking through onboarding again.
  await expect(page.getByRole("button", { name: "Connect wallet" })).toHaveCount(0);
});
