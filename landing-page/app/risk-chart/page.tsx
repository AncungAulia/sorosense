/* DEV LAB — chart variants for "The Risk" flatline option. Pick one; remove before PR. */

const PAD = "px-6 sm:px-10 lg:px-[89px] xl:px-[121px]";

function Block({
  n,
  name,
  note,
  children,
}: {
  n: number;
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-line py-16 ${PAD}`}>
      <div className="flex items-baseline gap-3">
        <span className="rounded-full bg-ink/85 px-3 py-1 font-mono text-xs text-cloud">
          Variant {n}
        </span>
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          {name}
        </span>
      </div>
      <p className="mt-2 max-w-xl text-sm text-muted">{note}</p>
      <div className="mt-8 max-w-2xl">{children}</div>
      <p className="mt-8 max-w-xl font-display text-2xl font-normal tracking-tight text-ink md:text-3xl">
        <span className="text-danger tabular-nums">$10.8M</span> drained through
        that single spike.
      </p>
    </section>
  );
}

/* A — dead jittery market, one spike, then a collapse (pool emptied). */
function DeadSpikeCollapse() {
  return (
    <>
      <svg viewBox="0 0 420 150" className="w-full" fill="none">
        <line x1="0" y1="120" x2="420" y2="120" stroke="#dcdcd7" strokeWidth="1" />
        {/* dead market: low, tiny noise */}
        <polyline
          points="0,116 20,114 40,117 60,113 80,116 100,114 120,117 140,113 160,116 180,114 200,117 220,114 240,116 260,115 285,116"
          stroke="#9a9aa0"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* the manipulated spike, then a crash below the dead line */}
        <polyline
          points="285,116 320,16 338,116 352,142 420,142"
          stroke="#dc2626"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="320" cy="16" r="4" fill="#dc2626" />
      </svg>
      <div className="mt-3 flex justify-between font-mono text-xs text-muted">
        <span>$1 · months of &lt; $1/hr volume</span>
        <span className="text-danger">$107, then empty</span>
      </div>
    </>
  );
}

/* B — price bars: flat dead bars, one giant spike bar, then collapse. */
function Bars() {
  const heights = [6, 4, 7, 5, 6, 4, 8, 5, 6, 7, 5, 6, 108, 3, 2];
  const base = 130;
  const bw = 16;
  const gap = 12;
  return (
    <>
      <svg viewBox="0 0 420 150" className="w-full" fill="none">
        <line x1="0" y1={base} x2="420" y2={base} stroke="#dcdcd7" strokeWidth="1" />
        {heights.map((h, i) => {
          const x = i * (bw + gap) + 4;
          const spike = h > 40;
          return (
            <rect
              key={i}
              x={x}
              y={base - h}
              width={bw}
              height={h}
              rx="2"
              fill={spike ? "#dc2626" : "#b9b9bd"}
            />
          );
        })}
      </svg>
      <div className="mt-3 flex justify-between font-mono text-xs text-muted">
        <span>flat, illiquid market</span>
        <span className="text-danger">one poisoned print</span>
      </div>
    </>
  );
}

/* C — spike with a filled area = the money borrowed against the fake price. */
function SpikeArea() {
  return (
    <>
      <svg viewBox="0 0 420 150" className="w-full" fill="none">
        <line x1="0" y1="120" x2="420" y2="120" stroke="#dcdcd7" strokeWidth="1" />
        {/* shaded area under the spike */}
        <polygon points="285,120 320,20 355,120" fill="#dc2626" fillOpacity="0.12" />
        <polyline points="0,116 285,116" stroke="#9a9aa0" strokeWidth="2.5" strokeLinecap="round" />
        <polyline
          points="285,116 320,20 355,120 420,120"
          stroke="#dc2626"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="320" cy="20" r="4" fill="#dc2626" />
        <text x="326" y="64" className="font-mono" fontSize="11" fill="#dc2626">
          $10.8M borrowed here
        </text>
      </svg>
      <div className="mt-3 flex justify-between font-mono text-xs text-muted">
        <span>$1 real value</span>
        <span className="text-danger">$107 fake price</span>
      </div>
    </>
  );
}

/* D — two lines: price spikes, then the pool's TVL drains to nothing. */
function PriceAndTvl() {
  return (
    <>
      <svg viewBox="0 0 420 150" className="w-full" fill="none">
        <line x1="0" y1="130" x2="420" y2="130" stroke="#dcdcd7" strokeWidth="1" />
        {/* pool TVL: high & flat, then drains right after the spike */}
        <polygon
          points="0,130 0,52 300,52 340,126 420,126 420,130"
          fill="#3f5cc0"
          fillOpacity="0.1"
        />
        <polyline
          points="0,52 300,52 340,126 420,126"
          stroke="#3f5cc0"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* price: flat, one spike */}
        <polyline points="0,116 290,116" stroke="#9a9aa0" strokeWidth="2.5" strokeLinecap="round" />
        <polyline
          points="290,116 315,22 335,116 420,116"
          stroke="#dc2626"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="315" cy="22" r="4" fill="#dc2626" />
      </svg>
      <div className="mt-3 flex justify-between font-mono text-xs">
        <span className="text-danger">— price spike</span>
        <span className="text-brand-ink">— pool TVL drains to zero</span>
      </div>
    </>
  );
}

export default function RiskChartPage() {
  return (
    <main className="bg-paper text-ink">
      <div className={`pt-20 pb-8 ${PAD}`}>
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Dev lab · chart directions · remove before PR
        </p>
        <h1 className="mt-2 font-display text-3xl font-normal tracking-tight">
          The Risk — chart variants
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Headline for all: <span className="text-ink">A dead market is a loaded gun.</span>
        </p>
      </div>

      <Block n={1} name="Dead → spike → collapse" note="A jittery dead-market line, one manipulated spike, then a crash below the floor — the pool emptied. Tells the full arc.">
        <DeadSpikeCollapse />
      </Block>
      <Block n={2} name="Price bars" note="Flat, tiny bars for the illiquid market, one giant red bar for the poisoned print, then collapse. Cleaner / more abstract.">
        <Bars />
      </Block>
      <Block n={3} name="Spike + borrowed area" note="The spike with a shaded area annotated with what was extracted at the fake price — the number lives inside the chart.">
        <SpikeArea />
      </Block>
      <Block n={4} name="Price + TVL drain" note="Two lines: the price spike (red) and the pool's TVL (blue) draining to zero right after. Shows cause and effect.">
        <PriceAndTvl />
      </Block>
    </main>
  );
}
