/**
 * User-action history derivation (STE-42). The agent feed (`activity.ts`) records only what the agent
 * did; this module derives what the *user* did — deposit / withdraw / sign-mandate / approve-exit — so
 * the frontend Activity "Yours" filter has a real backend source instead of a hand-written fixture.
 *
 * User actions come from on-chain transactions, not agent appends, so they are reconstructed from an
 * injected `UserActionEvent` stream — pure and deterministic over an event list, exactly like
 * `backend/src/earnings/cost-basis.ts`. The real event reader is deferred to integration (U20); this
 * takes the events as input. A read surface: no chain writes, no risk/label/score field.
 */

import type { Address, Amount, Currency } from '@sorosense/vault-client';

/** The user actions surfaced under "Yours". `sign-mandate` is the one-time consent (KTD3, no tier). */
export type UserActionKind = 'deposit' | 'withdraw' | 'sign-mandate' | 'approve-exit';

/**
 * One decoded user action. `seq` is a monotonic ordering key so input array order does not matter.
 * `sign-mandate` is per-depositor and global (consent is not per-currency); `approve-exit` is
 * per-currency but carries no amount — the model reflects that rather than forcing empty fields.
 */
export type UserActionEvent =
  | { kind: 'deposit'; depositor: Address; currency: Currency; amount: Amount; seq: number; ts?: number }
  | { kind: 'withdraw'; depositor: Address; currency: Currency; amount: Amount; seq: number; ts?: number }
  | { kind: 'sign-mandate'; depositor: Address; seq: number; ts?: number }
  | { kind: 'approve-exit'; depositor: Address; currency: Currency; seq: number; ts?: number };

/**
 * A derived user-activity row. Shaped to merge cleanly with the agent feed in `getActivity` (U3):
 * carries `actor: 'you'` and the same plain-language `detail` convention as `ActivityEntry`.
 * `currency` is absent for `sign-mandate` (global consent).
 */
export interface UserActivityEntry {
  depositor: Address;
  currency?: Currency;
  kind: UserActionKind;
  /** Plain-language detail. No risk label, tier, or score. */
  detail: string;
  seq: number;
  ts?: number;
  actor: 'you';
}

/** Plain-language, risk-word-free detail for one user action. */
function detailFor(ev: UserActionEvent): string {
  switch (ev.kind) {
    case 'deposit':
      return `Deposited to ${ev.currency} bucket`;
    case 'withdraw':
      return `Withdrew from ${ev.currency} bucket`;
    case 'sign-mandate':
      return 'Signed auto-optimize mandate';
    case 'approve-exit':
      return `Approved a safe exit for ${ev.currency}`;
  }
}

/**
 * Derive the user's activity rows from an event stream. Events are processed in `seq`-ascending order
 * over a sorted copy, so the caller may pass them in any order; the original array is not mutated. One
 * event maps to exactly one row. Pure: no I/O, no chain writes.
 */
export function deriveUserActivity(events: readonly UserActionEvent[]): UserActivityEntry[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  return ordered.map((ev) => {
    const base = {
      depositor: ev.depositor,
      kind: ev.kind,
      detail: detailFor(ev),
      seq: ev.seq,
      ts: ev.ts,
      actor: 'you' as const,
    };
    // `sign-mandate` has no currency; the others do.
    return ev.kind === 'sign-mandate' ? base : { ...base, currency: ev.currency };
  });
}
