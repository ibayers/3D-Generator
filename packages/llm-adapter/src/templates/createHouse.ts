import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";

export interface CreateHouseInput {
  id: string;
  position: [number, number, number];
  /** [width, height, depth]; defaults to [8, floors*3, 6] when omitted. */
  size?: [number, number, number];
  /** Number of storeys (1-3); default 1. Drives default height. */
  floors?: number;
  /** Roof shape; default gable (rendered gable geometry lands with the gable template). */
  roofStyle?: "flat" | "gable";
  /** Gable ridge height; default max(1, width*0.22). */
  roofHeight?: number;
  wallColor?: string;
  roofColor?: string;
}

export interface CreateHouseResult {
  newNodes: SceneNode[];
}

type XY = [number, number];

function extrudeNode(
  id: string,
  shape: XY[],
  depth: number,
  color: string,
  position: Vec3
): SceneNode {
  return {
    id,
    type: "extrude",
    name: id,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    parameters: { shape, depth },
    material: { color },
    children: [],
  };
}

// ponytail: windows are decorative extruded panes placed on the wall surface,
// not CSG cuts. World-space boolean arrives in M4.
export function applyCreateHouse(
  input: CreateHouseInput,
  _scene: { nodes: SceneNode[] }
): CreateHouseResult {
  const [w, h, d] = input.size ?? [8, (input.floors ?? 1) * 3, 6];
  const [px, py, pz] = input.position;
  const wallColor = input.wallColor ?? "#cccccc";
  const roofColor = input.roofColor ?? "#882222";

  const halfW = w / 2;
  const halfD = d / 2;

  // Wall footprint centered at (px, pz) in the XY plane; extrude lifts it h on Y.
  const wallShape: XY[] = [
    [px - halfW, pz - halfD],
    [px + halfW, pz - halfD],
    [px + halfW, pz + halfD],
    [px - halfW, pz + halfD],
  ];
  const walls = extrudeNode(
    `${input.id}-walls`,
    wallShape,
    h,
    wallColor,
    [0, py, 0]
  );

  // Roof: slightly larger, shorter extrude sitting on top of the walls.
  const roofOverhang = 0.2;
  const roofShape: XY[] = [
    [px - halfW - roofOverhang, pz - halfD - roofOverhang],
    [px + halfW + roofOverhang, pz - halfD - roofOverhang],
    [px + halfW + roofOverhang, pz + halfD + roofOverhang],
    [px - halfW - roofOverhang, pz + halfD + roofOverhang],
  ];
  const roof = extrudeNode(
    `${input.id}-roof`,
    roofShape,
    0.3,
    roofColor,
    [0, py + h, 0]
  );

  // ponytail: windows removed — they were authored with a different extrude
  // convention (shape=face, depth=protrusion) that conflicts with the
  // footprint-extrude convention used by walls. Real CSG window cuts land in M4.
  return { newNodes: [walls, roof] };
}
