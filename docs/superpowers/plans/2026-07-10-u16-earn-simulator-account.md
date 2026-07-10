# U16 — Earn simulator + Account UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun tab Earn dua state (empty: simulator deterministik + currency selector; funded: "Total earned" + Growth chart + breakdown per-bulan) dan tab Account yang ramping, tanpa satu pun label risiko.

**Architecture:** Frontend tak bisa memanggil backend (belum ada HTTP API), jadi `simulate()` dan `getEarnings()` **dicerminkan** di `frontend/lib/`. `useEarnings()` mengembalikan objek berbentuk `EarningsView` milik backend; di dalamnya headline dihitung hidup dari vault seam sementara `chart`/`monthly` berasal dari fixture yang diskalakan ke `earnedUsd` hidup. Ketika HTTP API mendarat, yang diganti hanya isi hook — komponen tak berubah.

**Tech Stack:** Next 16 (App Router) · React 19 · Tailwind v4 · TypeScript strict (`noUncheckedIndexedAccess`) · Vitest + Testing Library + jsdom · `@sorosense/vault-client` (MockVaultClient) · `@creit.tech/stellar-wallets-kit`

**Spec:** `docs/superpowers/specs/2026-07-10-u16-earn-simulator-account-design.md`
**Linear:** STE-26 (parent STE-7)

## Global Constraints

- **R11 — safety is invisible.** Nol label/tier/score risiko. String `Safe`, `Watch`, `risk`, `score` tak boleh muncul pada surface mana pun. Diuji dengan assertion eksplisit di Task 9.
- **User memilih currency, agent memilih pool.** Tak ada pool selector. `simulate()` versi frontend tidak mengembalikan `poolId`.
- **Tak ada chatbot.** Simulator adalah matematika deterministik, bukan LLM.
- **Buckets per-currency, tak pernah dikonversi.** Proyeksi simulator dinyatakan dalam currency bucket. Blended-USD hanya untuk tampilan.
- **Read-only.** Satu-satunya tombol yang menulis adalah `Deposit` / `Move to wallet`, yang merutekan balik ke flow U14/U15 yang sudah ada. Tak ada surface baru yang menandatangani apa pun.
- **Semua kode wallet client-only.** `"use client"` + `useEffect`, tak pernah di module scope (KTD7). `Date.now()` hanya dipanggil setelah mount.
- **Typecheck adalah hard gate.** `pnpm -r typecheck` dan `pnpm -r test` keduanya wajib hijau. Tes lulus tidak berarti typecheck lulus. `noUncheckedIndexedAccess` aktif: `arr[i]` bertipe `T | undefined`.
- **Semua perintah dijalankan dari root repo.** `pnpm -C frontend test <path>`, bukan `npm` di dalam package.
- **Divergensi dari mock-2 yang disengaja** (jangan "diperbaiki" balik): klausa `· since July 2026` dipotong, dan auto-reinvest adalah baris status read-only, bukan switch.

## File Structure

**Dibuat:**

| File | Tanggung jawab |
| --- | --- |
| `frontend/lib/earn/simulate.ts` | Cermin `backend/src/api/simulate.ts`: `simulate()`, `simulateCurve()`, `PERIOD_DAYS` |
| `frontend/lib/earnings/fixtures.ts` | `buildEarningsFixture(now)` → `chart` + `monthly` ternormalisasi (0…1) |
| `frontend/hooks/useEarnings.ts` | Seam data Earn; mengembalikan `EarningsView` |
| `frontend/hooks/useConsent.ts` | `hasConsent()` fail-closed |
| `frontend/components/earn/Bars.tsx` | `<Bars values={number[]} />`, dipakai simulator + Growth |
| `frontend/components/earn/MonthlyBreakdown.tsx` | 3 baris + "Load more" (+3), formatting label bulan |
| `frontend/components/earn/GrowthCard.tsx` | `windowBars()` + period segmented + breakdown |
| `frontend/components/simulator/Simulator.tsx` | Currency selector, amount stepper, proyeksi, bars, period |
| `frontend/components/account/Identicon.tsx` | `identiconCells()` + SVG 5×5 simetris |
| `frontend/components/account/LogoutSheet.tsx` | BottomSheet konfirmasi log out |

**Dimodifikasi:**

| File | Perubahan |
| --- | --- |
| `frontend/app/(app)/earn/page.tsx` | Bercabang di `view.hasDeposit`; empty → Simulator, funded → hero + GrowthCard |
| `frontend/app/(app)/account/page.tsx` | Dari stub `<h1>Account</h1>` jadi halaman penuh |
| `frontend/lib/wallet.ts` | `connect()` mengembalikan `{ address, name }`; tambah `getWalletName()` |
| `frontend/providers/WalletProvider.tsx` | Simpan + persist `walletName` |
| `frontend/lib/__tests__/wallet.test.ts` | Menyesuaikan bentuk return `connect()` |
| `frontend/providers/__tests__/WalletProvider.test.tsx` | Menyesuaikan mock `connect()` |

**Catatan tipe — superset yang disengaja.** `BucketBreakdown` milik backend hanya `{ currency, nativeValue, usdValue }`. Hero `BucketToggle` butuh earned per-bucket, yang backend belum ekspos meski bisa menurunkannya. Cermin frontend menambahkan `earnedUsd` pada `BucketBreakdown`. Ini superset, bukan kontradiksi: setiap field backend tetap ada dengan tipe yang sama. Saat HTTP API mendarat, backend menambahkan field yang sama atau frontend menurunkannya di dalam hook — dua-duanya tak menyentuh komponen.

---

### Task 1: `lib/earn/simulate.ts` — cermin simulator deterministik

**Files:**
- Create: `frontend/lib/earn/simulate.ts`
- Test: `frontend/lib/earn/__tests__/simulate.test.ts`

**Interfaces:**
- Consumes: `getBucketMeta(currency)` dari `frontend/lib/vault/data.ts` (mengembalikan `{ currency, name, venue, tags, apy }`); `Currency` dari `@sorosense/vault-client`.
- Produces: `PERIOD_DAYS`, `PeriodName`, `SimulateInput`, `SimulateResult`, `simulate()`, `simulateCurve()`, `growthFactor()`.

- [ ] **Step 1: Write the failing test**

Buat `frontend/lib/earn/__tests__/simulate.test.ts`:

```ts
import { PERIOD_DAYS, simulate, simulateCurve } from "../simulate";

test("projects one year of USD at the bucket APY, matching backend simulate()", () => {
  // getBucketMeta("USD").apy === 8.59 → 1000 * ((1.0859)^1 − 1) = 85.90
  const r = simulate({ currency: "USD", amount: 1000, periodDays: PERIOD_DAYS.year });
  expect(r.apy).toBe(8.59);
  expect(r.projectedEarnings).toBe(85.9);
  expect(r.currency).toBe("USD");
  expect(r.periodDays).toBe(365);
});

test("exposes no poolId — the user picks a currency, the agent picks the pool", () => {
  expect(simulate({ currency: "EUR", amount: 1000, periodDays: 30 })).not.toHaveProperty("poolId");
});

test("a zero-day horizon earns nothing", () => {
  expect(simulate({ currency: "MXN", amount: 5000, periodDays: 0 }).projectedEarnings).toBe(0);
});

test("negative input throws, like the backend", () => {
  expect(() => simulate({ currency: "USD", amount: -1, periodDays: 30 })).toThrow(/non-negative/);
  expect(() => simulate({ currency: "USD", amount: 1, periodDays: -30 })).toThrow(/non-negative/);
});

test("the curve rises monotonically and ends at the projected earnings", () => {
  const curve = simulateCurve({ currency: "USD", amount: 1000, periodDays: 365 });
  expect(curve).toHaveLength(20);
  for (let i = 1; i < curve.length; i++) expect(curve[i]!).toBeGreaterThan(curve[i - 1]!);
  expect(curve[19]!).toBeCloseTo(85.9, 2);
});

test("PERIOD_DAYS mirrors the backend table", () => {
  expect(PERIOD_DAYS).toEqual({ day: 1, week: 7, month: 30, year: 365 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test lib/earn/__tests__/simulate.test.ts`
Expected: FAIL — `Failed to resolve import "../simulate"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/lib/earn/simulate.ts`:

```ts
/**
 * Deterministic earnings simulator (R15) — mirrors `backend/src/api/simulate.ts`. The frontend cannot
 * call the backend (no HTTP API yet), so the math lives here too. It is math, not an LLM.
 *
 * No `poolId` is returned: the user picks a CURRENCY, the agent picks the pool. Nothing here carries
 * a risk label, tier, or score (R11).
 */
import type { Currency } from "@sorosense/vault-client";
import { getBucketMeta } from "../vault/data";

/** Named periods → days. Mirrors `PERIOD_DAYS` in the backend. */
export const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;
export type PeriodName = keyof typeof PERIOD_DAYS;

const DAYS_PER_YEAR = 365;

export interface SimulateInput {
  currency: Currency;
  /** Principal in the bucket's currency (major units) — never converted to USD. */
  amount: number;
  periodDays: number;
}

export interface SimulateResult {
  currency: Currency;
  amount: number;
  periodDays: number;
  apy: number;
  /** Projected auto-compounded earnings over the period, in the bucket's currency. */
  projectedEarnings: number;
}

/** Continuous compound growth over `days`, as a fraction of principal. */
export function growthFactor(apy: number, days: number): number {
  return (1 + apy / 100) ** (days / DAYS_PER_YEAR) - 1;
}

export function simulate(input: SimulateInput): SimulateResult {
  if (input.amount < 0 || input.periodDays < 0) {
    throw new Error("amount and periodDays must be non-negative");
  }
  const { apy } = getBucketMeta(input.currency);
  const projectedEarnings = Number((input.amount * growthFactor(apy, input.periodDays)).toFixed(2));
  return { currency: input.currency, amount: input.amount, periodDays: input.periodDays, apy, projectedEarnings };
}

/**
 * `n` samples of the same growth curve, for the simulator's bars. Sampling the projection itself
 * (rather than drawing an ornament) is what makes the period/currency/amount controls visibly move
 * the chart.
 */
export function simulateCurve(input: SimulateInput, n = 20): number[] {
  const { apy } = getBucketMeta(input.currency);
  return Array.from({ length: n }, (_, i) => input.amount * growthFactor(apy, (input.periodDays * (i + 1)) / n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test lib/earn/__tests__/simulate.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/earn/simulate.ts frontend/lib/earn/__tests__/simulate.test.ts
git commit -m "feat(U16): mirror deterministic simulate() on the frontend (STE-26)"
```

