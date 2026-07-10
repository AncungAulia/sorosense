"use client";

/**
 * The switch from `docs/mockups/sorosense-mock-2.html` (`.switch`): a 46×28 track whose 22px knob
 * slides right when checked.
 *
 * `readOnly` renders it as a *state display* — real `role="switch"` semantics and `aria-disabled`,
 * so assistive tech announces "switch, on, dimmed" rather than inviting a press that would do
 * nothing. Today every use is read-only: the vault seam has `setPolicyConsent()` (idempotent) but no
 * revoke, so a movable switch would promise an "off" the contract cannot deliver. Turning it into a
 * live control is a cross-layer change — STE-38 (PM) / STE-39 (contract) / STE-40 (keeper) — after
 * which this component gains an `onChange` and drops `readOnly`.
 */
export function Switch({
  checked,
  label,
  readOnly = false,
}: {
  checked: boolean;
  /** Names the control for assistive tech, e.g. "Auto reinvest rewards". */
  label: string;
  readOnly?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={readOnly || undefined}
      disabled={readOnly}
      className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors ${
        checked ? "bg-ink" : "bg-ink/[.16]"
      } ${readOnly ? "opacity-60" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-transform [box-shadow:0_1px_3px_rgba(0,0,0,.25)] ${
          checked ? "translate-x-[18px]" : ""
        }`}
      />
    </button>
  );
}
