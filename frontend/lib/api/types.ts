/**
 * Wire shapes of the backend HTTP surface, **re-declared** — never imported (STE-52b).
 *
 * The frontend is not a workspace dependent of `backend` and must not become one: the composed reads
 * live behind HTTP, and the only shared type package is the vault seam (`@sorosense/vault-client`,
 * which `Currency` comes from — re-declaring *that* would fork the seam).
 *
 * Each type below names the backend file it mirrors. `http.contract.test.ts` boots the real mock-mode
 * server and decodes these shapes off it, so the two cannot silently drift.
 *
 * **bigint boundary.** The backend serializes every `bigint` as a decimal **string** (one shared
 * replacer in `backend/src/http/app.ts`). The fields are typed `string` here and decoded with
 * `toBigInt()` at the edge (`client.ts`); the frontend's own bigint convention (`lib/vault/units.ts`)
 * is untouched and the string never leaks inward.
 *
 * No `risk` / `label` / `score` / `tier` field appears on any shape — safety is invisible, and the
 * backend reads carry none to begin with.
 */

import type { Currency } from "@sorosense/vault-client";

export type { Currency };

/** `GET /health` — mirrors `backend/src/http/app.ts`. */
export interface HealthResponse {
  status: "ok";
}

/**
 * One funded currency bucket — mirrors `Holding` in `backend/src/api/holdings.ts`.
 * `shares` / `value` are the vault's `bigint` base units, on the wire as decimal strings.
 */
export interface Holding {
  currency: Currency;
  /** Venue full name, e.g. "DeFindex USDC vault". */
  name: string;
  /** Provider, e.g. "DeFindex". */
  venue: string;
  kind: "lending" | "vault" | "rwa";
  /** `[venue, kindLabel]` — the bucket's display tags. */
  tags: string[];
  apy: number;
  /** bigint as decimal string — decode with `toBigInt`. */
  shares: string;
  /** bigint as decimal string — native base-unit value of the bucket. */
  value: string;
  /** Display-only USD conversion of `value` (never a fund conversion). */
  valueUsd: number;
  /** Whether the active pool is paused (Sentinel freeze). */
  frozen: boolean;
}

/** `GET /holdings?depositor=…` — funded buckets only (zero-share buckets are omitted). */
export type HoldingsResponse = Holding[];

/**
 * Who took the action — mirrors `Actor` in `backend/src/api/activity.ts`. Drives the feed's
 * All / Yours / Automated tabs; it is not a risk signal.
 */
export type Actor = "you" | "agent";

/**
 * What happened — the union of the agent's `ActivityKind` (`backend/src/api/activity.ts`) and the
 * user's `UserActionKind` (`backend/src/api/user-activity.ts`), which the backend merges into one feed.
 */
export type FeedKind =
  | "allocated"
  | "compounded"
  | "rebalanced"
  | "froze"
  | "proposed-exit"
  | "deposit"
  | "withdraw"
  | "sign-mandate"
  | "approve-exit"
  | "auto-compound";

/**
 * One merged feed row — mirrors `FeedEntry` in `backend/src/api/activity-feed.ts`.
 *
 * `seq` is the backend's monotonic ordering key (rows arrive most-recent-first); it is the row's
 * identity, not a timestamp. `ts` is optional because the agent log does not require one, so the
 * relative "3h ago" a row renders may be absent — a row without a time is still a real row.
 * `depositor` appears only on user rows (agent rows are pool-level).
 */
export interface FeedEntry {
  seq: number;
  actor: Actor;
  currency?: Currency;
  kind: FeedKind;
  detail: string;
  ts?: number;
  depositor?: string;
}

/** `GET /activity?depositor=&actor=&currency=&limit=` — the merged feed, most-recent-first. */
export type ActivityResponse = FeedEntry[];

/**
 * One point on the value/earned timeline — mirrors `ChartPoint` in `backend/src/api/earnings.ts`.
 *
 * Both figures come from ONE replay of the user's cost basis at `ts`, so they are always consistent
 * with each other:
 *  - `valueUsd` is a **step function**: it steps on every real deposit and withdrawal and is flat in
 *    between. That is a real chart of real money — it just does not curve, because nothing curves.
 *  - `earnedUsd` is cumulative yield. The vault does not accrue on-chain yet (`share_price` reads
 *    exactly `SHARE_PRICE_SCALE`), so in real mode it is honestly **0** at every point. A growth chart
 *    that is flat at zero is the correct rendering of that fact, not a broken chart.
 *
 * The offline fixture (`lib/earnings/fixtures.ts`) emits this same shape, so one chart component feeds
 * from both modes.
 */
export interface ChartPoint {
  ts: number;
  /** Blended-USD asset value at `ts`. Steps on each deposit/withdrawal; never a fabricated curve. */
  valueUsd: number;
  /** Cumulative earned (USD) at `ts`. Zero in real mode until NAV accrual ships — honestly flat. */
  earnedUsd: number;
}

/** Earned during one calendar month (UTC) — mirrors `MonthlyEarned` in `backend/src/api/earnings.ts`. */
export interface MonthlyEarned {
  /** `YYYY-MM`. */
  label: string;
  earnedUsd: number;
}

