# M4 — Undo/History + Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lengkapi M4 (undo/history + hierarchy) — tambahkan `deleteNode` di sceneStore dengan pencatatan history yang sama seperti tool LLM, tombol hapus di panel hierarchy SceneRail, dan shortcut keyboard undo/redo global.

**Architecture:** Audit menunjukkan sebagian besar M4 SUDAH ADA: Topbar punya tombol undo/redo + counter snapshot, SceneRail sudah panel hierarchy (tree + children + selection + eye-toggle + collapse), sceneStore punya stack history/future. Yang hilang: (a) `deleteNode` — edit manual dari UI belum masuk history (PRD §8: "Manual edit dari panel UI … dan prompt-edit dari LLM harus mencatat ke history yang sama"), (b) tombol hapus di hierarchy, (c) shortcut keyboard. Tiga gap ini diisi dengan TDD, satu task per gap + task verifikasi.

**Tech Stack:** Zustand 5 (sceneStore), React 19 + Next 16 (page.tsx wiring), Vitest 2.1.9 + jsdom (baru, untuk keyboard event helper), TypeScript strict.

---

## Audit — apa yang SUDAH ada (jangan dibuat ulang)

| Kapabilitas M4 | Status | Lokasi |
|---|---|---|
| Tombol undo/redo + tooltip + disabled state | ✅ ada | `apps/web/src/components/Topbar.tsx` (handleUndo/handleRedo, pushNote "snapshot dipulihkan/diterapkan ulang") |
| Counter snapshot (`snapshot #N`) | ✅ ada | Topbar `adegan.scene · snapshot #${history.length}` |
| Panel hierarchy: tree + children + selection | ✅ ada | `apps/web/src/components/SceneRail.tsx` (renderNode/renderChild, select) |
| Sembunyikan objek (eye toggle, hiddenIds) | ✅ ada | SceneRail eyebtn → sceneStore.toggleHidden |
| Collapse node + tutup semua | ✅ ada | SceneRail collapsed Set + collapseAll |
| Stack history/future per snapshot | ✅ ada | `apps/web/src/store/sceneStore.ts` (applyToolCall push, undo/redo pop) |
| **deleteNode** (hapus objek → history) | ❌ TIDAK ADA | — |
| **Tombol hapus di hierarchy** | ❌ TIDAK ADA | — |
| **Shortcut keyboard undo/redo** | ❌ TIDAK ADA | — |

---

### Task 1: sceneStore.deleteNode — hapus objek dengan pencatatan history

**Files:**
- Modify: `apps/web/src/store/sceneStore.ts`
- Create: `apps/web/src/store/sceneStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Buat `apps/web/src/store/sceneStore.test.ts` (file baru — belum ada test untuk store ini; ikuti konvensi reset via `useSceneStore.setState` seperti chatStore.test.ts):

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { SceneNode } from "@asset-studio/scene-engine";
import { useSceneStore } from "./sceneStore";

const node = (id: string): SceneNode => ({
  id,
  type: "box",
  name: id,
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  parameters: {},
  children: [],
});

beforeEach(() => {
  useSceneStore.setState({
    scene: { version: "0.1", nodes: [node("a"), node("b")] },
    history: [],
    future: [],
    selectedId: null,
    hiddenIds: [],
    lastAction: "",
    triCount: 0,
    exportTick: 0,
  });
});
```

