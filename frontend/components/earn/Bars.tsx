/**
 * The bar chart shared by the simulator and the funded Growth card. Values are normalized against
 * the series maximum; the 8px floor keeps a zero bar visible. Decorative: the numbers a user needs
 * are already rendered as text next to it.
 */
export function Bars({ values, className = "" }: { values: number[]; className?: string }) {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  return (
    <div
      data-testid="bars"
      aria-hidden="true"
      className={`mt-3 flex h-[124px] items-end gap-[3px] ${className}`}
    >
      {values.map((v, i) => (
        <div
          key={i}
          data-testid="bar"
          style={{ height: `${8 + (max > 0 ? v / max : 0) * 104}px` }}
          className="flex-1 rounded-[3px] bg-ink/10"
        />
      ))}
    </div>
  );
}
