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
  /** Minimum risk-adjusted APY edge (percentage points) a rival must clear to justify a switch (R6). */
  thresholdPct: number;
  // ── Anti-churn guards (optional — when omitted, only the threshold applies) ──
  /** Current time (ms). Paired with {@link lastRebalanceAtMs} for the minimum-dwell guard. */
  nowMs?: number;
  /** When the active pool was entered (ms), or null if never rebalanced/unallocated. */
  lastRebalanceAtMs?: number | null;
  /** Minimum time to hold a pool before switching again (ms). 0/undefined disables the dwell guard. */
  minDwellMs?: number;
  /** The bucket's value (USD) — the base the switching-cost gate amortizes the extra yield over. */
  positionValueUsd?: number;
  /** Estimated cost of switching (USD): the rebalance's gas plus any reward forfeited by leaving early. */
  switchCostUsd?: number;
  /** Horizon (days) to amortize the extra yield over when weighing it against the switch cost. */
  dwellHorizonDays?: number;
}

const bestOf = (candidates: Candidate[], exclude?: PoolId | null): Candidate | null =>
  candidates
    .filter((c) => c.poolId !== exclude)
    .reduce<Candidate | null>((best, c) => (best === null || c.ray > best.ray ? c : best), null);

/**
 * Whether to actually move the bucket from its active pool into `best` — the anti-churn gate (R6/R7).
 * Moving costs gas and, on an epoch-rewarding venue, can forfeit rewards earned since the last
 * distribution; a keeper that chases every basis point ends up worse off than one that sits still. So a
 * switch must clear THREE bars, in order:
 *  1. **Edge** — `best` beats the active pool by more than `thresholdPct` on a risk-adjusted basis.
 *  2. **Dwell** — the bucket has been in its current pool for at least `minDwellMs` (skip a whipsaw).
 *  3. **Cost** — the extra yield expected over `dwellHorizonDays` on the bucket's value exceeds the
 *     switch cost: `(Δapy) · value · (horizon/365) > switchCost`.
 * Seeding an *unallocated* bucket is not a switch — it always proceeds (no dwell, no cost). Guards whose
 * inputs are absent are simply not applied, so a caller can opt into as much discipline as it has data
 * for. This is pure arithmetic — no LLM, no per-tick model call (KTD6); evaluate as often as you like at
 * zero AI cost.
 */
export function shouldRebalance(input: ClassifyInput, best: Candidate): boolean {
  // Seeding an unallocated bucket is an initial allocation, not a churn-prone switch.
  if (input.activePool === null || input.activeRay === null) return true;

  // 1. Edge: a rival must clear the risk-adjusted threshold.
  if (!exceedsRebalanceThreshold(input.activeRay, best.ray, input.thresholdPct)) return false;

  // 2. Dwell: don't switch again until the minimum holding period has elapsed.
  if (
    input.minDwellMs &&
    input.minDwellMs > 0 &&
    input.nowMs != null &&
    input.lastRebalanceAtMs != null &&
    input.nowMs - input.lastRebalanceAtMs < input.minDwellMs
  ) {
    return false;
  }

  // 3. Cost: the extra yield over the horizon must beat the switch cost.
  if (input.positionValueUsd != null && input.switchCostUsd != null && input.dwellHorizonDays != null) {
    const extraApyFraction = (best.ray - input.activeRay) / 100; // percentage points → fraction
    const expectedGainUsd = extraApyFraction * input.positionValueUsd * (input.dwellHorizonDays / 365);
    if (expectedGainUsd <= input.switchCostUsd) return false;
  }

  return true;
}

/** Pure decision: no I/O, deterministic (no LLM — the model only narrates, KTD6). */
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

  // A materially better Safe pool that clears the anti-churn gate → auto-rebalance (R7).
  const best = bestOf(input.candidates);
  if (best && best.poolId !== input.activePool && shouldRebalance(input, best)) {
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

  return { kind: 'noop', currency, reason: 'no better pool clears the switch gate, no accrual' };
}

// ── Execution layer ────────────────────────────────────────────────────────

