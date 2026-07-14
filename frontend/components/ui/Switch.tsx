"use client";

/**
 * The switch from `docs/mockups/sorosense-mock-2.html` (`.switch`): a 46×28 track whose 22px knob
 * slides right when checked.
 *
 * Two modes, one primitive. With `onChange` it is a *live control* — the Account auto-reinvest row
 * (STE-38) writes the depositor's auto-compound preference through the seam on every press. With
 * `readOnly` it is a *state display*: real `role="switch"` semantics plus `aria-disabled`, so
 * assistive tech announces "switch, on, dimmed" rather than inviting a press that would do nothing.
 * A live control passes `readOnly` while a write is in flight, which is why the two props coexist
 * instead of one replacing the other.
 */
export function Switch({
  checked,
  label,
  readOnly = false,
  onChange,
}: {
  checked: boolean;
  /** Names the control for assistive tech, e.g. "Auto reinvest rewards". */
  label: string;
  readOnly?: boolean;
  /** Fires on press. Omit for a pure state display; `readOnly` suppresses it either way. */
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={readOnly || undefined}
      disabled={readOnly}
      onClick={onChange}
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
