/**
 * On-chain event reader (STE-21 Fase C, U1). Decodes the vault's Soroban events into the two pure
 * derivation shapes the backend already has — `VaultEvent` (cost-basis / earnings) and
 * `UserActionEvent` (activity "Yours") — so those surfaces read from chain instead of injected
 * fixtures. It does NOT depend on the generated binding event types: events are read from XDR, decoded
 * by topic symbol + data (KTD1).
 *
 * Injectable by design. The reader takes an {@link EventSource} — the real one wraps
 * `rpc.Server.getEvents` filtered to the vault contract (see {@link makeRpcEventSource}); tests inject
 * a fake returning canned pages, so the decode logic is exercised object-real with no network. The
 * pure derivations (`reconstructCostBasis`, `deriveUserActivity`) are untouched.
 *
 * Read-only: this module never writes on-chain and never emits a risk/label/score field. Determinism:
 * results are ordered by ledger sequence and each carries a monotonic `seq` derived from that order.
 */

import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Address, Currency } from '@sorosense/vault-client';
import type { VaultEvent } from '../earnings/cost-basis.js';
import type { UserActionEvent } from '../api/user-activity.js';

/**
 * One raw contract event, mirroring `stellar-sdk`'s parsed `rpc.Api.EventResponse`: `topic` is the
 * already-decoded topic vector (`ScVal[]`, first entry the event-name symbol, the rest indexed
 * fields) and `value` is the event data `ScVal` (a map of the non-topic fields). `id` is the RPC's
 * unique paging token (used to de-dupe across pages); `ledger` orders events.
 */
export interface RawEvent {
  id: string;
  ledger: number;
  ledgerClosedAt?: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
}

/** One page of raw events plus the RPC's latest-ledger watermark and the next-page cursor. */
export interface EventPage {
  events: RawEvent[];
  latestLedger: number;
  cursor?: string;
}

/**
 * The injected event source. `getEvents(cursor?)` returns the next page: with no cursor it starts from
 * the source's configured beginning; with a cursor it continues. Tests supply canned pages; the real
 * impl wraps `rpc.Server.getEvents` (see {@link makeRpcEventSource}).
 */
export interface EventSource {
  getEvents(cursor?: string): Promise<EventPage>;
}

/** Both decoded streams over one ledger-ordered event set. The shape the poller hands to the holder. */
export interface DecodedEvents {
  /** Deposit/withdraw rows for cost-basis reconstruction, seq-ordered. */
  vaultEvents: VaultEvent[];
  /** Deposit/withdraw/sign-mandate/auto-compound rows for activity, seq-ordered. */
  userEvents: UserActionEvent[];
}

/** The reader's output: both decoded streams, plus the paging watermarks for a follow-up poll. */
export interface DecodedVaultEvents extends DecodedEvents {
  /** RPC latest-ledger watermark from the final page. */
  latestLedger: number;
  /** Cursor after the last drained page — a follow-up poll resumes here. */
  cursor?: string;
}

/**
 * The vault's on-chain event-name symbols (topic[0]). SDK-26 `#[contractevent]` publishes the struct
 * name in snake_case as the first topic (e.g. `AutoCompoundSet` → `auto_compound_set`), verified by
 * the contract's own event tests. Everything else is ignored.
 */
const TOPIC = {
  deposit: 'deposit',
  withdraw: 'withdraw',
  consentSet: 'consent_set',
  autoCompoundSet: 'auto_compound_set',
  exitApproved: 'exit_approved',
} as const;

/** Safety cap so a misbehaving source (always returning a cursor) can't loop forever. */
const MAX_PAGES = 1000;

/**
 * Drain every page from the source, de-dupe by event `id`, order by ledger, and decode each event
 * into the `VaultEvent` and/or `UserActionEvent` it maps to. `seq` is assigned from the ledger-ordered
 * position (0-based), giving the pure derivations a monotonic key even when several events share a
 * ledger. Unknown topics are ignored, never mis-decoded.
 */
