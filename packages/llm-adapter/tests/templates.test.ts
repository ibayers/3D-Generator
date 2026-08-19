import { describe, it, expect } from "vitest";
import { applyCreateHouse } from "../src/templates/createHouse";
import type { SceneNode } from "@asset-studio/scene-engine";

describe("applyCreateHouse", () => {
  it("produces walls + two gable roof slabs by default", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "house-01", position: [0, 0, 0], size: [4, 3, 4], wallColor: "#cccccc", roofColor: "#882222" },
      scene
    );
    const ids = result.newNodes.map((n) => n.id);
    expect(ids).toContain("house-01-walls");
    expect(ids).toContain("house-01-roof-l");
    expect(ids).toContain("house-01-roof-r");
    expect(ids).toHaveLength(3);
  });

  it("walls extrude footprint of size[0] x size[2], height size[1]", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [6, 4, 5], wallColor: "#ffffff", roofColor: "#000000" },
      scene
    );
    const walls = result.newNodes.find((n) => n.id === "h-walls");
    expect(walls).toBeDefined();
    expect(walls?.type).toBe("extrude");
    expect(walls?.parameters.depth).toBe(4);
    expect(walls?.parameters.shape).toHaveLength(4);
  });

  it("gable slabs are tilted ±theta and sit above the walls", () => {
    const scene = { nodes: [] as SceneNode[] };
    const w = 6;
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [w, 4, 5] },
      scene
    );
    const hr = Math.max(1, w * 0.22);
    const theta = Math.atan2(hr, w / 2 + 0.3);
    const right = result.newNodes.find((n) => n.id === "h-roof-r");
    const left = result.newNodes.find((n) => n.id === "h-roof-l");
    expect(right?.transform.rotation?.[2]).toBeCloseTo(-theta);
    expect(left?.transform.rotation?.[2]).toBeCloseTo(theta);
    expect(right?.transform.position[1]).toBeGreaterThanOrEqual(4);
    expect(left?.transform.position[1]).toBeGreaterThanOrEqual(4);
  });

  it("flat roof is a single slab with zero rotation", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [4, 3, 4], roofStyle: "flat" },
      scene
    );
    const roof = result.newNodes.find((n) => n.id === "h-roof");
    expect(roof).toBeDefined();
    expect(roof?.transform.rotation).toEqual([0, 0, 0]);
    expect(roof?.transform.position[1]).toBeGreaterThanOrEqual(3);
    expect(result.newNodes.filter((n) => n.id.startsWith("h-roof"))).toHaveLength(1);
  });

  it("floors=2 without size defaults height to 6 and adds a floor band", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], floors: 2, roofStyle: "flat" },
      scene
    );
    const walls = result.newNodes.find((n) => n.id === "h-walls");
    expect(walls?.parameters.depth).toBe(6); // 2 floors * 3m
    const band = result.newNodes.find((n) => n.id === "h-floor-1");
    expect(band).toBeDefined();
    expect(band?.transform.position[1]).toBeGreaterThan(2.5);
    expect(band?.transform.position[1]).toBeLessThan(3.5);
  });

  it("returns only new nodes; does not mutate input scene", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse({ id: "h", position: [1, 0, 1], size: [4, 3, 4] }, scene);
    expect(scene.nodes).toHaveLength(0);
    expect(result.newNodes.length).toBeGreaterThan(0);
    for (const n of result.newNodes) {
      expect(n.type).toBe("extrude");
      expect(n.name).toBe(n.id);
      expect(n.parameters.shape).toBeDefined();
      expect(n.parameters.depth).toBeGreaterThan(0);
    }
  });

  it("floors=3 without size defaults height to 9", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse({ id: "h", position: [0, 0, 0], floors: 3, roofStyle: "flat" }, scene);
    expect(result.newNodes.find((n) => n.id === "h-walls")?.parameters.depth).toBe(9);
    // bands at k=1,2
    expect(result.newNodes.find((n) => n.id === "h-floor-1")).toBeDefined();
    expect(result.newNodes.find((n) => n.id === "h-floor-2")).toBeDefined();
  });

  it("explicit size wins over floors-derived height", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [4, 5, 4], floors: 3, roofStyle: "flat" },
      scene
    );
    expect(result.newNodes.find((n) => n.id === "h-walls")?.parameters.depth).toBe(5);
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
