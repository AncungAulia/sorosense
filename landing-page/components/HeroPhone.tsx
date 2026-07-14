"use client";

import { Canvas } from "@react-three/fiber";
import { Center, useGLTF, useTexture } from "@react-three/drei";
import { useControls } from "leva";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";

// Screen overlay (in the model's local space — looked right standing up).
const SCREEN_POS: [number, number, number] = [0, 0.0815, 0.0094];
const SCREEN_SIZE: [number, number] = [0.071, 0.151];

function Phone() {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.anisotropy = 8;

  // Live-tunable transform — drag these in the panel, then tell me the values.
  const { rx, ry, rz, px, py, pz, scale, flip } = useControls("Phone (dev)", {
    rx: { value: -0.45, min: -Math.PI, max: Math.PI, step: 0.01, label: "rotate X" },
    ry: { value: -0.05, min: -Math.PI, max: Math.PI, step: 0.01, label: "rotate Y" },
    rz: { value: -0.05, min: -Math.PI, max: Math.PI, step: 0.01, label: "rotate Z" },
    px: { value: 0.11, min: -3, max: 3, step: 0.01, label: "pos X" },
    py: { value: 0.08, min: -3, max: 3, step: 0.01, label: "pos Y" },
    pz: { value: 0.4, min: -3, max: 3, step: 0.01, label: "pos Z" },
    scale: { value: 10.8, min: 1, max: 30, step: 0.1 },
    flip: { value: false, label: "flip to front" },
  });

  return (
    <group
      position={[px, py, pz]}
      rotation={[rx, ry + (flip ? Math.PI : 0), rz]}
      scale={scale}
    >
      <Center>
        <group>
          <primitive object={scene} />
          <mesh position={SCREEN_POS}>
            <planeGeometry args={SCREEN_SIZE} />
            <meshBasicMaterial map={screen} toneMapped={false} />
          </mesh>
        </group>
      </Center>
    </group>
  );
}
useGLTF.preload("/models/iphone.glb");

export function HeroPhone() {
  // Only mount the WebGL canvas on the client, after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Canvas
      camera={{ position: [0, 0, 4.2], fov: 30 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
      <Suspense fallback={null}>
        <Phone />
      </Suspense>
    </Canvas>
  );
}
