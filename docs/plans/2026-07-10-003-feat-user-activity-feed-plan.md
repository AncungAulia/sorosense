---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
type: feat
product_contract_source: ce-plan-bootstrap
origin_ticket: STE-42
parent: STE-5
date: 2026-07-10
---

# feat: Backend source-of-truth untuk riwayat aksi user (Activity "Yours")

## Summary

Halaman Activity terpusat punya filter **All / Yours / Automated**, tapi baris "Yours" hanya
berjalan di atas fixture frontend (`frontend/lib/vault/data.ts`, `cat: "you"`). Sumber sungguhannya
— `backend/src/api/activity.ts` (`ActivityLog`) — **hanya mencatat aksi agent**: tak ada field aktor,
dan `list()` tak menerima identitas user. Begitu Activity dicolok ke `activity()` asli, tab "Yours"
akan **kosong tanpa satu tes pun gagal** — kegagalan yang tak berbunyi.

Plan ini membuat **backend jadi source-of-truth satu-feed** untuk riwayat aksi user
(deposit / withdraw / sign-mandate / approve-exit), mengikuti pola STE-37 (backend read = sumber
kebenaran, frontend berhenti hardcode). Aksi user diturunkan dari **satu stream `UserActionEvent`
injektabel** (deterministik, real reader ditunda ke integrasi U20 seperti `cost-basis.ts`), diberi
penanda `actor: 'you'`, lalu digabung dengan feed agent (`actor: 'agent'`) oleh satu read
`getActivity()` yang deterministik dan bisa difilter All/Yours/Automated.

**Product Contract preservation:** tak ada Product Contract upstream (bootstrap dari tiket STE-42);
plan ini tidak mengubah perilaku produk apa pun di luar tiket.

---

## Problem Frame

- **Bentuknya, bukan cuma datanya, yang salah.** `ActivityEntry` tak punya field aktor dan
  `list(currency?, limit?)` tak pernah tahu depositor — jadi tak bisa menjawab "aksi mana yang
  dilakukan user X?".
- **Aksi user ≠ append agent.** Feed agent diisi lewat `ActivityLog.append()` yang dipanggil agent
  saat ia bertindak. Aksi user datang dari transaksi on-chain (deposit/withdraw/consent/approve-exit),
  bukan dari append yang dipanggil agent — jadi butuh sumber terpisah yang diturunkan dari event.
- **Consent & approve-exit belum punya event.** `VaultEvent` di `cost-basis.ts` hanya memodelkan
  deposit/withdraw. sign-mandate & approve-exit perlu representasi event sendiri.
- **Kegagalan senyap.** Tes frontend jalan di atas fixture-nya sendiri, jadi feed "Yours" yang kosong
  tak akan menggagalkan tes apa pun. DoD menuntut ada tes yang **berbunyi**.

---

## Requirements

- **R-UA1** — Backend bisa menjawab "aksi mana yang dilakukan user X" untuk deposit / withdraw /
  sign-mandate / approve-exit.
- **R-UA2** — Satu feed dengan penanda aktor (`'you' | 'agent'`) yang memetakan langsung ke filter UI
  All / Yours / Automated.
- **R-UA3** — Feed deterministik: urut by monotonic sequence, bukan wall clock.
- **R-UA4** — Read-only: tak ada tulis on-chain di `backend/src/api/*`.
- **R-UA5** — Tanpa field / teks `risk` / `label` / `score` / tier di hasil (R11, invarian repo).
- **R-UA6** — Deterministik/injectable: event aksi-user di-inject sebagai input; real reader ditunda
  ke integrasi (U20), meniru pola `cost-basis.ts`.
- **R-UA7** — Ada tes yang **gagal** kalau feed user kosong padahal user pernah deposit.

---

## Key Technical Decisions

### KTD1 — Backend-extend (satu feed source-of-truth), bukan frontend-derive

`activity()` diperluas jadi sumber kebenaran satu-feed dengan field aktor. Konsisten dengan filosofi
repo (read surface = backend source-of-truth) dan pola STE-37. Ditolak: frontend derive on-chain —
gagal cover consent & approve-exit (tak ada event di stream deposit/withdraw), memindah logika riwayat
ke frontend, dan melanggar pola source-of-truth. **Di-ACC user.**

### KTD2 — Satu stream `UserActionEvent` injektabel

