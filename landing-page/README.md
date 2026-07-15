# SoroSense Landing Page

Next.js marketing/demo site for SoroSense. It is separate from the wallet app in `frontend/` and is
used for hackathon storytelling, responsive demos, and public project presentation.

## Run Locally

```bash
pnpm install
pnpm -C landing-page dev
```

Open http://localhost:3000. If another app is already using port 3000, pass another port:

```bash
pnpm -C landing-page dev -- --port 3006
```

## Commands

```bash
pnpm -C landing-page typecheck
pnpm -C landing-page lint
pnpm -C landing-page build
```

## Notes

- This package is presentation-only; wallet connection and vault writes live in `frontend/`.
- Three.js/React Three Fiber assets are used for the visual demo sections.
- `next.config.ts` may include `allowedDevOrigins` for temporary tunnel testing such as ngrok.
