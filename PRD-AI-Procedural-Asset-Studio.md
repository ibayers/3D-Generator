# PRD — AI Procedural Asset Studio

**Versi dokumen:** 0.1 (draft)
**Status:** Draft awal untuk validasi arah sebelum development
**Tipe proyek:** Portfolio / eksperimen open-source, tanpa deadline ketat

---

## 1. Ringkasan Eksekutif

**AI Procedural Asset Studio** adalah editor aset 3D lokal (local-first) yang memungkinkan pengguna membuat dan mengedit aset 3D prosedural melalui percakapan natural language, menggunakan LLM sebagai "otak" pengendali — bukan sebagai generator mesh langsung.

Berbeda dari tool text-to-3D generatif seperti Meshy atau Tripo AI, produk ini **tidak melatih model AI baru** dan **tidak menghasilkan mesh mentah dari LLM**. Sebaliknya, LLM berfungsi sebagai orchestrator yang memilih dan memanggil tool (mirip pola tool-calling/MCP), sementara seluruh pekerjaan geometry generation, rendering, dan export dilakukan oleh engine lokal milik aplikasi.

**Diferensiasi utama:**

- Berjalan lokal (local-first), tidak bergantung pada layanan cloud tertutup
- LLM-agnostic: mendukung Claude, GLM, dan model lokal via Ollama
- Revisi non-destruktif melalui prompt (scene graph sebagai source of truth, bukan mesh)
- Hasil dapat diedit terus-menerus tanpa regenerasi dari nol
- Ekspor ke format standar (GLB)

---

## 2. Latar Belakang & Masalah

Tool text-to-3D generatif saat ini (Meshy, Tripo AI, dll.) menghasilkan mesh langsung dari prompt, dengan kelemahan:

- Sulit direvisi secara presisi ("ubah warna atap jadi hijau" sulit dilakukan tanpa regenerasi ulang)
- Bergantung pada model generatif besar yang mahal untuk dilatih/dijalankan
- Hasil kurang predictable dan kurang cocok untuk workflow iteratif

Pendekatan yang lebih realistis untuk pengembang tunggal (solo dev) adalah memindahkan beban "kreativitas generatif" ke LLM general-purpose yang sudah ada (Claude, GLM, dll.) sebagai pengendali, sementara logika pembuatan geometry tetap deterministik dan dapat dikontrol lewat engine sendiri.

---

## 3. Tujuan Produk

### 3.1 Tujuan Utama

- Menunjukkan kemampuan merancang arsitektur AI + tool-calling terstruktur (bukan sekadar wrapper API)
- Membangun editor 3D yang scene-nya dapat dimanipulasi lewat prompt secara non-destruktif
- Menjadi portfolio piece yang menonjolkan engineering, bukan kualitas generative AI

### 3.2 Non-Tujuan (Out of Scope v1)

- Tidak melatih model AI/mesh generator sendiri
- Tidak menyaingi kualitas visual Meshy/Tripo AI untuk organic asset kompleks
- Tidak membangun fitur kolaborasi real-time multi-user
- Tidak membangun mobile app

---

## 4. Target Pengguna

- **Primer:** Diri sendiri / evaluator portfolio (reviewer teknis, calon employer)
- **Sekunder:** Hobbyist/indie developer yang ingin membuat aset 3D sederhana lewat prompt, tanpa skill modeling 3D formal

---

## 5. Scope Produk (v1 / MVP)

### 5.1 Domain Objek

- **80% hard-surface**: rumah, jalan, kendaraan sederhana, furniture dasar
- **20% organic sebagai proof-of-concept**: 1–2 jenis objek organic sederhana (contoh: pohon low-poly prosedural), untuk membuktikan arsitektur dapat di-extend ke luar hard-surface

### 5.2 Strategi Tool Set — Hybrid (Primitif + Template)

Tool dibagi dua layer:

**Layer 1 — Primitif Komposabel** (fondasi, dipakai ulang oleh semua generator)
| Tool | Fungsi |
|---|---|
| `extrude` | Menarik profil 2D menjadi geometry 3D |
| `boolean` (union/subtract/intersect) | Operasi gabungan antar mesh |
| `array` / `duplicate` | Menggandakan objek dalam pola/grid |
| `scale`, `move`, `rotate` | Transformasi dasar |
| `set_material` | Mengubah warna/tekstur |

**Layer 2 — Template Generator** (dibangun di atas primitif Layer 1, bukan hardcoded terpisah)
| Tool | Fungsi |
|---|---|
| `create_house(floors, roof_style, windows)` | Compose dari extrude + boolean |
| `create_tree(type, height)` | Proof-of-concept organic |
| `create_road(length, width)` | Compose dari extrude |
| `create_car(style)` (opsional, jika waktu memungkinkan) | Compose dari primitif |

**Prinsip kunci:** Template generator harus terlihat jelas sebagai _komposisi_ dari primitif Layer 1 di source code — ini bagian penting yang dinilai dari sisi arsitektur, bukan dua sistem terpisah yang tidak nyambung.

**Fallback:** Jika user minta objek tanpa tool yang tersedia (misal "buat naga"), LLM merespons dengan penjelasan bahwa objek tersebut belum didukung, dan menawarkan alternatif terdekat dari tool yang ada (tidak fallback ke mesh generation generik di v1 — di luar scope).

### 5.3 Aksi Manipulasi Scene

| Tool                                           | Fungsi                              |
| ---------------------------------------------- | ----------------------------------- |
| `delete_object`                                | Menghapus node/objek                |
| `duplicate_object`                             | Instancing (bukan full copy mesh)   |
| `move_object`, `rotate_object`, `scale_object` | Transformasi objek existing         |
| `change_material`                              | Update warna/tekstur objek existing |
| `export_glb`                                   | Ekspor scene ke format GLB          |

### 5.4 Fitur UI

- Prompt input (chat-like) untuk perintah natural language
- Panel scene hierarchy (mirip Figma layer panel): daftar objek, bisa expand/collapse
- Viewport 3D real-time (React Three Fiber / Three.js)
- Undo/redo berbasis snapshot
- Export button (GLB)

### 5.5 Di Luar Scope v1

- Skema scene distandarkan ke glTF/USD asli (v1 pakai JSON custom ber-struktur glTF-like)
- Diff-based undo (v1 pakai full snapshot)
- Multi-user collaboration
- LOD / optimasi mesh untuk game engine
- Provider LLM di luar Claude, GLM, dan Ollama (lokal)

---

## 6. Arsitektur Sistem

```
┌─────────────────────────────────────────────┐
│                  Frontend                     │
│         Next.js + React Three Fiber            │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│           Unified LLM Adapter Layer            │
│   (interface sama untuk Claude / GLM / Ollama) │
└───────────────────┬─────────────────────────┘
                    │  tool_call (JSON)
                    ▼
┌─────────────────────────────────────────────┐
│                Tool Executor                    │
│   (validasi parameter, resolve target objek)    │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌───────────────────┐
│  Primitif Layer │       │  Template Generator │
│ (extrude, bool, │◄──────│ (create_house, dll) │
│  array, dll)    │       └───────────────────┘
└───────┬───────┘
        ▼
┌─────────────────────────────────────────────┐
│              Scene Graph (state)                │
│         JSON custom, struktur glTF-like          │
└───────────────────┬─────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│         Renderer (Three.js) + GLTF Exporter      │
└─────────────────────────────────────────────┘
```

### 6.1 Alur Kerja Prompt

```
User prompt
    │
    ▼
LLM membaca: (a) prompt user, (b) seluruh scene JSON saat ini
    │
    ▼
LLM mengeluarkan satu atau lebih tool_call
    │
    ▼
Tool Executor memvalidasi parameter & target objek
    │
    ├─ Valid → Engine eksekusi → Scene JSON diperbarui → Renderer re-render
    │
    └─ Invalid → Error dikembalikan ke LLM → LLM retry dengan parameter diperbaiki
```

