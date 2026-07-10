"use client";

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

/* ---- Phone poses (scroll: hero -> Earn) ---- */
const HERO = {
  pos: new THREE.Vector3(0.14, 0.8, 0.05),
  rot: new THREE.Vector3(1.57, 0, 3.12),
  scale: 2.5,
};
const EARN = {
  pos: new THREE.Vector3(-0.31, 1.24, 0),
  rot: new THREE.Vector3(1.27, -0.5, 2.99),
  scale: 2.55,
};
const SPIN = Math.PI * 2;
const SCREEN_POS: [number, number, number] = [0, 0.0815, -0.0055];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];

const lerp = THREE.MathUtils.lerp;

// Applies the shared hero -> Earn pose to a phone group. Both the overlay phone
// and the ghost use it so they move as one.
function applyPhonePose(g: THREE.Object3D, p: number) {
  g.position.set(
    lerp(HERO.pos.x, EARN.pos.x, p),
    lerp(HERO.pos.y, EARN.pos.y, p),
    lerp(HERO.pos.z, EARN.pos.z, p),
  );
  g.rotation.x = lerp(HERO.rot.x, EARN.rot.x, p);
  g.rotation.y = lerp(HERO.rot.y, EARN.rot.y - SPIN, p);
  g.rotation.z = lerp(HERO.rot.z, EARN.rot.z, p);
  g.scale.setScalar(lerp(HERO.scale, EARN.scale, p));
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

function Phone({ progress }: { progress: { current: number } }) {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.anisotropy = 8;
  const group = useRef<THREE.Group>(null);
  useEffect(() => setShadow(scene, true, false), [scene]);
  useFrame(() => {
    if (group.current) applyPhonePose(group.current, progress.current);
  });
  return (
    <group ref={group}>
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
    const p = progress.current;
    const g = ref.current;
    if (!g) return;
    g.position.x = lerp(HERO.pos.x, EARN.pos.x, p);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) {
        (m.material as THREE.Material).opacity = lerp(0, 0.5, p);
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
