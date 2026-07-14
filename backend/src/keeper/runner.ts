/**
 * Keeper runner (STE-21 Fase D / U2) — the effect layer that lets an operator drive the deterministic
 * allocator against the live testnet contract from a CLI. It is **manually invoked**: no autonomous
 * loop, no faked anomaly signal. This is what "moves the agent" on the demo stage.
 *
 * It wires real {@link AllocatorEffects} whose `compound` / `rebalance` / `freezeExit` call the keeper
 * writes on the shared vault seam ({@link getVaultClient}), each signed by the keeper `Signer` built
 * from `KEEPER_SECRET`. The allocator's pure `classifyBucket` core stays untouched (KTD3) — the runner
 * only supplies live inputs and injected real effects.
 *
 * **Mock-mode guard:** when the integration env is absent the process holds a `MockVaultClient` and
 * there is nothing real to drive. Every real-write action refuses up-front (before touching the
 * client) with a clear message rather than pretend a testnet write happened. `KEEPER_SECRET` is read
 * only to build the signer (via {@link makeKeeperSigner}) and is never logged.
 */

import type {
  Address,
  Amount,
  Currency,
  PoolId,
  PreparedTx,
  Signer,
  TxResult,
  VaultClient,
} from '@sorosense/vault-client';
import {
  InMemoryBucketStore,
  runAllocatorTick,
  type AllocatorEffects,
  type BucketStore,
  type Candidate,
  type Decision,
} from '../mastra/allocator.js';
import { makeKeeperSigner } from '../tools/keeper-signer.js';
import { demoPoolFor, getVaultClient, isIntegrationEnv } from '../tools/vault.js';

/** Message surfaced when a real-write action is attempted without the integration env. */
export const MOCK_MODE_MESSAGE =
  'mock mode — nothing to drive (set the integration env to perform real keeper writes)';

/**
 * Reads the on-chain base-unit amount to move for a `rebalance` or `compound`. The seam exposes no
 * pooled-per-currency amount read, so the operator supplies it (a testnet probe, or a fixed demo
 * amount from the CLI). Without it, the real `rebalance`/`compound` effects refuse rather than guess
 * an amount to move on-chain. `freezeExit` never needs it (freeze moves no funds).
 */
export type MoveAmount = (currency: Currency, pool: PoolId) => Promise<Amount>;

export interface KeeperRunnerOptions {
  /** Environment used for the mock-mode guard and signer/passphrase. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Vault seam. Defaults to the process-wide {@link getVaultClient}. Injectable for tests. */
  client?: VaultClient;
  /** Keeper signer. Defaults to one built from `KEEPER_SECRET` when live. Injectable for tests. */
  signer?: Signer;
  /** Override the live/mock decision. Defaults to {@link isIntegrationEnv} over `env`. */
  integration?: boolean;
  /** Map a currency to the pool slug the keeper drives. Defaults to {@link demoPoolFor}. */
  poolFor?: (currency: Currency) => PoolId;
  /** Amount source for rebalance/compound. Omit → those effects refuse with a clear message. */
  moveAmount?: MoveAmount;
  /** Wall-clock (ms) for the anti-churn dwell guard. Defaults to `Date.now`; injectable in tests. */
  clock?: () => number;
}

/** Inputs for a single operator-driven tick — the live/operator side of the pure classify. */
export interface RunTickInput {
  candidates: Candidate[];
  /** True when Sentinel flagged the active pool this tick (operator flag). Default false. */
  activeAnomaly?: boolean;
  /** Risk-adjusted yield of the active pool, or null if unallocated. Default null. */
  activeRay?: number | null;
  /** True when yield accrued on the active pool since last tick. Default false. */
  yieldAccrued?: boolean;
  /** Risk-adjusted APY edge (pp) a rival must clear to switch (R6). Default {@link DEFAULT_THRESHOLD_PCT}. */
  thresholdPct?: number;
  /** Minimum time to hold a pool before switching again (ms). Omit → {@link DEFAULT_MIN_DWELL_MS}. */
  minDwellMs?: number;
  /** Bucket value (USD) for the switching-cost gate — omit to leave the cost gate off. */
  positionValueUsd?: number;
  /** Estimated switch cost (USD): gas + any reward forfeited by leaving early. Omit → cost gate off. */
  switchCostUsd?: number;
  /** Horizon (days) the cost gate amortizes the extra yield over. Omit → {@link DEFAULT_DWELL_HORIZON_DAYS}. */
  dwellHorizonDays?: number;
  /**
   * Durable store. Omit → a fresh {@link InMemoryBucketStore} seeded from the client's live
   * `activePool` / `pendingExit` reads (so a real tick decides against on-chain state). Supply one
   * (tests) to skip those reads.
   */
  store?: BucketStore;
  /** Effects override. Omit → the runner's real, keeper-signing effects. Tests inject spies. */
  effects?: AllocatorEffects;
}

/**
 * Default risk-adjusted APY edge (pp) a rival pool must clear to justify a switch. Set to 1.5 — high
 * enough that the agent holds a pool through normal rate wiggle and only moves for a materially better
 * venue (anti-churn, so daily rewards aren't lost to gas on a marginal chase).
 */
export const DEFAULT_THRESHOLD_PCT = 1.5;

