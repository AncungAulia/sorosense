# U16 (STE-26) — screenshot checklist

Save the PNGs in this folder with the exact names below. Then drag them into the PR body
(GitHub attachments) under the E2E evidence section of `../e2e-evidence.md`.

## Setup

- Dev server: `pnpm -C frontend dev` → http://localhost:3000 (already running)
- Connect **Freighter at a normal desktop viewport** — NOT DevTools device-mode. Under mobile
  emulation Freighter doesn't inject and the kit shows "Install".
- **Hard-refresh** (Ctrl+Shift+R) after connecting so the mock seeds cleanly.
- Seeded funded state: **USD ≈ $1,116.29** (8.59% APY) + **EUR ≈ €1,004.09** (5.10% APY).
  Blended: **balance ≈ $2,200.73**, **earned ≈ $182.72**, **APY ≈ 6.87%**.

## Why the empty state needs a temporary tweak

`/earn` sits behind `AuthGate` — no wallet, no entry. But `VaultProvider` runs `seedVault()`
the moment an address appears, which deposits USD + EUR. So the empty state is unreachable in
the running app: disconnected redirects away, connected is already funded.

To shoot shots 1–4, comment out the seed call in `frontend/providers/VaultProvider.tsx`:

```tsx
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    // void seedVault(resolvedClient, address).then(() => {
    //   if (!cancelled) setVersion((n) => n + 1);
    // });
    return () => { cancelled = true; };
  }, [address, resolvedClient]);
```

Connect the wallet, hard-refresh, take shots 1–4, then **restore the file**:

```
git checkout -- frontend/providers/VaultProvider.tsx
```

Do NOT commit that edit. Shots 5–9 need the seed back on.

---

## Phase A — Earn empty state (seed off, wallet connected)

1. `01-earn-empty-usd.png` — **Earn** tab, default state:
   - Label **"Earn balance"**, hero **`$0.00`**.
   - Under it, three green yield bars + **`8.59% APY`** (this is USD, the default currency).
   - Ink button **"Start earning"**, then **"No lockup, move to your wallet anytime"**.
   - The **"Simulate earnings"** card: amount stepper reads **`$1,000`**, currency segmented
     control has **USD** selected, **"You would earn"** → **`$85.90`**, 20 bars, period
     segmented control with **Year** selected.
   - **The whole screen must contain no risk word** — no "Safe", "Watch", "risk", "score",
     "tier", and **no pool selector**. That is the R11 evidence.

2. `02-earn-empty-eur.png` — Tap **EUR** in the currency control. In one shot:
   - Hero APY flips to **`5.10% APY`** (it reads the *same* state as the simulator).
   - Stepper symbol becomes **`€1,000`**.
   - **"You would earn"** → **`€51.00`** — denominated in EUR, **never converted to USD**.
   - The bars **redraw** (a different APY bends the compound curve differently).

3. `03-earn-empty-eur-2000.png` — Tap the stepper **`+`** twice (step is 500):
   - Stepper reads **`€2,000`**, projection **`€102.00`** (exactly double — linear in principal).

4. `04-earn-empty-mxn-month.png` — Tap **MXN**, then period **Month**:
   - Hero APY **`5.57% APY`**, stepper **`MX$2,000`**, projection **`MX$8.93`**.
   - `MX$` (not `$`) disambiguates the peso from the dollar here.
   - **Month** is the pressed segment; the bars redraw for the shorter horizon.

Then restore `VaultProvider.tsx` and hard-refresh.

---

## Phase B — Earn funded state (seed on)

5. `05-earn-funded-hero.png` — **Earn** tab after the seed lands:
   - Label **"Total earned"**, hero ≈ **`$182.72`**.
   - Subline ≈ **`$2,200.73 balance · 6.87% APY`** — this is the U16 hero change (U14 read
     "on $X balance · no lockup"). The APY is value-weighted, not a plain mean of 8.59/5.10.
   - The **"All buckets"** cycle pill, then **Deposit** / **Move to wallet**.
   - Below: the **Growth** card — 20 bars, period control with **Year** pressed, and the
     monthly breakdown showing **3 rows** ("This month", then two month names) with a
     **"Load more"** button.
   - Again: **no risk word anywhere**.

