"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChatStore, type ChatEntry } from "../store/chatStore";
import {
  DEFAULT_MODELS,
  SUPPORTS_IMAGES,
  useLlmStore,
  type Provider,
} from "../store/llmStore";
import { useSceneStore } from "../store/sceneStore";

const PROVIDER_LABEL: Record<Provider, string> = {
  claude: "Claude",
  glm: "GLM (Z.ai)",
  n9router: "9Router",
  "glm-vision": "GLM Vision (Z.ai)",
};

const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
  claude: "sk-ant-…",
  glm: "kunci Z.ai…",
  n9router: "kunci 9Router…",
  "glm-vision": "kunci Z.ai standard…",
};

const STARTER_CHIPS = [
  "Buat rumah 2 lantai dengan atap pelana",
  "Buat jalan sepanjang 8 meter",
  "Ubah material objek pertama jadi hijau",
  "Buat pohon pinus setinggi 5 meter",
];

function paramValue(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function ToolCard({ entry }: { entry: Extract<ChatEntry, { kind: "tool" }> }) {
  const historyLen = useSceneStore((s) => s.history.length);
  const json = JSON.stringify(
    entry.error
      ? { tool: entry.name, params: entry.input, error: entry.error }
      : { tool: entry.name, params: entry.input },
    null,
    1,
  );

  return (
    <div className="tcard">
      <div className="tc-h">
        <span className={`dot ${entry.ok ? "ok" : "err"}`} />
        <span className="tc-tool">{entry.name}</span>
        <span className="tc-ms num">{`${entry.ms} ms`}</span>
      </div>
      <div className="tc-params">
        {Object.entries(entry.input).map(([k, v]) => (
          <span className="pv" key={k}>{`${k}: ${paramValue(v)}`}</span>
        ))}
      </div>
      {entry.error && <div className="tc-err">{entry.error}</div>}
      <details className="tc-json">
        <summary>json</summary>
        <pre>{json}</pre>
      </details>
      {entry.ok && (
        <div className="tc-foot">{`✓ berhasil · scene → snapshot #${historyLen}`}</div>
      )}
    </div>
  );
}

function EntryView({ entry }: { entry: ChatEntry }): ReactNode {
  switch (entry.kind) {
    case "user":
      return (
        <div className="msg-u">
          {entry.images?.[0] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="msg-thumb" src={entry.images[0]} alt="" />
          )}
          {entry.text}
        </div>
      );
    case "assistant":
      return <div className="msg-a">{entry.text}</div>;
    case "note":
      return <div className="note">{entry.text}</div>;
    case "error":
      return <div className="msg-err">{entry.text}</div>;
    case "tool":
      return <ToolCard entry={entry} />;
  }
}

