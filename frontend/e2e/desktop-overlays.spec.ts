import { expect, test } from "@playwright/test";
import { keeper } from "./support/bridge";
import { connectWallet, depositViaDrawer, expectDesktopHome, shot } from "./support/journey";

test("desktop overlays: add-funds drawer, move-to-wallet, account dropdown, activity filter, safe-exit approve", async ({ page }) => {
  await connectWallet(page);
  await expectDesktopHome(page);

  // 1. Add funds through the drawer (first deposit surfaces the consent dialog).
  await depositViaDrawer(page, "EURC", "500");
  await expect(page.getByText("Deposited. Agent is allocating.")).toBeVisible();
  // Scoped to the Buckets card: a bare page.getByText("EUR bucket") is a strict-mode violation once
  // the (aria-hidden, but not CSS-hidden) WithdrawDrawer is mounted — its "Choose bucket" button
  // contains the same bucket name text.
  await expect(page.getByLabel("Buckets").getByText("EUR bucket")).toBeVisible();
  await shot(page, "desktop-02-add-funds");

  // 2. Move to wallet through the drawer.
  await page.getByRole("button", { name: "Move to wallet" }).click();
  const wd = page.getByRole("dialog", { name: "Move to wallet" });
  await expect(wd).toBeVisible();
  await wd.getByLabel("Amount").fill("100");
  await wd.getByRole("button", { name: "Move to wallet" }).click();
  // Success closes the drawer (no in-drawer done step) + a global toast confirms.
  await expect(wd).toBeHidden();
  await expect(page.getByText("Withdrawal submitted.")).toBeVisible(); // global toast
  await shot(page, "desktop-03-move-to-wallet");

  // 3. Account dropdown.
  await page.getByRole("button", { name: "Account" }).click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu).toBeVisible();
  // A live control since STE-38: pressable, and ON by default (the seam returns true for an unset
  // preference). It was `aria-disabled` while it was still a read-only consent display.
  const autoCompound = menu.getByRole("switch", { name: "Auto reinvest rewards" });
  await expect(autoCompound).toBeEnabled();
  await expect(autoCompound).toHaveAttribute("aria-checked", "true");
  await shot(page, "desktop-04-account-dropdown");

  // 4. Activity drawer + filter (from the account dropdown's Activity row).
  await menu.getByRole("menuitem", { name: /activity/i }).click();
  const act = page.getByRole("dialog", { name: "Activity" });
  await expect(act).toBeVisible();
  await act.getByRole("button", { name: "Yours" }).click();
  await expect(act.getByText(/Switched to DeFindex/)).toHaveCount(0);
  await act.getByRole("button", { name: "All" }).click();
  await expect(act.getByText(/Switched to DeFindex/)).toBeVisible();
  await page.keyboard.press("Escape"); // Drawer Escape closes
  await expect(act).toBeHidden();
  await shot(page, "desktop-05-activity");

  // 5. Safe-exit: freeze + propose via the keeper, then approve through the centered dialog.
  await keeper(page, "allocate", "EUR", "400");
  await keeper(page, "freeze", "EUR");
  await keeper(page, "proposeExit", "EUR");
  await page.getByRole("button", { name: "Review paused pool" }).click();
  const exit = page.getByRole("dialog", { name: "Approve safe exit" });
  await expect(exit.getByText("DeFindex EURC")).toBeVisible();
  await exit.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Exit approved. Moving your funds now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review paused pool" })).toBeHidden();
  await shot(page, "desktop-06-safe-exit-approved");
});
