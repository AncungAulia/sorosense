/**
 * Cost-basis reconstruction from vault events (R11). The contract stores only shares, never a cost
 * basis, so to compute `earned = assetValue − contributions` a later unit needs the net native
 * contributions behind a user's shares. This module rebuilds that from the on-chain Deposit/Withdraw
 * event stream: pure and deterministic over an event list. The real event *reader* is deferred; this
 * takes the events as input.
 */

import type { Address, Amount, Currency, Shares } from '@sorosense/vault-client';
import { SHARE_PRICE_SCALE } from '@sorosense/vault-client';

/**
 * One decoded vault event (from `smart-contract/contracts/vault/src/events.rs`). `amount` is assets
 * moved in/out in the bucket's native currency; `shares` is shares minted (deposit) or burned
 * (withdraw). `seq` is a monotonic ordering key so input array order does not matter.
 */
export interface VaultEvent {
  kind: 'deposit' | 'withdraw';
  depositor: Address;
  currency: Currency;
  amount: Amount; // assets in/out
  shares: Shares; // shares minted/burned
  seq: number; // monotonic ordering key
}

/** Reconstructed per-(user,currency) basis: shares currently held and the net native cost behind them. */
export interface CostBasis {
  /** Current shares held after replaying every event for the bucket. */
  shares: Shares;
  /** Net native contributions — the cost basis. Reduced pro-rata on withdrawal. */
  contributed: Amount;
}

/** Composite map key for a (depositor, currency) bucket. */
function bucketKey(depositor: Address, currency: Currency): string {
  return `${depositor}:${currency}`;
}

/** An empty bucket: no shares, no contributions. */
function emptyBasis(): CostBasis {
  return { shares: 0n, contributed: 0n };
}

/**
 * Replay an event list into a `Map` of `` `${depositor}:${currency}` `` → {@link CostBasis}.
 *
 * Events are processed in `seq`-ascending order over a sorted copy, so the caller may pass them in
 * any array order. A deposit adds its shares and amount. A withdraw redeems shares pro-rata: it first
 * reduces `contributed` by the fraction of shares being burned (bigint division, computed on the
 * pre-withdraw held shares), then decrements `shares`. Redeeming more shares than held is an error.
 */
export function reconstructCostBasis(events: readonly VaultEvent[]): Map<string, CostBasis> {
  const bases = new Map<string, CostBasis>();

  // Sort a copy so the input order is irrelevant and the original is not mutated.
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  for (const ev of ordered) {
    const key = bucketKey(ev.depositor, ev.currency);
    const basis = bases.get(key) ?? emptyBasis();

    if (ev.kind === 'deposit') {
      basis.shares += ev.shares;
      basis.contributed += ev.amount;
    } else {
      // Withdraw: redeem shares pro-rata against the currently held shares.
      if (ev.shares > basis.shares) {
        throw new Error(
          `cost-basis: withdraw of ${ev.shares} shares exceeds held ${basis.shares} for ${key} (seq ${ev.seq})`,
        );
      }
      // Reduce contributions by the fraction redeemed BEFORE decrementing shares. Guard the zero
      // case (only reachable when both are 0, i.e. a no-op withdraw) to avoid division by zero.
      if (basis.shares > 0n) {
        basis.contributed -= (basis.contributed * ev.shares) / basis.shares;
      }
      basis.shares -= ev.shares;
    }

    bases.set(key, basis);
  }

  return bases;
}

/** Cost basis for a single (depositor, currency) bucket. Absent bucket → `{ shares: 0n, contributed: 0n }`. */
export function costBasisOf(
  events: readonly VaultEvent[],
  depositor: Address,
  currency: Currency,
): CostBasis {
  const bases = reconstructCostBasis(events);
  return bases.get(bucketKey(depositor, currency)) ?? emptyBasis();
}

/**
 * Weighted entry price for a bucket as fixed-point scaled by {@link SHARE_PRICE_SCALE}
 * (`contributed × SCALE / shares`), matching the vault's `PriceRay` convention. Returns `0n` for an
 * empty bucket so callers never divide by zero.
 */
export function weightedEntryPrice(basis: CostBasis): bigint {
  if (basis.shares === 0n) return 0n;
  return (basis.contributed * SHARE_PRICE_SCALE) / basis.shares;
}
