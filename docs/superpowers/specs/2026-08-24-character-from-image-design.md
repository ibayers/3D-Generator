# Design — Karakter 3D dari Gambar (Fase A: Approx Stilasi via GLM Vision)

**Tanggal:** 2026-08-24 · **Status:** disetujui user (3 bagian, masing-masing di-approve) · **Milestone:** M8 (pasca-v0.1)

## 1. Konteks & keputusan

Permintaan user: (1) hasil prompt lebih kaya, (2) generate karakter 3D dari gambar. Scope spec ini: **karakter dulu** (bagian 1 ditunda ke spec berikutnya).

LLM teks tidak bisa membuat mesh dari gambar. Dua jalur yang dibahas:

- **A. Approx stilasi** — gambar → LLM vision mendeskripsikan → tool prosedural membangun versi low-poly. Gratis, instan, konsisten gaya scene.
- **B. API image-to-3D eksternal (Meshy dll.)** — mesh nyata dari foto. Berbayar, asinkron.

**Keputusan: A dulu, B menyusul** (fondasi bersama: upload gambar + node karakter; B menjadi tool kedua di atasnya nanti).

**Pendekatan (dari 3 usulan): Pendekatan 1 — vision di dalam orchestrator.** Gambar dilampirkan di composer → ikut pesan user → adapter `glm-vision` baru (glm-4.5v, endpoint **standard** Z.ai `https://api.z.ai/api/paas/v4/`, key terpisah dari coding plan) melihat gambar dan mengeluarkan `tool_call` `create_character`. Refinement percakapan ("ganti warna baju") lewat alur lama.

**Fallback resmi (pendekatan 3, hanya bila terbukti perlu):** kalau tool-calling glm-4.5v goyah, ubah menjadi tool `analyze_image` (sistem menjalankan vision, deskripsi kembali ke LLM teks). Hanya lapisan adapter berubah — UI dan template tidak.

## 2. Arsitektur & alur data (Bagian 1 — disetujui)

### Extension adapter

- `ChatMessage` (packages/llm-adapter/src/types.ts) dapat field opsional `images?: string[]` (data-URL base64). `runWithRetry` tidak berubah.
- **Refactor OpenAI-compat (diantisipasi komentar `ponytail:` n9router.ts):** target ke-4 muncul (glm, n9router, glm-vision) → satukan jadi satu `createOpenAICompatAdapter({ apiKey, model, tools, baseURL, maxTokens? })` + fungsi mapping pesan; glm.ts & n9router.ts menjadi pemanggil tipis. **Test glm & n9router lama harus tetap hijau tanpa perubahan** (bukti perilaku terjaga).
- **Provider baru `glm-vision`** (glmVision.ts): baseURL standard Z.ai, model default `glm-4.5v`, memetakan `ChatMessage.images` → content parts OpenAI (`[{type:"text"},{type:"image_url",image_url:{url}}]`). Fungsi mapping diekspor murni untuk unit test. Adapter lain mengabaikan `images`.

### Provider capability & UI

- llmStore: `Provider` += `'glm-vision'`; key `asset-studio:glm-vision-api-key`; model override; flag `supportsImages` per provider (fase A: hanya glm-vision true).
- ChatPanel: opsi provider keempat + input key; **tombol paperclip hanya aktif saat provider `supportsImages`** — tidak ada jalan memilih gambar yang diam-diam dibuang adapter. Gambar terpilih → chip preview di atas composer (bisa dihapus sebelum kirim). Validasi: jpg/png/webp, maks ±5 MB, tolak dengan note bila lebih.

### Alur end-to-end

```
[paperclip: pilih jpg/png] → chip preview
"karakter seperti ini" + gambar → chatStore (message.images)
  → runWithRetry (tidak berubah)
    → glmVision adapter → content parts [text + image_url]
      → glm-4.5v melihat gambar → tool_call create_character{height, build, colors…}
        → executor → applyCreateCharacter → root node + children → scene + snapshot
ToolCard create_character hijau; "ganti warna bajunya" → set_material ke node bagian (alur lama).
```

Undo/redo, SceneRail hierarchy, export GLB: gratis karena karakter = node biasa.

## 3. Template `create_character` (Bagian 2 — disetujui)

### Input (schema Zod, pola create_tree)

