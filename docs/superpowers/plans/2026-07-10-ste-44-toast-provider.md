# STE-44 — Toast Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toast sukses deposit dan withdraw bertahan melintasi `router.push("/home")`, sehingga user akhirnya melihat konfirmasi bahwa uangnya masuk atau keluar.

**Architecture:** Sebuah `ToastProvider` client-component dipasang di root `app/layout.tsx` — satu-satunya tempat yang tidak ikut unmount saat navigasi menyeberang dari route group `(flow)` (deposit, withdraw) ke `(app)` (home). `DepositKeypad` dan `WithdrawKeypad` membuang state toast lokal + render `<Toast>`-nya dan memanggil `useToast().show(...)`. Primitive `components/ui/Toast.tsx` tidak diubah sama sekali; provider membungkusnya dalam `fixed inset-0` untuk memulihkan jangkar viewport yang hilang di root.

**Tech Stack:** Next 16 (App Router) · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind v4 · Vitest + Testing Library (jsdom, `globals: true`) · Playwright (port 3100, `NEXT_PUBLIC_E2E=1`).

**Spec:** `docs/superpowers/specs/2026-07-10-ste-44-toast-provider-design.md`

## Global Constraints

- **Jangan sentuh `components/ui/Toast.tsx`.** Invarian repo: "primitives DRY — jangan me-restyle `Toast` per layar". Design source of truth `docs/mockups/sorosense-mock-2.html` (toast = frosted glass).
- **Jangan sentuh `goBackTo()` maupun larangan `page.goto()`** di `frontend/e2e/support/journey.ts`. Itu siasat untuk STE-43 (bug terpisah, belum diperbaiki); menghapusnya membuat spec flaky.
- **Jangan migrasikan empat pemanggil `<Toast>` yang sehat**: `app/page.tsx:136,178`, `app/(app)/account/page.tsx:119`, `components/proposal/ExitApproval.tsx:103`. Layarnya tidak pindah. Menyatukannya adalah scope addition yang butuh tiket baru + mention `@axelmatsama`.
- **Jangan sentuh `AuthGate` / `WalletProvider`.** STE-43 akan menyentuh keduanya; unit ini hanya *menambah* satu pembungkus di root layout.
- **Root `app/layout.tsx` tetap server component.** `"use client"` hidup di `ToastProvider`.
- Durasi toast: **2500 ms**, verbatim mengikuti preseden `components/proposal/ExitApproval.tsx:31`.
- Pesan verbatim: deposit `"Deposited. Agent is allocating."` · withdraw `"Sent to your wallet"`.
- Tidak ada field/label `risk`/`tier`/`score` di permukaan user mana pun.
- Perintah dijalankan dari **root repo** kecuali disebut lain. Test frontend: `pnpm -C frontend test`.

---

### Task 1: ToastProvider + useToast, dipasang di root layout

**Files:**
- Create: `frontend/providers/ToastProvider.tsx`
- Create: `frontend/hooks/useToast.ts`
- Create: `frontend/providers/__tests__/ToastProvider.test.tsx`
- Modify: `frontend/app/layout.tsx:26-34`

**Interfaces:**
- Consumes: `Toast` dari `frontend/components/ui/index.ts` (`export { Toast } from "./Toast"`), bertanda tangan `({ open, message }: { open: boolean; message: string })`.
- Produces:
  - `ToastContext: React.Context<{ show: (message: string) => void } | null>` (export dari `providers/ToastProvider.tsx`)
  - `ToastProvider({ children }: { children: ReactNode }): JSX.Element`
  - `TOAST_MS: number` (= `2500`)
  - `useToast(): { show: (message: string) => void }` (export dari `hooks/useToast.ts`) — melempar di luar provider.

- [ ] **Step 1: Tulis test yang gagal**

