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
