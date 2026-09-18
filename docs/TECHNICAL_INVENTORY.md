# TECHNICAL INVENTORY — LawMind, as of 11 Aug 2026

> ## THIS FILE CONTAINS DATED / HISTORICAL IMPLEMENTATION INVENTORY
>
> **Runtime and deployment statements below are SNAPSHOTS unless explicitly
> marked CURRENT.** The body is dated 11 Aug 2026 and was accurate then. It
> describes a Railway production service, Railway Postgres constraints, a live
> HNSW index and a production search path that no longer exist. Those lines are
> preserved deliberately: they are measurements, and a measurement that is
> rewritten later stops being evidence. Read them as "this is what was observed
> on that date", never as "this is what is running".
>
> ### Current delta — 18 September 2026 (SHIP S4-T0.2)
>
> ```text
> CURRENT_PRODUCTION          = NONE
> CURRENT_PERSISTENT_BETA     = NONE
> CURRENT_HOSTING_PROVIDER    = UNDECIDED
>
> CURRENT_COARSE_EMBEDDING    = terminal at the latest accepted DATA/NEW1 receipt
>                               (docs/CURRENT_STATE.md §6; not re-measured here)
> CURRENT_FULL_HNSW           = NONE
> HNSW                        = DEFERRED_HIGH_MEMORY_OFFLOAD
> PUBLIC_SEMANTIC             = DISABLED
>
> GATE_C_REMOTE               = historical, and destroyed (verified 18 Sep 2026)
> RAILWAY_PRODUCTION          = historical, and retired
>
> CURRENT_CAPABILITY_REGISTRY = docs/product/V1_CAPABILITY_REGISTRY_R17.json
> ```
>
> The live pointer is [`docs/CURRENT_STATE.md`](CURRENT_STATE.md) — gate,
> capability registry, active stops, founder actions, and the deployment state
> in its §11. Where this file and that one differ, that one is current and this
> one records what was true on its own date.

Factual snapshot for an AI architect. No recommendations. Every claim tagged
**IMPLEMENTED / WORKING / PARTIAL / EXPERIMENTAL / PLANNED / IDEA / UNKNOWN**,
sourced to file paths verified this session (repo reads + 3 parallel code-level
audits). Where a doc claim and code disagree, both are stated.

