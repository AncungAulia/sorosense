# STE-48 Plan 2 — Desktop overlay surfaces (drawers · dropdown · dialog)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the desktop Overview (shipped in Plan 1) its overlay surfaces — right-edge **drawers** (add-funds, move-to-wallet, activity), an **account dropdown**, and a centered **safe-exit dialog** — all URL-backed (`?panel=`), with the mobile tree left byte-identical.

**Architecture (locked — do not redesign):** Desktop overlays are NEW components under `components/desktop/` + three NEW `components/ui/` primitives (`Drawer`, `Dropdown`, `Dialog`) + one pure util (`sanitizeAmount`) + one hook (`usePanel`). They reuse the vault **seam** (`MockVaultClient` methods) and existing primitives (`Button`, `Card`, `Switch`, `Segmented`, `CoinBadge`, `Identicon`, `Toast`, `ActivityList`, `LogoutSheet`, ConsentSheet copy). The **mobile flow components** (`AddFunds`, `DepositKeypad`, `WithdrawKeypad`, `SubHeader`, account page, activity page, `MobileHome`) stay **BYTE-IDENTICAL** — they are NOT refactored. The **only** shared-code refactor is extracting `ExitApproval`'s body + approve/decline logic into a reusable piece so the mobile `BottomSheet` and the desktop `Dialog` both consume it without changing the mobile rendered DOM (proven by re-running the mobile `ExitApproval`/`home` tests). Thin deposit/withdraw submit orchestration is **duplicated** in the drawers (they do not reuse `DepositKeypad`/`WithdrawKeypad`) — that is the accepted cost of keeping the mobile safety path untouched; it is noted at each drawer task.

**Where overlays mount:** `components/home/DesktopOverview.tsx` becomes the desktop **panel host**. It reads `usePanel()` and mounts all four overlays (`AddFundsDrawer`, `WithdrawDrawer`, `ActivityDrawer`, `SafeExitDialog`), each gated by `panel === "<name>"`. The existing "Add funds" / "Move to wallet" / "View all" buttons and the `FreezeBanner` switch from `nav.forward(...)` / local `exitOpen` state to `open("<panel>")`. `MobileHome` keeps `nav.forward(route)` and its local `exitOpen` — mobile is untouched.

**Tech stack:** Next 16 (App Router, `next/navigation`), React 19, Tailwind v4 (`@theme` in `app/globals.css`), Vitest + RTL, Playwright. Read `node_modules/next/dist/docs/` before writing Next code (breaking changes; per `frontend/AGENTS.md`).

**Design / pixel source of truth:** `docs/mockups/sorosense-mock-2-desktop.html` (canonical). Spec: `docs/superpowers/specs/2026-07-13-ste-48-desktop-design.md`. Interface map (exact existing signatures): the scratchpad `plan2-interface-map.md`. When a component and the mockup conflict, **the real frontend component wins** (see the conflict list in Self-review).

**Theme tokens that exist** (`app/globals.css` `@theme`): colors `ink`, `ink-2`, `muted`, `faint`, `bg`, `card`, `pill`, `pill-ink`, `line`, `line-2`, `pos`, `neg`, `warn`, `warn-soft`; radii `card`(22px)/`sheet`/`field`. There is **NO** `ink-3` token (use `text-[#3f4448]`) and **NO** `--sh-*` shadow tokens — inline the mockup's shadow values literally:
- `sh-card` → `[box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)]`
- `sh-soft` → `[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]`
- `sh-float` → `[box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)]`

## Global Constraints

- **Mobile unchanged.** The `< lg` tree must stay byte-identical. `MobileHome`, `AddFunds`, `DepositKeypad`, `WithdrawKeypad`, `SubHeader`, `account/page.tsx`, `account/activity/page.tsx` are NOT edited (the sole exception: `ExitApproval.tsx` is refactored to consume the extracted body **without changing its rendered DOM**, verified by re-running its tests). Re-run the relevant mobile tests at each task that touches shared code.
- **R11 — invisible safety.** No `risk`/`label`/`score`/`Safe`-tier/`Watch`/`Sentinel` string or field on any surface. "safe exit" / "Safe pool" is the existing vetted ACTION name and IS allowed. Assert explicitly.
- **U14 — portal every fixed/portaled overlay to `document.body`** (`createPortal`) so no transformed ancestor (`.page-enter`) becomes its containing block. **No `transform` for centering** — use grid `place-items-center`.
- **Per-currency buckets never converted.** Blended value is display-only, always `≈ USD`. Deposit/withdraw are denominated in the bucket currency. MXN symbol is `$` (`units.ts`).
- **DRY primitives — reuse, don't restyle.** Reuse `Segmented`/`Switch`/`ActivityList`/`Card`/`Button`/`CoinBadge`/`Identicon`. **Segmented stays FLAT** (pressed `bg-pill text-pill-ink`, idle `text-[#8a8a8a]`, no track, no white raised pill).
- **URL-backed, never pure `useState`.** Drawers/dialog are driven by `?panel=` via `usePanel` so back-button, refresh, deep-link, and share all work (STE-43). Pure-SPA `useState` toggles are forbidden.
- **z-index stack** (Tailwind values, reconciled with topbar `z-50`): dropdown `z-40` (anchored, below topbar) · Drawer scrim `z-[55]` / panel `z-[56]` (above topbar, below dialog) · Dialog `z-[70]` (top). `BottomSheet` stays `z-50`/`z-[51]` (mobile only — never co-mounted with a desktop drawer).
- **tsc is a hard gate**, strict with `noUncheckedIndexedAccess`: indexed access is `T | undefined`. Guard every `arr[i]` (`buckets[i] ?? buckets[0]`, `PANELS.includes(...)`, etc.).
- **Gates each task:** `pnpm -C frontend typecheck` + `pnpm -C frontend lint` + `pnpm -C frontend test`. Playwright at the phase end (Task 11). Tests passing does NOT mean typecheck passes — run both.

---

### Task 1: `sanitizeAmount` pure util

**Files:**
- Create: `frontend/lib/vault/sanitize.ts`
- Test: `frontend/lib/vault/__tests__/sanitize.test.ts`

**Interfaces:**
- Produces: `sanitizeAmount(raw: string): string` — pure port of the mockup's `sanitizeNum` (interface-map §12): comma→dot, strip non-`[0-9.]`, collapse to a single dot, strip leading zeros (`"06"→"6"`, keep `"0.5"`), `""`→`"0"`, `".5"`→`"0.5"`.

- [ ] **Step 1: Write the failing test**
```ts
import { sanitizeAmount } from "../sanitize";

test("comma becomes a dot", () => {
  expect(sanitizeAmount("1,5")).toBe("1.5");
});
test("strips non-numeric characters", () => {
  expect(sanitizeAmount("1a2b.3c")).toBe("12.3");
});
test("collapses to a single dot", () => {
  expect(sanitizeAmount("1.2.3")).toBe("1.23");
});
test("strips leading zeros but keeps a single zero", () => {
  expect(sanitizeAmount("06")).toBe("6");
  expect(sanitizeAmount("065")).toBe("65");
  expect(sanitizeAmount("00")).toBe("0");
});
test("keeps a fractional value that starts with zero", () => {
  expect(sanitizeAmount("0.5")).toBe("0.5");
});
test("empty becomes '0'", () => {
  expect(sanitizeAmount("")).toBe("0");
});
test("a bare fraction gains its leading zero", () => {
  expect(sanitizeAmount(".5")).toBe("0.5");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test sanitize`
Expected: FAIL (`Cannot find module '../sanitize'`).

- [ ] **Step 3: Write minimal implementation**
```ts
/**
 * Normalize a raw decimal-input string for the desktop drawer amount fields, mirroring the mockup's
 * `sanitizeNum` (docs/mockups/sorosense-mock-2-desktop.html): comma→dot, digits + one dot only,
 * leading zeros dropped ("06"→"6") except the single zero before a dot ("0.5"), "" and "." →"0".
 * Pure: takes/returns a string, so it is trivially testable and reused by both drawers.
 */
export function sanitizeAmount(raw: string): string {
  let v = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  v = v.replace(/^0+(?=\d)/, "");
  if (v.startsWith(".")) v = "0" + v;
  if (v === "") v = "0";
  return v;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm -C frontend test sanitize` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/lib/vault/sanitize.ts frontend/lib/vault/__tests__/sanitize.test.ts