Satu tipe event yang menyatukan keempat aksi user, di-inject sebagai input; real reader ditunda ke
U20. Konsisten dengan pola deterministik/injectable `cost-basis.ts`. **Di-ACC user.**

Ditolak: (a) perluas `VaultEvent` milik cost-basis — consent/approve-exit tak punya shares/amount,
mengotori tipe yang dipakai perhitungan earned dan meng-couple activity ke cost-basis; (b) sumber
event terpisah per jenis — 4 permukaan inject, lebih ribet dites, tanpa payoff di fase mock.

Bentuk directional (bukan spesifikasi implementasi):

```ts
type UserActionEvent =
  | { kind: 'deposit';      depositor: Address; currency: Currency; amount: Amount; seq: number; ts?: number }
  | { kind: 'withdraw';     depositor: Address; currency: Currency; amount: Amount; seq: number; ts?: number }
  | { kind: 'sign-mandate'; depositor: Address; seq: number; ts?: number }                       // consent
  | { kind: 'approve-exit'; depositor: Address; currency: Currency; seq: number; ts?: number };
```

`sign-mandate` & `approve-exit` tak punya `currency`/`amount` yang sama — `sign-mandate` global
(consent per-depositor, tak per-currency); `approve-exit` per-currency tanpa amount. Modul derive
menangani ketiadaan field ini secara eksplisit.

### KTD3 — Field aktor pada `ActivityEntry`, filter memetakan langsung

`actor: 'you' | 'agent'` ditambahkan ke `ActivityEntry`. `ActivityLog.append()` mengisi default
`'agent'` (semua caller agent lama tetap benar tanpa perubahan). Filter UI: All = semua, Yours =
`actor==='you'`, Automated = `actor==='agent'`.

### KTD4 — Penggabungan deterministik lewat sequence tunggal

Feed agent (`ActivityLog`, seq internal) dan feed user (`UserActionEvent.seq`) digabung dan diurut by
`seq` menurun. Karena kedua sumber pakai monotonic seq yang sama-ruang saat integrasi nyata, ordering
tetap deterministik. Di fase mock, `getActivity` mengurut gabungan by `seq` (tie-break by aktor lalu
kind agar total-order stabil). **Catatan implementasi:** dokumentasikan asumsi seq-space ini; kalau
dua sumber punya ruang seq terpisah saat integrasi, penyatuan seq jadi pekerjaan U20.

---

## Implementation Units

U1 dan U2 **paralel-safe** — file disjoint, tanpa dependensi antar-keduanya. U3 menggabungkan
keduanya. Frontend (matikan fixture) di luar scope backend ini — lihat Scope Boundaries.

### U1. Modul derive user-activity (murni, dari `UserActionEvent`)

- **Goal:** Ubah stream `UserActionEvent` jadi baris riwayat aksi user (`actor: 'you'`), murni &
  deterministik.
- **Requirements:** R-UA1, R-UA3, R-UA5, R-UA6, R-UA7 (menyediakan sumber "Yours").
- **Dependencies:** none (file baru, tipe sendiri).
- **Files:**
  - `backend/src/api/user-activity.ts` (baru) — `UserActionEvent`, `UserActivityEntry`
    (bentuk sejajar `ActivityEntry` tanpa `id` gabungan), `deriveUserActivity(events): UserActivityEntry[]`.
  - `backend/src/api/user-activity.test.ts` (baru).
- **Approach:** Sort salinan event by `seq` (input order tak penting, seperti `reconstructCostBasis`).
  Map tiap event → satu baris dengan `detail` plain-language tanpa teks risiko (mis. deposit →
  `"Deposited to USD bucket"`, withdraw → `"Withdrew from EUR bucket"`, sign-mandate →
  `"Signed auto-optimize mandate"`, approve-exit → `"Approved a safe exit for MXN"`). Simpan `depositor`,
  `currency?` (absen untuk sign-mandate), `kind`, `seq`, `ts?`. Tak ada tulis, tak ada I/O. Hindari
  indexed access yang bocor `undefined` (gunakan iterasi/`for...of`, bukan `arr[i]`).
- **Patterns to follow:** `backend/src/earnings/cost-basis.ts` (event injektabel, sort by seq, pure);
  `backend/src/api/activity.ts` (bentuk `ActivityEntry`, `detail` plain-language).
