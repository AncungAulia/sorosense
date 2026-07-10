import { mockSigner, type Currency, type MockVaultClient } from "@sorosense/vault-client";
import { SEED_POOLS, SEED_SAFE_EXIT } from "../vault/seed";
import { toAmount } from "../vault/units";

/** Inlined by Next at build time, so every branch guarded by this is dead code in production. */
export const E2E = process.env.NEXT_PUBLIC_E2E === "1";

export type KeeperAction = "allocate" | "compound" | "freeze" | "proposeExit" | "rebalance";

/**
 * The keeper/Sentinel actions a Playwright spec drives — the "backend stub" STE-27 names. Amounts are
 * decimal strings, not `bigint`: `page.evaluate` cannot serialize a bigint across the Node↔browser
 * boundary. Every action calls `bump()` so the React tree re-reads the mock.
 *
 * This exists because the demo journey needs the agent to act *after* the user deposits. The dev seed
 * (`lib/vault/seed.ts`) freezes a pool before the first render, which both hides Earn's empty state
 * (where the simulator lives) and makes the freeze causeless. Under `E2E` the seed steps aside and the
 * test plays the keeper instead.
 *
 * The signatures differ on purpose: a freeze and an exit proposal carry no amount, and typing them as
 * if they did would let a spec pass one and believe it mattered.
 */
export interface KeeperBridge {
  allocate(currency: Currency, amount: string): Promise<void>;
  compound(currency: Currency, amount: string): Promise<void>;
  freeze(currency: Currency): Promise<void>;
  proposeExit(currency: Currency): Promise<void>;
  rebalance(currency: Currency, amount: string): Promise<void>;
}

/** Where a rebalance lands: a healthy pool, never a frozen one, never one carrying a proposal. */
const REBALANCE_TARGET: Record<Currency, string> = {
  USD: "pool-blend-usd",
  EUR: "pool-defindex-eur",
  MXN: "pool-blend-mxn",
};

export function createKeeperBridge(client: MockVaultClient, bump: () => void): KeeperBridge {
  const keeper = mockSigner("keeper");
  // Before the first allocate a bucket has no active pool; the seed's pool id is its natural home.
  const activePool = async (c: Currency): Promise<string> => (await client.activePool(c)) ?? SEED_POOLS[c];

  return {
    async allocate(currency, amount) {
      await client.allocate(SEED_POOLS[currency], currency, toAmount(amount)).signAndSubmit(keeper);
      bump();
    },
    async compound(currency, amount) {
      // Yield, not a vault operation: NAV rises and no shares are minted, mirroring the agent
      // reinvesting rewards. `simulateYield` is the mock's test-only hook for exactly this.
      client.simulateYield(currency, toAmount(amount));
      bump();
    },
    async freeze(currency) {
      // Protective only — a freeze never moves funds (KTD4).
      await client.freeze(await activePool(currency)).signAndSubmit(keeper);
      bump();
    },
    async proposeExit(currency) {
      const from = await activePool(currency);
      await client.proposeExit(currency, from, SEED_SAFE_EXIT[currency]).signAndSubmit(keeper);
      bump();
    },
    async rebalance(currency, amount) {
      // A rebalance moves funds between healthy pools under the standing mandate. It proposes
      // nothing, and it never asks the user — that is the invariant demo-flow.spec.ts pins down.
      const from = await activePool(currency);
      const amt = toAmount(amount);
      await client.deallocate(from, currency, amt).signAndSubmit(keeper);
      await client.allocate(REBALANCE_TARGET[currency], currency, amt).signAndSubmit(keeper);
      bump();
    },
  };
}

declare global {
  interface Window {
    __sorosense__?: { keeper: KeeperBridge };
  }
}

/** A no-op unless the e2e flag is on, so production never grows a `window` handle onto the vault. */
export function installE2EBridge(client: MockVaultClient, bump: () => void): void {
  if (!E2E || typeof window === "undefined") return;
  window.__sorosense__ = { keeper: createKeeperBridge(client, bump) };
}
