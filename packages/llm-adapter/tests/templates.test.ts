import { describe, it, expect } from "vitest";
import { applyCreateHouse } from "../src/templates/createHouse";
import type { SceneNode } from "@asset-studio/scene-engine";

describe("applyCreateHouse", () => {
  it("produces walls, roof, and window panes with unique ids", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "house-01",
        position: [0, 0, 0],
        size: [4, 3, 4],
        wallColor: "#cccccc",
        roofColor: "#882222",
      },
      scene
    );

    const ids = result.newNodes.map((n) => n.id);
    expect(ids).toContain("house-01-walls");
    expect(ids).toContain("house-01-roof");
    // At least 1 window pane
    expect(
      ids.filter((i) => i.startsWith("house-01-window")).length
    ).toBeGreaterThan(0);
  });

  it("walls extrude footprint of size[0] x size[2], height size[1]", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "h",
        position: [0, 0, 0],
        size: [6, 4, 5],
        wallColor: "#ffffff",
        roofColor: "#000000",
      },
      scene
    );
    const walls = result.newNodes.find((n) => n.id === "h-walls");
    expect(walls).toBeDefined();
    expect(walls?.type).toBe("extrude");
    expect(walls?.parameters.depth).toBe(4);
    expect(walls?.parameters.shape).toHaveLength(4);
  });

  it("places roof above walls (position y >= size[1])", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "h",
        position: [0, 0, 0],
        size: [4, 3, 4],
        wallColor: "#ffffff",
        roofColor: "#000000",
      },
      scene
    );
    const roof = result.newNodes.find((n) => n.id === "h-roof");
    expect(roof?.transform.position[1]).toBeGreaterThanOrEqual(3);
  });

  it("returns only new nodes; does not mutate input scene", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "h",
        position: [1, 0, 1],
        size: [4, 3, 4],
      },
      scene
    );
    expect(scene.nodes).toHaveLength(0);
    expect(result.newNodes.length).toBeGreaterThan(0);
    // Every node should be a valid extrude
    for (const n of result.newNodes) {
      expect(n.type).toBe("extrude");
      expect(n.name).toBe(n.id);
      expect(n.parameters.shape).toBeDefined();
      expect(n.parameters.depth).toBeGreaterThan(0);
    }
  });
});

import { applyCreateRoad } from "../src/templates/createRoad";

describe("applyCreateRoad", () => {
  it("produces one extruded strip with the road id", () => {
    const scene = { nodes: [] };
    const result = applyCreateRoad(
      {
        id: "road-01",
        path: [
          [0, 0],
          [10, 0],
        ],
        width: 2,
        color: "#333333",
      },
      scene
    );

    expect(result.newNodes).toHaveLength(1);
    const strip = result.newNodes[0];
    expect(strip.id).toBe("road-01");
    expect(strip.type).toBe("extrude");
  });

  it("builds a rectangle of width x path-length from a straight path", () => {
    const scene = { nodes: [] };
    const result = applyCreateRoad(
      {
        id: "r",
        path: [
          [0, 0],
          [10, 0],
        ],
        width: 2,
        color: "#111111",
      },
      scene
    );
    const strip = result.newNodes[0];
    if (strip.type !== "extrude") throw new Error("expected extrude");
    const shape = strip.parameters.shape as [number, number][];
    expect(shape).toHaveLength(4);
    const xs = shape.map((p) => p[0]);
    const zs = shape.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2);
  });

  it("thin extrude (depth 0.05) so the road sits flat on the ground", () => {
    const scene = { nodes: [] };
    const result = applyCreateRoad(
      {
        id: "r",
        path: [
          [0, 0],
          [5, 0],
        ],
        width: 1,
      },
      scene
    );
    const strip = result.newNodes[0];
    if (strip.type !== "extrude") throw new Error("expected extrude");
    expect(strip.parameters.depth).toBeLessThanOrEqual(0.1);
  });

  it("throws when path has fewer than 2 points", () => {
    const scene = { nodes: [] };
    expect(() =>
      applyCreateRoad({ id: "r", path: [[0, 0]], width: 1 }, scene)
    ).toThrow(/at least 2 points/);
  });
});