export async function readVaultEvents(source: EventSource): Promise<DecodedVaultEvents> {
  const seen = new Set<string>();
  const raw: RawEvent[] = [];
  let cursor: string | undefined;
  let latestLedger = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await source.getEvents(cursor);
    latestLedger = result.latestLedger;

    for (const ev of result.events) {
      if (seen.has(ev.id)) continue; // idempotent across overlapping pages
      seen.add(ev.id);
      raw.push(ev);
    }

    // Stop when the source signals no further progress: no next cursor, an empty page, or a cursor
    // that did not advance. (A real poll would resume later from `cursor`.)
    if (!result.cursor || result.cursor === cursor || result.events.length === 0) {
      cursor = result.cursor ?? cursor;
      break;
    }
    cursor = result.cursor;
  }

  // Stable sort by ledger so events keep their within-ledger arrival order; then decode.
  const ordered = [...raw].sort((a, b) => a.ledger - b.ledger);

  return { ...decodeEvents(ordered), latestLedger, cursor };
}

/**
 * Decode a ledger-ordered event set into the two derivation streams. Pure: same input, same output —
 * no network, no clock. `seq` is the 0-based position in `ordered`, so it is monotonic across the
 * WHOLE set, not per page. That is why the poller re-decodes its accumulated store on every tick
 * rather than decoding each page and concatenating: a per-page seq would restart at 0 each poll and
 * scramble the feed's ordering.
 *
 * Precondition: `ordered` is ledger-ascending (the poller's store guarantees it via
 * `EventStore.raw()`; `readVaultEvents` sorts before calling). Unknown topics are ignored, never
 * mis-decoded.
 */
export function decodeEvents(ordered: readonly RawEvent[]): DecodedEvents {
  const vaultEvents: VaultEvent[] = [];
  const userEvents: UserActionEvent[] = [];

  ordered.forEach((ev, index) => {
    const decoded = decodeEvent(ev, index);
    if (decoded.vault) vaultEvents.push(decoded.vault);
    if (decoded.user) userEvents.push(decoded.user);
  });

  return { vaultEvents, userEvents };
}

/** Decode one raw event into the row(s) it maps to. Returns `{}` for unknown/unattributable events. */
function decodeEvent(ev: RawEvent, seq: number): { vault?: VaultEvent; user?: UserActionEvent } {
  const name = topicSymbol(ev.topic);
  if (name === undefined) return {};

  const ts = parseTs(ev.ledgerClosedAt);

  switch (name) {
    case TOPIC.deposit:
    case TOPIC.withdraw: {
      const depositor = topicAddress(ev.topic, 1);
      const data = dataMap(ev.value);
      const currency = toCurrency(data.currency);
      const amount = toBigint(data.amount);
      const shares = toBigint(data.shares);
      if (depositor === undefined || currency === undefined || amount === undefined || shares === undefined) {
        return {};
      }
      const kind = name === TOPIC.deposit ? 'deposit' : 'withdraw';
      return {
        vault: { kind, depositor, currency, amount, shares, seq, ts },
        user: { kind, depositor, currency, amount, seq, ts },
      };
    }

    case TOPIC.consentSet: {
      // `ConsentSet` → the one-time "Signed auto-optimize mandate" row. Depositor is the only field.
      const depositor = topicAddress(ev.topic, 1);
      if (depositor === undefined) return {};
      return { user: { kind: 'sign-mandate', depositor, seq, ts } };
    }

    case TOPIC.autoCompoundSet: {
      // `AutoCompoundSet` → the reinvest-toggle row. `enabled` rides in the data map.
      const depositor = topicAddress(ev.topic, 1);
      const enabled = dataMap(ev.value).enabled;
      if (depositor === undefined || typeof enabled !== 'boolean') return {};
      return { user: { kind: 'auto-compound', depositor, enabled, seq, ts } };
    }

    case TOPIC.exitApproved:
      // Recognized but not surfaced: the on-chain `ExitApproved` event carries only `{ currency
      // (topic), id (data) }` — no depositor — so it can't be attributed to a "Yours" row from the
      // event XDR alone. Correlating the exit `id` back to its approver is deferred; recognizing the
      // topic here keeps it from being mistaken for an unknown event.
      return {};

    default:
      return {};
  }
}

