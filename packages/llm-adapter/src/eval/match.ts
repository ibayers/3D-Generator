import type { EvalCase } from "./cases";
import type { ToolCall } from "../types";

export interface CaseResult {
  caseId: string;
  pass: boolean;
  gotTool?: string;
  reason?: string;
}

/** First tool call must match expectedTool (and optional arg predicate). */
export function evaluateCase(c: EvalCase, toolCalls: ToolCall[]): CaseResult {
  const first = toolCalls[0];
  if (!first) return { caseId: c.id, pass: false, reason: "no tool call" };
  if (first.name !== c.expectedTool) {
    return { caseId: c.id, pass: false, gotTool: first.name, reason: "wrong tool" };
  }
  if (c.expectArgs && !c.expectArgs(first.input)) {
    return { caseId: c.id, pass: false, gotTool: first.name, reason: "args mismatch" };
  }
  return { caseId: c.id, pass: true, gotTool: first.name };
}

export function score(results: CaseResult[]): {
  passed: number;
  total: number;
  accuracy: number;
} {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  return { passed, total, accuracy: total === 0 ? 0 : passed / total };
}
