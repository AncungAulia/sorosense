/**
 * OpenAPI 3.1 document for the Hono read surface + faucet (API QA). Hand-authored beside the routes
 * (KTD1) rather than rewriting them to `@hono/zod-openapi` — the routes work and are tested; a rewrite
 * is invasive risk for no product gain. Kept honest by the conformance test in `openapi.integration.test.ts`
 * (every registered route must be documented). Served via `mountDocs`: `GET /openapi.json` + Swagger UI
 * at `/docs`. Schemathesis fuzzes against this spec; Bruno mirrors it.
 *
 * No secret appears here. `bigint` values are decimal strings on the wire (documented as `type: string`).
 */

import type { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';

const CURRENCIES = ['USD', 'EUR', 'MXN'] as const;

const errorResponse = {
  description: 'Shaped error — never a silent 200.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
    },
  },
} as const;

/** A loose JSON object/array response — status + basic shape, without over-constraining bigint-strings. */
const jsonObject = { type: 'object', additionalProperties: true } as const;
const jsonArray = { type: 'array', items: { type: 'object', additionalProperties: true } } as const;

/**
 * The Earn view (`getEarnings`), documented field-by-field because the frontend charts read it directly.
 * `chart` carries BOTH `valueUsd` (steps on real deposits/withdrawals, curves up with accrual) and
 * `earnedUsd` (cumulative native yield, blended to USD). `earnedUsd` is 0 until the bucket's pool
 * accrues, then rises with `share_price`. No risk/label/score field exists here by design.
 */
const earningsResponse = {
  type: 'object',
  properties: {
    hasDeposit: { type: 'boolean', description: 'Any bucket holds value — drives the 2-state Earn screen.' },
    balanceUsd: { type: 'number', description: 'Blended-USD Earn balance (display-only conversion).' },
    apy: { type: 'number', description: 'Blended APY, value-weighted across buckets.' },
    earnedUsd: { type: 'number', description: "Total earned to date (USD) — the sum of the buckets' earnedUsd." },
    buckets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          currency: { type: 'string', enum: [...CURRENCIES] },
          nativeValue: { type: 'string', description: 'bigint as a decimal string — 7-dp base units, never converted.' },
          usdValue: { type: 'number', description: 'Display-only USD conversion of nativeValue.' },
          earnedUsd: { type: 'number', description: 'Native yield of this bucket blended to USD; FX movement is never earnings.' },
        },
        required: ['currency', 'nativeValue', 'usdValue', 'earnedUsd'],
      },
    },
    chart: {
      type: 'array',
      description: 'Value + cumulative-earned timeline, sampled at the union of snapshot and event timestamps.',
      items: {
        type: 'object',
        properties: {
          ts: { type: 'integer', description: 'Sample timestamp (ms since epoch).' },
          valueUsd: { type: 'number', description: 'Blended-USD asset value at ts — steps on each deposit/withdrawal.' },
          earnedUsd: { type: 'number', description: 'Cumulative earned (USD) at ts.' },
        },
        required: ['ts', 'valueUsd', 'earnedUsd'],
      },
    },
    monthly: {
      type: 'array',
      description: 'Per-month earned breakdown, oldest→newest.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'YYYY-MM (UTC).' },
          earnedUsd: { type: 'number' },
        },
        required: ['label', 'earnedUsd'],
      },
    },
  },
  required: ['hasDeposit', 'balanceUsd', 'apy', 'earnedUsd', 'buckets', 'chart', 'monthly'],
} as const;

/**
 * The rate card (`getRates`), documented field-by-field because it is what the Earn empty-state hero and
 * the simulator quote for a bucket the user has not funded — the last number that used to come from a
 * frontend constant. No risk/label/score field exists here by design.
 */
const ratesResponse = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      currency: { type: 'string', enum: [...CURRENCIES] },
      name: { type: 'string', description: 'Venue full name, e.g. "DeFindex USDC vault".' },
      venue: { type: 'string', description: 'Provider, e.g. "DeFindex".' },
      kind: { type: 'string', enum: ['lending', 'vault', 'rwa'] },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Display tags `[venue, kindLabel]` — the same pair a funded /holdings row carries.',
      },
      apy: { type: 'number', description: "The best safe venue's APY — what the agent would allocate to." },
    },
    required: ['currency', 'name', 'venue', 'kind', 'tags', 'apy'],
  },
} as const;

/** One vetted pool (`getPool`) — an exit proposal's target, named and rated. Unknown id → 404. */
const poolResponse = {
  type: 'object',
  properties: {
    id: { type: 'string', description: "The seam's PoolId slug, e.g. \"blend-eurc\"." },
    name: { type: 'string', description: 'Venue full name, e.g. "Blend EURC".' },
    venue: { type: 'string', description: 'Provider, e.g. "Blend".' },
    apy: { type: 'number' },
  },
  required: ['id', 'name', 'venue', 'apy'],
} as const;