/** The event-name symbol at topic[0], or `undefined` if absent / not a symbol. */
function topicSymbol(topic: xdr.ScVal[]): string | undefined {
  const first = topic[0];
  if (first === undefined) return undefined;
  const native = scValToNative(first);
  return typeof native === 'string' ? native : undefined;
}

/** Decode the topic at `index` as an Address (seam `Address` is the string form). */
function topicAddress(topic: xdr.ScVal[], index: number): Address | undefined {
  const scv = topic[index];
  if (scv === undefined) return undefined;
  const native = scValToNative(scv);
  return typeof native === 'string' ? (native as Address) : undefined;
}

/** Decode the event data value as a keyed record. A non-map value yields an empty record. */
function dataMap(value: xdr.ScVal): Record<string, unknown> {
  const native = scValToNative(value);
  return native !== null && typeof native === 'object' && !Array.isArray(native)
    ? (native as Record<string, unknown>)
    : {};
}

/**
 * Map a decoded contract `Currency` to the seam string. A Soroban unit enum decodes via
 * `scValToNative` to a single-element array of the variant symbol (e.g. `['Usd']`); we also accept the
 * bare symbol for resilience. Unknown → `undefined`.
 */
function toCurrency(raw: unknown): Currency | undefined {
  const variant = Array.isArray(raw) ? raw[0] : raw;
  switch (variant) {
    case 'Usd':
      return 'USD';
    case 'Eur':
      return 'EUR';
    case 'Mxn':
      return 'MXN';
    default:
      return undefined;
  }
}

/** An i128 decodes to a `bigint`; anything else (incl. a number) is normalized or rejected. */
function toBigint(raw: unknown): bigint | undefined {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'number' && Number.isInteger(raw)) return BigInt(raw);
  return undefined;
}

/** Parse the ledger close time (RFC 3339) to epoch ms; `undefined`/invalid → `undefined`. */
function parseTs(closedAt: string | undefined): number | undefined {
  if (closedAt === undefined) return undefined;
  const ms = Date.parse(closedAt);
  return Number.isNaN(ms) ? undefined : ms;
}

// ── Real event source (untested in CI — thin wrapper over the RPC) ──────────────────────────────

/** Config for the live source: which RPC, which contract, and where to begin the first page. */
export interface RpcEventSourceOptions {
  rpcUrl: string;
  contractId: string;
  /** First ledger to read from when no cursor is supplied. */
  startLedger: number;
  /** Max events per page (RPC default applies when omitted). */
  limit?: number;
}

/**
 * The production {@link EventSource}: a thin wrapper over `rpc.Server.getEvents` filtered to the vault
 * contract. Deferred wiring into `server.ts` is a follow-up (KTD1); this only constructs the source.
 * Not exercised in CI — the offline suite uses a fake source — so it stays deliberately small.
 */
export function makeRpcEventSource(options: RpcEventSourceOptions): EventSource {
  const server = new rpc.Server(options.rpcUrl);
  const filters = [{ type: 'contract' as const, contractIds: [options.contractId] }];

  return {
    async getEvents(cursor?: string): Promise<EventPage> {
      const request = cursor
        ? { filters, cursor, ...(options.limit ? { limit: options.limit } : {}) }
        : { filters, startLedger: options.startLedger, ...(options.limit ? { limit: options.limit } : {}) };
      const response = await server.getEvents(request);
      return {
        events: response.events.map((e) => ({
          id: e.id,
          ledger: e.ledger,
          ledgerClosedAt: e.ledgerClosedAt,
          topic: e.topic,
          value: e.value,
        })),
        latestLedger: response.latestLedger,
        cursor: response.cursor,
      };
    },
  };
}
