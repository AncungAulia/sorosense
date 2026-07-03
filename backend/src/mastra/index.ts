/**
 * Mastra allocator agent + the tools it may call. This is the single wiring point; Sentinel (U8),
 * the allocator workflow (U9), and the APIs (U11) reuse the same data functions under `../tools`
 * rather than re-fetching (DRY).
 *
 * The LLM only narrates activity — it never decides a freeze or a rebalance (KTD6). The model is an
 * OpenRouter route resolved from env; the agent constructs without a key (the key is read at run
 * time), so importing this module is side-effect free and safe in tests.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getCatalog, getDefindexVaults } from '../tools/catalog.js';
import { getPoolData } from '../tools/pool-data.js';
import { getReflectorPrice } from '../tools/price.js';

/** OpenRouter model route. Confirmed live at U20 boot; a string is enough to typecheck/build. */
export const MODEL = process.env.SOROSENSE_MODEL ?? 'openrouter/anthropic/claude-sonnet-4.5';

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
  model: MODEL,
  tools: allocatorTools,
});
