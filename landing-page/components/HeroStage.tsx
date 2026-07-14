"use client";
/* eslint-disable react-hooks/set-state-in-effect -- R3F canvases mount client-only via a mount flag */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, ContactShadows, useGLTF, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* ---- Camera (shared by both canvases so the phone lines up with the table) ---- */
const CAM_FROM = new THREE.Vector3(-0.12, 2.19, 2.15);
const CAM_TO = new THREE.Vector3(-0.2, 2.66, 0.33);
const CAM_TARGET = new THREE.Vector3(-0.09, 0.79, -0.04);
const CAM_DURATION = 2.5;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const CAMERA = { position: [CAM_FROM.x, CAM_FROM.y, CAM_FROM.z] as [number, number, number], fov: 19 };

/* ---- Phone poses, in scroll order. Section-space progress `sp` indexes them:
   0 = hero, 1 = Earn, 2 = Protect, ... The phone lerps between adjacent poses.
   Append new poses here (+ a matching section in Hero.tsx) to extend the flight. */
type Pose = { pos: THREE.Vector3; rot: THREE.Vector3; scale: number; spin: number };

const HERO: Pose = {
  pos: new THREE.Vector3(0.14, 0.8, 0.05),
  rot: new THREE.Vector3(1.57, 0, 3.12),
  scale: 2.5,
  spin: 0,
};
const EARN: Pose = {
  pos: new THREE.Vector3(-0.31, 1.24, 0),
  rot: new THREE.Vector3(1.27, -0.5, 2.99),
  scale: 2.55,
  spin: 1, // one full Y turn on the way in
};
const PROTECT: Pose = {
  pos: new THREE.Vector3(-0.02, 1.65, 0.23),
  rot: new THREE.Vector3(1.17, 0.36, -2.59),
  scale: 2.55,
  spin: 0, // short-path tilt from Earn (left) to Protect (right), no full turn
};
const SIMULATE: Pose = {
  pos: new THREE.Vector3(-0.1, 0.86, 0),
  rot: new THREE.Vector3(1.67, 0, -2.86),
  scale: 2.7,
  spin: -1, // one full Y turn in, opposite direction to the hero -> Earn spin
};
const POSES: Pose[] = [HERO, EARN, PROTECT, SIMULATE];

/* Mobile phone flight (viewport < 768), tuned in the /mock-mobile-3d lab.
   The copy stacks top/centre, so the phone rides lower and smaller. Earn,
   Protect and Simulate share ONE resting pose — the phone parks after the
   hero -> Earn entrance and holds while the feature copy scrolls past it.
   The full 360° spin is kept only on that entrance; the Protect -> Simulate
   turn is dropped (nothing moves there on mobile). */
const HERO_M: Pose = {
  pos: new THREE.Vector3(-0.1153, 0.8, 0.0555),
  rot: new THREE.Vector3(1.57, 0, 3.42),
  scale: 1.75, // 2.5 × 0.70
  spin: 0,
};
const PARK_M = {
  pos: new THREE.Vector3(-0.1022, 0.72, -0.0011),
  rot: new THREE.Vector3(1.67, 0.02, -2.86),
  scale: 1.944, // 2.7 × 0.72
};
const EARN_M: Pose = { ...PARK_M, spin: 1 }; // keep the hero -> Earn full turn
const PROTECT_M: Pose = { ...PARK_M, spin: 0 };
const SIM_M: Pose = { ...PARK_M, spin: 0 }; // no Protect -> Simulate turn on mobile
const MOBILE_POSES: Pose[] = [HERO_M, EARN_M, PROTECT_M, SIM_M];

const SCREEN_POS: [number, number, number] = [0, 0.0815, -0.0055];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];

const TWO_PI = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;

// Shortest-path angle lerp — swings the tilt the short way (lean left -> lean
// right) instead of unwinding almost a full turn when the two angles differ by
// more than π (e.g. +2.99 -> -2.5 rad is only ~46° the short way).
function lerpAngle(a: number, b: number, f: number) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return a + d * f;
}

// Which pose segment section-space progress `sp` falls in, plus the 0..1 blend.
// Desktop and mobile ride separate pose sets.
function segAt(sp: number, poses: Pose[]) {
  const i = Math.min(Math.max(Math.floor(sp), 0), poses.length - 2);
  return { a: poses[i], b: poses[i + 1], f: clamp(sp - i, 0, 1) };
}

