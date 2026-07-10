import type { Page } from "@playwright/test";
import type { Currency } from "@sorosense/vault-client";
import type { KeeperAction } from "../../lib/e2e/bridge";

/**
 * Drive the keeper (the "backend stub" STE-27 names) from a spec. Waits for VaultProvider's effect to
 * install the bridge first — the handle appears a tick after hydration, not with the first paint.
 */
export async function keeper(
  page: Page,
  action: KeeperAction,
  currency: Currency,
  amount = "0",
): Promise<void> {
  await page.waitForFunction(() => !!window.__sorosense__);
  await page.evaluate(
    async ([a, c, amt]) => {
      const bridge = window.__sorosense__;
      if (!bridge) throw new Error("e2e keeper bridge is not installed");
      const { keeper: k } = bridge;
      // Dispatched, not indexed: `freeze` and `proposeExit` take no amount, and a cast that pretended
      // otherwise would silently accept one.
      switch (a) {
        case "allocate": return k.allocate(c, amt);
        case "compound": return k.compound(c, amt);
        case "freeze": return k.freeze(c);
        case "proposeExit": return k.proposeExit(c);
        case "rebalance": return k.rebalance(c, amt);
      }
    },
    [action, currency, amount] as const,
  );
}
