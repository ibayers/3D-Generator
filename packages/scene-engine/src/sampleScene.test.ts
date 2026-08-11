import { describe, it, expect } from "vitest";
import { sampleScene } from "./sampleScene";

describe("sampleScene", () => {
  it("has version 0.1 and a non-empty nodes array", () => {
    expect(sampleScene.version).toBe("0.1");
    expect(Array.isArray(sampleScene.nodes)).toBe(true);
    expect(sampleScene.nodes.length).toBeGreaterThan(0);
  });

  it("every node (recursive) has id, type, name, transform, children", () => {
    const check = (node: unknown): void => {
      const n = node as Record<string, unknown>;
      expect(typeof n["id"]).toBe("string");
      expect(typeof n["type"]).toBe("string");
      expect(typeof n["name"]).toBe("string");
      expect(n["transform"]).toBeDefined();
      expect(Array.isArray(n["children"])).toBe(true);
      (n["children"] as unknown[]).forEach(check);
    };
    sampleScene.nodes.forEach(check);
  });

  it("contains at least one group node with nested children", () => {
    const group = sampleScene.nodes.find((n) => n.type === "group");
    expect(group).toBeDefined();
    expect(group!.children.length).toBeGreaterThan(0);
  });

  it("contains at least one primitive mesh (box/sphere/cylinder/plane)", () => {
    const primitives = new Set(["box", "sphere", "cylinder", "plane"]);
    const has = sampleScene.nodes.some((n) => primitives.has(n.type));
    expect(has).toBe(true);
  });
});
