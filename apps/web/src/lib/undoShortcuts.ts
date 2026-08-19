export type UndoAction = "undo" | "redo";

/** Ctrl/Cmd+Z → undo · Ctrl/Cmd+Shift+Z atau Ctrl/Cmd+Y → redo · lainnya null. */
export function parseUndoShortcut(e: KeyboardEvent): UndoAction | null {
  const cmd = e.ctrlKey || e.metaKey;
  if (!cmd || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "y") return "redo";
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  return null;
}

/** True bila fokus sedang di elemen form — shortcut tidak boleh mencuri input. */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable === true
  );
}
