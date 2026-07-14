@AGENTS.md

## SoroSense frontend (Ancung — Linear STE-7 · units U13–U17)

- **Next 16 · Tailwind v4 · React 19** — read `node_modules/next/dist/docs/` before writing Next code (breaking changes; see AGENTS.md above). All wallet code client-only (`"use client"` + `useEffect`), never module scope — avoid `window is not defined` / hydration (KTD7).
- **Wallet-connect:** Stellar Wallets Kit, Freighter-first (fallback xBull/Lobstr/WalletConnect); non-custodial, signing in the wallet popup.
- **Design source of truth:** `docs/mockups/sorosense-mock-2.html` — monochrome + Switzer + semantic accents (green=positive, red=danger, amber=attention). Card = white edge + soft shadow; **Button** (dimensional capsule) vs **Pill** (flat); frosted-glass toast. U13 spec + plan in `docs/superpowers/`.
- **Invariants (STE-7):** 3-tab nav Home/Earn/Account · no risk labels/tiers · no chatbot · no hub/explore catalog · Freighter-first (not passkey) · primitives DRY (no per-screen re-styling).
- **New-feature review:** before implementing a feature/scope addition beyond the current unit's plan, create a Linear ticket describing it, mention PM **`@axelmatsama`**, and wait for his approval comment before coding (example: STE-36). Read his comment for context first.
