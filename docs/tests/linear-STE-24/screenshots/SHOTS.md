# U14 (STE-24) — screenshot checklist

Save the PNGs in this folder. Then drag them into the PR body (GitHub attachments)
under the E2E evidence section of `../e2e-evidence.md`.

## Setup
- Dev server: `pnpm -C frontend dev` → http://localhost:3000
- Connect **Freighter at a normal desktop viewport** (NOT DevTools device-mode — under
  mobile emulation Freighter doesn't inject and the kit shows "Install").
- **Hard-refresh** (Ctrl+Shift+R) after connecting so the mock seeds cleanly.
- Seeded state you should see: **USD bucket ≈ $1,116.29** + **EUR bucket ≈ €1,004.09**,
  with the **EUR pool frozen** (drives the freeze banner + the amber note on EURC deposit).

## Shots (save with these names)

1. `01-home.png` — **Home**: total-value hero + bucket toggle (with token logo), the
   "Your earning is paused" freeze banner, Buckets card (USD/EUR rows), Agent activity
   preview + "View all activity". Scroll a little for one shot showing the **top progressive blur**.
2. `02-add-funds.png` — **Add funds**: only USDC / EURC / CETES (no RWA / explore catalog).
3. `03-deposit-usdc.png` — **Deposit USDC** keypad: title, balance pill (USDC logo),
   10%/50%/Max, keypad, "Deposit fund". Point: **no risk tier anywhere**.
4. `04-deposit-not-enough.png` — On Deposit USDC, type an amount **above the balance**
   (e.g. 99999): amount turns **red**, "**Not enough balance**" under it, CTA **disabled**.
5. `05-deposit-eurc-amber.png` — **Deposit EURC**: the **amber "Your EURC pool is paused.
   New deposits go to a safe pool."** note (EUR is seeded frozen). (USDC has no note — the contrast is the evidence.)
6. `06-consent-sheet.png` — First deposit → tap **Deposit fund** → the one-time
   **"Authorize once, earn hands-free"** consent drawer (KTD3). (Don't need to sign.)
7. `07-withdraw.png` — **Move to wallet**: bucket picker pill (chevron, since ≥2 buckets)
   + available line + keypad.
8. `08-activity.png` — **Activity** (`/account/activity`): All / Yours / Automated filter,
   activity rows (incl. the "Review" on the proposed-exit row).
9. `09-earn.png` — **Earn**: "Total earned $X" hero (ink) + "on $Y balance · no lockup"
   subline + bucket toggle. New solid Earn nav icon visible.

## Optional (nice-to-have)
- `10-transition.gif` — a short screen recording of a forward navigation (Home → Add funds
  → Deposit) showing the **slide-in page transition**.
- A real **Freighter sign** popup during a deposit (the only thing that needs your actual wallet).

## Checklist to eyeball while capturing
- [ ] No risk label / tier / score anywhere
- [ ] Add funds = fundable stablecoins only (no hub/explore)
- [ ] Amber note shows on EURC (frozen), absent on USDC
- [ ] Consent drawer appears only on the first deposit
- [ ] Withdraw chevron shows because there are ≥2 buckets
