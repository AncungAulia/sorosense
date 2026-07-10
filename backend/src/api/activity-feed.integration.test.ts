/**
 * E2E integration — a realistic Activity journey through the real ActivityLog + real user-action
 * derivation, no mocks. A depositor connects, deposits, signs the mandate; the agent allocates and
 * compounds; the depositor approves a safe exit. Then the three UI tabs (All / Yours / Automated) are
 * read back through getActivity. Proves the whole chain end-to-end: the "Yours" tab reflects the
 * user's real actions instead of a fixture, and the safety/agent feed stays separate.
 */

import { describe, expect, it } from 'vitest';
import { ActivityLog } from './activity.js';
import { getActivity } from './activity-feed.js';
import type { UserActionEvent } from './user-activity.js';

const RISK_WORDS = /\b(risk|risks|risky|tier|tiers|score|scores)\b/i;

describe('Activity feed e2e — a full journey, real objects', () => {
  it('the Yours tab reflects the user’s real actions, Automated reflects the agent’s', () => {
    // Agent side: the real log the agent appends to as it acts.
    const log = new ActivityLog();
    // User side: the on-chain actions decoded into events (reader deferred to U20).
    const userEvents: UserActionEvent[] = [];

    // 1. Alice deposits EUR 500 and signs the one-time mandate.
    userEvents.push({ kind: 'deposit', depositor: 'alice', currency: 'EUR', amount: 500n, seq: 1 });
    userEvents.push({ kind: 'sign-mandate', depositor: 'alice', seq: 2 });
    // 2. The agent allocates then compounds the bucket.
    log.append({ currency: 'EUR', kind: 'allocated', detail: 'EUR -> Blend EURC' }); // id 1
    log.append({ currency: 'EUR', kind: 'compounded', detail: 'EUR @ Blend EURC' }); // id 2
    // 3. Bob deposits into his own bucket — must never appear under Alice's Yours.
    userEvents.push({ kind: 'deposit', depositor: 'bob', currency: 'USD', amount: 1_000n, seq: 3 });
    // 4. The agent proposes and Alice approves a safe exit.
    log.append({ currency: 'EUR', kind: 'proposed-exit', detail: 'Blend EURC -> DeFindex EURC' }); // id 3
    userEvents.push({ kind: 'approve-exit', depositor: 'alice', currency: 'EUR', seq: 4 });

    const deps = { log, userEvents };

    // Yours (Alice): her deposit, mandate, and approve-exit — nothing of Bob's, nothing agent.
    const yours = getActivity({ depositor: 'alice', actor: 'you' }, deps);
    expect(yours.map((r) => r.kind).sort()).toEqual(['approve-exit', 'deposit', 'sign-mandate']);
    expect(yours.every((r) => r.depositor === 'alice')).toBe(true);
    expect(yours.some((r) => r.depositor === 'bob')).toBe(false);

    // Automated: only the agent's three actions.
    const automated = getActivity({ actor: 'agent' }, deps);
    expect(automated.map((r) => r.kind)).toEqual(['proposed-exit', 'compounded', 'allocated']);
    expect(automated.every((r) => r.actor === 'agent')).toBe(true);

    // All (Alice): her rows + agent rows, most-recent-first, no risk wording anywhere.
    const all = getActivity({ depositor: 'alice' }, deps);
    expect(all).toHaveLength(6); // 3 user + 3 agent (bob's is excluded by the depositor narrow)
    for (const row of all) expect(row.detail).not.toMatch(RISK_WORDS);
  });

  it('with no user events the Yours tab is empty but the agent feed still reads', () => {
    const log = new ActivityLog();
    log.append({ currency: 'USD', kind: 'allocated', detail: 'USD -> Blend USDC' });
    const deps = { log, userEvents: [] };
    expect(getActivity({ depositor: 'alice', actor: 'you' }, deps)).toEqual([]);
    expect(getActivity({ actor: 'agent' }, deps)).toHaveLength(1);
  });
});
