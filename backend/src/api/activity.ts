/**
 * Agent activity feed (R14). The MVP has NO chatbot — agent actions appear as plain entries the app
 * shows under Home "Agent activity" and Account "Recent activity". This is a read surface for the
 * frontend plus an internal append the agent calls when it acts; it performs no chain writes.
 */

import type { Currency } from '@sorosense/vault-client';

export type ActivityKind = 'allocated' | 'compounded' | 'rebalanced' | 'froze' | 'proposed-exit';

export interface ActivityEntry {
  id: number;
  currency: Currency;
  kind: ActivityKind;
  /** Plain-language detail, e.g. "USD -> DeFindex USDC". No risk label. */
  detail: string;
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

  /** The agent records an action it took. Returns the stored entry. */
  append(entry: Omit<ActivityEntry, 'id'>): ActivityEntry {
    const stored: ActivityEntry = { ...entry, id: ++this.seq };
    this.entries.push(stored);
    return stored;
  }

  /** Most-recent-first list, optionally filtered to one currency bucket. */
  list(currency?: Currency, limit = 50): ActivityEntry[] {
    const filtered = currency ? this.entries.filter((e) => e.currency === currency) : this.entries;
    return [...filtered].reverse().slice(0, limit);
  }
}
