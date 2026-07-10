/**
 * Agent activity feed (R14). The MVP has NO chatbot — agent actions appear as plain entries the app
 * shows under Home "Agent activity" and Account "Recent activity". This is a read surface for the
 * frontend plus an internal append the agent calls when it acts; it performs no chain writes.
 */

import type { Currency } from '@sorosense/vault-client';

export type ActivityKind = 'allocated' | 'compounded' | 'rebalanced' | 'froze' | 'proposed-exit';

/** Who took the action: the depositor (`'you'`) or the agent (`'agent'`). Drives the "Yours" /
 * "Automated" filter (STE-42). Agent appends default to `'agent'`. */
export type Actor = 'you' | 'agent';

export interface ActivityEntry {
  id: number;
  currency: Currency;
  kind: ActivityKind;
  /** Plain-language detail, e.g. "USD -> DeFindex USDC". No risk label. */
  detail: string;
  /** Who acted. Always populated on a stored entry (defaults to `'agent'` on append). */
  actor: Actor;
  /** Optional caller-supplied timestamp (ms). Ordering does not depend on it. */
  ts?: number;
}

/**
 * In-memory activity log. Ordering is by a monotonic sequence (insertion order), independent of any
 * wall clock, so the feed is deterministic for a given sequence of appends. Swap for a durable store
 * at deploy alongside the allocator's store.
 */
export class ActivityLog {
  private entries: ActivityEntry[] = [];
  private seq = 0;

  /** Record an action. `actor` is optional and defaults to `'agent'` — the agent is the usual caller;
   * a user-action source may pass `actor: 'you'`. Returns the stored entry. */
  append(entry: Omit<ActivityEntry, 'id' | 'actor'> & { actor?: Actor }): ActivityEntry {
    const stored: ActivityEntry = { ...entry, actor: entry.actor ?? 'agent', id: ++this.seq };
    this.entries.push(stored);
    return stored;
  }

  /** Most-recent-first list, optionally filtered to one currency bucket. */
  list(currency?: Currency, limit = 50): ActivityEntry[] {
    const filtered = currency ? this.entries.filter((e) => e.currency === currency) : this.entries;
    return [...filtered].reverse().slice(0, limit);
  }
}
