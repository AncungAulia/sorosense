import { describe, expect, it } from 'vitest';
import { deriveUserActivity, type UserActionEvent } from './user-activity.js';

const RISK_WORDS = /\b(risk|risks|risky|tier|tiers|score|scores)\b/i;

describe('deriveUserActivity', () => {
  it('maps one deposit to one row with actor "you", kind, currency, and detail', () => {
    const events: UserActionEvent[] = [
      { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1_000n, seq: 1 },
    ];
    const rows = deriveUserActivity(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      depositor: 'alice',
      currency: 'USD',
      kind: 'deposit',
      actor: 'you',
      seq: 1,
    });
    expect(rows[0]?.detail).toContain('USD');
  });

  it('maps all four kinds; sign-mandate carries no currency', () => {
    const events: UserActionEvent[] = [
      { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 100n, seq: 1 },
      { kind: 'withdraw', depositor: 'alice', currency: 'EUR', amount: 50n, seq: 2 },
      { kind: 'sign-mandate', depositor: 'alice', seq: 3 },
      { kind: 'approve-exit', depositor: 'alice', currency: 'MXN', seq: 4 },
    ];
    const rows = deriveUserActivity(events);
    expect(rows.map((r) => r.kind)).toEqual(['deposit', 'withdraw', 'sign-mandate', 'approve-exit']);
    const mandate = rows.find((r) => r.kind === 'sign-mandate');
    expect(mandate?.currency).toBeUndefined();
    expect(rows.find((r) => r.kind === 'approve-exit')?.currency).toBe('MXN');
  });

  it('maps auto-compound to a per-depositor row with no currency and an on/off detail', () => {
    const events: UserActionEvent[] = [
      { kind: 'auto-compound', depositor: 'alice', enabled: true, seq: 1 },
      { kind: 'auto-compound', depositor: 'alice', enabled: false, seq: 2 },
    ];
    const rows = deriveUserActivity(events);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ depositor: 'alice', kind: 'auto-compound', actor: 'you', seq: 1 });
    // The reinvest toggle is global to the depositor, not scoped to a bucket.
    expect(rows[0]?.currency).toBeUndefined();
    expect(rows[1]?.currency).toBeUndefined();
    expect(rows[0]?.detail).toContain('on');
    expect(rows[1]?.detail).toContain('off');
    // Never a risk label, tier, or score.
    expect(rows[0]?.detail).not.toMatch(RISK_WORDS);
    expect(rows[1]?.detail).not.toMatch(RISK_WORDS);
  });

  it('is deterministic — shuffled input by seq yields the seq-ordered output', () => {
    const events: UserActionEvent[] = [
      { kind: 'approve-exit', depositor: 'alice', currency: 'USD', seq: 3 },
      { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1n, seq: 1 },
      { kind: 'sign-mandate', depositor: 'alice', seq: 2 },
    ];
    const rows = deriveUserActivity(events);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    // Input array is not mutated.
    expect(events.map((e) => e.seq)).toEqual([3, 1, 2]);
  });

  it('keeps each row attributed to its own depositor (enables per-user filtering)', () => {
    const events: UserActionEvent[] = [
      { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1n, seq: 1 },
      { kind: 'deposit', depositor: 'bob', currency: 'USD', amount: 1n, seq: 2 },
    ];
    const rows = deriveUserActivity(events);
    expect(rows.find((r) => r.seq === 1)?.depositor).toBe('alice');
    expect(rows.find((r) => r.seq === 2)?.depositor).toBe('bob');
  });

  it('never emits a risk label, tier, or score in any detail', () => {
    const events: UserActionEvent[] = [
      { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1n, seq: 1 },
      { kind: 'withdraw', depositor: 'alice', currency: 'EUR', amount: 1n, seq: 2 },
      { kind: 'sign-mandate', depositor: 'alice', seq: 3 },
      { kind: 'approve-exit', depositor: 'alice', currency: 'MXN', seq: 4 },
    ];
    for (const row of deriveUserActivity(events)) {
      expect(row.detail).not.toMatch(RISK_WORDS);
    }
  });

  it('returns an empty list for an empty stream', () => {
    expect(deriveUserActivity([])).toEqual([]);
  });
});