export interface KeeperRunner {
  /** The real, keeper-signing effects — exposed for a `tick` and for inspection/tests. */
  readonly effects: AllocatorEffects;
  /**
   * Move `amount` (base units) of a bucket's **idle** funds into its demo pool — the first-time
   * allocation that makes `active_pool(ccy)` stop reading `null` and starts the yield accruing. The
   * `compound` effect re-allocates *accrued* rewards; this is the operator entrypoint that seeds the
   * position. Refuses in mock mode (never fakes a testnet write).
   */
  allocate(currency: Currency, amount: Amount): Promise<TxResult>;
  /** Keeper-freeze the currency's demo pool (protective; moves no funds). Refuses in mock mode. */
  freezePool(currency: Currency): Promise<TxResult>;
  /** Lift a keeper freeze on the currency's demo pool. Refuses in mock mode. */
  unfreezePool(currency: Currency): Promise<TxResult>;
  /** Run one allocator tick for a bucket, driving the matching effect. Returns the decision. */
  runTick(currency: Currency, input: RunTickInput): Promise<Decision>;
}

/**
 * Build the keeper runner. Defaults resolve against the live process (real vault client + a keeper
 * signer from `KEEPER_SECRET`); every dependency is injectable so the integration test drives a spy
 * vault + mock effects with no network.
 */
export function makeKeeperRunner(options: KeeperRunnerOptions = {}): KeeperRunner {
  const env = options.env ?? process.env;
  const integration = options.integration ?? isIntegrationEnv(env);
  const client = options.client ?? getVaultClient();
  const poolFor = options.poolFor ?? demoPoolFor;
  const moveAmount = options.moveAmount;
  // The effect layer may read wall-clock time (the dwell guard); injectable so tests stay deterministic.
  const clock = options.clock ?? (() => Date.now());

  let keeperSigner: Signer | undefined = options.signer;
  /**
   * The keeper signer, built lazily on the first real write — reading `KEEPER_SECRET` only when a
   * write is actually about to be signed (never at construction, never logged). Callers that inject a
   * signer or only run mocked ticks never touch the secret.
   */
  function getSigner(): Signer {
    keeperSigner ??= makeKeeperSigner(env.KEEPER_SECRET ?? '', env.STELLAR_NETWORK_PASSPHRASE ?? '');
    return keeperSigner;
  }

  /** Refuse a real write up-front (before touching the client) when not live. */
  function requireLive(): void {
    if (!integration) throw new Error(MOCK_MODE_MESSAGE);
  }

  /** Guard, build the prepared write, then sign+submit with the keeper signer. */
  async function submit(build: () => PreparedTx): Promise<TxResult> {
    requireLive();
    return build().signAndSubmit(getSigner());
  }

  async function amountToMove(currency: Currency, pool: PoolId): Promise<Amount> {
    if (!moveAmount) {
      throw new Error(
        `no move-amount source configured — cannot compute the ${currency} amount to move ` +
          `for pool ${pool} (wire KeeperRunnerOptions.moveAmount)`,
      );
    }
    return moveAmount(currency, pool);
  }

  const effects: AllocatorEffects = {
    // Reinvest accrued rewards into the same pool (allocate the accrued amount).
    async compound(currency: Currency, pool: PoolId, _depositor?: Address): Promise<void> {
      const amount = await amountToMove(currency, pool);
      await submit(() => client.allocate(pool, currency, amount));
    },
    // Silent auto-rebalance (R7): pull from the old pool and place in the new — no proposal/approval.
    async rebalance(currency: Currency, from: PoolId, to: PoolId): Promise<void> {
      const amount = await amountToMove(currency, from);
      await submit(() => client.deallocate(from, currency, amount));
      await submit(() => client.allocate(to, currency, amount));
    },
    // Protective freeze + (if a safe target exists) a proposed exit the depositor later approves.
    async freezeExit(currency: Currency, pool: PoolId, toPool: PoolId | null): Promise<void> {
      await submit(() => client.freeze(pool));
      if (toPool) await submit(() => client.proposeExit(currency, pool, toPool));
    },
  };

  async function allocate(currency: Currency, amount: Amount): Promise<TxResult> {
    return submit(() => client.allocate(poolFor(currency), currency, amount));
  }

  async function freezePool(currency: Currency): Promise<TxResult> {
    return submit(() => client.freeze(poolFor(currency)));
  }

  async function unfreezePool(currency: Currency): Promise<TxResult> {
    return submit(() => client.unfreeze(poolFor(currency)));
  }

  async function runTick(currency: Currency, input: RunTickInput): Promise<Decision> {
    let store = input.store;
    if (!store) {
      store = new InMemoryBucketStore();
      // Seed the fresh store from live state so the decision reflects on-chain reality.
      const active = await client.activePool(currency);
      if (active) store.setActivePool(currency, active);
      const pending = await client.pendingExit(currency);
      if (pending) store.setPendingExit(currency, true);
    }
    return runAllocatorTick({
      currency,
      activeAnomaly: input.activeAnomaly ?? false,
      activeRay: input.activeRay ?? null,
      candidates: input.candidates,
      yieldAccrued: input.yieldAccrued ?? false,
      thresholdPct: input.thresholdPct ?? DEFAULT_THRESHOLD_PCT,
      store,
      effects: input.effects ?? effects,
      // Anti-churn: a real clock enables the minimum-dwell guard; the cost gate engages when the caller
      // supplies the bucket's value + a switch-cost estimate. All deterministic — no LLM, no AI cost.
      clock,
      minDwellMs: input.minDwellMs,
      positionValueUsd: input.positionValueUsd,
      switchCostUsd: input.switchCostUsd,
      dwellHorizonDays: input.dwellHorizonDays,
    });
  }

  return { effects, allocate, freezePool, unfreezePool, runTick };
}
