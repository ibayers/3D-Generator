"use client";

import { useState, type ReactElement } from "react";
import { useSceneStore } from "../store/sceneStore";
import { useChatStore } from "../store/chatStore";
import type { SceneNode } from "@asset-studio/scene-engine";

const CubeIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </svg>
);

const EyeIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <path d="M2 12s3.5-6 10-6c1.8 0 3.4.5 4.8 1.2M22 12s-3.5 6-10 6c-1.8 0-3.4-.5-4.8-1.2" />
    <path d="M4 4l16 16" />
  </svg>
);

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

function CaretIcon() {
  return (
    <svg
      className="caret"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Registry statis — mencerminkan ToolName di scene-engine, bukan tool palsu. */
const LAYER1_TOOLS = [
  { tn: "extrude", td: "Profil 2D ditarik menjadi solid 3D" },
  { tn: "boolean", td: "union · subtract · intersect antar mesh" },
  { tn: "array", td: "Gandakan objek dalam pola atau grid" },
  { tn: "transform", td: "move · rotate · scale — transformasi dasar objek" },
  { tn: "set_material", td: "Warna dan tekstur objek" },
];

const LAYER2_TOOLS = [
  {
    tn: "create_house(floors, roof_style)",
    comp: "= extrude dinding + band + atap",
  },
  { tn: "create_road(path, width)", comp: "= extrude ×1" },
  {
    tn: "create_tree(type, height)",
    comp: "= extrude (batang + kanopi)",
  },
  {
    tn: "create_character(height, build)",
    comp: "= extrude (torso + anggota)",
  },
];

const TOOL_TAGS = [
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

function childGen(node: SceneNode): string {
  if (node.type === "boolean") {
    return String(node.parameters.operation ?? "boolean");
  }
  return node.type;
}

export default function SceneRail() {
  const scene = useSceneStore((s) => s.scene);
  const selectedId = useSceneStore((s) => s.selectedId);
  const hiddenIds = useSceneStore((s) => s.hiddenIds);
  const select = useSceneStore((s) => s.select);
  const toggleHidden = useSceneStore((s) => s.toggleHidden);
  const deleteNode = useSceneStore((s) => s.deleteNode);
  const pushNote = useChatStore((s) => s.pushNote);

  const [tab, setTab] = useState<"scene" | "tools">("scene");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const collapseAll = () =>
    setCollapsed(new Set(scene.nodes.map((n) => n.id)));

  const isHidden = (id: string) => hiddenIds.includes(id);

  const renderNode = (node: SceneNode): ReactElement => {
    const open = !collapsed.has(node.id);
    const cls = [
      "node",
      open ? "open" : "",
      selectedId === node.id ? "sel" : "",
      isHidden(node.id) ? "dim" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={node.id}
        className={cls}
        role="button"
        tabIndex={0}
        aria-label={node.name}
        onClick={() => select(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(node.id);
          }
        }}
      >
        <span onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}>
          <CaretIcon />
        </span>
        <span className="nicon">{CubeIcon}</span>
        <span className="nm">{node.name}</span>
        <span className="gen">{node.type}</span>
        <button
          className="eyebtn"
          title="Tampil / sembunyikan"
          aria-label={`Tampilkan ${node.name}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleHidden(node.id);
          }}
        >
          {isHidden(node.id) ? EyeOffIcon : EyeIcon}
        </button>
        <button
          className="eyebtn"
          title="Hapus objek"
          aria-label={`Hapus ${node.name}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            const ok = deleteNode(node.id);
            if (ok) pushNote(`hapus ${node.name} — Ctrl+Z untuk urungkan`);
          }}
        >
          {TrashIcon}
        </button>
      </div>
    );
  };

  const renderChild = (node: SceneNode): ReactElement => (
    <div
      key={node.id}
      className={`node child${selectedId === node.id ? " sel" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={node.name}
      onClick={() => select(node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(node.id);
        }
      }}
    >
      <span className="nicon">{CubeIcon}</span>
      <span className="nm">{node.name}</span>
      <span className="gen">{childGen(node)}</span>
    </div>
  );

  return (
    <aside className="rail" aria-label="Panel adegan">
      <div className="rail-tabs" role="tablist">
        <button
          className="rail-tab"
          role="tab"
          aria-selected={tab === "scene"}
          onClick={() => setTab("scene")}
        >
          Scene
        </button>
        <button
          className="rail-tab"
          role="tab"
          aria-selected={tab === "tools"}
          onClick={() => setTab("tools")}
        >
          Tools
        </button>
      </div>

      {tab === "scene" ? (
        <div className="rail-panel" role="tabpanel">
          <div className="rail-head">
            <b>
              Adegan — <span className="num">{scene.nodes.length}</span> objek
            </b>
            <button className="ghost" onClick={collapseAll}>
              tutup semua
            </button>
          </div>
          {scene.nodes.length === 0 ? (
            <p className="tree-empty">
              Belum ada objek. Minta asisten membuat sesuatu lewat chat —
              setiap objek akan muncul di sini sebagai node scene graph.
            </p>
          ) : (
            scene.nodes.flatMap((node) => {
              const rows = [renderNode(node)];
              if (!collapsed.has(node.id)) {
                rows.push(...node.children.map(renderChild));
              }
              return rows;
            })
          )}
        </div>
      ) : (
        <div className="rail-panel" role="tabpanel">
          <p className="tgroup">Layer 1 — Primitif komposabel</p>
          {LAYER1_TOOLS.map((t) => (
            <div className="tool" key={t.tn} title={t.td}>
              <span className="tn">{t.tn}</span>
              <span className="td">{t.td}</span>
            </div>
          ))}
          <p className="tgroup">Layer 2 — Template generator</p>
          {LAYER2_TOOLS.map((t) => (
            <div className="tool" key={t.tn}>
              <span className="tn">{t.tn}</span>
              <span className="comp">{t.comp}</span>
            </div>
          ))}
          <p className="tgroup">Manipulasi scene</p>
          <div className="tooltags">
            {TOOL_TAGS.map((t) => (
              <span className="ttag" key={t}>
                {t}
              </span>
            ))}
          </div>
          <p className="rail-note">
            Template Layer 2 dijalankan sebagai{" "}
            <b>komposisi primitif Layer 1</b> — bukan sistem terpisah. LLM hanya
            memilih tool; geometry dikerjakan engine lokal.
          </p>
        </div>
      )}
    </aside>
  );
}
