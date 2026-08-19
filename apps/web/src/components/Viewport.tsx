"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import type { Scene, SceneNode, Vec3 } from "@asset-studio/scene-engine";
import {
  Brush,
  Evaluator,
  ADDITION,
  SUBTRACTION,
  INTERSECTION,
} from "three-bvh-csg";
import { buildPrimitiveGeometry, flattenNodes } from "./geometry";
import { useSceneStore } from "../store/sceneStore";
import { useChatStore } from "../store/chatStore";

// Warna seleksi & viewport sesuai spesifikasi Open Design (editor-dark.html).
const SELECT_COLOR = "#377d5c";
const VIEWPORT_BG = "#2e333c";
const EXPORT_FILENAME = "procedural-scene-v1.glb";

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
    // ponytail: templates author shape as top-down footprint (X,Z) with depth=height.
    // ExtrudeGeometry extrudes along +Z by default; rotateX(-PI/2) maps shape-Y → world-Z
    // and extrude-Z → world-Y so footprints stand up as walls.
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [shape, depth]);
  return <primitive object={geometry} attach="geometry" />;
}

const OP_MAP = {
  union: ADDITION,
  subtract: SUBTRACTION,
  intersect: INTERSECTION,
} as const;

function BooleanGeometryMesh({
  operation,
  aId,
  bId,
  nodes,
}: {
  operation: keyof typeof OP_MAP;
  aId: string;
  bId: string;
  nodes: SceneNode[];
}) {
  const geometry = useMemo(() => {
    const aNode = nodes.find((n) => n.id === aId);
    const bNode = nodes.find((n) => n.id === bId);
    if (!aNode || !bNode) return null;

    const geomA = buildPrimitiveGeometry(aNode);
    const geomB = buildPrimitiveGeometry(bNode);
    if (!geomA || !geomB) return null;

    const brushA = new Brush(geomA);
    brushA.updateMatrixWorld();
    const brushB = new Brush(geomB);
    brushB.updateMatrixWorld();

    const evaluator = new Evaluator();
    const result = evaluator.evaluate(brushA, brushB, OP_MAP[operation]);
    return result.geometry;
  }, [operation, aId, bId, nodes]);

  if (!geometry) return null;
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

interface NodeMeshProps {
  node: SceneNode;
  allNodes: SceneNode[];
  selectedIds: Set<string>;
  hiddenIds: Set<string>;
  onSelect: (id: string | null) => void;
}

function NodeMesh({
  node,
  allNodes,
  selectedIds,
  hiddenIds,
  onSelect,
}: NodeMeshProps) {
  const { position, rotation, scale } = node.transform;
  if (hiddenIds.has(node.id)) return null;
  const selected = selectedIds.has(node.id);

  if (node.type === "group") {
    return (
      <group position={position} rotation={rotation} scale={scale}>
        {node.children.map((child) => (
          <NodeMesh
            key={child.id}
            node={child}
            allNodes={allNodes}
            selectedIds={selectedIds}
            hiddenIds={hiddenIds}
            onSelect={onSelect}
          />
        ))}
      </group>
    );
  }

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      userData={{ nodeId: node.id }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {node.type === "boolean" ? (
        <BooleanGeometryMesh
          operation={node.parameters.operation as keyof typeof OP_MAP}
          aId={node.parameters.a as string}
          bId={node.parameters.b as string}
          nodes={allNodes}
        />
      ) : (
        <PrimitiveGeometry node={node} />
      )}
      <meshStandardMaterial color={node.material?.color ?? "#888888"} />
      {selected && <Edges color={SELECT_COLOR} />}
    </mesh>
  );
}

/** Menghitung triangle nyata dari mesh three.js → sceneStore.triCount. */
function StatsBridge({ scene }: { scene: Scene }) {
  const setTriCount = useSceneStore((s) => s.setTriCount);
  const threeScene = useThree((s) => s.scene);

  useEffect(() => {
    let tri = 0;
    threeScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      tri += g.index
        ? g.index.count / 3
        : (g.attributes.position?.count ?? 0) / 3;
    });
    setTriCount(Math.round(tri));
  }, [threeScene, scene, setTriCount]);

  return null;
}

/** Ekspor GLB nyata via GLTFExporter — hanya mesh ber-tag nodeId (grid & light dikecualikan). */
function ExportBridge({ tick }: { tick: number }) {
  const threeScene = useThree((s) => s.scene);
  const handled = useRef(0);

  useEffect(() => {
    if (tick === handled.current) return;
    handled.current = tick;

    let cancelled = false;
    (async () => {
      const { GLTFExporter } = await import(
        "three/examples/jsm/exporters/GLTFExporter.js"
      );
      const group = new THREE.Group();
      threeScene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.userData?.nodeId) return;
        const clone = mesh.clone();
        clone.applyMatrix4(mesh.matrixWorld);
        clone.clear(); // buang helper Edges agar tidak ikut terekspor
        group.add(clone);
      });

      new GLTFExporter().parse(
        group,
        (result) => {
          if (cancelled || !(result instanceof ArrayBuffer)) return;
          const blob = new Blob([result], {
            type: "model/gltf-binary",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = EXPORT_FILENAME;
          a.click();
          URL.revokeObjectURL(url);
          useChatStore
            .getState()
            .pushNote(
              `export_glb · ${EXPORT_FILENAME} · ${(blob.size / 1024).toFixed(0)} KB`,
            );
        },
        (err) => {
          useChatStore
            .getState()
            .pushNote(`export_glb · gagal — ${String(err)}`);
        },
        { binary: true },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [tick, threeScene]);

  return null;
}

export default function Viewport() {
  const scene = useSceneStore((s) => s.scene);
  const selectedId = useSceneStore((s) => s.selectedId);
  const hiddenIds = useSceneStore((s) => s.hiddenIds);
  const exportTick = useSceneStore((s) => s.exportTick);
  const select = useSceneStore((s) => s.select);

  const allNodes = useMemo(() => flattenNodes(scene.nodes), [scene]);
  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) {
      const found = allNodes.find((n) => n.id === selectedId);
      if (found) {
        const add = (n: SceneNode) => {
          set.add(n.id);
          n.children.forEach(add);
        };
        add(found);
      }
    }
    return set;
  }, [selectedId, allNodes]);

  return (
    <Canvas
      camera={{ position: [6.5, 5.4, 8.6], fov: 46 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[VIEWPORT_BG]} />
      <hemisphereLight args={[0xe9eef5, 0x363b44, 0.95]} />
      <directionalLight position={[5, 9, 4]} intensity={0.6} />
      <gridHelper args={[24, 24, 0x55606e, 0x39414c]} />
      {scene.nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          allNodes={allNodes}
          selectedIds={selectedIds}
          hiddenIds={hidden}
          onSelect={select}
        />
      ))}
      <OrbitControls
        makeDefault
        target={[0, 1, 0]}
        enableDamping
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
      <StatsBridge scene={scene} />
      <ExportBridge tick={exportTick} />
    </Canvas>
  );
}
