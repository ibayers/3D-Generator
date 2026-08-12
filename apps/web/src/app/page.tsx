"use client";
import ChatPanel from "../components/ChatPanel";
import Viewport from "@/components/Viewport";
import { useSceneStore } from "@/store/sceneStore";

export default function Home() {
  const applyToolCall = useSceneStore((s) => s.applyToolCall);
  return (
    <main className="flex h-screen w-screen">
      <div className="relative flex-1">
        <button
          onClick={() =>
            applyToolCall({
              name: "transform",
              input: { nodeId: "box-01", position: [2, 2, 0] },
            })
          }
        >
          Move
        </button>
        <button
          onClick={() =>
            applyToolCall({
              name: "set_material",
              input: { nodeId: "box-01", color: "#ff8800" },
            })
          }
        >
          Paint
        </button>
        <button
          onClick={() =>
            applyToolCall({
              name: "array",
              input: { nodeId: "box-01", count: 3, offset: [2, 0, 0] },
            })
          }
        >
          Array
        </button>
        <button
          onClick={() =>
            applyToolCall({
              name: "extrude",
              input: {
                id: `wall-${Date.now()}`,
                shape: [[0, 0], [2, 0], [2, 1], [0, 1]],
                depth: 0.2,
                color: "#aabbcc",
              },
            })
          }
        >
          Add wall
        </button>
        <button
          onClick={() =>
            applyToolCall({
              name: "boolean",
              input: {
                id: `cut-${Date.now()}`,
                operation: "intersect",
                a: "box-01",
                b: "sphere-01",
              },
            })
          }
        >
          Intersect box + sphere
        </button>
        <Viewport />
      </div>
      <ChatPanel />
    </main>
  );
}
