import { describe, expect, it } from "vitest";
import { EVAL_CASES, buildUserMessage } from "../src/eval/cases";
import { evaluateCase, score, type CaseResult } from "../src/eval/match";
import type { ToolCall } from "../src/types";

const tc = (name: string, input: Record<string, unknown>): ToolCall => ({
  id: "x",
  name,
  input,
});

describe("EVAL_CASES", () => {
  it("has 9 cases with unique ids and non-empty prompts", () => {
    expect(EVAL_CASES).toHaveLength(9);
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(9);
    for (const c of EVAL_CASES) expect(c.prompt.length).toBeGreaterThan(0);
  });

  it("expected tools all exist in the real ToolName catalog", () => {
    const known = [
      "extrude",
      "boolean",
      "array",
      "transform",
      "set_material",
      "create_house",
      "create_road",
      "create_tree",
      "create_character",
    ];
    for (const c of EVAL_CASES) expect(known).toContain(c.expectedTool);
  });

  it("buildUserMessage appends scene JSON only when present", () => {
    const withScene = EVAL_CASES.find((c) => c.sceneJson);
    const without = EVAL_CASES.find((c) => !c.sceneJson);
    expect(withScene && buildUserMessage(withScene)).toContain("Current scene JSON:");
    expect(without && buildUserMessage(without)).not.toContain("Current scene JSON:");
  });
});

describe("evaluateCase", () => {
  const caseMat = {
    id: "mat",
    prompt: "p",
    expectedTool: "set_material",
    expectArgs: (input: Record<string, unknown>) =>
      typeof input.color === "string" && /^#[0-9a-fA-F]{6}$/.test(input.color),
  };

  it("passes on tool + args match", () => {
    const r = evaluateCase(caseMat, [tc("set_material", { nodeId: "roof-01", color: "#00ff00" })]);
    expect(r.pass).toBe(true);
    expect(r.gotTool).toBe("set_material");
  });

  it("fails on wrong tool, empty calls, and bad args", () => {
    expect(evaluateCase(caseMat, [tc("transform", {})]).pass).toBe(false);
    expect(evaluateCase(caseMat, []).pass).toBe(false);
    expect(evaluateCase(caseMat, [tc("set_material", { nodeId: "r", color: "green" })]).pass).toBe(false);
  });

  it("reports gotTool for diagnostics", () => {
    const r = evaluateCase(caseMat, [tc("extrude", {})]);
    expect(r.gotTool).toBe("extrude");
  });
});

describe("score", () => {
  it("computes accuracy over results", () => {
    const results: CaseResult[] = [
      { caseId: "a", pass: true },
      { caseId: "b", pass: false },
      { caseId: "c", pass: true },
    ];
    const s = score(results);
    expect(s).toEqual({ passed: 2, total: 3, accuracy: 2 / 3 });
  });
});
