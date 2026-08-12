import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";

export interface CreateHouseInput {
  id: string;
  position: [number, number, number];
  size: [number, number, number]; // [width, height, depth]
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
  const [w, h, d] = input.size;
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

  // ponytail: decorative window panes on the +Z face. Real CSG cuts land in M4.
  const windowNodes: SceneNode[] = [];
  const windowSize = 0.4;
  const windowHeight = py + h * 0.5;
  const windowZ = pz + halfD + 0.01;
  const windowSpacing = w / 3;
  for (let i = 0; i < 2; i++) {
    const wx = px - windowSpacing / 2 + i * windowSpacing;
    windowNodes.push(
      extrudeNode(
        `${input.id}-window-${i + 1}`,
        [
          [wx - windowSize / 2, windowZ - windowSize / 2],
          [wx + windowSize / 2, windowZ - windowSize / 2],
          [wx + windowSize / 2, windowZ + windowSize / 2],
          [wx - windowSize / 2, windowZ + windowSize / 2],
        ],
        0.05,
        "#88aacc",
        [0, windowHeight, 0]
      )
    );
  }

  return { newNodes: [walls, roof, ...windowNodes] };
}
