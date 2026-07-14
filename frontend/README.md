This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Talking to the backend

The frontend runs **offline by default**: with no `NEXT_PUBLIC_API_URL` set it uses its local
derivations (`lib/vault/data.ts`) and issues no request at all. That is what keeps `pnpm test` and
Playwright network-free, and it means a backend that dies mid-demo degrades the app to fixtures
instead of breaking it.

To wire it to the backend's read surface, boot the backend in **mock mode** (in-memory vault,
deterministic offline stub FX — no network, no testnet):

```bash
pnpm -C backend exec tsx src/http/server.ts   # http://localhost:8787
```

then copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8787
```

All requests go through `lib/api/client.ts`. It never throws — every call returns
`{ ok: true, value }` or `{ ok: false, code, message }`, so a caller falls back to its local value
instead of blanking the screen. The backend sends `bigint` as a decimal string; decode it with
`toBigInt()` at the edge. `lib/api/types.ts` re-declares the wire shapes (the frontend must not depend
on `backend`), and `lib/api/__tests__/http.contract.test.ts` boots the real mock-mode server and
decodes them off it, so the two cannot drift silently.

Every var in `.env.example` is `NEXT_PUBLIC_*` and therefore public. Secrets (`KEEPER_SECRET`,
`FAUCET_ISSUER_SECRET`) are backend-only and never reach the client.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
