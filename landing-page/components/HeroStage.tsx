"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Lights, Models } from "./HeroScene3D";

// Entrance: camera glides from FROM to TO once the models have loaded.
const FROM = new THREE.Vector3(-0.12, 2.19, 2.15);
const TO = new THREE.Vector3(-0.2, 2.66, 0.33);
const TARGET = new THREE.Vector3(-0.09, 0.79, -0.04);
const DURATION = 2.5;
// cubic ease-out — quick start, long gentle tail into the final pose
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function CameraEntrance() {
  const { camera } = useThree();
  const startRef = useRef<number | null>(null);
  useFrame((state) => {
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const t = Math.min((state.clock.elapsedTime - startRef.current) / DURATION, 1);
    camera.position.lerpVectors(FROM, TO, easeOut(t));
    camera.lookAt(TARGET);
  });
  return null;
}

// Fires once, right after the suspended models have mounted (i.e. loaded).
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export function HeroStage({ onReady }: { onReady: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [FROM.x, FROM.y, FROM.z], fov: 19 }}
    >
      <Lights />
      {/* CameraEntrance + ReadySignal sit inside the Suspense, so they only
          start after the table + phone GLBs have finished loading. */}
      <Suspense fallback={null}>
        <Models />
        <CameraEntrance />
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
