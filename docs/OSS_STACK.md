# OSS STACK — DO NOT BUILD WHAT EXISTS

**Founder's instruction: search for a maintained OSS project before building any
non-differentiating component.** Every choice below records the pick, its licence,
and why.

## The licence rule

**MIT · Apache 2.0 · BSD are fine. AGPL is not** — it would force us to
open-source the server. Check every licence at source before adopting, and record
it here in the same commit.

> **What this file can and cannot tell you.** Licences below are recorded from
> knowledge and are stable facts, but **star counts, last-commit dates and open-issue
> counts were not verifiable from this session** and are marked `VERIFY`. Confirm
> maintenance status on the repo before adopting. A correct licence on an abandoned
> project is still a bad choice.

---

## 1 · Already decided

| Need | Use | Licence | Note |
|---|---|---|---|
| OCR — primary | **PaddleOCR** | **Apache 2.0** | Already correct in `docs/OCR_PIPELINE.md` and `docs/OPEN_DECISIONS.md` — **no MIT to correct anywhere in the repo** |
| OCR — fallback | **Tesseract** | **Apache 2.0** | Mature `hin` trained data |
| Indian language translation | **IndicTrans2** (AI4Bharat) | MIT | |
| Indian language corpus | **IndicCorp v2** (AI4Bharat) | CC-0 | |
| Fine-tuning | **Unsloth** + HF PEFT + TRL | Apache 2.0 | Blocked until ₹3L MRR |
| Build discipline | **ponytail** | MIT | `.ai/02-tools.md` |

Both OCR engines are Apache 2.0, so **OD-7 is a pure quality bake-off with no
licensing dimension** — decide on field-extraction accuracy alone.

---

## 2 · Searched — adopt these

| Component | Pick | Licence | Why | Maintenance |
|---|---|---|---|---|
| **PDF → text, digital** | **pdfplumber** | MIT | Good layout and table extraction, which is what court orders need | `VERIFY` |
| ~~PyMuPDF~~ | **REJECTED** | **AGPL** | Disqualifying — would force the server open. Commercial licence exists; not worth the dependency | — |
| **Devanagari / Indic NLP** | **indic-nlp-library** + AI4Bharat IndicNLP suite | MIT | Tokenisation, script normalisation, transliteration | `VERIFY` |
| **PII / NER base** | **Presidio** (Microsoft) | MIT | Framework, recognisers, and a re-identification story. **The base only — see §3** | `VERIFY` |
| **`.docx` generation** | **python-docx** | MIT | Mature, styles survive | `VERIFY` |
| **PDF generation** | **WeasyPrint** | BSD | HTML/CSS → PDF, so one template drives both outputs. **Must embed Noto Devanagari** — verify in the bake-off | `VERIFY` |
| — alternative | ReportLab | BSD (open-source toolkit) | Lower-level, more control, more code. Prefer WeasyPrint unless font embedding fails | `VERIFY` |
| **Cross-encoder reranking** | **sentence-transformers** | Apache 2.0 | Rerankers, and the same library likely serves query embedding | `VERIFY` |
| **Job queue** | **pg-boss** | MIT | **Postgres-backed — no new service, no Redis, one bill.** `BullMQ` is also MIT but needs Redis, which breaks the one-vendor constraint | `VERIFY` |
| **i18n** | **i18next** | MIT | Do not hand-roll | `VERIFY` |
| **PDF viewing in Expo** | **react-native-pdf** | MIT | Confirm Expo SDK 52+ and New Architecture support before committing | `VERIFY` |
| **Full-text + vector** | **Postgres FTS + pgvector** | PostgreSQL licence | Already chosen. No second datastore | — |

### Two picks that deserve their reasoning stated

**pg-boss over BullMQ.** Both MIT, both good. BullMQ needs Redis, and
`docs/OPEN_DECISIONS.md` records *"Railway only, one bill"* as resolved. Adding
Redis for a queue that will handle a nightly sweep and an OCR pipeline is a second
service to run, monitor and pay for. pg-boss uses the Postgres we already have.
**Do not write a queue** either way.

**WeasyPrint over ReportLab.** The draft already renders as styled content; HTML/CSS
→ PDF means one template produces both `.docx`-adjacent and PDF output rather than
two divergent layout implementations. **This is conditional on Devanagari font
embedding working** — `PRODUCT_BRIEF.md` calls a missing-glyph box in a court
filing a product failure, so this is a gate, not a preference. If WeasyPrint fails
that test, ReportLab.

### Hybrid ranking — confirm before writing our own

Postgres FTS + pgvector is settled. Before writing an RRF (reciprocal rank fusion)
implementation, **check whether pgvector or a maintained extension already does
hybrid ranking well enough.** RRF is ~20 lines and is a legitimate write-it case if
nothing fits — but check first. This is exactly a ladder step 5 vs step 7 decision.

---

## 3 · Nothing suitable exists — this is our engineering surface

**This list should be much smaller than the feature list. It is.**

| Component | Why nothing fits |
|---|---|
| **Indian legal citation parsing** | No maintained project handles Indian citation formats — SCC, SCC OnLine, AIR, neutral citations, per-High-Court reporters, and the parenthetical-year conventions that vary between them. **Genuinely ours to build**, and it is close to the core: `docs/CITATION_HARNESS.md` normalises citations for `verification_cache`, so this is a differentiating component, not plumbing |
| **The three-tier verification pipeline** | By definition ours. **Exempt from ponytail simplification** (`.ai/02-tools.md`) |
| **Briefing generation** | The wedge. No competitor has it, so nothing to adopt |
| **Limitation calculator** | Per-Act, per-article Indian limitation rules with a stated basis. No OSS equivalent; and a wrong answer here is malpractice, so a third-party black box would be the wrong choice even if one existed |
| **Court fee calculator** | Per-state fee schedules. Same reasoning |

### PII for Indian names — Presidio is the base, not the answer

Presidio is MIT and is the right framework. **Its recognisers are built and
benchmarked on English and Western name patterns.** `docs/PRIVACY_PII.md` records
that Indian names, transliteration variants and Devanagari make NER materially
harder than English benchmarks suggest, and that realistic coverage is ~80%.

**Adopt the framework, build and evaluate custom recognisers on real Indian court
documents.** Do not trust an English benchmark number. The evaluation is the work;
the framework is free.

### eCourts / cause list parsing — search before S3

Several eCourts scrapers exist on GitHub. **Check licence, freshness and whether
they still work** — eCourts markup changes, and an abandoned scraper is worse than
none because it fails silently. `docs/ADMIN_SURFACE.md` §14 already treats a
silently-empty cause list as worse than an outage.

**Never adopt anything that bypasses the eCourts CAPTCHA.** That is a standing
rule in `docs/CITATION_HARNESS.md` and disqualifies a scraper regardless of its
licence.

Related: **OD-1** decides the commercial court-data vendor. An OSS scraper is not
a substitute for that decision — it is a possible input to the manual path.

### Offline sync / outbox

`docs/SCHEMA_TRUTH.md` already specifies the outbox pattern with idempotency keys,
and TanStack Query handles the client cache. **Look for a pattern library before
rolling our own**, but the shape is already constrained by the schema, so this is
likely a small amount of our own code rather than a dependency.

---

## 4 · How to add a row here

1. Search for the leading maintained project.
2. **Check the licence.** AGPL → reject and record the rejection.
3. Check stars, last commit, open issues.
4. Record the pick **and** the alternative it beat, with the reason.
5. If nothing fits, add it to §3 with why — that list is the real engineering
   surface and should stay short.
