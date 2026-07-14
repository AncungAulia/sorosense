/**
 * Keeper CLI (STE-21 Fase D / U2) — a thin `argv` entrypoint the operator runs on the demo stage to
 * drive one keeper action against testnet. Client selection (real vs mock) is handled by
 * {@link getVaultClient} via env; this file only parses an action and prints the result.
 *
 *   node dist/keeper/cli.js freeze <USD|EUR>
 *   node dist/keeper/cli.js unfreeze <USD|EUR>
 *   node dist/keeper/cli.js tick <USD|EUR>
 *
 * `tick` builds the Safe candidate set from the vetted catalog and runs one deterministic allocator
 * tick against live on-chain state. In mock mode the real-write actions refuse with a clear message
 * (they never fake a testnet write). `KEEPER_SECRET` is never read or printed here.
 */

import type { Currency } from '@sorosense/vault-client';
import { getCatalog } from '../tools/catalog.js';
import { makeKeeperRunner, type KeeperRunner, type RunTickInput } from './runner.js';

const ACTIONS = ['freeze', 'unfreeze', 'tick'] as const;
type Action = (typeof ACTIONS)[number];

const CURRENCIES: Currency[] = ['USD', 'EUR', 'MXN'];

function parseCurrency(raw: string | undefined): Currency {
  const upper = (raw ?? '').toUpperCase();
  const match = CURRENCIES.find((c) => c === upper);
  if (!match) throw new Error(`unknown currency: ${raw ?? '(none)'} (expected USD | EUR | MXN)`);
  return match;
}

/** Safe candidates for a currency, ranked by catalog APY as the risk-adjusted yield stand-in. */
function candidatesFor(currency: Currency): RunTickInput['candidates'] {
  return getCatalog(currency).map((v) => ({ poolId: v.id, ray: v.apy }));
}

async function run(runner: KeeperRunner, action: Action, currency: Currency): Promise<void> {
  switch (action) {
    case 'freeze': {
      const res = await runner.freezePool(currency);
      console.log(`freeze ${currency}: ${res.success ? 'ok' : 'failed'} (tx ${res.hash})`);
      break;
    }
    case 'unfreeze': {
      const res = await runner.unfreezePool(currency);
      console.log(`unfreeze ${currency}: ${res.success ? 'ok' : 'failed'} (tx ${res.hash})`);
      break;
    }
    case 'tick': {
      const decision = await runner.runTick(currency, { candidates: candidatesFor(currency) });
      console.log(`tick ${currency}: ${JSON.stringify(decision)}`);
      break;
    }
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const [rawAction, rawCurrency] = argv;
  const action = ACTIONS.find((a) => a === rawAction);
  if (!action) {
    console.error(`usage: keeper <${ACTIONS.join('|')}> <USD|EUR|MXN>`);
    return 2;
  }
  try {
    const currency = parseCurrency(rawCurrency);
    await run(makeKeeperRunner(), action, currency);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

// Entrypoint: run when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
