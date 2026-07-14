"use client";
/* eslint-disable react-hooks/refs, react-hooks/immutability -- dev lab: refs mirror leva values for useFrame; texture config set inline like the other 3D mocks */

/* CTA lab (STE-28 dev route — strip before PR).
   Simple close: white background, the de-Apple'd phone flies in from off-screen
   LEFT and lands on the left with one full Y turn (like hero -> Earn); copy on
   the RIGHT, left-aligned, revealed with a slide-up + blur (like the Risk story
   lines). leva: a `progress` scrubber to preview the entrance + the phone's
   final pose + how far off-left it starts. */

import { Canvas, useFrame } from "@react-three/fiber";
import { Center, useGLTF, useTexture } from "@react-three/drei";
import { button, folder, useControls } from "leva";
import { Suspense, useRef } from "react";
import * as THREE from "three";

const SCREEN_POS: [number, number, number] = [0, 0.0815, -0.0055];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];
const TWO_PI = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Final = { px: number; py: number; pz: number; rx: number; ry: number; rz: number; scale: number; startDx: number };

function Phone({ progressRef, finalRef }: { progressRef: { current: number }; finalRef: { current: Final } }) {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.anisotropy = 8;
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const p = easeOut(clamp(progressRef.current, 0, 1));
    const f = finalRef.current;
    grp.position.set(lerp(f.px - f.startDx, f.px, p), f.py, f.pz);
    grp.rotation.set(f.rx, lerp(f.ry - TWO_PI, f.ry, p), f.rz);
    grp.scale.setScalar(f.scale);
  });
  return (
    <group ref={g}>
      <Center>
        <group>
          <primitive object={scene} />
          <mesh position={SCREEN_POS} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={SCREEN_SIZE} />
            <meshBasicMaterial map={screen} toneMapped={false} />
          </mesh>
        </group>
      </Center>
    </group>
  );
}
useGLTF.preload("/models/iphone.glb");

function Lights() {
  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[3, 5, 6]} intensity={2.2} color="#ffffff" />
      <directionalLight position={[-4, 2, 2]} intensity={0.5} color="#dbe6ff" />
    </>
  );
}

export function MockCta() {
  const P = (v: number) => ({ value: v, min: -4, max: 4, step: 0.01 });
  const R = (v: number) => ({ value: v, min: -Math.PI, max: Math.PI, step: 0.01 });

  const vals = useControls({
    progress: { value: 1, min: 0, max: 1, step: 0.01, label: "entrance 0→1" },
    Phone: folder(
      {
        px: { ...P(-0.97), label: "x" },
        py: { ...P(-0.07), label: "y" },
        pz: { ...P(-0.52), label: "z" },
        rx: { ...R(0), label: "rot x" },
        ry: { ...R(-3.078), label: "rot y" },
        rz: { ...R(0), label: "rot z" },
        scale: { value: 9.85, min: 0.5, max: 15, step: 0.05, label: "scale" },
        startDx: { value: 1.57, min: 0, max: 8, step: 0.05, label: "start off-left" },
      },
      { collapsed: false },
    ),
    "copy →console": button(() => console.log(exportFinal(vals))),
  });

  const progressRef = useRef(vals.progress);
  progressRef.current = vals.progress;
  const finalRef = useRef<Final>({ px: vals.px, py: vals.py, pz: vals.pz, rx: vals.rx, ry: vals.ry, rz: vals.rz, scale: vals.scale, startDx: vals.startDx });
  finalRef.current = { px: vals.px, py: vals.py, pz: vals.pz, rx: vals.rx, ry: vals.ry, rz: vals.rz, scale: vals.scale, startDx: vals.startDx };

  const shown = vals.progress > 0.35;

  return (
    <section className="relative h-screen overflow-hidden bg-white">
      <style>{`
        .cta-line{opacity:0;transform:translateY(1.1em);filter:blur(10px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,.61,.25,1),filter .8s ease}
        .cta-line.in{opacity:1;transform:none;filter:blur(0)}
      `}</style>

      <div className="absolute inset-0">
        <Canvas dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0, 3.4], fov: 30 }}>
          <Lights />
          <Suspense fallback={null}>
            <Phone progressRef={progressRef} finalRef={finalRef} />
          </Suspense>
        </Canvas>
      </div>

      {/* copy — right side, left-aligned, slide-up + blur */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1/2 flex-col justify-center pr-10 text-left lg:pr-[89px] xl:pr-[121px]">
        <h2 className={`cta-line ${shown ? "in" : ""} max-w-md font-display text-[clamp(2.25rem,4.4vw,4.25rem)] font-normal leading-[1.05] tracking-tight text-ink`}>
          Start earning today.
        </h2>
        <p className={`cta-line ${shown ? "in" : ""} mt-4 max-w-sm text-base leading-relaxed text-muted md:text-lg`} style={{ transitionDelay: ".08s" }}>
          Deposit what you already hold, and your money gets to work.
        </p>
        <div className={`cta-line ${shown ? "in" : ""} pointer-events-auto mt-7`} style={{ transitionDelay: ".16s" }}>
          <a href="#" className="inline-flex items-center justify-center rounded-full bg-brand-ink px-7 py-3.5 text-base font-semibold text-cloud transition hover:bg-[#35529f]">
            Get started
          </a>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80">
        scrub “entrance” to preview · tune the phone’s final pose in the leva panel
      </div>
    </section>
  );
}

function exportFinal(v: Record<string, number>) {
  const f = (n: number) => Number(Number(n).toFixed(3));
  return `Phone final: pos(${f(v.px)}, ${f(v.py)}, ${f(v.pz)}) rot(${f(v.rx)}, ${f(v.ry)}, ${f(v.rz)}) scale ${f(v.scale)} · start off-left ${f(v.startDx)}`;
}
