import { expect, test } from "@playwright/test";
import { keeper } from "./support/bridge";
import { connectWallet, depositEurc } from "./support/journey";

test("the demo journey: connect → simulate → deposit → agent works → approve a safe exit", async ({ page }) => {
  // 1. Connect. Freighter is stubbed at the lib/wallet.ts seam (NEXT_PUBLIC_E2E).
  await connectWallet(page);

  // 2. Earn is empty, so the deterministic simulator is on screen (R15). It is the only AI-adjacent
  //    surface in the app: math, not a chatbot.
  await page.getByRole("link", { name: "Earn" }).click();
  await expect(page.getByTestId("earn-balance")).toHaveText("$0.00");

  // 3. The projection answers to the amount and to the horizon.
  await expect(page.getByTestId("amount")).toHaveText("$1,000");
  const yearly = await page.getByTestId("projection").textContent();
  await page.getByRole("button", { name: "Increase" }).click();
  await expect(page.getByTestId("amount")).toHaveText("$1,500");
  await expect(page.getByTestId("projection")).not.toHaveText(yearly ?? "");

  await page.getByRole("button", { name: "Month" }).click();
  await expect(page.getByTestId("projection")).not.toHaveText(yearly ?? "");

  // 4. Deposit EURC through the consent sheet — the one-time auto-optimize mandate.
  await page.getByRole("button", { name: "Start earning" }).click();
  await expect(page).toHaveURL(/\/add-funds$/);
  await depositEurc(page, "500");
  // The bucket row is the deposit's only visible confirmation: DepositKeypad's "Deposited. Agent is
  // allocating." toast unmounts with the screen that pushes to /home, so the user never sees it
  // (STE-44). Asserting the row instead tests what actually reaches them.
  await expect(page.getByText("EUR bucket")).toBeVisible();
  await expect(page.getByText("€500.00")).toBeVisible();

  // 5. The agent allocates and compounds. Neither asks the user for anything.
  //    Home renders only `activity.slice(0, 3)`, so the auto-allocate row lives one screen deeper.
  //    The rows come from a fixture (hooks/useActivity.ts, see STE-42): what is under test here is
  //    that the agent's work is *shown*, never that a deposit manufactured the row.
  await keeper(page, "allocate", "EUR", "500");
  await keeper(page, "compound", "EUR", "12");
  await expect(page.getByText(/^Reinvested rewards/)).toBeVisible();

  await page.getByRole("button", { name: "View all activity" }).click();
  await expect(page).toHaveURL(/\/account\/activity$/);
  await expect(page.getByText("Allocated to Blend USDC")).toBeVisible();
  await expect(page.getByText(/^Reinvested rewards/)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);

  // 6. The Sentinel pauses the pool. A freeze moves nothing — it only protects.
  await keeper(page, "freeze", "EUR");
  const banner = page.getByRole("button", { name: "Review paused pool" });
  await expect(banner).toBeVisible();

  // 7. Before a proposal exists the sheet can only say it is preparing one.
  await banner.click();
  const exit = page.getByRole("dialog", { name: "Approve safe exit" });
  await expect(exit.getByText("Preparing your safe exit.")).toBeVisible();

  // 8. The proposal arrives. Only now is the user asked: funds never move without a signature.
  await keeper(page, "proposeExit", "EUR");
  await expect(exit.getByText("DeFindex EURC")).toBeVisible();
  await exit.getByRole("button", { name: "Approve and sign in wallet" }).click();

  // 9. Approved: the banner clears, and the exit's "Review" affordance dies into a "Reviewed" pill.
  //    That pill hangs off the `proposed-exit` row, 4th in the feed — so it is on the Activity
  //    screen, not on Home's three-row preview.
  await expect(page.getByText("Exit approved. Moving your funds now.")).toBeVisible();
  await expect(banner).toBeHidden();

  await page.getByRole("button", { name: "View all activity" }).click();
  await expect(page.getByText("Reviewed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
});
