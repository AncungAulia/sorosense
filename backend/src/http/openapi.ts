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
          { name: 'depositor', in: 'query', required: true, schema: { type: 'string' } },
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
          { name: 'depositor', in: 'query', required: false, schema: { type: 'string' } },
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
        summary: 'Blended-USD Earn view for a depositor.',
        parameters: [
          { name: 'depositor', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'earnings', content: { 'application/json': { schema: jsonObject } } },
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
