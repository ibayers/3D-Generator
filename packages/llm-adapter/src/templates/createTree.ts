import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";

export interface CreateTreeInput {
  id: string;
  position: [number, number, number];
  /** Default "conifer" (pinus). */
  type?: "conifer" | "broadleaf";
  /** Total tree height in meters; default 6, clamped to >= 1. */
  height?: number;
  trunkColor?: string;
  canopyColor?: string;
}

export interface CreateTreeResult {
  newNodes: SceneNode[];
}

const DEFAULT_HEIGHT = 6;
const MIN_HEIGHT = 1;
const TRUNK_COLOR_DEFAULT = "#6b4a2f";
const CONIFER_CANOPY_COLOR = "#2f7d3a";
const BROADLEAF_CANOPY_COLOR = "#3d8b40";
const TRUNK_SIDES = 6;
const CONIFER_SIDES = 6;
const BROADLEAF_SIDES = 8;
const CONIFER_TRUNK_RATIO = 0.4;
const BROADLEAF_TRUNK_RATIO = 0.55;
/** Trunk radius relative to height — low-poly proportions. */
const TRUNK_RADIUS_RATIO = 0.04;

type XY = [number, number];

/** Regular polygon centered on (0,0) — shape-local coords; world offset comes
 * from transform.position (same contract as the gable roof slabs). */
function regularPolygon(sides: number, radius: number): XY[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return [radius * Math.cos(a), radius * Math.sin(a)] as XY;
  });
}

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

/**
 * ponytail: template = composition of Layer-1 extrudes, per PRD §5.2 — the
 * organic PoC must visibly be built from the same primitives as houses/roads.
 * Conifer: hexagon trunk + 3 tapering hexagon tiers. Broadleaf: hexagon trunk
 * + 2 octagon discs (larger below, smaller above) for a rounded crown read.
 */
export function applyCreateTree(
  input: CreateTreeInput,
  _scene: { nodes: SceneNode[] }
): CreateTreeResult {
  const type = input.type ?? "conifer";
  const h = Math.max(input.height ?? DEFAULT_HEIGHT, MIN_HEIGHT);
  const [px, py, pz] = input.position;
  const trunkColor = input.trunkColor ?? TRUNK_COLOR_DEFAULT;
  const canopyColor =
    input.canopyColor ?? (type === "broadleaf" ? BROADLEAF_CANOPY_COLOR : CONIFER_CANOPY_COLOR);

  const trunkRadius = Math.max(h * TRUNK_RADIUS_RATIO, 0.15);
  const nodes: SceneNode[] = [];

  if (type === "broadleaf") {
    const trunkH = h * BROADLEAF_TRUNK_RATIO;
    nodes.push(
      extrudeNode(
        `${input.id}-trunk`,
        regularPolygon(TRUNK_SIDES, trunkRadius),
        trunkH,
        trunkColor,
        [px, py, pz]
      )
    );
    // Two canopy discs: larger below, smaller above for a rounded crown.
    const lowerH = h * 0.28;
    const upperH = h * 0.2;
    nodes.push(
      extrudeNode(
        `${input.id}-canopy-1`,
        regularPolygon(BROADLEAF_SIDES, h * 0.24),
        lowerH,
        canopyColor,
        [px, py + trunkH - lowerH * 0.3, pz]
      )
    );
    nodes.push(
      extrudeNode(
        `${input.id}-canopy-2`,
        regularPolygon(BROADLEAF_SIDES, h * 0.16),
        upperH,
        canopyColor,
        [px, py + trunkH + lowerH * 0.55, pz]
      )
    );
    return { newNodes: nodes };
  }

  // Conifer.
  const trunkH = h * CONIFER_TRUNK_RATIO;
  nodes.push(
    extrudeNode(
      `${input.id}-trunk`,
      regularPolygon(TRUNK_SIDES, trunkRadius),
      trunkH,
      trunkColor,
      [px, py, pz]
    )
  );
  // Three tapering, overlapping tiers from ~45% h up to the top.
  const tierHeights = [h * 0.24, h * 0.2, h * 0.16];
  const tierRadii = [h * 0.22, h * 0.16, h * 0.1];
  const tierBase = [h * 0.45, h * 0.62, h * 0.78];
  for (let k = 0; k < 3; k++) {
    nodes.push(
      extrudeNode(
        `${input.id}-canopy-${k + 1}`,
        regularPolygon(CONIFER_SIDES, tierRadii[k]!),
        tierHeights[k]!,
        canopyColor,
        [px, py + tierBase[k]!, pz]
      )
    );
  }
  return { newNodes: nodes };
}
