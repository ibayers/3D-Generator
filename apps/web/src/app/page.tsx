"use client";

import { useEffect, useState } from "react";
import ChatPanel from "../components/ChatPanel";
import SceneRail from "@/components/SceneRail";
import StatusStrip from "@/components/StatusStrip";
import Topbar from "@/components/Topbar";
import Viewport from "@/components/Viewport";
import { flattenNodes } from "@/components/geometry";
import { useChatStore } from "@/store/chatStore";
import { useSceneStore } from "@/store/sceneStore";
import { isEditableTarget, parseUndoShortcut } from "../lib/undoShortcuts";

type Pane = "view" | "chat" | "scene";

export default function Home() {
  const [pane, setPane] = useState<Pane>("view");
  const [railOpen, setRailOpen] = useState(false);

  const scene = useSceneStore((s) => s.scene);
  const triCount = useSceneStore((s) => s.triCount);
  const history = useSceneStore((s) => s.history);
  const sendPrompt = useChatStore((s) => s.sendPrompt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = parseUndoShortcut(e);
      if (!action || isEditableTarget(e.target)) return;
      const s = useSceneStore.getState();
      // undo()/redo() mengembalikan label snapshot (string) atau null bila stack kosong.
      const label = action === "undo" ? s.undo() : s.redo();
      if (label !== null) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const objCount = flattenNodes(scene.nodes).length;
  const appCls = ["app", railOpen ? "rail-open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={appCls} data-pane={pane}>
      <Topbar railOpen={railOpen} onToggleRail={() => setRailOpen((v) => !v)} />

      <div className="shell">
        <SceneRail />

        <main className="viewport">
          <div className="vp-canvas">
            <Viewport />
          </div>
          <div className="vp-stats num">
            {`${objCount} objek · ${triCount} tri · snapshot #${history.length}`}
          </div>
          <div className="vp-mode">orbit · klik objek untuk memilih</div>
          <div className="vp-gizmo">
            <svg
              width="72"
              height="62"
              viewBox="0 0 72 62"
              fill="none"
              stroke="oklch(78% 0.012 240)"
              strokeWidth="1.4"
            >
              <path d="M36 54 36 30M36 30 14 16M36 30l22-10" />
              <text
                x="33"
                y="60"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9"
                fill="oklch(78% 0.012 240)"
                stroke="none"
              >
                Y
              </text>
              <text
                x="4"
                y="14"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9"
                fill="oklch(78% 0.012 240)"
                stroke="none"
              >
                X
              </text>
              <text
                x="60"
                y="14"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9"
                fill="oklch(78% 0.012 240)"
                stroke="none"
              >
                Z
              </text>
            </svg>
          </div>
          {scene.nodes.length === 0 && (
            <div className="vp-empty">
              <h2>Adegan masih kosong</h2>
              <p>
                Semua yang kamu minta dieksekusi sebagai tool call terstruktur
                di engine lokal — scene graph JSON adalah sumber kebenaran.
              </p>
              <div className="chips">
                <button
                  className="chip"
                  onClick={() =>
                    void sendPrompt("Buat rumah 2 lantai dengan atap pelana")
                  }
                >
                  Buat rumah 2 lantai
                </button>
                <button
                  className="chip"
                  onClick={() => void sendPrompt("Buat jalan sepanjang 8 meter")}
                >
                  Buat jalan
                </button>
              </div>
            </div>
          )}
        </main>

        <ChatPanel />
      </div>

      <nav className="tabbar" aria-label="Navigasi panel">
        <button aria-current={pane === "view"} onClick={() => setPane("view")}>
          Viewport
        </button>
        <button aria-current={pane === "chat"} onClick={() => setPane("chat")}>
          Obrolan
        </button>
        <button aria-current={pane === "scene"} onClick={() => setPane("scene")}>
          Adegan
        </button>
      </nav>

      <StatusStrip />
    </div>
  );
}
