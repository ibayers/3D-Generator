"use client";

import { useSceneStore } from "../store/sceneStore";
import { useChatStore } from "../store/chatStore";
import { useLlmStore, type Provider } from "../store/llmStore";

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "claude", label: "Claude · anthropic" },
  { value: "glm", label: "GLM · openai-compat" },
  { value: "n9router", label: "9Router · lokal-proxy" },
];

interface TopbarProps {
  railOpen: boolean;
  onToggleRail: () => void;
}

export default function Topbar({ railOpen, onToggleRail }: TopbarProps) {
  const scene = useSceneStore((s) => s.scene);
  const history = useSceneStore((s) => s.history);
  const future = useSceneStore((s) => s.future);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const requestExport = useSceneStore((s) => s.requestExport);

  const provider = useLlmStore((s) => s.provider);
  const setProvider = useLlmStore((s) => s.setProvider);
  const pushNote = useChatStore((s) => s.pushNote);

  const lastUndo = history[history.length - 1];
  const lastRedo = future[future.length - 1];

  const handleUndo = () => {
    const label = undo();
    if (label) pushNote(`snapshot dipulihkan (${label})`);
  };

  const handleRedo = () => {
    const label = redo();
    if (label) pushNote(`snapshot diterapkan ulang (${label})`);
  };

  const handleExport = () => {
    requestExport();
    pushNote("export_glb · berjalan…");
  };

  return (
    <header className="topbar">
      <button
        className="ibtn railtoggle"
        title="Panel adegan"
        aria-label="Buka panel adegan"
        aria-pressed={railOpen}
        onClick={onToggleRail}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="brand">
        <svg
          className="mk"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M12 2.6 20 7v10l-8 4.4L4 17V7l8-4.4z" />
          <path d="M12 12 20 7M12 12v9.4M12 12 4 7" />
        </svg>
        <span className="word">Asset Studio</span>
        <span className="sub">AI · PROSEDURAL</span>
      </div>

      <span className="scene-meta num">
        {`adegan.scene · snapshot #${history.length}`}
      </span>

      <div className="top-actions">
        <button
          className="ibtn"
          title={
            lastUndo ? `Urungkan ${lastUndo.label}` : "Urungkan (snapshot)"
          }
          aria-label="Urungkan"
          disabled={!lastUndo}
          onClick={handleUndo}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>

        <button
          className="ibtn"
          title={lastRedo ? `Ulangi ${lastRedo.label}` : "Ulangi (snapshot)"}
          aria-label="Ulangi"
          disabled={!lastRedo}
          onClick={handleRedo}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H10a6 6 0 0 0 0 12h3" />
          </svg>
        </button>

        <label className="prov" title="Provider LLM — adapter terpadu">
          <span>LLM</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            aria-label="Pilih provider LLM"
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn-primary"
          onClick={handleExport}
          disabled={scene.nodes.length === 0}
          title={
            scene.nodes.length === 0
              ? "Adegan kosong — buat objek dulu"
              : "Ekspor scene ke GLB"
          }
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Ekspor GLB
        </button>
      </div>
    </header>
  );
}