---

### Task 2: `lib/earnings/fixtures.ts` — chart + monthly ternormalisasi

**Files:**
- Create: `frontend/lib/earnings/fixtures.ts`
- Test: `frontend/lib/earnings/__tests__/fixtures.test.ts`

**Interfaces:**
- Consumes: tak ada (fungsi murni).
- Produces: `ChartPoint { ts: number; earnedUsd: number }`, `MonthlyEarned { label: string; earnedUsd: number }`, `buildEarningsFixture(now: number): { chart: ChartPoint[]; monthly: MonthlyEarned[] }`. Nilai `earnedUsd` **ternormalisasi 0…1**; Task 3 mengalikannya dengan `earnedUsd` hidup.

Bentuk `ChartPoint` dan `MonthlyEarned` identik dengan `backend/src/api/earnings.ts`, tapi di-redeklarasi lokal — frontend tak boleh mengimpor dari `backend`.

Resolusi `chart` sengaja tak seragam: per-jam untuk 7 hari terakhir, per-hari untuk sisanya. Jendela `day` di Task 8 butuh titik sub-harian, dan `snapshotter.ts` juga akan mengirim deret tak-seragam.

- [ ] **Step 1: Write the failing test**

Buat `frontend/lib/earnings/__tests__/fixtures.test.ts`:

```ts
import { buildEarningsFixture } from "../fixtures";

// 2026-07-10T12:00:00Z — a fixed epoch, so the fixture is deterministic in tests.
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);

test("is deterministic for a given `now`", () => {
  expect(buildEarningsFixture(NOW)).toEqual(buildEarningsFixture(NOW));
});

test("monthly has 9 entries, oldest→newest, labelled YYYY-MM", () => {
  const { monthly } = buildEarningsFixture(NOW);
  expect(monthly).toHaveLength(9);
  expect(monthly.map((m) => m.label)).toEqual([
    "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    "2026-04", "2026-05", "2026-06", "2026-07",
  ]);
});

test("monthly weights are normalized — they sum to 1", () => {
  const { monthly } = buildEarningsFixture(NOW);
  expect(monthly.reduce((s, m) => s + m.earnedUsd, 0)).toBeCloseTo(1, 10);
});

test("chart is monotonically non-decreasing and ends exactly at `now` with 1", () => {
  const { chart } = buildEarningsFixture(NOW);
  const last = chart[chart.length - 1]!;
  expect(last.ts).toBe(NOW);
  expect(last.earnedUsd).toBeCloseTo(1, 10);
  for (let i = 1; i < chart.length; i++) {
    expect(chart[i]!.earnedUsd).toBeGreaterThanOrEqual(chart[i - 1]!.earnedUsd);
    expect(chart[i]!.ts).toBeGreaterThan(chart[i - 1]!.ts);
  }
});

test("chart resolution is hourly over the last 7 days and daily before that", () => {
  const { chart } = buildEarningsFixture(NOW);
  const HOUR = 3_600_000;
  const weekAgo = NOW - 7 * 24 * HOUR;
  const recent = chart.filter((p) => p.ts >= weekAgo);
  // 7 days of hourly points, inclusive of both ends.
  expect(recent.length).toBeGreaterThanOrEqual(7 * 24);
  const older = chart.filter((p) => p.ts < weekAgo);
  expect(older.length).toBeGreaterThan(200); // ~8 months of daily points
  expect(older[1]!.ts - older[0]!.ts).toBe(24 * HOUR);
});

test("the chart's last point equals the sum of monthly — one earned figure, two views", () => {
  const { chart, monthly } = buildEarningsFixture(NOW);
  expect(chart[chart.length - 1]!.earnedUsd).toBeCloseTo(
    monthly.reduce((s, m) => s + m.earnedUsd, 0),
    10,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test lib/earnings/__tests__/fixtures.test.ts`
Expected: FAIL — `Failed to resolve import "../fixtures"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/lib/earnings/fixtures.ts`:

```ts
/**
 * Chart + monthly fixture for the funded Earn screen. The frontend has no share-price time series —
 * `snapshotter.ts` lives only in the backend — so the SHAPE of the earned timeline is a fixture while
 * the headline figures are read live from the vault seam (see `hooks/useEarnings.ts`).
 *
 * Everything here is normalized to 0…1; `useEarnings` scales it by the live `earnedUsd` so the hero,
 * the chart's last point, and the sum of the monthly breakdown are the same number.
 *
 * `now` is injected rather than read, following the backend convention "pass a `clock: () => number`".
 * Types mirror `backend/src/api/earnings.ts` but are declared locally: the frontend must not import
 * from `backend`.
 */

/** One point on the cumulative-earned timeline. `earnedUsd` is normalized 0…1. */
export interface ChartPoint {
  ts: number;
  earnedUsd: number;
}

/** Earned during one calendar month (UTC). `label` is `YYYY-MM`; `earnedUsd` is normalized 0…1. */
export interface MonthlyEarned {
  label: string;
  earnedUsd: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHS = 9;
/** Relative earnings weight per month, oldest→newest. Arbitrary but fixed, so runs are comparable. */
const MONTH_WEIGHTS = [0.7, 1.2, 0.9, 1.1, 1.3, 1.0, 1.25, 1.15, 0.55] as const;
/** Hourly resolution over this trailing window; daily before it. */
const FINE_WINDOW = 7 * DAY;

function monthLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** UTC start-of-month for the month `back` months before `now`. */
function monthStart(now: number, back: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1);
}

export function buildEarningsFixture(now: number): { chart: ChartPoint[]; monthly: MonthlyEarned[] } {
  // Month boundaries, oldest→newest. `starts[MONTHS - 1]` is the start of the current month.
  const starts = Array.from({ length: MONTHS }, (_, i) => monthStart(now, MONTHS - 1 - i));
  const ends = starts.map((s, i) => starts[i + 1] ?? now);

  // The current month is prorated by how much of it has elapsed — "This month" is a partial month.
  const currentStart = starts[MONTHS - 1]!;
  const currentFullEnd = monthStart(now, -1); // start of next month
  const elapsed = (now - currentStart) / (currentFullEnd - currentStart);
  const raw = MONTH_WEIGHTS.map((w, i) => (i === MONTHS - 1 ? w * elapsed : w));
  const total = raw.reduce((s, w) => s + w, 0);
  const monthly: MonthlyEarned[] = raw.map((w, i) => ({ label: monthLabel(starts[i]!), earnedUsd: w / total }));

  // Cumulative earned at `ts`: every completed month's weight, plus a linear slice of the month `ts`
  // falls in. Piecewise-linear within a month keeps the curve monotone and makes the chart's last
  // point land exactly on the sum of `monthly`.
  const cumulativeBefore: number[] = [];
  let acc = 0;
  for (const m of monthly) {
    cumulativeBefore.push(acc);
    acc += m.earnedUsd;
  }
  const earnedAt = (ts: number): number => {
    if (ts <= starts[0]!) return 0;
    for (let i = MONTHS - 1; i >= 0; i--) {
      const start = starts[i]!;
      if (ts < start) continue;
      const end = ends[i]!;
      const frac = end > start ? Math.min(1, (ts - start) / (end - start)) : 1;
      return cumulativeBefore[i]! + monthly[i]!.earnedUsd * frac;
    }
    return 0;
  };

  const chart: ChartPoint[] = [];
  const fineStart = now - FINE_WINDOW;
  for (let ts = starts[0]!; ts < fineStart; ts += DAY) chart.push({ ts, earnedUsd: earnedAt(ts) });
  for (let ts = fineStart; ts < now; ts += HOUR) chart.push({ ts, earnedUsd: earnedAt(ts) });
  chart.push({ ts: now, earnedUsd: earnedAt(now) });

  return { chart, monthly };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test lib/earnings/__tests__/fixtures.test.ts`
Expected: PASS — 6 tests.

