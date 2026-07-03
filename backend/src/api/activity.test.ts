import { describe, expect, it } from 'vitest';
import { ActivityLog } from './activity.js';

describe('ActivityLog', () => {
  it('appends and lists entries most-recent-first', () => {
    const log = new ActivityLog();
    log.append({ currency: 'USD', kind: 'allocated', detail: 'USD -> Blend USDC' });
    log.append({ currency: 'USD', kind: 'compounded', detail: 'USD @ Blend USDC' });
    log.append({ currency: 'USD', kind: 'rebalanced', detail: 'Blend -> DeFindex' });

    const list = log.list('USD');
    expect(list.map((e) => e.kind)).toEqual(['rebalanced', 'compounded', 'allocated']);
    expect(list.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('filters by currency bucket', () => {
    const log = new ActivityLog();
    log.append({ currency: 'USD', kind: 'allocated', detail: 'a' });
    log.append({ currency: 'EUR', kind: 'allocated', detail: 'b' });
    expect(log.list('EUR').every((e) => e.currency === 'EUR')).toBe(true);
    expect(log.list().length).toBe(2);
  });
});