export default function ChatPanel() {
  const entries = useChatStore((s) => s.entries);
  const status = useChatStore((s) => s.status);
  const sendPrompt = useChatStore((s) => s.sendPrompt);

  const provider = useLlmStore((s) => s.provider);
  const apiKey = useLlmStore((s) => s.apiKey);
  const hydrate = useLlmStore((s) => s.hydrateFromStorage);
  const setClaudeApiKey = useLlmStore((s) => s.setClaudeApiKey);
  const setGlmApiKey = useLlmStore((s) => s.setGlmApiKey);
  const setN9RouterApiKey = useLlmStore((s) => s.setN9RouterApiKey);
  const setGlmVisionApiKey = useLlmStore((s) => s.setGlmVisionApiKey);
  const clearClaudeApiKey = useLlmStore((s) => s.clearClaudeApiKey);
  const clearGlmApiKey = useLlmStore((s) => s.clearGlmApiKey);
  const clearN9RouterApiKey = useLlmStore((s) => s.clearN9RouterApiKey);
  const clearGlmVisionApiKey = useLlmStore((s) => s.clearGlmVisionApiKey);
  const model = useLlmStore((s) => s.models[provider]);
  const setModel = useLlmStore((s) => s.setModel);

  const scene = useSceneStore((s) => s.scene);

  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canAttach = SUPPORTS_IMAGES[provider];
  const [modelInput, setModelInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [entries.length, status]);

  const thinking = status === "thinking";

  const [elapsed, setElapsed] = useState(0);
  // Typed model text belongs to the provider it was typed for.
  useEffect(() => {
    setModelInput("");
  }, [provider]);
  useEffect(() => {
    if (status !== "thinking") {
      setElapsed(0);
      return;
    }
    const t0 = performance.now();
    const id = window.setInterval(
      () => setElapsed((performance.now() - t0) / 1000),
      100,
    );
    return () => window.clearInterval(id);
  }, [status]);
  const hasUserEntry = entries.some((e) => e.kind === "user");
  const tokenEstimate = Math.round(JSON.stringify(scene).length / 4);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      useChatStore.getState().pushNote("format gambar harus jpg/png/webp");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      useChatStore.getState().pushNote("gambar maks 5 MB — kecilkan dulu");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setPendingImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    const image = pendingImage;
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendPrompt(text, image ? [image] : undefined);
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    if (provider === "glm") setGlmApiKey(trimmed);
    else if (provider === "n9router") setN9RouterApiKey(trimmed);
    else if (provider === "glm-vision") setGlmVisionApiKey(trimmed);
    else setClaudeApiKey(trimmed);
    setKeyInput("");
  };

  const handleClearKey = () => {
    if (provider === "glm") clearGlmApiKey();
    else if (provider === "n9router") clearN9RouterApiKey();
    else if (provider === "glm-vision") clearGlmVisionApiKey();
    else clearClaudeApiKey();
  };

  return (
    <aside className="chat" aria-label="Chat asisten adegan">
      <div className="chat-head">
        <span className="dotlive" />
        <b>Asisten Adegan</b>
        <span className="provider-chip num">
          {`${model} · tool-calling`}
        </span>
      </div>

      <div className="keyform">
        <div className="keyrow">
          <input
            className="num"
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={`model · default ${DEFAULT_MODELS[provider]}`}
            aria-label={`Override model ${PROVIDER_LABEL[provider]}`}
            style={{ flex: 1 }}
          />
          <button
            className="ghost"
            type="button"
            disabled={thinking || !modelInput.trim()}
            onClick={() => {
              setModel(provider, modelInput.trim());
              setModelInput("");
            }}
          >
            set model
          </button>
          {model !== DEFAULT_MODELS[provider] && (
            <button
              className="ghost"
              type="button"
              disabled={thinking}
              onClick={() => setModel(provider, "")}
            >
              reset
            </button>
          )}
        </div>
      </div>

      {!apiKey && (
        <form className="keyform" onSubmit={handleSaveKey}>
          <small>
            Tempel API key {PROVIDER_LABEL[provider]} — disimpan lokal di
            browser (localStorage), hanya dikirim ke endpoint provider.
          </small>
          <div className="keyrow">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={PROVIDER_PLACEHOLDER[provider]}
              aria-label={`API key ${PROVIDER_LABEL[provider]}`}
            />
            <button
              className="btn-primary"
              type="submit"
              disabled={!keyInput.trim()}
            >
              Simpan
            </button>
          </div>
        </form>
      )}

      {apiKey && (
        <div className="keyform">
          <div className="keyrow" style={{ alignItems: "center" }}>
            <small style={{ flex: 1 }}>
              key {PROVIDER_LABEL[provider]} aktif — tersimpan lokal.
            </small>
            <button className="ghost" onClick={handleClearKey}>
              hapus
            </button>
          </div>
        </div>
      )}

      <div className="thread" ref={threadRef}>
        {entries.length === 0 && (
          <>
            <div className="msg-a">
              Halo! Aku asisten adegan — perintahmu dieksekusi sebagai{" "}
              <b>tool call</b> terstruktur di engine lokal, bukan generate mesh.
              Scene graph JSON jadi sumber kebenaran; semua revisi bersifat
              non-destruktif.
            </div>
            <div className="note">
              provider nyata · respons langsung dari adapter LLM
            </div>
          </>
        )}
        {entries.map((entry, i) => (
          <EntryView key={i} entry={entry} />
        ))}
        {thinking && (
          <div className="msg-a think">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            <span>{`menyusun rencana… ${elapsed.toFixed(1)}s`}</span>
          </div>
        )}
      </div>

      {!hasUserEntry && (
        <div className="chip-row">
          {STARTER_CHIPS.map((c) => (
            <button
              className="chip"
              key={c}
              disabled={thinking}
              onClick={() => void sendPrompt(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="ctx num">
        {`scene JSON ≈ ${tokenEstimate} token · dikirim penuh (v1)`}
      </div>

      {canAttach && pendingImage && (
        <div className="attach-chip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage} alt="pratinjau lampiran" />
          <button
            type="button"
            className="ghost"
            onClick={() => setPendingImage(null)}
            aria-label="Hapus lampiran gambar"
          >
            hapus
          </button>
        </div>
      )}

      <div className="composer">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {canAttach && (
          <button
            type="button"
            className="ghost attach"
            onClick={() => fileRef.current?.click()}
            disabled={thinking}
            title="Lampirkan gambar (provider vision)"
            aria-label="Lampirkan gambar"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 1 1 5.66 5.66l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        )}
        <textarea
          ref={textareaRef}
          className="chat-input"
          rows={1}
          value={input}
          disabled={thinking}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Minta aset, ubah material, atau susun ulang adegan… (Enter kirim · Shift+Enter baris baru)"
          aria-label="Prompt untuk asisten"
        />
        <button
          className="send"
          onClick={submit}
          disabled={thinking || !input.trim()}
          aria-label="Kirim prompt"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M4 12 20 4l-7 16-2.2-6.8L4 12z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
