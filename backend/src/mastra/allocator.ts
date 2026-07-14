/**
 * The allocator decision core (U9). Runs independently per currency bucket and classifies each tick
 * into compound / auto-rebalance / freeze-exit / no-op — with NO risk-tier branch (KTD3). The agent
 * always seeks the safest-highest risk-adjusted yield within the Sentinel-vetted Safe set, same
 * currency (R21), supply/vault/hold-to-earn only (R22).
 *
 * Split in two layers so the logic is testable without a chain:
 *  - `classifyBucket` — a pure decision function (no I/O).
 *  - `runAllocatorTick` — reads the classification and drives injected effects, updating a durable
 *    store so two ticks never double-act (idempotency; a pending freeze-exit blocks re-action).
 */

import type { Address, Currency, PoolId } from '@sorosense/vault-client';
import { exceedsRebalanceThreshold, riskAdjustedYield } from '../sentinel/score.js';

export type Decision =
  | { kind: 'compound'; currency: Currency; pool: PoolId }
  | { kind: 'rebalance'; currency: Currency; from: PoolId; to: PoolId }
  | { kind: 'freeze-exit'; currency: Currency; pool: PoolId; toPool: PoolId | null }
  | { kind: 'noop'; currency: Currency; reason: string };

/** A Safe-set candidate with its already-computed risk-adjusted yield. */
export interface Candidate {
  poolId: PoolId;
  ray: number;
}

export interface ClassifyInput {
  currency: Currency;
  /** The pool currently holding this bucket, or null if unallocated. */
  activePool: PoolId | null;
  /** True when Sentinel flagged the active pool as anomalous this tick. */
  activeAnomaly: boolean;
  /** Risk-adjusted yield of the active pool, or null if unallocated. */
  activeRay: number | null;
  /** Sentinel-vetted Safe candidates for this currency (risk-adjusted). */
  candidates: Candidate[];
  /** True when yield accrued on the active pool since last tick. */
  yieldAccrued: boolean;
  /** True when a freeze-exit is already awaiting the depositor's approval. */
  hasPendingExit: boolean;
  /** Sustained-delta threshold in APY percentage points (R6). */
  thresholdPct: number;
}

const bestOf = (candidates: Candidate[], exclude?: PoolId | null): Candidate | null =>
  candidates
    .filter((c) => c.poolId !== exclude)
    .reduce<Candidate | null>((best, c) => (best === null || c.ray > best.ray ? c : best), null);

/** Pure decision: no I/O, deterministic. */
export function classifyBucket(input: ClassifyInput): Decision {
  const { currency } = input;

  // Idempotency: never re-act while a freeze-exit awaits depositor approval.
  if (input.hasPendingExit) {
    return { kind: 'noop', currency, reason: 'awaiting exit approval' };
  }

  // Anomaly on the held pool → protective freeze + propose a safe exit (never a silent move).
  if (input.activePool && input.activeAnomaly) {
    const target = bestOf(input.candidates, input.activePool);
    return { kind: 'freeze-exit', currency, pool: input.activePool, toPool: target?.poolId ?? null };
  }

  // A sustained better Safe pool → auto-rebalance, no proposal, no approval (R7).
  const best = bestOf(input.candidates);
  if (
    best &&
    best.poolId !== input.activePool &&
    (input.activeRay === null ||
      exceedsRebalanceThreshold(input.activeRay, best.ray, input.thresholdPct))
  ) {
    return {
      kind: 'rebalance',
      currency,
      from: input.activePool ?? best.poolId,
      to: best.poolId,
    };
  }

  // Yield accrued on the same pool → auto-compound under the one-time consent (R5).
  if (input.activePool && input.yieldAccrued) {
    return { kind: 'compound', currency, pool: input.activePool };
  }

  return { kind: 'noop', currency, reason: 'no better pool, no accrual' };
}

// ── Execution layer ────────────────────────────────────────────────────────