Buat `frontend/providers/__tests__/ToastProvider.test.tsx`. Repo ini belum pernah memakai fake timers di mana pun, jadi pasang dan bongkar sendiri per file. `vi` global (`vitest.config.mts` → `globals: true`), jadi tidak perlu di-import.

```tsx
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, TOAST_MS } from "../ToastProvider";
import { useToast } from "../../hooks/useToast";

function Probe() {
  const { show } = useToast();
  return <button onClick={() => show("Deposited. Agent is allocating.")}>fire</button>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const MSG = "Deposited. Agent is allocating.";

test("show() puts the message on screen", () => {
  render(<ToastProvider><Probe /></ToastProvider>);
  expect(screen.queryByText(MSG)).not.toBeInTheDocument();
  act(() => screen.getByRole("button", { name: "fire" }).click());
  expect(screen.getByText(MSG)).toBeInTheDocument();
});

test("the toast dismisses itself after TOAST_MS", () => {
  render(<ToastProvider><Probe /></ToastProvider>);
  act(() => screen.getByRole("button", { name: "fire" }).click());
  act(() => void vi.advanceTimersByTime(TOAST_MS - 1));
  expect(screen.getByText(MSG)).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(1));
  expect(screen.queryByText(MSG)).not.toBeInTheDocument();
});

// The bug this guards: with `useState<string>`, showing the *same* message twice is an
// Object.is-equal state write. React bails out, the dismiss effect never re-runs, and the
// second toast inherits the first one's already-half-spent timer.
test("re-showing the same message restarts the dismiss timer", () => {
  render(<ToastProvider><Probe /></ToastProvider>);
  const fire = screen.getByRole("button", { name: "fire" });
  act(() => fire.click());
  act(() => void vi.advanceTimersByTime(TOAST_MS - 100));
  act(() => fire.click()); // same message, again
  act(() => void vi.advanceTimersByTime(200)); // past the *first* timer's deadline
  expect(screen.getByText(MSG)).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(TOAST_MS));
  expect(screen.queryByText(MSG)).not.toBeInTheDocument();
});

test("useToast() outside the provider throws", () => {
  // React logs the error boundary-less throw; silence it so the run stays readable.
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow(/useToast must be used within <ToastProvider>/);
  spy.mockRestore();
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
pnpm -C frontend test providers/__tests__/ToastProvider.test.tsx
```
Expected: FAIL — `Failed to resolve import "../ToastProvider"`.

- [ ] **Step 3: Tulis `frontend/providers/ToastProvider.tsx`**

```tsx
"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { Toast } from "../components/ui";

type Ctx = { show: (message: string) => void };
export const ToastContext = createContext<Ctx | null>(null);

/** Mirrors ExitApproval's own dismiss (components/proposal/ExitApproval.tsx:31). */
export const TOAST_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  // An object, not a bare string: `show` must restart the dismiss timer even when the same
  // message fires twice, and a string write that is Object.is-equal makes React bail out of
  // the re-render — the effect below would never re-run. A fresh object is never equal.
  const [toast, setToast] = useState<{ message: string } | null>(null);

  const show = useCallback((message: string) => setToast({ message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/*
        `Toast` is `absolute`, and every caller before this provider sat inside a `relative`
        screen wrapper ((app)/layout.tsx, (flow)/layout.tsx, app/page.tsx). At the root <body>
        there is none, so the toast would anchor to the document and drift on scrollable screens.
        Restore the viewport anchor here rather than restyling the shared primitive.
      */}
      <div className="pointer-events-none fixed inset-0 z-[70]">
        <Toast open={!!toast} message={toast?.message ?? ""} />
      </div>
    </ToastContext.Provider>
  );
}
```

Catatan: `show` stabil (`useCallback` tanpa deps), tapi nilai context `{ show }` adalah objek baru tiap render. Provider hanya re-render saat toast berubah — dua kali per pesan — jadi tidak perlu `useMemo`. `VaultProvider` juga tidak memakainya.

