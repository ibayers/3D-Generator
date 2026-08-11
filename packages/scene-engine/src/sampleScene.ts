import type { Scene } from "./types";

export const sampleScene: Scene = {
  version: "0.1",
  nodes: [
    {
      id: "box-01",
      type: "box",
      name: "Main Box",
      transform: {
        position: [-2, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      parameters: { size: [1, 1, 1] },
      material: { color: "#8b5cf6" },
      children: [],
    },
    {
      id: "group-tower",
      type: "group",
      name: "Tower Group",
      transform: {
        position: [2, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      parameters: {},
      children: [
        {
          id: "cylinder-01",
          type: "cylinder",
          name: "Tower Base",
          transform: {
            position: [0, 0.5, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          parameters: { radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
          material: { color: "#10b981" },
          children: [],
        },
        {
          id: "sphere-01",
          type: "sphere",
          name: "Tower Top",
          transform: {
            position: [0, 1.4, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          parameters: { radius: 0.4 },
          material: { color: "#ef4444" },
          children: [],
        },
      ],
    },
    {
      id: "plane-ground",
      type: "plane",
      name: "Ground",
      transform: {
        position: [0, 0, 0],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [1, 1, 1],
      },
      parameters: { width: 20, height: 20 },
      material: { color: "#1f2937" },
      children: [],
    },
  ],
};
