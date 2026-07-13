"use client";

/**
 * The flat segmented control from `docs/mockups/sorosense-mock-2.html` (`.curseg` / `.seg`):
 * borderless buttons on no track at all, the pressed one filled with the pill tone. There is no
 * sliding thumb and no white raised pill — those belong to the dimensional `Button`, not here.
 *
 * Shared by the simulator's currency and period controls and the Growth card's period control,
 * so the three cannot drift apart (primitives are DRY — no per-screen re-styling).
 */
type Variant = "currency" | "period";

/** `.curseg` is a touch smaller and tighter than `.seg`; everything else is identical. */
const VARIANTS: Record<Variant, { gap: string; text: string }> = {
  currency: { gap: "gap-[7px]", text: "text-xs" },
  period: { gap: "gap-1.5", text: "text-[13.5px]" },
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  variant,
  renderLabel,
  className = "",
  fluid = true,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  /** Names the group for assistive tech, e.g. "Currency" or "Period". */
  label: string;
  variant: Variant;
  /** Capitalize in the DOM — CSS `text-transform` does not change a button's accessible name. */
  renderLabel?: (option: T) => string;
  className?: string;
  /**
   * `true` (default): full-width buttons that split the row (`flex-1`, 36px tall) — mobile's
   * `.seg.full`. `false`: content-width inline buttons (30px tall, 14px padding) — the mockup's
   * default `.seg`, used by the compact desktop hero toggles so they don't stretch/blob.
   */
  fluid?: boolean;
}) {
  const { gap, text } = VARIANTS[variant];
  const container = fluid ? `flex ${gap}` : "inline-flex gap-1";
  const button = fluid ? `h-9 flex-1 ${text}` : "h-[30px] px-3.5 text-[12.5px]";
  return (
    <div className={`${container} ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`whitespace-nowrap rounded-full font-medium transition-colors ${button} ${
            option === value ? "bg-pill text-pill-ink" : "text-[#8a8a8a] hover:text-ink"
          }`}
        >
          {renderLabel ? renderLabel(option) : option}
        </button>
      ))}
    </div>
  );
}
