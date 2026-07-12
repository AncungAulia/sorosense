"use client";

/* Mobile 3D pose lab (STE-28 dev route — strip before PR).
   Mirrors HeroStage's MOBILE flight inside a portrait phone frame, so the R3F
   canvas aspect matches a real handset even on a desktop viewport. The mobile
   flight has just two tunable poses (matching the bake):
     • HERO_M   — the phone on the hero table
     • PARK_M   — the single parked pose shared by Earn / Protect / Simulate
   Hero -> Earn keeps a full 360° spin; the rest are static.
   leva folders "Hero" and "Feature" nudge those poses (offset x/y/z + rot + scale
   multiplier); defaults are 0 / 1, so the lab opens on the exact baked poses.
   "copy values →console" prints bake-ready ABSOLUTE numbers for HeroStage. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, ContactShadows, TransformControls, useGLTF, useTexture } from "@react-three/drei";
import { button, buttonGroup, folder, useControls } from "leva";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* ---- Camera: the hero's resting pose (post-entrance), looking at the table ---- */
const CAM_POS: [number, number, number] = [-0.2, 2.66, 0.33];
const CAM_TARGET = new THREE.Vector3(-0.09, 0.79, -0.04);
const CAMERA = { position: CAM_POS, fov: 19 };

/* ---- Baked mobile poses (kept in sync with HeroStage HERO_M / PARK_M) ---- */
const HERO_M = { pos: new THREE.Vector3(-0.1153, 0.8, 0.0555), rot: new THREE.Vector3(1.57, 0, 3.42), scale: 1.75 };
const PARK_M = { pos: new THREE.Vector3(-0.1022, 0.72, -0.0011), rot: new THREE.Vector3(1.67, 0.02, -2.86), scale: 1.944 };
// spin of the pose being approached, per target section: hero->Earn full turn, rest none.
const SPIN = [0, 1, 0, 0];
const BASES = [HERO_M, PARK_M, PARK_M, PARK_M];

const SCREEN_POS: [number, number, number] = [0, 0.0815, -0.0055];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];
const TWO_PI = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

function lerpAngle(a: number, b: number, f: number) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return a + d * f;
}

type Ov = { mx: number; my: number; mz: number; mrx: number; mry: number; mrz: number; ms: number };

// Pose at section-space `sp` (0=Hero, 1=Earn, 2=Protect, 3=Simulate). Hero uses
// the `ho` nudge; Earn/Protect/Simulate all share the parked pose + `fo` nudge.
function poseAt(sp: number, ho: Ov, fo: Ov) {
  const offs = [ho, fo, fo, fo];
  const i = clamp(Math.floor(sp), 0, BASES.length - 2);
  const f = clamp(sp - i, 0, 1);
  const a = BASES[i], b = BASES[i + 1];
  const oa = offs[i], ob = offs[i + 1];
  const bspin = SPIN[i + 1];
  return {
    px: lerp(a.pos.x, b.pos.x, f) + lerp(oa.mx, ob.mx, f),
    py: lerp(a.pos.y, b.pos.y, f) + lerp(oa.my, ob.my, f),
    pz: lerp(a.pos.z, b.pos.z, f) + lerp(oa.mz, ob.mz, f),
    rx: lerpAngle(a.rot.x, b.rot.x, f) + lerp(oa.mrx, ob.mrx, f),
    ry: lerp(a.rot.y, b.rot.y - TWO_PI * bspin, f) + lerp(oa.mry, ob.mry, f),
    rz: lerpAngle(a.rot.z, b.rot.z, f) + lerp(oa.mrz, ob.mrz, f),
    scale: lerp(a.scale, b.scale, f) * lerp(oa.ms, ob.ms, f),
  };
}

type Pose = ReturnType<typeof poseAt>;

function setShadow(root: THREE.Object3D, cast: boolean, receive: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

// Same lighting as HeroStage so the phone reads identically.
function Lights() {
  const key = new THREE.Color("#fff6ec").lerp(new THREE.Color("#cfdcff"), 1);
  const amb = new THREE.Color("#ffffff").lerp(new THREE.Color("#dbe6ff"), 1);
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
      <directionalLight position={[-4, 2, -2]} intensity={0.4} color={"#aebfff"} />
    </>
  );
}

