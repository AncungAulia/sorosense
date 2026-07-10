import { expect, test, type Page } from "@playwright/test";
import { keeper } from "./support/bridge";
import { connectWallet, depositEurc, goBackTo, shot } from "./support/journey";

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
  await shot(page, "01-earn-empty-simulator");

  // 4. Deposit EURC through the consent sheet — the one-time auto-optimize mandate.
  await page.getByRole("button", { name: "Start earning" }).click();
  await expect(page).toHaveURL(/\/add-funds$/);
  await depositEurc(page, "500");
  // The bucket row is the deposit's only visible confirmation: DepositKeypad's "Deposited. Agent is
  // allocating." toast unmounts with the screen that pushes to /home, so the user never sees it
  // (STE-44). Asserting the row instead tests what actually reaches them.
  await expect(page.getByText("EUR bucket")).toBeVisible();
  await expect(page.getByText("€500.00")).toBeVisible();
  await shot(page, "03-home-funded");

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
  await shot(page, "04-activity-rows");
  await goBackTo(page, /\/home$/);

  // 6. The Sentinel pauses the pool. A freeze moves nothing — it only protects.
  await keeper(page, "freeze", "EUR");
  const banner = page.getByRole("button", { name: "Review paused pool" });
  await expect(banner).toBeVisible();
  await shot(page, "05-freeze-banner");

  // 7. Before a proposal exists the sheet can only say it is preparing one.
  await banner.click();
  const exit = page.getByRole("dialog", { name: "Approve safe exit" });
  await expect(exit.getByText("Preparing your safe exit.")).toBeVisible();

  // 8. The proposal arrives. Only now is the user asked: funds never move without a signature.
  await keeper(page, "proposeExit", "EUR");
  await expect(exit.getByText("DeFindex EURC")).toBeVisible();
  await shot(page, "06-exit-approval");
  await exit.getByRole("button", { name: "Approve and sign in wallet" }).click();

  // 9. Approved: the banner clears, and the exit's "Review" affordance dies into a "Reviewed" pill.
  //    That pill hangs off the `proposed-exit` row, 4th in the feed — so it is on the Activity
  //    screen, not on Home's three-row preview.
  await expect(page.getByText("Exit approved. Moving your funds now.")).toBeVisible();
  await expect(banner).toBeHidden();

  await page.getByRole("button", { name: "View all activity" }).click();
  await expect(page.getByText("Reviewed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
  await shot(page, "07-exit-approved");
});

/**
 * Safety is invisible (R11). No surface may name a risk, a tier, or a score — not as a label, not in
 * body copy. "safety" is deliberately absent from the pattern: "Paused EURC pool for safety" is the
 * agent explaining what it did, not a rating pinned to the user's money.
 */
const RISK_WORDS = /\b(risk|risks|risky|tier|tiers|score|scores)\b/i;

async function expectNoRiskWording(page: Page, surface: string): Promise<void> {
  const text = await page.locator("body").innerText();
  expect(text, `risk wording on ${surface}`).not.toMatch(RISK_WORDS);
}

test("no user surface exposes a risk label, tier, or score", async ({ page }) => {
  await page.goto("/");
  await expectNoRiskWording(page, "landing");

  await connectWallet(page);
  await page.getByRole("button", { name: "Add funds" }).click();
  await expect(page).toHaveURL(/\/add-funds$/);
  await depositEurc(page, "500");

  // The paused/amber surfaces are the likeliest place for a risk word to slip in, so tour them
  // with a frozen pool and a live exit proposal on the books.
  await keeper(page, "allocate", "EUR", "500");
  await keeper(page, "freeze", "EUR");
  await keeper(page, "proposeExit", "EUR");
  await expectNoRiskWording(page, "/home (frozen)");

  await page.getByRole("button", { name: "Review paused pool" }).click();
  await expect(page.getByRole("dialog", { name: "Approve safe exit" })).toBeVisible();
  await expectNoRiskWording(page, "the safe-exit sheet");
  await page.getByRole("button", { name: "Keep it paused" }).click();

  await page.getByRole("button", { name: "View all activity" }).click();
  await expect(page).toHaveURL(/\/account\/activity$/);
  await expectNoRiskWording(page, "/account/activity");
  await goBackTo(page, /\/home$/);

  await page.getByRole("link", { name: "Earn" }).click();
  await expect(page).toHaveURL(/\/earn$/);
  await expectNoRiskWording(page, "/earn (funded)");

  await page.getByRole("button", { name: "Move to wallet" }).click();
  await expect(page).toHaveURL(/\/withdraw$/);
  await expectNoRiskWording(page, "/withdraw");
  await goBackTo(page, /\/earn$/);

  await page.getByRole("button", { name: "Deposit" }).click();
  await expect(page).toHaveURL(/\/add-funds$/);
  await expectNoRiskWording(page, "/add-funds");

  await page.getByRole("button", { name: /^EURC/ }).click();
  await expect(page).toHaveURL(/\/deposit\/eurc$/);
  await expectNoRiskWording(page, "/deposit/eurc (pool paused)");
  await goBackTo(page, /\/add-funds$/);
  await goBackTo(page, /\/earn$/);

  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expectNoRiskWording(page, "/account");
});

/**
 * A rebalance moves funds between healthy pools under the standing mandate; a safe exit moves them
 * out of a paused one. Only the second may ask. This pins down that the first never does.
 *
 * `BottomSheet` renders `role="dialog"` even while closed (`aria-hidden={!open}`), so a raw
 * `[role=dialog]` locator would always match. `getByRole` skips aria-hidden subtrees — which is
 * precisely the distinction under test.
 */
test("a rebalance never asks the user to approve anything", async ({ page }) => {
  await connectWallet(page);
  await page.getByRole("button", { name: "Add funds" }).click();
  await expect(page).toHaveURL(/\/add-funds$/);
  await depositEurc(page, "500");
  await keeper(page, "allocate", "USD", "1000");

  await keeper(page, "rebalance", "USD", "1000");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /approve/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review paused pool" })).toHaveCount(0);

  // The rebalance still surfaces as agent activity — visible, just never blocking. The row carries
  // no "Review" affordance; only `proposed-exit` ever does (components/activity/ActivityRow.tsx:12).
  await expect(page.getByText(/^Switched to DeFindex/)).toBeVisible();
  await page.getByRole("button", { name: "View all activity" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
});
