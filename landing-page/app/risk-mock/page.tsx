/* DEV LAB — three layout directions for the "The Risk" (YieldBlox) section,
   in our real style on the grey (paper) background. Pick one; remove before PR. */

const PAD = "px-6 sm:px-10 lg:px-[89px] xl:px-[121px]";

function OptionTag({ n, name }: { n: number; name: string }) {
  return (
    <div className="absolute left-6 top-6 z-10 rounded-full bg-ink/85 px-3 py-1 font-mono text-xs font-medium text-cloud sm:left-10">
      Option {n} — {name}
    </div>
  );
}

/* A white strip standing in for the end of the white Simulate section, so the
   white -> grey transition into The Risk is visible. */
function Transition() {
  return (
    <div className={`flex h-40 items-end bg-white pb-4 ${PAD}`}>
      <span className="font-mono text-xs text-muted">
        ↑ Simulate (white) &nbsp;·&nbsp; The Risk (grey) ↓
      </span>
    </div>
  );
}

/* ── Option 1 — the attack chain (disproportion) ─────────────────────────── */
function OptionChain() {
  const Arrow = () => (
    <span className="rotate-90 select-none text-3xl text-line sm:rotate-0">→</span>
  );
  return (
    <section className={`relative flex min-h-screen flex-col justify-center bg-paper py-24 ${PAD}`}>
      <OptionTag n={1} name="Attack chain" />
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-danger">
        The risk · Feb 2026
      </p>
      <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.6vw,4rem)] font-normal leading-[1.05] tracking-tight text-ink">
        One trade. A dead market.
        <br />A pool drained overnight.
      </h2>

      {/* the chain — sizes escalate to show the disproportion */}
      <div className="mt-16 flex flex-col items-start gap-6 sm:flex-row sm:items-baseline sm:gap-8">
        <div>
          <p className="font-display text-3xl font-normal tabular-nums text-ink">
            $5
          </p>
          <p className="mt-1 font-mono text-xs text-muted">one trade</p>
        </div>
        <Arrow />
        <div>
          <p className="font-display text-5xl font-normal tabular-nums text-danger">
            ×100
          </p>
          <p className="mt-1 font-mono text-xs text-muted">price to $107</p>
        </div>
        <Arrow />
        <div>
          <p className="font-display text-7xl font-normal tabular-nums text-danger md:text-8xl">
            $10.8M
          </p>
          <p className="mt-1 font-mono text-xs text-muted">drained overnight</p>
        </div>
      </div>

      <p className="mt-16 max-w-xl text-lg leading-relaxed text-muted">
        On 22 February 2026, a single ~$5 trade poisoned a dead-market price
        feed on Stellar. A lending pool paid out millions against collateral
        worth nothing.
      </p>
      <p className="mt-4 font-mono text-xs text-muted/70">
        Documented by BlockSec · Rekt · QuillAudits
      </p>
    </section>
  );
}

/* ── Option 2 — the flatline chart ───────────────────────────────────────── */
function OptionFlatline() {
  return (
    <section className={`relative flex min-h-screen flex-col justify-center bg-paper py-24 ${PAD}`}>
      <OptionTag n={2} name="Flatline" />
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-danger">
        The risk
      </p>
      <h2 className="mt-5 max-w-2xl font-display text-[clamp(2rem,4.6vw,4rem)] font-normal leading-[1.05] tracking-tight text-ink">
        A dead market is a loaded gun.
      </h2>

      {/* flat, illiquid market -> one manipulated spike */}
      <div className="mt-14 max-w-2xl">
        <svg viewBox="0 0 400 130" className="w-full" fill="none">
          {/* baseline grid */}
          <line x1="0" y1="110" x2="400" y2="110" stroke="#dcdcd7" strokeWidth="1" />
          {/* months of dead, flat price */}
          <polyline
            points="0,108 300,108"
            stroke="#9a9aa0"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* the single manipulated spike */}
          <polyline
            points="300,108 330,14 340,108 400,108"
            stroke="#dc2626"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="330" cy="14" r="4" fill="#dc2626" />
        </svg>
        <div className="mt-3 flex justify-between font-mono text-xs text-muted">
          <span>$1 · months of &lt; $1/hr volume</span>
          <span className="text-danger">$107</span>
        </div>
      </div>

      <p className="mt-14 max-w-xl font-display text-2xl font-normal leading-snug tracking-tight text-ink md:text-3xl">
        <span className="text-danger tabular-nums">$10.8M</span> drained through
        that single spike.
      </p>
    </section>
  );
}

/* ── Option 3 — editorial ────────────────────────────────────────────────── */
function OptionEditorial() {
  return (
    <section className={`relative flex min-h-screen flex-col justify-center bg-paper py-24 ${PAD}`}>
      <OptionTag n={3} name="Editorial" />
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-danger">
        The risk
      </p>
      <p className="mt-6 font-display text-[clamp(3.5rem,11vw,9rem)] font-normal leading-none tracking-tight tabular-nums text-ink">
        $10.8M
      </p>
      <p className="mt-4 max-w-2xl font-display text-[clamp(1.5rem,3.4vw,2.75rem)] font-normal leading-tight tracking-tight text-ink">
        gone from one Stellar pool, in a single night.
      </p>
      <p className="mt-10 max-w-xl text-lg leading-relaxed text-muted">
        A dead market. A poisoned price feed. One trade worth about five
        dollars, and a lending pool paid out millions against collateral worth
        nothing. Yield without a guard is exactly this fragile.
      </p>
    </section>
  );
}

export default function RiskMockPage() {
  return (
    <main className="bg-white text-ink">
      <div className={`bg-white pt-20 pb-2 ${PAD}`}>
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Dev lab · pick a direction · remove before PR
        </p>
        <h1 className="mt-2 font-display text-3xl font-normal tracking-tight">
          The Risk — 3 directions
        </h1>
      </div>

      <Transition />
      <OptionChain />
      <Transition />
      <OptionFlatline />
      <Transition />
      <OptionEditorial />
    </main>
  );
}
