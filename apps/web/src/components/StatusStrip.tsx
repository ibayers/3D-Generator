"use client";

import { useSceneStore } from "../store/sceneStore";
import { useChatStore } from "../store/chatStore";

export default function StatusStrip() {
  const lastAction = useSceneStore((s) => s.lastAction);
  const history = useSceneStore((s) => s.history);
  const resetScene = useSceneStore((s) => s.reset);
  const resetChat = useChatStore((s) => s.reset);

  const handleReset = () => {
    if (!window.confirm("Reset sesi — hapus adegan & transkrip?")) return;
    resetScene();
    resetChat();
  };

  return (
    <footer className="strip num">
      <span className="strip-action">{lastAction}</span>
      <span className="r">
        <span className="strip-right">
          {`snapshot #${history.length} · ${history.length} riwayat`}
        </span>
        <button className="ghost" onClick={handleReset}>
          reset sesi
        </button>
      </span>
    </footer>
  );
}
