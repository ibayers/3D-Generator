# Decision Log

Keputusan arsitektur yang membentuk v0.1, urut kronologis. Format: konteks → keputusan → konsekuensi.

## D1 — LLM sebagai orchestrator, bukan generator mesh
**Konteks:** produk sejenis (Meshy/Tripo) generate mesh langsung; kualitas visual bagus tapi hasilnya black box.
**Keputusan:** LLM hanya mengeluarkan tool_call terstruktur; geometri dibangun primitif deterministik.
**Konsekuensi:** scene inspectable + undo-able, render deterministik; kualitas organic dibatasi kemampuan primitif (lihat `create_tree` sebagai batas atas PoC).

## D2 — Manual SDK, bukan Vercel AI SDK
**Konteks:** PRD §6.4 meminta Unified LLM Adapter Layer terlihat engineering depth-nya.
**Keputusan:** `@anthropic-ai/sdk` manual untuk Claude; `openai` SDK untuk GLM & 9Router (endpoint OpenAI-compat); antarmuka tunggal `LLMAdapter.chat(messages, systemPrompt)`.
**Konsekuensi:** lebih banyak glue code; kontrol penuh atas retry, timeout, dan bentuk `ChatResult` — dipakai ulang oleh eval harness tanpa layer tambahan.

## D3 — API key client-side + localStorage
**Konteks:** local-first, tanpa backend proxy.
**Keputusan:** panggilan langsung browser → provider; key di localStorage, tidak pernah dikirim ke server lain.
**Konsekuensi:** nol biaya infrastruktur; CORS ditangani `dangerouslyAllowBrowser` per SDK; bukan pola untuk app multi-user production.

## D4 — Ekstrusi dulu (flat shape → depth)
**Konteks:** butuh primitif geometris yang murah dan bisa dikomposisikan.
**Keputusan:** semua solid v0.1 lahir dari `extrude` (footprint 2D + kedalaman); boolean CSG untuk modifikasi.
**Konsekuensi:** bentuk tersusun dari prisma poligon — estetika low-poly konsisten; permukaan bebas (spline) out of scope.

## D5 — Undo full-snapshot, custom stack (deviasi PRD §6.4)
**Konteks:** PRD mengusulkan middleware `zundo`.
**Keputusan:** stack `history`/`future` manual di `sceneStore`, label per aksi (`delete:{id}`, dsb.); edit manual UI dan edit prompt masuk stack yang sama.
**Konsekuensi:** memori per aksi lebih besar tapi implementasi ~30 baris tanpa dependensi; undo/redo keyboard global jadi trivial.

## D6 — Retry policy milik orchestrator
**Konteks:** tool_call LLM kadang invalid (arg menyalahi skema).
**Keputusan:** retry SDK dimatikan (`sdkMaxRetries: 0`); `runWithRetry` memberi feedback error validasi kembali ke model, maks 2 retry, maks 6 ronde tool.
**Konsekuensi:** satu tempat kebijakan; limit prompt `maxTokens: 1024` (GLM memotong arg JSON di 512).

## D7 — Template Layer 2 = komposisi terlihat, id deterministik
**Konteks:** objek dikenali (rumah/jalan/pohon) harus tetap "dibangun dari primitif".
**Keputusan:** template memancarkan node `${id}-{part}`; re-invocation mengganti (upsert), bukan menambah.
**Konsekuensi:** scene idempotent by id; `create_tree` sedikit menyimpang (prefix-replacement, lihat D8) karena jumlah node beda antar varian.

## D8 — create_tree: prefix-replacement, bukan exact upsert
**Konteks:** conifer = 4 node, broadleaf = 3; exact-ID upsert meninggalkan `canopy-3` yatim saat ganti varian.
**Keputusan:** case `create_tree` menghapus semua node ber-prefix `${id}-` sebelum append (scoped hanya di case ini).
**Konsekuensi:** ganti varian bersih; edge case id bersarang (`tree` vs `tree-big`) bisa saling menimpa — dicatat sebagai batasan v1.

## D9 — Eval set sebagai test env-gated
**Konteks:** PRD §11.2 minta regression set prompt→tool_call, tapi panggilan LLM berbayar & non-deterministik.
**Keputusan:** matcher murni (unit test gratis); harness live `describe.skipIf(!EVAL_API_KEY)` dengan gate akurasi 75%.
**Konsekuensi:** suite harian tetap offline; mengukur regresi prompt/schema jadi perintah eksplisit satu baris.
