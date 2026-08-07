# SPRINT 1 — CORPUS

**🟢 UNBLOCKED 2 Aug 2026 — OD-4 resolved.** Corpus from AWS Open Data (free,
no account); embeddings are self-hosted BGE-M3, batch-embedded on a rented GPU.
`docs/OSS_STACK.md` §1a carries the staged ingest and the budget.

The standing caution still holds: **do not begin ingest against a placeholder.**
Re-embedding 1M documents is the most expensive mistake available in this sprint,
and it is now a self-inflicted one rather than a blocked decision.

**Read first, both lanes:** `PRODUCT_BRIEF.md` · `docs/SCHEMA_TRUTH.md` ·
`docs/DATASETS.md` · `docs/API_CONTRACTS.md`.

---

## LCC

**OWN:** `services/api/**`, `packages/db/**`, `services/ingest/**`

**BLOCK ON:** nothing. OD-4 closed 2 Aug 2026. Still worth building and testing
on a 1,000-document sample before the full embed run — the sample is how you find
out the chunking is wrong for ₹0 instead of $120.

**TASK**

1. **Ingest — target 1M+ judgments.** Sources are fixed by `docs/DATASETS.md` and
   **approved sources only**: AWS Open Data SCI + High Court judgments
   (CC-BY-4.0), indiacode.nic.in for statutes, IndianKanoon API.
   **Ingest in OD-4's stages, and record the count at each:** (1) Supreme Court
   complete 1950–2025 — the citation backbone; (2) BNS/BNSS/BSA + the IPC↔BNS
   mapping; (3) High Courts last 10 years; (4) historical HC as a post-launch
   background job. **Stages 1 + 2 pass Gate S1 — do not attempt 15.9M now.**
   **Primary sources only — never another model's commentary.**
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
- **The corpus is complete for every source this sprint names**, counted from the
  database, not estimated: Supreme Court 1950–2025 complete, the 845 Central Acts
  complete, BNS/BNSS/BSA present. *(Was "1M+ documents indexed" — see
  §Gate correction.)*
- A known citation retrieved in **under 3 seconds**, p95, on the production
  instance — not on a laptop
- IPC↔BNS mapping spot-checked against indiacode by hand on 20 sections, with the
  count of **rejected** candidate pairs reported alongside the accepted ones
- Ingest is **resumable**: killing it mid-run and restarting does not duplicate
  or skip

*(`ocr_confidence` moved to Gate S4 — see §Gate correction.)*

**NEVER**
- Train on, or ingest, `nisaar/*` — one set failed audit with fabricated dissents
  and impossible bail applications; two more are assumed to share them. They are the
  **adversarial evaluation set** for S2, not corpus
- Model-generated section mappings or headnotes
- Begin the full embed run before the 1,000-document sample looks right

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
Corpus complete for every source this sprint names · known citation retrieved
**< 3s** p95 on production · IPC↔BNS mapping hand-checked on 20 sections ·
reading view functional on real judgment text, observed on a device.

---

## Gate correction — 7 Aug 2026

Two of the original four criteria could not be passed by any amount of
engineering, because **they contradicted this sprint's own task list.** Corrected
on the authority of the founder-approved data-and-delivery plan, §Verification.
Recorded here rather than silently edited, because a gate that moves without a
reason is not a gate.

**1. "1M+ documents indexed" → the corpus is complete for every source this
sprint names.**

The sprint body says, four lines into LCC task 1: *"Stages 1 + 2 pass Gate S1 —
do not attempt 15.9M now."* The gate then demanded a document count that only
stage 3 could produce. Both cannot be followed.

The measurement settles which one was wrong. **The Supreme Court is finished** —
38,341 of 38,351 distinct judgments, the missing ten individually checked and
source-side (6 × HTTP 404, 3 × corrupt PDF, 1 unexplained). There is no more
Supreme Court to ingest. The only remaining volume is the High Court bucket, and
`docs/DATASETS.md` measured it on 6 Aug: **one year is 1.95M documents at 537 GB
against a 50 GB Railway volume**, and ten years is 5,369 GB and ~3,956 GPU-hours.

**And the volume is not the disqualifying part — the citations are.** 0 of 9,604
HC metadata rows carry a citation; 0 of 30 PDFs sampled across six High Courts
carry a neutral citation the extractor can see. A judgment with no citation can
be found but cannot be cited into a draft, added to a matter as an authority, or
appear in the citation graph. **Two million of them would add search noise and no
authority** — the count would pass while the product got worse.

*"38,341 citable Supreme Court judgments, complete 1950–2025, plus 845 Central
Acts"* is a **stronger** claim than *"1M documents"*, and it is nearly true today.
`docs/FEATURE_PARITY.md` §5 already argues that feature parity does not require
corpus parity.

**Not deleted, deferred:** High Court breadth stays live as Track B3 — text now,
citations later, rendering `unverified`/`none`, which is exactly what the
three-field model exists for. It is background ingest that no sprint depends on.

**2. "`ocr_confidence` populated" → restated as Gate S4.**

`ocr_confidence` is non-null on **0 of 616,197 chunks, and that is the correct
value.** We have never run an OCR engine. Every source so far is born-digital
text from AWS Open Data and indiacode; `text_quality` is populated on
616,197/616,197. Scans arrive with document upload in S4, which is where the
PaddleOCR bake-off already sits (OD-7).

**An absent check is not a negative result.** A column that is null because the
measurement was never taken must never be read as a measurement of zero — the
same rule that keeps `not_attempted` apart from `miss` on the verification sheet.
Moving this criterion to S4 is what makes the null honest rather than a failure.

The retrieval rule it implies stands unchanged and is built already: low-
confidence text is **down-ranked, never excluded.**
