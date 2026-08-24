import { beforeAll, describe, expect, it } from "vitest";
import {
  createClaudeAdapter,
  createGLMAdapter,
  createN9RouterAdapter,
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  type LLMAdapter,
} from "../src/index";
import { EVAL_CASES, buildUserMessage } from "../src/eval/cases";
import { evaluateCase, score, type CaseResult } from "../src/eval/match";

// PRD §11.2: run when SYSTEM_PROMPT or tool schemas change, with a real key.
//   EVAL_PROVIDER=claude|glm|n9router (default claude)
//   EVAL_API_KEY=...  EVAL_MODEL=... (optional override)
// Suite is SKIPPED (green, zero cost) when EVAL_API_KEY is unset.
const RUN = !!process.env.EVAL_API_KEY;
const PROVIDER = (process.env.EVAL_PROVIDER ?? "claude") as
  | "claude"
  | "glm"
  | "n9router";
const MODEL_DEFAULTS: Record<typeof PROVIDER, string> = {
  claude: "claude-sonnet-4-6",
  glm: "glm-4.6",
  n9router: "glm/glm-5.1",
};

const results: CaseResult[] = [];
let adapter: LLMAdapter;

describe.skipIf(!RUN)(`live tool-selection eval (${RUN ? PROVIDER : "skipped"})`, () => {
  beforeAll(() => {
    const apiKey = process.env.EVAL_API_KEY as string;
    const model = process.env.EVAL_MODEL ?? MODEL_DEFAULTS[PROVIDER];
    const tools = TOOL_DEFINITIONS;
    adapter =
      PROVIDER === "claude"
        ? createClaudeAdapter({ apiKey, model, tools })
        : PROVIDER === "glm"
          ? createGLMAdapter({ apiKey, model, tools })
          : createN9RouterAdapter({ apiKey, model, tools });
  });

  for (const c of EVAL_CASES) {
    it(
      `${c.id} → ${c.expectedTool}`,
      async () => {
        const result = await adapter.chat(
          [{ role: "user", content: buildUserMessage(c) }],
          SYSTEM_PROMPT,
        );
        const r = evaluateCase(c, result.toolCalls);
        results.push(r);
        if (!r.pass) {
          console.error(
            `[eval] ${c.id} FAIL (${r.reason}) got=${r.gotTool ?? "-"} ` +
              `calls=${JSON.stringify(result.toolCalls.map((t) => t.name))}`,
          );
        }
        expect(r.pass).toBe(true);
      },
      120_000,
    );
  }

  it("summary: accuracy >= 0.75 (7 of 9)", () => {
    const s = score(results);
    console.table(
      results.map((r) => ({ case: r.caseId, pass: r.pass ? "PASS" : "FAIL", got: r.gotTool ?? r.reason })),
    );
    console.log(`[eval] ${PROVIDER}: ${s.passed}/${s.total} (accuracy ${(s.accuracy * 100).toFixed(0)}%)`);
    expect(s.total).toBe(EVAL_CASES.length);
    expect(s.accuracy).toBeGreaterThanOrEqual(0.75);
  });
});
