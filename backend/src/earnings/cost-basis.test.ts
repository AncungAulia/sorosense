import { describe, expect, it } from 'vitest';
import { SHARE_PRICE_SCALE } from '@sorosense/vault-client';
import {
  costBasisOf,
  reconstructCostBasis,
  weightedEntryPrice,
  type VaultEvent,
} from './cost-basis.js';

const USER = 'GUSER';

/** Terse helper to build events without repeating the boilerplate. */
function ev(partial: Partial<VaultEvent> & Pick<VaultEvent, 'kind' | 'amount' | 'shares' | 'seq'>): VaultEvent {
  return {
    depositor: USER,
    currency: 'USD',
    ...partial,
  };
}

describe('cost-basis reconstruction (R11)', () => {
  it('single deposit → contributed == amount, shares == minted shares', () => {
    const events: VaultEvent[] = [ev({ kind: 'deposit', amount: 1000n, shares: 1000n, seq: 1 })];
    expect(costBasisOf(events, USER, 'USD')).toEqual({ shares: 1000n, contributed: 1000n });
  });

  it('two deposits at different prices → sums, with blended weighted entry price', () => {
    // First deposit: 1000 assets → 1000 shares (price 1.0). Second: 2000 assets → 1000 shares (price 2.0).
    const events: VaultEvent[] = [
      ev({ kind: 'deposit', amount: 1000n, shares: 1000n, seq: 1 }),
      ev({ kind: 'deposit', amount: 2000n, shares: 1000n, seq: 2 }),
    ];
    const basis = costBasisOf(events, USER, 'USD');
    expect(basis).toEqual({ shares: 2000n, contributed: 3000n });
    // Blended entry price = 3000/2000 = 1.5 × scale, between the 1.0 and 2.0 deposits.
    expect(weightedEntryPrice(basis)).toBe((3000n * SHARE_PRICE_SCALE) / 2000n);
    expect(weightedEntryPrice(basis)).toBe((3n * SHARE_PRICE_SCALE) / 2n);
  });

  it('deposit then partial withdraw → contributed reduced pro-rata, shares decremented', () => {
    // Deposit 1000 assets / 1000 shares, then withdraw half the shares (500).
    const events: VaultEvent[] = [
      ev({ kind: 'deposit', amount: 1000n, shares: 1000n, seq: 1 }),
      ev({ kind: 'withdraw', amount: 500n, shares: 500n, seq: 2 }),
    ];
    // Contributed halved (1000 - 1000*500/1000 = 500), shares halved.
    expect(costBasisOf(events, USER, 'USD')).toEqual({ shares: 500n, contributed: 500n });
  });

  it('no events for a bucket → { shares: 0n, contributed: 0n }', () => {
    expect(costBasisOf([], USER, 'USD')).toEqual({ shares: 0n, contributed: 0n });
    // Also for a bucket that has events in another currency but none here.
    const events: VaultEvent[] = [ev({ kind: 'deposit', amount: 1000n, shares: 1000n, seq: 1 })];
    expect(costBasisOf(events, USER, 'EUR')).toEqual({ shares: 0n, contributed: 0n });
  });

  it('order-independent: shuffling the same events (same seq) yields the identical result', () => {
    const events: VaultEvent[] = [
      ev({ kind: 'deposit', amount: 1000n, shares: 1000n, seq: 1 }),
      ev({ kind: 'deposit', amount: 2000n, shares: 1000n, seq: 2 }),
      ev({ kind: 'withdraw', amount: 750n, shares: 500n, seq: 3 }),
    ];
    const inOrder = costBasisOf(events, USER, 'USD');
    // A different array order (seq unchanged) must produce the same reconstruction.
    const shuffled = [...events].reverse();
    expect(costBasisOf(shuffled, USER, 'USD')).toEqual(inOrder);
  });

  it('buckets are independent: a USD event never affects the EUR result', () => {
    const events: VaultEvent[] = [
      ev({ kind: 'deposit', currency: 'USD', amount: 1000n, shares: 1000n, seq: 1 }),
      ev({ kind: 'deposit', currency: 'EUR', amount: 400n, shares: 200n, seq: 2 }),
    ];
    expect(costBasisOf(events, USER, 'USD')).toEqual({ shares: 1000n, contributed: 1000n });
    expect(costBasisOf(events, USER, 'EUR')).toEqual({ shares: 200n, contributed: 400n });
    // And a second user's bucket is separate again.
    const withOther: VaultEvent[] = [
      ...events,
      ev({ kind: 'deposit', depositor: 'GOTHER', currency: 'USD', amount: 50n, shares: 50n, seq: 3 }),
    ];
    const map = reconstructCostBasis(withOther);
    expect(map.get('GUSER:USD')).toEqual({ shares: 1000n, contributed: 1000n });
    expect(map.get('GOTHER:USD')).toEqual({ shares: 50n, contributed: 50n });
  });

  it('withdrawing more shares than held throws', () => {
    const events: VaultEvent[] = [
      ev({ kind: 'deposit', amount: 1000n, shares: 1000n, seq: 1 }),
      ev({ kind: 'withdraw', amount: 2000n, shares: 2000n, seq: 2 }),
    ];
    expect(() => costBasisOf(events, USER, 'USD')).toThrow();
  });
});
