/**
 * Mastra workflow wrapper around the allocator tick (KTD5 — driven by an external cron/route, since
 * Mastra has no built-in scheduler). One step per bucket keeps the decision logic in
 * {@link runAllocatorTick}; this file only adapts it to the Mastra workflow API.
 *
 * The default effects are logging no-ops so the workflow runs without a keeper key; the real
 * keeper-signed effects (allocate/deallocate/freeze via @sorosense/vault-client) are wired at U20.
 */

import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import {
  InMemoryBucketStore,
  runAllocatorTick,
  type AllocatorEffects,
  type BucketStore,
  type Candidate,
} from './allocator.js';

const currencyEnum = z.enum(['USD', 'EUR', 'MXN']);

/** Process-wide store for the demo; swap for a durable store at deploy. */
const store: BucketStore = new InMemoryBucketStore();

/** Logging effects — replaced by keeper-signed on-chain effects at U20. */
const loggingEffects: AllocatorEffects = {
  compound: async (currency, pool) => void console.info(`[allocator] compound ${currency} @ ${pool}`),
  rebalance: async (currency, from, to) =>
    void console.info(`[allocator] rebalance ${currency} ${from} -> ${to}`),
  freezeExit: async (currency, pool, toPool) =>
    void console.info(`[allocator] freeze-exit ${currency} ${pool} -> ${toPool ?? '(none)'}`),
};

const tickInputSchema = z.object({
  currency: currencyEnum,
  activeAnomaly: z.boolean().default(false),
  activeRay: z.number().nullable().default(null),
  candidates: z
    .array(z.object({ poolId: z.string(), ray: z.number() }))
    .default([]),
  yieldAccrued: z.boolean().default(false),
  thresholdPct: z.number().default(0.5),
});

const decisionSchema = z.object({
  kind: z.enum(['compound', 'rebalance', 'freeze-exit', 'noop']),
  currency: currencyEnum,
  detail: z.string(),
});

const allocateStep = createStep({
  id: 'allocate-bucket',
  inputSchema: tickInputSchema,
  outputSchema: decisionSchema,
  execute: async ({ inputData }) => {
    const decision = await runAllocatorTick({
      currency: inputData.currency,
      activeAnomaly: inputData.activeAnomaly,
      activeRay: inputData.activeRay,
      candidates: inputData.candidates as Candidate[],
      yieldAccrued: inputData.yieldAccrued,
      thresholdPct: inputData.thresholdPct,
      store,
      effects: loggingEffects,
    });
    const detail =
      decision.kind === 'rebalance'
        ? `${decision.from} -> ${decision.to}`
        : decision.kind === 'freeze-exit'
          ? `${decision.pool} -> ${decision.toPool ?? '(none)'}`
          : decision.kind === 'compound'
            ? decision.pool
            : decision.reason;
    return { kind: decision.kind, currency: decision.currency, detail };
  },
});

export const allocatorWorkflow = createWorkflow({
  id: 'allocator-workflow',
  inputSchema: tickInputSchema,
  outputSchema: decisionSchema,
})
  .then(allocateStep)
  .commit();
