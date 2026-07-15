# SoroSense Frontend
### The wallet app for depositing, earning, withdrawing, and reading SoroSense bucket state.

This package is the user-facing app. It connects a Stellar wallet, shows USD/EUR buckets, reads the
backend API, and submits wallet-signed vault transactions.

---

## Folder structure

| Path | What's inside |
| --- | --- |
| `app/` | Next.js App Router pages, layouts, onboarding, global CSS |
| `app/(app)/home` | Authenticated dashboard |
| `app/(app)/earn` | Earn page, simulator, growth views |
| `app/(app)/account` | Account, wallet, faucet, preferences |
| `app/(flow)/add-funds` | Add-funds flow |
| `app/(flow)/deposit/[sym]` | Mobile deposit flow |
| `app/(flow)/withdraw` | Mobile withdraw flow |
| `components/desktop/` | Desktop drawers for deposit, withdraw, activity, safe exit |
| `components/deposit/` | Funding list, consent sheet, faucet button, deposit keypad |
| `components/withdraw/` | Withdraw keypad |
| `components/home/` | Dashboard hero, bucket list, value chart |
| `components/earn/` | Growth chart and monthly breakdown |
| `components/ui/` | Shared UI primitives |
| `hooks/` | Bucket, earnings, activity, funding, wallet hooks |
| `lib/api/` | Backend HTTP client and wire types |
| `lib/vault/` | Vault client selection, units, signer, local fallback data |
| `lib/wallet/` | Horizon balance and trustline helpers |
| `e2e/` | Playwright demo flow |

---

## Run locally

```bash
pnpm install
pnpm -C frontend dev
```

Open `http://localhost:3000`.

Without env, the app runs in local demo mode.

---

## Backend wiring

Start the backend:

```bash
pnpm -C backend exec tsx src/http/server.ts
```

Copy the blank template:

```bash
cp frontend/.env.example frontend/.env.local
```

Fill the values locally. Do not commit real deployment values.

---

## Data sources

| UI | Source |
| --- | --- |
| Home buckets | `GET /holdings` |
| Earn page | `GET /earnings` |
| Activity | `GET /activity` |
| Add funds | `GET /funding` |
| APY cards | `GET /rates` |
| Wallet balance | Horizon account/trustline read |
| Writes | Wallet-signed `RealVaultClient` calls |

If the backend or live contract env is not configured, the app falls back to local demo mode.

---

## Commands

```bash
pnpm -C frontend typecheck
pnpm -C frontend lint
pnpm -C frontend test
pnpm -C frontend e2e
pnpm -C frontend build
```

---

## Notes

- This README intentionally does not publish project-specific env values.
- Use [`frontend/.env.example`](.env.example) for env names.
- `NEXT_PUBLIC_*` values are public at runtime, but deployment-specific values should still live in
  local env files or hosting dashboards.
