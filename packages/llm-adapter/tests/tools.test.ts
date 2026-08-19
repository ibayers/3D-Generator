import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, SYSTEM_PROMPT } from "../src/tools";

describe("TOOL_DEFINITIONS", () => {
  const house = TOOL_DEFINITIONS.find((t) => t.name === "create_house");
  it("includes create_house", () => expect(house).toBeDefined());

  it("create_house exposes floors and roofStyle, requires only id+position", () => {
    if (!house) throw new Error("missing create_house");
    expect(Object.keys(house.input_schema.properties)).toContain("floors");
    expect(Object.keys(house.input_schema.properties)).toContain("roofStyle");
    expect(Object.keys(house.input_schema.properties)).toContain("roofHeight");
    expect(house.input_schema.required).toEqual(["id", "position"]);
  });
});

describe("SYSTEM_PROMPT", () => {
  it("documents the tool-result feedback loop and round cap", () => {
    expect(SYSTEM_PROMPT).toMatch(/result in the next message/);
    expect(SYSTEM_PROMPT).toMatch(/at most \d+ tool rounds/);
  });
});
