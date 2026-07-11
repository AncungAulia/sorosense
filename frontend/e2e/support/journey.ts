import path from "node:path";
import { expect, type Page } from "@playwright/test";

const EVIDENCE_DIR = path.join("..", "docs", "tests", "linear-STE-44", "screenshots");

/** Capture PR evidence. Opt-in via `E2E_EVIDENCE=1`, so an ordinary run leaves the tree clean. */
export async function shot(page: Page, name: string): Promise<void> {
  if (process.env.E2E_EVIDENCE !== "1") return;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`) });
}

/** Land in the app with a stubbed wallet connected. The stub signs without a popup. */
export async function connectWallet(page: Page): Promise<void> {
  await page.goto("/");
  // With a session already stored, the landing auto-forwards to /home (STE-43) before the button
  // ever renders — that path is itself proof the fix works. Only click when onboarding is actually
  // shown. `goto` resolves on HTML load, well before hydration flips the landing past its `null`
  // SSR shell, so a one-shot `isVisible()` right after `goto` reads false even when the button is
  // about to appear (no stored session, the common case) — race whichever settles first instead.
  const connect = page.getByRole("button", { name: "Connect wallet" });
  const showsButton = await Promise.race([
    connect.waitFor({ state: "visible" }).then(() => true),
    page.waitForURL(/\/home$/).then(() => false),
  ]).catch(() => false);
  if (showsButton) {
    await connect.click();
  }
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Deposit `amount` EURC through the real UI: pick the coin → keypad → "Deposit fund" → the one-time
 * consent mandate. The caller must already be on `/add-funds`. The e2e vault starts empty and
 * `seedVault` never granted consent anyway, so the very first deposit is what surfaces the sheet.
 */
export async function depositEurc(page: Page, amount: string): Promise<void> {
  await page.getByRole("button", { name: /^EURC/ }).click();
  await expect(page).toHaveURL(/\/deposit\/eurc$/);

  for (const digit of amount) {
    // `exact` matters: accessible-name matching is substring-based, so a bare "0" would also match
    // the "10%" and "50%" quick-fill buttons sitting above the keypad.
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await expect(page.getByTestId("keypad-value")).toHaveText(amount);
  await page.getByRole("button", { name: "Deposit fund" }).click();

  const consent = page.getByRole("dialog", { name: "Approve automatic earning" });
  await expect(consent).toBeVisible();
  await shot(page, "02-consent-sheet");
  await consent.getByRole("button", { name: "Agree & sign" }).click();

  await expect(page).toHaveURL(/\/home$/);
}