### 6.2 LLM Context Strategy (v1)

- **Kirim seluruh scene JSON di setiap prompt** (bukan summary). Ini pilihan simplicity-first untuk v1, karena scene diperkirakan masih kecil (puluhan objek). Optimasi ke summary-based context ditunda ke v2 jika token cost menjadi masalah nyata.
- **Riwayat percakapan:** disertakan agar LLM bisa memahami referensi kontekstual ("yang tadi", "itu juga").

### 6.3 Error Handling pada Tool Call

- Jika tool call gagal (target objek tidak ditemukan, parameter di luar rentang valid), Tool Executor mengembalikan pesan error terstruktur ke LLM
- LLM diberi kesempatan retry maksimal N kali (disarankan N=2) sebelum menampilkan pesan ke user bahwa aksi tidak dapat dilakukan

---

## 6.4 Tech Stack

### Frontend & 3D Rendering

| Layer                           | Pilihan                                    | Alasan                                                                                                    |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Framework                       | **Next.js 15 (App Router)**                | Ekosistem besar, mudah dijalankan sebagai app local-first                                                 |
| 3D rendering                    | **React Three Fiber (R3F)** + **Three.js** | Declarative wrapper Three.js untuk React — scene graph JSON bisa dipetakan langsung ke component tree R3F |
| Helper 3D                       | **@react-three/drei**                      | Helper siap pakai (OrbitControls, Gizmo, Environment/lighting)                                            |
| Geometry ops (boolean, extrude) | **three-bvh-csg** / **three-csg-ts**       | Operasi boolean (union/subtract) untuk primitif Layer 1 — Three.js tidak punya CSG built-in yang baik     |

### State Management (Scene Graph & Undo)

| Layer         | Pilihan                        | Alasan                                                                                            |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Client state  | **Zustand**                    | Ringan, cocok untuk state scene graph + history, lebih simple dari Redux untuk proyek solo        |
| Undo/snapshot | **zundo** (middleware Zustand) | Middleware khusus undo/redo untuk Zustand — sejalan dengan keputusan "full snapshot" di Section 8 |

### LLM Integration Layer

| Layer              | Pilihan                                                                                                          | Alasan                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pemanggilan API    | **Manual** — `@anthropic-ai/sdk` untuk Claude, `fetch` langsung ke endpoint OpenAI-compatible untuk GLM & Ollama | Dipilih dibanding library seperti Vercel AI SDK supaya Unified LLM Adapter Layer benar-benar dibangun sendiri — lebih menunjukkan kedalaman arsitektur untuk portfolio, meski lebih banyak kerja dibanding pakai library siap pakai |
| Validasi tool_call | **Zod**                                                                                                          | Validasi parameter dari LLM sebelum dieksekusi Tool Executor                                                                                                                                                                        |

### Export & Format

| Layer           | Pilihan                                                             | Alasan                                     |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| GLTF/GLB export | **THREE.GLTFExporter** (built-in Three.js `examples/jsm/exporters`) | Sudah matang, tidak perlu library tambahan |

### Local Storage / Persistence

| Layer                 | Pilihan                              | Alasan                                                                                                                 |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Simpan project lokal  | **IndexedDB via Dexie.js**           | Kapasitas lebih besar dari localStorage, cocok untuk scene JSON + history snapshot, selaras dengan prinsip local-first |
| Export/import project | File `.json` biasa (download/upload) | Backup/share project tanpa cloud                                                                                       |

### Local LLM

| Layer         | Pilihan    | Alasan                                                                                                           |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Runtime lokal | **Ollama** | Endpoint OpenAI-compatible di `localhost:11434/v1`, dipanggil sama seperti provider lain lewat adapter yang sama |

### Dev Tooling

| Layer           | Pilihan        | Alasan                                                                              |
| --------------- | -------------- | ----------------------------------------------------------------------------------- |
| Bahasa          | **TypeScript** | Wajib untuk type safety pada scene schema, tool parameter, dan LLM tool-call typing |
| Package manager | **pnpm**       | Lebih cepat & hemat disk untuk monorepo kecil                                       |