- [ ] **Step 4: Tulis `frontend/hooks/useToast.ts`**

Cermin persis `frontend/hooks/useVault.ts`.

```tsx
"use client";
import { useContext } from "react";
import { ToastContext } from "../providers/ToastProvider";

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

```bash
pnpm -C frontend test providers/__tests__/ToastProvider.test.tsx
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Pasang di root layout**

Di `frontend/app/layout.tsx`, tambah import dan bungkus `{children}` **paling dalam** — `ToastProvider` tidak bergantung pada wallet maupun vault, jadi ia duduk paling dekat dengan children.

```tsx
import { WalletProvider } from '../providers/WalletProvider';
import { VaultProvider } from '../providers/VaultProvider';
import { ToastProvider } from '../providers/ToastProvider';
```

```tsx
        <WalletProvider>
          <VaultProvider>
            <ToastProvider>{children}</ToastProvider>
          </VaultProvider>
        </WalletProvider>
```

Jangan ubah apa pun yang lain di file itu — `suppressHydrationWarning`, `metadata`, `viewport`, dan kelas `<body>` tetap.

- [ ] **Step 7: Typecheck + lint**

```bash
pnpm -r typecheck && pnpm -C frontend lint
```
Expected: dua-duanya bersih. `noUncheckedIndexedAccess` tidak relevan di sini (tak ada indexed access), tapi jalankan tetap: ia menangkap hal yang lolos vitest.

- [ ] **Step 8: Commit**

```bash
git add frontend/providers/ToastProvider.tsx frontend/hooks/useToast.ts \
        frontend/providers/__tests__/ToastProvider.test.tsx frontend/app/layout.tsx
git commit -m "feat(STE-44): ToastProvider di root layout

Satu-satunya tempat yang bertahan saat navigasi menyeberang dari route
group (flow) ke (app). Belum ada pemanggil; migrasi menyusul."
```

---

### Task 2: DepositKeypad memakai provider — bug utama tiket

**Files:**
- Modify: `frontend/components/deposit/DepositKeypad.tsx` (baris 5, 28, 73, 86, 103, 128)
- Modify: `frontend/components/deposit/__tests__/DepositKeypad.test.tsx`
- Modify: `frontend/app/(flow)/deposit/[sym]/__tests__/deposit-integration.test.tsx`
- Modify: `frontend/e2e/demo-flow.spec.ts:29-33`

**Interfaces:**
- Consumes: `useToast()` dari Task 1 → `{ show: (message: string) => void }`; `ToastProvider` untuk membungkus render di test.
- Produces: tidak ada API baru. Setelah task ini `DepositKeypad` tidak lagi meng-import `Toast`.

- [ ] **Step 1: Tulis asersi e2e yang gagal**

Di `frontend/e2e/demo-flow.spec.ts`, ganti komentar + asersi di baris 29-33. Komentar lama menjelaskan kenapa toast **tidak** diassert dan menyebut STE-44; ia harus mati bersama bug-nya.

Sebelum:
```ts
  await depositEurc(page, "500");
  // The bucket row is the deposit's only visible confirmation: DepositKeypad's "Deposited. Agent is
  // allocating." toast unmounts with the screen that pushes to /home, so the user never sees it
  // (STE-44). Asserting the row instead tests what actually reaches them.
  await expect(page.getByText("EUR bucket")).toBeVisible();
  await expect(page.getByText("€500.00")).toBeVisible();
```

Sesudah — toast lebih dulu: ia hidup 2500 ms, baris bucket tidak punya deadline.
```ts
  await depositEurc(page, "500");
  // The toast is asserted before the bucket row because it is the only assertion with a deadline:
  // ToastProvider dismisses it after TOAST_MS. It outlives the push to /home now (STE-44) because
  // the provider lives at the root layout, above both route groups.
  await expect(page.getByText("Deposited. Agent is allocating.")).toBeVisible();
  await expect(page.getByText("EUR bucket")).toBeVisible();
  await expect(page.getByText("€500.00")).toBeVisible();
```