/** The OpenAPI 3.1 document. `/faucet` is documented but env-gated (present only when faucet env is set). */
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'SoroSense read API',
    version: '1.0.0',
    description:
      'Read-only HTTP surface over the composed backend reads, plus the env-gated testnet faucet. ' +
      'bigint values are decimal strings. No risk/label/score field is ever returned.',
  },
  servers: [{ url: 'http://localhost:8787' }],
  paths: {
    '/health': {
      get: {
        operationId: 'health',
        summary: 'Liveness probe.',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
              },
            },
          },
        },
      },
    },
    '/holdings': {
      get: {
        operationId: 'getHoldings',
        summary: 'Per-bucket holdings for a depositor.',
        parameters: [
          { name: 'depositor', in: 'query', required: true, schema: { type: 'string', minLength: 1 } },
        ],
        responses: {
          '200': { description: 'holdings', content: { 'application/json': { schema: jsonArray } } },
          '400': errorResponse,
          '502': errorResponse,
          '503': errorResponse,
          '504': errorResponse,
        },
      },
    },
    '/activity': {
      get: {
        operationId: 'getActivity',
        summary: 'Merged All / Yours / Automated activity feed.',
        parameters: [
          { name: 'depositor', in: 'query', required: false, schema: { type: 'string', minLength: 1 } },
          { name: 'actor', in: 'query', required: false, schema: { type: 'string', enum: ['you', 'agent'] } },
          { name: 'currency', in: 'query', required: false, schema: { type: 'string', enum: [...CURRENCIES] } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
        ],
        responses: {
          '200': { description: 'feed', content: { 'application/json': { schema: jsonArray } } },
          '400': errorResponse,
        },
      },
    },
    '/earnings': {
      get: {
        operationId: 'getEarnings',
        summary: 'Blended-USD Earn view for a depositor: balance, APY, earned, per-bucket drill-down, value/earned timeline.',
        parameters: [
          { name: 'depositor', in: 'query', required: true, schema: { type: 'string', minLength: 1 } },
        ],
        responses: {
          '200': { description: 'earnings', content: { 'application/json': { schema: earningsResponse } } },
          '400': errorResponse,
          '502': errorResponse,
          '503': errorResponse,
          '504': errorResponse,
        },
      },
    },
    '/funding': {
      get: {
        operationId: 'getFundingOptions',
        summary: 'Add-funds list (stablecoins + RWA).',
        responses: {
          '200': { description: 'funding options', content: { 'application/json': { schema: jsonObject } } },
        },
      },
    },
    '/rates': {
      get: {
        operationId: 'getRates',
        summary: 'Rate card per currency — the venue the agent would allocate an UNFUNDED bucket to, and its APY.',
        description:
          'User-independent (no depositor). `/holdings` omits a zero-share bucket by design, so this is ' +
          'the rate the Earn empty-state hero and the simulator quote. Catalog-derived; a currency with ' +
          'no vetted venue is omitted rather than quoted at 0%.',
        responses: {
          '200': { description: 'rate cards', content: { 'application/json': { schema: ratesResponse } } },
        },
      },
    },
    '/pools/{id}': {
      get: {
        operationId: 'getPool',
        summary: "One vetted pool's name + APY (an exit proposal's target).",
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: "The seam's PoolId slug, e.g. `blend-eurc`.",
            schema: { type: 'string', minLength: 1 },
          },
        ],
        responses: {
          '200': { description: 'pool', content: { 'application/json': { schema: poolResponse } } },
          '404': errorResponse,
        },
      },
    },
    '/faucet': {
      post: {
        operationId: 'faucet',
        summary: 'Mint self-issued testnet USDC/EURC (env-gated; 404 when the faucet env is unset).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  address: { type: 'string' },
                  currency: { type: 'string', enum: ['USD', 'EUR'] },
                },
                required: ['address', 'currency'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'minted', content: { 'application/json': { schema: jsonObject } } },
          '400': errorResponse,
          '404': { description: 'faucet not mounted (env-gated off)' },
          '409': { description: 'trustline required', content: { 'application/json': { schema: jsonObject } } },
          '429': errorResponse,
        },
      },
    },
  },
} as const;

/** Serve the spec (`GET /openapi.json`) and Swagger UI (`GET /docs`). Read-only, no secret. */
export function mountDocs(app: Hono): void {
  app.get('/openapi.json', (c) => c.json(openApiSpec));
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));
}
