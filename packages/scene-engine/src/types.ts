export type Vec3 = [number, number, number];

export type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type Material = {
  color: string; // hex string e.g. "#8b5cf6"
};

// M1: primitive meshes + grouping. Template types (house/tree/road) added in M3.
export type PrimitiveMeshType = "box" | "sphere" | "cylinder" | "plane";
export type GroupType = "group";
export type SceneNodeType = PrimitiveMeshType | GroupType;

// Loose by design for M1 — Zod schema in M2 will tighten this per-type.
export type SceneNodeParameters = Record<string, number | number[] | string>;

export type SceneNode = {
  id: string;
  type: SceneNodeType;
  name: string;
  transform: Transform;
  parameters: SceneNodeParameters;
  material?: Material;
  children: SceneNode[];
};

export type Scene = {
  version: string;
  nodes: SceneNode[];
};