### Struktur Proyek (Monorepo Ringan)

```
/apps
  /web              → Next.js + R3F app
/packages
  /scene-engine     → Scene graph, tool executor, primitif geometry (framework-agnostic)
  /llm-adapter      → Unified LLM adapter (Claude/GLM/Ollama)
  /schema           → Zod schemas untuk scene JSON & tool parameters
```

`scene-engine` dan `llm-adapter` dipisah agar tidak bergantung pada React/Next.js — memisahkan business logic dari UI framework, memudahkan testing independen, dan membuka opsi reuse (misal versi CLI atau desktop/Electron di masa depan).

---

## 7. Skema Data (Scene Graph)

**Keputusan:** JSON custom, tapi struktur mengikuti pola glTF (nodes, transform, mesh reference, materials) supaya migrasi ke glTF/USD asli di masa depan lebih mudah, dan ekspor ke GLB lebih natural.

```json
{
  "version": "0.1",
  "nodes": [
    {
      "id": "house01",
      "type": "house",
      "name": "Rumah Monopoly",
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "parameters": {
        "floors": 2,
        "roofStyle": "triangle",
        "roofColor": "red",
        "windows": 8
      },
      "children": []
    }
  ]
}
```

### 7.1 Aturan Kunci

- **Hierarki:** setiap node bisa punya `children` (parent-child), mendukung grouping
- **Instancing:** duplikasi objek (`duplicate_object`) membuat _instance_ yang mereferensikan geometry generator + parameter yang sama, bukan menyalin mesh penuh — hemat memory
- **Versioning skema:** field `version` di root disiapkan sejak awal untuk migrasi skema di masa depan

---

## 8. Undo / History (v1)

- **Strategi:** Full snapshot per aksi (bukan diff/patch — ditunda ke v2 jika storage jadi masalah nyata)
- Setiap tool_call yang berhasil dieksekusi menghasilkan snapshot baru (`scene_v1.json`, `scene_v2.json`, dst., disimpan in-memory atau di local storage)
- Undo = kembali ke snapshot sebelumnya; Redo = maju ke snapshot berikutnya
- Manual edit dari panel UI (jika ada di v1) dan prompt-edit dari LLM harus mencatat ke history yang sama, supaya undo tetap konsisten

---

## 9. LLM Provider & Integrasi

| Provider           | Cara akses                                              | Catatan                                             |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| **Claude**         | API resmi Anthropic                                     | Provider utama untuk development & testing awal     |
| **GLM**            | Endpoint OpenAI/Anthropic-compatible                    | User BYO API key                                    |
| **Ollama (lokal)** | Endpoint OpenAI-compatible (`http://localhost:PORT/v1`) | Untuk mode full local-first tanpa API key eksternal |

**Catatan arsitektur:** Semua provider diakses lewat satu **Unified LLM Adapter Layer** buatan sendiri (terinspirasi pola `pi-ai` dari proyek open-source Pi), sehingga menambah provider baru di masa depan tidak mengubah logic Tool Executor.

**Di luar scope v1:** Integrasi dengan harness pihak ketiga seperti OpenCode atau Pi sebagai dependency runtime — keduanya hanya jadi referensi arsitektur, bukan komponen yang di-embed.

---

## 10. Infrastruktur

- **Local-first sepenuhnya:** aplikasi berjalan di browser (Next.js) tanpa backend server terpisah untuk logic inti
- Tool Executor, Scene Graph, dan Geometry Generator berjalan di sisi client (JavaScript/TypeScript)
- Panggilan ke LLM provider (Claude/GLM) dilakukan langsung dari client dengan API key milik user (disimpan lokal, tidak dikirim ke server manapun selain provider resmi)
- Ollama dipanggil ke endpoint lokal (`localhost`) — tidak melalui internet

---

