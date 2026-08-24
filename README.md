# AI Procedural Asset Studio

Editor aset 3D local-first: buat dan edit scene 3D lewat percakapan natural language. LLM berperan sebagai **orchestrator** yang memanggil tool terstruktur (bukan generator mesh) — setiap objek adalah hasil komposisi primitif geometris yang deterministik, jadi scene selalu bisa di-undo, di-inspect, dan di-export.

> Status: v0.1 — MVP sesuai PRD. Portfolio piece: fokus pada arsitektur AI + tool-calling terstruktur.

## Cara kerja

```
prompt → LLM (tool_call JSON) → Zod validation → Tool Executor → Scene Graph → Three.js viewport
                ↑                                                          |
                └──────────── scene JSON sebagai konteks ronde berikutnya ──┘
```

- **Layer 1 — primitif:** `extrude`, `boolean`, `array`, `transform`, `set_material`
- **Layer 2 — template komposisi:** `create_house`, `create_road`, `create_tree`, `create_character` — dibangun terlihat dari primitif Layer 1, bukan mesh ajaib
- **Undo/history:** full-snapshot per aksi; edit manual (hapus node) dan edit prompt masuk ke stack yang sama (Ctrl+Z / Ctrl+Shift+Z)
- **Provider:** Claude (Anthropic SDK), GLM (OpenAI-compat), 9Router (proxy lokal), GLM Vision (glm-4.5v, menerima gambar → `create_character` stilasi low-poly) — satu antarmuka `LLMAdapter`. API key disimpan di browser, panggilan langsung client → provider.

## Monorepo

| Paket | Isi |
|---|---|
| `packages/schema` | Skema Zod untuk scene JSON & input tool |
| `packages/scene-engine` | Scene graph, tool executor, komposisi template |
| `packages/llm-adapter` | Adapter provider, orchestrator retry loop, eval set |
| `apps/web` | Next.js app: viewport R3F, chat panel, scene rail, topbar |

## Menjalankan

```bash
pnpm install
pnpm --filter @asset-studio/web dev   # http://localhost:3000, isi API key via UI
```

```bash
pnpm -r --filter './packages/*' --filter '@asset-studio/web' exec tsc --noEmit  # typecheck
pnpm -r test                                                          # semua unit test
pnpm --filter @asset-studio/web build                                 # build produksi
```

## Eval set (PRD §11.2)

Regression set 9 prompt `(prompt → expected_tool_call)` di `packages/llm-adapter/src/eval/cases.ts`. Suite test normal **skip** eval live (offline, gratis). Saat mengubah SYSTEM_PROMPT atau tool schema, jalankan dengan key:

```bash
EVAL_PROVIDER=claude EVAL_API_KEY=sk-... pnpm --filter @asset-studio/llm-adapter eval
```

Gate akurasi tool-selection: ≥ 75%. Lihat hasil per-case di output console.

## Demo

Rekam video pendek (±60 detik) dengan script ini di http://localhost:3000:

1. Chip "Buat rumah 2 lantai dengan atap pelana" → rumah muncul, ToolCard hijau.
2. "Buat jalan lurus selebar 3 meter di depan rumah" → jalan.
3. "Buat pohon pinus setinggi 5 meter" → pohon conifer.
4. Klik node di Scene Rail → hapus → Ctrl+Z → kembali.
5. Export GLB dari Topbar → file terunduh.

## Batasan v1 (disengaja)

- End cap atap gable terbuka (tanpa infill segitiga)
- Jalan melengkung belum didukung (hanya segmen pertama path)
- Scene JSON dikirim penuh tiap ronde (tanpa truncation)
- `create_tree` re-invocation mengganti semua node dengan prefix `{id}-`; id yang merupakan prefix id lain (mis. `tree` vs `tree-big`) dapat saling menimpa

Arsitektur & tradeoff: lihat [docs/DECISIONS.md](docs/DECISIONS.md). Rencana per milestone: `docs/superpowers/plans/`.