```ts
{ id, position,
  height?,              // meter; default 1.7 — skala manusia di samping rumah 2 lantai (±6 m)
  build?,               // "slim" | "regular" | "stocky"; default "regular"
  skinColor?, shirtColor?, pantsColor?, hairColor? }  // hex; default netral
```

Clamp height 0.5–3 m.

### Proporsi humanoid (kanon 7 kepala, semua kotak extrude sejajar sumbu — tanpa rotasi)

| Bagian | Tinggi | Warna | Rentang Y |
|---|---|---|---|
| kaki ×2 | 0.45·h | pantsColor | 0 → 0.45h |
| torso | 0.32·h | shirtColor | 0.45h → 0.77h |
| lengan ×2 | 0.34·h | skinColor | bahu ±0.75h ke bawah |
| kepala | ±0.14·h (1/7·h) | skinColor | 0.77h → 0.91h |
| rambut | 0.05·h, sedikit lebih lebar dari kepala | hairColor | puncak kepala |

Lebar torso per build: slim 0.16h · regular 0.20h · stocky 0.26h; lengan/kaki mengikuti (±30%).

### Struktur node — root + children (penyimpangan disengaja dari create_tree yang flat)

```
char-01 (torso, root)
├─ char-01-leg-l / leg-r
├─ char-01-arm-l / arm-r
├─ char-01-head
└─ char-01-hair
```

Alasan: viewport merender `children` rekursif (Viewport.tsx:147), `deleteNode` rekursif (collectNodeIds), SceneRail menampilkan hierarki → trash/eye bekerja pada karakter utuh. Karena satu root: **upsert exact-ID bersih, tidak perlu prefix-replacement** — re-invocation id sama mengganti seluruh karakter.

## 4. Error handling, testing, risiko (Bagian 3 — disetujui)

### Error handling

- Validasi gambar di UI (format, ±5 MB) — tanpa resize/crop client (YAGNI).
- Provider teks + gambar dicegah sejak awal (paperclip nonaktif).
- Tool-call vision jelek → schema Zod tolak → INVALID_INPUT → feedback retry (maks 2) — jalur lama.
- API error bubble-up ke chat note seperti sekarang.
- Gambar menempel pada pesan user pertama; ronde lanjutan request sama mengirim ulang via messages; request baru tidak.

### Testing

- Unit: schema +2; template +5 (6 children + root, proporsi ≤ h untuk 3 build, warna default/override, upsert replace, clamp height); executor +3; TOOL_DEFINITIONS/SYSTEM_PROMPT +2; mapping pesan glmVision +2.
- Refactor OpenAI-compat: test glm & n9router lama hijau tanpa perubahan.
- Eval set +1 case teks murni: "Buat karakter pria setinggi 170 cm berbaju biru" → `create_character` (height 1.7). Total 9, gate tetap ≥75%.
- Manual (golden checklist): foto asli → lampirkan → karakter muncul; "ganti warna baju" → set_material ke bagian; Ctrl+Z; export GLB; trash hapus utuh.

### Risiko & mitigasi

1. glm-4.5v tool-calling goyah → fallback pendekatan 3 (di atas).
2. Key Z.ai standard terpisah — user perlu membuat key API standard.
3. Privasi gambar: terkirim hanya ke Z.ai (sama seperti teks).

### Batasan disengaja (YAGNI)

Tanpa resize/crop gambar; satu gambar per pesan; tanpa mapping gambar di adapter Claude (`supportsImages` false — kecil kalau nanti dibutuhkan); tanpa Meshy/fase B; tanpa rigging/animasi — karakter statis.

## 5. Kriteria sukses

1. Foto karakter (mis. figur anime/action figure) dilampirkan + "buat karakter seperti ini" → karakter humanoid low-poly muncul dengan warna/proporsi yang mengikuti gambar (height/build/colors masuk akal).
2. Refinement teks ("bajunya hijau", "buat lebih tinggi") bekerja pada bagian karakter.
3. Trash menghapus karakter utuh; Ctrl+Z mengembalikan; GLB ter-export berisi karakter.
4. Suite offline tetap gratis/hijau; eval live 9 case ≥75%.
5. Tanpa gambar/provider teks: tidak ada regressi (alur lama utuh).