// Applies the phone pose at section-space progress `sp`. Used by the overlay
// phone and the ghost so they move as one. X/Z tilts take the short path; Y uses
// an explicit spin offset so the hero -> Earn full turn is preserved.
function applyPhonePose(g: THREE.Object3D, sp: number) {
  const { a, b, f } = segAt(sp, isMobile() ? MOBILE_POSES : POSES);
  g.position.set(
    lerp(a.pos.x, b.pos.x, f),
    lerp(a.pos.y, b.pos.y, f),
    lerp(a.pos.z, b.pos.z, f),
  );
  g.rotation.x = lerpAngle(a.rot.x, b.rot.x, f);
  g.rotation.y = lerp(a.rot.y, b.rot.y - TWO_PI * b.spin, f);
  g.rotation.z = lerpAngle(a.rot.z, b.rot.z, f);
  g.scale.setScalar(lerp(a.scale, b.scale, f));
}

// Phone x at `sp` — so the grounding shadow can follow it across the sections.
function phoneXAt(sp: number) {
  const { a, b, f } = segAt(sp, isMobile() ? MOBILE_POSES : POSES);
  return lerp(a.pos.x, b.pos.x, f);
}

function setShadow(root: THREE.Object3D, cast: boolean, receive: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

function Lights() {
  const cool = 1.0;
  const key = new THREE.Color("#fff6ec").lerp(new THREE.Color("#cfdcff"), cool);
  const amb = new THREE.Color("#ffffff").lerp(new THREE.Color("#dbe6ff"), cool);
  const fill = new THREE.Color("#aebfff");
  return (
    <>
      <ambientLight intensity={1.05} color={amb} />
      <directionalLight
        castShadow
        position={[7.5, 6.4, -5.2]}
        intensity={3.7}
        color={key}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
      />
      <directionalLight position={[-4, 2, -2]} intensity={0.4} color={fill} />
    </>
  );
}

/* Static table — lives inside the hero frame and scrolls away with the section
   (no scroll-driven movement of its own). */
function Table() {
  const { scene } = useGLTF("/models/wooden_table.glb");
  useEffect(() => setShadow(scene, true, true), [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload("/models/wooden_table.glb");

// One app screenshot per section (Hero, Earn, Protect, Simulate). Each is
// rounded-clipped on a canvas so it reads as a masked screen inside the bezel —
// never spilling past it.
const SCREENS = ["/images/Hero.png", "/images/Earn.png", "/images/Protect.png", "/images/Simulate.png"];

function roundShot(img: CanvasImageSource): THREE.CanvasTexture | null {
  const cw = 786;
  const ch = 1698;
  const r = 96; // rounded screen corners (in screenshot px)
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(cw, 0, cw, ch, r);
  ctx.arcTo(cw, ch, 0, ch, r);
  ctx.arcTo(0, ch, 0, 0, r);
  ctx.arcTo(0, 0, cw, 0, r);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, cw, ch);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

// Which screenshot (and how much crossfade) to show at scroll-progress p.
// Transitions are centred on the .5 midpoints: 0.5 (Hero→Earn) and 2.5
// (Protect→Simulate) land on the phone's mid-spin — screen facing away — so the
// swap is hidden; 1.5 (Earn→Protect) has no spin, so it reads as a plain fade.
const SCREEN_CENTERS = [0.5, 1.5, 2.5];
const SCREEN_FADE = 0.18;
function screenBlend(p: number): { a: number; b: number; mix: number } {
  for (let i = 0; i < SCREEN_CENTERS.length; i++) {
    const t = SCREEN_CENTERS[i];
    if (p < t - SCREEN_FADE) return { a: i, b: i, mix: 0 };
    if (p <= t + SCREEN_FADE) return { a: i, b: i + 1, mix: smoothstep((p - (t - SCREEN_FADE)) / (2 * SCREEN_FADE)) };
  }
  return { a: SCREEN_CENTERS.length, b: SCREEN_CENTERS.length, mix: 0 };
}

function Phone({ progress }: { progress: { current: number } }) {
  const { scene } = useGLTF("/models/iphone.glb");
  const shots = useTexture(SCREENS);
  const rounded = useMemo(() => {
    const imgs = shots.map((t) => t.image as (HTMLImageElement | ImageBitmap) & { width?: number });
    if (imgs.some((i) => !i || !i.width)) return null;
    const texs = imgs.map((img) => roundShot(img as CanvasImageSource));
    if (texs.some((t) => !t)) return null;
    return texs as THREE.CanvasTexture[];
  }, [shots]);
  const group = useRef<THREE.Group>(null);
  const matA = useRef<THREE.MeshBasicMaterial>(null);
  const matB = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => setShadow(scene, true, false), [scene]);
  useFrame(() => {
    if (group.current) applyPhonePose(group.current, progress.current);
    if (!rounded) return;
    // base layer = screen a, top layer = screen b crossfading in by `mix`
    const { a, b, mix } = screenBlend(progress.current);
    if (matA.current) matA.current.map = rounded[a];
    if (matB.current) {
      matB.current.map = rounded[b];
      matB.current.opacity = mix;
    }
  });
  return (
    <group ref={group}>
      <Center>
        <group>
          <primitive object={scene} />
          {rounded ? (
            <>
              {/* two stacked layers, both masked-off from writing depth so they
                  crossfade instead of z-fighting; still depth-tested, so the phone
                  body hides them when it spins away */}
              <mesh position={SCREEN_POS} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={SCREEN_SIZE} />
                <meshBasicMaterial ref={matA} map={rounded[0]} transparent depthWrite={false} toneMapped={false} />
              </mesh>
              <mesh position={SCREEN_POS} rotation={[0, Math.PI, 0]} renderOrder={2}>
                <planeGeometry args={SCREEN_SIZE} />
                <meshBasicMaterial ref={matB} map={rounded[1]} transparent depthWrite={false} toneMapped={false} opacity={0} />
              </mesh>
            </>
          ) : (
            <mesh position={SCREEN_POS} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={SCREEN_SIZE} />
              <meshBasicMaterial color="#0b0b0c" toneMapped={false} />
            </mesh>
          )}
        </group>
      </Center>
    </group>
  );
}
useGLTF.preload("/models/iphone.glb");

/* An invisible duplicate of the phone that lives in the table canvas purely to
   cast a real shadow onto the table. Its mesh is never drawn (opacity 0), so
   there is no second visible phone — only its shadow. It tracks the overlay
   phone's pose, so the shadow sits under the phone at the hero and recedes with
   the table as the phone lifts off. */
function GhostPhone({ progress }: { progress: { current: number } }) {
  const { scene } = useGLTF("/models/iphone.glb");
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; // still writes the shadow map (depth-only pass)
        m.receiveShadow = false;
        if (!Array.isArray(m.material)) {
          const mat = (m.material as THREE.Material).clone();
          mat.transparent = true;
          mat.opacity = 0; // invisible in the colour pass
          mat.depthWrite = false; // ...and does not punch a hole in the table
          m.material = mat;
        }
      }
    });
    return c;
  }, [scene]);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) applyPhonePose(group.current, progress.current);
  });
  return (
    <group ref={group}>
      <Center>
        <primitive object={clone} />
      </Center>
    </group>
  );
}