Kalau `earnedAt(now)` meleset dari 1 secara numerik, penyebabnya `ends[MONTHS-1]` yang di-set ke `now` sehingga `frac === 1` — itu memang yang diinginkan, dan `monthly[8]` sudah diprorata lewat `elapsed`. Jangan "perbaiki" dengan menormalkan ulang chart.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/earnings/fixtures.ts frontend/lib/earnings/__tests__/fixtures.test.ts
git commit -m "feat(U16): earned chart + monthly fixture, normalized and clock-injected (STE-26)"
```

---

### Task 3: `hooks/useEarnings.ts` — seam data Earn

**Files:**
- Create: `frontend/hooks/useEarnings.ts`
- Test: `frontend/hooks/__tests__/useEarnings.test.tsx`

**Interfaces:**
- Consumes: `useBuckets()` → `{ loading, error, buckets: BucketView[], totalUsd }` (`BucketView` punya `currency`, `apy`, `value: bigint`, `valueUsd`); `getContributions(currency): bigint`; `getFxRateToUsd(currency): number`; `UNIT: bigint`; `buildEarningsFixture(now)` dari Task 2.
- Produces: `BucketBreakdown`, `EarningsView`, `useEarnings(): { loading: boolean; view: EarningsView }`.

`BucketBreakdown` di sini adalah **superset** milik backend: menambahkan `earnedUsd` yang dibutuhkan hero `BucketToggle`. Semua field backend tetap ada dengan tipe yang sama.

- [ ] **Step 1: Write the failing test**

Buat `frontend/hooks/__tests__/useEarnings.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useEarnings } from "../useEarnings";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, view } = useEarnings();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="hasDeposit">{String(view.hasDeposit)}</span>
      <span data-testid="balanceUsd">{view.balanceUsd.toFixed(4)}</span>
      <span data-testid="earnedUsd">{view.earnedUsd.toFixed(4)}</span>
      <span data-testid="apy">{view.apy.toFixed(4)}</span>
      <span data-testid="bucketSum">{view.buckets.reduce((s, b) => s + b.usdValue, 0).toFixed(4)}</span>
      <span data-testid="chartLast">{(view.chart[view.chart.length - 1]?.earnedUsd ?? 0).toFixed(4)}</span>
      <span data-testid="monthlySum">{view.monthly.reduce((s, m) => s + m.earnedUsd, 0).toFixed(4)}</span>
      <span data-testid="monthlyLen">{view.monthly.length}</span>
    </div>
  );
}

async function renderFunded() {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("hasDeposit")).toBeInTheDocument());
}

test("R4 — per-bucket usdValue sums to balanceUsd", async () => {
  await renderFunded();
  expect(screen.getByTestId("bucketSum").textContent).toBe(screen.getByTestId("balanceUsd").textContent);
});

test("R5 — apy is value-weighted, not a plain mean", async () => {
  await renderFunded();
  // Seeded: USD (8.59% APY) holds more USD value than EUR (5.10%), so the weighted blend must sit
  // above the plain mean of 6.845.
  const apy = Number(screen.getByTestId("apy").textContent);
  expect(apy).toBeGreaterThan(5.1);
  expect(apy).toBeLessThan(8.59);
  expect(apy).not.toBeCloseTo((8.59 + 5.1) / 2, 3);
});

test("the chart's last point, the monthly sum, and earnedUsd are the same number", async () => {
  await renderFunded();
  const earned = screen.getByTestId("earnedUsd").textContent;
  expect(screen.getByTestId("chartLast").textContent).toBe(earned);
  expect(screen.getByTestId("monthlySum").textContent).toBe(earned);
  expect(screen.getByTestId("monthlyLen").textContent).toBe("9");
});

