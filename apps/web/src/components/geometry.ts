import * as THREE from "three";
import type { SceneNode } from "@asset-studio/scene-engine";

// ponytail: MVP only supports primitive operands (box/sphere/cylinder/plane).
// Extrude/group/boolean operands return null — upgrade path: recursive buildGeometry in M4.
export function buildPrimitiveGeometry(
  node: SceneNode,
): THREE.BufferGeometry | null {
  const p = node.parameters;
  switch (node.type) {
    case "box":
      return new THREE.BoxGeometry(
        ...((p.size as [number, number, number]) ?? [1, 1, 1]),
      );
    case "sphere":
      return new THREE.SphereGeometry((p.radius as number) ?? 1, 32, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(
        (p.radiusTop as number) ?? 0.5,
        (p.radiusBottom as number) ?? 0.5,
        (p.height as number) ?? 1,
        32,
      );
    case "plane":
      return new THREE.PlaneGeometry(
        (p.width as number) ?? 1,
        (p.height as number) ?? 1,
      );
    default:
      return null;
  }
}