- **Test scenarios:**
  - Happy: satu deposit → satu baris `actor:'you'`, kind `'deposit'`, currency & detail benar.
  - Keempat kind (deposit/withdraw/sign-mandate/approve-exit) → detail benar, sign-mandate tanpa
    currency.
  - Determinisme: input teracak by `seq` → output identik dengan input terurut (urut by seq).
  - Multi-user: event dua depositor → tiap baris membawa depositor yang benar; filter per-depositor
    memungkinkan di U3.
  - Invarian: tak ada baris yang `detail`-nya cocok `/\b(risk|risks|risky|tier|tiers|score|scores)\b/i`.
  - Edge: stream kosong → `[]`.
- **Verification:** `deriveUserActivity` mengembalikan baris per event, terurut deterministik, tanpa
  teks risiko; unit test hijau.

### U2. Field aktor pada feed agent (`ActivityLog`)

- **Goal:** Tambah `actor: 'you' | 'agent'` ke `ActivityEntry`; `append()` default `'agent'`.
- **Requirements:** R-UA2, R-UA4 (append tetap in-memory, tanpa tulis on-chain).
- **Dependencies:** none (file disjoint dari U1).
- **Files:**
  - `backend/src/api/activity.ts` — tambah `actor` ke `ActivityEntry`; `append` set default `'agent'`
    bila tak disuplai.
  - `backend/src/api/activity.test.ts` — perbarui/verifikasi.
