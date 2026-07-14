/**
 * Agent-activity derivation (pure) + the event-reader decode of the keeper's on-chain actions into it.
 * Object-real: canned `ScVal` topics/data through the real decode path, no network.
 */

import { describe, expect, it } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { deriveAgentActivity, type AgentActionEvent } from './agent-activity.js';
import { decodeEvents } from '../chain/event-reader.js';
import type { RawEvent } from '../chain/event-reader.js';
import { currencyScv, i128, mapEntry } from '../chain/__fixtures__/vault-events.js';

describe('deriveAgentActivity', () => {
  it('maps each keeper action to an agent row with plain-language, risk-word-free detail', () => {
    const events: AgentActionEvent[] = [
      { kind: 'allocate', currency: 'USD', amount: 100n, seq: 0 },
      { kind: 'deallocate', currency: 'EUR', amount: 50n, seq: 1 },
      { kind: 'freeze', seq: 2 },
      { kind: 'unfreeze', seq: 3 },
      { kind: 'propose-exit', currency: 'USD', seq: 4 },
    ];
    const rows = deriveAgentActivity(events);

    expect(rows.every((r) => r.actor === 'agent')).toBe(true);
    expect(rows.map((r) => r.kind)).toEqual(['allocated', 'rebalanced', 'froze', 'froze', 'proposed-exit']);
    expect(rows[0]?.detail).toBe('Allocated USD into the yield pool');
    expect(rows[2]?.detail).toBe('Froze a pool to protect deposits');
    expect(rows[4]?.detail).toBe('Proposed a safe exit for USD');
    // No risk vocabulary anywhere.
    for (const r of rows) {
      for (const word of ['risk', 'score', 'tier', 'label']) expect(r.detail.toLowerCase()).not.toContain(word);
    }
  });

  it('orders by seq regardless of input order and never mutates the input', () => {
    const input: AgentActionEvent[] = [
      { kind: 'freeze', seq: 2 },
      { kind: 'allocate', currency: 'USD', amount: 1n, seq: 0 },
    ];
    const snapshot = [...input];
    const rows = deriveAgentActivity(input);
    expect(rows.map((r) => r.seq)).toEqual([0, 2]);
    expect(input).toEqual(snapshot);
  });
});

describe('event-reader decodes keeper actions into agentEvents', () => {
  /** An `Allocated { currency (topic), pool, amount }` raw event. */
  const allocated = (id: string, ledger: number, variant: string, amount: bigint): RawEvent => ({
    id,
    ledger,
    topic: [xdr.ScVal.scvSymbol('allocated'), currencyScv(variant)],
    value: xdr.ScVal.scvMap([mapEntry('amount', i128(amount))]),
  });
  const frozen = (id: string, ledger: number): RawEvent => ({
    id,
    ledger,
    topic: [xdr.ScVal.scvSymbol('frozen')],
    value: xdr.ScVal.scvMap([]),
  });

  it('decodes Allocated → an allocate agent event with currency + amount', () => {
    const { agentEvents, userEvents } = decodeEvents([allocated('e1', 100, 'Usd', 12_000n)]);
    expect(userEvents).toHaveLength(0); // not a user action
    expect(agentEvents).toHaveLength(1);
    expect(agentEvents[0]).toMatchObject({ kind: 'allocate', currency: 'USD', amount: 12_000n });
  });

  it('decodes Frozen → a freeze agent event (pool-level, no currency)', () => {
    const { agentEvents } = decodeEvents([frozen('e1', 101)]);
    expect(agentEvents[0]).toMatchObject({ kind: 'freeze' });
    expect(agentEvents[0] && 'currency' in agentEvents[0]).toBe(false);
  });

  it('assigns monotonic seq across a mixed page so the feed orders correctly', () => {
    const { agentEvents } = decodeEvents([allocated('e1', 100, 'Usd', 1n), frozen('e2', 101)]);
    expect(agentEvents.map((e) => e.seq)).toEqual([0, 1]);
  });
});
