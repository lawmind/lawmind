# SPRINT 1 — CORPUS

**🔴 BLOCKED BY OD-4.** Corpus embedding cannot start until the provider is
chosen. Do not begin ingest against a placeholder — re-embedding 1M documents is
the most expensive mistake available in this sprint.

**Read first, both lanes:** `PRODUCT_BRIEF.md` · `docs/SCHEMA_TRUTH.md` ·
`docs/DATASETS.md` · `docs/API_CONTRACTS.md`.

---

## LCC

**OWN:** `services/api/**`, `packages/db/**`, `services/ingest/**`

**BLOCK ON:** **OD-4** — hard. Everything else in this block can be built and
tested on a 1,000-document sample while OD-4 is open; only the full embed run is
blocked.

**TASK**

1. **Ingest — target 1M+ judgments.** Sources are fixed by `docs/DATASETS.md` and
   **approved sources only**: AWS Open Data SCI + High Court judgments
   (CC-BY-4.0), indiacode.nic.in for statutes, IndianKanoon API.
   Beyond the 5-year SCI slice: **all 25 High Courts**, plus available District
   data. **Primary sources only — never another model's commentary.**
2. **Statutory text.** BNS / BNSS / BSA full text with **IPC↔BNS section
   mapping** into `statute_mappings`. Seeded from indiacode.nic.in and
   **never model-generated** — a wrong section mapping is a wrong answer about
   which law applies.
3. **Bare acts library.** 700+ Central and State Acts, full text, searchable
   (`PRD.md` Tier A). Same table shape decision as judgments — record it in
   `docs/SCHEMA_TRUTH.md` **before** writing the migration, not after.
4. **Chunk, embed, index.** `judgment_chunks` with `vector(1024)`, ivfflat on
   `vector_cosine_ops`, gin on `to_tsvector(full_text)`. Hybrid retrieval —
   sparse full-text **and** dense vector, fused.
5. **`ocr_confidence` populated** wherever the source was a scan. Retrieval
   **down-ranks** low-confidence text rather than excluding it.
6. **Search endpoint** to `docs/API_CONTRACTS.md` §Search — returning all three
   citation fields per result. Verification is S2; S1 returns the fields with
   honest values, never faked ones.

**DONE**
- **1M+ documents indexed**, counted from the database, not estimated
- A known citation retrieved in **under 3 seconds**, p95, on the production
  instance — not on a laptop
- `ocr_confidence` non-null on every chunk whose source was a scan
- IPC↔BNS mapping spot-checked against indiacode by hand on 20 sections
- Ingest is **resumable**: killing it mid-run and restarting does not duplicate
  or skip

**NEVER**
- Train on, or ingest, `nisaar/*` — one set failed audit with fabricated dissents
  and impossible bail applications; two are unaudited (**OD-8**). They are the
  **adversarial evaluation set** for S2, not corpus
- Model-generated section mappings or headnotes
- Begin the full embed run before OD-4 resolves

---

## RCC

**OWN:** `apps/mobile/**`

**BLOCK ON:** nothing. Mock `POST /search` from the contract.

**TASK**

1. **Search UI** — query input, language toggle, filters collapsed. Skeleton on
   load, **never a spinner** (`design/DESIGN_SYSTEM.md`).
2. **Results list** — `JudgmentCard`, staggered entry at `index × 55ms` capped at
   7. Citation in JetBrains Mono, title in Source Serif 4, two-sentence holding.
   **No verification badge on a verified result** — see NEVER.
3. **Judgment reading view** (PD-9) — all six, priority order:
   paragraph anchors in a fixed 22px gutter, tappable and linkable · jump to any
   paragraph cited elsewhere · highlight and save a passage to a matter · in-text
   search that jumps between **paragraphs, not scroll positions** · adjustable
   text size expressed as **words per screen** · reading progress across sessions
   including offline.
   Reference: `design/screens/renders/62-judgment-reading@2x.png`, canvas `11e`.
4. **Bare act reading view** — confirm before building whether it shares structure
   with the judgment reading view (`design/SCREENS.md` row 94 flags this). Do not
   build two readers by accident.

**DONE**
- Search → results → judgment detail navigates end to end on mocks
- Paragraph anchors are tappable and linkable; in-text search jumps between
  paragraphs
- Reading progress survives an app restart **with the network off**
- Renders correctly at contrast 0.5 / brightness 1.3 (the sunlight gate)

**NEVER**
- A badge, chip or tick on a verified citation. **Verified is silent** — only
  `unverified` and `overruled` render (`docs/CITATION_HARNESS.md` §Rendering)
- A bare spinner on search
- Hex outside `tokens.ts`

---

## GATE S1
1M+ documents indexed · known citation retrieved **< 3s** · `ocr_confidence`
populated · reading view functional on real judgment text.
