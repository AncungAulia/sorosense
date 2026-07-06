"use client";

import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { useControls } from "leva";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";

function setShadow(root: THREE.Object3D, cast: boolean, receive: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

function Table() {
  const { scene } = useGLTF("/models/wooden_table.glb");
  useEffect(() => setShadow(scene, true, true), [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload("/models/wooden_table.glb");

function Phone() {
  const { scene } = useGLTF("/models/iphone.glb");
  const screen = useTexture("/images/mock-app.png");
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.anisotropy = 8;
  useEffect(() => setShadow(scene, true, false), [scene]);

  const { rx, ry, rz, px, py, pz, scale, flip } = useControls("Phone", {
    rx: { value: 1.57, min: -Math.PI, max: Math.PI, step: 0.01, label: "rotate X" },
    ry: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01, label: "rotate Y" },
    rz: { value: 3.12, min: -Math.PI, max: Math.PI, step: 0.01, label: "rotate Z" },
    px: { value: 0.14, min: -2, max: 2, step: 0.005, label: "pos X" },
    py: { value: 0.8, min: 0, max: 2, step: 0.005, label: "pos Y" },
    pz: { value: 0.05, min: -1, max: 1, step: 0.005, label: "pos Z" },
    scale: { value: 2.5, min: 1, max: 8, step: 0.05 },
    flip: { value: false, label: "flip (back/front)" },
  });

  const { sx, sy, sz, sw, sh } = useControls("Screen overlay", {
    sx: { value: 0, min: -0.05, max: 0.05, step: 0.0005, label: "x" },
    sy: { value: 0.0815, min: 0, max: 0.17, step: 0.0005, label: "y" },
    sz: { value: -0.0055, min: -0.02, max: 0.02, step: 0.0002, label: "z (depth)" },
    sw: { value: 0.071, min: 0.03, max: 0.09, step: 0.0005, label: "width" },
    sh: { value: 0.151, min: 0.1, max: 0.18, step: 0.0005, label: "height" },
  });

  return (
    <group
      position={[px, py, pz]}
      rotation={[rx + (flip ? Math.PI : 0), ry, rz]}
      scale={scale}
    >
      <Center>
        <group>
          <primitive object={scene} />
          <mesh position={[sx, sy, sz]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[sw, sh]} />
            <meshBasicMaterial
              map={screen}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </Center>
    </group>
  );
}
useGLTF.preload("/models/iphone.glb");

export function Lights() {
  const { keyX, keyY, keyZ, keyInt, ambient, cool } = useControls("Lighting", {
    keyX: { value: 7.5, min: -8, max: 8, step: 0.1 },
    keyY: { value: 6.4, min: 1, max: 12, step: 0.1 },
    keyZ: { value: -5.2, min: -8, max: 8, step: 0.1 },
    keyInt: { value: 3.7, min: 0, max: 6, step: 0.1, label: "key intensity" },
    ambient: { value: 1.05, min: 0, max: 2, step: 0.05 },
    cool: { value: 1.0, min: 0, max: 1, step: 0.05, label: "cool tint" },
  });

  const warm = new THREE.Color("#fff6ec");
  const chill = new THREE.Color("#cfdcff");
  const keyColor = warm.clone().lerp(chill, cool);
  const ambColor = new THREE.Color("#ffffff").lerp(new THREE.Color("#dbe6ff"), cool);
  const fillColor = new THREE.Color("#aebfff");

  return (
    <>
      <ambientLight intensity={ambient} color={ambColor} />
      <directionalLight
        castShadow
        position={[keyX, keyY, keyZ]}
        intensity={keyInt}
        color={keyColor}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
      />
      <directionalLight position={[-4, 2, -2]} intensity={0.4} color={fillColor} />
    </>
  );
}

/** The suspending part (table + phone) — waits for the GLBs to load. */
export function Models() {
  return (
    <>
      <Table />
      <Phone />
    </>
  );
}

/** Lights + table + phone — shared by the test route and the real hero. */
export function SceneContent() {
  return (
    <>
      <Lights />
      <Suspense fallback={null}>
        <Models />
      </Suspense>
    </>
  );
}

/** Test route (/hero-test) — free orbit camera for exploring. */
export function HeroScene3D() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.35, 1.8], fov: 35 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#17120e"]} />
      <SceneContent />
      <OrbitControls target={[0, 0.78, 0]} makeDefault />
    </Canvas>
  );
}
