# SoroSense

Non-custodial, mobile-first **deposit-to-earn** app for Stellar. Connect a wallet, deposit the
stablecoins you already hold into per-currency buckets, and an AI agent auto-allocates each bucket to
the **safest-highest yield in that currency** — auto-compounding and auto-rebalancing within a
Sentinel-vetted Safe pool set. A **Sentinel** safety engine runs invisibly and auto-freezes a held
pool that turns toxic. No risk-tier picker, no chatbot, no explore-catalog.

> APAC Stellar Hackathon — DeFi & Ecosystem Composability track.

## Monorepo layout

| Path                     | What                                                               | Owner        |
| ------------------------ | ------------------------------------------------------------------ | ------------ |
| `smart-contract/`        | Soroban vault (Rust) — custody, shares, allocate, freeze           | James/Ulin   |
| `backend/`               | Mastra agent + Sentinel + simulator/activity API (TS)              | Axel         |
| `frontend/`              | Next.js mobile-first app                                           | Ancung       |
| `landing-page/`          | Marketing landing + demo media                                     | Nabil        |
| `packages/vault-client/` | Shared vault interface, types, mock, generated bindings (DRY seam) | Axel + James |
| `docs/`                  | Plan, requirements, mockup, research                               | —            |

- Plan (HOW): `docs/plans/2026-07-03-001-feat-sorosense-plan.md`
- Product Contract (WHAT): `docs/brainstorms/2026-07-03-sorosense-requirements.md`
- UI reference: `docs/mockups/sorosense-mock.html`

## Getting started

```bash
pnpm install          # install workspace deps
cp .env.example .env  # fill in secrets
pnpm typecheck        # typecheck every package
pnpm test             # run every package's tests
pnpm build            # build every package
```

The TS workspaces (`backend`, `frontend`, `landing-page`, `packages/*`) are managed by pnpm.
`smart-contract/` is a Cargo project driven by its own scripts. All packages extend
`tsconfig.base.json`.