- [ ] **Step 2: Jalankan e2e, pastikan gagal**

```bash
pnpm e2e -- --grep "the demo journey"
```
Expected: FAIL — toast tak pernah terlihat, persis bug yang ditiketkan. (Server e2e naik sendiri di :3100. Jangan pakai `pnpm dev` di :3000.)

- [ ] **Step 3: Migrasikan `DepositKeypad`**

Empat suntingan bedah di `frontend/components/deposit/DepositKeypad.tsx`.

Baris 5 — buang `Toast` dari import ui:
```tsx
import { Button, Keypad, SubHeader, CoinBadge } from "../ui";
```

Setelah baris 7 (`import { useVault } ...`) tambah:
```tsx
import { useToast } from "../../hooks/useToast";
```

Baris 17-18 area — tambah hook di sebelah `useVault`/`useWallet`:
```tsx
  const { client, version } = useVault();
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
```

Baris 28 — hapus seluruhnya:
```tsx
  const [toast, setToast] = useState<string | null>(null);   // ← hapus
```

Baris 73 (`runDeposit`):
```tsx
    recordDeposit(currency, deposited); // cost-basis for "Total earned" on Earn
    show("Deposited. Agent is allocating.");
    router.push("/home");
```

Baris 86 dan 103 (dua catch) — `setToast(w.message)` → `show(w.message)`. Pertahankan komentar dan penjagaan `USER_CLOSED_MODAL` apa adanya:
```tsx
      if (w.code !== USER_CLOSED_MODAL) show(w.message); // user closed modal → silent
```

Baris 128 — hapus render lokal:
```tsx
      <Toast open={!!toast} message={toast ?? ""} />   {/* ← hapus baris ini */}
```

`useState` masih dipakai untuk `amount`/`frozen`/`consentOpen`/`busy`, jadi import `useState` tetap.

- [ ] **Step 4: Bungkus unit test dengan ToastProvider**

`useToast()` melempar di luar provider, jadi setiap `render()` yang memuat `DepositKeypad` harus dibungkus. Di `frontend/app/(flow)/deposit/[sym]/__tests__/deposit-integration.test.tsx` tambah import:

```tsx
import { ToastProvider } from "../../../../../providers/ToastProvider";
```

lalu ubah tiap `render(<VaultProvider client={client}><DepositKeypad ... /></VaultProvider>)` menjadi:

```tsx
  render(<VaultProvider client={client}><ToastProvider><DepositKeypad sym="eurc" /></ToastProvider></VaultProvider>);
```

Lakukan hal yang sama di `frontend/components/deposit/__tests__/DepositKeypad.test.tsx` — baca file itu lebih dulu dan bungkus **setiap** `render()`, dengan jalur import relatif yang benar (`../../../providers/ToastProvider`). Jika ada test di sana yang menegaskan teks toast (mis. `"Deposited. Agent is allocating."` atau pesan error wallet), test itu tetap lulus tanpa perubahan: provider merender `Toast` yang sama di dalam pohon render yang sama.

- [ ] **Step 5: Jalankan unit test, pastikan lulus**

```bash
pnpm -C frontend test components/deposit app/\(flow\)/deposit
```
Expected: PASS. Kalau ada yang merah karena `useToast must be used within <ToastProvider>`, ada `render()` yang terlewat dibungkus.

- [ ] **Step 6: Jalankan e2e, pastikan asersi Step 1 kini hijau**

```bash
pnpm e2e -- --grep "the demo journey"
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/deposit frontend/app/\(flow\)/deposit frontend/e2e/demo-flow.spec.ts
git commit -m "fix(STE-44): toast sukses deposit bertahan melintasi push ke /home

DepositKeypad merender <Toast>-nya sendiri, lalu router.push melepas layar
itu — toast unmount sebelum sempat terlihat. Sekarang lewat useToast().
e2e menegaskan toast-nya; komentar yang menerangkan ketiadaannya dihapus."
```

