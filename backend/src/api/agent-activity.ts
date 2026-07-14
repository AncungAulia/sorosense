/**
 * Agent-action history derivation. The keeper's on-chain moves — allocate, deallocate (rebalance),
 * freeze, propose-exit — are emitted as vault events (`Allocated`/`Deallocated`/`Frozen`/`Unfrozen`/
 * `ExitProposed`); this module turns a decoded stream of them into the `actor: 'agent'` rows the
 * Activity "Agent" tab shows. So "the agent is working" is sourced from the chain, exactly like the
 * user's own actions (`user-activity.ts`) — not a hand-written fixture and not an in-memory log that a
 * restart would lose.
 *
 * Pure and deterministic over an event list (ordered by a monotonic `seq`), like `cost-basis.ts`. A
 * read surface: no chain writes, no risk/label/score field.
 */

import type { Amount, Currency } from '@sorosense/vault-client';
import type { ActivityKind, Actor } from './activity.js';

/**
 * One decoded agent action. `seq` is a monotonic ordering key so input order does not matter. `freeze`/
 * `unfreeze` carry no currency (a freeze is pool-level, and the pool address is not shown); the others
 * are per-currency. Amounts are base units.
 */
export type AgentActionEvent =
  | { kind: 'allocate'; currency: Currency; amount: Amount; seq: number; ts?: number }
  | { kind: 'deallocate'; currency: Currency; amount: Amount; seq: number; ts?: number }
  | { kind: 'freeze'; seq: number; ts?: number }
  | { kind: 'unfreeze'; seq: number; ts?: number }
  | { kind: 'propose-exit'; currency: Currency; seq: number; ts?: number };

/** A derived agent-activity row, shaped to merge with the user feed in `getActivity`. */
export interface AgentActivityEntry {
  currency?: Currency;
  kind: ActivityKind;
  /** Plain-language detail. No risk label, tier, or score. */
  detail: string;
  seq: number;
  ts?: number;
  actor: Actor; // always 'agent'
}

/** Map an on-chain agent action to its display kind + plain-language detail (risk-word-free). */
function mapAction(ev: AgentActionEvent): { kind: ActivityKind; detail: string } {
  switch (ev.kind) {
    case 'allocate':
      return { kind: 'allocated', detail: `Allocated ${ev.currency} into the yield pool` };
    case 'deallocate':
      return { kind: 'rebalanced', detail: `Rebalanced ${ev.currency}` };
    case 'freeze':
      return { kind: 'froze', detail: 'Froze a pool to protect deposits' };
    case 'unfreeze':
      return { kind: 'froze', detail: 'Lifted a pool freeze' };
    case 'propose-exit':
      return { kind: 'proposed-exit', detail: `Proposed a safe exit for ${ev.currency}` };
  }
}

/**
 * Derive the agent's activity rows from an event stream. Processed in `seq`-ascending order over a
 * sorted copy (input may be in any order; the original is not mutated). One event maps to one row.
 * Pure: no I/O, no chain writes.
 */
export function deriveAgentActivity(events: readonly AgentActionEvent[]): AgentActivityEntry[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .map((ev) => {
      const { kind, detail } = mapAction(ev);
      const currency = 'currency' in ev ? ev.currency : undefined;
      return { currency, kind, detail, seq: ev.seq, ts: ev.ts, actor: 'agent' as const };
    });
}
