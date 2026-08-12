"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { useLlmStore, type Provider } from "../store/llmStore";

const PROVIDER_LABEL: Record<Provider, string> = {
  claude: "Claude (Anthropic)",
  glm: "GLM (Z.ai)",
};

const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
  claude: "sk-ant-...",
  glm: "zai-... (your Z.ai api key)",
};

export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const lastError = useChatStore((s) => s.lastError);
  const sendPrompt = useChatStore((s) => s.sendPrompt);

  const provider = useLlmStore((s) => s.provider);
  const apiKey = useLlmStore((s) => s.apiKey);
  const setProvider = useLlmStore((s) => s.setProvider);
  const setClaudeApiKey = useLlmStore((s) => s.setClaudeApiKey);
  const setGlmApiKey = useLlmStore((s) => s.setGlmApiKey);
  const clearClaudeApiKey = useLlmStore((s) => s.clearClaudeApiKey);
  const clearGlmApiKey = useLlmStore((s) => s.clearGlmApiKey);
  const hydrate = useLlmStore((s) => s.hydrateFromStorage);

  // Read both keys at render time so the key form knows whether the active
  // provider has a key stored.
  const claudeApiKey = useLlmStore((s) => s.claudeApiKey);
  const glmApiKey = useLlmStore((s) => s.glmApiKey);

  const [input, setInput] = useState("");
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const prompt = input;
    setInput("");
    await sendPrompt(prompt);
  };

  const hasActiveKey = Boolean(apiKey);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    if (provider === "glm") {
      setGlmApiKey(trimmed);
    } else {
      setClaudeApiKey(trimmed);
    }
    setKeyInput("");
  };

  const handleClearKey = () => {
    if (provider === "glm") {
      clearGlmApiKey();
    } else {
      clearClaudeApiKey();
    }
  };

  const handleProviderChange = (next: Provider) => {
    if (next !== provider) setProvider(next);
  };

  return (
    <aside
      style={{
        width: 360,
        padding: 16,
        borderLeft: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#0e0e10",
        color: "#eee",
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>AI Studio</h2>
        <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
          {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleProviderChange(p)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: provider === p ? "1px solid #4488ff" : "1px solid #333",
                background: provider === p ? "#1a2a44" : "transparent",
                color: provider === p ? "#eee" : "#888",
                cursor: "pointer",
              }}
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {!hasActiveKey ? (
        <form
          onSubmit={handleSaveKey}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <label style={{ fontSize: 12, color: "#aaa" }}>
            {PROVIDER_LABEL[provider]} API key (stored in localStorage)
          </label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={PROVIDER_PLACEHOLDER[provider]}
            style={{
              padding: 8,
              borderRadius: 4,
              border: "1px solid #333",
              background: "#1a1a1d",
              color: "#eee",
            }}
          />
          <button
            type="submit"
            disabled={!keyInput.trim()}
            style={{
              padding: 8,
              borderRadius: 4,
              border: "none",
              background: keyInput.trim() ? "#4488ff" : "#333",
              color: "white",
              cursor: keyInput.trim() ? "pointer" : "default",
            }}
          >
            Save {PROVIDER_LABEL[provider]} key
          </button>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <div style={{ color: "#888" }}>
            {PROVIDER_LABEL[provider]} key active
            {provider === "claude" && glmApiKey && " · GLM key also saved"}
            {provider === "glm" && claudeApiKey && " · Claude key also saved"}
          </div>
          <button
            type="button"
            onClick={handleClearKey}
            style={{
              padding: 6,
              borderRadius: 4,
              border: "1px solid #333",
              background: "transparent",
              color: "#aaa",
              cursor: "pointer",
              fontSize: 12,
              alignSelf: "flex-start",
            }}
          >
            Clear {PROVIDER_LABEL[provider]} key
          </button>
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          border: "1px solid #222",
          borderRadius: 4,
          background: "#131316",
          fontSize: 13,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: hasActiveKey ? "#888" : "#ff9966" }}>
            {hasActiveKey
              ? "Ask the assistant to build something."
              : `⬆ Paste your ${PROVIDER_LABEL[provider]} API key above first, then type a prompt below.`}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              textAlign: m.role === "assistant" ? "left" : "right",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 8,
                background: m.role === "assistant" ? "#1f1f24" : "#335577",
                maxWidth: "85%",
              }}
            >
              {m.content || "(tool call)"}
            </span>
          </div>
        ))}
        {status === "thinking" && (
          <div style={{ color: "#888", fontStyle: "italic" }}>Thinking…</div>
        )}
        {status === "error" && lastError && (
          <div style={{ color: "#ff6666" }}>Error: {lastError}</div>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            hasActiveKey
              ? "Build a house at origin"
              : `Type after pasting your ${PROVIDER_LABEL[provider]} key above`
          }
          disabled={status === "thinking"}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 4,
            border: "1px solid #333",
            background: "#1a1a1d",
            color: "#eee",
          }}
        />
        <button
          type="submit"
          disabled={!hasActiveKey || status === "thinking" || !input.trim()}
          title={!hasActiveKey ? "Paste your API key above first" : undefined}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background:
              !hasActiveKey || status === "thinking" || !input.trim()
                ? "#333"
                : "#4488ff",
            color: "white",
            cursor:
              !hasActiveKey || status === "thinking" || !input.trim()
                ? "not-allowed"
                : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