- **Approach:** `actor?: 'you' | 'agent'` pada argumen `append` (opsional), tapi `ActivityEntry.actor`
  wajib terisi (default `'agent'`) agar konsumen selalu punya nilai. Semua caller agent lama tetap
  benar tanpa diubah. `list()` tetap apa adanya (agent-only view masih valid untuk Home "Agent
  activity"). Tak ada perubahan perilaku ordering.
- **Patterns to follow:** default backward-compatible seperti gaya seam (field opsional pada input,
  wajib pada hasil).
- **Test scenarios:**
  - `append()` tanpa `actor` → entri tersimpan `actor:'agent'`.
  - `append({ actor:'you' })` → entri tersimpan `actor:'you'` (memungkinkan sumber lain menyuntik).
  - Tes lama `ActivityLog` (ordering, list, filter currency) tetap hijau.
  - Tipe: `ActivityEntry.actor` non-opsional di hasil (typecheck menegakkan).
- **Verification:** `pnpm -C backend typecheck` bersih; entri agent membawa `actor:'agent'` default;
  test hijau.

### U3. Composing read `getActivity()` — merge agent + user, filter aktor

- **Goal:** Satu read deterministik yang menggabungkan feed agent + feed user jadi satu daftar dengan
  filter All / Yours / Automated dan filter per-depositor.
- **Requirements:** R-UA1, R-UA2, R-UA3, R-UA5, R-UA7.
- **Dependencies:** U1, U2.
- **Files:**
  - `backend/src/api/activity-feed.ts` (baru) — `getActivity({ depositor?, actor?, currency?, limit? }, deps)`
    di mana `deps = { log: ActivityLog, userEvents: UserActionEvent[] }` (injektabel).
  - `backend/src/api/activity-feed.test.ts` (baru).
- **Approach:** Ambil entri agent dari `log.list()` (sudah `actor:'agent'`); turunkan entri user via
  `deriveUserActivity(userEvents)`; kalau `depositor` diberi, saring baris user ke depositor itu.
  Satukan jadi satu bentuk baris berdenominasi aktor, urut by `seq` menurun (tie-break stabil), lalu
  terapkan `actor` filter (All=tanpa filter, Yours=`'you'`, Automated=`'agent'`) dan `limit`. Tanpa
  tulis on-chain. Dokumentasikan asumsi seq-space (KTD4).
- **Patterns to follow:** `backend/src/api/holdings.ts` / `earnings.ts` (read composer injektabel,
  `deps` di-pass in); `activity.ts` (ordering by seq, most-recent-first).
- **Test scenarios:**
  - **Covers R-UA7 (loud test):** user X pernah deposit + filter `actor:'you'` (depositor X) →
    hasil TIDAK kosong; assert baris deposit muncul. Ini tes yang gagal kalau feed user hilang.
  - All → gabungan agent + user, terurut deterministik by seq.
  - Yours (depositor X) → hanya `actor:'you'` milik X; aksi depositor lain tak bocor.
  - Automated → hanya `actor:'agent'`.
  - Determinisme: seq gabungan menghasilkan urutan stabil lintas pemanggilan.
  - Invarian: seluruh `detail` hasil tak cocok pola risiko/label/score/tier.
  - `limit` menghormati potong most-recent-first.
  - Edge: `userEvents` kosong tapi ada aksi agent → Yours = `[]`, All = feed agent saja (tak error).
- **Verification:** `getActivity` menjawab "aksi user X", filter aktor benar, deterministik, tanpa teks
  risiko; test hijau termasuk loud test.

---

## Scope Boundaries

**In scope (backend, track STE-5):**
- U1–U3 di atas: sumber kebenaran satu-feed dengan penanda aktor + read yang bisa difilter.

### Deferred to Follow-Up Work
- **Frontend: matikan fixture `cat:"you"`** di `frontend/lib/vault/data.ts` dan colok halaman
  `frontend/app/(flow)/account/activity/page.tsx` ke `getActivity()`. Milik track frontend (Ancung);
  butuh HTTP surface / seam read (lihat di bawah). Buat sub-tiket frontend saat backend mendarat.
- **Real event reader** (`UserActionEvent` dari chain) — ditunda ke **U20 / STE-21** (integrasi
  testnet), seperti reader `cost-basis.ts`. Plan ini murni lawan event yang di-inject.
- **HTTP/transport** untuk `getActivity` (kalau frontend konsumsi lewat HTTP, bukan import langsung) —
  ikut jalur integrasi yang sama dengan read lain (holdings/earnings).

**Out of scope:**
- Mengubah perilaku agent-feed `append` yang ada (selain default aktor).
- Perhitungan cost-basis/earnings (tipe `VaultEvent`-nya sengaja tak disentuh — lihat KTD2).

---

## Verification Contract

- `pnpm -C backend typecheck` bersih (strict, `noUncheckedIndexedAccess`).
- `pnpm -C backend test` hijau, termasuk:
  - `user-activity.test.ts`, `activity.test.ts`, `activity-feed.test.ts`.
  - **Loud test** (R-UA7): feed "Yours" tidak kosong saat user pernah deposit — gagal bila sumber user
    hilang.
  - Scan invarian: tak ada `detail` hasil yang cocok `/\b(risk|risks|risky|tier|tiers|score|scores)\b/i`.
- Tak ada import baru dari `backend` di `packages/vault-client` (arah dependensi tetap).

## Definition of Done

- `getActivity()` bisa menjawab "aksi mana yang dilakukan user X" untuk keempat aksi.
- Feed membawa penanda aktor yang memetakan langsung ke All / Yours / Automated.
- Ada tes yang **gagal** kalau feed user kosong padahal user pernah deposit.
- Read-only, deterministik by seq, tanpa field/teks risiko.
- Frontend berhenti bergantung fixture di follow-up (sub-tiket frontend dibuat; bukan gate PR backend).

---

## System-Wide Impact

- **Konsumen `ActivityEntry`:** menambah `actor` (wajib pada hasil) adalah perluasan aditif; caller
  agent lama tak berubah karena default `'agent'`. Cek typecheck seluruh workspace (`pnpm -r typecheck`)
  untuk menangkap konsumen tak terduga.
- **Frontend:** begitu `getActivity` tersedia, fixture `cat:"you"` bisa mati — koordinasi dengan
  Ancung via sub-tiket (STE-42 follow-up frontend).
- **Integrasi (U20):** modul derive + composer siap-inject; hanya butuh real `UserActionEvent` reader
  dipasang. Bentuk read tak berubah saat mock → testnet.

## Open Questions (execution-time)

- **Ruang seq lintas-sumber.** Apakah event agent dan event user berbagi satu monotonic seq saat
  integrasi, atau perlu penyatuan? Di fase mock, `getActivity` mengurut by `seq` gabungan; kalau
  ruangnya terpisah saat U20, penyatuan/normalisasi seq jadi pekerjaan U20. Dokumentasikan asumsi,
  jangan diam-diam.
- **Bentuk transport `getActivity`** (import langsung vs HTTP) diputuskan saat frontend/integrasi
  mendarat — tak menghalangi 3 unit backend ini.
