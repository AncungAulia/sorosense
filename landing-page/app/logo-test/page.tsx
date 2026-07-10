import { Button } from "../../components/Button";

/* DEV LAB — compare the logo files in the navbar and at a few sizes.
   All five are white/mono art (some wrapped in a Figma outline mask), so they
   are recolored via CSS mask to adapt to the surface. Remove before the PR. */

type LogoDef = {
  id: string;
  src: string;
  file: string;
  w: number;
  h: number;
  /** navbar render height (px) — tuned per logo for even visual weight */
  navH: number;
  /** manual position nudge in the navbar (px): [x, y], + = right / down */
  nudge?: [number, number];
};

const LOGOS: LogoDef[] = [
  { id: "1", src: "/logos/soro sense.svg", file: "soro sense.svg", w: 1105, h: 533, navH: 37 },
  { id: "2", src: "/logos/Vector.svg", file: "Vector.svg", w: 818, h: 475, navH: 37 },
  { id: "3", src: "/logos/Vector-3.svg", file: "Vector-3.svg", w: 1402, h: 696, navH: 44, nudge: [0, 2] },
  { id: "4", src: "/logos/Vector-1.svg", file: "Vector-1.svg", w: 1105, h: 453, navH: 32 },
  { id: "5", src: "/logos/Vector-2.svg", file: "Vector-2.svg", w: 976, h: 453, navH: 32 },
];

/* White art used as a CSS mask, so it inherits currentColor: white on dark,
   ink on light. Works for all five regardless of Figma mask wrappers. */
function Logo({
  logo,
  height,
  nudge,
}: {
  logo: LogoDef;
  height: number;
  nudge?: [number, number];
}) {
  const src = encodeURI(logo.src);
  const width = Math.round(height * (logo.w / logo.h));
  return (
    <span
      role="img"
      aria-label="SoroSense"
      style={{
        display: "inline-block",
        height,
        width,
        transform: nudge ? `translate(${nudge[0]}px, ${nudge[1]}px)` : undefined,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/* Static replica of the real navbar; the logo adapts to the theme. */
function NavBarMock({ logo, theme }: { logo: LogoDef; theme: "dark" | "light" }) {
  const light = theme === "light";
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        light
          ? "border-black/10 bg-white text-[#0B0B0C]"
          : "border-white/10 bg-[#160f0a] text-white"
      }`}
    >
      <div className="mx-auto grid h-[72px] grid-cols-[auto_1fr_auto] items-center gap-4 px-6">
        <a href="#" className="flex items-center">
          <Logo logo={logo} height={logo.navH} nudge={logo.nudge} />
        </a>
        <div className="hidden justify-center gap-9 text-sm font-medium md:flex">
          {["How it works", "Security", "FAQ"].map((l) => (
            <span key={l} className="opacity-85">
              {l}
            </span>
          ))}
        </div>
        <div className="flex justify-end">
          <Button href="#" size="sm" variant="blue">
            Launch app
          </Button>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-[#0B0B0C]/50">
        {title}
      </h2>
      {hint && <p className="mb-4 mt-1 text-xs text-[#0B0B0C]/40">{hint}</p>}
      <div className={hint ? "flex flex-col gap-4" : "mt-4 flex flex-col gap-4"}>
        {children}
      </div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 inline-block rounded-full bg-[#0B0B0C]/5 px-2.5 py-1 text-xs font-medium text-[#0B0B0C]/60">
      {children}
    </span>
  );
}

export default function LogoTestPage() {
  return (
    <main className="min-h-screen bg-[#EFEFED] px-6 py-14 text-[#0B0B0C]">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#0B0B0C]/40">
            Dev lab · remove before PR
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Logo test — 5 files
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#0B0B0C]/60">
            All five are recolored via CSS mask, so they adapt to the navbar
            theme (white on dark, ink on light). 1–3 are sized larger; 4–5 a
            touch smaller for even visual weight.
          </p>
        </header>

        {/* Navbar — dark (hero state) */}
        <Panel title="Navbar · dark (hero state)">
          {LOGOS.map((l) => (
            <div key={l.id}>
              <Tag>
                {l.id} · {l.file} · {l.navH}px
              </Tag>
              <NavBarMock logo={l} theme="dark" />
            </div>
          ))}
        </Panel>

        {/* Navbar — light (scrolled state) */}
        <Panel
          title="Navbar · light (scrolled state)"
          hint="Now ink, not white — including 4 & 5, which are recolored via the mask."
        >
          {LOGOS.map((l) => (
            <div key={l.id}>
              <Tag>
                {l.id} · {l.file} · {l.navH}px
              </Tag>
              <NavBarMock logo={l} theme="light" />
            </div>
          ))}
        </Panel>

        {/* Size ramp */}
        <Panel title="Size ramp" hint="Same heights across all files, on dark and light.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LOGOS.map((l) => (
              <div key={l.id} className="flex flex-col gap-2">
                <Tag>
                  {l.id} · {l.file}
                </Tag>
                <div className="flex flex-wrap items-end gap-6 rounded-xl border border-white/10 bg-[#160f0a] p-6 text-white">
                  {[28, 36, 44, 56].map((h) => (
                    <div key={h} className="flex flex-col items-center gap-2">
                      <Logo logo={l} height={h} />
                      <span className="text-[10px] text-white/40">{h}px</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-6 rounded-xl border border-black/10 bg-white p-6 text-[#0B0B0C]">
                  {[28, 36, 44, 56].map((h) => (
                    <div key={h} className="flex flex-col items-center gap-2">
                      <Logo logo={l} height={h} />
                      <span className="text-[10px] text-[#0B0B0C]/40">{h}px</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}
