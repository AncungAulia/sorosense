/**
 * The one thing every write surface must know about the seam's write contract (R5, KTD4).
 *
 * `signAndSubmit` resolves with `{ hash, success: false }` when the chain rejects a *submitted*
 * transaction — it does not throw. So awaiting a write proves the wallet signed, never that the
 * ledger accepted it. Each surface checks `success` and, on false, shows this message, records no
 * cost basis, and fires no success toast.
 *
 * The copy is shared so a rejection reads the same on the mobile status screen, the desktop drawers,
 * and the exit-approval toast — and so "nothing changed" is stated, not implied.
 */
export const TX_REJECTED_MESSAGE = "The network didn't accept that. Nothing changed.";
