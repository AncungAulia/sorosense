## Summary

**STE-43** — a hard load of any gated route (`/home`, `/account`, ...) bounced straight to the landing page even with a valid session sitting in `localStorage`, and the landing page never auto-forwarded a returning user back into the app. Root cause: React runs child effects before parent effects, so on a hard load `AuthGate`'s effect (child of `WalletProvider`) ran and decided "disconnected" on the very first render — before `WalletProvider`'s own effect had a chance to hydrate `address` from storage. `AuthGate` fired `router.push("/")` on that stale read, bouncing a perfectly valid session. The fix has four parts: (1) `WalletProvider` now exposes a tri-state hydration flag (`hydrated: boolean`) alongside `address`/`isConnected`, and re-verifies the stored address against `getAddress()` before trusting it (clearing the session on mismatch or throw, so a stale/foreign address is never rendered as connected); (2) `AuthGate` holds its redirect until `hydrated` is `true` — it renders nothing (`return null`) while undecided, and only pushes to `/` once hydration has definitively resolved to "no session"; (3) the landing page (`app/page.tsx`) now auto-forwards a hydrated, connected session straight to `/home` via `router.replace`, so a returning user never sees onboarding again; (4) the e2e wallet stub (`lib/wallet-e2e.ts`) was made to survive a page reload — it previously held its connection flag in module scope (`let connected`), which resets on every hard load, so it now persists a marker in `localStorage` (`soro.e2e.connected`) to mirror real Freighter keeping its connection alive in the extension across reloads. Without this, the new `getAddress()` re-verification would false-negative on every e2e deep load and bounce the user, turning the tests red while production is correct. This is what let two new Playwright specs assert the fix against real navigation instead of an assertion that raced the fix.

## Dev browser verification

Behavioral proof, not visual — the bug and the fix are both about which URL the browser ends up on after a hard navigation, so no new screenshots were required. `frontend/e2e/authgate-deep-link.spec.ts` pins both symptoms directly:

- **"a hard load of a gated route keeps a stored session on that route"** — connects (stores `soro.wallet`), then does a real `page.goto("/home")` (a hard load, not a click), and asserts the URL does *not* transiently bounce to `/` (`bouncedToLanding()` polls for `pathname === "/"` within a 2s window — a plain `toHaveURL(/\/home$/)` would have passed even with the bug present, since it can catch the still-correct URL before the buggy redirect fires). Repeats for `page.goto("/account")` to prove it's not `/home`-specific.
- **"landing forwards a stored session to /home without a second connect"** — connects, then `page.goto("/")`, and asserts the URL lands on `/home` with zero `Connect wallet` buttons on screen — proof it was the auto-forward, not the user clicking through onboarding again.

Bonus cleanup folded into this same branch: `goBackTo()`, a workaround helper in the e2e journey support code for a stale deep-link limitation, was retired now that `page.goBack()` behaves correctly on its own (the existing `connectWallet()` journey helper was adjusted to tolerate the new landing auto-forward racing against its own button-visibility check, rather than reintroducing a workaround).

## Green gate

Run from the repo root on branch `AncungAulia/ancungaulia-ste-43-authgate-bounces-deep-links-to-landing-despite-a-stored`, commit `d78b880`.

- **`pnpm -r typecheck`** — clean across all 3 workspace projects with a `typecheck` script (`packages/vault-client`, `backend`, `frontend`); no errors.
- **`pnpm -C frontend lint`** — clean; `eslint` produced no output (no warnings, no errors).
- **`pnpm -r test`** — all green:
  - `packages/vault-client` — **1 test file passed (1)**, **18 tests passed (18)**
  - `backend` — **23 test files passed (23)**, **131 tests passed (131)**
  - `frontend` — **48 test files passed (48)**, **154 tests passed (154)**
  - Combined: **303 unit tests passed** across the workspace, including `providers/__tests__/WalletProvider.test.tsx` (7 tests, covering the new tri-state hydration + re-verify), `components/__tests__/AuthGate.test.tsx` (3 tests, covering the held-redirect contract), and `app/__tests__/page.test.tsx` / `app/__tests__/landing.test.tsx` (3 + 3 tests, covering the auto-forward).
- **`pnpm e2e`** — **6 passed** (Chromium, `Pixel 5` viewport, port 3100):
  ```
  Running 6 tests using 1 worker

    ok 1 [mobile-chromium] › e2e\authgate-deep-link.spec.ts:25:5 › a hard load of a gated route keeps a stored session on that route (7.0s)
    ok 2 [mobile-chromium] › e2e\authgate-deep-link.spec.ts:39:5 › landing forwards a stored session to /home without a second connect (2.1s)
    ok 3 [mobile-chromium] › e2e\demo-flow.spec.ts:5:5 › the demo journey: connect → simulate → deposit → agent works → approve a safe exit (7.5s)
    ok 4 [mobile-chromium] › e2e\demo-flow.spec.ts:95:5 › no user surface exposes a risk label, tier, or score (7.1s)
    ok 5 [mobile-chromium] › e2e\demo-flow.spec.ts:157:5 › a rebalance never asks the user to approve anything (4.0s)
    ok 6 [mobile-chromium] › e2e\demo-flow.spec.ts:183:5 › a completed withdrawal confirms itself on /home (4.7s)

    6 passed (54.1s)
  ```
  The two new `authgate-deep-link.spec.ts` specs are the STE-43 proof; the four `demo-flow.spec.ts` specs are the pre-existing STE-27/STE-44 journey and invariants, still green (unaffected by this fix — the fixture-driven click-based navigation those specs already used never hit the bug).

No screenshots were captured for this ticket. `E2E_EVIDENCE=1 pnpm e2e` would exercise the `shot()` evidence helper, but that helper's `EVIDENCE_DIR` still points at `docs/tests/linear-STE-44/screenshots` (unrelated churn to retarget it here), and the proof for STE-43 is the URL/behavioral assertions above, not a visual — so screenshots were skipped.
