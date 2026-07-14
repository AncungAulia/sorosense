import type { Currency } from "@sorosense/vault-client";

/**
 * Frontend stand-in for cost-basis: net contributions per currency (Σ deposits −
 * Σ withdrawals), in base units. "Total earned" = current value − contributions,
 * which is why it's immune to deposits and withdrawals and only moves with yield.
 *
 * The real figure is reconstructed from on-chain Deposit/Withdraw events by the
 * backend (`earnings/cost-basis.ts`) at integration; here we keep an in-memory
 * ledger (module singleton, matching the vault mock's lifetime) so the Earn stub
 * can show a truthful earned number. Single-user mock — keyed by currency only.
 */
const ledger = new Map<Currency, bigint>();

export function recordDeposit(currency: Currency, amount: bigint): void {
  ledger.set(currency, (ledger.get(currency) ?? 0n) + amount);
}

export function recordWithdraw(currency: Currency, assetAmount: bigint): void {
  ledger.set(currency, (ledger.get(currency) ?? 0n) - assetAmount);
}

export function getContributions(currency: Currency): bigint {
  return ledger.get(currency) ?? 0n;
}

/** Clear the ledger — the seed calls this so a fresh funded state starts clean. */
export function resetContributions(): void {
  ledger.clear();
}