/**
 * Per-bucket drill-down — mirrors `BucketBreakdown` in `backend/src/api/earnings.ts`.
 * `nativeValue` is the vault's `bigint` base units, on the wire as a decimal string.
 */
export interface EarningsBucket {
  currency: Currency;
  /** bigint as decimal string — decode with `toBigInt`. */
  nativeValue: string;
  /** Display-only USD conversion of `nativeValue` (never a fund conversion). */
  usdValue: number;
  /** This bucket's native yield blended to USD. FX movement is never earnings. */
  earnedUsd: number;
}

/**
 * `GET /earnings?depositor=…` — mirrors `EarningsView` in `backend/src/api/earnings.ts`.
 *
 * The backend already blends to USD with the live oracle and reconstructs cost basis from chain
 * events, so in real mode this response **is** the Earn screen: the frontend re-derives none of it
 * (`lib/vault/contributions.ts`, a browser-memory ledger that does not survive a reload, is not
 * consulted at all).
 */
export interface EarningsResponse {
  /** Whether any bucket holds value — drives the 2-state Earn screen. */
  hasDeposit: boolean;
  balanceUsd: number;
  /** Value-weighted blended APY across the funded buckets. */
  apy: number;
  /** Total earned to date, blended to USD. Sums the buckets' `earnedUsd`. */
  earnedUsd: number;
  buckets: EarningsBucket[];
  chart: ChartPoint[];
  /** Oldest→newest; the last entry is the current month. */
  monthly: MonthlyEarned[];
}

/**
 * The rate card for one currency bucket — mirrors `Rate` in `backend/src/api/rates.ts`.
 *
 * It answers what a `/holdings` row cannot: `getHoldings` omits a zero-share bucket by design, so an
 * **unfunded** bucket (the Earn empty-state hero, the simulator) has no row and still has to quote a
 * rate. The fields are the funded row's, minus the per-user ones — so a funded row and a rate card can
 * feed the same component. No risk/label/score field.
 */
export interface Rate {
  currency: Currency;
  /** Venue full name, e.g. "DeFindex USDC vault". */
  name: string;
  /** Provider, e.g. "DeFindex". */
  venue: string;
  kind: "lending" | "vault" | "rwa";
  /** `[venue, kindLabel]` — the same display tags a funded bucket carries. */
  tags: string[];
  /** The best safe venue's APY — what the agent would allocate this bucket to today. */
  apy: number;
}

/** `GET /rates` — one card per currency, user-independent (no depositor). */
export type RatesResponse = Rate[];

/**
 * One vetted pool — mirrors `Pool` in `backend/src/api/pools.ts`. The exit-approval sheet's target:
 * when the Sentinel freezes a pool it proposes a safe one, and the sheet names and rates it before the
 * user signs. An unknown id is a 404, never a 200 carrying `null`.
 */
export interface Pool {
  /** The seam's `PoolId` slug, e.g. "blend-eurc". */
  id: string;
  /** Venue full name, e.g. "Blend EURC". */
  name: string;
  /** Provider, e.g. "Blend". */
  venue: string;
  apy: number;
}

/** A fundable stablecoin — mirrors `Stablecoin` in `backend/src/api/funding.ts`. */
export interface Stablecoin {
  sym: "USDC" | "EURC" | "CETES";
  currency: Currency;
  chains: string[];
}

/** A fundable RWA option. Deliberately carries **no** `apy` — the rate shows at the deposit step. */
export interface RwaOption {
  id: string;
  name: string;
  venue: string;
  currency: Currency;
}

/** `GET /funding` — mirrors `FundingOptions` in `backend/src/api/funding.ts`. */
export interface FundingOptions {
  stablecoins: Stablecoin[];
  rwa: RwaOption[];
}

/**
 * The backend's shaped error body: `{ error: { code, message } }` from the read routes
 * (`jsonErr`/`badRequest` in `backend/src/http/app.ts`) and `{ error: { message } }` from the faucet
 * (`backend/src/http/faucet.ts`), whose `code` is absent.
 */
export interface ApiErrorBody {
  error: {
    code?: string;
    message: string;
  };
}

/** `POST /faucet` success — carries only the public tx hash, never the issuer secret (backend-only). */
export interface FaucetSuccess {
  ok: true;
  hash: string;
  currency: "USD" | "EUR";
  /** bigint as decimal string — base units minted. */
  amount: string;
}

/**
 * `POST /faucet` 409 — the recipient has no trustline for the SAC yet. Recoverable in the UI: the user
 * signs a `changeTrust` in their wallet, then the mint retries (U4). Reached through the error arm's
 * `body`, since 409 is not a success.
 */
export interface FaucetNeedsChangeTrust {
  needsChangeTrust: true;
  currency: "USD" | "EUR";
  /** SAC contract id to add the trustline for. */
  sac: string;
  message: string;
}

/** Type guard for the faucet's 409 body, off an error arm's undecoded `body`. */
export function isFaucetNeedsChangeTrust(body: unknown): body is FaucetNeedsChangeTrust {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Partial<FaucetNeedsChangeTrust>;
  return candidate.needsChangeTrust === true && typeof candidate.sac === "string";
}
