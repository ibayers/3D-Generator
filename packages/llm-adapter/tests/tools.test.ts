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
    expect(house.input_schema.properties.size.minItems).toBe(3);
    expect(house.input_schema.properties.roofHeight.exclusiveMinimum).toBe(0);
  });
});

describe("create_tree definition", () => {
  const tree = TOOL_DEFINITIONS.find((t) => t.name === "create_tree");

  it("exists with required fields", () => {
    expect(tree).toBeDefined();
    expect(tree?.description).toContain("tree");
    expect(tree?.input_schema.required).toEqual(["id", "position"]);
  });

  it("documents type enum and height", () => {
    const props = tree?.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props.type?.enum).toEqual(["conifer", "broadleaf"]);
    expect(props.height).toBeDefined();
  });
});

describe("create_character definition", () => {
  const character = TOOL_DEFINITIONS.find((t) => t.name === "create_character");

  it("exists with required fields", () => {
    expect(character).toBeDefined();
    expect(character?.description).toContain("character");
    expect(character?.input_schema.required).toEqual(["id", "position"]);
  });

  it("documents build enum and height", () => {
    const props = character?.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.build?.enum).toEqual(["slim", "regular", "stocky"]);
    expect(props.height).toBeDefined();
  });
});

describe("SYSTEM_PROMPT", () => {
  it("documents the tool-result feedback loop and round cap", () => {
    expect(SYSTEM_PROMPT).toMatch(/result in the next message/);
    expect(SYSTEM_PROMPT).toMatch(/at most \d+ tool rounds/);
  });

  it("SYSTEM_PROMPT mentions create_tree", () => {
    expect(SYSTEM_PROMPT).toContain("create_tree");
  });

  it("SYSTEM_PROMPT mentions create_character", () => {
    expect(SYSTEM_PROMPT).toContain("create_character");
  });
});