/** Side effects the tick drives. Injected so the decision logic stays testable. */
export interface AllocatorEffects {
  /** Reinvest accrued rewards. `depositor` is the auto-compound-ON depositor when gating is wired. */
  compound(currency: Currency, pool: PoolId, depositor?: Address): Promise<void>;
  rebalance(currency: Currency, from: PoolId, to: PoolId): Promise<void>;
  freezeExit(currency: Currency, pool: PoolId, toPool: PoolId | null): Promise<void>;
}

/** Durable-store abstraction (in-memory now; swap for Postgres/LibSQL at deploy). */
export interface BucketStore {
  getActivePool(currency: Currency): PoolId | null;
  setActivePool(currency: Currency, pool: PoolId): void;
  hasPendingExit(currency: Currency): boolean;
  setPendingExit(currency: Currency, pending: boolean): void;
}

export class InMemoryBucketStore implements BucketStore {
  private active = new Map<Currency, PoolId>();
  private pending = new Set<Currency>();
  getActivePool(currency: Currency): PoolId | null {
    return this.active.get(currency) ?? null;
  }
  setActivePool(currency: Currency, pool: PoolId): void {
    this.active.set(currency, pool);
  }
  hasPendingExit(currency: Currency): boolean {
    return this.pending.has(currency);
  }
  setPendingExit(currency: Currency, pending: boolean): void {
    if (pending) this.pending.add(currency);
    else this.pending.delete(currency);
  }
}

export interface TickContext {
  currency: Currency;
  activeAnomaly: boolean;
  activeRay: number | null;
  candidates: Candidate[];
  yieldAccrued: boolean;
  thresholdPct: number;
  store: BucketStore;
  effects: AllocatorEffects;
  /** Bucket depositors to gate compound against (STE-40). Omit → compound runs ungated (legacy). */
  depositors?: Address[];
  /** Auto-compound preference reader (seam `autoCompoundEnabled`). Omit → ungated. */
  autoCompoundEnabled?: (depositor: Address) => Promise<boolean>;
}

/**
 * Drive the compound effect, honoring each depositor's auto-compound preference (STE-40). When
 * `depositors` + `autoCompoundEnabled` are wired, compound fires only for depositors who are ON;
 * a preference that cannot be read is treated as OFF — **fail-closed**, never compound an
 * unverifiable preference. Without them, compound runs ungated (legacy pool-level behavior).
 * Allocate / rebalance / freeze-exit never pass through here — they are unaffected by the preference.
 */
async function gateCompound(ctx: TickContext, currency: Currency, pool: PoolId): Promise<void> {
  if (!ctx.depositors || !ctx.autoCompoundEnabled) {
    await ctx.effects.compound(currency, pool);
    return;
  }
  for (const depositor of ctx.depositors) {
    let enabled = false;
    try {
      enabled = await ctx.autoCompoundEnabled(depositor);
    } catch {
      enabled = false; // fail-closed: unreadable preference → skip, never reinvest
    }
    if (enabled) await ctx.effects.compound(currency, pool, depositor);
  }
}

/**
 * Run one allocator tick for a bucket: classify, drive the matching effect, and update the store so
 * subsequent ticks are idempotent. Returns the decision (for logging/activity/tests).
 */
export async function runAllocatorTick(ctx: TickContext): Promise<Decision> {
  const decision = classifyBucket({
    currency: ctx.currency,
    activePool: ctx.store.getActivePool(ctx.currency),
    activeAnomaly: ctx.activeAnomaly,
    activeRay: ctx.activeRay,
    candidates: ctx.candidates,
    yieldAccrued: ctx.yieldAccrued,
    hasPendingExit: ctx.store.hasPendingExit(ctx.currency),
    thresholdPct: ctx.thresholdPct,
  });

  switch (decision.kind) {
    case 'compound':
      await gateCompound(ctx, decision.currency, decision.pool);
      break;
    case 'rebalance':
      await ctx.effects.rebalance(decision.currency, decision.from, decision.to);
      ctx.store.setActivePool(decision.currency, decision.to);
      break;
    case 'freeze-exit':
      await ctx.effects.freezeExit(decision.currency, decision.pool, decision.toPool);
      ctx.store.setPendingExit(decision.currency, true);
      break;
    case 'noop':
      break;
  }
  return decision;
}

export { riskAdjustedYield };