---

### Task 3: WithdrawKeypad memakai provider — bug kembar yang tak disebut tiket

**Files:**
- Modify: `frontend/components/withdraw/WithdrawKeypad.tsx` (baris 5, 22, 66, 70, 123)
- Modify: `frontend/components/withdraw/__tests__/WithdrawKeypad.test.tsx`
- Modify: `frontend/components/proposal/ExitApproval.tsx:27-28` (komentar saja)
- Modify: `frontend/e2e/demo-flow.spec.ts` (tambah satu test di akhir file)

**Interfaces:**
- Consumes: `useToast()` dari Task 1; `ToastProvider`; helper e2e `connectWallet`, `depositEurc`, `shot` dari `frontend/e2e/support/journey.ts`.
- Produces: tidak ada API baru.

- [ ] **Step 1: Tulis test e2e yang gagal**

Tidak ada spec yang pernah *menyelesaikan* withdraw hari ini — `demo-flow.spec.ts:122-125` cuma mampir ke `/withdraw` lalu `goBackTo`. Perbaikan withdraw tanpa bukti tidak ada artinya. Tambahkan test ini di **akhir** `frontend/e2e/demo-flow.spec.ts`.

Dua jebakan yang sudah dibayar di depan di kode ini: (a) `playwright.config.ts` memakai `workers: 1` + `fullyParallel: false` karena `MockVaultClient` adalah module singleton — bucket EUR sudah terisi dari test-test sebelumnya, jadi jangan pernah menegaskan saldo absolut di sini; (b) nama "Move to wallet" dipakai oleh tombol di `/earn` **dan** tombol submit di `/withdraw`, tapi tak pernah dua-duanya di halaman yang sama, jadi `getByRole` aman asal URL sudah ditegaskan lebih dulu.

```ts
/**
 * The withdraw twin of the deposit toast (STE-44). `WithdrawKeypad` had the same shape —
 * `setToast(...)` immediately before `router.push("/home")` — so its confirmation unmounted with its
 * screen too. The ticket only named deposit; the bug was in both.
 */
test("a completed withdrawal confirms itself on /home", async ({ page }) => {
  await connectWallet(page);
  await page.getByRole("button", { name: "Add funds" }).click();
  await expect(page).toHaveURL(/\/add-funds$/);
  await depositEurc(page, "500");

  await page.getByRole("link", { name: "Earn" }).click();
  await expect(page).toHaveURL(/\/earn$/);
  await page.getByRole("button", { name: "Move to wallet" }).click();
  await expect(page).toHaveURL(/\/withdraw$/);

  // A partial amount, never "Max": the vault is a module singleton shared with the specs above, so
  // the bucket's absolute balance is not ours to assume — only that it holds more than €100.
  for (const digit of "100") {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await expect(page.getByTestId("keypad-value")).toHaveText("100");
  await page.getByRole("button", { name: "Move to wallet" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Sent to your wallet")).toBeVisible();
  await shot(page, "09-withdraw-toast");
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
pnpm e2e -- --grep "a completed withdrawal"
```
Expected: FAIL pada `expect(page.getByText("Sent to your wallet")).toBeVisible()` — URL sudah `/home`, tapi toast ikut mati bersama `WithdrawKeypad`.

- [ ] **Step 3: Migrasikan `WithdrawKeypad`**

Di `frontend/components/withdraw/WithdrawKeypad.tsx`:

Baris 5:
```tsx
import { Button, Keypad, SubHeader, CoinBadge } from "../ui";
```

Setelah baris 8 (`import { useWallet } ...`):
```tsx
import { useToast } from "../../hooks/useToast";
```

Di badan komponen, di sebelah hook lain:
```tsx
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
```

