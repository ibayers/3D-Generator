import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";
import type { CreateCharacterToolInput } from "@asset-studio/schema";

export type { CreateCharacterToolInput };

export interface CreateCharacterResult {
  newNodes: SceneNode[];
}

const DEFAULT_HEIGHT = 1.7;
const MIN_HEIGHT = 0.5;
const MAX_HEIGHT = 3;
const SKIN_DEFAULT = "#e0ac69";
const SHIRT_DEFAULT = "#4a6fa5";
const PANTS_DEFAULT = "#2f3b4c";
const HAIR_DEFAULT = "#3b2a20";

// Vertical proportions (fractions of total height h).
const LEG_H = 0.45;
const TORSO_H = 0.32;
const ARM_H = 0.34;
const ARM_TOP = 0.75; // arms hang from the shoulder line
const HEAD_BASE = 0.78;
const HEAD_H = 1 / 7; // classic 7-head canon
const HAIR_BASE = 0.9;
const HAIR_H = 0.05;

// Widths (fractions of h) per build.
const TORSO_W: Record<"slim" | "regular" | "stocky", number> = {
  slim: 0.16,
  regular: 0.2,
  stocky: 0.26,
};
const HEAD_W = 0.13;
const HEAD_D = 0.12;

type XY = [number, number];

/** Centered rectangle footprint — shape-local coords; world offset comes from
 * transform.position (same contract as the other templates). */
function rect(w: number, d: number): XY[] {
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
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
 * ponytail: root + children (NOT flat siblings like create_tree) so the rail,
 * deleteNode (recursive), and hide all treat the character as one object —
 * and a single root makes exact-id upsert sufficient (no prefix replacement).
 */
export function applyCreateCharacter(
  input: CreateCharacterToolInput,
  _scene: { nodes: SceneNode[] }
): CreateCharacterResult {
  const build = input.build ?? "regular";
  const h = Math.min(
    Math.max(input.height ?? DEFAULT_HEIGHT, MIN_HEIGHT),
    MAX_HEIGHT,
  );
  const [px, py, pz] = input.position;
  const skin = input.skinColor ?? SKIN_DEFAULT;
  const shirt = input.shirtColor ?? SHIRT_DEFAULT;
  const pants = input.pantsColor ?? PANTS_DEFAULT;
  const hairColor = input.hairColor ?? HAIR_DEFAULT;

  const torsoW = TORSO_W[build] * h;
  const torsoD = torsoW * 0.55;
  const legW = torsoW * 0.32;
  const legD = torsoD * 0.9;
  const armW = torsoW * 0.26;
  const armD = torsoD * 0.7;
  const legX = legW / 2 + torsoW * 0.06;
  const armX = torsoW / 2 + armW / 2 + h * 0.01;

  const legL = extrudeNode(
    `${input.id}-leg-l`,
    rect(legW, legD),
    LEG_H * h,
    pants,
    [px - legX, py, pz]
  );
  const legR = extrudeNode(
    `${input.id}-leg-r`,
    rect(legW, legD),
    LEG_H * h,
    pants,
    [px + legX, py, pz]
  );
  const armL = extrudeNode(
    `${input.id}-arm-l`,
    rect(armW, armD),
    ARM_H * h,
    skin,
    [px - armX, py + (ARM_TOP - ARM_H) * h, pz]
  );
  const armR = extrudeNode(
    `${input.id}-arm-r`,
    rect(armW, armD),
    ARM_H * h,
    skin,
    [px + armX, py + (ARM_TOP - ARM_H) * h, pz]
  );
  const head = extrudeNode(
    `${input.id}-head`,
    rect(HEAD_W * h, HEAD_D * h),
    HEAD_H * h,
    skin,
    [px, py + HEAD_BASE * h, pz]
  );
  const hair = extrudeNode(
    `${input.id}-hair`,
    rect(HEAD_W * h * 1.15, HEAD_D * h * 1.15),
    HAIR_H * h,
    hairColor,
    [px, py + HAIR_BASE * h, pz]
  );

  const root: SceneNode = {
    ...extrudeNode(
      input.id,
      rect(torsoW, torsoD),
      TORSO_H * h,
      shirt,
      [px, py + LEG_H * h, pz]
    ),
    children: [legL, legR, armL, armR, head, hair],
  };

  return { newNodes: [root] };
}