function Table({ spRef }: { spRef: { current: number } }) {
  const { scene } = useGLTF("/models/wooden_table.glb");
  const ref = useRef<THREE.Group>(null);
  useEffect(() => setShadow(scene, true, true), [scene]);
  // The table belongs to the hero; hide it once the phone has flown off.
  useFrame(() => {
    if (ref.current) ref.current.visible = spRef.current < 1.02;
  });
  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  );
}
useGLTF.preload("/models/wooden_table.glb");

function Phone({
  poseRef,
  groupRef,
  draggingRef,
  onReady,
}: {
  poseRef: { current: Pose };
  groupRef: React.RefObject<THREE.Group | null>;
  draggingRef: { current: boolean };
  onReady: () => void;
}) {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.anisotropy = 8;
  useEffect(() => {
    setShadow(scene, true, false);
    onReady();
  }, [scene, onReady]);
  // While the gizmo owns the phone (dragging), don't fight it — the drag writes
  // straight to the group and pushes the result back into the sliders.
  useFrame(() => {
    if (draggingRef.current) return;
    const g = groupRef.current;
    const p = poseRef.current;
    if (!g) return;
    g.position.set(p.px, p.py, p.pz);
    g.rotation.set(p.rx, p.ry, p.rz);
    g.scale.setScalar(p.scale);
  });
  return (
    <group ref={groupRef}>
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

function Shadow({ spRef, poseRef }: { spRef: { current: number }; poseRef: { current: Pose } }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.x = poseRef.current.px;
    const op = lerp(0, 0.5, clamp(spRef.current, 0, 1));
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) {
        (m.material as THREE.Material).opacity = op;
      }
    });
  });
  return (
    <ContactShadows ref={ref} position={[0, 0.78, 0]} opacity={0} blur={2.6} scale={3} far={2} resolution={512} color="#1a1a2e" />
  );
}

// Drive bg colour (maroon hero -> white feature sections) from sp.
const MAROON = new THREE.Color("#160f0a");
const WHITE = new THREE.Color("#ffffff");
function Background({ spRef }: { spRef: { current: number } }) {
  const { scene } = useThree();
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    col.copy(MAROON).lerp(WHITE, clamp(spRef.current, 0, 1));
    scene.background = col;
  });
  return null;
}

function CameraLook() {
  const { camera } = useThree();
  useEffect(() => camera.lookAt(CAM_TARGET), [camera]);
  return null;
}

/* ---- Mobile copy overlays (mobile-only classes; md: is viewport-based and
   would fire on a desktop viewport, so the real mobile variants are inlined and
   vw-based sizes are pinned to their handset value). ---- */
function CopyOverlay({ sp }: { sp: number }) {
  const near = (i: number) => clamp(1 - Math.abs(sp - i) / 0.5, 0, 1);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Hero */}
      <div className="absolute inset-0 flex flex-col justify-start px-6 pt-[104px]" style={{ opacity: near(0) }}>
        <h1 className="font-display text-[1.7rem] font-normal leading-[1.12] tracking-tight text-cloud">
          Stablecoin yield, guarded around the clock
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
          The stablecoins you hold, earning the safest and highest yield on Stellar.
        </p>
      </div>

      {/* Earn */}
      <div className="absolute inset-0 flex flex-col items-center justify-between px-6 pb-10 pt-[92px] text-center" style={{ opacity: near(1) }}>
        <div className="max-w-[86vw] text-ink">
          <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink">Earn</p>
          <div className="mt-3 flex items-baseline justify-center gap-x-2 tabular-nums">
            <span className="text-xl text-muted">up to</span>
            <span className="font-display text-5xl font-normal leading-none">8.59%</span>
            <span className="text-xl">APY</span>
          </div>
          <p className="mt-1 font-display text-3xl font-normal leading-tight tracking-tight">on your stablecoins</p>
        </div>
        <p className="max-w-xs text-sm text-muted">The highest safe yield on Stellar right now, and always variable.</p>
      </div>

      {/* Protect */}
      <div className="absolute inset-0 flex flex-col items-center justify-between px-6 pb-10 pt-[92px] text-center" style={{ opacity: near(2) }}>
        <div className="max-w-[86vw] text-ink">
          <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink">Protect</p>
          <h2 className="mt-3 font-display text-[2.25rem] font-normal leading-[1.05] tracking-tight">Guarded around the clock.</h2>
        </div>
        <p className="max-w-xs text-base text-muted">Sentinel watches every pool and pulls your funds out the moment one turns dangerous.</p>
      </div>

      {/* Simulate (stacked top + bottom) */}
      <div className="absolute inset-0 flex flex-col items-center justify-between px-6 pb-10 pt-[92px] text-center" style={{ opacity: near(3) }}>
        <div className="max-w-sm text-ink">
          <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink">Simulate</p>
          <h2 className="mt-3 font-display text-[2.25rem] font-normal leading-[1.05] tracking-tight">See it before you deposit.</h2>
        </div>
        <p className="max-w-xs text-base text-muted">Enter any amount and any period, and get an exact projection of what you&apos;d earn.</p>
      </div>
    </div>
  );
}