```typescript
describe("deleteNode", () => {
  it("removes the node and records history snapshot", () => {
    const before = useSceneStore.getState().history.length;
    const sceneBefore = useSceneStore.getState().scene;
    const target = sceneBefore.nodes[0]!;

    const ok = useSceneStore.getState().deleteNode(target.id);

    expect(ok).toBe(true);
    const s = useSceneStore.getState();
    expect(s.scene.nodes.some((n) => n.id === target.id)).toBe(false);
    expect(s.scene.nodes.length).toBe(sceneBefore.nodes.length - 1);
    expect(s.history.length).toBe(before + 1);
    expect(s.history.at(-1)?.scene).toBe(sceneBefore);
    expect(s.history.at(-1)?.label).toBe(`delete:${target.id}`);
    expect(s.future).toHaveLength(0);
  });

  it("clears selection and hidden entry for the deleted node", () => {
    const target = useSceneStore.getState().scene.nodes[0]!;
    useSceneStore.getState().select(target.id);
    useSceneStore.getState().toggleHidden(target.id);

    useSceneStore.getState().deleteNode(target.id);

    const s = useSceneStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.hiddenIds).not.toContain(target.id);
  });

  it("keeps selection when deleting a different node", () => {
    const [keep, drop] = useSceneStore.getState().scene.nodes;
    useSceneStore.getState().select(keep!.id);

    useSceneStore.getState().deleteNode(drop!.id);

    expect(useSceneStore.getState().selectedId).toBe(keep!.id);
  });

  it("returns false for unknown id and does not touch history", () => {
    const before = useSceneStore.getState().history.length;

    const ok = useSceneStore.getState().deleteNode("nope");

    expect(ok).toBe(false);
    expect(useSceneStore.getState().history.length).toBe(before);
  });

  it("undo restores the deleted node", () => {
    const target = useSceneStore.getState().scene.nodes[0]!;
    useSceneStore.getState().deleteNode(target.id);

    const label = useSceneStore.getState().undo();

    expect(label).toBe(`delete:${target.id}`);
    expect(
      useSceneStore.getState().scene.nodes.some((n) => n.id === target.id),
    ).toBe(true);
  });
});
```

Catatan: seed memakai 2 node hand-built (`"a"`, `"b"`) — test di bawah mendestrukturisasi `[keep, drop]` dari `scene.nodes`, urutan ini yang menentukan. Commit test mengikuti Step 5.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @asset-studio/web test -- --run sceneStore`
Expected: FAIL — `useSceneStore.getState().deleteNode is not a function`

- [ ] **Step 3: Write minimal implementation**

Di `apps/web/src/store/sceneStore.ts`, tambahkan ke interface `SceneState` (setelah `toggleHidden`):

```typescript
deleteNode: (id: string) => boolean;
```

Dan implementasi di dalam `create<SceneState>()(...)` (setelah `toggleHidden`):

```typescript
deleteNode: (id) => {
  const { scene, history, future, selectedId, hiddenIds } = get();
  if (!scene.nodes.some((n) => n.id === id)) return false;
  set({
    scene: { ...scene, nodes: scene.nodes.filter((n) => n.id !== id) },
    history: [...history, { scene, label: `delete:${id}` }],
    future: [],
    selectedId: selectedId === id ? null : selectedId,
    hiddenIds: hiddenIds.filter((h) => h !== id),
    lastAction: `delete:${id} · snapshot #${history.length + 1}`,
  });
  return true;
},
```

Kontrak history SAMA dengan `applyToolCall`: push snapshot scene lama + label, kosongkan `future`. Ini PRD §8 — manual edit dan prompt-edit mencatat ke history yang sama.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/web test -- --run sceneStore`
Expected: PASS semua (existing + 5 baru)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/sceneStore.ts apps/web/src/store/sceneStore.test.ts
git commit -m "feat(web): deleteNode records manual deletes into shared history"
```

---

### Task 2: Tombol hapus di SceneRail (hierarchy)

**Files:**
- Modify: `apps/web/src/components/SceneRail.tsx`
- Test: manual (visual) — tidak ada test unit untuk ikon; perilaku store sudah teruji di Task 1

- [ ] **Step 1: Tambahkan TrashIcon**

Setelah `EyeOffIcon` di SceneRail.tsx:

```tsx
const TrashIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
```

- [ ] **Step 2: Wire delete button di renderNode**

Ambil `deleteNode` dan `pushNote` dari store di komponen `SceneRail`:

```tsx
const deleteNode = useSceneStore((s) => s.deleteNode);
const pushNote = useChatStore((s) => s.pushNote);
```

Ini butuh import baru: `import { useChatStore } from "../store/chatStore";`

Di `renderNode`, setelah `<button className="eyebtn">…</button>`:

```tsx
<button
  className="eyebtn"
  title="Hapus objek"
  aria-label={`Hapus ${node.name}`}
  onClick={(e) => {
    e.stopPropagation();
    const ok = deleteNode(node.id);
    if (ok) pushNote(`hapus ${node.name} — Ctrl+Z untuk urungkan`);
  }}
>
  {TrashIcon}