6. `06-earn-growth-day.png` — In the Growth card, tap **Day**:
   - The chart redraws to **24 bars** (one per hour). Week → 7, Month/Year → 20.
   - Bars are **earned per interval**, not the cumulative total, which is why a short window
     doesn't render as 24 identical bars.

7. `07-earn-breakdown-expanded.png` — Tap **"Load more"** twice:
   - Rows go 3 → 6 → **9**, and the button **disappears** on the last click.
   - Labels read **"This month"**, then bare month names for this year, then
     **"November 2025"**-style for last year (the year disambiguates two Novembers).
   - Amounts are green **`+$X`**. The 9 rows sum to the hero's earned figure.

8. `08-earn-bucket-toggle.png` — Tap the **"All buckets"** pill once:
   - The **hero** switches to **"USD bucket"** with its own earned / balance / **8.59% APY**.
   - The **Growth card does not change** — chart and breakdown stay blended across all
     buckets, because `getEarnings()` returns one blended timeline, not one per bucket.
     Anything else would be inventing data the backend doesn't have.

---

## Phase C — Account

9. `09-account.png` — **Account** tab:
   - Identicon (deterministic 5×5 grid from your address), the address chip **`GXXX…XXXX`**,
     and **"Connected via Freighter"**.
   - **No "since July 2026"** — nothing records when a wallet first connected, so we don't
     claim it. (Deliberate divergence from mock-2.)
   - **Activity** row → routes to `/account/activity`.
   - **Auto reinvest rewards** row with a **switch in the off position, visibly dimmed** and
     not pressable. It *displays* consent; it cannot grant or revoke it. The seam has
     `setPolicyConsent()` (idempotent) and `hasConsent()` (boolean) but no revoke, and granting
     is a write — which STE-26 forbids from this tab. Live switch: STE-38/39/40.
   - The icon left of it is a two-arrow circular refresh, not a broken ring.
   - **Log out** in red.

10. `10-account-copy-toast.png` — Tap the address chip → toast **"Address copied"**.

11. `11-account-logout-sheet.png` — Tap **Log out** → the confirm drawer:
    - "Log out?" + "Your funds stay in the vault. Reconnect your wallet any time to see them
      again." + **"Yes, log out"** / **"Cancel"**.
    - Tap **Cancel** — logging out here would end the session before shot 12.

12. `12-account-consent-on.png` — Make the consent switch flip:
    - **Deposit** (from Earn or Home) → the one-time consent sheet → sign in Freighter.
    - Return to **Account**: the auto-reinvest switch is now **on**, read live from
      `hasConsent()` — still dimmed, still not pressable.
    - This is the pair to shot 9: the same switch, off → on, moved by signing the mandate in the
      deposit flow and by nothing on this screen.

---

## What each shot is evidence *for*

| Shot | Proves |
| --- | --- |
| 01–04 | Deterministic simulator (R15); user picks a **currency**, never a pool (R11); projection stays in the bucket's currency (R3) |
| 02, 04 | The empty hero's APY and the simulator read **one** `currency` state |
| 05 | The U16 hero: "Total earned" + `balance · APY`, value-weighted blend (R5) |
| 06 | Bars are per-interval deltas, windowed Day/Week/Month/Year (R8) |
| 07 | Monthly breakdown, newest-first, 3 + 3 pagination (R9) |
| 08 | The Growth card is blended-only — the toggle drives the hero alone |
| 09, 12 | Auto-reinvest is a read-only status row; consent is read from the seam |
| 09 | No invented connection date |
| 01, 05, 09 | **No risk label, tier, or score on any surface (R11)** |
| all | No execution path from either tab — only routes back into the U14/U15 flows |
