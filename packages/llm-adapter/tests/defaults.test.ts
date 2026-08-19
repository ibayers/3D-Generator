import { describe, it, expect } from "vitest";
import { ADAPTER_DEFAULTS } from "../src/defaults";

describe("ADAPTER_DEFAULTS", () => {
  it("caps request latency and disables silent SDK retries", () => {
    expect(ADAPTER_DEFAULTS.timeoutMs).toBe(60_000);
    expect(ADAPTER_DEFAULTS.sdkMaxRetries).toBe(0);
  });
  it("gives every adapter enough tokens for tool-call JSON", () => {
    expect(ADAPTER_DEFAULTS.maxTokens).toBeGreaterThanOrEqual(1024);
  });
});
