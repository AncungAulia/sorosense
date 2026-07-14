# U17 · Frontend e2e tests + wiring (STE-27) — design

**Unit:** STE-27 (sub-issue of STE-7) · **Branch:** `ancungaulia/ste-27-u17-frontend-e2e-tests-wiring`
**Requirements:** R12 (e2e demo journey), R1, R7, R9, R15.
**Verification:** `pnpm e2e` green against `MockVaultClient` + a keeper stub. Real testnet wiring is deferred to U20.

## Why this unit needs a design at all

The ticket was written on 3 July, before U13–U16 landed. Three of its assumptions no longer hold:

1. **Playwright is not installed.** There is no `frontend/e2e/`, no `pnpm e2e` script; `frontend/package.json` only has `vitest`. Building the harness is part of U17.
2. **"Connect wallet" cannot be automated as written.** Freighter is a browser extension; Playwright cannot drive its popup without loading the unpacked extension and a seed phrase. Every E2E evidence shot in U13–U16 was captured by hand. The wallet layer must be stubbed.
3. **The state the journey needs is unreachable.** `<Simulator>` renders only in the Earn *empty* branch (`app/(app)/earn/page.tsx:24`), while the freeze banner and exit proposal exist only because `seedVault()` calls `client.freeze()` + `client.proposeExit()` (`lib/vault/seed.ts:41-43`). `VaultProvider` seeds the moment an address appears, so a connected app is always funded and the simulator is never on screen. For U16's evidence the seed was disabled by commenting out code.

A fourth constraint, discovered while reading: **activity rows are a static fixture.** `hooks/useActivity.ts` returns `getActivity()` from `lib/vault/data.ts`; the rows are not derived from vault state. This matches STE-42. The e2e test may assert that the rows render — never that a deposit produced them.

## Architecture

Three seams, each gated on a single build-time flag `NEXT_PUBLIC_E2E === "1"`, which Next inlines, so every branch below is dead in a production build.

### Seam 1 — the wallet

`lib/wallet.ts` has exactly one consumer today (`providers/WalletProvider.tsx:3`, `import * as wallet`). That makes it a clean cut point.

| File | Contents |
| --- | --- |
| `lib/wallet-real.ts` | Today's `lib/wallet.ts`, moved verbatim (`git mv`). Stellar Wallets Kit, Freighter-first. |
| `lib/wallet-e2e.ts` | In-memory stub: `connect()` → a deterministic `G…` address + `"Freighter"`; `signTransaction(xdr)` → `"e2e-signed:" + xdr`; `disconnect()` clears state. |
| `lib/wallet.ts` | Dispatcher. Re-exports `WalletError` / `USER_CLOSED_MODAL` unchanged. |

```ts
// lib/wallet.ts
const E2E = process.env.NEXT_PUBLIC_E2E === "1";
export const connect = E2E ? e2e.connect : real.connect;
export const signTransaction = E2E ? e2e.sign : real.signTransaction;
```

`lib/__tests__/wallet.test.ts` retargets to `../wallet-real`; its assertions do not change.

**Accepted trade-off.** Because the ternary references both modules, `wallet-e2e.ts` stays in the production bundle (~30 lines, dead branch, no secrets, no key material). Excluding it entirely would need a webpack alias; not worth the config surface. This is the decision that needs PM sign-off.

### Seam 2 — the keeper bridge, replacing the dev seed

`lib/e2e/bridge.ts` installs `window.__sorosense__` when — and only when — the flag is on. It exposes **keeper actions**, not the raw client, so `bigint` never crosses the Node↔browser boundary and the spec does not re-author keeper choreography:

```ts
interface SorosenseBridge {
  keeper: {
    allocate(currency: Currency, amount: string): Promise<void>;
    compound(currency: Currency, amount: string): Promise<void>; // simulateYield
    freeze(currency: Currency): Promise<void>;
    proposeExit(currency: Currency): Promise<void>;
    rebalance(currency: Currency): Promise<void>; // deallocate + allocate, no proposal
  };
}
```