const SECTION_NAMES = ["Hero", "Earn", "Protect", "Simulate"];
const OFF = (mx: number, my: number, mz: number, mrx: number, mry: number, mrz: number, ms: number): Ov => ({
  mx, my, mz, mrx, mry, mrz, ms,
});

export function MockMobile3D() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ovRef = useRef<{ ho: Ov; fo: Ov }>({ ho: OFF(0, 0, 0, 0, 0, 0, 1), fo: OFF(0, 0, 0, 0, 0, 0, 1) });
  const setRef = useRef<((v: { section: number }) => void) | null>(null);
  const P = { x: { value: 0, min: -1.5, max: 1.5, step: 0.005, label: "x" }, y: { value: 0, min: -1.5, max: 1.5, step: 0.005, label: "y" }, z: { value: 0, min: -1.5, max: 1.5, step: 0.005, label: "z (depth)" } };
  const R = { rx: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot x" }, ry: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot y" }, rz: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot z" } };
  const S = { s: { value: 1, min: 0.3, max: 2, step: 0.01, label: "scale×" } };
  const [vals, set] = useControls(() => ({
    section: { value: 0, min: 0, max: 3, step: 0.01, label: "scrub 0→3" },
    device: { value: 390, options: { "iPhone 390": 390, "small 360": 360, "large 430": 430 }, label: "frame w" },
    "drag mode": { value: "move", options: ["move", "rotate", "off"], label: "drag mode" },
    Hero: folder(
      { h_x: P.x, h_y: P.y, h_z: P.z, h_rx: R.rx, h_ry: R.ry, h_rz: R.rz, h_s: S.s },
      { collapsed: true },
    ),
    "Feature (Earn/Protect/Sim)": folder(
      { f_x: P.x, f_y: P.y, f_z: P.z, f_rx: R.rx, f_ry: R.ry, f_rz: R.rz, f_s: S.s },
      { collapsed: true },
    ),
    "jump to": buttonGroup({
      Hero: () => setRef.current?.({ section: 0 }),
      Earn: () => setRef.current?.({ section: 1 }),
      Protect: () => setRef.current?.({ section: 2 }),
      Simulate: () => setRef.current?.({ section: 3 }),
    }),
    "copy values →console": button(() => console.log(exportPoses(ovRef.current.ho, ovRef.current.fo))),
  }));
  setRef.current = set;

  const sp = vals.section;
  const ho = OFF(vals.h_x, vals.h_y, vals.h_z, vals.h_rx, vals.h_ry, vals.h_rz, vals.h_s);
  const fo = OFF(vals.f_x, vals.f_y, vals.f_z, vals.f_rx, vals.f_ry, vals.f_rz, vals.f_s);
  ovRef.current = { ho, fo };

  // Refs handed to the canvas so useFrame always reads the latest without
  // re-subscribing.
  const spRef = useRef(sp);
  const poseRef = useRef<Pose>(poseAt(sp, ho, fo));
  spRef.current = sp;
  poseRef.current = poseAt(sp, ho, fo);

  // Direct-drag gizmo wiring.
  const dragMode = vals["drag mode"] as "move" | "rotate" | "off";
  const phoneGroupRef = useRef<THREE.Group>(null);
  const draggingRef = useRef(false);
  const activeSecRef = useRef(0);
  const [gizmoReady, setGizmoReady] = useState(false);
  const setAny = set as unknown as (v: Record<string, number>) => void;

  // Grab: hand the phone to the gizmo and snap to the nearest section so the
  // offset we write is relative to a single pose (f = 0, no lerp/spin ambiguity).
  const onGrab = () => {
    draggingRef.current = true;
    const s = Math.round(spRef.current);
    activeSecRef.current = s;
    set({ section: s });
  };
  const onRelease = () => {
    draggingRef.current = false;
  };
  // Read the dragged transform back out as an offset on the active pose (Hero
  // for section 0, the shared Feature pose for Earn/Protect/Simulate).
  const onGizmo = () => {
    const g = phoneGroupRef.current;
    if (!g) return;
    const hero = activeSecRef.current === 0;
    const base = hero ? HERO_M : PARK_M;
    const k = hero ? "h" : "f";
    setAny({
      [`${k}_x`]: g.position.x - base.pos.x,
      [`${k}_y`]: g.position.y - base.pos.y,
      [`${k}_z`]: g.position.z - base.pos.z,
      [`${k}_rx`]: g.rotation.x - base.rot.x,
      [`${k}_ry`]: g.rotation.y - base.rot.y,
      [`${k}_rz`]: g.rotation.z - base.rot.z,
      [`${k}_s`]: g.scale.x / base.scale,
    });
  };

  // Wheel over the frame scrubs the section, like a real scroll.
  const onWheel = (e: React.WheelEvent) => {
    if (draggingRef.current) return;
    const next = clamp(spRef.current + e.deltaY * 0.0016, 0, 3);
    set({ section: next });
  };

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-neutral-900">
      <div
        onWheel={onWheel}
        className="relative overflow-hidden rounded-[44px] border-[6px] border-neutral-800 shadow-2xl"
        style={{ height: "min(844px, calc(100svh - 32px))", aspectRatio: `${vals.device} / 844` }}
      >
        <Canvas shadows dpr={[1, 1.8]} gl={{ antialias: true }} camera={CAMERA} className="absolute inset-0">
          <CameraLook />
          <Background spRef={spRef} />
          <Lights />
          <Suspense fallback={null}>
            <Table spRef={spRef} />
            <Phone poseRef={poseRef} groupRef={phoneGroupRef} draggingRef={draggingRef} onReady={() => setGizmoReady(true)} />
            <Shadow spRef={spRef} poseRef={poseRef} />
            {gizmoReady && dragMode !== "off" && phoneGroupRef.current && (
              <TransformControls
                object={phoneGroupRef.current}
                mode={dragMode === "rotate" ? "rotate" : "translate"}
                size={0.8}
                onMouseDown={onGrab}
                onMouseUp={onRelease}
                onObjectChange={onGizmo}
              />
            )}
          </Suspense>
        </Canvas>

        <CopyOverlay sp={sp} />

        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs text-white/80">
          {SECTION_NAMES[Math.round(sp)]} · drag the phone (gizmo) or the sliders · scroll to change section
        </div>
      </div>
    </div>
  );
}

// Bake-ready ABSOLUTE poses (base + the leva nudge).
function exportPoses(ho: Ov, fo: Ov) {
  const f = (n: number) => Number(n.toFixed(4));
  const line = (name: string, base: typeof HERO_M, o: Ov) =>
    `${name}: pos(${f(base.pos.x + o.mx)}, ${f(base.pos.y + o.my)}, ${f(base.pos.z + o.mz)}) ` +
    `rot(${f(base.rot.x + o.mrx)}, ${f(base.rot.y + o.mry)}, ${f(base.rot.z + o.mrz)}) scale ${f(base.scale * o.ms)}`;
  return [line("HERO_M", HERO_M, ho), line("PARK_M (Earn/Protect/Sim)", PARK_M, fo)].join("\n");
}