/* Soft grounding shadow — fades in and follows the phone as it reaches Earn. */
function Shadow({ progress }: { progress: { current: number } }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const sp = progress.current;
    const g = ref.current;
    if (!g) return;
    g.position.x = phoneXAt(sp);
    const op = lerp(0, 0.5, clamp(sp, 0, 1)); // fade in over hero -> Earn, then hold
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) {
        (m.material as THREE.Material).opacity = op;
      }
    });
  });
  return (
    <ContactShadows
      ref={ref}
      position={[0, 0.78, 0]}
      opacity={0}
      blur={2.6}
      scale={3}
      far={2}
      resolution={512}
      color="#1a1a2e"
    />
  );
}

// Shared across both canvases so the entrance camera is identical in each —
// otherwise the table and phone fly in on separate clocks and the phone slides
// against the table instead of staying glued to it. Resets on a full reload.
let entranceStart: number | null = null;

function CameraEntrance() {
  const { camera, invalidate } = useThree();
  useFrame(() => {
    if (entranceStart === null) entranceStart = performance.now();
    const t = Math.min((performance.now() - entranceStart) / (CAM_DURATION * 1000), 1);
    camera.position.lerpVectors(CAM_FROM, CAM_TO, easeOut(t));
    camera.lookAt(CAM_TARGET);
    // Demand mode: keep asking for frames until the entrance is done, then stop.
    if (t < 1) invalidate();
  });
  return null;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

/* Hero-frame canvas — maroon backdrop + table + lighting. It has no scroll
   animation; it simply scrolls away with the hero section (clipped by it). */
export function TableStage({ progress }: { progress: { current: number } }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Canvas
      shadows
      frameloop="demand"
      dpr={[1, 1.8]}
      gl={{ antialias: true }}
      camera={CAMERA}
    >
      <color attach="background" args={["#160f0a"]} />
      <Lights />
      <Suspense fallback={null}>
        <Table />
        <GhostPhone progress={progress} />
        <CameraEntrance />
      </Suspense>
    </Canvas>
  );
}

/* Overlay canvas — the phone (+ grounding shadow), transparent and fixed, so it
   flies across the hero frame into the next section. */
export function PhoneStage({
  progress,
  onReady,
}: {
  progress: { current: number };
  onReady: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // No `shadows` here: nothing in this canvas receives a shadow map (the table
  // lives in the other canvas), and the Earn grounding uses ContactShadows,
  // which renders independently. Skipping the shadow pass is a big win.
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
      camera={CAMERA}
    >
      <Lights />
      <Suspense fallback={null}>
        <Phone progress={progress} />
        <Shadow progress={progress} />
        <CameraEntrance />
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
