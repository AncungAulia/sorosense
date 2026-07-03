import { describe, expect, it } from 'vitest';
import { PERIOD_DAYS, simulate } from './simulate.js';

describe('simulate (deterministic, no risk label)', () => {
  it('returns a deterministic projection for the same input', () => {
    const a = simulate({ currency: 'USD', amount: 1_000, periodDays: PERIOD_DAYS.year });
    const b = simulate({ currency: 'USD', amount: 1_000, periodDays: PERIOD_DAYS.year });
    expect(a).toEqual(b);
    expect(a.projectedEarnings).toBeGreaterThan(0);
  });

  it('exposes NO risk label field (safety is invisible, R11)', () => {
    const r = simulate({ currency: 'USD', amount: 1_000, periodDays: 365 }) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of ['risk', 'riskLabel', 'label', 'safe', 'score']) {
      expect(forbidden in r).toBe(false);
    }
  });

  it('projects more over a year than over a month', () => {
    const month = simulate({ currency: 'USD', amount: 10_000, periodDays: PERIOD_DAYS.month });
    const year = simulate({ currency: 'USD', amount: 10_000, periodDays: PERIOD_DAYS.year });
    expect(year.projectedEarnings).toBeGreaterThan(month.projectedEarnings);
  });

  it('handles each supported currency bucket independently', () => {
    for (const currency of ['USD', 'EUR', 'MXN'] as const) {
      const r = simulate({ currency, amount: 1_000, periodDays: 365 });
      expect(r.currency).toBe(currency);
      expect(r.apy).toBeGreaterThan(0);
    }
  });

  it('rejects negative input', () => {
    expect(() => simulate({ currency: 'USD', amount: -1, periodDays: 30 })).toThrow();
  });
});
