# STE-44 — Toast sukses deposit tak pernah terlihat

Bug lama (sejak U14), bukan regresi. Linear: [STE-44](https://linear.app/steries-stellar-hackathon-apac/issue/STE-44).
ACC dari Axel di tiket (10 Juli): murni frontend lifecycle, tidak menyentuh backend/seam, tidak
memblokir siapa pun.

## Masalah

`DepositKeypad` merender `<Toast>`-nya sendiri, lalu menavigasi menjauh:

```ts
// components/deposit/DepositKeypad.tsx:73-74
setToast("Deposited. Agent is allocating.");
router.push("/home");
```

`router.push` melepas layar deposit. Komponennya — beserta toast-nya — unmount sebelum toast sempat
dilihat. Terverifikasi lewat snapshot ARIA saat menulis e2e U17: region `status` di `/home` sesudah
deposit kosong. Alur terpenting di app berakhir tanpa umpan balik apa pun; satu-satunya tanda uang
masuk adalah baris bucket yang berubah di Home.

### Bugnya ada dua

`components/withdraw/WithdrawKeypad.tsx:66-67` melakukan hal identik (`setToast("Sent to your
wallet")` → `router.push("/home")`). Tiket hanya menyebut deposit, tapi kode sudah tahu: komentar di
`components/proposal/ExitApproval.tsx:27-28` menyebut WithdrawKeypad sebagai kontras — "ExitApproval
stays mounted at page level (unlike WithdrawKeypad, which unmounts on navigation)". Keduanya
diperbaiki di unit ini.

### Empat pemanggil `<Toast>` lain sehat

Tidak diikuti navigasi, jadi tidak rusak, jadi tidak disentuh:

| Pemanggil | Kenapa sehat |
| --- | --- |
| `app/page.tsx:136,178` | toast error connect-wallet; layar tidak pindah |
| `app/(app)/account/page.tsx:119` | toast "Address copied"; layar tidak pindah |
| `components/proposal/ExitApproval.tsx:103` | sengaja di luar `BottomSheet` agar bertahan setelah sheet tertutup; komponen tetap mounted di level halaman, dan sudah punya auto-dismiss sendiri |

Menyatukan keenam pemanggil ke provider adalah keputusan desain terpisah, bukan konsekuensi otomatis
dari bug ini. Menurut aturan repo (`frontend/CLAUDE.md`, "New-feature review") itu scope addition:
butuh tiket baru + mention `@axelmatsama` lebih dulu. Di luar cakupan STE-44.

## Pendekatan yang dipilih

**ToastProvider di root `app/layout.tsx`**, hanya dua pemanggil rusak yang bermigrasi.

Layar deposit & withdraw hidup di route group `(flow)`; keduanya push ke `/home` di `(app)`. Provider
di salah satu group akan ikut unmount saat pindah group. Ia harus duduk di atas keduanya — root layout
adalah satu-satunya tempat yang bertahan.

### Alternatif yang ditolak

- **Pindahkan pesan ke tujuan** (`/home` menampilkan toast lewat query param / nav state). Perubahan
  paling kecil, tapi menaruh pengetahuan soal deposit dan withdraw di layar Home, mengotori URL, dan
  harus menangani dua pesan berbeda dari dua asal berbeda. Home tidak perlu tahu apa-apa soal ini.
- **Migrasi keenam pemanggil.** Lebih bersih jangka panjang, tapi menyentuh tiga layar tanpa bug —
  termasuk `ExitApproval`, yang polanya sudah benar dan disengaja. Butuh ACC terpisah (lihat di atas).

## Arsitektur

### `frontend/providers/ToastProvider.tsx` (baru, `"use client"`)

- Context memapar satu fungsi: `show(message: string)`. Tidak ada `hide()` publik — toast punya satu
  perilaku: muncul, lalu hilang sendiri setelah 2500 ms. Itu menutup seluruh kontrak yang dibutuhkan
  kedua pemanggil.
- State disimpan sebagai objek `{ message } | null`, bukan `string | null`. `setToast` selalu menulis
  objek baru, jadi `show()` dua kali dengan pesan yang **sama** tetap mengubah identitas state dan
  me-restart timer dismiss. Sebuah `useState<string>` tidak akan: React bail-out dari re-render bila
  state berikutnya `Object.is`-equal dengan yang sekarang, sehingga `useEffect` tak menyala ulang.
- Durasi 2500 ms mengikuti preseden `ExitApproval.tsx:31`. Timer dibersihkan di cleanup `useEffect`.
- Render `{children}`, lalu:

  ```tsx
  <div className="fixed inset-0 z-[70] pointer-events-none">
    <Toast open={!!message} message={message ?? ""} />
  </div>
  ```

**Kenapa pembungkus `fixed`.** `components/ui/Toast.tsx:5` memakai `absolute inset-x-5
bottom-[104px]`. Hari ini itu bekerja karena setiap pemanggil duduk di dalam ancestor `relative`
(`app/(app)/layout.tsx:9`, `app/(flow)/layout.tsx:8`, `app/page.tsx:101,145`). Di root layout `<body>`
tidak `relative`, jadi toast akan jangkar ke dokumen alih-alih viewport dan melayang salah tempat di
layar yang bisa di-scroll (Earn, Activity). `absolute` di dalam `fixed inset-0` = jangkar viewport.
`pointer-events-none` supaya overlay penuh-layar itu tidak menelan klik. **`Toast.tsx` tidak diubah
satu karakter pun** — invarian "primitives DRY, jangan re-style per layar" tetap utuh, dan frosted
glass dari `docs/mockups/sorosense-mock-2.html` tidak tersentuh.

### `frontend/hooks/useToast.ts` (baru)

Hook tipis, konsisten dengan `useVault`/`useWallet` yang sudah ada (provider di `providers/`, hook di
`hooks/`). Melempar bila dipakai di luar provider.

### `frontend/app/layout.tsx`

```tsx
<WalletProvider>
  <VaultProvider>
    <ToastProvider>{children}</ToastProvider>
  </VaultProvider>
</WalletProvider>
```

Paling dalam. Tidak ada dependensi teknis ke wallet/vault; menaruh yang paling dangkal (UI murni)
paling dalam. Root layout tetap server component — `ToastProvider` yang membawa `"use client"`.

Catatan: STE-43 (deep-link memantul ke landing) juga menyentuh root layout / `AuthGate`. STE-44
dikerjakan dan di-merge lebih dulu; unit ini hanya menambah satu pembungkus dan tidak menyentuh
`AuthGate` maupun `WalletProvider`.

## Aliran data

`DepositKeypad` dan `WithdrawKeypad` membuang `useState` toast lokal dan render `<Toast>`-nya, ganti
dengan `const { show } = useToast()`. Baris sukses jadi `show(...)` sebelum `router.push("/home")` —
pesan hidup di provider yang tidak ikut unmount, jadi bertahan melintasi batas `(flow)` → `(app)`.

Toast **error** di kedua komponen (`setToast(w.message)` pada kegagalan wallet) ikut lewat `show()`.
Layarnya memang tidak pindah di jalur itu, tapi memelihara dua mekanisme toast di dalam satu komponen
tidak masuk akal. Efek sampingnya: error toast kini auto-dismiss setelah 2500 ms — perbaikan, karena
hari ini ia menempel sampai user meninggalkan layar. Jalur `USER_CLOSED_MODAL` tetap senyap.

Komentar `ExitApproval.tsx:27-28` menjadi salah begitu WithdrawKeypad tak lagi punya toast lokal, dan
harus diperbarui.

## Penanganan kegagalan

Tidak ada jalur gagal baru. `show()` sinkron dan murni state. Bila `router.push` gagal, toast tetap
tampil di layar deposit — degradasi yang benar.

## Testing

### e2e (acceptance criteria terkuat)

`frontend/e2e/demo-flow.spec.ts:29-31` hari ini berisi komentar yang menjelaskan kenapa toast deposit
**tidak** diassert, menyebut STE-44 secara eksplisit. Komentar itu dihapus, diganti asersi sungguhan:

```ts
await expect(page.getByText("Deposited. Agent is allocating.")).toBeVisible();
```

Ditempatkan **sebelum** asersi baris bucket: toast berumur 2500 ms, baris bucket tidak.

Tidak ada spec yang pernah menyelesaikan withdraw hari ini (`demo-flow.spec.ts:122-125` hanya mampir
lalu `goBackTo`). Perbaikan withdraw butuh bukti, jadi: satu test baru — connect → deposit → Earn →
"Move to wallet" → keypad → konfirmasi → `/home` → assert `"Sent to your wallet"`.

Screenshot bukti lewat `shot(page, ...)` (aktif bila `E2E_EVIDENCE=1`), disimpan ke
`docs/tests/linear-STE-44/`.

`goBackTo()` dan larangan `page.goto()` di `e2e/support/journey.ts` **tidak disentuh** — itu siasat
untuk STE-43, menghapusnya membuat spec flaky.

### Unit

`frontend/providers/__tests__/ToastProvider.test.tsx`:

- `show()` → pesan tampil.
- setelah 2500 ms → hilang.
- `show()` ulang dengan pesan sama → timer restart (regression guard untuk identitas state).
- `useToast()` di luar provider → melempar.

`components/ui/__tests__/Toast.test.tsx` tidak berubah.

Tiga file test yang me-render keypad — `components/deposit/__tests__/DepositKeypad.test.tsx`,
`components/withdraw/__tests__/WithdrawKeypad.test.tsx`, dan
`app/(flow)/deposit/[sym]/__tests__/deposit-integration.test.tsx` — harus membungkus render-nya dengan
`<ToastProvider>`, karena `useToast()` melempar di luar provider.

## Invarian

Tidak ada yang dilanggar: tak ada field/label risk/tier/score baru; tak ada konversi bucket; tak ada
permukaan AI; `Toast.tsx` tidak di-restyle; `KEEPER_SECRET` tak tersentuh.

## Green gate

`pnpm -r typecheck` + `pnpm -C frontend lint` + `pnpm -r test` + `pnpm e2e`.
