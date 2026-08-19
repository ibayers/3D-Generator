/** Shared adapter tuning — see docs/superpowers/plans/2026-08-19-llm-3d-end-to-end.md Task 4. */
export const ADAPTER_DEFAULTS = {
  /** Per-request timeout. SDKs otherwise stall for minutes on dead endpoints. */
  timeoutMs: 60_000,
  /** SDK-level retries disabled: the orchestrator owns retry policy. */
  sdkMaxRetries: 0,
  /** Tool-call JSON needs headroom; 512 truncated GLM arguments. */
  maxTokens: 1024,
} as const;
