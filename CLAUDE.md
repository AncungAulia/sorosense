# SoroSense — project conventions

Non-custodial deposit-to-earn app on Stellar with an invisible Sentinel safety engine. pnpm monorepo: `backend/`, `frontend/`, `landing-page/`, `packages/*`, `smart-contract/` (Cargo).

## Monorepo
- Run `pnpm install` at the **repo root**, never `npm install` inside a package (e.g. `frontend/`). One shared lockfile.

## Frontend (Next 16 · Tailwind v4 · React 19)
- **This is NOT the Next.js in training data.** Read `frontend/node_modules/next/dist/docs/` before writing Next code (see `frontend/AGENTS.md`). Heed deprecations.
- All wallet code is client-only (`"use client"` + `useEffect`), never module scope — avoid `window is not defined` / hydration issues (KTD7).
- Wallet-connect = Stellar Wallets Kit, Freighter-first (fallback xBull/Lobstr/WalletConnect); non-custodial, signing in the wallet popup.

## Design source of truth
- **`docs/mockups/sorosense-mock-2.html`** — monochrome + Switzer + semantic accents (green=positive, red=danger, amber=attention). Card = white edge + soft shadow; **Button** (dimensional capsule) vs **Pill** (flat); frosted-glass toast. `sorosense-mock-1.html` is the older PM-owned reference.
- U13 spec + plan: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- STE-7 invariants: 3-tab nav Home/Earn/Account · no risk labels/tiers · no chatbot · no hub/explore catalog · Freighter-first (not passkey) · primitives are DRY (no per-screen re-styling).

## Team + workflow
- Frontend owner: Ancung (Linear STE-7 → units U13–U17). PM: Axel (`@axelmatsama`). Contract/vault: James.
- **Before implementing a NEW feature / scope addition beyond the current unit's plan:** create a Linear ticket describing it, **mention `@axelmatsama`**, and wait for his review/approval comment before coding. (Example: STE-36.) Read the PM's approval comment on the ticket for context before starting.
