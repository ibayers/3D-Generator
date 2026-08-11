export type Vec3 = [number, number, number];

export type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type Material = {
  color: string; // hex string e.g. "#8b5cf6"
};

export type PrimitiveMeshType = "box" | "sphere" | "cylinder" | "plane";
export type GroupType = "group";
export type ExtrudeType = "extrude";
export type BooleanType = "boolean";
export type SceneNodeType =
  | PrimitiveMeshType
  | GroupType
  | ExtrudeType
  | BooleanType;

// Extended to support booleans (bevelEnabled) and string references (operand IDs)
export type SceneNodeParameters = Record<
  string,
  number | number[] | string | boolean
>;

export type BooleanOperation = "union" | "subtract" | "intersect";

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