git commit -m "feat(STE-48): sanitizeAmount pure util for desktop drawer inputs"
```

---

### Task 2: `Drawer` primitive

**Files:**
- Create: `frontend/components/ui/Drawer.tsx`
- Test: `frontend/components/ui/__tests__/Drawer.test.tsx`

**Interfaces:**
- Consumes: `react-dom` `createPortal`.
- Produces: `Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }): JSX.Element | null`. Right-edge panel portaled to `document.body`; scrim `z-[55]` + panel `z-[56]`; `role="dialog" aria-modal="true" aria-label={label}` with `aria-hidden={!open}` (mounted always, hidden via transform — the `BottomSheet` discipline). Escape closes, body scroll-lock while open (restored on close/unmount), focus moves into the panel on open. SSR-guarded (renders `null` until mounted).

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Drawer } from "../Drawer";

test("open: portals a labelled dialog with its children and moves focus in", () => {
  render(<Drawer open onClose={() => {}} label="Add funds"><p>drawer body</p></Drawer>);
  const panel = screen.getByRole("dialog", { name: "Add funds" });
  expect(panel).toBeInTheDocument();
  expect(screen.getByText("drawer body")).toBeVisible();
  expect(document.activeElement).toBe(panel);
});

test("Escape calls onClose", () => {
  const onClose = vi.fn();
  render(<Drawer open onClose={onClose} label="Add funds"><p>x</p></Drawer>);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

test("locks body scroll while open and restores it on close", () => {
  const { rerender } = render(<Drawer open onClose={() => {}} label="Add funds"><p>x</p></Drawer>);
  expect(document.body.style.overflow).toBe("hidden");
  rerender(<Drawer open={false} onClose={() => {}} label="Add funds"><p>x</p></Drawer>);
  expect(document.body.style.overflow).toBe("");
});

test("closed: the dialog is aria-hidden (excluded from the a11y tree)", () => {
  render(<Drawer open={false} onClose={() => {}} label="Add funds"><p>x</p></Drawer>);
  expect(screen.queryByRole("dialog")).toBeNull(); // getByRole excludes aria-hidden
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test Drawer` — Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**
```tsx
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Right-edge desktop drawer. Portaled to document.body so a transformed ancestor (.page-enter) never
 * becomes its containing block (U14). Follows BottomSheet's discipline — role="dialog" stays mounted,
 * visibility toggles via translate + aria-hidden — but adds Escape, body scroll-lock, and focus-in
 * (which BottomSheet deliberately omits on mobile). z-[55]/z-[56]: above the topbar (z-50), below the
 * Dialog (z-[70]).
 */
export function Drawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        data-testid="drawer-scrim"
        onClick={onClose}
        className={`fixed inset-0 z-[55] bg-[rgba(17,19,22,.28)] backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-[56] flex h-dvh w-[min(420px,100vw)] flex-col border-l border-white bg-card outline-none [box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)] transition-transform duration-200 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm -C frontend test Drawer` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/components/ui/Drawer.tsx frontend/components/ui/__tests__/Drawer.test.tsx
git commit -m "feat(STE-48): Drawer primitive (portal, Escape, scroll-lock, focus)"
```

---

### Task 3: `Dropdown` primitive

**Files:**
- Create: `frontend/components/ui/Dropdown.tsx`
- Test: `frontend/components/ui/__tests__/Dropdown.test.tsx`

**Interfaces:**
- Produces: `Dropdown({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }): JSX.Element`. Anchored menu (`absolute right-0 top-[calc(100%+10px)] w-[300px] z-40`); NOT portaled — the caller wraps trigger + `Dropdown` in a `relative` container. `role="menu"`. Closes on outside-click (document `mousedown`, checked against the menu's parent = the `relative` wrapper, so a click on the trigger inside the wrapper does NOT close) and on Escape.

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Dropdown } from "../Dropdown";

function harness(open: boolean, onClose = () => {}) {
  return render(
    <div>
      <div className="relative">
        <button>trigger</button>
        <Dropdown open={open} onClose={onClose} label="Account"><a href="#">item</a></Dropdown>
      </div>
      <button>outside</button>
    </div>,
  );
}

test("open: shows the menu and its children", () => {
  harness(true);
  expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  expect(screen.getByText("item")).toBeVisible();
});