## 11. Kriteria Sukses & Evaluasi

### 11.1 Metrik Fungsional

- **Akurasi tool-selection:** persentase prompt yang menghasilkan tool_call yang benar dan sesuai maksud user
- **Waktu render:** waktu dari tool_call diterima hingga scene ter-update di viewport
- **Jumlah retry:** rata-rata jumlah retry yang dibutuhkan LLM untuk tool_call valid

### 11.2 Eval Set

Dibuat set kecil berisi pasangan `(prompt, expected_tool_call)` untuk regression testing, contoh:

| Prompt                              | Expected Tool Call                                |
| ----------------------------------- | ------------------------------------------------- |
| "buat rumah 2 lantai atap segitiga" | `create_house({floors:2, roofStyle:"triangle"})`  |
| "ganti warna atap jadi hijau"       | `change_material({target:"roof", color:"green"})` |
| "duplikasi rumah jadi 4"            | `duplicate_object({target:"house01", count:4})`   |

Eval set ini dijalankan setiap kali ada perubahan pada prompt sistem atau tool schema, untuk memastikan tidak ada regresi.

---

## 12. Milestone (v0.1 MVP)

Karena timeline bersifat long-term tanpa deadline ketat, tetap ditentukan milestone MVP kecil agar progres terlihat jelas:

1. **M1 — Scene Graph & Renderer dasar**: render scene JSON statis ke Three.js viewport, tanpa AI
2. **M2 — Tool Executor & Primitif Layer**: implementasi 5 primitif (extrude, boolean, array, transform, material), bisa dipanggil manual (tanpa LLM) untuk validasi
3. **M3 — Integrasi LLM (Claude dulu)**: prompt → tool_call → eksekusi, untuk 2–3 template generator sederhana (`create_house`, `create_road`)
4. **M4 — Undo/History + Panel Scene Hierarchy (UI)**
5. **M5 — Multi-provider (GLM, Ollama)** via Unified LLM Adapter Layer
6. **M6 — Export GLB + 1 objek organic proof-of-concept (`create_tree`)**
7. **M7 — Eval set + dokumentasi portfolio (README, decision log, demo video)**

---

## 13. Risiko & Mitigasi

| Risiko                                                                       | Mitigasi                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Template generator jadi daftar `create_X()` yang terus bertambah tanpa batas | Wajib compose dari primitif Layer 1; batasi jumlah template di v1 (maks. 4–5)                                                        |
| Ambiguitas parameter dari prompt (mis. "lebih tinggi" tanpa angka)           | Default heuristic (mis. scale 1.3x) didokumentasikan di prompt sistem, bukan tanya balik ke user (menjaga UX percakapan tetap cepat) |
| Token cost membesar seiring scene membesar                                   | Ditunda ke v2 (summary-based context); v1 cukup untuk demo skala kecil                                                               |
| Organic asset (`create_tree`) sulit terlihat natural                         | Cukup jadi proof-of-concept low-poly, bukan tujuan kualitas visual utama                                                             |
| Skema JSON custom sulit di-maintain jika berkembang                          | Struktur glTF-like sejak awal + field `version` untuk migrasi                                                                        |

---

## 14. Lampiran — Perbandingan Positioning

| Aspek                | Text-to-3D Generatif (Meshy/Tripo)       | AI Procedural Asset Studio (proyek ini)     |
| -------------------- | ---------------------------------------- | ------------------------------------------- |
| Sumber kebenaran     | Mesh mentah                              | Scene graph (JSON)                          |
| Revisi               | Regenerasi ulang                         | Edit parameter non-destruktif               |
| LLM peran            | Generator langsung                       | Orchestrator/tool-caller                    |
| Ketergantungan model | Model generatif khusus (dilatih sendiri) | LLM general-purpose (Claude/GLM/lokal)      |
| Kualitas visual      | Tinggi untuk organic kompleks            | Terbatas ke primitif/template yang tersedia |
| Local-first          | Umumnya cloud-only                       | Ya                                          |
