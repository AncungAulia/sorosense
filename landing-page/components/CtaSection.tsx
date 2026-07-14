"use client";

/* CTA — the closing invite. White background; the de-Apple'd phone flies in from
   off-screen LEFT with one full Y turn (like hero -> Earn) and lands on the left,
   copy on the right (left-aligned) revealed with a slide-up + blur. Poses baked
   from /mock-cta. The entrance plays once when the section scrolls into view. */

import { Canvas, useFrame } from "@react-three/fiber";
import { Center, useGLTF, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ---- baked (from /mock-cta) ---- */
const FINAL = { px: -0.97, py: -0.07, pz: -0.52, rx: 0, ry: -3.0784073464102066, rz: 0, scale: 9.85 };
const START_DX = 1.57; // starts at px - START_DX = -2.54, off-screen left
const DURATION = 1.3; // seconds for the fly-in
const SCREEN_POS: [number, number, number] = [0, 0.0815, -0.0055];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];
const TWO_PI = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function Phone() {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  // eslint-disable-next-line react-hooks/immutability
  screen.colorSpace = THREE.SRGBColorSpace;
  // eslint-disable-next-line react-hooks/immutability
  screen.anisotropy = 8;
  const g = useRef<THREE.Group>(null);
  const progress = useRef(0);
  useFrame((_, delta) => {
    const grp = g.current;
    if (!grp) return;
    if (progress.current < 1) progress.current = Math.min(progress.current + delta / DURATION, 1);
    const p = easeOut(progress.current);
    grp.position.set(lerp(FINAL.px - START_DX, FINAL.px, p), FINAL.py, FINAL.pz);
    grp.rotation.set(FINAL.rx, lerp(FINAL.ry - TWO_PI, FINAL.ry, p), FINAL.rz);
    grp.scale.setScalar(FINAL.scale);
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

export function CtaSection() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden bg-white">
      <style>{`
        .cta-line{opacity:0;transform:translateY(1.1em);filter:blur(10px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,.61,.25,1),filter .8s ease}
        .cta-line.in{opacity:1;transform:none;filter:blur(0)}
      `}</style>

      {/* phone — flies in from the left */}
      <div className="absolute inset-0">
        {inView && (
          <Canvas dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0, 3.4], fov: 30 }}>
            <Lights />
            <Suspense fallback={null}>
              <Phone />
            </Suspense>
          </Canvas>
        )}
      </div>

      {/* copy — right, left-aligned, slide-up + blur */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1/2 flex-col justify-center pr-10 text-left lg:pr-[89px] xl:pr-[121px]">
        <h2 className={`cta-line ${inView ? "in" : ""} font-display text-[clamp(3.04rem,5.94vw,5.74rem)] font-normal leading-[1.02] tracking-tight text-ink`}>
          Start earning today.
        </h2>
        <p className={`cta-line ${inView ? "in" : ""} mt-5 text-[1.35rem] leading-relaxed text-muted md:text-[1.5rem]`} style={{ transitionDelay: ".08s" }}>
          Put your stablecoins to work.
        </p>
        <div className={`cta-line ${inView ? "in" : ""} pointer-events-auto mt-8`} style={{ transitionDelay: ".16s" }}>
          <a href="#" className="inline-flex items-center justify-center rounded-full bg-brand-ink px-7 py-3.5 text-base font-semibold text-cloud transition hover:bg-[#35529f]">
            Get started
          </a>
        </div>
      </div>
    </section>
  );
}
