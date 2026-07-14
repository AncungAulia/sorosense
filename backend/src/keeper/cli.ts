/**
 * Keeper CLI (STE-21 Fase D / U2) — a thin `argv` entrypoint the operator runs on the demo stage to
 * drive one keeper action against testnet. Client selection (real vs mock) is handled by
 * {@link getVaultClient} via env; this file only parses an action and prints the result.
 *
 *   node dist/keeper/cli.js allocate <USD|EUR> <amount>
 *   node dist/keeper/cli.js freeze <USD|EUR>
 *   node dist/keeper/cli.js unfreeze <USD|EUR>
 *   node dist/keeper/cli.js tick <USD|EUR>
 *
 * `allocate` moves `amount` base units of the bucket's idle funds into its demo `yield_pool` — the
 * first-time allocation that starts the yield accruing (`active_pool` stops reading `null`). `tick`
 * builds the Safe candidate set from the vetted catalog and runs one deterministic allocator tick
 * against live on-chain state. In mock mode the real-write actions refuse with a clear message (they
 * never fake a testnet write). `KEEPER_SECRET` is never read or printed here.
 */

import type { Amount, Currency } from '@sorosense/vault-client';
import { getCatalog } from '../tools/catalog.js';
import { makeKeeperRunner, type KeeperRunner, type RunTickInput } from './runner.js';
import { runKeeperCronOnce } from './cron.js';

const ACTIONS = ['allocate', 'freeze', 'unfreeze', 'tick', 'cron'] as const;
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

/** Parse a positive base-unit amount for `allocate`. Throws on a missing or non-positive value. */
function parseAmount(raw: string | undefined): Amount {
  if (raw === undefined) throw new Error('allocate needs an amount: keeper allocate <USD|EUR> <amount>');
  let value: Amount;
  try {
    value = BigInt(raw);
  } catch {
    throw new Error(`invalid amount: ${raw} (expected an integer of base units)`);
  }
  if (value <= 0n) throw new Error(`amount must be positive: ${raw}`);
  return value;
}

async function run(
  runner: KeeperRunner,
  action: Action,
  currency: Currency,
  rawAmount: string | undefined,
): Promise<void> {
  switch (action) {
    case 'allocate': {
      const amount = parseAmount(rawAmount);
      const res = await runner.allocate(currency, amount);
      console.log(`allocate ${currency} ${amount}: ${res.success ? 'ok' : 'failed'} (tx ${res.hash})`);
      break;
    }
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
  const [rawAction, rawCurrency, rawAmount] = argv;
  const action = ACTIONS.find((a) => a === rawAction);
  if (!action) {
    console.error(`usage: keeper <${ACTIONS.join('|')}> [USD|EUR|MXN] [amount]`);
    return 2;
  }
  try {
    // `cron` evaluates every bucket in one pass (idempotent — safe for an OS cron / serverless route to
    // call daily). Deterministic, so it spends zero AI tokens; it only signs a tx on a real rebalance.
    if (action === 'cron') {
      const decisions = await runKeeperCronOnce();
      console.log(`cron: ${decisions.map((d) => `${d.currency}=${d.kind}`).join(' ')}`);
      return 0;
    }
    const currency = parseCurrency(rawCurrency);
    await run(makeKeeperRunner(), action, currency, rawAmount);
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
