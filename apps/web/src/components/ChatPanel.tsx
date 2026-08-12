"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { useLlmStore } from "../store/llmStore";

export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const lastError = useChatStore((s) => s.lastError);
  const sendPrompt = useChatStore((s) => s.sendPrompt);

  const apiKey = useLlmStore((s) => s.apiKey);
  const setApiKey = useLlmStore((s) => s.setApiKey);
  const hydrate = useLlmStore((s) => s.hydrateFromStorage);

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
      <h2 style={{ margin: 0, fontSize: 16 }}>AI Studio</h2>

      {!apiKey ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApiKey(keyInput.trim());
            setKeyInput("");
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <label style={{ fontSize: 12, color: "#aaa" }}>
            Anthropic API key (stored in localStorage)
          </label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-..."
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
            style={{
              padding: 8,
              borderRadius: 4,
              border: "none",
              background: "#4488ff",
              color: "white",
              cursor: "pointer",
            }}
          >
            Save key
          </button>
        </form>
      ) : (
        <button
          onClick={() => useLlmStore.getState().clearApiKey()}
          style={{
            padding: 6,
            borderRadius: 4,
            border: "1px solid #333",
            background: "transparent",
            color: "#aaa",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Clear API key
        </button>
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
          <div style={{ color: "#666" }}>
            Ask the assistant to build something.
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
          placeholder="Build a house at origin"
          disabled={!apiKey || status === "thinking"}
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
          disabled={!apiKey || status === "thinking" || !input.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: "#4488ff",
            color: "white",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