test("hasDeposit is false when nothing is deposited", async () => {
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(<VaultProvider client={new MockVaultClient()}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("hasDeposit").textContent).toBe("false"));
  expect(screen.getByTestId("earnedUsd").textContent).toBe("0.0000");
  expect(screen.getByTestId("apy").textContent).toBe("0.0000");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test hooks/__tests__/useEarnings.test.tsx`
Expected: FAIL — `Failed to resolve import "../useEarnings"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/hooks/useEarnings.ts`:

```ts
"use client";
import { useEffect, useMemo, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { useBuckets } from "./useBuckets";
import { getContributions } from "../lib/vault/contributions";
import { getFxRateToUsd } from "../lib/vault/data";
import { UNIT } from "../lib/vault/units";
import { buildEarningsFixture, type ChartPoint, type MonthlyEarned } from "../lib/earnings/fixtures";

/**
 * Per-bucket drill-down. Mirrors `BucketBreakdown` in `backend/src/api/earnings.ts` and adds
 * `earnedUsd`, which the hero's BucketToggle needs and the backend has not yet exposed.
 */
export interface BucketBreakdown {
  currency: Currency;
  /** Asset value in the bucket's own currency. */
  nativeValue: bigint;
  /** Display-only USD conversion of `nativeValue` — never a fund conversion. */
  usdValue: number;
  earnedUsd: number;
}

/** Mirrors `EarningsView` in the backend. No risk/label/score field, by design (R11). */
export interface EarningsView {
  hasDeposit: boolean;
  balanceUsd: number;
  apy: number;
  earnedUsd: number;
  buckets: BucketBreakdown[];
  chart: ChartPoint[];
  monthly: MonthlyEarned[];
}

const EMPTY: EarningsView = {
  hasDeposit: false, balanceUsd: 0, apy: 0, earnedUsd: 0, buckets: [], chart: [], monthly: [],
};

/**
 * The Earn screen's single data seam. Hybrid on purpose: the headline is computed live from the vault
 * seam (so a deposit made this session shows up immediately), while `chart`/`monthly` come from a
 * fixture — the frontend has no share-price time series. The fixture is scaled by the live
 * `earnedUsd`, so the hero, the chart's last point, and the monthly sum agree.
 *
 * When the backend is exposed over HTTP, only this function's body changes; no component moves.
 */
export function useEarnings(): { loading: boolean; view: EarningsView } {
  const { loading, buckets, totalUsd } = useBuckets();

  // `Date.now()` after mount only — reading it during render would desync SSR and client (KTD7).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  const view = useMemo<EarningsView>(() => {
    if (now === null) return EMPTY;

    const breakdown: BucketBreakdown[] = buckets.map((b) => {
      const fx = getFxRateToUsd(b.currency);
      const earnedNative = Number(b.value - getContributions(b.currency)) / Number(UNIT);
      return {
        currency: b.currency,
        nativeValue: b.value,
        usdValue: b.valueUsd,
        // Earned is native yield converted for display; FX movement is never earnings.
        earnedUsd: Math.max(0, earnedNative * fx),
      };
    });

    const balanceUsd = totalUsd;
    const earnedUsd = breakdown.reduce((s, b) => s + b.earnedUsd, 0);
    const apy = balanceUsd > 0 ? buckets.reduce((s, b) => s + b.valueUsd * b.apy, 0) / balanceUsd : 0;

    const fixture = buildEarningsFixture(now);
    return {
      hasDeposit: buckets.length > 0,
      balanceUsd,
      apy,
      earnedUsd,
      buckets: breakdown,
      chart: fixture.chart.map((p) => ({ ts: p.ts, earnedUsd: p.earnedUsd * earnedUsd })),
      monthly: fixture.monthly.map((m) => ({ label: m.label, earnedUsd: m.earnedUsd * earnedUsd })),
    };
  }, [buckets, totalUsd, now]);

  return { loading: loading || now === null, view };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test hooks/__tests__/useEarnings.test.tsx`
Expected: PASS — 4 tests.

Kalau tes "hasDeposit is false" gagal karena `loading` tak pernah selesai: `useBuckets` mengembalikan `loading: false` saat `address === null`, dan `now` di-set pada mount — keduanya harus terpenuhi. Jangan menghapus gate `now === null`; itu yang mencegah hydration mismatch.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useEarnings.ts frontend/hooks/__tests__/useEarnings.test.tsx
git commit -m "feat(U16): useEarnings() — EarningsView-shaped seam, live headline + scaled fixture (STE-26)"
```

---

### Task 4: `components/earn/Bars.tsx` — bar chart primitif

**Files:**
- Create: `frontend/components/earn/Bars.tsx`
- Test: `frontend/components/earn/__tests__/Bars.test.tsx`

**Interfaces:**
- Consumes: tak ada.
- Produces: `<Bars values={number[]} className?: string />`. Merender satu `<div data-testid="bar">` per nilai; `aria-hidden` di kontainer (ini ornamen data, bukan tabel — angkanya sudah ada di breakdown).

- [ ] **Step 1: Write the failing test**

Buat `frontend/components/earn/__tests__/Bars.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Bars } from "../Bars";

test("renders one bar per value, tallest at the maximum", () => {
  render(<Bars values={[0, 50, 100]} />);
  const bars = screen.getAllByTestId("bar");
  expect(bars).toHaveLength(3);
  expect(bars[0]!.style.height).toBe("8px");   // floor, so an empty bar is still visible
  expect(bars[2]!.style.height).toBe("112px"); // 8 + 104
});

test("an all-zero series does not divide by zero", () => {
  render(<Bars values={[0, 0]} />);
  for (const bar of screen.getAllByTestId("bar")) expect(bar.style.height).toBe("8px");
});

test("the chart is decorative — hidden from the accessibility tree", () => {
  const { container } = render(<Bars values={[1, 2]} />);
  expect(container.querySelector("[data-testid='bars']")).toHaveAttribute("aria-hidden", "true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test components/earn/__tests__/Bars.test.tsx`
Expected: FAIL — `Failed to resolve import "../Bars"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/components/earn/Bars.tsx`:

```tsx
/**
 * The bar chart shared by the simulator and the funded Growth card. Values are normalized against
 * the series maximum; the 8px floor keeps a zero bar visible. Decorative: the numbers a user needs
 * are already rendered as text next to it.
 */
export function Bars({ values, className = "" }: { values: number[]; className?: string }) {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  return (
    <div
      data-testid="bars"
      aria-hidden="true"
      className={`mt-3 flex h-[124px] items-end gap-[3px] ${className}`}
    >
      {values.map((v, i) => (
        <div
          key={i}
          data-testid="bar"
          style={{ height: `${8 + (max > 0 ? v / max : 0) * 104}px` }}
          className="flex-1 rounded-[3px] bg-ink/10"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test components/earn/__tests__/Bars.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/earn/Bars.tsx frontend/components/earn/__tests__/Bars.test.tsx
git commit -m "feat(U16): <Bars> — one bar primitive for simulator and Growth (STE-26)"
```

---

### Task 5: `components/simulator/Simulator.tsx`

**Files:**
- Create: `frontend/components/simulator/Simulator.tsx`
- Test: `frontend/components/simulator/__tests__/Simulator.test.tsx`

**Interfaces:**
- Consumes: `simulate()`, `simulateCurve()`, `PERIOD_DAYS`, `PeriodName` (Task 1); `<Bars>` (Task 4); `Card` dari `components/ui`.
- Produces: `<Simulator currency={Currency} onCurrencyChange={(c: Currency) => void} />`. Currency **dikontrol dari luar** — halaman Earn memakai nilai yang sama untuk APY di hero.

Amount: awal 1.000, step 500, clamp `[500, 1_000_000]`. Period default `year`. Simbol per currency: `$` / `€` / `MX$`. Proyeksi dalam currency bucket, tak pernah dikonversi ke USD.

- [ ] **Step 1: Write the failing test**

Buat `frontend/components/simulator/__tests__/Simulator.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Simulator } from "../Simulator";

function Harness() {
  const [currency, setCurrency] = useState<Currency>("USD");
  return <Simulator currency={currency} onCurrencyChange={setCurrency} />;
}

test("projects a year of USD by default", () => {
  render(<Harness />);
  expect(screen.getByTestId("projection").textContent).toBe("$85.90"); // 1000 @ 8.59%
});

test("stepping the amount re-projects", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Increase" }));
  expect(screen.getByTestId("amount").textContent).toBe("$1,500");
  expect(screen.getByTestId("projection").textContent).toBe("$128.85");
});

test("the amount clamps at 500 and never goes to zero", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Decrease" }));
  await user.click(screen.getByRole("button", { name: "Decrease" }));
  expect(screen.getByTestId("amount").textContent).toBe("$500");
});

test("switching currency changes the symbol and the projection", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "EUR" }));
  expect(screen.getByTestId("amount").textContent).toBe("€1,000");
  expect(screen.getByTestId("projection").textContent).toBe("€51.00"); // 1000 @ 5.10%
});

test("switching period changes the projection", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Month" }));
  expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("projection").textContent).toBe("$6.80"); // 1000 @ 8.59%, 30d
});

test("bars redraw when the curve's shape changes — the chart is not an ornament", async () => {
  const user = userEvent.setup();
  const heights = () => screen.getAllByTestId("bar").map((b) => b.style.height);
  render(<Harness />);
  const usd = heights();
  expect(usd).toHaveLength(20);

  // <Bars> normalizes against the series maximum, so a shorter horizon at the SAME apy yields the
  // same normalized shape. Only the projection moves. Asserting otherwise would test a fiction.
  await user.click(screen.getByRole("button", { name: "Day" }));
  expect(heights()).toEqual(usd);
  expect(screen.getByTestId("projection").textContent).toBe("$0.23");

  // A different APY bends the compound curve differently, so the bars must redraw.
  await user.click(screen.getByRole("button", { name: "EUR" }));
  expect(heights()).not.toEqual(usd);
});

test("R11 — no pool selector, no risk label anywhere", () => {
  const { container } = render(<Harness />);
  expect(container.textContent).not.toMatch(/safe|watch|risk|score|pool/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test components/simulator/__tests__/Simulator.test.tsx`
Expected: FAIL — `Failed to resolve import "../Simulator"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/components/simulator/Simulator.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Card } from "../ui";
import { Bars } from "../earn/Bars";
import { PERIOD_DAYS, simulate, simulateCurve, type PeriodName } from "../../lib/earn/simulate";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];
const PERIODS: readonly PeriodName[] = ["day", "week", "month", "year"];
/**
 * Labels are capitalized in the DOM, not with a `capitalize` class: CSS text-transform does not
 * change a button's accessible name, so `getByRole("button", { name: "Month" })` would never match.
 */
const PERIOD_LABEL: Record<PeriodName, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
/** Simulator symbols disambiguate MXN from USD; `lib/vault/units.ts` renders both as "$". */
const SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€", MXN: "MX$" };

const STEP = 500;
const MIN = 500;
const MAX = 1_000_000;

const money = (n: number, currency: Currency) =>
  `${SYMBOL[currency]}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The deterministic earnings simulator (R15). The user picks a CURRENCY — never a pool, never a risk
 * tier. `currency` is controlled by the Earn page because the empty-state hero shows the same APY.
 */
export function Simulator({
  currency,
  onCurrencyChange,
}: {
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
}) {
  const [amount, setAmount] = useState(1000);
  const [period, setPeriod] = useState<PeriodName>("year");

  const periodDays = PERIOD_DAYS[period];
  const { projectedEarnings } = simulate({ currency, amount, periodDays });
  const curve = simulateCurve({ currency, amount, periodDays });
  const step = (delta: number) => setAmount((a) => Math.min(MAX, Math.max(MIN, a + delta)));

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="whitespace-nowrap text-[15px] font-semibold">Simulate earnings</div>
        <div className="flex h-9 items-center gap-1 rounded-full bg-black/[.04] px-1" role="group" aria-label="Amount">
          <button onClick={() => step(-STEP)} aria-label="Decrease" className="h-7 w-7 rounded-full text-lg leading-none">
            −
          </button>
          <span data-testid="amount" className="min-w-[76px] text-center text-sm font-semibold [font-variant-numeric:tabular-nums]">
            {SYMBOL[currency]}
            {amount.toLocaleString("en-US")}
          </span>
          <button onClick={() => step(STEP)} aria-label="Increase" className="h-7 w-7 rounded-full text-lg leading-none">
            +
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-black/[.04] p-1" role="group" aria-label="Currency">
        {CURRENCIES.map((c) => (
          <button
            key={c}
            onClick={() => onCurrencyChange(c)}
            aria-pressed={c === currency}
            className={`h-9 rounded-full text-sm font-semibold ${c === currency ? "bg-white text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.08)]" : "text-muted"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mb-0.5 mt-4 text-[15px] font-medium text-muted">You would earn</p>
      <div data-testid="projection" className="text-[38px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
        {money(projectedEarnings, currency)}
      </div>

      <Bars values={curve} />

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-black/[.04] p-1" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={p === period}
            className={`h-9 rounded-full text-sm font-semibold ${p === period ? "bg-white text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.08)]" : "text-muted"}`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test components/simulator/__tests__/Simulator.test.tsx`
Expected: PASS — 7 tests.

Kalau angka proyeksi meleset, hitung ulang dengan `growthFactor` — jangan mengubah assertion agar cocok dengan output. `1000 × ((1.0859)^(30/365) − 1) = 6.80`; `1000 × ((1.0859)^(1/365) − 1) = 0.23`; `1500 × 0.0859 = 128.85`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/simulator frontend/components/simulator/__tests__
git commit -m "feat(U16): Simulator — currency selector, amount stepper, live growth curve (STE-26)"
```

---

### Task 6: Earn empty state

**Files:**
- Modify: `frontend/app/(app)/earn/page.tsx`
- Test: `frontend/app/(app)/earn/__tests__/earn-empty.test.tsx`

**Interfaces:**
- Consumes: `useEarnings()` (Task 3), `<Simulator>` (Task 5), `Button`, `useNav()`, `getBucketMeta()`.
- Produces: halaman Earn yang bercabang di `view.hasDeposit`. Task 9 mengisi cabang funded; sampai saat itu cabang funded tetap memakai hero U14 yang ada.

State `currency` hidup di halaman: APY di hero dan APY simulator adalah nilai yang sama.

- [ ] **Step 1: Write the failing test**

Buat `frontend/app/(app)/earn/__tests__/earn-empty.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import EarnPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function renderEmpty() {
  // No address → no buckets → hasDeposit false, and VaultProvider never seeds.
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(<VaultProvider client={new MockVaultClient()}><EarnPage /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("Earn balance")).toBeInTheDocument());
}

test("shows a zero balance, the simulator, and a route into deposit", async () => {
  const user = userEvent.setup();
  await renderEmpty();
  expect(screen.getByTestId("earn-balance").textContent).toBe("$0.00");
  expect(screen.getByText("Simulate earnings")).toBeInTheDocument();
  expect(screen.getByText("No lockup, move to your wallet anytime")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Start earning" }));
  expect(push).toHaveBeenCalledWith("/add-funds");
});

test("the hero APY tracks the simulator's currency", async () => {
  const user = userEvent.setup();
  await renderEmpty();
  expect(screen.getByTestId("hero-apy").textContent).toBe("8.59% APY");
  await user.click(screen.getByRole("button", { name: "MXN" }));
  expect(screen.getByTestId("hero-apy").textContent).toBe("5.57% APY");
  expect(screen.getByTestId("projection").textContent).toBe("MX$55.70");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test "app/(app)/earn/__tests__/earn-empty.test.tsx"`
Expected: FAIL — `Unable to find an element with the text: Earn balance`.

- [ ] **Step 3: Write minimal implementation**

Ganti `frontend/app/(app)/earn/page.tsx` dengan:

```tsx
"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Button } from "../../../components/ui";
import { BucketToggle } from "../../../components/bucket/BucketToggle";
import { Simulator } from "../../../components/simulator/Simulator";
import { useEarnings } from "../../../hooks/useEarnings";
import { useNav } from "../../../hooks/useNav";
import { getBucketMeta } from "../../../lib/vault/data";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EarnPage() {
  const nav = useNav();
  const { loading, view } = useEarnings();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [i, setI] = useState(0);

  if (loading) {
    return <div className="py-[30px] text-center text-sm text-muted">Loading…</div>;
  }

  if (!view.hasDeposit) {
    return (
      <div>
        <div className="pb-[18px] pt-0.5 text-center">
          <div className="text-[15px] font-medium text-muted">Earn balance</div>
          <div
            data-testid="earn-balance"
            className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
          >
            $0.00
          </div>
          <div className="mt-3.5 flex items-center justify-center gap-2 text-[13.5px] font-medium text-muted">
            <span aria-hidden="true" className="flex items-end gap-[2px]">
              <i className="block h-[6px] w-[3px] rounded-sm bg-pos" />
              <i className="block h-[10px] w-[3px] rounded-sm bg-pos" />
              <i className="block h-[14px] w-[3px] rounded-sm bg-pos" />
            </span>
            <span data-testid="hero-apy" className="[font-variant-numeric:tabular-nums]">
              {getBucketMeta(currency).apy.toFixed(2)}% APY
            </span>
          </div>
        </div>
        <Button onClick={() => nav.forward("/add-funds")}>Start earning</Button>
        <p className="my-3 text-center text-[13px] text-muted">No lockup, move to your wallet anytime</p>
        <Simulator currency={currency} onCurrencyChange={setCurrency} />
      </div>
    );
  }

  const views = [
    { name: "All buckets", currency: undefined, earned: view.earnedUsd, balance: view.balanceUsd, apy: view.apy },
    ...view.buckets.map((b) => ({
      name: getBucketMeta(b.currency).name,
      currency: b.currency,
      earned: b.earnedUsd,
      balance: b.usdValue,
      apy: getBucketMeta(b.currency).apy,
    })),
  ];
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total earned</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {usd(v.earned)}
        </div>
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">
          {usd(v.balance)} balance · {v.apy.toFixed(2)}% APY
        </div>
        <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
      </div>
      <div className="flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C frontend test "app/(app)/earn"`
Expected: PASS — `earn-empty.test.tsx` hijau, dan `earn.test.tsx` yang lama tetap hijau (funded state masih merutekan ke `/withdraw`).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/earn"
git commit -m "feat(U16): Earn empty state — zero balance hero + deterministic simulator (STE-26)"
```

---

### Task 7: `components/earn/MonthlyBreakdown.tsx`

**Files:**
- Create: `frontend/components/earn/MonthlyBreakdown.tsx`
- Test: `frontend/components/earn/__tests__/MonthlyBreakdown.test.tsx`

**Interfaces:**
- Consumes: `MonthlyEarned` dari `lib/earnings/fixtures` (Task 2).
- Produces: `formatMonthLabel(label: string, now: number): string`, `<MonthlyBreakdown monthly={MonthlyEarned[]} now={number} />`.

Backend mengirim `monthly` urut lama→baru; komponen membalik jadi baru→lama. Tampil 3, "Load more" +3, tombol hilang saat habis. Nama bulan dari array eksplisit — `toLocaleString` bergantung pada data ICU yang bisa berbeda antar runner CI.

- [ ] **Step 1: Write the failing test**

Buat `frontend/components/earn/__tests__/MonthlyBreakdown.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthlyBreakdown, formatMonthLabel } from "../MonthlyBreakdown";

const NOW = Date.UTC(2026, 6, 10); // 2026-07

const monthly = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
].map((label, i) => ({ label, earnedUsd: 10 + i }));

test("formatMonthLabel distinguishes this month, this year, and last year", () => {
  expect(formatMonthLabel("2026-07", NOW)).toBe("This month");
  expect(formatMonthLabel("2026-06", NOW)).toBe("June");
  expect(formatMonthLabel("2025-11", NOW)).toBe("November 2025");
});

test("shows 3 rows newest-first, then loads 3 more per click until exhausted", async () => {
  const user = userEvent.setup();
  render(<MonthlyBreakdown monthly={monthly} now={NOW} />);

  expect(screen.getAllByTestId("month-row")).toHaveLength(3);
  expect(screen.getAllByTestId("month-row")[0]!.textContent).toContain("This month");
  expect(screen.getAllByTestId("month-row")[1]!.textContent).toContain("June");

  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByTestId("month-row")).toHaveLength(6);

  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByTestId("month-row")).toHaveLength(9);
  expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
});

test("earned is rendered as a signed USD amount", () => {
  render(<MonthlyBreakdown monthly={monthly} now={NOW} />);
  expect(screen.getAllByTestId("month-row")[0]!.textContent).toContain("+$18.00");
});

test("no Load more when everything already fits", () => {
  render(<MonthlyBreakdown monthly={monthly.slice(-2)} now={NOW} />);
  expect(screen.getAllByTestId("month-row")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test components/earn/__tests__/MonthlyBreakdown.test.tsx`
Expected: FAIL — `Failed to resolve import "../MonthlyBreakdown"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/components/earn/MonthlyBreakdown.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { MonthlyEarned } from "../../lib/earnings/fixtures";

const PAGE = 3;
/** Explicit names: `toLocaleString` depends on the runtime's ICU data, which varies across CI images. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * `YYYY-MM` → a human label, relative to `now`. The year is kept for older years so two Novembers are
 * never ambiguous.
 */
export function formatMonthLabel(label: string, now: number): string {
  const [yearStr = "", monthStr = ""] = label.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const d = new Date(now);
  if (year === d.getUTCFullYear() && month === d.getUTCMonth()) return "This month";
  const name = MONTH_NAMES[month] ?? label;
  return year === d.getUTCFullYear() ? name : `${name} ${year}`;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Per-month earned, newest first. The backend sends `monthly` oldest→newest. */
export function MonthlyBreakdown({ monthly, now }: { monthly: MonthlyEarned[]; now: number }) {
  const [shown, setShown] = useState(PAGE);
  const rows = [...monthly].reverse();
  const visible = rows.slice(0, shown);

  return (
    <div className="mt-4">
      {visible.map((m) => (
        <div
          key={m.label}
          data-testid="month-row"
          className="flex items-center justify-between border-t border-line py-3.5 font-semibold"
        >
          <span>{formatMonthLabel(m.label, now)}</span>
          <span className="text-pos [font-variant-numeric:tabular-nums]">+{usd(m.earnedUsd)}</span>
        </div>
      ))}
      {shown < rows.length && (
        <button
          onClick={() => setShown((n) => Math.min(n + PAGE, rows.length))}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line py-3.5 text-sm font-semibold text-muted"
        >
          Load more
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test components/earn/__tests__/MonthlyBreakdown.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/earn/MonthlyBreakdown.tsx frontend/components/earn/__tests__/MonthlyBreakdown.test.tsx
git commit -m "feat(U16): monthly breakdown — newest-first, 3 rows + Load more (STE-26)"
```

---

### Task 8: `components/earn/GrowthCard.tsx` + `windowBars()`

**Files:**
- Create: `frontend/components/earn/GrowthCard.tsx`
- Test: `frontend/components/earn/__tests__/GrowthCard.test.tsx`

**Interfaces:**
- Consumes: `ChartPoint`, `MonthlyEarned` (Task 2); `<Bars>` (Task 4); `<MonthlyBreakdown>` (Task 7); `PeriodName` (Task 1); `Card`.
- Produces: `windowBars(chart: ChartPoint[], period: PeriodName, now: number): number[]`, `<GrowthCard chart={ChartPoint[]} monthly={MonthlyEarned[]} now={number} />`.

Bar merender **earned per-interval** (delta antar titik kumulatif), bukan nilai kumulatif — chart kumulatif atas jendela pendek menghasilkan bar setinggi nyaris sama dan terlihat rusak.

| Period | Jendela | Bar |
| --- | --- | --- |
| `day` | 24 jam terakhir | 24 |
| `week` | 7 hari terakhir | 7 |
| `month` | 30 hari terakhir | 20 |
| `year` | seluruh rentang chart | 20 |

Jendela selalu di-clamp ke data yang ada.

- [ ] **Step 1: Write the failing test**

Buat `frontend/components/earn/__tests__/GrowthCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildEarningsFixture } from "../../../lib/earnings/fixtures";
import { GrowthCard, windowBars } from "../GrowthCard";

const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);
const fixture = buildEarningsFixture(NOW);
const chart = fixture.chart.map((p) => ({ ts: p.ts, earnedUsd: p.earnedUsd * 180 }));
const monthly = fixture.monthly.map((m) => ({ label: m.label, earnedUsd: m.earnedUsd * 180 }));

test("windowBars returns the documented bar count per period", () => {
  expect(windowBars(chart, "day", NOW)).toHaveLength(24);
  expect(windowBars(chart, "week", NOW)).toHaveLength(7);
  expect(windowBars(chart, "month", NOW)).toHaveLength(20);
  expect(windowBars(chart, "year", NOW)).toHaveLength(20);
});

test("bars are per-interval earnings, so they sum to the earnings inside the window", () => {
  const bars = windowBars(chart, "week", NOW);
  const weekAgo = NOW - 7 * 24 * 3_600_000;
  const before = chart.filter((p) => p.ts <= weekAgo).at(-1)!;
  const last = chart.at(-1)!;
  expect(bars.reduce((s, v) => s + v, 0)).toBeCloseTo(last.earnedUsd - before.earnedUsd, 6);
});

test("every bar is non-negative — cumulative earned never goes backwards", () => {
  for (const p of ["day", "week", "month", "year"] as const) {
    for (const v of windowBars(chart, p, NOW)) expect(v).toBeGreaterThanOrEqual(0);
  }
});

test("a window wider than the data clamps instead of inventing points", () => {
  const short = chart.slice(-3);
  expect(windowBars(short, "year", NOW)).toHaveLength(20);
  expect(windowBars(short, "year", NOW).reduce((s, v) => s + v, 0)).toBeCloseTo(
    short.at(-1)!.earnedUsd - short[0]!.earnedUsd,
    6,
  );
});

test("switching period redraws the chart", async () => {
  const user = userEvent.setup();
  render(<GrowthCard chart={chart} monthly={monthly} now={NOW} />);
  expect(screen.getAllByTestId("bar")).toHaveLength(20); // default: year
  await user.click(screen.getByRole("button", { name: "Day" }));
  expect(screen.getAllByTestId("bar")).toHaveLength(24);
  expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
});

test("renders the monthly breakdown beneath the chart", () => {
  render(<GrowthCard chart={chart} monthly={monthly} now={NOW} />);
  expect(screen.getByText("Growth")).toBeInTheDocument();
  expect(screen.getAllByTestId("month-row")).toHaveLength(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test components/earn/__tests__/GrowthCard.test.tsx`
Expected: FAIL — `Failed to resolve import "../GrowthCard"`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/components/earn/GrowthCard.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Card } from "../ui";
import { Bars } from "./Bars";
import { MonthlyBreakdown } from "./MonthlyBreakdown";
import type { ChartPoint, MonthlyEarned } from "../../lib/earnings/fixtures";
import type { PeriodName } from "../../lib/earn/simulate";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PERIODS: readonly PeriodName[] = ["day", "week", "month", "year"];
/** Capitalized in the DOM: CSS `capitalize` does not change a button's accessible name. */
const PERIOD_LABEL: Record<PeriodName, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };

/** Window length and bar count per period. `year` spans whatever data exists. */
const WINDOW: Record<PeriodName, { ms: number | "all"; bars: number }> = {
  day: { ms: DAY, bars: 24 },
  week: { ms: 7 * DAY, bars: 7 },
  month: { ms: 30 * DAY, bars: 20 },
  year: { ms: "all", bars: 20 },
};

/**
 * Bucket the cumulative-earned timeline into per-interval earnings (R8). Bars show the DELTA between
 * cumulative points, not the cumulative value: over a short window a cumulative series is nearly flat
 * and every bar comes out the same height.
 *
 * The window is clamped to the data — we never invent points before the series begins.
 */
export function windowBars(chart: ChartPoint[], period: PeriodName, now: number): number[] {
  const { ms, bars } = WINDOW[period];
  const first = chart[0];
  if (!first || chart.length < 2) return new Array(bars).fill(0);

  const start = ms === "all" ? first.ts : Math.max(first.ts, now - ms);
  const span = now - start;
  const out = new Array<number>(bars).fill(0);
  if (span <= 0) return out;

  // Baseline: the last point at or before the window start. Its cumulative value is what the first
  // in-window delta is measured against.
  let prev = first.earnedUsd;
  for (const p of chart) {
    if (p.ts <= start) prev = p.earnedUsd;
    else break;
  }

  for (const p of chart) {
    if (p.ts <= start) continue;
    const delta = p.earnedUsd - prev;
    prev = p.earnedUsd;
    const bin = Math.min(bars - 1, Math.floor(((p.ts - start) / span) * bars));
    out[bin] = (out[bin] ?? 0) + Math.max(0, delta);
  }
  return out;
}

/** The funded Earn screen's Growth card: chart + period control + per-month breakdown. */
export function GrowthCard({
  chart,
  monthly,
  now,
}: {
  chart: ChartPoint[];
  monthly: MonthlyEarned[];
  now: number;
}) {
  const [period, setPeriod] = useState<PeriodName>("year");

  return (
    <Card className="p-5">
      <div className="mb-1 text-[15px] font-medium text-muted">Growth</div>
      <Bars values={windowBars(chart, period, now)} />
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-black/[.04] p-1" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={p === period}
            className={`h-9 rounded-full text-sm font-semibold ${p === period ? "bg-white text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.08)]" : "text-muted"}`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <MonthlyBreakdown monthly={monthly} now={now} />
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test components/earn/__tests__/GrowthCard.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/earn/GrowthCard.tsx frontend/components/earn/__tests__/GrowthCard.test.tsx
git commit -m "feat(U16): Growth card — per-interval bars windowed by Day/Week/Month/Year (STE-26)"
```

---

### Task 9: Earn funded state + assertion R11

**Files:**
- Modify: `frontend/app/(app)/earn/page.tsx`
- Test: `frontend/app/(app)/earn/__tests__/earn-funded.test.tsx`

**Interfaces:**
- Consumes: `useEarnings()` (Task 3), `<GrowthCard>` (Task 8), `BucketToggle`.
- Produces: cabang funded lengkap. Tak ada export baru.

`now` untuk `GrowthCard` diambil dari `chart` itu sendiri (`chart.at(-1)!.ts`) — titik terakhir fixture memang ber-`ts === now`. Ini menghindari `Date.now()` kedua yang bisa bergeser antara hook dan komponen.

- [ ] **Step 1: Write the failing test**

Buat `frontend/app/(app)/earn/__tests__/earn-funded.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import EarnPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function renderFunded() {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><EarnPage /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
}

test("the hero shows total earned with a balance-and-APY subline", async () => {
  await renderFunded();
  expect(screen.getByText(/balance · \d+\.\d{2}% APY/)).toBeInTheDocument();
});

test("the Growth card renders bars and the monthly breakdown", async () => {
  await renderFunded();
  expect(screen.getByText("Growth")).toBeInTheDocument();
  expect(screen.getAllByTestId("bar")).toHaveLength(20);
  expect(screen.getAllByTestId("month-row")).toHaveLength(3);
});

test("the bucket toggle swaps the hero but never the Growth card", async () => {
  const user = userEvent.setup();
  await renderFunded();
  const barsBefore = screen.getAllByTestId("bar").map((b) => b.style.height);
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  expect(screen.getByText("USD bucket")).toBeInTheDocument();
  expect(screen.getAllByTestId("bar").map((b) => b.style.height)).toEqual(barsBefore);
});

test("both actions route back into the existing deposit/withdraw flows", async () => {
  const user = userEvent.setup();
  await renderFunded();
  await user.click(screen.getByRole("button", { name: "Deposit" }));
  expect(push).toHaveBeenCalledWith("/add-funds");
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  expect(push).toHaveBeenCalledWith("/withdraw");
});

test("R11 — no risk label, tier, or score is rendered in the funded state", async () => {
  await renderFunded();
  expect(document.body.textContent).not.toMatch(/\b(safe|watch|risk|score|tier)\b/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test "app/(app)/earn/__tests__/earn-funded.test.tsx"`
Expected: FAIL — `Unable to find an element with the text: Growth`.

- [ ] **Step 3: Write minimal implementation**

Di `frontend/app/(app)/earn/page.tsx`, tambahkan import:

```tsx
import { GrowthCard } from "../../../components/earn/GrowthCard";
```

Lalu, di cabang funded, sisipkan kartu Growth tepat setelah baris tombol. Ganti blok `return` cabang funded menjadi:

```tsx
  // The fixture's last chart point is stamped with the same `now` the hook used — reusing it keeps
  // the card's month labels in lockstep with the series instead of calling Date.now() twice.
  const now = view.chart[view.chart.length - 1]?.ts ?? 0;

  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total earned</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {usd(v.earned)}
        </div>
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">
          {usd(v.balance)} balance · {v.apy.toFixed(2)}% APY
        </div>
        <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
      </div>
      <div className="mb-5 flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
      <GrowthCard chart={view.chart} monthly={view.monthly} now={now} />
    </div>
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C frontend test "app/(app)/earn"`
Expected: PASS — `earn.test.tsx`, `earn-empty.test.tsx`, `earn-funded.test.tsx` semua hijau.

Kalau assertion R11 gagal karena `BucketToggle` merender nama venue seperti "Blend": itu nama produk, bukan label risiko. Verifikasi teks yang memicunya sebelum melonggarkan regex — melonggarkan regex tanpa memeriksa adalah cara paling mudah kehilangan invarian ini.

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/earn"
git commit -m "feat(U16): Earn funded state — Total earned hero + Growth card (STE-26)"
```

---

### Task 10: Nama wallet sungguhan dari kit

**Files:**
- Modify: `frontend/lib/wallet.ts`
- Modify: `frontend/providers/WalletProvider.tsx`
- Modify: `frontend/lib/__tests__/wallet.test.ts`
- Modify: `frontend/providers/__tests__/WalletProvider.test.tsx`

**Interfaces:**
- Consumes: `StellarWalletsKit.selectedModule.productName` (ada di `@creit.tech/stellar-wallets-kit@2.5.0`, tipe `ModuleInterface`).
- Produces: `wallet.connect(): Promise<{ address: string; name: string }>`, `wallet.getWalletName(): string`; `useWallet()` kini mengekspos `walletName: string | null`.

Account merender "Connected via Freighter". Menghardcode "Freighter" adalah kebohongan bagi pengguna xBull/Lobstr. Kit menyimpan modul terpilih, jadi namanya bisa dibaca sungguhan.

Batasan yang sudah didokumentasikan di `lib/wallet.ts`: id wallet terpilih tidak dipersist oleh kit, jadi setelah reload kit selalu re-init dengan Freighter. Karena itu `walletName` dipersist ke `localStorage` bersama address — sumber kebenaran untuk sesi yang dipulihkan adalah apa yang tercatat saat connect.

- [ ] **Step 1: Write the failing test**

Ganti dua tes di `frontend/lib/__tests__/wallet.test.ts`. Yang lama:

```ts
test("connect() returns the selected wallet address", async () => {
  ...
  await expect(connect()).resolves.toBe("GABC123");
});
```

menjadi:

```ts
test("connect() returns the selected wallet's address and product name", async () => {
  // The kit mock must now also expose `selectedModule`.
  await expect(connect()).resolves.toEqual({ address: "GABC123", name: "Freighter" });
});
```

Di blok `vi.mock` untuk `@creit.tech/stellar-wallets-kit` pada file itu, tambahkan `selectedModule` ke objek `StellarWalletsKit`:

```ts
  selectedModule: { productId: "freighter", productName: "Freighter" },
```

Lalu tambahkan tes di `frontend/providers/__tests__/WalletProvider.test.tsx`:

```tsx
test("exposes and persists the wallet name across a remount", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<WalletProvider><Probe /></WalletProvider>);
  await user.click(screen.getByText("connect"));
  await waitFor(() => expect(screen.getByTestId("walletName").textContent).toBe("Freighter"));
  unmount();

  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("walletName").textContent).toBe("Freighter"));
});
```

Di `Probe` pada file tes itu, tambahkan `walletName` ke destructuring `useWallet()`-nya dan render `<span data-testid="walletName">{walletName ?? ""}</span>`. Sesuaikan mock `wallet.connect` di file itu agar mengembalikan `{ address: "GABC123", name: "Freighter" }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C frontend test lib/__tests__/wallet.test.ts providers/__tests__/WalletProvider.test.tsx`
Expected: FAIL — `connect()` masih resolve ke string, dan `walletName` `undefined`.

- [ ] **Step 3: Write minimal implementation**

Di `frontend/lib/wallet.ts`, ganti `connect()` dan tambahkan `getWalletName()`:

```ts
/** The product name of the wallet the kit currently has selected, e.g. "Freighter" or "xBull". */
export function getWalletName(): string {
  return getKit().selectedModule.productName;
}

export async function connect(): Promise<{ address: string; name: string }> {
  try {
    const { address } = await getKit().authModal();
    return { address, name: getWalletName() };
  } catch (e) {
    throw toWalletError(e);
  }
}
```

Di `frontend/providers/WalletProvider.tsx`:

```tsx
type Ctx = {
  address: string | null;
  walletName: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
export const WalletContext = createContext<Ctx | null>(null);
const KEY = "soro.wallet";
const NAME_KEY = "soro.wallet.name";
```

Tambahkan state dan persist. Di `useEffect` hydration:

```tsx
  const [walletName, setWalletName] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    const savedName = window.localStorage.getItem(NAME_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setAddress(saved);
    // The kit does not persist the selected wallet id, so the name recorded at connect time is the
    // only truthful source for a restored session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedName) setWalletName(savedName);
  }, []);

  const connect = useCallback(async () => {
    const { address: addr, name } = await wallet.connect();
    setAddress(addr);
    setWalletName(name);
    window.localStorage.setItem(KEY, addr);
    window.localStorage.setItem(NAME_KEY, name);
  }, []);

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
    setAddress(null);
    setWalletName(null);
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(NAME_KEY);
  }, []);
```

dan sertakan `walletName` di value provider:

```tsx
    <WalletContext.Provider value={{ address, walletName, isConnected: !!address, connect, disconnect, signTransaction: wallet.signTransaction }}>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C frontend test lib/__tests__/wallet.test.ts providers/__tests__/WalletProvider.test.tsx`
Expected: PASS.

Lalu pastikan tak ada call site yang rusak: `pnpm -C frontend typecheck`. `app/page.tsx:90` memanggil `await connect()` dan mengabaikan nilai baliknya — tetap valid.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/wallet.ts frontend/providers/WalletProvider.tsx frontend/lib/__tests__/wallet.test.ts frontend/providers/__tests__/WalletProvider.test.tsx
git commit -m "feat(U16): expose the connected wallet's product name (STE-26)"
```

---

### Task 11: `hooks/useConsent.ts` + `components/account/Identicon.tsx`

**Files:**
- Create: `frontend/hooks/useConsent.ts`
- Create: `frontend/components/account/Identicon.tsx`
- Test: `frontend/hooks/__tests__/useConsent.test.tsx`
- Test: `frontend/components/account/__tests__/Identicon.test.tsx`

**Interfaces:**
- Consumes: `useWallet()`, `useVault()` → `{ client, version }`; `client.hasConsent(address): Promise<boolean>`, `client.setPolicyConsent(address)`, `mockSigner`.
- Produces: `useConsent(): { loading: boolean; enabled: boolean }`; `identiconCells(address: string): boolean[]` (25 sel, row-major, simetris horizontal); `<Identicon address={string} size?: number />`.

`useConsent` **fail-closed**: `hasConsent()` yang menolak menghasilkan `enabled: false`, bukan `true` optimistis.

- [ ] **Step 1: Write the failing tests**

Buat `frontend/hooks/__tests__/useConsent.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { useConsent } from "../useConsent";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, enabled } = useConsent();
  return <span data-testid="state">{loading ? "loading" : String(enabled)}</span>;
}

test("reads consent from the seam", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await client.setPolicyConsent("GUSER").signAndSubmit(mockSigner("depositor", "GUSER"));
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
});

test("a fresh user has not consented", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  render(<VaultProvider client={new MockVaultClient()}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
});

test("fail-closed — a rejected read renders Off, never an optimistic On", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  vi.spyOn(client, "hasConsent").mockRejectedValue(new Error("network down"));
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
});
```

Buat `frontend/components/account/__tests__/Identicon.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Identicon, identiconCells } from "../Identicon";

const A = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWK3X9";
const B = "GZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFEDQ7P2";

test("is deterministic for a given address", () => {
  expect(identiconCells(A)).toEqual(identiconCells(A));
});

test("different addresses produce different grids", () => {
  expect(identiconCells(A)).not.toEqual(identiconCells(B));
});

test("the grid is 5x5 and horizontally symmetric", () => {
  const cells = identiconCells(A);
  expect(cells).toHaveLength(25);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      expect(cells[y * 5 + x]).toBe(cells[y * 5 + (4 - x)]);
    }
  }
});

test("renders an accessible svg", () => {
  render(<Identicon address={A} />);
  expect(screen.getByLabelText("Wallet identicon")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C frontend test hooks/__tests__/useConsent.test.tsx components/account/__tests__/Identicon.test.tsx`
Expected: FAIL — kedua modul belum ada.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/hooks/useConsent.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";

/**
 * Whether the depositor has signed the auto-optimize mandate. The seam exposes only `hasConsent`
 * (boolean) and `setPolicyConsent` (idempotent) — there is no way to revoke, and no timestamp — so
 * Account renders a read-only status row rather than a switch. A real switch is STE-38/39/40.
 *
 * Fail-closed: a read that rejects renders "Off". Showing "On" because a read failed would tell the
 * user their funds are under a mandate we could not actually confirm.
 */
export function useConsent(): { loading: boolean; enabled: boolean } {
  const { address } = useWallet();
  const { client, version } = useVault();
  const [state, setState] = useState({ loading: true, enabled: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        if (!cancelled) setState({ loading: false, enabled: false });
        return;
      }
      try {
        const enabled = await client.hasConsent(address);
        if (!cancelled) setState({ loading: false, enabled });
      } catch {
        if (!cancelled) setState({ loading: false, enabled: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, client, version]);

  return state;
}
```

Buat `frontend/components/account/Identicon.tsx`:

```tsx
/**
 * A deterministic 5x5 identicon derived from the wallet address. Horizontally symmetric, like the
 * mock: only the left three columns carry information, the right two mirror them.
 */
const SIZE = 5;

/** djb2 — small, deterministic, and enough entropy for 15 bits of grid. */
function hash(address: string): number {
  let h = 5381;
  for (let i = 0; i < address.length; i++) h = ((h * 33) ^ address.charCodeAt(i)) >>> 0;
  return h;
}

/** 25 cells, row-major. `cells[y * 5 + x]` is true when that pixel is inked. */
export function identiconCells(address: string): boolean[] {
  const h = hash(address);
  const cells = new Array<boolean>(SIZE * SIZE).fill(false);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < 3; x++) {
      const on = ((h >>> (y * 3 + x)) & 1) === 1;
      cells[y * SIZE + x] = on;
      cells[y * SIZE + (SIZE - 1 - x)] = on;
    }
  }
  return cells;
}

export function Identicon({ address, size = 90 }: { address: string; size?: number }) {
  const cells = identiconCells(address);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Wallet identicon"
      className="mx-auto mb-3.5 block overflow-hidden rounded-full bg-[#e9e9e6]"
    >
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % SIZE} y={Math.floor(i / SIZE)} width="1" height="1" fill="#1a1a1a" /> : null,
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C frontend test hooks/__tests__/useConsent.test.tsx components/account/__tests__/Identicon.test.tsx`
Expected: PASS — 7 tests.

Kalau "different addresses produce different grids" gagal, dua address itu berbenturan pada 15 bit rendah. Ganti address `B` di tes dengan yang lain dan verifikasi dengan menjalankan ulang — jangan melemahkan assertion jadi `toBeDefined()`.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useConsent.ts frontend/hooks/__tests__/useConsent.test.tsx frontend/components/account
git commit -m "feat(U16): useConsent() fail-closed + deterministic identicon (STE-26)"
```

---

### Task 12: Account page + `LogoutSheet`

**Files:**
- Create: `frontend/components/account/LogoutSheet.tsx`
- Modify: `frontend/app/(app)/account/page.tsx`
- Test: `frontend/app/(app)/account/__tests__/account.test.tsx`

**Interfaces:**
- Consumes: `useWallet()` → `{ address, walletName, disconnect }` (Task 10); `useConsent()` + `<Identicon>` (Task 11); `useNav()`; `BottomSheet`, `Button`, `Card`, `Toast`.
- Produces: halaman Account lengkap. `<LogoutSheet open onClose onConfirm />`.

Divergensi dari mock, disengaja: klausa `· since July 2026` dipotong (seam tak menyimpan waktu connect pertama), dan auto-reinvest adalah baris status `On`/`Off`, bukan switch.

- [ ] **Step 1: Write the failing test**

Buat `frontend/app/(app)/account/__tests__/account.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import AccountPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const disconnect = vi.fn();
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWK3X9";

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({ address: ADDRESS, walletName: "Freighter", isConnected: true, disconnect });
});

function renderAccount(client = new MockVaultClient()) {
  render(<VaultProvider client={client}><AccountPage /></VaultProvider>);
}

test("shows the identicon, a truncated address, and the connected wallet", async () => {
  renderAccount();
  expect(await screen.findByLabelText("Wallet identicon")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /GABC…K3X9/ })).toBeInTheDocument();
  expect(screen.getByText("Connected via Freighter")).toBeInTheDocument();
});

test("does not claim a connection date it has no source for", () => {
  renderAccount();
  expect(document.body.textContent).not.toMatch(/since/i);
});

test("copying the address raises a toast", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  renderAccount();
  await user.click(screen.getByRole("button", { name: /GABC…K3X9/ }));
  expect(writeText).toHaveBeenCalledWith(ADDRESS);
  expect(await screen.findByText("Address copied")).toBeInTheDocument();
});

test("Activity routes to the central activity page", async () => {
  const user = userEvent.setup();
  renderAccount();
  await user.click(screen.getByRole("button", { name: /Activity/ }));
  expect(push).toHaveBeenCalledWith("/account/activity");
});

test("auto-reinvest is a read-only status row, not a switch", async () => {
  const client = new MockVaultClient();
  await client.setPolicyConsent(ADDRESS).signAndSubmit(mockSigner("depositor", ADDRESS));
  renderAccount(client);
  await waitFor(() => expect(screen.getByTestId("consent-state").textContent).toBe("On"));
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});

test("auto-reinvest reads Off for a user who has not consented", async () => {
  renderAccount();
  await waitFor(() => expect(screen.getByTestId("consent-state").textContent).toBe("Off"));
});

test("Log out confirms before disconnecting", async () => {
  const user = userEvent.setup();
  renderAccount();
  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(await screen.findByRole("dialog", { name: "Log out" })).toBeInTheDocument();
  expect(disconnect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Yes, log out" }));
  await waitFor(() => expect(disconnect).toHaveBeenCalled());
  expect(push).toHaveBeenCalledWith("/");
});

test("R11 — Account carries no risk label", async () => {
  renderAccount();
  await screen.findByLabelText("Wallet identicon");
  expect(document.body.textContent).not.toMatch(/\b(safe|watch|risk|score|tier)\b/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test "app/(app)/account"`
Expected: FAIL — `Unable to find a label with the text of: Wallet identicon`.

- [ ] **Step 3: Write minimal implementation**

Buat `frontend/components/account/LogoutSheet.tsx`:

```tsx
"use client";
import { BottomSheet, Button } from "../ui";

/** Log out is destructive enough to confirm: it clears the session and drops back to the landing. */
export function LogoutSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Log out">
      <h2 className="mb-1 text-xl font-semibold">Log out?</h2>
      <p className="mb-5 text-sm text-muted">
        Your funds stay in the vault. Reconnect your wallet any time to see them again.
      </p>
      <Button onClick={onConfirm}>Yes, log out</Button>
      <button onClick={onClose} className="mt-3 h-12 w-full text-[15px] font-semibold text-muted">
        Cancel
      </button>
    </BottomSheet>
  );
}
```

Ganti `frontend/app/(app)/account/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Card, Toast } from "../../../components/ui";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { useConsent } from "../../../hooks/useConsent";
import { useNav } from "../../../hooks/useNav";
import { useWallet } from "../../../hooks/useWallet";

const truncate = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export default function AccountPage() {
  const nav = useNav();
  const { address, walletName, disconnect } = useWallet();
  const { enabled } = useConsent();
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (!address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setToast("Address copied");
    } catch {
      // A non-secure context has no clipboard. Say so rather than silently doing nothing.
      setToast("Could not copy address");
    }
    setTimeout(() => setToast(""), 2000);
  };

  const logout = async () => {
    setConfirming(false);
    await disconnect();
    nav.forward("/");
  };

  return (
    <div>
      <div className="pb-1.5 pt-3.5 text-center">
        <Identicon address={address} />
        <button
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EAEAEA] px-3 font-mono text-[13px] font-medium"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {truncate(address)}
        </button>
        {/* The mock reads "· since July 2026", but nothing records when the wallet first connected. */}
        <p className="mt-2.5 text-[13px] text-muted">Connected via {walletName ?? "your wallet"}</p>
      </div>

      <Card className="mt-5 px-5 py-1">
        <button onClick={() => nav.forward("/account/activity")} className="flex w-full items-center gap-3.5 py-3.5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[.04]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </span>
          <span className="grow">
            <span className="block font-semibold">Activity</span>
            <span className="block text-[12.5px] text-muted">All agent and account actions</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-muted" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </Card>

      {/*
        A status row, not a switch. The seam has only `setPolicyConsent()` (idempotent) and
        `hasConsent()` (boolean) — there is no way to turn the mandate off. A real switch spans the
        contract and the keeper: STE-38 / STE-39 / STE-40.
      */}
      <Card className="mt-4 px-5 py-1">
        <div className="flex items-center gap-3.5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[.04]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2" />
            </svg>
          </span>
          <span className="grow">
            <span className="block font-semibold">Auto reinvest rewards</span>
            <span className="block text-[12.5px] text-muted">Yield rewards flow back into your pool</span>
          </span>
          <span data-testid="consent-state" className="text-[15px] font-semibold text-muted">
            {enabled ? "On" : "Off"}
          </span>
        </div>
      </Card>

      <button
        onClick={() => setConfirming(true)}
        className="mt-4 flex h-14 w-full items-center justify-center rounded-full bg-black/[.04] text-base font-semibold text-neg"
      >
        Log out
      </button>

      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
      <Toast open={!!toast} message={toast} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test "app/(app)/account"`
Expected: PASS — 8 tests.

Kalau tes toast gagal karena `navigator.clipboard` read-only di jsdom, ganti `Object.assign(navigator, ...)` dengan `Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/account "frontend/app/(app)/account"
git commit -m "feat(U16): Account — identicon, address copy, consent status, log out (STE-26)"
```

---

### Task 13: Gate akhir + verifikasi di browser

**Files:**
- Tak ada file baru. Ini gate.

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: bukti E2E untuk PR (`pr-e2e-evidence`).

- [ ] **Step 1: Jalankan gate typecheck di seluruh workspace**

Run: `pnpm -r typecheck`
Expected: PASS. `noUncheckedIndexedAccess` aktif — indexed access apa pun yang belum di-guard akan gagal di sini meski tesnya hijau.

- [ ] **Step 2: Jalankan seluruh test suite**

Run: `pnpm -r test`
Expected: PASS. Termasuk suite backend dan `packages/vault-client`, yang tak seharusnya tersentuh U16 — kalau ada yang merah, U16 melanggar batas paketnya.

- [ ] **Step 3: Verifikasi manual di browser**

Run: `pnpm -C frontend dev`

Freighter tak inject di DevTools device-mode, jadi uji di **viewport desktop**. Yang harus terlihat:

1. Wallet belum connect → Earn menampilkan `Earn balance $0.00`, hero APY `8.59% APY`, kartu "Simulate earnings".
2. Ganti currency ke EUR → hero APY jadi `5.10% APY`, proyeksi jadi `€51.00`, bar berubah bentuk.
3. Tekan `+` dua kali → `€2,000`, proyeksi `€102.00`.
4. Ganti period ke Month → proyeksi turun, bar tetap 20.
5. Connect wallet → seed berjalan → Earn beralih ke `Total earned` dengan subline `... balance · 6.87% APY`.
6. Kartu Growth: tab Day menampilkan 24 bar, Week 7 bar, Month/Year 20 bar.
7. Breakdown: 3 baris, klik "Load more" → 6, klik lagi → 9, tombol hilang.
8. Account: identicon muncul, chip address menyalin ke clipboard (toast), `Connected via Freighter`, baris auto-reinvest `Off` sebelum deposit pertama, `Log out` membuka konfirmasi.
9. Deposit pertama → tanda tangan consent → kembali ke Account → baris auto-reinvest kini `On`.

Ambil screenshot before/after untuk setiap layar yang berubah. Kalau nomor 5 menunjukkan APY yang berbeda dari `6.87%`, hitung ulang dari nilai seed sebelum menyimpulkan ada bug: `apy = Σ(usdValue × apy) / Σ usdValue` atas bucket USD (8.59%) dan EUR (5.10%).

- [ ] **Step 4: Commit bukti**

```bash
git add docs/
git commit -m "docs(U16): e2e evidence — dev browser screenshots (STE-26)"
```

- [ ] **Step 5: Buka PR**

Pakai template `pr-e2e-evidence` dari parent STE-7. Sebutkan dua divergensi mock yang disengaja (`· since July 2026` dipotong; auto-reinvest read-only) beserta alasannya, dan tautkan STE-38/39/40 sebagai jalur menuju switch sungguhan.

---

## Catatan untuk pelaksana

**Urutan itu penting.** Task 1–3 membangun seam data; Task 4–9 layar Earn; Task 10–12 Account. Task 6 sengaja menyentuh `earn/page.tsx` sebelum Task 9 — cabang funded tetap memakai hero U14 sampai Task 9 menggantinya, jadi setiap task berakhir dengan aplikasi yang bisa dijalankan.

**Jangan menambah fitur di luar plan ini.** Aturan `frontend/CLAUDE.md`: sebelum menambah fitur/scope di luar unit, bikin tiket Linear, mention `@axelmatsama`, tunggu ACC. Berlaku juga untuk "kayaknya switch auto-reinvest gampang deh" — tidak, itu STE-38/39/40.

**Kalau sebuah assertion R11 gagal, jangan longgarkan regex-nya.** Cari teks yang memicunya. Invarian ini adalah alasan produk ini ada.
