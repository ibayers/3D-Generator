import type { SceneNode } from "@asset-studio/scene-engine";

// ponytail: road is a single extruded rectangle along the first segment
// direction of the path. Curved paths and lane markings are M4 polish.
export interface CreateRoadInput {
  id: string;
  path: [number, number][]; // [x, z] points
  width: number;
  color?: string;
}

export interface CreateRoadResult {
  newNodes: SceneNode[];
}

export function applyCreateRoad(
  input: CreateRoadInput,
  _scene: { nodes: SceneNode[] }
): CreateRoadResult {
  if (input.path.length < 2) {
    throw new Error("create_road path must have at least 2 points");
  }
  // Guard above ensures indices 0 and 1 exist.
  const start = input.path[0]!;
  const end = input.path[1]!;
  const minX = Math.min(start[0], end[0]);
  const maxX = Math.max(start[0], end[0]);
  const minZ = Math.min(start[1], end[1]);
  const maxZ = Math.max(start[1], end[1]);

  const isHorizontal = maxX - minX >= maxZ - minZ;
  const halfW = input.width / 2;
  // ponytail: shape-Y maps to world -Z (Viewport ExtrudeGeometryMesh rotateX(-PI/2));
  // author Z negated so the road lands at its true path position.
  const shape: [number, number][] = isHorizontal
    ? [
        [minX, -(minZ - halfW)],
        [maxX, -(minZ - halfW)],
        [maxX, -(maxZ + halfW)],
        [minX, -(maxZ + halfW)],
      ]
    : [
        [minX - halfW, -minZ],
        [maxX + halfW, -minZ],
        [maxX + halfW, -maxZ],
        [minX - halfW, -maxZ],
      ];

  const strip: SceneNode = {
    id: input.id,
    type: "extrude",
    name: input.id,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parameters: { shape, depth: 0.05 },
    material: { color: input.color ?? "#333333" },
    children: [],
  };

  return { newNodes: [strip] };
}
