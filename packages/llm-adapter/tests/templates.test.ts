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
