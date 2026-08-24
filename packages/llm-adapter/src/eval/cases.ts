export interface EvalCase {
  id: string;
  prompt: string;
  expectedTool: string;
  /** Optional arg assertions on the first tool call. */
  expectArgs?: (input: Record<string, unknown>) => boolean;
  /** Scene state appended to the prompt (PRD: model reads scene from user message). */
  sceneJson?: string;
}

const TREE_SCENE = JSON.stringify({
  version: "0.1",
  nodes: [
    {
      id: "tree-01",
      type: "extrude",
      name: "Pohon pinus",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parameters: { depth: 2, color: "#6b4a2f" },
      children: [
        {
          id: "tree-01-canopy-1",
          type: "extrude",
          name: "Kanopi",
          transform: { position: [0, 2.25, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          parameters: { depth: 1.2, color: "#2f7d3a" },
          children: [],
        },
      ],
    },
  ],
});

const HOUSE_SCENE = JSON.stringify({
  version: "0.1",
  nodes: [
    {
      id: "house-01",
      type: "extrude",
      name: "Rumah",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parameters: { depth: 6, color: "#d9cbb0" },
      children: [
        {
          id: "house-01-roof",
          type: "extrude",
          name: "Atap",
          transform: { position: [0, 6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          parameters: { depth: 2, color: "#8b3a2f" },
          children: [],
        },
      ],
    },
  ],
});

const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** PRD §11.2 — regression set; run via tests/eval.live.test.ts when a key is set. */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "house-gable-2f",
    prompt: "Buat rumah 2 lantai dengan atap pelana",
    expectedTool: "create_house",
    expectArgs: (input) => input.floors === 2 && input.roofStyle === "gable",
  },
  {
    id: "road-front",
    prompt: "Buat jalan lurus selebar 3 meter di depan rumah",
    expectedTool: "create_road",
    expectArgs: (input) => input.width === 3,
  },
  {
    id: "tree-conifer-5m",
    prompt: "Buat pohon pinus setinggi 5 meter",
    expectedTool: "create_tree",
    expectArgs: (input) => input.height === 5,
  },
  {
    id: "tree-broadleaf",
    prompt: "Tambahkan pohon rimbun dengan tajuk membulat di sebelah jalan",
    expectedTool: "create_tree",
    expectArgs: (input) => input.type === "broadleaf",
  },
  {
    id: "material-canopy",
    prompt: "Scene saat ini sudah berisi pohon tree-01. Ganti warna kanopinya jadi hijau muda #7cfc00",
    expectedTool: "set_material",
    sceneJson: TREE_SCENE,
    expectArgs: (input) =>
      typeof input.nodeId === "string" && input.nodeId.includes("canopy") && isHexColor(input.color),
  },
  {
    id: "array-four-trees",
    prompt: "Scene saat ini sudah berisi pohon tree-01. Gandakan pohon itu menjadi 4 salinan berjajar",
    expectedTool: "array",
    sceneJson: TREE_SCENE,
    expectArgs: (input) => input.count === 4,
  },
  {
    id: "transform-move-house",
    prompt: "Scene saat ini berisi rumah house-01. Pindahkan rumah itu 3 meter ke kanan",
    expectedTool: "transform",
    sceneJson: HOUSE_SCENE,
    expectArgs: (input) =>
      Array.isArray(input.position) &&
      (input.position as number[]).length === 3 &&
      typeof (input.position as number[])[0] === "number",
  },
  {
    id: "extrude-floor",
    prompt: "Buat lantai teras persegi panjang dari titik asal, cukup sebuah slab datar",
    expectedTool: "extrude",
    expectArgs: (input) => Array.isArray(input.shape) && input.shape.length >= 3,
  },
];

export function buildUserMessage(c: EvalCase): string {
  return c.sceneJson ? `${c.prompt}\n\nCurrent scene JSON:\n${c.sceneJson}` : c.prompt;
}
