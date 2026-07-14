"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, ContactShadows, useGLTF, useTexture } from "@react-three/drei";
import { useControls } from "leva";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Lights } from "./HeroScene3D";

gsap.registerPlugin(ScrollTrigger);

// Start = the parked Earn pose; the phone flies from here to the tunable Protect
// pose (phone to the right). Destination is set live via the leva panel.
const EARN = {
  pos: new THREE.Vector3(-0.31, 1.24, 0),
  rot: new THREE.Vector3(1.27, -0.5, 2.99),
  scale: 2.55,
};

const SCREEN_POS: [number, number, number] = [0, 0.0815, -0.0055];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];
const lerp = THREE.MathUtils.lerp;

type Target = {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
};

function Phone({
  progress,
  target,
}: {
  progress: { current: number };
  target: Target;
}) {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.anisotropy = 8;
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    const p = progress.current;
    const g = group.current;
    if (!g) return;
    g.position.set(
      lerp(EARN.pos.x, target.px, p),
      lerp(EARN.pos.y, target.py, p),
      lerp(EARN.pos.z, target.pz, p),
    );
    g.rotation.x = lerp(EARN.rot.x, target.rx, p);
    g.rotation.y = lerp(EARN.rot.y, target.ry, p);
    g.rotation.z = lerp(EARN.rot.z, target.rz, p);
    g.scale.setScalar(lerp(EARN.scale, target.scale, p));
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

function Shadow({
  progress,
  targetX,
}: {
  progress: { current: number };
  targetX: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.position.x = lerp(EARN.pos.x, targetX, progress.current);
    }
  });
  return (
    <ContactShadows
      ref={ref}
      position={[0, 0.78, 0]}
      opacity={0.45}
      blur={2.6}
      scale={3}
      far={2}
      resolution={512}
      color="#1a1a2e"
    />
  );
}

function Scene({ progress }: { progress: { current: number } }) {
  const target = useControls("Protect target", {
    px: { value: 0.34, min: -2, max: 2, step: 0.005, label: "pos X" },
    py: { value: 1.24, min: 0, max: 2, step: 0.005, label: "pos Y" },
    pz: { value: 0, min: -1, max: 1, step: 0.005, label: "pos Z" },
    rx: { value: 1.27, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot X" },
    ry: { value: 0.5, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot Y" },
    rz: { value: 2.99, min: -Math.PI, max: Math.PI, step: 0.01, label: "rot Z" },
    scale: { value: 2.55, min: 1, max: 8, step: 0.05 },
  });
  return (
    <>
      <Phone progress={progress} target={target} />
      <Shadow progress={progress} targetX={target.px} />
    </>
  );
}

function CameraLook() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(-0.09, 0.79, -0.04);
  }, [camera]);
  return null;
}

export function MockProtect() {
  const [mounted, setMounted] = useState(false);
  const progress = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const st = ScrollTrigger.create({
      trigger: scroller.current,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        progress.current = self.progress;
      },
    });
    return () => st.kill();
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div ref={scroller} className="relative h-[300vh] w-full bg-white">
      <div className="fixed inset-0">
        <Canvas
          shadows
          dpr={[1, 1.8]}
          gl={{ antialias: true }}
          camera={{ position: [-0.2, 2.66, 0.33], fov: 19 }}
        >
          <color attach="background" args={["#ffffff"]} />
          <CameraLook />
          <Lights />
          <Suspense fallback={null}>
            <Scene progress={progress} />
          </Suspense>
        </Canvas>
      </div>

      {/* Placeholder copy on the LEFT (where the real Protect copy will sit). */}
      <div className="pointer-events-none fixed left-6 top-1/2 -translate-y-1/2 max-w-md text-left text-ink sm:left-10 lg:left-[89px] xl:left-[121px]">
        <p className="text-2xl font-medium text-brand-ink md:text-3xl">Protect</p>
        <p className="mt-2 font-display text-4xl font-normal leading-tight tracking-tight md:text-6xl">
          Guarded around the clock.
        </p>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 text-sm text-ink/50">
        scroll ↓ (Earn → Protect) · atur tujuan HP di panel
      </div>
    </div>
  );
}
