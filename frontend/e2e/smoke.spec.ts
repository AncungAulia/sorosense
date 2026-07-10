import { expect, test } from "@playwright/test";
import { E2E_ADDRESS } from "../lib/wallet-e2e";

test("connecting a stubbed wallet enters the app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("soro.wallet")))
    .toBe(E2E_ADDRESS);
});

test("a connected wallet still sees the empty Earn state, because e2e does not seed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("link", { name: "Earn" }).click();

  await expect(page.getByTestId("earn-balance")).toHaveText("$0.00");
  await expect(page.getByText("Simulate earnings")).toBeVisible();
});
