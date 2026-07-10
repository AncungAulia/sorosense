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
}) {
  const { gap, text } = VARIANTS[variant];
  return (
    <div className={`flex ${gap} ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`h-9 flex-1 whitespace-nowrap rounded-full font-medium ${text} ${
            option === value ? "bg-pill text-pill-ink" : "text-[#8a8a8a]"
          }`}
        >
          {renderLabel ? renderLabel(option) : option}
        </button>
      ))}
    </div>
  );
}
