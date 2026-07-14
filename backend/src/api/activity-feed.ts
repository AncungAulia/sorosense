/**
 * The composed Activity feed (STE-42). One read that merges the agent feed (`ActivityLog`, actor
 * 'agent') with the user's own actions (`deriveUserActivity`, actor 'you') into a single deterministic
 * list, filterable to the frontend's All / Yours / Automated tabs. Backend is the source of truth so
 * the "Yours" filter stops depending on a frontend fixture.
 *
 * Read-only: no chain writes. Deterministic: ordered by a monotonic `seq`, never wall clock. No
 * risk/label/score field. Both sources are injected (`deps`), so the real event reader stays deferred
 * to integration (U20).
 */

import type { Address, Currency } from '@sorosense/vault-client';
import { type ActivityKind, type ActivityLog, type Actor } from './activity.js';
import { deriveUserActivity, type UserActionEvent, type UserActionKind } from './user-activity.js';
import { deriveAgentActivity, type AgentActionEvent } from './agent-activity.js';

/** Injected sources: the agent log, the user-action event stream, and the agent-action event stream. */
export interface ActivityFeedDeps {
  log: ActivityLog;
  userEvents: readonly UserActionEvent[];
  /** Keeper actions decoded from chain (allocate/freeze/…) → 'agent' rows. Empty in mock/offline. */
  agentEvents?: readonly AgentActionEvent[];
}

/**
 * Feed query. `actor` maps to the UI tabs: unset = All, `'you'` = Yours, `'agent'` = Automated.
 * `depositor` narrows the *user* rows (agent rows are pool-level and always shown, subject to `actor`).
 * `currency` scopes to one bucket; consent rows (no currency) drop out when it is set.
 */
export interface ActivityQuery {
  depositor?: Address;
  actor?: Actor;
  currency?: Currency;
  limit?: number;
}

/** A merged feed row from either source. `depositor` is present only on user rows. */
export interface FeedEntry {
  seq: number;
  actor: Actor;
  currency?: Currency;
  kind: ActivityKind | UserActionKind;
  detail: string;
  ts?: number;
  depositor?: Address;
}

/** Stable tie-break for equal `seq` so the total order is deterministic regardless of source. */
function compareRows(a: FeedEntry, b: FeedEntry): number {
  if (a.seq !== b.seq) return b.seq - a.seq; // most-recent (higher seq) first
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
}

/**
 * Compose the feed. Agent rows come from `log.list(currency)` (already actor 'agent', bucket-filtered);
 * user rows are derived from the injected events, narrowed to `depositor` and `currency` when given.
 * The two are merged, ordered most-recent-first, filtered by `actor`, and capped by `limit`.
 *
 * Note (KTD4): agent `id` and user `seq` are treated as one monotonic space. If they diverge at real
 * integration, unifying the sequence is U20 work; the read shape does not change.
 */
export function getActivity(query: ActivityQuery, deps: ActivityFeedDeps): FeedEntry[] {
  const { depositor, actor, currency, limit = 50 } = query;

  const agentRows: FeedEntry[] = deps.log.list(currency).map((e) => ({
    seq: e.id,
    actor: e.actor,
    currency: e.currency,
    kind: e.kind,
    detail: e.detail,
    ts: e.ts,
  }));

  // Chain-decoded keeper actions (real mode). Empty offline, where the in-memory `log` carries them.
  const chainAgentRows: FeedEntry[] = deriveAgentActivity(deps.agentEvents ?? [])
    .filter((r) => currency === undefined || r.currency === undefined || r.currency === currency)
    .map((r) => ({ seq: r.seq, actor: r.actor, currency: r.currency, kind: r.kind, detail: r.detail, ts: r.ts }));

  const userRows: FeedEntry[] = deriveUserActivity(deps.userEvents)
    .filter((r) => (depositor === undefined || r.depositor === depositor))
    .filter((r) => (currency === undefined || r.currency === currency))
    .map((r) => ({
      seq: r.seq,
      actor: r.actor,
      currency: r.currency,
      kind: r.kind,
      detail: r.detail,
      ts: r.ts,
      depositor: r.depositor,
    }));

  const merged = [...agentRows, ...chainAgentRows, ...userRows]
    .filter((r) => (actor === undefined || r.actor === actor))
    .sort(compareRows);

  return merged.slice(0, limit);
}
