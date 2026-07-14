# STE-48 — desktop UI polish · handoff

Continuation note for picking this branch up in another tool/session (e.g. Codex). No prior chat
context is assumed — everything durable is in git: this file, the two plan docs, and the commit
messages (`git log --oneline main..HEAD`).

## What this branch is

STE-48 = frontend "UI polish", 3 phases. All three are **done** on this branch (branched from the
STE-21 Fase A point). PR #33 tracks it.

- **Fase 1 — desktop-native layout.** `useIsDesktop` (1024px), `TopBar`, responsive `(app)` shell
  (BottomNav↔TopBar, `mx-auto` container, no transform → U14-safe), desktop `DesktopOverview`
  (hero + `ValueChart` + Buckets/Growth/Agent-activity + conditional FreezeBar). Home JS-gates on
  `useIsDesktop` so exactly one tree mounts; mobile is byte-identical.
- **Fase 2 — loading skeletons.** `Skeleton` (shimmer via `::after` in `@layer components`; stilled
  under reduced-motion) wired into every fetched view: hero/chart/buckets/growth, Earn (mobile),
  and the activity feed (`useActivity` now returns `{ loading, items }`, shaped for the STE-52 fetch).
- **Fase 3 — thin motion.** All CSS keyframes, all reduced-motion-safe: `.stagger` card entrance,
  `.chart-line` draw-in, `.grow-bar` growth bars, `.fade-in` skeleton→content crossfade, `CountUp`
  hero value.

Plus (still STE-48, frontend-only):
- **Overlay surfaces** (Plan 2): `Drawer`/`Dropdown`/`Dialog` primitives (portal to `body` → U14),
  `usePanel` (`?panel=` URL-backed, not `useState`), add-funds / move-to-wallet / activity drawers,
  account dropdown, safe-exit dialog (shared `ExitApprovalBody` so mobile DOM is unchanged).
- **Desktop→drawer redirects** for `(flow)` routes (`(flow)/layout.tsx`): a desktop visitor to
  `/add-funds`, `/deposit/*`, `/withdraw`, `/account/activity`, `/earn`, `/account` is sent to
  `/home` (with the matching `?panel=` where one exists). Mobile untouched.
- **Deposit/withdraw status flow**: `useTransferFlow` + `TransferStatus` (sending → success | error,
  ~600ms floor so the spinner shows on the instant mock). Mobile = full-screen (success = Done→home,
  error = Try again / Back); desktop drawers = sending/error inline, success closes + toasts.

## How to run

```
pnpm install                       # repo root only, one lockfile
pnpm -C frontend typecheck         # hard gate (strict, noUncheckedIndexedAccess)
pnpm -C frontend lint
pnpm -C frontend test              # 195 tests, all green
pnpm -C frontend dev               # http://localhost:3000 (mock mode; connect Freighter at ≥1024px)
```
Playwright (`frontend/e2e`) was NOT run in the last session — run `pnpm -C frontend exec playwright
test` to validate the two projects (mobile-chromium + desktop-chromium) if you touch the flows.

## Conventions to keep (don't break)

- **R11 — invisible safety.** No `risk`/`score`/`Sentinel`/tier string on any surface. Test regex is
  `/\b(risk|score|sentinel)\b/i` — NOT "Safe"/"Watch": "safe exit"/"Safe pool" is the vetted action
  name, and the activity fixture legitimately contains "Proposed safe exit".
- **Mobile unchanged.** Shared components take opt-in props that default to the old behavior:
  `BucketRow`/`ActivityRow`/`ActivityList` `divider` (default true), `Segmented` `fluid` (default
  true = full-width), `ActivityList` `loading` (default false). Desktop passes the non-default.
- **Blended value is display-only, always `≈ USD`.** Per-currency buckets never converted; MXN `$`.
- **U14.** Every fixed/portaled overlay uses `createPortal(…, document.body)`; centering is
  `grid place-items-center`, never `transform`.
- **Motion & shimmer** stop under `prefers-reduced-motion`.
- **Demo-only delay convention.** To *see* skeletons on the instant mock, add an env-gated
  `if (process.env.NEXT_PUBLIC_SKELETON_DEMO === "1") await sleep(1600)` in `useBuckets`/`useActivity`
  and run `NEXT_PUBLIC_SKELETON_DEMO=1 pnpm -C frontend dev`. NEVER commit that delay.

## Pending / next

- **STE-52** (separate ticket, coordinate with Axel): wire the real backend HTTP surface (already on
  `main`: `backend/src/http/`) — replace the fixtures/`getWalletBalance` and the `useTransferFlow`
  min-duration floor with real latency. The desktop add-funds drawer reserves the "Get test funds"
  faucet slot (env-gated, not implemented).
- **Two items awaiting Axel's reply on STE-48** (never answered): auto-reinvest *live* toggle (kept
  read-only) and activity `kind`→icon (ActivityRow keeps its single plus icon).
- **PR:** this whole branch is PR #33.
