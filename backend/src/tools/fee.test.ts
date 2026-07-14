/**
 * Performance-fee math — pure, offline. The fee is always a share of YIELD, never principal, and the
 * net-APY quote must never drift from the fee booked on earnings (one source, `fee.ts`).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERFORMANCE_FEE_BPS,
  performanceFeeBps,
  netApy,
  feeOnYield,
  netYield,
} from './fee.js';

describe('performanceFeeBps', () => {
  it('defaults to 10% (1000 bps)', () => {
    expect(DEFAULT_PERFORMANCE_FEE_BPS).toBe(1000);
    expect(performanceFeeBps({})).toBe(1000);
  });

  it('honours PERFORMANCE_FEE_BPS', () => {
    expect(performanceFeeBps({ PERFORMANCE_FEE_BPS: '2000' })).toBe(2000);
  });

  it('clamps garbage or an above-100% fee back to the default', () => {
    expect(performanceFeeBps({ PERFORMANCE_FEE_BPS: 'abc' })).toBe(1000);
    expect(performanceFeeBps({ PERFORMANCE_FEE_BPS: '10001' })).toBe(1000); // > 100% of yield
    expect(performanceFeeBps({ PERFORMANCE_FEE_BPS: '0' })).toBe(0); // 0% is a valid policy
  });
});

describe('netApy', () => {
  it('takes 10% of the yield: 10.57% gross → 9.51% net', () => {
    expect(netApy(10.57, 1000)).toBe(9.51);
  });

  it('a zero fee leaves the APY untouched', () => {
    expect(netApy(11.47, 0)).toBe(11.47);
  });

  it('is exact because the fee is a share of yield (applying it to an APY is applying it to a yield rate)', () => {
    expect(netApy(20, 2000)).toBe(16); // 20% gross, 20% fee → 16% net
  });
});

describe('feeOnYield / netYield', () => {
  it('splits a realized yield into fee + kept, summing back to the whole', () => {
    const y = 100;
    expect(feeOnYield(y, 1000)).toBe(10);
    expect(netYield(y, 1000)).toBe(90);
    expect(feeOnYield(y, 1000) + netYield(y, 1000)).toBe(y);
  });

  it('never touches principal — a zero yield yields a zero fee', () => {
    expect(feeOnYield(0, 1000)).toBe(0);
  });
});
