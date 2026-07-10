import { expect, test } from "@playwright/test";

test("the landing page offers a wallet connection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
});
