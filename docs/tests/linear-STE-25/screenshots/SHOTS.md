# U15 (STE-25) — screenshot checklist

Save the PNGs in this folder. Then drag them into the PR body (GitHub attachments)
under the E2E evidence section of `../e2e-evidence.md`.

## Setup
- Dev server: `pnpm -C frontend dev` → http://localhost:3000
- Connect **Freighter at a normal desktop viewport** (NOT DevTools device-mode — under
  mobile emulation Freighter doesn't inject and the kit shows "Install").
- **Hard-refresh** (Ctrl+Shift+R) after connecting so the mock seeds cleanly.
- Seeded state: **USD bucket ≈ $1,116.29** + **EUR bucket ≈ €1,004.09**, with the **EUR pool
  frozen AND a safe exit already proposed** (this is the new U15 seed line — it drives the
  freeze banner + the exit sheet). The proposed exit is EUR → **DeFindex EURC 5.90% APY**.

## Capture order matters (Approve is destructive)
Approving the exit **un-freezes** the EUR pool and clears the banner. So capture in this order:
Home → open sheet → **Decline** (non-destructive) → then **Approve** (destructive). To reset
after an Approve, **hard-refresh** (Ctrl+Shift+R) — a fresh page load re-seeds the frozen+proposed state.

## Shots (save with these names)

1. `01-home-freeze-banner.png` — **Home**: the prominent **"Your earning is paused / Tap to
   review and approve the move"** freeze banner (amber warning icon), above the Buckets card.
   This is the freeze-status surface.
2. `02-exit-sheet.png` — **Tap the banner** → the **Approve safe exit** sheet:
   - Body: "We paused your EURC pool to keep it safe. Your funds are protected — approve
     moving them to a safe pool in the same currency." (**no "Sentinel"/"risk" wording**).
   - Move card: **From "Paused EURC pool" ≈ €1,004.09** → **To "DeFindex EURC · 5.90% APY"**.
   - Buttons: **"Approve and sign in wallet"** (ink) + **"Keep it paused"** (glass).
   - Footnote: "Your funds stay safe either way. Nothing moves until you approve."
3. `03-decline-toast.png` — Tap **"Keep it paused"** → sheet closes, toast
   **"Kept paused — your funds stay safe."**; the freeze banner is **still there** (nothing moved).
4. `04-approve-toast.png` — Re-open the sheet → tap **"Approve and sign in wallet"** → Freighter
   sign popup (optional to include) → toast **"Exit approved. Moving to a safe pool."**
5. `05-home-after-approve.png` — Right after Approve: back on **Home**, the **freeze banner is
   gone** and the EUR bucket is no longer paused (the live re-read via `bump()`). This is the
   "funds moved to a safe pool, banner cleared" evidence. *(Then hard-refresh to reset for any re-shoots.)*
6. `06-activity-review.png` — **Activity** (`/account/activity`): the **"Review" button appears
   only on the "Proposed safe exit from EURC pool" row** — the "Switched to DeFindex…" (rebalance)
   and "Reinvested rewards…" (compound) rows have **no Review** (this is the AE1 evidence: auto
   actions never prompt). Tapping Review opens the same exit sheet.
7. `07-withdraw-sign.png` — **Move to wallet** (withdraw): confirm it still signs via the wallet
   (regression — withdraw signing is part of U15's scope; unchanged from U14's shared `depositorSigner`).

## Optional (nice-to-have)
- A real **Freighter sign** popup captured during the Approve (the only step that needs your actual wallet).
- `08-interstitial.gif` — not reproducible from the seed (the seed proposes immediately); skip.

## Checklist to eyeball while capturing
- [ ] Freeze banner is prominent and uses invisible-safety copy (no "Sentinel"/"risk")
- [ ] Exit sheet shows From (paused EURC pool + live €) → To (DeFindex EURC 5.90% APY)
- [ ] Approve signs in the wallet and clears the banner live (no manual refresh needed)
- [ ] Decline keeps the pool paused and moves nothing
- [ ] Activity: **only** the proposed-exit row has "Review"; rebalance/compound have none (AE1)
- [ ] Withdraw still signs
