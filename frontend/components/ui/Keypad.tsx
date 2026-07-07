"use client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"] as const;

export function Keypad({
  value, onChange, symbol, onQuick,
}: { value: string; onChange: (next: string) => void; symbol: string; onQuick: (pct: number) => void }) {
  const press = (k: string) => {
    if (k === ".") { if (!value.includes(".")) onChange(value + "."); return; }
    onChange(value === "0" ? k : value + k);
  };
  const back = () => onChange(value.length > 1 ? value.slice(0, -1) : "0");

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <div className="text-center text-[60px] font-semibold leading-none tracking-[-.03em] [font-variant-numeric:tabular-nums]">
          <span>{symbol}</span><span data-testid="keypad-value">{value}</span>
          <span className="ml-[3px] inline-block h-[50px] w-[2px] animate-pulse bg-ink align-[-7px]" />
        </div>
      </div>
      <div className="mb-2 flex gap-2.5">
        {([["10%", 0.1], ["50%", 0.5], ["Max", 1]] as const).map(([label, pct]) => (
          <button key={label} onClick={() => onQuick(pct)}
            className="h-[52px] flex-1 rounded-[18px] bg-pill text-[15px] font-semibold text-ink">{label}</button>
        ))}
      </div>
      <div className="mb-3.5 grid grid-cols-3 gap-0.5">
        {KEYS.map((k) => (
          <button key={k} onClick={() => press(k)}
            className="h-14 rounded-[14px] text-2xl font-medium text-ink active:bg-pill">{k}</button>
        ))}
        <button aria-label="Backspace" onClick={back} className="grid h-14 place-items-center rounded-[14px] active:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" /><path d="M15 10l-4 4M11 10l4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
