## Summary
- **U14 (STE-24)** — core deposit-to-earn surfaces from `docs/mockups/sorosense-mock-2.html`, built against the mock vault seam (`@sorosense/vault-client`):
  - **Home** — per-currency buckets (venue + APY, no risk label), agent-activity preview, "View all activity" → `/account/activity`, freeze banner when a pool is paused.
  - **Add funds** — fundable stablecoins only (USDC/EURC/CETES), no explore/RWA catalog (R19).
  - **Deposit** — full-page keypad (10%/50%/Max), "Goes to your X bucket. No conversion.", **no risk tier**, one-time consent on the first deposit (KTD3), amber "pool is paused" note when the currency's active pool is frozen.
  - **Withdraw** ("Move to wallet") — bucket picker (chevron only with ≥2 buckets), amount→shares, Max withdraws full shares.
  - Minimal **Earn** stub (hosts the withdraw entry) + **Activity** page (All/Yours/Automated filter).
- Data is mocked via `MockVaultClient` + frontend fixtures that mirror backend `CatalogEntry`/`ActivityEntry` shapes, so the live wiring at U15/U17/U20 is a one-file swap. Signing reuses the U13 wallet.

## E2E evidence
<details>
<summary>Dev browser verification</summary>

Passed on dev.

Environment:
- Branch: `AncungAulia/ancungaulia-ste-24-u14-home-add-funds-deposit-withdraw` · Commit: `2856156` · URL: `http://localhost:3000` (`pnpm -C frontend dev`)
- Note: capture at a **desktop viewport** — under DevTools device-mode (mobile UA) Freighter does not inject and Stellar Wallets Kit shows "Install" (kit/Freighter behaviour, not app logic).

Before / After (annotated composite, cropped to the relevant UI):
- `/home` — Home with per-currency buckets, agent-activity preview, "View all" link, freeze banner (EUR pool paused):
  ![home before-after](<upload composite here>)
- `/add-funds` — fundable stablecoins only, no RWA/explore catalog:
  ![add-funds](<upload composite here>)
- `/deposit/usdc` and `/deposit/eurc` — full-page keypad, **no risk tier**; EURC shows the amber paused-pool note, USDC does not:
  ![deposit no-tier + amber](<upload composite here>)
- Consent — first deposit opens the one-time safety-mandate sheet and signs consent then the deposit (two signatures):
  ![consent first-deposit](<upload composite here>)
- `/withdraw` — bucket picker (chevron with ≥2 buckets), Max:
  ![withdraw picker](<upload composite here>)
- `/account/activity` — Activity page with All/Yours/Automated filter:
  ![activity filter](<upload composite here>)

Result:
- Deposit against the mock updates the bucket balance reflected on Home (shared singleton).
- First deposit triggers the consent signature then the deposit signature; later deposits sign once.
- Deposit keypad has no risk-tier control; the amber note appears only when the currency's active pool is frozen.
- Add funds lists only fundable stablecoins.
- Withdraw shows the bucket chevron only with ≥2 buckets and signs; Max withdraws the full share balance.
- Loading / empty / error states render.

Console/network notes:
- <none / note any warnings observed during capture>

Automated coverage (also green): `pnpm -C frontend test` — 29 files / 53 tests. `pnpm -r typecheck`, `pnpm -C frontend lint`, `pnpm -C frontend build` (9 routes) all pass; repo-root `pnpm -r test` (vault-client 13 + backend 82 + frontend 53) green.
</details>

## Checklist
- [ ] Sesuai `docs/mockups/sorosense-mock-2.html` (UI menyesuaikan)
- [ ] TIDAK ada: label risiko, risk tier, chatbot, hub/explore catalog
- [ ] Test scenarios unit (plan) lulus
- [ ] Before/after = 1 komposit ber-anotasi, sudah ter-render (bukan `Uploading...`)

## Notes / deferred (non-blocking)
- Approve-safe-exit sheet + freeze-status detail → **U15 (STE-25)**; the "Review" affordance currently routes to the Activity page as a placeholder.
- Full Earn (simulator/growth/breakdown) + full Account UI → **U16**.
- RWA "Real world assets" section in Add funds → gated on Axel's reply (posted on STE-24); default is stablecoins-only per R19.
- Real contract/backend wiring, live APY/TVL/activity, real FX → **U20 (STE-21)** / U17.