/** Side effects the tick drives. Injected so the decision logic stays testable. */
export interface AllocatorEffects {
  /** Reinvest accrued rewards. `depositor` is the auto-compound-ON depositor when gating is wired. */
  compound(currency: Currency, pool: PoolId, depositor?: Address): Promise<void>;
  rebalance(currency: Currency, from: PoolId, to: PoolId): Promise<void>;
  freezeExit(currency: Currency, pool: PoolId, toPool: PoolId | null): Promise<void>;
}

/** Seven days in ms — the default minimum a bucket dwells in a pool before another switch (anti-churn). */
export const DEFAULT_MIN_DWELL_MS = 7 * 24 * 60 * 60 * 1000;
/** Default horizon (days) the switching-cost gate amortizes the extra yield over. */
export const DEFAULT_DWELL_HORIZON_DAYS = 30;

/** Durable-store abstraction (in-memory now; swap for Postgres/LibSQL at deploy). */
export interface BucketStore {
  getActivePool(currency: Currency): PoolId | null;
  setActivePool(currency: Currency, pool: PoolId): void;
  hasPendingExit(currency: Currency): boolean;
  setPendingExit(currency: Currency, pending: boolean): void;
  /** When the bucket last entered its active pool (ms), or null — the minimum-dwell clock's start. */
  getLastRebalanceAt(currency: Currency): number | null;
  setLastRebalanceAt(currency: Currency, atMs: number): void;
}

export class InMemoryBucketStore implements BucketStore {
  private active = new Map<Currency, PoolId>();
  private pending = new Set<Currency>();
  private lastMove = new Map<Currency, number>();
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
  getLastRebalanceAt(currency: Currency): number | null {
    return this.lastMove.get(currency) ?? null;
  }
  setLastRebalanceAt(currency: Currency, atMs: number): void {
    this.lastMove.set(currency, atMs);
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
  // ── Anti-churn (optional; omit any to disable that guard) ──
  /** Injectable clock (ms). Omit → the dwell guard is off. Deterministic in tests. */
  clock?: () => number;
  /** Minimum hold before another switch (ms). Default {@link DEFAULT_MIN_DWELL_MS} when `clock` is set. */
  minDwellMs?: number;
  /** The bucket's value (USD) for the switching-cost gate. Omit → cost gate off. */
  positionValueUsd?: number;
  /** Estimated switch cost (USD): gas + any reward forfeited by leaving early. Omit → cost gate off. */
  switchCostUsd?: number;
  /** Horizon (days) the cost gate amortizes the extra yield over. Default {@link DEFAULT_DWELL_HORIZON_DAYS}. */
  dwellHorizonDays?: number;
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
  const nowMs = ctx.clock ? ctx.clock() : undefined;
  const decision = classifyBucket({
    currency: ctx.currency,
    activePool: ctx.store.getActivePool(ctx.currency),
    activeAnomaly: ctx.activeAnomaly,
    activeRay: ctx.activeRay,
    candidates: ctx.candidates,
    yieldAccrued: ctx.yieldAccrued,
    hasPendingExit: ctx.store.hasPendingExit(ctx.currency),
    thresholdPct: ctx.thresholdPct,
    nowMs,
    lastRebalanceAtMs: ctx.store.getLastRebalanceAt(ctx.currency),
    // Default the dwell window only when a clock is supplied (so legacy ticks stay unguarded).
    minDwellMs: ctx.clock ? (ctx.minDwellMs ?? DEFAULT_MIN_DWELL_MS) : ctx.minDwellMs,
    positionValueUsd: ctx.positionValueUsd,
    switchCostUsd: ctx.switchCostUsd,
    dwellHorizonDays: ctx.dwellHorizonDays ?? DEFAULT_DWELL_HORIZON_DAYS,
  });

  switch (decision.kind) {
    case 'compound':
      await gateCompound(ctx, decision.currency, decision.pool);
      break;
    case 'rebalance':
      await ctx.effects.rebalance(decision.currency, decision.from, decision.to);
      ctx.store.setActivePool(decision.currency, decision.to);
      // Start the dwell clock so the next switch waits out the minimum holding period.
      if (nowMs != null) ctx.store.setLastRebalanceAt(decision.currency, nowMs);
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
