import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";

export interface CreateHouseInput {
  id: string;
  position: [number, number, number];
  /** [width, height, depth]; default [8, floors*3, 6]. */
  size?: [number, number, number];
  /** Storeys 1-3; default 1. */
  floors?: number;
  /** Default "gable" (atap pelana). */
  roofStyle?: "flat" | "gable";
  /** Gable ridge height; default max(1, width * 0.22). */
  roofHeight?: number;
  wallColor?: string;
  roofColor?: string;
}

export interface CreateHouseResult {
  newNodes: SceneNode[];
}

const FLOOR_HEIGHT = 3;
const DEFAULT_WIDTH = 8;
const DEFAULT_DEPTH = 6;
const ROOF_OVERHANG = 0.3;
const ROOF_SLAB_THICKNESS = 0.15;
const FLAT_ROOF_THICKNESS = 0.3;
const FLOOR_BAND_THICKNESS = 0.12;
const FLOOR_BAND_MARGIN = 0.05;
const FLOOR_BAND_COLOR = "#3a4150";
const WALL_COLOR_DEFAULT = "#cccccc";
const ROOF_COLOR_DEFAULT = "#882222";

type XY = [number, number];

function extrudeNode(
  id: string,
  shape: XY[],
  depth: number,
  color: string,
  position: Vec3,
  rotation?: Vec3
): SceneNode {
  return {
    id,
    type: "extrude",
    name: id,
    transform: { position, rotation: rotation ?? [0, 0, 0], scale: [1, 1, 1] },
    parameters: { shape, depth },
    material: { color },
    children: [],
  };
}

/**
 * ponytail: template = composition of Layer-1 extrudes, per PRD M3. Gable roof
 * is two tilted slabs meeting at a ridge along Z (end caps stay open — M4
 * polish). Floor bands are thin slabs at storey boundaries so "2 lantai" reads
 * visually without CSG window cuts.
 */
export function applyCreateHouse(
  input: CreateHouseInput,
  _scene: { nodes: SceneNode[] }
): CreateHouseResult {
  const floors = input.floors ?? 1;
  const [w, h, d] = input.size ?? [DEFAULT_WIDTH, floors * FLOOR_HEIGHT, DEFAULT_DEPTH];
  const [px, py, pz] = input.position;
  const wallColor = input.wallColor ?? WALL_COLOR_DEFAULT;
  const roofColor = input.roofColor ?? ROOF_COLOR_DEFAULT;
  const roofStyle = input.roofStyle ?? "gable";

  const halfW = w / 2;
  const halfD = d / 2;

  const wallShape: XY[] = [
    [px - halfW, pz - halfD],
    [px + halfW, pz - halfD],
    [px + halfW, pz + halfD],
    [px - halfW, pz + halfD],
  ];
  const nodes: SceneNode[] = [
    extrudeNode(`${input.id}-walls`, wallShape, h, wallColor, [0, py, 0]),
  ];

  // Floor bands between storeys (k = 1 .. floors-1).
  const floorH = h / floors;
  for (let k = 1; k < floors; k++) {
    const m = FLOOR_BAND_MARGIN;
    const bandShape: XY[] = [
      [px - halfW - m, pz - halfD - m],
      [px + halfW + m, pz - halfD - m],
      [px + halfW + m, pz + halfD + m],
      [px - halfW - m, pz + halfD + m],
    ];
    nodes.push(
      extrudeNode(
        `${input.id}-floor-${k}`,
        bandShape,
        FLOOR_BAND_THICKNESS,
        FLOOR_BAND_COLOR,
        [0, py + k * floorH - FLOOR_BAND_THICKNESS / 2, 0]
      )
    );
  }

  if (roofStyle === "flat") {
    const o = ROOF_OVERHANG;
    const roofShape: XY[] = [
      [px - halfW - o, pz - halfD - o],
      [px + halfW + o, pz - halfD - o],
      [px + halfW + o, pz + halfD + o],
      [px - halfW - o, pz + halfD + o],
    ];
    nodes.push(
      extrudeNode(`${input.id}-roof`, roofShape, FLAT_ROOF_THICKNESS, roofColor, [0, py + h, 0])
    );
  } else {
    // Gable: ridge along Z at (px, py + h + hr, pz). Each slab is an extrude
    // centered at its slope midpoint, tilted ±theta about Z (see plan Task 6).
    const hr = input.roofHeight ?? Math.max(1, w * 0.22);
    const run = halfW + ROOF_OVERHANG;
    const slope = Math.hypot(run, hr);
    const theta = Math.atan2(hr, run);
    const zSpan = d + 2 * ROOF_OVERHANG;
    const slabShape: XY[] = [
      [-slope / 2, -zSpan / 2],
      [slope / 2, -zSpan / 2],
      [slope / 2, zSpan / 2],
      [-slope / 2, zSpan / 2],
    ];
    nodes.push(
      extrudeNode(
        `${input.id}-roof-r`,
        slabShape,
        ROOF_SLAB_THICKNESS,
        roofColor,
        [px + run / 2, py + h + hr / 2, pz],
        [0, 0, -theta]
      )
    );
    nodes.push(
      extrudeNode(
        `${input.id}-roof-l`,
        slabShape,
        ROOF_SLAB_THICKNESS,
        roofColor,
        [px - run / 2, py + h + hr / 2, pz],
        [0, 0, theta]
      )
    );
  }

  return { newNodes: nodes };
}