Baris 22 — hapus:
```tsx
  const [toast, setToast] = useState<string | null>(null);   // ← hapus
```

Baris 66:
```tsx
      recordWithdraw(currency, isMax ? active.value : enteredAmount); // reduce cost-basis
      show("Sent to your wallet");
      router.push("/home");
```

Baris 70:
```tsx
      if (w.code !== USER_CLOSED_MODAL) show(w.message); // user closed modal → silent
```

Baris 123 — hapus render lokal `<Toast .../>`.

`useState` tetap dipakai (`i`, `amount`, `maxSelected`, `busy`), jadi import-nya tetap.

- [ ] **Step 4: Perbaiki komentar yang kini bohong di `ExitApproval.tsx`**

Baris 27-28 saat ini berbunyi:
```tsx
  // ExitApproval stays mounted at page level (unlike WithdrawKeypad, which unmounts on
  // navigation), so the toast needs its own auto-dismiss or it lingers over the page forever.
```
`WithdrawKeypad` tetap unmount, tapi ia sudah tidak punya toast untuk dibawa mati — kontrasnya tak lagi masuk akal. Ganti:
```tsx
  // This toast is rendered here, not through ToastProvider: ExitApproval stays mounted at page
  // level and never navigates, so the provider (STE-44) would buy it nothing. Being page-local it
  // needs its own auto-dismiss, or it lingers over the page forever.
```
Jangan ubah kodenya — hanya komentarnya. `ExitApproval` sengaja tidak bermigrasi.

- [ ] **Step 5: Bungkus unit test withdraw dengan ToastProvider**

Di `frontend/components/withdraw/__tests__/WithdrawKeypad.test.tsx` tambah:
```tsx
import { ToastProvider } from "../../../providers/ToastProvider";
```
lalu bungkus **setiap** `render()` (ada beberapa test di file ini — baca semuanya):
```tsx
  render(<VaultProvider client={client}><ToastProvider><WithdrawKeypad /></ToastProvider></VaultProvider>);
```

- [ ] **Step 6: Jalankan unit test, pastikan lulus**

```bash
pnpm -C frontend test components/withdraw components/proposal
```
Expected: PASS.

- [ ] **Step 7: Jalankan e2e, pastikan test Step 1 kini hijau**

```bash
pnpm e2e -- --grep "a completed withdrawal"
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/withdraw frontend/components/proposal/ExitApproval.tsx frontend/e2e/demo-flow.spec.ts
git commit -m "fix(STE-44): toast sukses withdraw bertahan melintasi push ke /home

Bug kembar yang tidak disebut tiket: WithdrawKeypad punya bentuk identik
dengan DepositKeypad. Komentar ExitApproval yang memakainya sebagai kontras
diperbarui — ia tetap page-local, dan itu memang benar."
```

---

### Task 4: Green gate + bukti PR

**Files:**
- Create: `docs/tests/linear-STE-44/screenshots/*.png` (dihasilkan spec)
- Create: `docs/tests/linear-STE-44/README.md`
- Modify: `frontend/e2e/support/journey.ts:4` (hanya konstanta `EVIDENCE_DIR`)

**Interfaces:**
- Consumes: seluruh perubahan Task 1-3.
- Produces: bukti untuk template PR `pr-e2e-evidence`.

- [ ] **Step 1: Arahkan `shot()` ke direktori bukti unit ini**

`frontend/e2e/support/journey.ts:4` masih menunjuk `linear-STE-27`. Hanya konstanta ini yang berubah — `goBackTo()` dan larangan `page.goto()` di file yang sama **tidak boleh disentuh**.

```ts
const EVIDENCE_DIR = path.join("..", "docs", "tests", "linear-STE-44", "screenshots");
```

- [ ] **Step 2: Bikin direktori bukti dan ambil screenshot**

