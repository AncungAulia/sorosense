"use client";

import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useControls } from "leva";
import { useEffect, useState } from "react";
import { SceneContent } from "./HeroScene3D";

/** Free-orbit camera + a read-only panel mirroring the live camera. */
function OrbitWithReadout() {
  const [, set] = useControls("Camera (read-only)", () => ({
    cx: 0,
    cy: 0,
    cz: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    fov: 0,
  }));
  return (
    <OrbitControls
      makeDefault
      target={[-0.09, 0.79, -0.04]}
      onChange={(e) => {
        const ctl = (e as { target?: unknown } | undefined)?.target as
          | {
              object: {
                position: { x: number; y: number; z: number };
                fov: number;
              };
              target: { x: number; y: number; z: number };
            }
          | undefined;
        if (!ctl) return;
        const c = ctl.object;
        const t = ctl.target;
        const r = (n: number) => Math.round(n * 100) / 100;
        set({
          cx: r(c.position.x),
          cy: r(c.position.y),
          cz: r(c.position.z),
          tx: r(t.x),
          ty: r(t.y),
          tz: r(t.z),
          fov: Math.round(c.fov * 10) / 10,
        });
      }}
    />
  );
}

/** Headline + subheadline as a 3D layer (tracks the camera). */
function TextLayer() {
  const t = useControls("Text layer (3D)", {
    tx: { value: -0.7, min: -2, max: 2, step: 0.01, label: "pos X" },
    ty: { value: 0.95, min: 0, max: 2.5, step: 0.01, label: "pos Y" },
    tz: { value: 0.2, min: -1, max: 1.5, step: 0.01, label: "pos Z" },
    rx: { value: -1.0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot X" },
    ry: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot Y" },
    rz: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot Z" },
    dist: { value: 0.15, min: 0.02, max: 1.5, step: 0.005, label: "distanceFactor (size)" },
    occlude: { value: false, label: "occlude (hide behind phone)" },
  });

  return (
    <Html
      transform
      occlude={t.occlude}
      position={[t.tx, t.ty, t.tz]}
      rotation={[t.rx, t.ry, t.rz]}
      distanceFactor={t.dist}
      style={{ pointerEvents: "none", width: 640 }}
    >
      <h1 className="font-display text-6xl font-normal leading-[1.02] tracking-tight text-white">
        Stablecoin yield,
        <br />
        guarded around the
        <br />
        clock
      </h1>
      <p className="mt-6 max-w-md text-xl leading-relaxed text-white/75">
        The stablecoins you hold, earning the safest and highest yield on
        Stellar.
      </p>
    </Html>
  );
}

export function MockHero3D() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="relative h-screen w-screen bg-[#160f0a]">
      <Canvas
        shadows
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [-0.2, 2.66, 0.33], fov: 19 }}
      >
        <OrbitWithReadout />
        <SceneContent />
        <TextLayer />
      </Canvas>

      {/* Button stays a plain 2D overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-start p-10">
        <a
          href="#"
          className="pointer-events-auto rounded-full bg-brand px-7 py-3.5 text-base font-semibold text-ink transition hover:bg-brand-strong"
        >
          Get started
        </a>
      </div>
    </div>
  );
}
