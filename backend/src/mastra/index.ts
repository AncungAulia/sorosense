/**
 * Mastra allocator agent + the tools it may call. This is the single wiring point; Sentinel (U8),
 * the allocator workflow (U9), and the APIs (U11) reuse the same data functions under `../tools`
 * rather than re-fetching (DRY).
 *
 * The LLM only narrates activity — it never decides a freeze or a rebalance (KTD6). The model is
 * resolved from env at construction; no key is read as a module-top-level side effect (it is read
 * inside `resolveModel`), so importing this module is side-effect free and safe in tests.
 *
 * **AI-cost invariant (audited):** this Agent is **not wired into any runtime path** — the HTTP reads,
 * the keeper, and the activity feed never invoke it. The feed (`api/activity.ts` + `api/user-activity.ts`)
 * is deterministic templates, and the allocator decision is pure math (`shouldRebalance`), so the live
 * system spends **zero Jatevo tokens** no matter how often the agent evaluates. If you ever wire the LLM
 * in, call it ONLY on a real state change (a rebalance/freeze that actually happened) — never per tick,
 * never on a noop — so a daily cron does not turn into a per-tick model bill.
 *
 * Model selection (STE-21 Fase A):
 * - `JATEVO_API_KEY` set → an OpenAI-compatible provider pointed at Jatevo (`JATEVO_BASE_URL`,
 *   default `https://2.jatevo.ai/v1`), model `SOROSENSE_MODEL` (default `gpt-5.4-mini`). Mastra
 *   v1.49 resolves this `OpenAICompatibleConfig` with its bundled `createOpenAICompatible` — no
 *   extra dependency needed.
 * - `JATEVO_API_KEY` unset → the legacy string route (`MODEL`), so existing behavior/tests hold.
 * `JATEVO_API_KEY` is backend-only and is never logged.
 */

import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getCatalog, getDefindexVaults } from '../tools/catalog.js';
import { getPoolData } from '../tools/pool-data.js';
import { getReflectorPrice } from '../tools/price.js';

/** Legacy fallback model route (used when no Jatevo key is present). */
export const MODEL = process.env.SOROSENSE_MODEL ?? 'openrouter/anthropic/claude-sonnet-4.5';

/** Jatevo (OpenAI-compatible) endpoint default. */
const JATEVO_DEFAULT_BASE_URL = 'https://2.jatevo.ai/v1';
/** Jatevo default model id when `SOROSENSE_MODEL` is unset. */
const JATEVO_DEFAULT_MODEL = 'gpt-5.4-mini';

/**
 * Resolve the agent's model config from env. Pure over its `env` arg (defaults to `process.env`),
 * so it is unit-testable without touching the network or process globals.
 *
 * With a Jatevo key present, returns a Mastra `OpenAICompatibleConfig`; Mastra builds the provider
 * with its bundled `createOpenAICompatible({ apiKey, baseURL, ... }).chatModel(modelId)`. Without a
 * key, returns the legacy string route so nothing changes for existing callers/tests.
 */
export function resolveModel(env: NodeJS.ProcessEnv = process.env): MastraModelConfig {
  const apiKey = env.JATEVO_API_KEY;
  if (!apiKey) {
    return env.SOROSENSE_MODEL ?? 'openrouter/anthropic/claude-sonnet-4.5';
  }
  return {
    providerId: 'jatevo',
    modelId: env.SOROSENSE_MODEL ?? JATEVO_DEFAULT_MODEL,
    url: env.JATEVO_BASE_URL ?? JATEVO_DEFAULT_BASE_URL,
    apiKey,
  };
}

const currencyEnum = z.enum(['USD', 'EUR', 'MXN']);

export const getCatalogTool = createTool({
  id: 'get-catalog',
  description:
    'Return the internal vetted Safe venue set for allocation (excludes traps). Optionally filter by currency. Not a user-facing feed.',
  inputSchema: z.object({ currency: currencyEnum.optional() }),
  outputSchema: z.object({
    venues: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        venue: z.string(),
        currency: currencyEnum,
        kind: z.enum(['lending', 'vault', 'rwa']),
        apy: z.number(),
        tvlUsd: z.number(),
      }),
    ),
  }),
  execute: async (inputData) => ({ venues: getCatalog(inputData.currency) }),
});

export const getPoolDataTool = createTool({
  id: 'get-pool-data',
  description: 'Return normalized APY and liquidity for a vetted pool. Errors for unknown/trap pools.',
  inputSchema: z.object({ poolId: z.string() }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z
      .object({
        poolId: z.string(),
        currency: currencyEnum,
        apy: z.number(),
        liquidityUsd: z.number(),
      })
      .optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const r = getPoolData(inputData.poolId);
    return r.ok ? { ok: true, data: r.value } : { ok: false, error: r.error };
  },
});

export const getReflectorPriceTool = createTool({
  id: 'get-reflector-price',
  description: 'Return the latest Reflector price for an asset, for the oracle-deviation signal.',
  inputSchema: z.object({ asset: z.string() }),
  outputSchema: z.object({
    ok: z.boolean(),
    price: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const r = await getReflectorPrice(inputData.asset);
    return r.ok ? { ok: true, price: r.value.price } : { ok: false, error: r.error };
  },
});

export const getDefindexVaultsTool = createTool({
  id: 'get-defindex-vaults',
  description: 'Discover live DeFindex vaults (open REST). Returns an error string on network failure.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    count: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async () => {
    const r = await getDefindexVaults();
    return r.ok ? { ok: true, count: r.value.length } : { ok: false, error: r.error };
  },
});

export const allocatorTools = {
  getCatalogTool,
  getPoolDataTool,
  getReflectorPriceTool,
  getDefindexVaultsTool,
};

export const allocatorAgent = new Agent({
  id: 'allocator',
  name: 'SoroSense Allocator',
  instructions: `You narrate what the SoroSense agent does for depositors, in plain language.
Rules:
- You NEVER decide a freeze or a rebalance — those are computed deterministically by Sentinel and the allocator workflow. You only explain them.
- Never surface a numeric risk score or a Safe/Watch/Risky label to the user; risk is internal.
- The agent always seeks the safest-highest yield per currency bucket. There is no user risk tier.
- Use the tools to ground any figure you mention; never invent APY or liquidity.`,
  model: resolveModel(),
  tools: allocatorTools,
});