**Not verified today, only read from docs**: exact deploy state of every route
(see §11 deploy-gap finding — code is 43 commits ahead of what's live).

> **RE-VERIFICATION NOTE, added after first draft.** A second agent (LCC, on
> this repo's own agent-message-bus, `.agents/bus/`) was actively working the
> corpus and the retrieval layer *while this document was first being
> written*. Two claims in the first draft were wrong the moment they were
> written, not stale by drift. Both are corrected in place below, and both
> corrections are logged here rather than silently absorbed, per this
> project's own convention (`CURRENT_PLAN.md` §"Standing corrections owed"):
>
> 1. **"Lexical (BM25 via Postgres tsvector)" was wrong.** The production
>    retrieval code uses Postgres `ts_rank`, not BM25 — `ts_rank` has no IDF
>    term, and true BM25 extensions (`pg_search`, `pg_textsearch`,
>    `vchord_bm25`) are confirmed unavailable on Railway Postgres. Found and
>    documented by LCC in `docs/HC_INGEST_PLAN.md` §0.1, itself written during
>    this session. Corrected everywhere below.
> 2. **"High Court judgments held: 0", "blocked on 2 founder scope decisions"
>    was true when read and false an hour later.** The founder approved
>    High Court ingest (text-only, no embeddings) on 11 Aug 2026; an ingest
>    job started *during this session* and the first non-Supreme-Court rows
>    (Patna High Court) landed while this document was being written.
>    Corrected in §2, §11, §12, §13, and the matrix, each flagged inline.
>
> Everything else below was checked against the current working tree at the
> time of this correction pass (git status, file mtimes, the full bus
> transcript) and found consistent with what was originally written.

---

## 1 · ARCHITECTURE

**Monorepo**, pnpm workspaces (`apps/*`, `services/*`, `packages/*`), TypeScript,
no build step — services run via `tsx` directly. No Dockerfiles; Railway
RAILPACK builder.

| Component | What it is | Status |
|---|---|---|
| `services/api` | Hono HTTP server (`src/index.ts`, `app.ts`), port 3000, `/health`. Search, judgments, citations, statutes, matters, briefings, documents/drafting, court lookup, admin, auth, alerts, corpus coverage | IMPLEMENTED, deployed |
| `services/cron` | Two CLIs, no server: `sweep.ts` (nightly briefing generation+delivery, 23:00 IST) and `recheck-cli.ts` (overruled-status re-check, 22:30 IST). Imports domain logic from `@lawmind/api`'s exports rather than duplicating it | IMPLEMENTED, deployed (`railway.cron.json`, `railway.recheck.json`) |
| `services/embed` | BGE-M3 embedding (`Xenova/bge-m3`, transformers.js/ONNX) + cross-encoder reranker (`BAAI/bge-reranker-v2-m3`), used as an in-process library by `api` (query-time, CPU) and as a batch CLI (corpus embed, optionally GPU via a Python sidecar) | IMPLEMENTED |
| `services/harness` | Retrieval/generation quality gate. 25 files, 9 test files, 101 test blocks. Not deployed — a CLI tool run in `ci:local` and manually (`pnpm harness`, `pnpm ab`) | IMPLEMENTED (tooling) |
| `services/ingest` | One-time/batch corpus acquisition + derivation CLIs (AWS S3 loader, statute loader, citation extractor, harvest clients). Explicitly not on Railway — run from a workstation/rented box | IMPLEMENTED (tooling) |
| `apps/mobile` | Expo Router (Expo ~57, RN 0.86, React 19.2), Zustand, TanStack Query, Reanimated 4. `app/` = routes, `src/` = api/citation/components/hooks/screens/state/theme. Jest + jest-expo + RNTL | IMPLEMENTED, actively built |
| `apps/admin` | Next.js 14.2 (React 18 — separate lockfile from mobile's React 19). 18 sections under `app/sections/`: advocates, analytics, briefings, cause-list-sync, citation-monitor, corpus-ingestion, data-deletion, disputed-citations, draft-templates, enrolment-queue, llm-spend-routing, ocr-review-queue, overview, platform-controls, push-campaigns, staff-audit, subscriptions, support-inbox | PARTIAL — UI shell built; many sections' backing endpoints SPECCED not BUILT (§API below). `pnpm-lock.yaml` is documented as broken for this app (`ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`) |
| `packages/auth` | better-auth 1.6.26 self-hosted + jose JWT. `mail.ts` = Resend magic-link, refuses to boot without `RESEND_API_KEY` | IMPLEMENTED |
| `packages/db` | Drizzle ORM 0.45, `src/schema.ts` (1,351 lines) is the schema authority. 31 migrations, `0000`→`0030` | IMPLEMENTED |
| `packages/storage` | `r2.ts` (R2/S3-compatible), `sign.ts`, `metered.ts` (op counting), `spend.ts` (cost ceiling + halt switch) | IMPLEMENTED |

Cross-service dependency: `services/api` exports domain logic (`briefings/assemble`,
`citations/fanout`, `citations/recheck`, `search/*`, `push/expo`) consumed
directly by `cron` and `harness` — documented as deliberate, not accidental
coupling.

### API surface (`docs/API_CONTRACTS.md`, mechanically checked by
`scripts/check-contract-status.mjs`)

File's own header (dated, since superseded by additive edits through 11 Aug):
*"83 endpoints, 19 BUILT, 64 SPECCED."* Live BUILT count is materially higher —
most sections added 8–11 Aug read BUILT. As last read:

- **BUILT**: health; full auth (magic-link/verify/refresh/logout/me/terms);
  search + judgment detail + citation detail + eCourts verify/confirm + citation
  copies; statutes + sections + corpus coverage; judgment treatment/graph/
  authorities; saved-searches (4 endpoints, server-only — see OD-12);
  annotations; matters CRUD + events; matter sharing; briefings; document list/
  types/detail/PATCH/citations; court lookup; most of admin (llm-costs,
  citations, ocr-queue [reads an empty table honestly], users, audit, platform
  kill-switches/flags, cause-lists, disputes, alerts, alert-settings,
  training-consent, data-requests).
- **SPECCED (not built)**: `POST /documents` (**no draft-creation path exists at
  all** — see §11), `POST /documents/:id/export`, all three OCR endpoints,
  `POST /documents/:id/review`, `/documents/compare`, `/uploads/:id/chat`,
  `POST /arguments/counter`, admin draft-templates GET/POST/score/publish,
  `GET /admin/privacy/coverage`.

## 2 · DATA / CORPUS

| Metric | Value (verified against production 10–11 Aug 2026) |
|---|---|
| Judgments held | **38,341**, all Supreme Court of India, 1950–2025 |
| Chunks | 616,197 (embedded, `vector(1024)`) |
| High Court judgments held | **0 as of session start; ingest began and landed live during this session — see note below** |
| Statutes | 845 Central Acts (indiacode.nic.in) |
| Statute sections | 22 of 845 acts have zero sections (colonial-era acts, source genuinely has none) |
| `statute_mappings` (IPC↔BNS) | **0 rows** — India Code's IPC handle is incomplete (ss. 121–510 absent from the source PDF); needs a different source, not a better parser |
| Citation edges (`judgment_citations`) | 227,478 total; 11,240 are sentinels (judgment cites nothing); 216,238 real edges; **97,876 resolved (45.3% of real edges)** |
| Citation aliases (AIR/SCC concordance) | 4,097 (derived primary-source, not purchased) |
| Judges | 44,360 rows, 277 distinct |
| Statute references | 97,806 across 25,466 judgments (66.4%) |
| Citator (overruled flags) | 81 of 38,341 flagged: `set_aside` 57, `doubted` 16, `partly_set_aside` 8 |
| Treatment-carrying edges | 13,389 (`followed` 11,723, `distinguished` 1,517, `overruled` 108, `doubted` 21, `overruled_in_part` 20) |

**Source**: AWS Open Data, `s3://indian-supreme-court-judgments` and
`s3://indian-high-court-judgments`, `ap-south-1`, **CC-BY-4.0, no account
needed**. Loader is plain HTTPS range-reads via `hyparquet` (`services/ingest/
src/sci.ts`) — no AWS SDK. **Legal basis**: no copyright in a judgment
(Copyright Act s. 52(1)(q)(iv)); raw court text only, never a reporter's
copy-edited edition (*EBC v. Modak*).

**High Court corpus — INGEST APPROVED AND RUNNING, live as of this session**
(`docs/HC_CORPUS_SURVEY.md`, `HC_EXTRACTION_COST.md`, `docs/HC_INGEST_PLAN.md`
— the last of these was written *during* this session and supersedes the
"never executed" state the first draft of this document described):

- 20,529,202 documents all years / **15,771,566 in the last 10 years**, 25
  courts. Bucket ships **two incompatible metadata schemas** (`metadata.parquet`
  vs `metadata-mobile.parquet`) sharing **zero CNRs** between them.
- Judgment share (vs orders/other documents) is a **measured range 0.75%–
  18.64%**, not a point estimate — the only label (`order_type`) conflates
  judgment and order. Every surface that shows this is contractually required
  to say "documents", never "judgments" — code-enforced (a negative-control
  test asserts no API field is ever named `sourceJudgments`).
- Extraction cost: 99.4% extract cleanly, 0.2% need OCR, 0.4% corrupt; **4.2 days
  on 8 workers**, download-bound 5:1 over extraction.
- **Citability, not just a metadata gap**: neither AWS metadata variant carries
  a citation column, and `reporter_citations` is `[]` on every ingested High
  Court row — **never synthesised**. Post-2023, some courts print a neutral
  citation inside the judgment text itself (`2023:DHC:2720`), extracted at
  ingest; pre-2023 rows are **searchable-not-citable, permanently, by design**.
  This is now a *live product fact*, not a future risk: the first landed batch
  (Patna High Court, 2024) shows **0 of 500 documents carry a neutral
  citation** — Patna had not adopted the practice in that sample — while a
  Delhi/Kerala/Madras/Karnataka 2023+ document would. **Open, unresolved
  question as of the last bus message this session**: what `ResultCard` /
  `citationRender` should do with a real, dated, real-court judgment that has
  no citation at all — a state distinct from `unverified` (nothing to
  confirm, vs. nothing confirmed) that nothing in `apps/**` had ever had to
  render before tonight. Flagged by LCC to RCC, not yet answered.
- Storage cost is not the blocker: **measured, not projected**, on the first
  500 real rows written — 4,286 bytes/document including the tsvector and GIN
  index, projecting to **70–141 GB and $11–35/month** for the full 10-year
  corpus (the wide range is because Patna's sample text is ~half the
  corpus-wide mean length).
- **Founder decision, 11 Aug 2026, in these words**: *"Yes — ingest High Court
  documents as searchable text behind the coverage screen, no embeddings for
  now."* This closes the two founder-blocked questions this document's first
  draft (and `CURRENT_PLAN.md` §Q2) described as still open — see §12.
- **Ranking implication, found the same night**: the product does **not**
  have BM25 (see §3 correction) — `ts_rank` has no IDF, so a common term
  cannot be outranked by a rare one at High-Court scale. Embeddings are also
  out of scope for this ingest (measured: HNSW at full HC scale would be
  ~490 GB, wanting RAM, against pgvector's documented ~5–10M-vector practical
  ceiling — the corpus would need ~41M vectors). The one ranking signal the
  product owns and neither `ts_rank` nor an embedding has is the citation
  graph itself (97,876 resolved edges) — queued as future work, not started.
  A comparison of Vespa (native BM25 + programmable ranking on citation
  count) vs. staying on Postgres was researched this session and queued as a
  founder decision (`FOUNDER_QUEUE.md` FQ-VESPA) — not started, not blocking
  the ingest. Qdrant is out regardless (`CLAUDE.md`'s explicit do-not-use
  list); Milvus was assessed as the wrong shape (vector-first, and the
  product just decided not to build the vectors it would hold).
- Loader (`hc-load.ts`/`hc-load-cli.ts`) is **IMPLEMENTED and RUNNING**:
  `hc-load-cli.ts --from-year 2016 --batch 200 --concurrency 14 --apply`,
  resumable on `source_url`, newest-year-first (deliberately, so an
  interruption leaves the more useful/more-citable half done first). Calls
  the same `upsertJudgments` as the Supreme Court path; deliberately writes
  `documents` not `judgments` in its own log language.
  **`SELECT court, count(*) FROM judgments GROUP BY court` returned exactly
  one row (Supreme Court of India) for the entire life of the project until
  tonight; it returns two now (Supreme Court 38,341, Patna High Court 500 at
  last check), and the count is actively climbing as the batch job runs** —
  not quoted further here because it would be stale within the hour; query
  the database directly for a current figure.
- A separate, standalone **citation-extraction pass over the HC bucket was
  started, then deliberately abandoned rather than restarted after it died**
  — both jobs would download the same 15.77M PDFs, and once the loader has
  the text in `judgments`, `citations-cli --rescan` derives citations from the
  database with no further downloads. What that earlier pass did produce
  before dying (51,097 citations across 367,995 2016-year documents) was kept,
  not discarded: it lives in a **new table, `external_citations`**
  (migration `0030_external_citations.sql`, confirmed present on disk:
  `source`/`source_key`/`citation_key`/`char_offset`/`cited_judgment_id`
  columns, a uniqueness constraint per (source, source_key, citation_key)).
  **Verified this table exists only as raw SQL — it is not yet in
  `packages/db/src/schema.ts`** (grepped both, zero matches in the Drizzle
  source), so the ORM does not know about it yet, and it is also undocumented
  in `SCHEMA_TRUTH.md` as read this session. Two things for whoever next
  touches this: the schema-truth doc's own opening rule ("never add a table
  without updating this file in the same commit") is currently unmet, and a
  Drizzle query against this table would need a raw-SQL escape hatch until
  the schema catches up.

**Licensed/competitor sources** — see §8.

**OCR / scanned intake**: schema exists (`ocr_jobs` table, migration `0020`),
admin read endpoint exists and correctly reports empty. **No OCR engine anywhere
in the codebase** — no `services/ocr`, no PaddleOCR/Tesseract wiring, `POST
/ocr/jobs` is SPECCED. PLANNED only.

**Dedup / provenance**: unique constraint on `judgments.source_url` (dedupes
within a source, not across sources — cross-source identity treated as a
citation-resolution question, not an ingest one). `harvest_fetches` +
`harvest_queue` (migration `0023`) implement a resumable, content-hashed,
de-duplicated fetch ledger and work queue for licensed-source harvest —
**IMPLEMENTED and code-wired** (`services/ingest/src/harvest/store.ts`), not
schema-only.

**Text quality**: `judgment_chunks.text_quality` is a *measured proxy* for OCR
damage (share of well-shaped tokens), explicitly not a correctness signal —
retrieval down-ranks on it, never excludes. `ocr_confidence` is null except
where LawMind's own (nonexistent) OCR engine ran it — never fabricated for
inherited-OCR text.

## 3 · SEARCH / RETRIEVAL

| Layer | Status | Evidence |
|---|---|---|
| Lexical (Postgres `ts_rank` via `tsvector`) | IMPLEMENTED, live | `judgments.full_text_tsv` (stored generated column, `'english'` config — Hindi gets English stemming, a known unresolved gap), gin index. **Not BM25** — confirmed 11 Aug 2026 (`docs/HC_INGEST_PLAN.md` §0.1): `ts_rank` carries no IDF term (a rare term cannot outrank a common one on length/frequency alone), and true-BM25 Postgres extensions (`pg_search`, `pg_textsearch`, `vchord_bm25`) are confirmed **not available** on Railway Postgres — installing one would be a vendor/infra decision, out of scope today. Every other "BM25" reference in this document's diagrams below has been corrected to `ts_rank` for the same reason |
| Dense (BGE-M3, pgvector) | IMPLEMENTED, live | `judgment_chunks.embedding vector(1024)`, **HNSW** index (not ivfflat — migration `0011` superseded an earlier ivfflat build) |
| Hybrid fusion | IMPLEMENTED, live | `services/api/src/search/retrieve.ts` (`hybridSearch`) — the actual production `/search` path |
| Structured query language (qlang) | IMPLEMENTED, live | `qlang/lex.ts`, `parse.ts`, `compile.ts`, `explain.ts` — Boolean, fields, `NEAR/n`, wildcards, ranges. `cite:`, `section:`, `act:`, `judge:`, `type:`, `date:[...]`. **Structure decides, semantics fills, never blended — zero structured matches returns zero**, semantic suggestions in a separate field |
| Citation-graph expansion | **IMPLEMENTED, tested, PROVEN in eval — NOT in the live path.** | `services/api/src/search/graph-expand.ts` is called only from `services/harness/src/retrieval.ts`; `retrieve.ts`/`route.ts` never import it |
| Cross-encoder reranking | **IMPLEMENTED, tested — NOT in the live path.** | `services/embed/src/rerank.ts` (`BAAI/bge-reranker-v2-m3`, q8 default) called only from the harness, not from `route.ts` |
| HyDE | **IMPLEMENTED, tested — NOT wired anywhere**, harness or production. | `services/api/src/search/hyde.ts`; grep confirms zero call sites outside its own test. Additionally gated: requires `dataClass`, and a user query is ambiguous → sensitive-class → refused until the DPA lands regardless |
| Multi-query / RAG-Fusion, query decomposition | PLANNED (recall levers "blocked on nothing but the LLM key," per plan doc) | not found in code this session |
| Facets on `POST /search` | PLANNED, explicitly not built, not in contract | confirmed zero "facet" hits repo-wide |

**Gate S2 (the retrieval quality bar)** was re-specified 9 Aug 2026: the earlier
`success@5 ≥ 0.70` floor is **retired** — CLERC (arXiv 2406.17186), the method
this eval set follows, publishes a **48.3% ceiling** even zero-shot, so 0.70 was
unreachable in the literature at any k. Current gates are two deterministic,
non-recall metrics: `structuredExactness` and `fieldPrecision`, both measuring
**1.0000**. `success@5`/`recall@20` are demoted to **ungraded diagnostics**
(last measured: 17.3% control / 22.3% with graph+reranker, corrected numbers
after a pin-defect fix — see §12).

**Combined graph+reranker result** (n=283, harness-only): success@5 **17.3% →
22.3%**, McNemar p=0.049 ("ships," marginally, on a small set). Neither lever
alone moved it — graph alone: 0 gained/0 lost. **Latency is the blocker to
shipping this combination**: reranking measured at 4,136 ms mean / 4,263 ms p95
against a 3,000 ms whole-request budget (Gate S1) — 1.38× over. Root cause
chain, in order found: real judgment passages are ~50× longer than the
synthetic strings first benchmarked; fp32-on-GPU is slower than q8-on-CPU for
this workload (not faster, as first assumed); 256-token truncation was
measured and **rejected** (fits latency, drops success@5 to 13.8% — worse than
doing nothing); the actual fix applied is a 512-token clip with pre-truncation.
Remaining lever: cut reranked candidates 20→12, keeping the 5 graph slots
(ranks 16–20) alive.

**Embeddings decision** (research-driven, 11 Aug 2026): **GPU should not embed
the High Court corpus.** Published research: BM25 vs dense differ by 0.3pp on
legal passage retrieval (37.1% vs 36.8%); dense retrieval on legal case
retrieval is characterized in the literature as "limited." Measured
independently on this DB: `judgment_chunks_embedding_hnsw` is 4.7GB for
616,197 vectors (embeddings are **7.2× the size of their text**); scaling to
41M HC vectors is ~490GB against pgvector's documented ~5–10M-vector practical
ceiling. **Plan: lexical-first for HC, embed only what the citation pass
proves is cited** (currently 15,218 of 38,341 SC judgments are cited by
anything at all).

## 4 · LEGAL INTELLIGENCE

- **Citation extraction**: regex/pattern-based (`services/ingest/src/
  citations.ts`), **not model-based** — deliberate, primary-source-only rule.
  Currently covers 5 forms (INSC, SCC, AIR…SC, SCR, SCALE), all
  Supreme-Court-centric. Specialist/HC reporters (I.T.R., Cri.L.J.) are
  invisible to it — measured as **zero present impact** (corpus holds no
  matching judgments yet), becomes real the moment HC ingestion lands.
- **Citation resolution**: exact-match only, never fuzzy — "a wrong edge is a
  fabricated statement... which is the failure this product exists to
  prevent." Three refusal guards: exactly-one-candidate, year-guard,
  never-overwrite-an-existing-resolution; a fourth (self-citation exclusion)
  was added because a DB constraint caught 16,790 false resolves in the first
  pass.
- **Treatment classification** (followed/distinguished/overruled/doubted):
  pattern-based on text within 400 chars of a citation offset, **never a
  model** ("a model's opinion about whether a case was overruled is exactly the
  commentary the training-data rule forbids"). 13,389 edges classified;
  precision-over-recall by design — uncertain cases go to a review queue, never
  the column.
- **Alias concordance (AIR/SCC↔SCR)**: derived primary-source — the courts
  print the case name beside the citation they use, corroborated (≥2
  independent citing judgments required), exactly-one-match-or-nothing.
  4,097 aliases. This closes what would otherwise be purchased from a
  commercial concordance.
- **Overruled-status propagation** (`citation_fanouts`): one fan-out mechanism
  serving two triggers (dispute upheld by admin, nightly re-check) —
  deliberately not two implementations. All-or-nothing transaction.
- **Statute/section handling**: lexical only, no embedding column on
  `statute_sections` yet (deliberate — "statutory search is lexical first...
  a vector column is added when semantic statute search is actually built").
  BNS/BNSS/BSA vs IPC/CrPC/Evidence mapping table exists (schema) but is
  **0 rows** — see §2.
- **Currentness/authority analysis**: `overruled_status` is a live-read-only
  field, three states (`set_aside`/`partly_set_aside`/`doubted`) plus `none`,
  **never cached anywhere client- or cache-side** — the single most-repeated
  invariant in the whole project (binding rule, `docs/CITATION_HARNESS.md`).

## 5 · AI/ML STACK

| Model | Role | Status |
|---|---|---|
| BGE-M3 (`Xenova/bge-m3`, MIT) | Embeddings, 1024-dim | IMPLEMENTED, self-hosted, fp32 only (deliberately — quantization would corrupt cross-machine consistency between the rented-GPU batch embed and Railway-CPU query embed) |
| BAAI/bge-reranker-v2-m3 | Cross-encoder reranking | IMPLEMENTED, self-hosted, q8 default; NOT in production path (§3) |
| DeepSeek V4 Flash (OpenRouter) | Public-class calls: search | IMPLEMENTED, verified live call, $0.098/$0.196 per M tok |
| Claude Haiku 4.5 (Anthropic API) | Public-class: extract/OCR-postprocess. Sensitive-class: everything (once unblocked) | IMPLEMENTED for public; sensitive path code-complete but **hard-refused** (two independent gates, both closed — see below) |
| "Claude Sonnet 4.6" for draft/briefing | Named in docs as the drafting model | **Not hardcoded in code.** `draftingModel()` reads `ANTHROPIC_DRAFTING_MODEL` env and refuses if unset |
| Sarvam-1 (Hindi) | Colab pilot, mentioned in decisions log | IDEA / experiment-stage, no code found this session |

**Routing** (`services/api/src/llm/route.ts`, `call.ts`): plain `fetch`, no
vendor SDKs. `routeCall(dataClass, feature)` is a pure function. `assertOneDocument()`
throws on >1 document ID in one call's context (anti-cross-contamination guard,
code-enforced not just policy).

**Sensitive-class calls are refused today, by two independent, both-closed
gates**, quoted verbatim from `call.ts`:
> *"This call requires pseudonymisation and no pseudonymiser exists yet.
> Refusing rather than sending raw sensitive text and recording
> `pseudonymised = true`, which would put a false claim in the audit ledger."*

Gate 1 (`route.ts`): `DPA_COUNTERSIGNED` env, defaults false, **no founder
override**. Gate 2 (`call.ts`): pseudonymiser doesn't exist, so even a signed
DPA today would still be refused at this second check. Every call, refused or
not, writes a row to `llm_calls` (data_class, pseudonymised, cost, latency).

**Pseudonymization**: PLANNED only. No Presidio anywhere in code (grep
confirms). No `pii_entities` table in the schema or migrations — it exists only
in `docs/PRIVACY_PII.md` prose. The refusal scaffold around it is real and
fails closed correctly; the pseudonymiser itself is not built.

**Fine-tuning / training**: **no training loop exists** (no PyTorch, no LoRA,
nothing resembling model training anywhere in the repo). What exists
(`services/api/src/training/extract.ts`) is a consent-gated **data-export**
utility — generates prompt/response pairs on demand from consenting users'
public-facing activity (searches, citation checks/copies, annotations),
**materializes nothing** (so consent withdrawal is retroactive by
construction), and asserts via test that privileged sources (documents, matter
notes/events) can never enter it. Fine-tuning itself is deferred (per decision
log) until ₹3L MRR.

**Local model files on disk** (`.models/`): both q8 and fp32 (+fp16) ONNX
builds physically present for both the embedder and reranker, several GB each.
GPU sidecar (`services/embed/gpu/server.py`, Python `http.server`, DirectML/
CUDA) is a **workstation-only batch tool** for the one-time corpus embed —
not part of the deployed stack (Railway has no GPU).

## 6 · CITATION / EVIDENCE SYSTEM

The mechanism (`docs/CITATION_HARNESS.md`, spec-not-guidance):

1. Hybrid retrieval returns chunks carrying `judgment_id`.
2. Model receives IDs in context; **may reference judgments only by IDs
   present**, never free-text case names.
3. Model returns structured references (ID + claim), never prose citations.
4. **Tier 1** — resolve against `judgments` table → `verified`/`corpus`.
5. **Tier 2** — cross-check IndianKanoon + AWS S3 datasets; both must agree →
   `verified`/`public_x2`, cached permanently.
6. **Tier 3** — human solves eCourts CAPTCHA and vouches → `verified`/
   `ecourts`, cached permanently. **`citations/verify.ts` has zero HTTP
   client, confirmed by grep this session** — it only builds a pre-filled
   eCourts search URL for the advocate; nothing auto-submits or reads a
   CAPTCHA.
7. **Tier 4** — nothing confirms → explicit `unverified`, never dropped, never
   shown confirmed.
8. Render every field from the DB row, never from model output.
9. `overruled_status` checked independently, live, every render, regardless
   of verification outcome — a judgment can be verified AND overruled.

**Three independent fields, never one enum**: `verification_state`
(verified/unverified/failed), `verified_by_source` (7 DB values —
`ecourts` > `public_x2` > `ecourts_bulk` > `licensed` > `corpus` >
`indiankanoon`/`aws_s3` (both collapse to `none` on the wire) — a row may
climb this ladder, never fall), `overruled_status` (on `judgments`, separate
table entirely). Five UI badge states are **derived at render time**, never
stored.

**UI rule (revised 1 Aug 2026)**: verified renders **silently, no badge** —
only `unverified`/`failed` (unmissable mark) and `overruled_status != none`
(`LAW MOVED`, three sub-states) draw anything. Verification detail is
pull-only (draft footer summary, tap-to-see-source, admin monitor).

**eCourts CAPTCHA bypass — permitted since 8 Aug 2026 for bulk harvest only,
scoped narrowly.** Code-level finding this session: the **permission is
transcribed and gated correctly** (`captchaBypassPermitted: true` in the grant
object) but **`captchaBypassAllowed()` is never called anywhere in
non-test code**, and `ecourts.ts` has zero CAPTCHA-handling logic —
`parseCauseList()` is an unimplemented stub returning `parser_not_implemented`.
So: the authorization exists, the guard structure exists (order: non-null
grant → not expired → kill switch → court/hours permitted → live rate-limit
query against `ecourts_fetch_ledger`), but nothing yet exercises the bypass —
PARTIAL, scaffold-only.

**Metrics with zero thresholds, gate-blocking**: hallucination rate, silent-
drop rate, overruled leakage, adversarial pass rate (100% required). Last
measured (9 Aug): hallucination 0/31 (below observation floor), silent-drop 0,
**adversarial pass rate 20.0% — FAILS** the 1.0 threshold. Stale-overruled rate
is computed by SQL query (not a separate service) over existing
`citation_checks` rows, with an explicit, documented list of five things it
structurally cannot catch (offline renders, post-copy renders, long-lived
screens, a corpus that never ingested the overruling judgment, and its own
retrospective-not-preventive nature).

**Citations locked in editing (PD-7)**: enforced server-side, not just UI —
`PATCH /documents/:id` re-extracts citation spans from submitted prose and
`422`s on any divergence from the server's authoritative `citation_checks`
set. Changing an authority must go through `POST /documents/:id/citations`,
which re-runs verification tiers.

## 7 · RAG / AGENTS / RLM

**Implemented**: the citation-harness RAG mechanism above (retrieve→ground→
verify→render), the harness's own generation grading (`services/harness/src/
generate.ts` — calls OpenRouter directly, extracts `[E#]` citation markers,
checks them against supplied evidence, is the mechanism that computes
hallucination/silent-drop). This is an **evaluation harness**, not a
user-facing generation endpoint yet — the live `/search` production path
returns retrieval results, not LLM-generated prose.

**Not implemented**: no agent framework (no LangChain/LlamaIndex/CrewAI
dependency anywhere), no multi-step tool-using agent loop, no RLM (reasoning
LM / long-context reasoning pipeline) of any kind found in code. HyDE (query
rewriting via a generative hop) is the closest thing to an "agentic" step and
it is unwired (§3, §5).

**Drafting** (core feature #3) has **no generation path at all** —
`POST /documents` is SPECCED, not built. `generated_content` appears only in
three test files, all tests. The blocking chain (found and stated in the plan
doc, verified consistent with code this session): drafting is sensitive-class
→ `callModel` refuses sensitive calls until a pseudonymiser exists →
pseudonymiser's own first step is an unrun evaluation (Presidio has never been
measured against real Indian court documents) → the DPA (OD-6) is a separate,
later gate. What's buildable without any of that (`inputParams` validation
against `documents/types.ts` `requiredFields`) was deliberately **not** shipped
alone, since an endpoint whose only behavior is an error isn't worth shipping.

## 8 · COMPETITOR / TEACHER DATA

| Source | Purpose | Code status | Permission status |
|---|---|---|---|
| AWS Open Data (SC + HC) | Bulk corpus, free, CC-BY-4.0 | IMPLEMENTED, loader live for SC; HC loader code-complete, unexecuted | Unconditional (public domain-equivalent under s. 52(1)(q)(iv)) |
| ~~e-SCR (`digiscr.sci.gov.in`)~~ — **RETRACTED 11 Aug 2026, LCC**, `docs/RESEARCH_2026-08-11.md` §3a | That URL was never fetched and does not resolve. Real site `scr.sci.gov.in` is CAPTCHA-gated (outside our eCourts grant's scope) and has no SCC/AIR search field — cannot close the SCC/AIR↔S.C.R. gap it was cited for | Not integrated, and not a viable path | Would need its own authorization decision even for the human-paced verification use it does support |
| `judgments.ecourts.gov.in` | Free full-text SC+HC search | Not integrated | Free/official |
| IndianKanoon | Tier-2 citation cross-check | IMPLEMENTED (`harvest/indiankanoon.ts`) — metered, per-call priced (search 50 paise / doc 20 / fragment 5), refuses without budget or token, **never a render path** (their attribution requirement + being a direct competitor via "Prism") | No bulk API found to exist — accounts/website only, per decision log; the metered client stays built and refusing "permanently" per plan doc |
| Supreme Today (₹50,000/mo) | Editorial layer: HC/tribunal headnotes, Authority Check treatment data, not raw judgments | IMPLEMENTED client (`harvest/supremetoday.ts`) — AIMD-paced, budget-ceilinged, halts pool-wide on 401/403 | Account was to be purchased; day-one measurement protocol built (§1 of plan, "complete") |
| Bharat.Law (2–3 accounts, ₹1,499/mo) | Competitive research: does their treatment data resolve cases ours can't | IMPLEMENTED client (`harvest/bharatlaw.ts`), account-pool with pool-wide halt on any single 401/403 | **`AUTHORISATION.extractionPermitted: false`** in the live code, despite the adjacent code comment narrating it was set true 10 Aug — **code/comment disagreement found this session**, extraction stays off as committed. `benchmarkPermitted: true` (comparative eval only, no data retention) |
| eCourts (registrar grant, 7 Aug 2026–1 Jan 2029) | Daily loop: cause lists, case status, orders — **not a bulk corpus** (1,000 req/day cap ≈ 876,000 requests over the grant period; harvesting 15.9M judgments this way would take 43 years) | Scaffold IMPLEMENTED (guard order, ledger, rate limiter, kill switch OFF by default); parser is an unimplemented stub; CAPTCHA-bypass code path unused (§6) | Bounded, written, expires automatically |
| eCourtsIndia and similar scraper-resellers | — | **Never built.** No client exists in code (confirmed by grep) | **Permanently refused** — "access was never authorised, buying it launders someone else's offence" |
| ILDC dataset | — | Not used | Non-commercial license, disqualifying |
| `nisaar` instruction-tuning sets | Considered as training data | **Never used** — audited and found to contain verifiable legal errors (bail application for a civil matter, fabricated dissent, a landmark case stated backwards); kept only as **adversarial evaluation material** | Rejected under the primary-sources-only training rule |

## 9 · INFRASTRUCTURE

**Dated 11 Aug 2026 — a snapshot, not the current runtime.** See the current
delta at the top of this file and `docs/CURRENT_STATE.md` §11.

- **Compute**: Railway (Singapore region — no India region exists; flagged as a
  known, still-open DPDP residency gap, OD-2, with a stated migration path
  before the 13 May 2027 compliance deadline). Services: `api`, `admin`,
  `cron` (three cron configs — sweep + recheck confirmed deployed; cause-list
  sync CLI not found in `services/cron/src` this session, appears still
  PLANNED despite a DB table existing for it), Postgres 16 + pgvector.
  Three environments (dev/staging/prod), each its own Postgres instance.
- **Corpus ingest**: explicitly NOT on Railway — one-time/batch jobs on a
  workstation or rented GPU box (Lambda Labs/RunPod named in docs; local
  RTX 4060 Ti actually used per the plan doc's CPU/GPU embedding measurements).
- **Object storage**: Cloudflare R2. Brotli-compressed judgment text (never
  the source PDF — a `storage_key` pointer into AWS's own bucket is stored
  instead). Metered client refuses over a spend ceiling before the network
  call, not after (`packages/storage/src/spend.ts`); ledger is aggregated per
  run/window (`r2_operation_ledger`), not per-object, deliberately — a
  per-object ledger at 15.9M scale would itself become the write-amplification
  pattern it exists to catch.
- **Database**: Postgres 16 + pgvector, Drizzle-migrated (31 migrations),
  HNSW index for vectors, gin for full-text. A Railway TCP proxy was used for
  local access during migration application — still LIVE at time of last
  read, flagged to be deleted, not yet done.
- **Vector store**: pgvector only. No separate vector DB anywhere in code or
  dependencies (grep confirms zero Qdrant/Pinecone/Weaviate/Milvus references
  outside docs stating they are explicitly not used).
- **Auth**: better-auth self-hosted, own Postgres tables (`auth_*` prefixed),
  JWT access token + rotating opaque refresh token with reuse detection
  (`refresh_tokens`, SHA-256 hashed, never stored readable).
- **Email**: Resend (swapped from Postmark 7 Aug 2026).
- **Observability**: Sentry, PostHog (both env-var-configured; depth of
  integration not verified this session).
- **CI**: GitHub Actions, PR + manual dispatch only (not on every push, to
  conserve free-tier minutes) — `server` job (Postgres+pgvector service
  container, lint/format/typecheck/migrate×2/test) and `design-rules` job.
  Mirrored locally as `pnpm ci:local` (`scripts/ci-local.mjs`), which is the
  thing actually meant to run before every push. **Six guard scripts total**
  (contract-status, schema-truth, alert-coverage, amber-reservation,
  design-rules, design-renders) — two of six (`alert-coverage`,
  `amber-reservation`) were found wired into **neither** CI nor `ci-local` for
  an unknown period and were red when finally run. **`amber-reservation` was
  fixed and wired into both during this session** (10 files now permitted to
  draw the reserved amber colour, all correctly about overruled status);
  **`alert-coverage` remains red as of the last status check this session**
  (Q1.10 — two of four PD-5 alert kinds still have no producer, unchanged from
  the rest of this document).
- **No `.env.example`** anywhere in the repo — env var names are documented
  in prose (`DEPLOYMENT.md`) and enforced via `required()` guards in each
  service's own `env.ts`.

## 10 · CODE / REPOSITORY STRUCTURE

```
apps/            mobile (Expo), admin (Next.js)
services/        api (Hono server), cron (2 CLIs), embed (BGE-M3 + reranker
                 + GPU sidecar), harness (eval tooling, not deployed),
                 ingest (acquisition + derivation CLIs, not deployed)
packages/        auth (better-auth), db (Drizzle schema/migrations),
                 storage (R2 client + metering + spend ledger)
docs/            ~65 files — spec of record. SCHEMA_TRUTH.md (data shapes),
                 CITATION_HARNESS.md (the verification spec), API_CONTRACTS.md
                 (mechanically-checked endpoint status), CURRENT_PLAN.md
                 (single ordered work queue, ~1,850 lines, LCC-owned),
                 OPEN_DECISIONS.md / PRODUCT_DECISIONS.md (unsettled vs
                 settled, both binding)
design/          screen specs and renders (referenced, not audited this
                 session)
sprints/         per-sprint task breakdowns
scripts/         6 CI guard scripts + ci-local.mjs + measure-recall.mjs +
                 agent-lane coordination tooling (lane-inbox.mjs, lane-send.mjs)
.agents/         inter-agent message bus (active lanes SHIP/DATA/RED since v7.4 A1;
                 legacy LCC/RCC/NEW1-3/FIFTH history kept as written — a
                 build-process artifact, not product code)
```

Root also carries several large `.zip` files (`3sxc.zip`, `qaw.zip`, `qw2.zip`,
`qwqw.zip`, ~49MB each) and stray log/pid files (`hc-citations.log`,
`.err`, `.pid`, `rescan-apply.log`) from in-progress ingest runs — not
gitignored cleanup, not further investigated this session.

**Test maturity**: `services/harness` 9 test files / 101 test blocks;
`services/api/src/search` 7 files / 69 blocks; `services/api/src/llm` 2/21;
`services/api/src/citations` 5/35. TDD-style, heavy unit coverage on
deterministic logic (parsing, scoring, routing, extraction); `.live.test.ts`
suffix marks tests that hit a real DB/network, presumably excluded from
default CI.

## 11 · CURRENT STATUS — the single most important finding this session

**Dated 11 Aug 2026 — a snapshot, not the current runtime.** See the current
delta at the top of this file and `docs/CURRENT_STATE.md` §11.

**The database is ahead of the deployed code, and the deployed code is 43
commits behind `main`.** Verified 11 Aug 2026 by both lanes independently:
`git rev-list --left-right --count origin/main...main` reads `0 43`.
Production `/search` for `cite:"(1994) 3 SCC 1"` returns the **wrong case**
(Kaushal Kishor instead of S.R. Bommai) with **no `parsed` field** — i.e., the
deployed API silently returns an ordinary semantic result for a query the code
on `main` would recognize as a citation lookup and either resolve exactly or
return zero for. This is flagged as a product-safety issue, not merely a stale
deploy, because it is exactly the failure mode structured search was built to
prevent (a plausible-but-wrong result with nothing marking it as
misunderstood). All three pending migrations are already applied to
production, so a push is schema-safe; the deploy *mechanism* itself
(auto-deploy on push?) is unverified. This is recorded as a founder-only
decision (pushing is outward-facing), not resolved by either agent lane.

| Feature | Status |
|---|---|
| Court search, keyword+structured, hybrid retrieval | IMPLEMENTED (deployed code lags — see above) |
| Citation verification (3-tier + explicit unverified state) | IMPLEMENTED |
| Overruled/citator status | IMPLEMENTED (81 of 38,341 flagged; nightly re-check running) |
| 24-hour hearing briefing | IMPLEMENTED (generation + delivery via cron; advocate-typed dates are first-class, not a fallback) |
| Document drafting | **NOT IMPLEMENTED** — no creation path exists; blocked on pseudonymiser → DPA chain (§7) |
| Matter workspace | IMPLEMENTED (CRUD + sharing + events + private/shared notes) |
| Daily-loop screens (Tier B: cause list, adjournment, client update, limitation calc, bare acts, fee log) | Designed; largely unbuilt in the product per the still-open sequencing decision (OD-11) — Tier A has in practice shipped first, contradicting the brief's stated sequencing, and nobody has resolved which order is authoritative |
| Alerts (PD-5, 4 trigger types) | **PARTIAL — 2 of 4 cannot fire.** `alert_kind` enum has 2 of the 4 promised values; the app offers toggles for alerts the backend cannot produce; caught only by running a guard script nobody had run |
| Saved-search feed | Server BUILT, client HELD pending a founder confirmation that a reframe of a settled decision (PD-5) is acceptable (OD-12) |
| OCR intake | PLANNED only, no engine |
| Reranking / graph-expansion / HyDE | Code-complete, proven or partially proven in offline eval, **not in the live request path** |
| Sensitive-class LLM routing (drafting, uploaded documents) | Refuses by design, correctly, pending DPA + pseudonymiser |
| eCourts bulk harvest | Scaffold real, parser unimplemented stub, never run in production |
| High Court corpus | **RESOLVED and RUNNING mid-session** — founder approved 11 Aug 2026 (text-only, no embeddings); Patna HC landed first (500 docs at last check, actively growing); HC documents with no citation at all are a new, unresolved rendering question (§2) |

## 12 · EXISTING DECISIONS, ASSUMPTIONS, LIMITATIONS, TECH DEBT

**Settled decisions relevant to architecture** (`PRODUCT_DECISIONS.md` PD-1…14,
do not reopen without cause): SMS OTP any number / enrolment verified
separately (PD-1); full access while enrolment pending (PD-2); per-matter
sharing, no chamber-wide default (PD-3); private-by-default notes (PD-4);
4-trigger alert set, subject-following excluded from notifications (PD-5);
alerts batched into evening briefing except two immediate exceptions (PD-6);
paragraph-level editing, citations locked (PD-7); AI-mark watermark removed,
replaced by onboarding consent (PD-8, supersedes an earlier decision); 6-item
reading-view priority (PD-9); search filter set for v1 (PD-10); tier names
Practice/Chamber/Expert/Firm/Enterprise (PD-13); founding-offer terms (PD-14).

**Open decisions, never silently resolved** (`docs/OPEN_DECISIONS.md`):
court-monitoring vendor trial pending, does not block anything (OD-1); Tier B
vs Tier A sequencing contradiction, unresolved, and Tier A has been built
first by default (OD-11); saved-search feed reframe needs founder sign-off
(OD-12); alternative billing deferred to 1,000 paying users (OD-10).

**RESOLVED mid-session, 11 Aug 2026** — the two founder-only scope questions
that had blocked High Court ingest (both reframed 11 Aug after being costed
wrong initially: (1) ship 2023+ HC documents, citable via in-text neutral
citations, now, vs. hold the whole decade behind honest coverage until a
citation source exists for pre-2023; (2) embedding budget, reframed from a
GPU-hours question — struck, measured at 6.3h on a locally-owned GPU — to a
**storage/scaling** one: embeddings are 7.2× their source text's size, and
naive full-HC embedding would exceed pgvector's practical ceiling ~4×) — were
answered by the founder in one instruction: *"ingest High Court documents as
searchable text behind the coverage screen, no embeddings for now."* That
answers (2) outright (no embeddings, period) and narrows (1) to an execution
order rather than an open scope question (ingest everything as
searchable/citable-where-possible, newest year first). Ingest is now running
(§2). What is **newly** queued as a result, not yet a founder decision made:
whether to adopt Vespa for BM25-with-IDF + a citation-count ranking signal, or
stay on Postgres `ts_rank` (`FOUNDER_QUEUE.md` FQ-VESPA).

**Known technical debt / defects found and fixed this sprint** (recorded
because the corrections are as informative as the current state):
- A query-classifier defect (`query-shape.ts`) was pinning the wrong judgment
  at rank 1 for 13.1% of citation-shaped eval queries, inflating every prior
  retrieval measurement — found, fixed, all downstream numbers re-measured.
- The reranker was scoring 37.6% of candidates against an **empty string**
  (a field reused for both display and ranking that had quietly diverged in
  meaning) — found, fixed, latency numbers before the fix were understated as
  a direct consequence.
- A regex citation-year pattern silently matched nothing (a `\d` that doesn't
  survive a JS tagged template into Postgres) — found via a database
  constraint firing, not by inspection.
- Postgres planner statistics were a week and three migrations stale,
  causing sequential scans instead of index scans on newly-added columns
  (1,237× slower on one path) — not a missing index, an unanalyzed one; new
  standing rule added (`ANALYZE` after every migration that touches a table).
- Two CI guard scripts (`check-alert-coverage.mjs`, `check-amber-reservation.mjs`)
  existed, were correct, and ran in neither CI nor local CI for an unknown
  period — both were red the first time anyone ran them.

**Stated, unresolved limitations** (not defects, disclosed as such in the
docs): Hindi full-text search uses English tsvector stemming/stopwords
(Postgres ships no Hindi config); PII detection coverage is a measured ~80–99%
depending on which document is asked (two different figures exist in the repo
and are flagged as needing reconciliation — see `data_requests` schema note
disputing its own adjacent paragraph); the harness checks citation
*existence*, not *characterization* — it would not catch a real citation
attached to a mischaracterized holding, a gap the team identified from
published research on competitor hallucination rates but has not yet built
against; offline citation renders are a structurally unmeasurable blind spot
for the stale-overruled metric.

## 13 · ROADMAP (documented, not yet built)

- Drafting generation path (blocked on pseudonymiser + DPA)
- OCR pipeline (PaddleOCR primary / Tesseract fallback decided; nothing built)
- ~~High Court corpus ingest (blocked on 2 founder decisions above)~~ —
  **RESOLVED 11 Aug 2026, mid-session: approved and running.** What remains on
  the roadmap is the *ranking* consequence (§2/§3): a citation-count ranking
  signal, and a founder decision on Vespa vs. staying on Postgres
  (`FOUNDER_QUEUE.md` FQ-VESPA), both queued, neither started
- Open UI/copy question: how to render a real judgment with no citation at all
  (distinct from `unverified`) — raised on the agent bus, unanswered as of
  the last message this session
- Reranking/graph-expansion/HyDE promotion from harness-only to the live
  `/search` path, pending the latency fix (12-candidate cut) and (for HyDE)
  the DPA
- Two missing alert-kind producers (`own_matter_judgment`, `unknown_listing`)
  needed to make PD-5/PD-6 fully deliverable
- Saved-search client surface (pending OD-12)
- Facets on `/search`
- Delete the still-live Railway TCP proxy
- Six daily-loop (Tier B) screens — designed, mostly unbuilt
- Self-hosted OCR upgrade path already scoped (Qwen3-VL-8B vs current
  PaddleOCR/Tesseract benchmark floor) — IDEA stage, contingent on OCR
  shipping at all first
- Offline-first retrieval (sqlite-vec / op-sqlite) — IDEA, no dependency
  present in any package.json
- Fine-tuning — explicitly deferred to ₹3L MRR
- Alternative Play Store billing — deferred to 1,000 paying users
- eCourts CAPTCHA-bypass code path and cause-list parser — scaffolded,
  unimplemented

---

## DIAGRAMS

### Current architecture

**Dated 11 Aug 2026 — a snapshot, not the current runtime.** See the current
delta at the top of this file and `docs/CURRENT_STATE.md` §11.

```
                         ┌─────────────────┐
                         │   apps/mobile    │  Expo (iOS/Android)
                         │   apps/admin     │  Next.js (web, internal)
                         └────────┬─────────┘
                                  │ HTTPS
                         ┌────────▼─────────┐
                         │   services/api    │  Hono, Railway, port 3000
                         │  (search, docs,   │
                         │  matters, admin,  │
                         │  citations, auth) │
                         └───┬────────┬──────┘
              in-process lib │        │ SQL (postgres driver)
                    ┌────────▼──┐  ┌──▼─────────────────────┐
                    │services/  │  │  Railway Postgres 16     │
                    │embed      │  │  + pgvector (HNSW)       │
                    │(BGE-M3    │  │  Drizzle-migrated, 31    │
                    │ CPU query,│  │  migrations              │
                    │ reranker) │  └──────────┬──────────────┘
                    └───────────┘             │
                                  ┌────────────┴───────────────┐
                                  │                             │
                         ┌────────▼────────┐          ┌─────────▼────────┐
                         │  services/cron    │          │  packages/storage │
                         │  sweep (23:00 IST)│          │  → Cloudflare R2   │
                         │  recheck(22:30IST)│          │  (brotli text,     │
                         └───────────────────┘          │  never PDFs)       │
                                                          └────────────────────┘

  Offline / not-deployed tooling (workstation or CI only):
  services/ingest  → AWS S3 (SC+HC judgments), indiacode.nic.in (statutes),
                     harvest/ clients (Supreme Today, Bharat.Law, IndianKanoon,
                     eCourts) — all write into the same Postgres above
  services/harness → reads Postgres directly, grades retrieval/generation,
                     never serves a request
```

### Current data flow (a search request, as actually deployed today)

**Dated 11 Aug 2026 — a snapshot, not the current runtime.** See the current
delta at the top of this file and `docs/CURRENT_STATE.md` §11.

```
advocate query
   │
   ▼
POST /search  (services/api/src/search/route.ts)
   │
   ├─ qlang parse? ──yes──▶ structured.ts / qlang compile ──▶ exact SQL match
   │                                                          │
   │                                              zero matches → return ZERO
   │                                              (never falls back silently)
   │
   └─ no / qlang empty ──▶ retrieve.ts: hybridSearch()
                              ├─ ts_rank (tsvector, gin index — NOT BM25, no IDF)
                              └─ dense (BGE-M3 query embed, CPU, pgvector HNSW)
                              → RRF-fused ranked list
                              [reranker / graph-expansion / HyDE: NOT called here —
                               proven only inside services/harness, not live]
                              │
                              ▼
                     citation resolution (citation_checks row per result)
                     → verification_state / verified_by_source read from DB
                     → overruled_status read LIVE from judgments (never cached)
                     │
                     ▼
                render: verified = silent · unverified = unmissable mark
                        · overruled = LAW MOVED banner, independent of the above
```

### Current retrieval pipeline (as measured in the eval harness — ahead of production)

**Dated 11 Aug 2026 — a snapshot, not the current runtime.** See the current
delta at the top of this file and `docs/CURRENT_STATE.md` §11.

```
query ──▶ classifyQuery (citation/section/case-name/concept shape)
   │
   ├─ exact citation/section lookup (qlang) — pinned only if the citation
   │  IS the query (fixed 9 Aug: no longer pins on mere co-occurrence)
   │
   └─ hybrid: ts_rank ⊕ dense(BGE-M3)   [NOT BM25 — see §3]
        │
        ▼
     citation-graph expansion (graph-expand.ts) — pulls in cited/citing
     judgments the text similarity missed, enters around rank 16
        │
        ▼
     cross-encoder rerank (bge-reranker-v2-m3, 512-token clip)
        │  neither lever alone moves success@5; together +4.9pp (p=0.049,
        │  n=283, not yet settled — needs ~577 queries)
        │  BLOCKED FROM PRODUCTION: 4,136ms mean latency vs 3,000ms budget
        ▼
     top-5 results, citation-verified, overruled-status-checked live
```

### Current citation/evidence pipeline

**Dated 11 Aug 2026 — a snapshot, not the current runtime.** See the current
delta at the top of this file and `docs/CURRENT_STATE.md` §11.

```
model output (IDs only, no prose citations)
   │
   ▼
Tier 1: match judgments.id ──found──▶ verified / corpus
   │ not found
   ▼
Tier 2: IndianKanoon + AWS S3 cross-check, BOTH must agree
   │ found & agree ──▶ verified / public_x2  (cached permanently)
   │ eCourts bulk (registrar grant, machine) ──▶ verified / ecourts_bulk
   │ disagree/miss
   ▼
Tier 3: human solves eCourts CAPTCHA, vouches (verify.ts — NO http client)
   │ confirmed ──▶ verified / ecourts  (cached permanently, never downgraded)
   │ not confirmed
   ▼
Tier 4: unverified — shown, unmissable mark, never dropped

  ── independently, every render ──
  read judgments.overruled_status LIVE (never cached)
  → none: nothing extra · set_aside/partly_set_aside/doubted: LAW MOVED banner
    (set_aside additionally disables add-to-matter)
```

### Implemented vs planned matrix

| Capability | Implemented | Live (production path) | Planned/blocked |
|---|---|---|---|
| Keyword/lexical search (`ts_rank`, not BM25) | ✅ | ✅ | true BM25 extension unavailable on Railway Postgres |
| Vector/dense search | ✅ | ✅ | |
| Structured query language | ✅ | ✅ | facets |
| Hybrid fusion | ✅ | ✅ | |
| Citation-graph expansion | ✅ | ❌ (harness only) | promotion to live pending latency fix |
| Reranking | ✅ | ❌ (harness only) | same |
| HyDE | ✅ | ❌ (unwired anywhere) | blocked on DPA regardless |
| 3-tier citation verification | ✅ | ✅ | |
| Overruled/citator tracking | ✅ | ✅ | wider treatment-language coverage |
| Statute/section search | ✅ (lexical) | ✅ | semantic layer not started |
| IPC↔BNS mapping | ❌ | — | blocked on a source, not a parser |
| Briefings | ✅ | ✅ | |
| Matter workspace | ✅ | ✅ | |
| Drafting generation | ❌ | — | blocked on pseudonymiser → DPA |
| OCR | ❌ | — | no engine chosen-and-wired yet |
| Sensitive-class LLM routing | ✅ (refuses correctly) | refused | DPA + pseudonymiser |
| Public-class LLM routing | ✅ | ✅ | |
| eCourts bulk harvest | partial (scaffold) | ❌ | parser unimplemented |
| Licensed-source harvest (Supreme Today, Bharat.Law) | ✅ (clients) | gated off / benchmark-only | founder-level consent/purchase decisions |
| High Court corpus | code-complete loader, **RUNNING** | 🔶 growing live (Patna HC landed) | founder-approved 11 Aug; ranking-signal + Vespa-vs-Postgres decision still queued |
| Fine-tuning | ❌ | — | deferred to ₹3L MRR |
| Agent framework / RLM | ❌ | — | not on any roadmap doc found |

## KNOWN GAPS AND UNRESOLVED QUESTIONS (this session's own)

- Admin backend completeness (`docs/ADMIN_SURFACE.md`) — referenced by the API
  contracts file as tracking per-section endpoint gaps; not independently
  read/audited this session.
- Exact current deploy state of every individual route (only the citation
  search path was spot-checked against production).
- Whether the fp32 reranker actually loads today — the code comment says no,
  the file is present with a timestamp suggesting it was fetched after that
  comment was written; not re-tested this session.
- PII coverage figure: two different numbers exist in the schema doc itself
  (99.2% vs ~80%), flagged there as unreconciled, not resolved here.
- Full content of `design/` (screen specs/renders) not read this session.
- Whether `services/cron`'s cause-list-sync capability exists anywhere despite
  its own table (`cause_list_syncs`) — no corresponding CLI was found in
  `services/cron/src` this session; DEPLOYMENT.md's older text says it isn't
  built, but that doc self-flags as possibly stale on this exact point.