</button>
```

Catatan: jika `pushNote` belum ada di chatStore, cek dulu — Task M3 sudah menambahkan `pushNote` untuk Topbar notes ("snapshot dipulihkan…"). Jika nama aksinya berbeda, pakai yang ada; JANGAN buat aksi baru.

Baris child (renderChild) TIDAK dapat tombol hapus — node child dikelola lewat parent (boolean children, dsb.); hapus parent untuk menghapus keseluruhan.

- [ ] **Step 3: Typecheck + verifikasi visual manual**

Run: `pnpm --filter @asset-studio/web exec tsc --noEmit`
Expected: clean.

Manual (browser, dev server jalan di :3000): minta asisten buat rumah → klik node "Rumah …" di rail → klik ikon trash → node hilang dari tree & viewport, muncul note chat "hapus … — Ctrl+Z untuk urungkan", counter snapshot naik, tombol undo di Topbar aktif → klik undo → node kembali.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SceneRail.tsx
git commit -m "feat(web): delete button per node in SceneRail hierarchy"
```

---

### Task 3: Shortcut keyboard undo/redo global (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y)

**Files:**
- Create: `apps/web/src/lib/undoShortcuts.ts`
- Test: `apps/web/src/lib/undoShortcuts.test.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/package.json` (devDep jsdom)

- [ ] **Step 1: Install jsdom devDep**

```bash
pnpm --filter @asset-studio/web add -D jsdom
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/lib/undoShortcuts.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @asset-studio/web test -- --run undoShortcuts`
Expected: FAIL — modul `./undoShortcuts` tidak ditemukan

- [ ] **Step 4: Write minimal implementation**

`apps/web/src/lib/undoShortcuts.ts`:

```typescript
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
    t.isContentEditable
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/web test -- --run undoShortcuts`
Expected: PASS (5 test)

- [ ] **Step 6: Wire global listener di page.tsx**

Di `apps/web/src/app/page.tsx`, ambil aksi store dan pasang useEffect (komponen "use client" yang sudah ada — ikuti pola hook yang ada di file):

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const action = parseUndoShortcut(e);
    if (!action || isEditableTarget(e.target)) return;
    const s = useSceneStore.getState();
    // undo()/redo() mengembalikan label snapshot (string) atau null bila stack kosong.
    const label = action === "undo" ? s.undo() : s.redo();
    if (label !== null) e.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

Dengan import: `import { isEditableTarget, parseUndoShortcut } from "../lib/undoShortcuts";`

Guard `isEditableTarget` penting: composer chat adalah `<textarea>` — Ctrl+Z di dalam prompt harus tetap undo teks browser-native, BUKAN undo scene.

- [ ] **Step 7: Typecheck + test penuh web**

Run: `pnpm --filter @asset-studio/web exec tsc --noEmit && pnpm --filter @asset-studio/web test -- --run`
Expected: tsc clean, semua test PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/undoShortcuts.ts apps/web/src/lib/undoShortcuts.test.ts apps/web/src/app/page.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): global undo/redo keyboard shortcuts with input guard"
```

---

### Task 4: Verifikasi penuh + fix-forward

**Files:**
- Modify: sesuai temuan (harapannya: tidak ada)

- [ ] **Step 1: Full gates**

```bash
npx tsc --noEmit && pnpm -r test -- --run && pnpm --filter @asset-studio/web exec next build
```

Expected: typecheck clean; test counts = baseline + 10 (5 deleteNode + 5 undoShortcuts); build sukses (4 static pages).

- [ ] **Step 2: Manual golden checklist (browser :3000)**

1. Prompt "Buat rumah 2 lantai dengan atap pelana" → rumah muncul, snapshot #1.
2. Klik node rumah di SceneRail → klik trash → hilang, note "hapus …", snapshot #2.
3. Ctrl+Z → rumah kembali (undo manual edit — PRD §8 terpenuhi).
4. Ctrl+Shift+Z → hilang lagi (redo).
5. Klik di composer chat, ketik teks, Ctrl+Z → teks ter-undo, scene TIDAK berubah (guard bekerja).
6. Klik undo Topbar → konsisten dengan shortcut (stack yang sama).

- [ ] **Step 3: Fix-forward jika ada galat**

Jika ada kegagalan: tulis test yang mereproduksi → perbaiki → jalankan ulang gates. Catat penyimpangan dari plan sebagai komentar `// ponytail:` bila tradeoff disengaja.

- [ ] **Step 4: Update project_state memory (controller, bukan implementer)**

Setelah semua task selesai dan user memverifikasi manual: update file memory `project_state.md` — M4 selesai, tanggal, batasan yang tersisa.
