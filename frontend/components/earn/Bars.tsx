/**
 * The bar chart shared by the simulator and the funded Growth card. Values are normalized against
 * the series maximum; the 8px floor keeps a zero bar visible. Decorative: the numbers a user needs
 * are already rendered as text next to it.
 *
 * Geometry and the green gradient mirror `.bars .bar` in `docs/mockups/sorosense-mock-2.html` —
 * growth reads as positive, so the chart carries the same semantic accent as every other
 * gain figure on these screens.
 */
export function Bars({ values, className = "" }: { values: number[]; className?: string }) {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  return (
    <div
      data-testid="bars"
      aria-hidden="true"
      className={`my-3.5 flex h-[118px] items-end gap-1 ${className}`}
    >
      {values.map((v, i) => (
        <div
          key={i}
          data-testid="bar"
          style={{ height: `${8 + (max > 0 ? v / max : 0) * 104}px` }}
          className="min-h-[6px] flex-1 rounded-t-[5px] rounded-b-[2px] [background:linear-gradient(180deg,#22c55e,var(--color-pos))] [transition:height_.55s_cubic-bezier(.16,1,.3,1)]"
        />
      ))}
    </div>
  );
}
