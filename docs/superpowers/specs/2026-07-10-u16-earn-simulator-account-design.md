# U16 — Earn simulator + Account UI (no risk labels)

- **Linear:** [STE-26](https://linear.app/steries-stellar-hackathon-apac/issue/STE-26) (parent [STE-7](https://linear.app/steries-stellar-hackathon-apac/issue/STE-7))
- **Requirements:** R11, R14, R15
- **Design source of truth:** `docs/mockups/sorosense-mock-2.html` — `#v-earn`, `#v-account`
- **Depends on:** U13 (shell/primitives), U14 (buckets, contributions), U15 (activity, exit review) — semuanya sudah di `main`

## Goal

Tab **Earn** dua state — empty (simulator deterministik + currency selector) dan funded
("Total earned" + Growth chart + breakdown per-bulan) — plus tab **Account** yang ramping.
Tanpa label risiko di mana pun. Read-only: tak ada path eksekusi baru dari kedua tab.

## Constraints yang membentuk desain

**Frontend tidak bisa memanggil backend.** Belum ada HTTP API; `frontend/package.json` hanya
bergantung pada `@sorosense/vault-client`. Jadi `getEarnings()` (`backend/src/api/earnings.ts`) dan
`simulate()` (`backend/src/api/simulate.ts`) **dicerminkan** di `frontend/lib/`, mengikuti pola U14
(`frontend/lib/vault/contributions.ts` mencerminkan `backend/src/earnings/cost-basis.ts`).

**Frontend tak punya deret waktu share-price.** `snapshotter.ts` hanya hidup di backend. Maka
`chart` dan `monthly` berasal dari fixture, sementara headline dihitung hidup dari vault seam.

**Consent tak punya event on-chain** (ditegaskan Axel di [STE-36](https://linear.app/steries-stellar-hackathon-apac/issue/STE-36)).
Seam hanya menyediakan `setPolicyConsent()` (idempoten) dan `hasConsent()` (boolean). Tak ada cara
mematikan consent, dan tak ada timestamp kapan ia diberikan.

## Invarian (tidak boleh dilanggar)

- **R11 — safety is invisible.** Nol label/tier/score risiko. Tak ada string `Safe` / `Watch` /
  `risk` / `score` pada surface mana pun. Diuji dengan assertion eksplisit.
- **User memilih currency, agent memilih pool.** Tak ada pool selector. `simulate()` versi frontend
  tidak mengembalikan `poolId`.
- **Tak ada chatbot.** Simulator adalah matematika deterministik.
- **Buckets per-currency, tak pernah dikonversi.** Proyeksi simulator dinyatakan dalam currency
  bucket. Blended-USD hanya untuk tampilan (R3).
- **Read-only.** Satu-satunya tombol yang menulis adalah `Deposit` / `Move to wallet`, yang merutekan
  balik ke flow U14/U15 yang sudah ada.

## Arsitektur

Seam data satu pintu, komponen bodoh, halaman tipis.

### `frontend/lib/earn/simulate.ts`

Port tipis dari `backend/src/api/simulate.ts`.

```ts
export const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;
export type PeriodName = keyof typeof PERIOD_DAYS;

export interface SimulateInput { currency: Currency; amount: number; periodDays: number }
export interface SimulateResult {
  currency: Currency; amount: number; periodDays: number;
  apy: number; projectedEarnings: number;
}

export function simulate(input: SimulateInput): SimulateResult;
```

APY berasal dari `getBucketMeta(currency).apy` (`frontend/lib/vault/data.ts`), yang komentarnya sudah
menyatakan *"figures mirror backend catalog (getCatalog)"*. Rumusnya identik dengan backend:
`amount × ((1 + apy/100)^(days/365) − 1)`, dibulatkan ke 2 desimal.

`poolId` **tidak** ada di hasil: UI tak membutuhkannya, dan tak mengembalikannya membuat kebocoran
sinyal pool secara tak sengaja jadi mustahil. `amount` atau `periodDays` negatif → throw, seperti
backend.

### `frontend/lib/earnings/fixtures.ts`

```ts
export function buildEarningsFixture(now: number): {
  chart: ChartPoint[];      // earned kumulatif ternormalisasi (0…1), berakhir tepat di `now`
  monthly: MonthlyEarned[]; // 9 entri, lama→baru, label 'YYYY-MM', earnedUsd ternormalisasi
};
```

Fixture menyimpan **bentuk**, bukan angka absolut: bobot relatif per bulan dan kurva pertumbuhan.
`now` disuntik sebagai parameter mengikuti konvensi backend *"pass a `clock: () => number`"* — tes
memakai epoch tetap, produksi memakai `Date.now()` setelah mount. Tipe `ChartPoint` /
`MonthlyEarned` di-redeklarasi lokal dengan bentuk identik dengan `backend/src/api/earnings.ts`
(frontend tak boleh mengimpor dari `backend`).

**Resolusi `chart` tidak seragam:** per-jam untuk 7 hari terakhir, per-hari untuk sisanya
(≈ 168 + 260 ≈ 430 titik). Jendela `day` membutuhkan titik sub-harian; menyeragamkannya ke per-jam
sepanjang 9 bulan berarti ~6.500 titik tanpa satu pun bar tambahan yang bisa dilihat. Backend akan
mengirim deret apa adanya dari `snapshotter.ts`; konsumen chart sudah harus tahan resolusi
tak-seragam, jadi fixture yang mensimulasikannya adalah cermin yang lebih jujur ketimbang grid rapi.

### `frontend/hooks/useEarnings.ts`

Mengembalikan `{ loading: boolean; view: EarningsView }`, dengan `EarningsView` berbentuk **persis**
seperti milik backend:

```ts
interface EarningsView {
  hasDeposit: boolean;
  balanceUsd: number;
  apy: number;
  earnedUsd: number;
  buckets: BucketBreakdown[];  // { currency, nativeValue: bigint, usdValue: number }
  chart: ChartPoint[];
  monthly: MonthlyEarned[];
}
```

Hybrid disembunyikan di dalam hook. Halaman tak tahu mana yang hidup dan mana fixture; ketika HTTP
API mendarat, yang diganti hanya isi hook.

Agar klaim itu benar-benar berlaku, `useEarnings.ts` **me-re-export** `ChartPoint` dan `MonthlyEarned`.
Komponen mengimpor tipe dari hook, bukan dari `lib/earnings/fixtures` — kalau tidak, menghapus fixture
saat HTTP API mendarat akan ikut merusak `GrowthCard` dan `MonthlyBreakdown`. Konsumen bergantung pada
seam, bukan pada fixture yang kebetulan menopangnya hari ini.

**Dihitung hidup** dari `useBuckets()` + `getContributions()` + `getFxRateToUsd()`:

- `hasDeposit` — ada bucket bernilai > 0.
- `balanceUsd` — `Σ buckets[].usdValue`.
- `earnedUsd` — `Σ max(0, (value − contributions) / UNIT × fx)`, per bucket, lalu dijumlah. Yield
  native disummasi ke USD; pergerakan FX tak pernah dihitung sebagai earnings (R6/R7).
- `apy` — value-weighted: `Σ(usdValue × apy) / Σ usdValue` (R5), bukan rata-rata polos.
- `buckets` — drill-down per-kantong; `usdValue` menjumlah ke `balanceUsd` (R4).

**Dari fixture, diskalakan ke angka hidup:** `chart` dan `monthly` dikalikan `earnedUsd` sehingga
titik terakhir `chart` dan `Σ monthly[].earnedUsd` sama persis dengan `earnedUsd`. Tanpa penskalaan,
hero bisa menampilkan $176.56 sementara breakdown di kartu yang sama menjumlah ke angka lain.

### `frontend/hooks/useConsent.ts`

`{ loading, enabled }` dari `client.hasConsent(address)`. **Fail-closed:** panggilan yang gagal
menghasilkan `enabled: false`, bukan crash dan bukan `true` optimistis.

### Komponen

| File | Peran |
| --- | --- |
| `components/simulator/Simulator.tsx` | currency selector, amount stepper, angka proyeksi, `<Bars>`, period segmented |
| `components/earn/Bars.tsx` | `<Bars values={number[]} />`, normalisasi ke maksimum, `aria-hidden` |
| `components/earn/GrowthCard.tsx` | `<Bars>` + period segmented + `<MonthlyBreakdown>` |
| `components/earn/MonthlyBreakdown.tsx` | 3 baris + "Load more" (+3) |
| `components/account/Identicon.tsx` | grid 5×5 simetris deterministik; fungsi murni `identiconCells(address): boolean[]` |
| `components/account/LogoutSheet.tsx` | `BottomSheet` konfirmasi log out |

Halaman: `app/(app)/earn/page.tsx` bercabang di `view.hasDeposit`; `app/(app)/account/page.tsx`
(kini stub `<h1>Account</h1>`) diisi penuh.

## Earn — empty state

Menggantikan onboarding U14. Mengikuti `#earnEmpty` di mock-2.

```
        Earn balance
          $0.00
    ▁▃▅  8.59% APY          ← APY currency yang dipilih di simulator

     [  Start earning  ]
  🔒 No lockup, move to your wallet anytime

  ┌─ Simulate earnings ───── [− $1,000 +] ─┐
  │  ( USD )( EUR )( MXN )                  │
  │  You would earn                         │
  │  $85.90                                 │
  │  ▁▂▃▄▅▆▇█                               │
  │  [ Day ][ Week ][ Month ][ Year ]       │
  └─────────────────────────────────────────┘
```

State `currency` diangkat ke `earn/page.tsx`: APY di hero dan APY simulator adalah nilai yang sama.

- Amount: step 500, awal 1.000, clamp `[500, 1_000_000]`.
- Simbol ikut currency (`$` / `€` / `MX$`). Proyeksi dalam currency bucket, tak pernah dikonversi.
- Period default `year`.
- Bar simulator: 20 sampel kurva pertumbuhannya sendiri —
  `amount × ((1 + apy/100)^(t · days/365) − 1)` untuk `t = 1/20 … 1`. Berubah tiap kali amount,
  currency, atau period diubah.
- `Start earning` → `/add-funds` (flow U14).

## Earn — funded state

```
        Total earned
         $176.56
  $2,048.62 balance · 7.10% APY
       [ All buckets ⌄ ]

  [  Deposit  ] [ Move to wallet ]

  ┌─ Growth ───────────────────────┐
  │  ▁▂▃▄▅▆▇█                      │
  │  [ Day ][ Week ][ Month ][Year]│
  │  ─────────────────────────────  │
  │  This month          +$38.34   │
  │  November           +$122.14   │
  │  October            +$113.54   │
  │        Load more ⌄             │
  └────────────────────────────────┘
```

**Hero.** Label `Total earned` (dipertahankan dari U14 — tak ambigu di atas angka kumulatif), subline
mengikuti mock: `$2,048.62 balance · 7.10% APY`. Ini memakai `apy` blended dari `EarningsView` (R5),
yang sebelumnya hanya muncul di Home.

**BucketToggle** (sudah ada dari U14) menyetir hero saja: `earned`, `balance`, `apy` berganti antara
*All buckets* dan tiap bucket.

**Kartu Growth tidak ikut BucketToggle.** `chart` dan `monthly` selalu blended-USD semua bucket, sama
seperti `getEarnings()` yang mengembalikan satu timeline blended, bukan satu per bucket. Kartu yang
ikut toggle berarti mengarang data yang backend tak punya.

**Period segmented** memilih jendela chart. Bar merender **earned per-interval** (delta antar titik
kumulatif), bukan nilai kumulatif — chart kumulatif atas jendela pendek menghasilkan 20 bar setinggi
nyaris sama dan terlihat rusak.

| Period | Jendela | Bar |
| --- | --- | --- |
| `day` | 24 jam terakhir | 24 bar per-jam |
| `week` | 7 hari terakhir | 7 bar per-hari |
| `month` | 30 hari terakhir | 30 hari → resample ke 20 bar |
| `year` | seluruh rentang fixture (9 bulan) | resample ke 20 bar |

Jendela selalu di-clamp ke data yang ada — tak pernah mengarang titik sebelum titik pertama. Ini yang
dimaksud komentar `EarningsView.chart`: *"the frontend buckets it by Day/Week/Month/Year (R8)"*.

**Breakdown.** `monthly` dibalik jadi baru→lama. Label `YYYY-MM` diformat:

| Kondisi | Render |
| --- | --- |
| bulan berjalan | `This month` |
| bulan lain, tahun yang sama | `November` |
| tahun sebelumnya | `November 2025` |

Tampil 3 baris, "Load more" menambah 3, fixture 9 bulan, tombol hilang saat daftar habis.

## Account

```
        ▓░▓░▓
        ░▓▓▓░          ← Identicon, deterministik dari address
        ▓▓░▓▓
       [ ⧉ GABC…K3X9 ]  ← tap → copy → Toast "Address copied"
       Connected via Freighter

  ┌────────────────────────────────────────┐
  │ ☰  Activity                         ›  │  → /account/activity
  │    All agent and account actions        │
  └────────────────────────────────────────┘
  ┌────────────────────────────────────────┐
  │ ↻  Auto reinvest rewards           On  │  ← baris status, read-only
  │    Yield rewards flow back into your pool │
  └────────────────────────────────────────┘

       [        Log out        ]
```

**Divergensi dari mock — `· since July 2026` dipotong.** Tak ada sumber untuk tanggal itu: seam tak
menyimpan waktu connect pertama. Yang di-render hanya `Connected via Freighter`, dengan nama wallet
dibaca dari `useWallet()` sehingga xBull/Lobstr tampil benar.

**Divergensi dari mock — auto-reinvest adalah baris status, bukan switch.** Seam hanya punya
`setPolicyConsent()` (idempoten, tanpa tier — KTD3); tak ada cara mematikan. Baris me-render
`On`/`Off` dari `useConsent()`. Switch sungguhan adalah fitur lintas-layer yang sudah punya tiket dan
berjalan paralel: [STE-38](https://linear.app/steries-stellar-hackathon-apac/issue/STE-38) (parent,
PM), [STE-39](https://linear.app/steries-stellar-hackathon-apac/issue/STE-39) (smart-contract),
[STE-40](https://linear.app/steries-stellar-hackathon-apac/issue/STE-40) (backend keeper). Bukan
blocker U16; setelah seam mendarat, tiket frontend kecil menukar baris status jadi switch.

`Activity` → `/account/activity` (halaman U15 yang sudah ada, filter All/Yours/Automated).
`Log out` → `LogoutSheet` → `disconnect()` dari `useWallet()` → kembali ke landing `/`.

## Hydration (KTD7)

`buildEarningsFixture(now)` bergantung pada `Date.now()`, dan `useConsent` memanggil seam. Keduanya
dijalankan setelah mount di dalam `useEffect` — tak pernah di module scope maupun saat render
pertama. SSR memprerender state `loading`, persis seperti `useBuckets()` hari ini.

## Error handling

- `useEarnings` bersandar pada `loading` milik `useBuckets()`; fixture murni sinkron dan tak bisa gagal.
- `useConsent` fail-closed → `Off` saat `hasConsent()` menolak.
- `navigator.clipboard` absen (konteks non-secure) → Toast memunculkan pesan gagal, bukan exception.

## Testing

Vitest + RTL, mengikuti `frontend/app/(app)/earn/__tests__/earn.test.tsx`.

| Subjek | Yang dibuktikan |
| --- | --- |
| `lib/earn/simulate` | proyeksi identik dengan `backend/src/api/simulate.ts` untuk (USD, 1000, 365); `periodDays = 0` → 0; amount negatif → throw |
| `lib/earnings/fixtures` | `buildEarningsFixture(epoch)` deterministik; `monthly` panjang 9, urut lama→baru, label `YYYY-MM`; `chart` monoton naik, titik terakhir ber-`ts === epoch` |
| `GrowthCard` | tiap period merender jumlah bar yang benar (24/7/20/20); jendela di-clamp saat fixture lebih pendek dari jendela |
| `hooks/useEarnings` | **R4** `Σ buckets[].usdValue === balanceUsd`; **R5** `apy` value-weighted bukan rata-rata polos; titik terakhir `chart` === `earnedUsd` === `Σ monthly[].earnedUsd`; `hasDeposit` false saat semua bucket kosong |
| `earn/page` | switch empty↔funded; ganti currency mengubah APY hero *dan* proyeksi; ganti period mengubah proyeksi; **R11** tak ada teks `Safe`/`Watch`/`risk`/`score` di kedua state; tak ada tombol yang menandatangani apa pun |
| `MonthlyBreakdown` | 3 baris → klik "Load more" → 6 → klik lagi → 9, tombol hilang |
| `Identicon` | address sama → sel sama; address beda → sel beda; grid simetris horizontal |
| `account/page` | auto-reinvest `On` saat `hasConsent` true, `Off` saat false/rejected; Log out membuka sheet, konfirmasi memanggil `disconnect` |

Gate: `pnpm -r typecheck` (strict, `noUncheckedIndexedAccess`) **dan** `pnpm -r test`. Tes lulus tidak
berarti typecheck lulus.

## Verification (STE-26)

Earn + Account merender hasil yang mencerminkan backend; user hanya memilih currency (bukan pool);
tanpa label risiko; tanpa path eksekusi dari kedua tab. Bukti E2E lewat template `pr-e2e-evidence`
(screenshot before/after, viewport desktop — Freighter tak inject di DevTools device-mode).
