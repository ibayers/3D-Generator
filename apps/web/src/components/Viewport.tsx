"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useMemo } from "react";
import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";
import { useSceneStore } from "../store/sceneStore";

function ExtrudeGeometryMesh({
  shape,
  depth,
}: {
  shape: number[][];
  depth: number;
}) {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    if (shape.length < 3) throw new Error("extrude shape needs >= 3 points");
    s.moveTo(shape[0]![0], shape[0]![1]);
    for (let i = 1; i < shape.length; i++) {
      s.lineTo(shape[i]![0], shape[i]![1]);
    }
    s.lineTo(shape[0]![0], shape[0]![1]);
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  }, [shape, depth]);
  return <primitive object={geometry} attach="geometry" />;
}

function PrimitiveGeometry({ node }: { node: SceneNode }) {
  const p = node.parameters;
  switch (node.type) {
    case "box":
      return <boxGeometry args={(p.size as Vec3) ?? [1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[(p.radius as number) ?? 1, 32, 32]} />;
    case "cylinder":
      return (
        <cylinderGeometry
          args={[
            (p.radiusTop as number) ?? 0.5,
            (p.radiusBottom as number) ?? 0.5,
            (p.height as number) ?? 1,
            32,
          ]}
        />
      );
    case "plane":
      return (
        <planeGeometry
          args={[(p.width as number) ?? 1, (p.height as number) ?? 1]}
        />
      );
    case "extrude":
      return (
        <ExtrudeGeometryMesh
          shape={p.shape as number[][]}
          depth={p.depth as number}
        />
      );
    default:
      return null;
  }
}

function NodeMesh({ node }: { node: SceneNode }) {
  const { position, rotation, scale } = node.transform;

  if (node.type === "group") {
    return (
      <group position={position} rotation={rotation} scale={scale}>
        {node.children.map((child) => (
          <NodeMesh key={child.id} node={child} />
        ))}
      </group>
    );
  }

  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <PrimitiveGeometry node={node} />
      <meshStandardMaterial color={node.material?.color ?? "#888888"} />
    </mesh>
  );
}

export default function Viewport() {
  const scene = useSceneStore((s) => s.scene);

  return (
    <Canvas camera={{ position: [6, 5, 6], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      {scene.nodes.map((node) => (
        <NodeMesh key={node.id} node={node} />
      ))}
      <OrbitControls makeDefault />
    </Canvas>
  );
}