test("Escape closes", () => {
  const onClose = vi.fn();
  harness(true, onClose);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

test("mousedown outside the wrapper closes; the trigger does not", () => {
  const onClose = vi.fn();
  harness(true, onClose);
  fireEvent.mouseDown(screen.getByText("trigger")); // inside .relative wrapper → stays open
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByText("outside")); // outside → closes
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test Dropdown` — Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**
```tsx
"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Small anchored menu for the desktop account avatar. Inline (not portaled) — it is tiny and lives
 * inside the topbar's `relative` wrapper. Outside-click checks the menu's PARENT (the caller's
 * `.relative` wrapper that also holds the trigger), mirroring the mockup's `!closest('.acctwrap')`
 * so clicking the avatar toggles rather than double-fires. z-40: below the topbar, as in the mockup.
 */
export function Dropdown({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const wrap = ref.current?.parentElement;
      if (wrap && !wrap.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      aria-hidden={!open}
      className={`absolute right-0 top-[calc(100%+10px)] z-40 w-[300px] rounded-[18px] border border-white bg-card p-1.5 [box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)] transition-[opacity,transform] duration-150 ${
        open ? "opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm -C frontend test Dropdown` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/components/ui/Dropdown.tsx frontend/components/ui/__tests__/Dropdown.test.tsx
git commit -m "feat(STE-48): Dropdown primitive (anchored, outside-click + Escape)"
```

---

### Task 4: `Dialog` primitive

**Files:**
- Create: `frontend/components/ui/Dialog.tsx`
- Test: `frontend/components/ui/__tests__/Dialog.test.tsx`

**Interfaces:**
- Consumes: `react-dom` `createPortal`.
- Produces: `Dialog({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }): JSX.Element | null`. Centered modal portaled to `document.body`, `z-[70]`, grid `place-items-center` (no transform — U14). `role="dialog" aria-modal="true" aria-label`, Escape + backdrop-click close, body scroll-lock. SSR-guarded.

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "../Dialog";

test("open: portals a labelled dialog with its children", () => {
  render(<Dialog open onClose={() => {}} label="Approve safe exit"><p>modal body</p></Dialog>);
  expect(screen.getByRole("dialog", { name: "Approve safe exit" })).toBeInTheDocument();
  expect(screen.getByText("modal body")).toBeVisible();
});

test("Escape and backdrop click both close", () => {
  const onClose = vi.fn();
  render(<Dialog open onClose={onClose} label="Approve safe exit"><p>x</p></Dialog>);
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByTestId("dialog-wrap")); // click the wrapper (not the panel) → close
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("locks body scroll while open and restores it on close", () => {
  const { rerender } = render(<Dialog open onClose={() => {}} label="Approve safe exit"><p>x</p></Dialog>);
  expect(document.body.style.overflow).toBe("hidden");
  rerender(<Dialog open={false} onClose={() => {}} label="Approve safe exit"><p>x</p></Dialog>);
  expect(document.body.style.overflow).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test Dialog` — Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**
```tsx
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Centered modal for a single focused decision (the safe-exit approval, and the deposit consent step
 * reused inside the add-funds drawer). Portaled to body, z-[70] (above every drawer). Centering is a
 * grid, never a transform (U14). Backdrop is a pointer-events-none overlay; clicks on the empty grid
 * area hit the wrapper itself, so `target === currentTarget` closes only on a true outside click.
 */
export function Dialog({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div
      data-testid="dialog-wrap"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`fixed inset-0 z-[70] grid place-items-center p-5 transition-opacity duration-150 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(17,19,22,.32)] backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className="relative w-[min(480px,100%)] rounded-[22px] border border-white bg-card p-6 outline-none [box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm -C frontend test Dialog` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/components/ui/Dialog.tsx frontend/components/ui/__tests__/Dialog.test.tsx
git commit -m "feat(STE-48): Dialog primitive (centered, portal, Escape + backdrop close)"
```

---

### Task 5: `usePanel` — `?panel=` URL wiring

**Files:**
- Create: `frontend/hooks/usePanel.ts`
- Test: `frontend/hooks/__tests__/usePanel.test.tsx`

**Interfaces:**
- Consumes: `next/navigation` `useSearchParams`, `useRouter`, `usePathname`.
- Produces:
  ```ts
  export type Panel = "add-funds" | "move-to-wallet" | "activity" | "safe-exit";
  export function usePanel(): { panel: Panel | null; open: (name: Panel) => void; close: () => void };
  ```
  `panel` reads `?panel=`, returning `null` for any unknown value. `open(name)` `router.push`es `${pathname}?panel=name` (so Back closes it); `close()` `router.replace`es back to `pathname` (dropping the param without stacking history). NOT pure `useState` — the URL is source of truth (STE-43).

- [ ] **Step 1: Write the failing test**
```tsx
import { renderHook, act } from "@testing-library/react";
import { usePanel } from "../usePanel";

const h = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(h.search),
}));

beforeEach(() => {
  h.push.mockClear();
  h.replace.mockClear();
});

test("reads the current panel param", () => {
  h.search = "panel=activity";
  const { result } = renderHook(() => usePanel());
  expect(result.current.panel).toBe("activity");
});

test("an unknown panel value reads as null", () => {
  h.search = "panel=bogus";
  const { result } = renderHook(() => usePanel());
  expect(result.current.panel).toBeNull();
});

test("open pushes ?panel=", () => {
  h.search = "";
  const { result } = renderHook(() => usePanel());
  act(() => result.current.open("add-funds"));
  expect(h.push).toHaveBeenCalledWith("/home?panel=add-funds");
});

test("close replaces back to the bare path", () => {
  h.search = "panel=add-funds";
  const { result } = renderHook(() => usePanel());
  act(() => result.current.close());
  expect(h.replace).toHaveBeenCalledWith("/home");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test usePanel` — Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**
```tsx
"use client";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Panel = "add-funds" | "move-to-wallet" | "activity" | "safe-exit";
const PANELS: readonly Panel[] = ["add-funds", "move-to-wallet", "activity", "safe-exit"];

/**
 * URL-backed desktop overlay state. The `?panel=` search param is the single source of truth, so
 * Back/refresh/deep-link/share all behave (STE-43). `open` pushes (Back closes the overlay); `close`
 * replaces (a dismissed overlay leaves no history entry). Desktop-only consumers; mobile keeps
 * `nav.forward(route)`.
 */
export function usePanel(): { panel: Panel | null; open: (name: Panel) => void; close: () => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("panel");
  const panel = PANELS.includes(raw as Panel) ? (raw as Panel) : null;

  const open = useCallback(
    (name: Panel) => {
      const next = new URLSearchParams(params.toString());
      next.set("panel", name);
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("panel");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname, router]);

  return { panel, open, close };
}
```
> **Next 16 note:** `useSearchParams` consumers must sit under a `<Suspense>` boundary for static prerender. The `(app)` routes are client components behind `AuthGate` and the plan's gates are typecheck/lint/vitest (which mock `next/navigation`) + Playwright (dev server) — none of which trip the prerender error. If a later `pnpm -C frontend build` flags it, wrap the `DesktopOverview` return in `<Suspense fallback={null}>`. Do not add it pre-emptively.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm -C frontend test usePanel` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/hooks/usePanel.ts frontend/hooks/__tests__/usePanel.test.tsx
git commit -m "feat(STE-48): usePanel — URL-backed ?panel= overlay state"
```

---

### Task 6: Add-funds drawer

**Files:**
- Create: `frontend/components/desktop/AddFundsDrawer.tsx`
- Test: `frontend/components/desktop/__tests__/AddFundsDrawer.test.tsx`
- Modify: `frontend/components/home/DesktopOverview.tsx` (mount the drawer + switch the "Add funds" button to `open("add-funds")`)

**Interfaces:**
- Consumes: `Drawer` (Task 2), `Dialog` (Task 4), `Button`/`CoinBadge` (`../ui`), `sanitizeAmount` (Task 1), `STABLECOINS`/`stablecoinBySym`/`getWalletBalance`/`StablecoinSym` (`../../lib/vault/data`), `toAmount`/`fromAmount`/`formatCurrency` (`../../lib/vault/units`), `useVault`/`useWallet`/`useToast`, `depositorSigner`, `recordDeposit`, `toWalletError`/`USER_CLOSED_MODAL`. Deposit submit is **duplicated from `DepositKeypad`** (interface-map §2) — NOT a shared component (accepted cost of keeping mobile untouched).
- Produces: `AddFundsDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element`. Two in-drawer steps (pick stablecoin → amount), consent via `Dialog` (ConsentSheet copy, not `BottomSheet`), and an in-drawer done step. No Review step.

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { AddFundsDrawer } from "../AddFundsDrawer";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup() {
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GNEW", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient(); // fresh → hasConsent=false → consent step surfaces
  render(
    <VaultProvider client={client}><ToastProvider>
      <AddFundsDrawer open onClose={() => {}} />
    </ToastProvider></VaultProvider>,
  );
  return { sign, client };
}

test("pick USDC → deposit through consent → done step, and no risk words", async () => {
  const user = userEvent.setup();
  const { sign, client } = setup();
  // Step 1: stablecoin list.
  await user.click(screen.getByRole("button", { name: /USDC/ }));
  // Step 2: header switches to "Deposit USDC".
  expect(screen.getByText("Deposit USDC")).toBeInTheDocument();
  // Amount input (plain <input>, not the numpad).
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Deposit" }));
  // Consent shows in the Dialog (not a BottomSheet).
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(2)); // consent + deposit
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  expect(screen.getByText(/deposit sent/i)).toBeInTheDocument(); // in-drawer done step
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test AddFundsDrawer` — Expected: FAIL (module missing).

- [ ] **Step 3: Write the drawer**
```tsx
"use client";
import { useRef, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Drawer } from "../ui/Drawer";
import { Dialog } from "../ui/Dialog";
import { Button, CoinBadge } from "../ui";
import { STABLECOINS, stablecoinBySym, getWalletBalance, type StablecoinSym } from "../../lib/vault/data";
import { sanitizeAmount } from "../../lib/vault/sanitize";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useToast } from "../../hooks/useToast";
import { depositorSigner } from "../../lib/vault/signer";
import { recordDeposit } from "../../lib/vault/contributions";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * Desktop add-funds drawer: mirrors the mobile AddFunds + DepositKeypad flow (interface-map §1–2,
 * §12) merged into two in-drawer steps (pick stablecoin → amount), an <input> instead of the numpad,
 * and an in-drawer done step. The deposit submit is DUPLICATED from DepositKeypad on purpose — the
 * mobile keypad stays byte-identical. Consent reuses the ConsentSheet COPY inside the Dialog (z-[70],
 * above the drawer) rather than the BottomSheet wrapper.
 */
export function AddFundsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [sym, setSym] = useState<StablecoinSym | null>(null);
  const [amount, setAmount] = useState("0");
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  const coin = sym ? stablecoinBySym(sym) : undefined;
  const currency: Currency = coin?.currency ?? "USD";
  const cur = currency === "EUR" ? "€" : "$";
  const available = sym ? getWalletBalance(sym) : 0n;
  const entered = toAmount(amount);
  const exceeded = entered > available;

  const reset = () => {
    setSym(null);
    setAmount("0");
    setDone(false);
    setConsentOpen(false);
  };
  const close = () => {
    onClose();
    reset();
  };
  const pick = (s: StablecoinSym) => {
    setSym(s);
    setAmount("0");
  };
  const back = () => {
    setSym(null);
    setAmount("0");
  };
  const quick = (pct: number) => setAmount(fromAmount(BigInt(Math.floor(Number(available) * pct))));

  const runDeposit = async () => {
    if (!address) return;
    const deposited = toAmount(amount);
    await client.deposit(address, currency, deposited).signAndSubmit(depositorSigner(address, signTransaction));
    recordDeposit(currency, deposited); // cost-basis for "Total earned"
    show("Deposited. Agent is allocating.");
    bump(); // Overview refetches buckets
    setDone(true);
  };

  const onConfirm = async () => {
    if (inFlight.current || !address || busy || entered <= 0n || exceeded) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!(await client.hasConsent(address))) {
        setConsentOpen(true);
        return;
      }
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) show(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onAgree = async () => {
    if (inFlight.current || !address) return;
    inFlight.current = true;
    setConsentOpen(false);
    setBusy(true);
    try {
      await client.setPolicyConsent(address).signAndSubmit(depositorSigner(address, signTransaction));
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) show(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const title = done ? "Done" : sym ? `Deposit ${sym}` : "Add funds";

  return (
    <Drawer open={open} onClose={close} label="Add funds">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <div className="flex items-center gap-2.5">
          {sym && !done && (
            <button aria-label="Back to assets" onClick={back} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-pill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          <span className="text-[17px] font-semibold">{title}</span>
        </div>
        <button aria-label="Close" onClick={close} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center gap-3.5 px-[22px] py-11 text-center">
          <div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-[rgba(22,163,74,.12)] text-pos">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="text-lg font-semibold">Deposit sent</div>
          <p className="max-w-[250px] text-sm leading-relaxed text-muted">Your {currency} bucket is now earning. Move to your wallet anytime.</p>
          <Button className="mt-2" onClick={close}>Done</Button>
        </div>
      ) : !sym ? (
        <div className="flex-1 overflow-auto px-[22px] py-5">
          <p className="mb-2 text-[12.5px] font-medium text-muted">Stablecoins</p>
          {STABLECOINS.map((s, i) => (
            <button
              key={s.sym}
              onClick={() => pick(s.sym)}
              className={`flex w-full items-center gap-[13px] py-3.5 text-left ${i === 0 ? "" : "border-t border-line"}`}
            >
              <CoinBadge token={s.sym} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.sym}</div>
                <div className="mt-[5px] flex flex-wrap gap-1.5">
                  {s.chains.map((c) => (
                    <span key={c} className="inline-flex h-[22px] items-center rounded-full bg-pill px-[9px] text-[11.5px] font-medium text-muted">{c}</span>
                  ))}
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-faint"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-auto px-[22px] py-5">
          {/* wallet balance line (getWalletBalance fixture; real trustline read = STE-52). */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-pill px-3.5 py-3">
            <CoinBadge token={sym} size={30} />
            <div className="text-[15px] font-semibold [font-variant-numeric:tabular-nums]">{formatCurrency(available, currency)} {sym}</div>
          </div>
          {/* STE-52 (reserved, NOT implemented): in integration mode with a zero trustline balance,
              this line is replaced by an env-gated "Get test funds" button (disabled on mainnet). */}
          <p className="mb-2 text-[12.5px] font-medium text-muted">Amount</p>
          <div className="flex items-center gap-1.5 rounded-2xl border border-line-2 bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
            <span className="text-[26px] font-semibold text-[#3f4448]">{cur}</span>
            <input
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              className="w-full min-w-0 flex-1 border-none bg-transparent text-[30px] font-semibold tracking-[-.02em] text-ink outline-none [font-variant-numeric:tabular-nums]"
            />
          </div>
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => quick(0.1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">10%</button>
            <button onClick={() => quick(0.5)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">50%</button>
            <button onClick={() => quick(1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">Max</button>
          </div>
          {exceeded && <p className="mt-2.5 text-center text-[12.5px] text-neg">Not enough balance</p>}
          <div className="mt-auto pt-6">
            <Button onClick={onConfirm} disabled={busy || exceeded || entered <= 0n}>Deposit</Button>
          </div>
        </div>
      )}

      {/* Consent in a Dialog — reuse the ConsentSheet COPY (interface-map §4), not its BottomSheet. */}
      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} label="Approve automatic earning">
        <h1 className="mb-1.5 text-xl font-semibold">Approve once, earn automatically</h1>
        <p className="mb-[18px] text-sm text-muted">
          Sign one time to let the agent put your money in the safest pools and reinvest what it earns,
          without asking you every time. Your money stays yours, and only you can move it out.
        </p>
        <Button onClick={onAgree}>Agree &amp; sign</Button>
      </Dialog>
    </Drawer>
  );
}
```

- [ ] **Step 4: Wire it into `DesktopOverview`**
In `frontend/components/home/DesktopOverview.tsx`: add `import { usePanel } from "../../hooks/usePanel";` and `import { AddFundsDrawer } from "../desktop/AddFundsDrawer";`. Add `const { panel, open, close } = usePanel();` near the other hooks. Change the hero "Add funds" button from `onClick={() => nav.forward("/add-funds")}` to `onClick={() => open("add-funds")}`. Before the closing `</>`, mount:
```tsx
<AddFundsDrawer open={panel === "add-funds"} onClose={close} />
```
(Leave "Move to wallet"/"View all"/FreezeBanner as-is for now — later tasks convert them.)

- [ ] **Step 5: Run tests**
Run: `pnpm -C frontend test AddFundsDrawer` — Expected: PASS. Then `pnpm -C frontend test home` and `pnpm -C frontend test DepositKeypad` — Expected: still PASS (mobile deposit untouched; `useIsDesktop` is mocked `false` in home.test so `DesktopOverview` is not rendered there). Then `pnpm -C frontend typecheck`.

- [ ] **Step 6: Commit**
```bash
git add frontend/components/desktop/AddFundsDrawer.tsx frontend/components/desktop/__tests__/AddFundsDrawer.test.tsx frontend/components/home/DesktopOverview.tsx
git commit -m "feat(STE-48): desktop add-funds drawer (pick FX → amount → consent → done)"
```

---

### Task 7: Move-to-wallet drawer

**Files:**
- Create: `frontend/components/desktop/WithdrawDrawer.tsx`
- Test: `frontend/components/desktop/__tests__/WithdrawDrawer.test.tsx`
- Modify: `frontend/components/home/DesktopOverview.tsx` (mount + switch the "Move to wallet" button)

**Interfaces:**
- Consumes: `Drawer`, `Button`/`CoinBadge`, `useBuckets`, `useVault`/`useWallet`/`useToast`, `sanitizeAmount`, `toAmount`/`fromAmount`/`formatCurrency`, `SHARE_PRICE_SCALE`/`Currency` (`@sorosense/vault-client`), `depositorSigner`, `recordWithdraw`, `toWalletError`/`USER_CLOSED_MODAL`. Withdraw submit is **duplicated from `WithdrawKeypad`** (interface-map §3) — same max→`balanceOf` share math, else `entered * SHARE_PRICE_SCALE / sharePrice`.
- Produces: `WithdrawDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element`. Bucket cycler (`useBuckets`, only shows the chevron when `buckets.length >= 2`), "{value} available", `<input>` + 10/50/Max, "Not enough balance" hint, in-drawer done step, `bump()`.

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { seedVault } from "../../../lib/vault/seed";
import { WithdrawDrawer } from "../WithdrawDrawer";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function setup() {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // funds USD + EUR (≥2 buckets)
  render(
    <VaultProvider client={client}><ToastProvider>
      <WithdrawDrawer open onClose={() => {}} />
    </ToastProvider></VaultProvider>,
  );
  return { sign, client };
}

test("cycler shows with ≥2 buckets; over-balance disables the button and shows the hint", async () => {
  await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByTestId("bucket-chevron")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "999999" } });
  expect(screen.getByText(/not enough balance/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Move to wallet" })).toBeDisabled();
});

test("a valid withdraw signs, reduces the balance, and shows the done step", async () => {
  const user = userEvent.setup();
  const { sign, client } = await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  const before = await client.balanceOf("GUSER", "USD");
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  await waitFor(() => expect(sign).toHaveBeenCalled());
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeLessThan(before));
  expect(screen.getByText(/sent to your wallet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test WithdrawDrawer` — Expected: FAIL (module missing).

- [ ] **Step 3: Write the drawer**
```tsx
"use client";
import { useRef, useState } from "react";
import { SHARE_PRICE_SCALE, type Currency } from "@sorosense/vault-client";
import { Drawer } from "../ui/Drawer";
import { Button, CoinBadge } from "../ui";
import { useBuckets } from "../../hooks/useBuckets";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useToast } from "../../hooks/useToast";
import { sanitizeAmount } from "../../lib/vault/sanitize";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { depositorSigner } from "../../lib/vault/signer";
import { recordWithdraw } from "../../lib/vault/contributions";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * Desktop move-to-wallet drawer: mirrors WithdrawKeypad (interface-map §3, §13) with an <input>
 * instead of the numpad and an in-drawer done step. The withdraw submit is DUPLICATED from
 * WithdrawKeypad on purpose (mobile stays byte-identical): "Max" burns the full share balance via
 * balanceOf (no dust), else shares = entered * SCALE / sharePrice.
 */
export function WithdrawDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { buckets } = useBuckets();
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState("0");
  const [maxSelected, setMaxSelected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  const active = buckets[i] ?? buckets[0];
  const cur = active?.currency === "EUR" ? "€" : "$";
  const multi = buckets.length >= 2;
  const entered = toAmount(amount);
  const available = active?.value ?? 0n;
  const exceeded = !!active && entered > available;

  const close = () => {
    onClose();
    setI(0);
    setAmount("0");
    setMaxSelected(false);
    setDone(false);
  };
  const cycle = () => {
    if (!multi) return;
    setI((n) => (n + 1) % buckets.length);
    setAmount("0");
    setMaxSelected(false);
  };
  const quick = (pct: number) => {
    if (!active) return;
    setMaxSelected(pct === 1);
    setAmount(fromAmount(BigInt(Math.floor(Number(active.value) * pct))));
  };

  const onConfirm = async () => {
    if (inFlight.current || !address || !active || busy || exceeded) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const currency: Currency = active.currency;
      const enteredAmount = toAmount(amount);
      if (enteredAmount <= 0n) return;
      const isMax = maxSelected;
      const shares = isMax
        ? await client.balanceOf(address, currency)
        : (enteredAmount * SHARE_PRICE_SCALE) / (await client.sharePrice(currency));
      if (shares <= 0n) return;
      await client.withdraw(address, currency, shares).signAndSubmit(depositorSigner(address, signTransaction));
      recordWithdraw(currency, isMax ? active.value : enteredAmount);
      show("Sent to your wallet");
      bump();
      setDone(true);
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) show(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <Drawer open={open} onClose={close} label="Move to wallet">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <span className="text-[17px] font-semibold">{done ? "Done" : "Move to wallet"}</span>
        <button aria-label="Close" onClick={close} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center gap-3.5 px-[22px] py-11 text-center">
          <div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-[rgba(22,163,74,.12)] text-pos">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="text-lg font-semibold">Sent to your wallet</div>
          <Button className="mt-2" onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-auto px-[22px] py-5">
          <div className="mb-2 flex justify-center">
            <button
              aria-label="Choose bucket"
              onClick={cycle}
              className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold"
            >
              <CoinBadge currency={active?.currency ?? "USD"} size={22} />
              {active?.name ?? "USD bucket"}
              {multi && (
                <svg data-testid="bucket-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
              )}
            </button>
          </div>
          <p className="mb-3.5 text-center text-[12.5px] text-muted">
            {active ? `${formatCurrency(active.value, active.currency)} available` : "—"}
          </p>
          <p className="mb-2 text-[12.5px] font-medium text-muted">Amount</p>
          <div className="flex items-center gap-1.5 rounded-2xl border border-line-2 bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
            <span className="text-[26px] font-semibold text-[#3f4448]">{cur}</span>
            <input
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={(e) => {
                setMaxSelected(false);
                setAmount(sanitizeAmount(e.target.value));
              }}
              className="w-full min-w-0 flex-1 border-none bg-transparent text-[30px] font-semibold tracking-[-.02em] text-ink outline-none [font-variant-numeric:tabular-nums]"
            />
          </div>
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => quick(0.1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">10%</button>
            <button onClick={() => quick(0.5)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">50%</button>
            <button onClick={() => quick(1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">Max</button>
          </div>
          {exceeded && <p className="mt-2.5 text-center text-[12.5px] text-neg">Not enough balance</p>}
          <div className="mt-auto pt-6">
            <Button onClick={onConfirm} disabled={busy || exceeded || !active || entered <= 0n}>Move to wallet</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 4: Wire it into `DesktopOverview`**
Add `import { WithdrawDrawer } from "../desktop/WithdrawDrawer";`. Change the hero "Move to wallet" button from `onClick={() => nav.forward("/withdraw")}` to `onClick={() => open("move-to-wallet")}`. Mount alongside the add-funds drawer:
```tsx
<WithdrawDrawer open={panel === "move-to-wallet"} onClose={close} />
```

- [ ] **Step 5: Run tests**
Run: `pnpm -C frontend test WithdrawDrawer` — Expected: PASS. Then `pnpm -C frontend test WithdrawKeypad` and `pnpm -C frontend test home` — Expected: still PASS. Then `pnpm -C frontend typecheck`.

- [ ] **Step 6: Commit**
```bash
git add frontend/components/desktop/WithdrawDrawer.tsx frontend/components/desktop/__tests__/WithdrawDrawer.test.tsx frontend/components/home/DesktopOverview.tsx
git commit -m "feat(STE-48): desktop move-to-wallet drawer (bucket cycler + input)"
```

---

### Task 8: Account dropdown

**Files:**
- Create: `frontend/components/desktop/AccountMenu.tsx`
- Test: `frontend/components/desktop/__tests__/AccountMenu.test.tsx`
- Modify: `frontend/components/ui/TopBar.tsx` (accept an `account` slot)
- Modify: `frontend/app/(app)/layout.tsx` (render `<AccountMenu>` in the slot on desktop; keep the mobile `nav.forward("/account")` fallback)
- Modify: `frontend/app/(app)/__tests__/shell.test.tsx` (mock `useIsDesktop`)

**Interfaces:**
- Consumes: `Dropdown` (Task 3), `Switch` (`../ui`), `Identicon` (`../account/Identicon`), `LogoutSheet` (`../account/LogoutSheet`), `useWallet` (`{ address, walletName, disconnect }`), `useConsent` (`{ enabled }`), `useNav`, `usePanel`. Copy-address + read-only Switch patterns lifted from `account/page.tsx` (interface-map §7).
- Produces: `AccountMenu(): JSX.Element` — a `relative` wrapper holding the avatar button (`aria-label="Account"`, toggles the dropdown) + `Dropdown`. Contents: copy-address pill ("Copied" feedback), Activity row → `open("activity")`, read-only `Switch checked={enabled} label="Auto reinvest rewards" readOnly`, Log out → `LogoutSheet` → `disconnect()` → `/`.
- `TopBar({ onAvatarClick, account }: { onAvatarClick?: () => void; account?: ReactNode })` — renders `account` in the right slot when provided, else the existing plain avatar button (`onAvatarClick`). Backward compatible with the Plan-1 `TopBar` test.

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { AccountMenu } from "../AccountMenu";

const push = vi.fn();
const openPanel = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../hooks/usePanel", () => ({ usePanel: () => ({ panel: null, open: openPanel, close: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

beforeEach(() => {
  openPanel.mockClear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  useWallet.mockReturnValue({ address: "GABCDEF12345678K3X9", walletName: "Freighter", disconnect: vi.fn() });
});

function open() {
  render(<VaultProvider client={new MockVaultClient()}><AccountMenu /></VaultProvider>);
  return userEvent.setup();
}

test("avatar toggles the dropdown; it shows the read-only switch and 'Connected via Freighter'", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));
  expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  const sw = screen.getByRole("switch", { name: "Auto reinvest rewards" });
  expect(sw).toHaveAttribute("aria-disabled", "true"); // stays read-only (deferred)
  expect(screen.getByText("Connected via Freighter")).toBeInTheDocument();
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
});

test("Activity row opens the activity panel; copy pill writes the address and shows 'Copied'", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));
  await user.click(screen.getByRole("menuitem", { name: /activity/i }));
  expect(openPanel).toHaveBeenCalledWith("activity");
  // reopen (Activity click closed it) and copy
  await user.click(screen.getByRole("button", { name: "Account" }));
  await user.click(screen.getByText("GABC…K3X9"));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("GABCDEF12345678K3X9");
  expect(await screen.findByText("Copied")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test AccountMenu` — Expected: FAIL (module missing).

- [ ] **Step 3: Write `AccountMenu`**
```tsx
"use client";
import { useState } from "react";
import { Dropdown } from "../ui/Dropdown";
import { Switch } from "../ui";
import { Identicon } from "../account/Identicon";
import { LogoutSheet } from "../account/LogoutSheet";
import { useWallet } from "../../hooks/useWallet";
import { useConsent } from "../../hooks/useConsent";
import { useNav } from "../../hooks/useNav";
import { usePanel } from "../../hooks/usePanel";

const truncate = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * Desktop account dropdown — the pieces of account/page.tsx (interface-map §7) assembled into the
 * mockup's `.dropdown` (§14): copy-address pill, Activity row → activity drawer, read-only auto-
 * reinvest Switch (STAYS read-only — a live toggle is STE-38/39/40, deferred), Log out → LogoutSheet
 * → disconnect. The mockup's logout row was a placeholder close(); here it wires the real confirm.
 */
export function AccountMenu() {
  const { address, walletName, disconnect } = useWallet();
  const { enabled } = useConsent();
  const nav = useNav();
  const { open: openPanel } = usePanel();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* non-secure context: no clipboard — leave the pill unchanged */
    }
  };
  const logout = async () => {
    setConfirming(false);
    setOpen(false);
    await disconnect();
    nav.forward("/");
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
        className="grid h-[42px] w-[42px] place-items-center overflow-hidden rounded-full border border-line bg-[#e8e8e6] p-0 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
      >
        <Identicon address={address ?? ""} size={42} />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} label="Account">
        <div className="flex flex-col items-center gap-2.5 px-3.5 pb-3 pt-4 text-center">
          <button onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EAEAEA] px-3 font-mono text-[13px] font-medium text-ink-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            {copied ? "Copied" : address ? truncate(address) : ""}
          </button>
          <span className="text-[12.5px] text-muted">Connected via {walletName ?? "your wallet"}</span>
        </div>
        <div className="mx-2 my-1.5 h-px bg-line" />
        <button role="menuitem" onClick={() => { setOpen(false); openPanel("activity"); }} className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left hover:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          <span className="grow"><span className="block text-sm font-semibold">Activity</span><span className="block text-xs text-muted">All agent and account actions</span></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-muted"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="flex w-full items-center gap-[13px] px-3 py-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M21 21v-5h-5" /></svg>
          <span className="grow"><span className="block text-sm font-semibold">Auto reinvest rewards</span><span className="block text-xs text-muted">Yield rewards flow back into your pool</span></span>
          <span data-testid="consent-state" data-state={enabled ? "on" : "off"}><Switch checked={enabled} label="Auto reinvest rewards" readOnly /></span>
        </div>
        <div className="mx-2 my-1.5 h-px bg-line" />
        <button role="menuitem" onClick={() => setConfirming(true)} className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left font-semibold text-neg hover:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 3H5v18h9M10 8l4 4-4 4M14 12H6" /></svg>
          Log out
        </button>
      </Dropdown>
      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
    </div>
  );
}
```

- [ ] **Step 4: Give `TopBar` an `account` slot**
Edit `frontend/components/ui/TopBar.tsx`:
```tsx
"use client";
import type { ReactNode } from "react";
import { useWallet } from "../../hooks/useWallet";
import { Identicon } from "../account/Identicon";

export function TopBar({ onAvatarClick, account }: { onAvatarClick?: () => void; account?: ReactNode }) {
  const { address } = useWallet();
  return (
    <header className="relative z-50 flex items-center justify-between gap-4 h-[46px] mb-[18px]">
      <span className="inline-flex items-center gap-2.5 font-semibold text-[19px] tracking-[-0.01em]">
        <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-[linear-gradient(180deg,#34383a,#131617)] shadow-[0_10px_24px_-12px_rgba(17,19,22,.6),inset_0_1px_0_rgba(255,255,255,.18)]">
          <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-none stroke-[#22c55e] [stroke-width:2.2]">
            <path d="M20 4C9 4 4 11 4 20c9 0 16-5 16-16Z" />
          </svg>
        </span>
        SoroSense
      </span>
      {account ?? (
        <button
          type="button"
          aria-label="Account"
          onClick={onAvatarClick}
          className="grid place-items-center w-[42px] h-[42px] rounded-full overflow-hidden p-0 border border-line bg-[#e8e8e6] cursor-pointer shadow-[0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
        >
          <Identicon address={address ?? ""} size={42} />
        </button>
      )}
    </header>
  );
}
```

- [ ] **Step 5: Wire the layout (branch by `useIsDesktop`)**
Edit `frontend/app/(app)/layout.tsx` — add imports for `AccountMenu` + `useIsDesktop`, compute `const isDesktop = useIsDesktop();`, and render:
```tsx
<div className="hidden lg:block">
  <TopBar account={isDesktop ? <AccountMenu /> : undefined} onAvatarClick={() => nav.forward("/account")} />
</div>
```
On mobile (`useIsDesktop() === false`, incl. jsdom default) the plain avatar button + `nav.forward("/account")` fallback stays; `AccountMenu` only mounts on desktop so mobile behavior is untouched.

- [ ] **Step 6: Keep `shell.test` green**
Edit `frontend/app/(app)/__tests__/shell.test.tsx`: add `vi.mock("../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));` (so the layout takes the mobile branch and does not mount `AccountMenu`, which needs `VaultProvider`/`useSearchParams`). No other change — the three existing assertions still hold.

- [ ] **Step 7: Run tests**
Run: `pnpm -C frontend test AccountMenu` — Expected: PASS. Then `pnpm -C frontend test TopBar` and `pnpm -C frontend test shell` and `pnpm -C frontend test account` — Expected: still PASS (mobile account page untouched). Then `pnpm -C frontend typecheck`.

- [ ] **Step 8: Commit**
```bash
git add frontend/components/desktop/AccountMenu.tsx frontend/components/desktop/__tests__/AccountMenu.test.tsx frontend/components/ui/TopBar.tsx frontend/app/\(app\)/layout.tsx frontend/app/\(app\)/__tests__/shell.test.tsx
git commit -m "feat(STE-48): desktop account dropdown (copy address, activity, read-only auto-reinvest, log out)"
```

---

### Task 9: Activity drawer

**Files:**
- Create: `frontend/components/desktop/ActivityDrawer.tsx`
- Test: `frontend/components/desktop/__tests__/ActivityDrawer.test.tsx`
- Modify: `frontend/components/home/DesktopOverview.tsx` (mount + switch the "View all" button)

**Interfaces:**
- Consumes: `Drawer`, `Segmented` (`../ui`, `variant="period"`), `ActivityList` (`../activity/ActivityList` — reused **AS-IS**, no `kind`→icon), `useActivity`, `usePendingExit`.
- Produces: `ActivityDrawer({ open, onClose, onReview }: { open: boolean; onClose: () => void; onReview: () => void }): JSX.Element`. All/Yours/Automated tabs via `Segmented` mapped to the `cat` filter; the Review pill on the proposed-exit row calls `onReview` (the panel host opens the safe-exit dialog in Task 10).

- [ ] **Step 1: Write the failing test**
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ActivityDrawer } from "../ActivityDrawer";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup(onReview = vi.fn()) {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  render(<VaultProvider client={new MockVaultClient()}><ActivityDrawer open onClose={() => {}} onReview={onReview} /></VaultProvider>);
  return onReview;
}

test("tabs filter the list by cat; Yours hides agent rows, Automated hides user rows", async () => {
  const user = setup();
  // getActivity() fixture: "you" rows include "Moved $500...", "auto" rows include "Switched to DeFindex..."
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  expect(screen.getByText(/Moved \$500/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText(/Switched to DeFindex/)).toBeNull();
  expect(screen.getByText(/Moved \$500/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Automated" }));
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  expect(screen.queryByText(/Moved \$500/)).toBeNull();

  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test ActivityDrawer` — Expected: FAIL (module missing).

- [ ] **Step 3: Write the drawer**
```tsx
"use client";
import { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { Segmented } from "../ui";
import { ActivityList } from "../activity/ActivityList";
import { useActivity } from "../../hooks/useActivity";
import { usePendingExit } from "../../hooks/usePendingExit";

const TABS = ["All", "Yours", "Automated"] as const;
type Tab = (typeof TABS)[number];
/** Tab → the ActivityItem.cat it filters to (All is the UI-only sentinel). */
const TAB_CAT: Record<Tab, "you" | "auto" | null> = { All: null, Yours: "you", Automated: "auto" };

/**
 * Desktop activity drawer: mirrors the mobile Activity page (interface-map §8) but the hand-rolled
 * tab buttons become the shared flat `Segmented` (variant="period"). ActivityList is reused AS-IS —
 * the `kind`→icon enhancement is deferred (pending Axel's reply on STE-48). Review → onReview (the
 * panel host opens the safe-exit dialog).
 */
export function ActivityDrawer({ open, onClose, onReview }: { open: boolean; onClose: () => void; onReview: () => void }) {
  const items = useActivity();
  const pend = usePendingExit();
  const [tab, setTab] = useState<Tab>("All");
  const cat = TAB_CAT[tab];
  const shown = cat === null ? items : items.filter((a) => a.cat === cat);
  return (
    <Drawer open={open} onClose={onClose} label="Activity">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <span className="text-[17px] font-semibold">Activity</span>
        <button aria-label="Close" onClick={onClose} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto px-[22px] py-5">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Filter" variant="period" />
        <div className="mt-2">
          <ActivityList items={shown} onReview={onReview} reviewed={!pend} />
        </div>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 4: Wire it into `DesktopOverview`**
Add `import { ActivityDrawer } from "../desktop/ActivityDrawer";`. Change the "View all" button (Agent activity card header) from `onClick={() => nav.forward("/account/activity")}` to `onClick={() => open("activity")}`. Mount it, wiring Review to the **existing** local `exitOpen` state for now (Task 10 replaces that with the panel):
```tsx
<ActivityDrawer open={panel === "activity"} onClose={close} onReview={() => setExitOpen(true)} />
```

- [ ] **Step 5: Run tests**
Run: `pnpm -C frontend test ActivityDrawer` — Expected: PASS. Then `pnpm -C frontend test activity` and `pnpm -C frontend test home` — Expected: still PASS (mobile activity page untouched). Then `pnpm -C frontend typecheck`.

- [ ] **Step 6: Commit**
```bash
git add frontend/components/desktop/ActivityDrawer.tsx frontend/components/desktop/__tests__/ActivityDrawer.test.tsx frontend/components/home/DesktopOverview.tsx
git commit -m "feat(STE-48): desktop activity drawer (All/Yours/Automated flat tabs)"
```

---

### Task 10: Safe-exit dialog (extract `ExitApprovalBody`)

**Files:**
- Create: `frontend/components/proposal/ExitApprovalBody.tsx` (shared `useExitApproval` hook + presentational `ExitApprovalBody`)
- Create: `frontend/components/desktop/SafeExitDialog.tsx`
- Test: `frontend/components/desktop/__tests__/SafeExitDialog.test.tsx`
- Modify: `frontend/components/proposal/ExitApproval.tsx` (consume the shared piece — **identical rendered DOM**)
- Modify: `frontend/components/home/DesktopOverview.tsx` (swap `ExitApproval` → `SafeExitDialog` gated by `panel`; FreezeBanner + activity Review + the Agent-activity `ActivityList` Review all `open("safe-exit")`; drop the local `exitOpen` state)

**Interfaces:**
- Produces:
  ```ts
  export function useExitApproval(onClose: () => void): {
    pend: ReturnType<typeof usePendingExit>;
    busy: boolean;
    toast: string | null;
    onApprove: () => void;
    onDecline: () => void;
  };
  export function ExitApprovalBody(props: {
    pend: ReturnType<typeof usePendingExit>;
    busy: boolean;
    variant: "sheet" | "dialog";
    onApprove: () => void;
    onDecline: () => void;
  }): JSX.Element;
  ```
  `variant="sheet"` reproduces the mobile stacked buttons ("Approve and sign in wallet" / "Keep it paused") VERBATIM; `variant="dialog"` renders them side-by-side ("Keep paused" / "Approve"). The From/To card + copy are lifted verbatim from `ExitApproval` (interface-map §8/§15).
- `SafeExitDialog({ open, onClose }: { open: boolean; onClose: () => void })` — `<Dialog><ExitApprovalBody variant="dialog"/></Dialog>` + the shared local `Toast` (outside the Dialog so it survives close).

- [ ] **Step 1: Write the failing test (desktop dialog)**
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault, SEED_SAFE_EXIT } from "../../../lib/vault/seed";
import { SafeExitDialog } from "../SafeExitDialog";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function setup() {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // frozen EUR pool + proposal
  const onClose = vi.fn();
  render(<VaultProvider client={client}><SafeExitDialog open onClose={onClose} /></VaultProvider>);
  return { client, onClose };
}

test("renders the approve/decline decision with no Sentinel/risk wording", async () => {
  await setup();
  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Keep paused" })).toBeInTheDocument();
  expect(screen.queryByText(/\b(risk|score|Sentinel)\b/i)).toBeNull();
});

test("Approve signs approveExit and moves the bucket to the safe pool", async () => {
  const user = userEvent.setup();
  const { client, onClose } = await setup();
  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(async () => expect(await client.pendingExit("EUR")).toBeNull());
  expect(await client.activePool("EUR")).toBe(SEED_SAFE_EXIT.EUR);
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test SafeExitDialog` — Expected: FAIL (module missing).

- [ ] **Step 3: Create `ExitApprovalBody.tsx`** (hook lifted verbatim from `ExitApproval`; card verbatim; buttons per `variant`)
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card } from "../ui";
import { usePendingExit } from "../../hooks/usePendingExit";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { formatCurrency } from "../../lib/vault/units";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * The safe-exit approval state machine, lifted VERBATIM from ExitApproval so the mobile BottomSheet
 * and the desktop Dialog stay in lockstep. Returns the live proposal view + handlers; the local
 * `toast` is rendered by each wrapper OUTSIDE its sheet/dialog (so it survives the close).
 */
export function useExitApproval(onClose: () => void) {
  const pend = usePendingExit();
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const onApprove = async () => {
    if (inFlight.current || !address || !pend?.proposal || busy) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await client.approveExit(address, pend.proposal.id).signAndSubmit(depositorSigner(address, signTransaction));
      bump();
      setToast("Exit approved. Moving your funds now.");
      onClose();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onDecline = () => {
    setToast("Kept paused. Nothing moved."); // no seam call: funds never move without approval
    onClose();
  };

  return { pend, busy, toast, onApprove, onDecline };
}

/**
 * The From/To card + copy + approve/decline buttons. `variant` picks ONLY the button block:
 * "sheet" reproduces the mobile stacked buttons verbatim (unchanged DOM); "dialog" is side-by-side.
 */
export function ExitApprovalBody({
  pend,
  busy,
  variant,
  onApprove,
  onDecline,
}: {
  pend: ReturnType<typeof usePendingExit>;
  busy: boolean;
  variant: "sheet" | "dialog";
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <>
      <h1 className="mb-1.5 text-xl font-semibold">Approve safe exit</h1>
      {pend?.proposal ? (
        <>
          <p className="mb-[18px] text-sm text-muted">
            We paused your {pend.sym} pool after we detected unusual activity in the pool. Approve
            moving your funds to another {pend.sym} pool.
          </p>
          <Card className="bg-white p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">From</div>
                <div className="font-semibold">{pend.fromLabel}</div>
              </div>
              <div className="font-semibold">{formatCurrency(pend.amount, pend.currency)}</div>
            </div>
            <div className="my-1 grid place-items-center text-faint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f5ee] text-pos">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="M23 6 13.5 16.5 8.5 11.5 1 19" /><path d="M17 6h6v6" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">To</div>
                <div className="font-semibold">{pend.toMeta?.name ?? "Safe pool"}</div>
              </div>
              {pend.toMeta && <div className="font-semibold text-pos">{pend.toMeta.apy.toFixed(2)}% APY</div>}
            </div>
          </Card>
          {variant === "sheet" ? (
            <>
              <Button className="mt-[18px]" onClick={onApprove} disabled={busy}>Approve and sign in wallet</Button>
              <Button variant="glass" className="mt-2.5" onClick={onDecline} disabled={busy}>Keep it paused</Button>
            </>
          ) : (
            <div className="mt-[18px] flex gap-2.5">
              <Button variant="glass" className="flex-1" onClick={onDecline} disabled={busy}>Keep paused</Button>
              <Button className="flex-1" onClick={onApprove} disabled={busy}>Approve</Button>
            </div>
          )}
        </>
      ) : (
        <p className="mb-2 text-sm text-muted">Preparing your safe exit.</p>
      )}
    </>
  );
}
```

- [ ] **Step 4: Refactor mobile `ExitApproval.tsx` to consume the shared piece (IDENTICAL DOM)**
```tsx
"use client";
import { BottomSheet, Toast } from "../ui";
import { useExitApproval, ExitApprovalBody } from "./ExitApprovalBody";

/**
 * The only mobile approval surface for a Sentinel-freeze exit. Now a thin wrapper: the BottomSheet +
 * the same fragment (Toast outside the sheet so it survives the approve-close), body + logic via the
 * shared ExitApprovalBody. React fragments emit no DOM, so the rendered tree is unchanged (proven by
 * the existing ExitApproval + home tests).
 */
export function ExitApproval({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pend, busy, toast, onApprove, onDecline } = useExitApproval(onClose);
  return (
    <>
      <BottomSheet open={open} onClose={onClose} label="Approve safe exit">
        <ExitApprovalBody pend={pend} busy={busy} variant="sheet" onApprove={onApprove} onDecline={onDecline} />
      </BottomSheet>
      <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}
```
> Note: `Toast` must be exported from `../ui` (it is — see the barrel). The mobile buttons, labels, card, and Toast-outside-the-sheet placement are unchanged, so `components/proposal/__tests__/ExitApproval.test.tsx` and both mobile `home.test` exit assertions remain valid.

- [ ] **Step 5: Create `SafeExitDialog.tsx`**
```tsx
"use client";
import { Dialog } from "../ui/Dialog";
import { Toast } from "../ui";
import { useExitApproval, ExitApprovalBody } from "../proposal/ExitApprovalBody";

/** Desktop safe-exit approval — the same body/logic as mobile ExitApproval, in a centered Dialog with
 *  side-by-side buttons. Toast lives outside the Dialog so it survives the approve-close. */
export function SafeExitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pend, busy, toast, onApprove, onDecline } = useExitApproval(onClose);
  return (
    <>
      <Dialog open={open} onClose={onClose} label="Approve safe exit">
        <ExitApprovalBody pend={pend} busy={busy} variant="dialog" onApprove={onApprove} onDecline={onDecline} />
      </Dialog>
      <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}
```

- [ ] **Step 6: Rewire `DesktopOverview` to the panel**
In `frontend/components/home/DesktopOverview.tsx`: remove the `const [exitOpen, setExitOpen] = useState(false);` line and the `import { ExitApproval } ...`; add `import { SafeExitDialog } from "../desktop/SafeExitDialog";`. Change:
- `FreezeBanner` → `onReview={() => open("safe-exit")}`
- the Agent-activity `ActivityList` → `onReview={() => open("safe-exit")}`
- `ActivityDrawer` → `onReview={() => open("safe-exit")}`
- replace `<ExitApproval open={exitOpen} onClose={() => setExitOpen(false)} />` with `<SafeExitDialog open={panel === "safe-exit"} onClose={close} />`

- [ ] **Step 7: Write the desktop dialog is opened from the banner test?** — covered by the SafeExitDialog test (Step 1) + Task 11 e2e. Run the full unit gate:
Run: `pnpm -C frontend test SafeExitDialog` — Expected: PASS. Then re-run the mobile-DOM guards: `pnpm -C frontend test ExitApproval` and `pnpm -C frontend test home` — Expected: still PASS (identical mobile DOM). Then `pnpm -C frontend typecheck` and `pnpm -C frontend lint`.

- [ ] **Step 8: Commit**
```bash
git add frontend/components/proposal/ExitApprovalBody.tsx frontend/components/proposal/ExitApproval.tsx frontend/components/desktop/SafeExitDialog.tsx frontend/components/desktop/__tests__/SafeExitDialog.test.tsx frontend/components/home/DesktopOverview.tsx
git commit -m "feat(STE-48): safe-exit dialog — shared ExitApprovalBody (mobile DOM unchanged)"
```

---

### Task 11: Desktop e2e + full gate

**Files:**
- Create: `frontend/e2e/desktop-overlays.spec.ts` (matches the `desktop-*` testMatch → runs only in the `desktop-chromium` project)
- Modify: `frontend/e2e/support/journey.ts` (add desktop overlay helpers)

**Interfaces:**
- Produces: desktop journey helpers that drive the drawers/dropdown/dialog by role, and one end-to-end spec covering: open add-funds drawer from the hero → deposit through it; open move-to-wallet → withdraw; open the account dropdown; open the activity drawer + filter; open the safe-exit dialog + approve. Runs in the existing `desktop-chromium` Playwright project (Desktop Chrome, 1440×900) against the shared `MockVaultClient` singleton (`workers:1`), driving keeper state via the existing `keeper()` bridge helper. The mobile `mobile-chromium` project is untouched.

- [ ] **Step 1: Add desktop helpers to `journey.ts`**
```ts
/**
 * Desktop deposit: the hero "Add funds" opens a right drawer (role=dialog "Add funds"), not a route.
 * Pick the coin inside the drawer, fill the <input> (not the numpad), Deposit → the one-time consent
 * Dialog → the in-drawer done step. Caller must already be on the desktop /home.
 */
export async function depositViaDrawer(page: Page, coin: "USDC" | "EURC" | "CETES", amount: string): Promise<void> {
  await page.getByRole("button", { name: "Add funds" }).click();
  const drawer = page.getByRole("dialog", { name: "Add funds" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: new RegExp(`^${coin}`) }).click();
  await expect(drawer.getByText(`Deposit ${coin}`)).toBeVisible();
  await drawer.getByLabel("Amount").fill(amount);
  await drawer.getByRole("button", { name: "Deposit" }).click();
  const consent = page.getByRole("dialog", { name: "Approve automatic earning" });
  await expect(consent).toBeVisible();
  await consent.getByRole("button", { name: "Agree & sign" }).click();
  await expect(drawer.getByText("Deposit sent")).toBeVisible();
  await drawer.getByRole("button", { name: "Done" }).click();
}
```

- [ ] **Step 2: Write the desktop overlays spec**
```ts
import { expect, test } from "@playwright/test";
import { keeper } from "./support/bridge";
import { connectWallet, depositViaDrawer, expectDesktopHome, shot } from "./support/journey";

test("desktop overlays: add-funds drawer, move-to-wallet, account dropdown, activity filter, safe-exit approve", async ({ page }) => {
  await connectWallet(page);
  await expectDesktopHome(page);

  // 1. Add funds through the drawer (first deposit surfaces the consent dialog).
  await depositViaDrawer(page, "EURC", "500");
  await expect(page.getByText("Deposited. Agent is allocating.")).toBeVisible();
  await expect(page.getByText("EUR bucket")).toBeVisible();
  await shot(page, "desktop-02-add-funds");

  // 2. Move to wallet through the drawer.
  await page.getByRole("button", { name: "Move to wallet" }).click();
  const wd = page.getByRole("dialog", { name: "Move to wallet" });
  await expect(wd).toBeVisible();
  await wd.getByLabel("Amount").fill("100");
  await wd.getByRole("button", { name: "Move to wallet" }).click();
  await expect(wd.getByText("Sent to your wallet")).toBeVisible();
  await wd.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Sent to your wallet")).toBeVisible(); // global toast
  await shot(page, "desktop-03-move-to-wallet");

  // 3. Account dropdown.
  await page.getByRole("button", { name: "Account" }).click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("switch", { name: "Auto reinvest rewards" })).toHaveAttribute("aria-disabled", "true");
  await shot(page, "desktop-04-account-dropdown");

  // 4. Activity drawer + filter (from the account dropdown's Activity row).
  await menu.getByRole("menuitem", { name: /activity/i }).click();
  const act = page.getByRole("dialog", { name: "Activity" });
  await expect(act).toBeVisible();
  await act.getByRole("button", { name: "Yours" }).click();
  await expect(act.getByText(/Switched to DeFindex/)).toHaveCount(0);
  await act.getByRole("button", { name: "All" }).click();
  await expect(act.getByText(/Switched to DeFindex/)).toBeVisible();
  await page.keyboard.press("Escape"); // Drawer Escape closes
  await expect(act).toBeHidden();
  await shot(page, "desktop-05-activity");

  // 5. Safe-exit: freeze + propose via the keeper, then approve through the centered dialog.
  await keeper(page, "allocate", "EUR", "400");
  await keeper(page, "freeze", "EUR");
  await keeper(page, "proposeExit", "EUR");
  await page.getByRole("button", { name: "Review paused pool" }).click();
  const exit = page.getByRole("dialog", { name: "Approve safe exit" });
  await expect(exit.getByText("DeFindex EURC")).toBeVisible();
  await exit.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Exit approved. Moving your funds now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review paused pool" })).toBeHidden();
  await shot(page, "desktop-06-safe-exit-approved");
});
```
> Notes: the `FreezeBanner` still renders `aria-label="Review paused pool"` (reused as-is). All drawers/dialog set `aria-label`, so `getByRole("dialog"/"menu", { name })` targets each precisely and skips the aria-hidden (closed) overlays. The spec runs after the other desktop spec against the shared singleton, so it never assumes an absolute starting balance (partial `"100"` withdraw, never Max).

- [ ] **Step 3: Run both Playwright projects**
Run: `pnpm -C frontend exec playwright test` — Expected: `mobile-chromium` (the U17 mobile journey + risk-word tour) green AND `desktop-chromium` (existing `desktop-overview` smoke + new `desktop-overlays`) green.

- [ ] **Step 4: Run the full gate**
Run: `pnpm -r typecheck && pnpm -C frontend lint && pnpm -C frontend test && pnpm -C frontend exec playwright test` — Expected: all green.

- [ ] **Step 5: Commit**
```bash
git add frontend/e2e/desktop-overlays.spec.ts frontend/e2e/support/journey.ts
git commit -m "test(STE-48): desktop overlays e2e (drawers, dropdown, activity, safe-exit) — green in both projects"
```

---

## Self-review — spec requirement → task map

| Spec requirement (design spec) | Task |
| --- | --- |
| Input sanitizer (`sanitizeAmount`: comma→dot, one dot, leading-zero strip, ""→"0", ".5"→"0.5") | 1 |
| `Drawer` primitive (portal to body, right edge, Escape + scroll-lock + focus, `role=dialog` mounted) | 2 |
| `Dropdown` primitive (anchored, outside-click + Escape, `role=menu`) | 3 |
| `Dialog` primitive (centered via grid — no transform U14, portal, Escape + backdrop, z-[70]) | 4 |
| URL-backed `?panel=` (no pure `useState`; back/deep-link/refresh work) | 5, mounted in 6–10 |
| Add-funds drawer (2-step, `<input>` not numpad, no Review, consent in Dialog, done step, STE-52 slot reserved) | 6 |
| Move-to-wallet drawer (bucket cycler ≥2, `<input>`, 10/50/Max, "Not enough balance", Max=full via `balanceOf`) | 7 |
| Account dropdown (copy address "Copied", Activity → drawer, read-only auto-reinvest Switch, Log out → LogoutSheet → disconnect, "Connected via {wallet}" no date) | 8 |
| Activity drawer (All/Yours/Automated FLAT `Segmented`, filter `cat`, `ActivityList` as-is) | 9 |
| Safe-exit dialog (centered, "Approve safe exit", From/To card, side-by-side `Keep paused`/`Approve`, approve→`approveExit`+`bump`, decline moves nothing) | 10 |
| FreezeBanner + Activity Review both open safe-exit | 10 |
| Mobile unchanged (< lg byte-identical; `ExitApproval` refactor keeps DOM) | every task (re-run mobile tests); DOM guard in 10 |
| R11 invisible-safety (no risk/score/Safe-tier/Sentinel) | asserted in 6, 8, 9, 10, 11 |
| Segmented FLAT (bg-pill pressed) | reused as-is in 9 (and hero, Plan 1) |
| Blended `≈ USD`, per-currency buckets, MXN `$` | preserved via `formatCurrency`/`useBuckets` (unchanged) |
| e2e green in both viewports | 11 |

## Deferred (out of scope — awaiting Axel's reply on STE-48, per the heads-up)

- **Auto-reinvest live toggle.** The dropdown Switch stays **read-only** (bound to `hasConsent`, not `autoCompoundEnabled`). Making it live is `setAutoCompound` + a depositor-signed write — STE-38/39/40. Not built here.
- **Activity `kind`→icon.** `ActivityRow` keeps its single hardcoded plus icon; the mockup's `ICO2` per-kind map (interface-map §15) is a small `ActivityRow` enhancement, **not** implemented — `ActivityList` is reused verbatim.
- **STE-52** "Get test funds" faucet + real trustline balance: only the *slot* is reserved (a comment) in the add-funds amount step. Not implemented.

## Places where the mockup and the real components genuinely conflict (human decides)

1. **Amount entry — `<input>` vs numpad.** The mobile `DepositKeypad`/`WithdrawKeypad` render the full on-screen `Keypad` numpad; the desktop mockup (and this plan) use a plain `<input inputmode="decimal">`. The plan **duplicates** the submit orchestration into the drawers rather than hosting `DepositKeypad`/`WithdrawKeypad`, because those components hardcode the numpad + `SubHeader` + `router.push("/home")`. Accepted (spec §Add-funds/§Move-to-wallet), but it is real duplicated code (two deposit paths, two withdraw paths) — a maintenance cost to accept knowingly.
2. **Dropdown logout row.** The mockup's `.ddrow.logout onclick="closeAccount()"` is a **placeholder** (just closes the menu). The plan wires the **real** `LogoutSheet` confirm → `disconnect()` → `/` (matching `account/page.tsx`). Divergence resolved in favor of the real component (correct behavior), but it means the dropdown mounts a `BottomSheet` (`LogoutSheet`) on desktop — a mobile primitive on a desktop surface. Acceptable (z-[51], never co-mounted with a drawer), but flagging in case a desktop-native confirm is preferred later.
3. **z-index scales.** The mockup uses raw CSS `z-index: 45/60/61/70`; the frontend uses Tailwind `z-*` utilities and the topbar is `z-50`. The plan **reconciles** to Tailwind values: dropdown `z-40`, drawer scrim/panel `z-[55]/z-[56]`, dialog `z-[70]` — preserving the mockup's *ordering* (dropdown < topbar < drawer < dialog) but not its literal numbers. Worth a glance to confirm the ordering is what's wanted (notably: the dropdown sits BELOW the topbar, matching the mockup).
4. **Safe-exit dialog data.** The mockup hardcodes `EUR pool`/`€920.10`/`DeFindex EURC`/`5.90% APY` and models only the happy path (spinner→auto-close). The plan wires the **real** `usePendingExit` shape + the full state machine (interstitial "Preparing your safe exit.", failure/toast, decline-moves-nothing) via the shared `ExitApprovalBody`. No unresolved conflict — the real component is richer than the mockup; noted so the extra states aren't mistaken for scope creep.

## Spec requirements NOT mappable to a task

None. Every in-scope requirement in `docs/superpowers/specs/2026-07-13-ste-48-desktop-design.md` maps to a task above; the three items the spec itself lists as out-of-scope/deferred (auto-reinvest live toggle, activity kind→icon, STE-52 faucet) are carried in the Deferred section, not dropped silently.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-14-ste-48-desktop-overlays.md`. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