Each action signs with `mockSigner("keeper")`, reads pool ids from the already-exported `SEED_POOLS` / `SEED_SAFE_EXIT` (`lib/vault/seed.ts`) so no pool string is retyped, and calls `bump()` itself so the UI re-reads.

`VaultProvider` skips `seedVault()` when the flag is on. The vault therefore starts empty and **every state change in the test has a visible cause**: the user deposits, the keeper allocates, the keeper freezes. This is the "backend stub" the ticket names, and it dissolves problem (3) — no seed toggle is needed, because there is no seed.

`freeze` and `proposeExit` stay separate so the interstitial state ("Preparing your safe exit") can be asserted.

### Seam 3 — the harness

`frontend/playwright.config.ts`: `webServer` runs `next dev` with `NEXT_PUBLIC_E2E=1`; one project, Chromium at the `Pixel 5` viewport (the app is mobile-first, and the wallet stub removes U13–U16's device-mode trap). `reuseExistingServer: !process.env.CI`.

## The journey (`e2e/demo-flow.spec.ts`)

One sequence, honest in time:

1. connect (stubbed) → land on `/home`
2. `/earn` — empty state → **Simulator** projects: changing the amount and the horizon changes the figure and redraws the bars (R15)
3. "Start earning" → `/add-funds` → EURC → keypad
4. "Deposit fund" → **ConsentSheet** ("Agree & sign", one-time mandate) → toast "Deposited. Agent is allocating." → `/home`
5. EUR bucket row appears
6. keeper `allocate` + `compound` → auto-allocate / auto-compound **activity rows** visible
7. keeper `freeze` + `proposeExit` → **FreezeBanner** ("Your earning is paused")
8. tap it → **Approve safe exit** sheet → "Approve and sign in wallet" → toast, banner gone, activity pill reads "Reviewed"

Selectors use roles and aria labels that already exist (`aria-label="Review paused pool"`, sheet labels `"Approve automatic earning"` / `"Approve safe exit"`). **No new `data-testid`, no production DOM change.**

### Invariant tests (same file)

- **No risk label anywhere.** Scan `document.body.innerText` on `/`, `/home`, `/earn`, `/add-funds`, `/deposit/eurc`, `/withdraw`, `/account`, `/account/activity` for `/\b(risk|risky|tier|score)\b/i` → zero matches.
- **Rebalance never asks for approval.** Run `keeper.rebalance("USD")`, then assert no `role="dialog"` is open and no "Approve" button exists; the `rebalanced` activity row renders with no "Review" pill (only `proposed-exit` carries one). Safe-exit is the only approval surface.

`e2e/support/journey.ts` holds the shared `connect(page)` / `depositEur(page)` helpers.

## Wiring & gates

- `frontend/package.json`: `"e2e": "playwright test"`. Root `package.json`: `"e2e": "pnpm -C frontend e2e"`, so `pnpm e2e` behaves as the ticket says.
- `vitest.config.mts` excludes `e2e/**` so `pnpm -r test` does not drag Playwright in.
- Specs are typechecked by `tsc --noEmit` (hard gate, `noUncheckedIndexedAccess`). ESLint config extends to `e2e/`.
- `.gitignore`: `playwright-report/`, `test-results/`.

## Out of scope

- `useActivity` stays a fixture (STE-42, backend, Axel's).
- Per-currency APY stays hardcoded in `lib/vault/data.ts` (STE-41, awaiting ACC).
- No testnet contract wiring (U20).
- No CI job; `pnpm e2e` is run locally and its output is the evidence.

## Evidence

`docs/tests/linear-STE-27/` — `e2e-evidence.md` plus the green `pnpm e2e` output and Playwright's captured screenshots at the journey's key steps. PR uses the `pr-e2e-evidence` template.
