"use client";

/* Bento image tuning lab (STE-28 dev route — strip before PR).
   Replicates the Safety bento cards; each product image (key / robot / shield)
   is absolutely centred in its card and driven by leva sliders: pos X/Y (px),
   rotation (deg), scale, flip. The card is `overflow-hidden`, so any offset
   stays MASKED inside the grey frame. Read the numbers off "copy →console" and
   bake them into SafetySection.tsx. */

import { button, folder, useControls } from "leva";

type Img = { k: string; label: string; src: string; base: number; alt: string };
const IMAGES: Img[] = [
  { k: "key", label: "Key", src: "/images/Metalic%20Key.png", base: 130, alt: "key" },
  { k: "robot", label: "Robot", src: "/images/Agent.png", base: 200, alt: "robot" },
  { k: "shield", label: "Shield", src: "/images/Shield.png", base: 200, alt: "shield" },
];

const P = (x: number) => ({ value: x, min: -400, max: 400, step: 1 });
const ROT = (r: number) => ({ value: r, min: -180, max: 180, step: 1, label: "rot°" });
const SC = { value: 1, min: 0.2, max: 5, step: 0.02, label: "scale" };

type Tf = { x: number; y: number; rot: number; scale: number; flip: boolean };
function transformOf(v: Tf) {
  return `translate(-50%,-50%) translate(${v.x}px,${v.y}px) rotate(${v.rot}deg) scale(${v.scale})${v.flip ? " scaleX(-1)" : ""}`;
}

const CARD = "relative overflow-hidden rounded-lg bg-paper p-7 ring-1 ring-black/[0.04]";

function Pic({ img, t }: { img: Img; t: Tf }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img.src}
      alt={img.alt}
      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
      style={{ height: img.base, transformOrigin: "center", transform: transformOf(t) }}
    />
  );
}

export function MockBento() {
  const vals = useControls({
    Key: folder({ k_x: { ...P(20), label: "x" }, k_y: { ...P(40), label: "y" }, k_rot: ROT(-8), k_scale: SC, k_flip: { value: false, label: "flip" } }, { collapsed: false }),
    Robot: folder({ r_x: { ...P(-70), label: "x" }, r_y: { ...P(20), label: "y" }, r_rot: ROT(0), r_scale: SC, r_flip: { value: true, label: "flip" } }, { collapsed: false }),
    Shield: folder({ s_x: { ...P(120), label: "x" }, s_y: { ...P(30), label: "y" }, s_rot: ROT(0), s_scale: SC, s_flip: { value: false, label: "flip" } }, { collapsed: false }),
    "copy →console": button(() => console.log(exportVals(vals))),
  });

  const v = {
    key: { x: vals.k_x, y: vals.k_y, rot: vals.k_rot, scale: vals.k_scale, flip: vals.k_flip },
    robot: { x: vals.r_x, y: vals.r_y, rot: vals.r_rot, scale: vals.r_scale, flip: vals.r_flip },
    shield: { x: vals.s_x, y: vals.s_y, rot: vals.s_rot, scale: vals.s_scale, flip: vals.s_flip },
  };

  return (
    <section className="min-h-screen bg-cloud">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
        <p className="font-display text-3xl font-normal leading-none tracking-tight text-brand-ink md:text-4xl">Safety</p>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.25rem,4.4vw,4.25rem)] font-normal leading-[1.05] tracking-tight text-ink">
          We keep your funds safe.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted md:text-lg">Here is what protects your money while it earns.</p>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {/* Sentinel placeholder (phone later — not tuned here) */}
          <article className={`${CARD} flex min-h-[300px] items-center justify-center md:row-span-2`}>
            <span className="text-sm text-muted">Sentinel cell — phone image later</span>
          </article>

          {/* Non-custodial — key */}
          <article className={`${CARD} flex min-h-[300px] flex-col`}>
            <div className="relative z-10">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">Your funds stay yours.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">You hold the keys, and nothing moves without your approval.</p>
            </div>
            <Pic img={IMAGES[0]} t={v.key} />
          </article>

          {/* AI agent — robot left, text right */}
          <article className={`${CARD} flex min-h-[230px] items-center`}>
            <Pic img={IMAGES[1]} t={v.robot} />
            <div className="relative z-10 ml-auto max-w-[56%] text-right">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">It finds the safest yield for you.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">An agent keeps looking for the safest, highest yield on Stellar, so you never have to.</p>
            </div>
          </article>

          {/* Vetted — wide; shield right, text left */}
          <article className={`${CARD} flex min-h-[210px] flex-col justify-center md:col-span-2`}>
            <div className="relative z-10 max-w-[60%] md:max-w-md">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">Only pools we trust.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">Your money only goes into pools that have been checked and audited, never an untested one.</p>
            </div>
            <Pic img={IMAGES[2]} t={v.shield} />
          </article>
        </div>

        <p className="mt-6 text-xs text-muted">Tune each image with the leva panel · images are masked to the grey frame · click “copy →console” and send me the numbers.</p>
      </div>
    </section>
  );
}

function exportVals(vals: Record<string, number | boolean>) {
  const f = (n: number) => Math.round(Number(n));
  const line = (label: string, base: number, p: string) =>
    `${label}: height ${base}px · translate(${f(vals[`${p}_x`] as number)}px, ${f(vals[`${p}_y`] as number)}px) rotate(${f(vals[`${p}_rot`] as number)}deg) scale(${Number(vals[`${p}_scale`]).toFixed(2)})${vals[`${p}_flip`] ? " scaleX(-1)" : ""}`;
  return [line("Key", IMAGES[0].base, "k"), line("Robot", IMAGES[1].base, "r"), line("Shield", IMAGES[2].base, "s")].join("\n");
}
