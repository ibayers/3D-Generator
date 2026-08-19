import { describe, it, expect, beforeEach } from "vitest";
import type { SceneNode } from "@asset-studio/scene-engine";
import { useSceneStore } from "./sceneStore";

const node = (id: string): SceneNode => ({
  id,
  type: "box",
  name: id,
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  parameters: {},
  children: [],
});

beforeEach(() => {
  useSceneStore.setState({
    scene: { version: "0.1", nodes: [node("a"), node("b")] },
    history: [],
    future: [],
    selectedId: null,
    hiddenIds: [],
    lastAction: "",
    triCount: 0,
    exportTick: 0,
  });
});

describe("deleteNode", () => {
  it("removes the node and records history snapshot", () => {
    const before = useSceneStore.getState().history.length;
    const sceneBefore = useSceneStore.getState().scene;
    const target = sceneBefore.nodes[0]!;

    const ok = useSceneStore.getState().deleteNode(target.id);

    expect(ok).toBe(true);
    const s = useSceneStore.getState();
    expect(s.scene.nodes.some((n) => n.id === target.id)).toBe(false);
    expect(s.scene.nodes.length).toBe(sceneBefore.nodes.length - 1);
    expect(s.history.length).toBe(before + 1);
    expect(s.history.at(-1)?.scene).toBe(sceneBefore);
    expect(s.history.at(-1)?.label).toBe(`delete:${target.id}`);
    expect(s.future).toHaveLength(0);
  });

  it("clears selection and hidden entry for the deleted node", () => {
    const target = useSceneStore.getState().scene.nodes[0]!;
    useSceneStore.getState().select(target.id);
    useSceneStore.getState().toggleHidden(target.id);

    useSceneStore.getState().deleteNode(target.id);

    const s = useSceneStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.hiddenIds).not.toContain(target.id);
  });

  it("keeps selection when deleting a different node", () => {
    const [keep, drop] = useSceneStore.getState().scene.nodes;
    useSceneStore.getState().select(keep!.id);

    useSceneStore.getState().deleteNode(drop!.id);

    expect(useSceneStore.getState().selectedId).toBe(keep!.id);
  });

  it("returns false for unknown id and does not touch history", () => {
    const before = useSceneStore.getState().history.length;

    const ok = useSceneStore.getState().deleteNode("nope");

    expect(ok).toBe(false);
    expect(useSceneStore.getState().history.length).toBe(before);
  });

  it("undo restores the deleted node", () => {
    const target = useSceneStore.getState().scene.nodes[0]!;
    useSceneStore.getState().deleteNode(target.id);

    const label = useSceneStore.getState().undo();

    expect(label).toBe(`delete:${target.id}`);
    expect(
      useSceneStore.getState().scene.nodes.some((n) => n.id === target.id),
    ).toBe(true);
  });

  it("purges hidden entries of deleted children", () => {
    const parent = { ...node("parent"), children: [node("kid")] };
    useSceneStore.setState({
      scene: { version: "0.1", nodes: [parent, node("b")] },
    });
    useSceneStore.getState().toggleHidden("kid");

    useSceneStore.getState().deleteNode("parent");

    const s = useSceneStore.getState();
    expect(s.hiddenIds).not.toContain("kid");
    expect(s.scene.nodes.map((n) => n.id)).toEqual(["b"]);
  });
});
