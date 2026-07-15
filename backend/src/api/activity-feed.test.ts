import { describe, expect, it } from 'vitest';
import { ActivityLog } from './activity.js';
import { getActivity, type ActivityFeedDeps } from './activity-feed.js';
import type { UserActionEvent } from './user-activity.js';

const RISK_WORDS = /\b(risk|risks|risky|tier|tiers|score|scores)\b/i;

/** A log with some agent activity after alice entered the USD bucket. */
function seed(): ActivityFeedDeps {
  const log = new ActivityLog();
  log.append({ currency: 'USD', kind: 'allocated', detail: 'USD -> Blend USDC' }); // id 1
  log.append({ currency: 'USD', kind: 'compounded', detail: 'USD @ Blend USDC' }); // id 2
  const userEvents: UserActionEvent[] = [
    { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1_000n, seq: 0 },
    { kind: 'sign-mandate', depositor: 'alice', seq: 3 },
    { kind: 'deposit', depositor: 'bob', currency: 'EUR', amount: 500n, seq: 5 },
  ];
  return { log, userEvents };
}

describe('getActivity', () => {
  it('answers "which actions did user X take" - Yours is not empty after a deposit (R-UA7)', () => {
    const deps = seed();
    const yours = getActivity({ depositor: 'alice', actor: 'you' }, deps);
    expect(yours.length).toBeGreaterThan(0);
    expect(yours.some((r) => r.kind === 'deposit' && r.depositor === 'alice')).toBe(true);
    expect(yours.every((r) => r.actor === 'you' && r.depositor === 'alice')).toBe(true);
  });

  it('All (no actor filter) merges agent + the user rows, most-recent-first', () => {
    const rows = getActivity({ depositor: 'alice' }, seed());
    expect(rows.map((r) => r.seq)).toEqual([3, 2, 1, 0]); // sign-mandate, compounded, allocated, deposit
    expect(rows.filter((r) => r.actor === 'agent')).toHaveLength(2);
    expect(rows.filter((r) => r.actor === 'you')).toHaveLength(2);
  });

  it('Automated shows only agent rows', () => {
    const rows = getActivity({ actor: 'agent' }, seed());
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actor === 'agent')).toBe(true);
  });

  it('is deterministic - repeated calls yield the same order', () => {
    const deps = seed();
    expect(getActivity({ depositor: 'alice' }, deps)).toEqual(getActivity({ depositor: 'alice' }, deps));
  });

  it('never surfaces a risk label, tier, or score', () => {
    for (const row of getActivity({ depositor: 'alice' }, seed())) {
      expect(row.detail).not.toMatch(RISK_WORDS);
    }
  });

  it('scopes to a currency bucket; consent (no currency) drops out', () => {
    const rows = getActivity({ depositor: 'alice', currency: 'USD' }, seed());
    expect(rows.every((r) => r.currency === 'USD')).toBe(true);
    expect(rows.some((r) => r.kind === 'sign-mandate')).toBe(false);
  });

  it('respects limit, most-recent-first', () => {
    const rows = getActivity({ depositor: 'alice', limit: 1 }, seed());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seq).toBe(3);
  });

  it('empty user events -> account-scoped feed is empty, but the global agent feed still reads', () => {
    const deps: ActivityFeedDeps = { log: seed().log, userEvents: [] };
    expect(getActivity({ depositor: 'alice', actor: 'you' }, deps)).toEqual([]);
    expect(getActivity({ depositor: 'alice' }, deps)).toEqual([]);
    expect(getActivity({ depositor: 'alice', actor: 'agent' }, deps)).toEqual([]);
    expect(getActivity({}, deps)).toHaveLength(2);
  });

  it('account-scoped Agent rows are limited to the depositor currencies', () => {
    const deps: ActivityFeedDeps = {
      log: new ActivityLog(),
      userEvents: [{ kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1_000n, seq: 3 }],
      agentEvents: [
        { kind: 'allocate', currency: 'USD', amount: 1_000n, seq: 4 },
        { kind: 'allocate', currency: 'EUR', amount: 1_000n, seq: 5 },
      ],
    };

    const rows = getActivity({ depositor: 'alice', actor: 'agent' }, deps);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: 'agent', currency: 'USD' });
  });

  it('account-scoped Agent rows omit pool activity that happened before the depositor entered that bucket', () => {
    const log = new ActivityLog();
    log.append({ currency: 'USD', kind: 'allocated', detail: 'USD -> Blend USDC' }); // id 1
    log.append({ currency: 'USD', kind: 'compounded', detail: 'USD @ Blend USDC' }); // id 2
    const deps: ActivityFeedDeps = {
      log,
      userEvents: [{ kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1_000n, seq: 3 }],
    };

    expect(getActivity({ depositor: 'alice', actor: 'agent' }, deps)).toEqual([]);
  });
});
