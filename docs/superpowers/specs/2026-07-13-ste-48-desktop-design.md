# STE-48 Fase 1 — Desktop layout & interaction (desktop-native IA)

- **Linear:** [STE-48](https://linear.app/steries-stellar-hackathon-apac/issue/STE-48) (parent [STE-7](https://linear.app/steries-stellar-hackathon-apac/issue/STE-7)) — heads-up ke `@axelmatsama` sudah di-post (arah (2), bukan (1)).
- **Cakupan spec ini:** hanya **Fase 1 (desktop)**. Fase 2 (loading skeletons) dan Fase 3 (motion) dispec terpisah, belakangan.
- **Design source of truth:** `docs/mockups/sorosense-mock-2-desktop.html` (canonical; draft vN sudah dihapus). Mobile tetap `docs/mockups/sorosense-mock-2.html` — **tidak berubah**.
- **Component source of truth:** komponen frontend yang sudah ada (`frontend/components/**`). Mock-2 hanya referensi; kalau beda, **kode frontend yang benar**.
- **Depends on:** STE-44 (#24) + STE-43 (#27), keduanya sudah di `main`. Branch mulai bersih dari `origin/main`.

## Goal

App hari ini **100% mobile, nol penanganan desktop** (tak ada `max-w-`, `md:`, `lg:`, `@media` selain `prefers-reduced-motion`). Di laptop — permukaan yang justru dilihat juri karena Freighter adalah ekstensi desktop — nav 1920px mengambang, kartu melar, sheet selebar layar. Ini **cacat, bukan poles**.

Fase 1 memberi app **layout desktop-native sungguhan** (arah (2) dari tiket, bukan phone-frame (1)): satu Overview padat, aksi lewat **drawer kanan** + **dropdown akun**, safe-exit lewat **dialog**. Mobile tak tersentuh. Route tetap sumber kebenaran di dua viewport.

## Constraints yang membentuk desain

**Desktop greenfield.** Tak ada breakpoint, container max-width, atau `useMediaQuery` di seluruh `frontend/`. Tailwind **v4** (config-in-CSS via `@theme` di `app/globals.css`; breakpoint default tersedia tapi belum dipakai). Semua penanganan desktop ditambahkan dari nol.

**Flow yang sudah ada bisa dipakai ulang, tinggal ganti container.** Tiap `app/(flow)/*/page.tsx` adalah wrapper 2 baris; seluruh logika ada di komponen `"use client"` — `AddFunds`, `DepositKeypad`, `WithdrawKeypad`, `ActivityList`, `ExitApproval`. Yang perlu diubah untuk mode drawer hanyalah ~5 titik navigasi (`router.push`/`router.back`) menjadi state internal + callback tutup/refresh, dan `SubHeader` yang hardcode `router.back()`.

**Belum ada primitif overlay selain `BottomSheet`.** Tidak ada portal, tidak ada dropdown/menu, tidak ada focus-trap/Escape di mana pun. Desktop butuh dua primitif baru: `Drawer` (tepi kanan) dan `Dropdown`.

**Bug U14 — `transform` menjadikan leluhur containing block bagi anak `fixed`.** `.page-enter` di `globals.css` sengaja tanpa `animation-fill-mode` agar transform-nya tak menetap. Setiap overlay `fixed` (drawer/dialog) **harus di-portal ke `body`** supaya tak pernah berada di bawah leluhur ber-`transform`.

**Frontend belum memanggil backend.** Data tetap fixture (`frontend/lib/vault/data.ts`): `STABLECOINS`, `getActivity()`, `getWalletBalance()`, `getBucketMeta()`, `getFxRateToUsd()`. `useBuckets()`/`useEarnings()`/`useActivity()` sudah ada. HTTP surface + faucet + saldo trustline nyata adalah **STE-52** (di luar spec ini).

**Toast sudah bekerja lintas-halaman.** `ToastProvider` mounted di root layout (STE-44) — tak perlu apa-apa untuk desktop.

## Invarian (tidak boleh dilanggar)

- **R11 — safety is invisible.** Nol label/tier/score risiko di permukaan mana pun. FreezeBanner & dialog safe-exit memakai bahasa aksi ("paused", "unusual activity", "safe exit") — **bukan** "risk"/"Sentinel"/skor. Diuji dengan assertion eksplisit.
- **Buckets per-currency, tak pernah dikonversi.** Blended-USD hanya tampilan, selalu berlabel `≈ USD` di hero. Deposit/withdraw dinyatakan dalam currency bucket.
- **Read-only tetap read-only.** Satu-satunya penulis on-chain adalah deposit / withdraw / approve-exit — flow yang sudah ada, di-host ulang di drawer/dialog. Auto-reinvest toggle **tetap read-only** (lihat divergensi).
- **Mobile tak berubah.** Semua penambahan desktop di-gate breakpoint (`<640px` = persis seperti sekarang). Tak ada regresi visual/behavior mobile.
- **Primitives DRY.** Perbaikan hidup di `components/ui/` + layout, bukan disalin per layar. Segmented/Switch/ActivityRow/Card yang sudah ada dipakai ulang, tidak di-restyle per-screen.
- **e2e hijau di dua viewport.** Project Playwright desktop baru + journey helper desktop; spec mobile tetap hijau tanpa diubah.

## Arsitektur

Shell responsif, primitif overlay baru, halaman/komponen konten dipakai ulang. URL tetap sumber kebenaran.

### Shell responsif — `app/(app)/layout.tsx`

Hari ini: `<AuthGate><div className="relative min-h-dvh"><TopBlur/><div className="px-5 pb-[120px] pt-14">{children}</div><BottomNav/></div></AuthGate>`.

Desktop menambah, tanpa mengubah cabang mobile:
- **Container max-width** untuk lebar besar: mobile flush (`px-5`), desktop `max-w-[1200px] mx-auto` naik ke `1440px` di `≥1600px` dan `1560px` di `≥1900px` (angka dari mockup `.appwin`).
- **Topbar desktop** (`components/ui/TopBar.tsx`, baru) — brand kiri + avatar-blockies kanan yang membuka **AccountDropdown**. Muncul `≥` breakpoint desktop; `BottomNav` + `TopBlur` disembunyikan di desktop (`hidden` di ≥bp), tetap tampil di mobile.
- **`/earn` tak di-link di desktop** — AMAN. Tak ada `router.push('/earn')` / redirect / cross-link (grep bersih); hanya `BottomNav` + 2 tes yang menyentuhnya. Route tetap resolve untuk mobile & direct-URL. Isi `/earn` (Total earned + GrowthCard + MonthlyBreakdown) diserap Overview desktop.

### Primitif baru — `components/ui/Drawer.tsx`

Kontrak terkontrol identik `BottomSheet` (`{ open, onClose, children, label }`), tapi geometri tepi-kanan dan **di-portal ke `body`** (hindari U14):
```ts
export function Drawer({ open, onClose, children, label }: {
  open: boolean; onClose: () => void; children: ReactNode; label: string;
}): JSX.Element;
```
- `createPortal` ke `document.body`. Scrim `fixed inset-0` + panel `fixed inset-y-0 right-0 w-[min(420px,100vw)]`, geser `translate-x-full`→`0`.
- `role="dialog" aria-modal` **selalu ter-mount** (mengikuti disiplin `BottomSheet`: `aria-hidden={!open}`, tes pakai `getByRole` bukan `[role=dialog]`).
- **Escape menutup** + **focus trap** sederhana + **scroll-lock** body saat open (yang `BottomSheet` sengaja tak punya).
- z-index di atas topbar (topbar `z-50`, scrim `z-60`, drawer `z-61` — dari mockup).

### Primitif baru — `components/ui/Dropdown.tsx`

Menu kecil yang ditambatkan ke trigger (avatar). Bukan portal (kecil, di dalam topbar `position:relative`). Tutup saat klik-luar / Escape. `role="menu"`.

### Halaman & konten dipakai ulang

| File | Perubahan |
| --- | --- |
| `app/(app)/home/page.tsx` | Menjadi responsif: mobile = stack sekarang; desktop = Overview padat (hero split + Buckets + Growth + Agent activity + FreezeBanner). |
| `components/deposit/AddFunds.tsx` + `DepositKeypad.tsx` | Di-host di `Drawer` pada desktop, digabung jadi 2 view internal (pilih FX → nominal). Numpad diganti `<input>` biasa. |
| `components/withdraw/WithdrawKeypad.tsx` | Di-host di `Drawer`; sudah "drawer-shaped" (bucket cycler internal). Numpad → `<input>`. |
| `components/activity/ActivityList.tsx` + `ActivityRow.tsx` | Activity drawer (All/Yours/Automated). `ActivityRow` di-enhance map `kind`→ikon (lihat divergensi). |
| `components/account/AccountMenu.tsx` (baru) | Isi dropdown akun (address copy + Activity + auto-reinvest read-only + Log out). |
| `components/proposal/ExitApproval.tsx` | Di desktop dirender sebagai **dialog terpusat** (bukan `BottomSheet`). |
| `components/status/FreezeBanner.tsx` | Dipakai di Overview desktop apa adanya (sudah card-button kalem). |

### Routing desktop — URL-backed, mobile utuh

Route tetap sumber kebenaran di dua viewport. Desktop **tidak** membuang routing; ia hanya menampilkan ulang route yang sama sebagai overlay.

- **Add-funds / Move-to-wallet / Activity** → mobile tetap route `(flow)` full-page **tak tersentuh**; desktop membuka komponen konten yang **sama** dalam `Drawer` yang **di-drive search-param** (`/home?panel=add-funds` / `?panel=withdraw` / `?panel=activity`) di atas dashboard yang tetap ter-mount. Back/refresh/deep-link/share tetap jalan (STE-43). Tombol bercabang per breakpoint (mobile `nav.forward(route)`, desktop set search-param), konten di-share.
- **Anti-pola:** SPA `useState` murni tanpa URL. Merusak back/deep-link/refresh dan divergen dari mobile. **Dilarang.**
- **Account** = dropdown (bukan route, bukan drawer) — menu kecil, state lokal, tak perlu URL.
- **Safe-exit** = dialog dari `?panel=exit` atau state; tombol pemicu (FreezeBanner + Review di Activity) membukanya.

## Overview desktop — `home` (≥ desktop bp)

Pinned ke `docs/mockups/sorosense-mock-2-desktop.html`. Kartu = `Card` yang sudah ada (border `#fff`, bg `--card`, `sh-card`) di atas **background flat** `#F1F1F2` (bukan gradient). Monokrom + aksen hijau.

```
┌───────────────────────────────────────────────────────────────┐
│ ◧ SoroSense                                        (blockies) ▾ │  topbar
├───────────────────────────────────────────────────────────────┤
│ ⚠ Your earning is paused · Review and approve   [ Review ]     │  FreezeBanner (conditional: usePendingExit)
├─────────────────────────────┬─────────────────────────────────┤
│ YOUR VALUE   [Total|Earned] │            [D][W][M][Y]         │
│ $2,048.62  ↗+$176.56  ⇅     │      ╭─ organic green area ─╮   │  HERO (split, no divider)
│ 7.10% APY · across 3 buckets│      │   line + soft fill    │   │
│ Earned this month ~$38.34 USD│     ╰───────────────────────╯   │
│ [ Add funds ] [ Move to wallet ]                              │
├──────────────┬──────────────┬─────────────────────────────────┤
│ Buckets      │ Growth       │ Agent activity        View all › │  3 kartu, hug-content
│ USD $1,024.30│ ▁▃▅▇ bars    │ ↑ Switched to DeFindex           │
│ EUR €920.10  │ Jul (accent) │ ⭢ Proposed safe exit  [Review]   │
│ MXN $545.00  │              │ + Allocated to Blend             │
└──────────────┴──────────────┴─────────────────────────────────┘
```

**Semantik yang di-pin (plan-shape — reviewer hanya cek yang disebut):**
- **Segmented FLAT** (Total/Earned + D/W/M/Y): pressed = `bg-pill text-pill-ink`, idle `text-[#8a8a8a]`, **tanpa track, tanpa white raised pill** — persis `Segmented.tsx`. (Divergensi yang dulu Axel tangkap — jangan ulangi white pill.)
- **Hero-left sub-stat = SATU baris** "Earned this month" (hijau, `~$amt USD` untuk blended; native tanpa tilde untuk bucket tunggal). Bukan card, bukan di-center. Ini melengkapi cerita: pill = all-time earned, baris ini = bulan ini. `~$38.34 USD` nyambung ke bar "This month" di kartu Growth.
- **Chart hero = line/area hijau** (trajektori nilai), **Growth = bars hijau** (earning per-bulan diskrit; bar bulan-berjalan = aksen terang). Panah = *earnings gain*, bukan risk → invisible-safety aman.
- **Sub-stat & value blended selalu `≈ USD`.** Bucket names: `USD/EUR/MXN bucket`. MXN simbol `$` (bukan MX$) — dari `units.ts`.
- **Data nyata** (dari `useBuckets`/`getBucketMeta`): USD→DeFindex/Vault 8.59%, EUR→Blend/Fixed pool 5.10%, MXN→Etherfuse/CETES 5.57%.

Mobile Overview (`<640px`) = persis Home sekarang (TotalHero + FreezeBanner + Add funds + Buckets + Agent activity preview).

## Add-funds drawer (desktop)

Mirror mobile `AddFunds`+`DepositKeypad`, digabung jadi 2 view internal di satu `Drawer`.

- **Step 1 — pilih FX:** header "Add funds". List `STABLECOINS` (USDC/EURC/CETES): coin badge (currency code) + simbol stablecoin + chain chips + chevron. **Tanpa RWA, tanpa chip-seg.**
- **Step 2 — nominal:** header **"Deposit {SYM}"** dengan **chevron-kiri** balik ke Step 1. Kartu atas = **saldo wallet** (`9,076.00 USDC` dari `getWalletBalance()` — **tanpa** subtitle "in your wallet", tanpa "Goes to your…", tanpa proyeksi). `<input>` (bukan numpad) + quick 10/50/Max dari saldo wallet. Tombol "Deposit" → sign (+ `ConsentSheet` inline bila deposit pertama) → toast + tutup drawer + refresh buckets.
- **Reserved (STE-52):** saat mode integrasi & saldo trustline = 0, kartu saldo diganti tombol **"Get test funds"** (env-gated, mati di mainnet). **Tidak diimplement di STE-48** — hanya slot-nya disiapkan di step 2.
- **NO Review step, NO Done-screen wajib** (real flow: amount → sign → toast). Mock menampilkan konfirmasi ringkas; implementasi mengikuti flow nyata.

## Move-to-wallet drawer (desktop)

Mirror `WithdrawKeypad` (single screen): bucket cycler pill (`bg #ECECEC`, cycle USD/EUR/MXN, hanya bila `buckets.length ≥ 2`), `{formatCurrency(value)} available`, `<input>` (bukan numpad) + quick 10/50/Max, hint "Not enough balance" saat `entered > available`. "Max" membakar full share balance via `balanceOf` (hindari dust). Tombol → sign → toast + tutup + refresh. **Tanpa Review.**

## Activity drawer (desktop)

Mirror mobile Activity. Tabs **All / Yours / Automated** = pill FLAT (`bg-[#ECECEC] text-pill-ink` pressed), filter client-side pada `item.cat`. List = `ActivityList`/`ActivityRow` dengan data `getActivity()` (8 item; string identik `frontend/lib/vault/data.ts`). Baris "Proposed safe exit from EURC pool" punya tombol **Review** → membuka dialog safe-exit. Baris lebih lega dari kartu Overview (mock: `15px` vs `11px`).

## Account dropdown (desktop)

Ditambatkan ke avatar-blockies kanan-atas (`Identicon.tsx`, **bukan** glyph orang). Isi:
- **Address** copyable (`bg-[#EAEAEA]` mono, `truncate(address)` = `XXXX…XXXX`, klik → `navigator.clipboard` → "Copied"). Sumber `useWallet()`.
- **"Connected via {walletName}"** — **tanpa** "· since July 2026" (seam tak punya timestamp connect).
- **Activity** row (ikon list polos, no badge) → membuka Activity drawer.
- **Auto reinvest rewards** + `Switch` **READ-ONLY** (dimmed) — lihat divergensi.
- **Log out** (aksen `--neg`) → `LogoutSheet` → `disconnect()` → `/`.

## Safe-exit (desktop)

Satu-satunya surface approval Sentinel-freeze. Bahasa invisible-safety.

- **Pemicu:** (a) **FreezeBanner** kalem di Overview (`warn-soft` amber, "Your earning is paused" + tombol Review kanan) — **conditional `usePendingExit()`**, muncul hanya saat pool ter-freeze + exit di-propose + belum di-approve; (b) tombol **Review** di baris Activity.
- **UI = DIALOG terpusat** (bukan drawer) — keputusan tunggal fokus. Portal ke `body`, scrim, `role="dialog"`. Isi = `ExitApproval` yang sudah ada: judul "Approve safe exit" (**item, bukan abu**), copy "We paused your {sym} pool after we detected unusual activity…", kartu **From** `{fromLabel} · {amount}` → panah → **To** `{toMeta.name} · {toMeta.apy}% APY` (hijau). Tombol **kiri-kanan**: `Keep paused` (glass) / `Approve` (ink) — bukan "Approve and sign in wallet" / "Keep it paused" yang panjang. Approve → `client.approveExit(...)` signed → `bump()` (banner clear) + toast; decline → tak menggerakkan apa pun.

## Divergensi dari mock-2 / komponen frontend (di-pin agar tak hilang)

1. **Segmented flat**, bukan white raised pill — samakan `Segmented.tsx`. (Divergensi historis yang Axel tangkap — [plan-shape].)
2. **Add-funds 2-step tanpa Review/RWA/chip/proyeksi** — samakan flow nyata (`AddFunds`→`DepositKeypad`).
3. **Activity `kind`→ikon** — `ActivityRow` sekarang hardcode ikon plus; data punya `kind` (rebalanced/compounded/froze/proposed-exit/withdrew/deposited/consented/allocated). Enhancement kecil, memerlukan **konfirmasi Axel** (item scope di heads-up).
4. **"Connected via {wallet}" tanpa tanggal** — seam tak punya timestamp (konsisten dgn U16).
5. **Auto-reinvest switch READ-ONLY** — bind ke `hasConsent` (bukan `autoCompoundEnabled`). Menjadikannya live = `setAutoCompound` + signed write, ranah STE-38/39/40. **Di luar STE-48** kecuali Axel setuju jadi unit sendiri (item scope di heads-up).

## Out of scope (spec ini)

- **Fase 2 (loading skeletons)** & **Fase 3 (motion/micro-interactions)** — spec terpisah.
- **STE-52** (faucet "Get test funds", saldo trustline nyata, konsumsi HTTP surface) — hanya *slot* disiapkan di add-funds.
- **Auto-reinvest live toggle** & **activity-icon enhancement** — nunggu jawaban Axel.

## Testing

Vitest + RTL (mengikuti `frontend/app/(app)/**/__tests__/`), plus Playwright desktop.

| Subjek | Yang dibuktikan |
| --- | --- |
| `components/ui/Drawer` | `open` false → panel `translate-x-full` & `aria-hidden`; Escape memanggil `onClose`; body scroll-lock saat open; `getByRole('dialog', {name})` menemukan panel saat open |
| `components/ui/Dropdown` | klik trigger toggle; klik-luar & Escape menutup; `role="menu"` |
| `home/page` (desktop viewport) | render Overview padat; **R11** tak ada `Safe`/`Watch`/`risk`/`score`; segmented pressed = `bg-pill` (bukan `bg-white`/shadow); hero sub-stat = 1 baris "Earned this month" |
| `home/page` (mobile viewport) | **tak berubah** dari snapshot sekarang (BottomNav ada, tak ada topbar/dropdown) |
| add-funds drawer | step1 list 3 stablecoin; pilih USDC → header "Deposit USDC" + chevron back; saldo `9,076.00 USDC`; input hanya angka, `1,5`→`1.5`, leading-zero dibuang; tanpa Review |
| withdraw drawer | cycler muncul saat ≥2 bucket; `entered > available` → hint + tombol disabled; Max = full |
| activity drawer | tab filter `cat`; `kind`→ikon; Review row → dialog terbuka |
| account dropdown | address copy → "Copied"; "Connected via Freighter" tanpa tanggal; switch read-only (`aria-disabled`) |
| safe-exit dialog | FreezeBanner Review → dialog; Approve memanggil `approveExit` + `bump`; decline tak memanggil seam; copy tanpa "risk"/"Sentinel" |
| input sanitizer | `sanitizeAmount`: comma→dot, non-digit dibuang, satu `.`, leading-zero strip, "" → "0", ".5" → "0.5" |

Gate: `pnpm -r typecheck` (strict, `noUncheckedIndexedAccess`) **dan** `pnpm -C frontend lint` **dan** `pnpm -r test` **dan** `pnpm e2e`. Tes lulus ≠ typecheck lulus.

## Verification (STE-48 Fase 1)

Desktop tak lagi cacat: Overview padat desktop-native, aksi via drawer/dropdown/dialog, safe-exit approvable. Mobile identik dengan sebelumnya. **e2e U17 hijau di dua project** (mobile Pixel 5 + desktop Chrome 1440×900) tanpa mengubah spec mobile. Bukti E2E lewat template `pr-e2e-evidence` (screenshot before/after, viewport desktop & mobile).