```bash
mkdir -p docs/tests/linear-STE-44/screenshots
E2E_EVIDENCE=1 pnpm e2e
```
Expected: seluruh spec PASS; PNG muncul di `docs/tests/linear-STE-44/screenshots/`, termasuk `09-withdraw-toast.png` dari Task 3.

Kalau `03-home-funded.png` tidak memperlihatkan toast: toast berumur 2500 ms dan `shot()` dipanggil setelah dua asersi bucket, jadi ia mungkin sudah pudar. Itu **bukan** kegagalan — asersi Playwright-lah buktinya, bukan PNG-nya. Bila mau tangkapan toast yang deterministik, tambahkan `await shot(page, "03a-deposit-toast")` tepat **setelah** `await expect(page.getByText("Deposited. Agent is allocating.")).toBeVisible();` di Task 2.

- [ ] **Step 3: Tulis `docs/tests/linear-STE-44/README.md`**

Ikuti bentuk `docs/tests/linear-STE-27/` (baca dulu). Isinya minimal: apa yang dibuktikan tiap screenshot, perintah yang dipakai (`E2E_EVIDENCE=1 pnpm e2e`), dan pernyataan eksplisit bahwa asersi `Deposited. Agent is allocating.` serta `Sent to your wallet` sekarang hijau — sebelumnya yang pertama sengaja dihindari (komentar STE-44 di spec), yang kedua tak pernah punya test sama sekali.

- [ ] **Step 4: Green gate penuh**

```bash
pnpm -r typecheck && pnpm -C frontend lint && pnpm -r test && pnpm e2e
```
Expected: keempatnya hijau. Typecheck adalah hard gate (`noUncheckedIndexedAccess`) — vitest hijau tidak berarti typecheck hijau.

- [ ] **Step 5: Commit**

```bash
git add docs/tests/linear-STE-44 frontend/e2e/support/journey.ts
git commit -m "test(STE-44): bukti e2e — toast deposit & withdraw kini terlihat"
```

- [ ] **Step 6: Buka PR**

Pakai template `pr-e2e-evidence`. Set Linear STE-44 ke **In Progress** (tim ini tidak punya status "In Review"; biarkan di In Progress sampai merge). Sebutkan di badan PR: bug kembar withdraw ikut diperbaiki, empat pemanggil `<Toast>` sehat sengaja tidak disentuh, dan STE-43 tetap belum tersentuh.

---

## Self-Review

**Spec coverage.** ToastProvider + pembungkus `fixed` → Task 1. `useToast` → Task 1. Root layout → Task 1 Step 6. Deposit → Task 2. Withdraw → Task 3. Komentar `ExitApproval` → Task 3 Step 4. Asersi e2e deposit → Task 2 Step 1. Test e2e withdraw baru → Task 3 Step 1. Unit test provider (4 kasus) → Task 1 Step 1. Tiga file test keypad dibungkus → Task 2 Step 4 + Task 3 Step 5. Bukti + green gate → Task 4. Empat pemanggil sehat: dilindungi oleh Global Constraints, tak ada task yang menyentuhnya. `Toast.tsx`, `goBackTo()`, `page.goto()`, `AuthGate` — sama.

**Placeholder scan.** Tidak ada TBD/TODO. Setiap step kode punya kode. Satu step (Task 2 Step 4, Task 3 Step 5) menyuruh implementer *membaca* file test lebih dulu alih-alih mengutipnya utuh: jumlah `render()` di kedua file itu belum dipastikan, dan menebak isinya lebih berbahaya daripada menyuruhnya melihat. Transformasinya sendiri dikutip lengkap.

**Type consistency.** `show(message: string): void` dipakai identik di Task 1 (definisi), Task 2, Task 3. `TOAST_MS` diekspor di Task 1 dan dikonsumsi hanya oleh test Task 1. `ToastContext` bertipe `{ show } | null`, dan `useToast` mempersempitnya — cocok dengan pola `useVault`.
