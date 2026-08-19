// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isEditableTarget, parseUndoShortcut } from "./undoShortcuts";

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("parseUndoShortcut", () => {
  it("maps ctrl/cmd+z to undo", () => {
    expect(parseUndoShortcut(keyEvent({ key: "z", ctrlKey: true }))).toBe("undo");
    expect(parseUndoShortcut(keyEvent({ key: "z", metaKey: true }))).toBe("undo");
    expect(parseUndoShortcut(keyEvent({ key: "Z", shiftKey: false, ctrlKey: true }))).toBe("undo");
  });

  it("maps ctrl/cmd+shift+z and ctrl/cmd+y to redo", () => {
    expect(parseUndoShortcut(keyEvent({ key: "z", ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(parseUndoShortcut(keyEvent({ key: "z", metaKey: true, shiftKey: true }))).toBe("redo");
    expect(parseUndoShortcut(keyEvent({ key: "y", ctrlKey: true }))).toBe("redo");
  });

  it("returns null for plain z, other keys, and alt-modified combos", () => {
    expect(parseUndoShortcut(keyEvent({ key: "z" }))).toBeNull();
    expect(parseUndoShortcut(keyEvent({ key: "x", ctrlKey: true }))).toBeNull();
    expect(parseUndoShortcut(keyEvent({ key: "z", ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("returns true for input and textarea", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
  });

  it("returns false for plain divs and buttons", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
  });
});
