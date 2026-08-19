import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});

import { useLlmStore, DEFAULT_MODELS } from "./llmStore";

beforeEach(() => {
  store.clear();
  useLlmStore.setState({
    provider: "claude",
    claudeApiKey: "",
    glmApiKey: "",
    n9routerApiKey: "",
    apiKey: "",
    models: { ...DEFAULT_MODELS },
  });
});

describe("llmStore models", () => {
  it("defaults to DEFAULT_MODELS", () => {
    expect(useLlmStore.getState().models.glm).toBe(DEFAULT_MODELS.glm);
  });

  it("setModel persists per provider and updates state", () => {
    useLlmStore.getState().setModel("glm", "glm-4.6");
    expect(useLlmStore.getState().models.glm).toBe("glm-4.6");
    expect(store.get("asset-studio:model:glm")).toBe("glm-4.6");
  });

  it("setModel with empty string reverts to default and clears storage", () => {
    useLlmStore.getState().setModel("glm", "glm-4.6");
    useLlmStore.getState().setModel("glm", "");
    expect(useLlmStore.getState().models.glm).toBe(DEFAULT_MODELS.glm);
    expect(store.has("asset-studio:model:glm")).toBe(false);
  });

  it("hydrate reads persisted models with defaults for the rest", () => {
    store.set("asset-studio:model:claude", "claude-haiku-4-5");
    useLlmStore.getState().hydrateFromStorage();
    expect(useLlmStore.getState().models.claude).toBe("claude-haiku-4-5");
    expect(useLlmStore.getState().models.n9router).toBe(DEFAULT_MODELS.n9router);
  });
});
