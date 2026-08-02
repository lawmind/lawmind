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
| OCR — primary | **PaddleOCR** | **Apache 2.0** | **OD-7 resolved 2 Aug 2026.** Strong Devanagari, good layout and table detection |
| OCR — fallback | **Tesseract** | **Apache 2.0** | Mature `hin` trained data |
| **Embeddings** | **BGE-M3, self-hosted** | **MIT** | **OD-4 resolved 2 Aug 2026.** No new vendor, no recurring cost, strong Hindi and English. Beat Jina and Google text-embedding-005 — both cheap, both added a vendor and a bill against the standing "minimal vendors, one bill" constraint |
| Court data — fallback | **bharat-courts** | **MIT** | PyPI, Python 3.11+. Case status, orders, **cause lists**. **Not a vendor replacement**: `next_hearing_date` is not returned, and bus factor is 1. Second implementation behind our adapter only. **OD-1** |
| Indian language translation | **IndicTrans2** (AI4Bharat) | MIT | |
| Indian language corpus | **IndicCorp v2** (AI4Bharat) | CC-0 | |
| Fine-tuning | **Unsloth** + HF PEFT + TRL | Apache 2.0 | Blocked until ₹3L MRR |
| Build discipline | **ponytail** | MIT | `.ai/02-tools.md` |

Both OCR engines are Apache 2.0, so **OD-7 never had a licensing dimension.** It
resolved on capability: court orders are layout-heavy, and layout handling is
where the two diverge most. The S4 bake-off still runs, but as **tuning rather
than selection** — `docs/OCR_PIPELINE.md`.

---

## 1a · Corpus sources — free, no account, no credentials

**OD-4 resolved 2 Aug 2026. This unblocks S1.**

**AWS Open Data, Mumbai (`ap-south-1`), CC-BY-4.0.** AWS sponsors storage and
transfer, so there is **no AWS account, no credentials and no egress bill** —
every call uses `--no-sign-request`.

```bash
# Supreme Court — 1950 to 2025, English + regional languages
aws s3 ls --no-sign-request s3://indian-supreme-court-judgments/

# High Courts — ~15.9M judgment PDFs, all 25 HCs
aws s3 sync s3://indian-high-court-judgments/data/tar/ ./data/tar/ \
  --exclude "*" --include "*/court=27_1/*" --no-sign-request
```

Both ship raw metadata as JSON and structured metadata as Parquet, with tar files
for bulk download. Court and bench codes are in the dataset docs — **replace `~`
with `_`** when building paths. `github.com/vanga/indian-high-court-judgments`
also documents an Athena tutorial for querying the metadata with SQL *before*
downloading any PDFs, which is the cheap way to scope a stage.

**Verified 2 Aug 2026, not taken on trust.** Both buckets answer an anonymous
`list-type=2` request with HTTP 200, and the key layout matches:

```
indian-supreme-court-judgments  data/pdf/year=1950/english/1950_1_1008_1018_EN.pdf
indian-high-court-judgments     data/pdf/year=1950/court=19_16/bench=calcutta_original_side/…
```

The second confirms the underscore form of the court code in practice.

**Ingest in stages. Do not attempt 15.9M in S1.**

| Stage | Scope | Note |
|---|---|---|
| 1 | **Supreme Court, complete** 1950–2025 | The citation backbone |
| 2 | **BNS / BNSS / BSA** from indiacode.nic.in + IPC↔BNS mapping | |
| 3 | **High Courts, last 10 years** | The practical working set |
| 4 | High Courts, historical | Background job after launch |

**Record the document count at each stage. Stages 1 + 2 pass Gate S1.**

### Supporting sources

| Source | Use | Cost |
|---|---|---|
| e-SCR (Supreme Court portal) | Neutral citations, court-formatted PDFs. **Verification Tier 2** | Free |
| IndianKanoon API | Live search, verification Tier 2 | Stated ₹10,000/month non-commercial free tier, commercial licence after revenue. **Unverified — confirm current terms before S1 depends on it** |
| indiacode.nic.in | All Central and State Acts, BNS/BNSS/BSA | Free |
| IndicCorp v2 (AI4Bharat) | Indian-language signal, 20.9B tokens | Free, CC-0 |
| IndicTrans2 (AI4Bharat) | Translation for dataset expansion | Free, MIT |

### Where embedding runs

One-time corpus embedding is a batch job on a **rented GPU — Lambda Labs or
RunPod, not Railway.** Query-time embedding runs on **Railway CPU**; a single
query is fast enough there. Renting a GPU by the hour for a one-time job is not a
new vendor in the sense the constraint means — nothing recurring, nothing to
monitor, no second bill after it finishes.

### Budget to a searchable corpus

| Item | Estimate |
|---|---|
| GPU for one-time embedding (≈A100 at ~$1.30/hr, 20–60 hrs) | **$40–120** |
| Object storage for source PDFs (Cloudflare R2) | **$15–40/month** |
| Postgres + pgvector on Railway | Included until ~5M vectors |
| **Total to a searchable corpus** | **under $200** |

The only recurring line is R2. Everything else is one-time or already paid for.

### Iconography — Lucide stays. Reicon evaluated and declined. 2 Aug 2026

**Decision: keep Lucide. Do not add Reicon, not even to fill gaps.**

Reicon (https://reicon.dev, MIT) was proposed to supply legal-specific icons
Lucide lacks — court, gavel, seal, stamp, bare act, cause list. **Investigation
found the premise is false: Lucide already has them, and Reicon mostly does not.**

| Icon | Lucide | Reicon |
|---|---|---|
| gavel | **✓** | ✗ |
| stamp | **✓** | ✗ |
| landmark | **✓** | ✗ |
| scroll-text | **✓** | ✗ |
| scale · book-open · library · calculator · award | ✓ | ✓ |
| **courthouse** | ✗ | **✓** |
| **judge** | ✗ | **✓** |

Adopting a second icon library to gain **two** icons, while *losing* the gavel and
the stamp, is the wrong trade. Rung 2 of the ladder — it is already here.

**What Reicon is, measured rather than assumed** (`reicon-react-native@1.0.102`,
tarball inspected):

- **MIT.** ✓
- **A real React Native package exists** — the open question in the brief. Peer
  deps `react-native-svg >=12`, the same peer Lucide declares.
- **Tree-shakes properly**: `sideEffects: false` plus `./icons/*` subpath exports,
  so per-icon import works. It would *not* ship 2,674 icons to use forty.
- **Stroke width is 1.5, uniform across 4,558 occurrences** — an exact match to
  the design system. This was the sharpest risk in the brief and it is clean.
- Repo `dqev/reicon`: **1,183 stars, 64 forks, 4 open issues, pushed 2 Aug 2026,
  not archived.**

**Three claims in the brief that the package contradicts** — worth recording so
nobody re-litigates from the marketing copy:

1. "3,900+ icons" — the **RN package ships 2,674**.
2. "Outline, Filled and Duotone" — the **RN package ships 2 weights**, Outline and
   Filled. **No duotone**, which was the one weight Lucide cannot offer and
   therefore the main argument for adopting it.
3. "Roughly double Lucide's count" — 2,674 vs Lucide's 1,757 is **~1.5×**.

**Bus factor is still one, despite the stars.** 5 contributors, but `dqev` has
**200 of 205 commits**; a single npm maintainer account; repo created 5 May 2026
and the RN package first published 9 July 2026 with **3 versions total**. Healthier
than `bharat-courts`, but not a dependency to take for two icons.

**If `courthouse` or `judge` are genuinely wanted:** take them as **static SVGs**
into `apps/mobile/assets/icons/` under MIT attribution. That is rung 4 of the
ladder rather than rung 5 — no dependency, no second stroke system, no second
upgrade path. Do not install the package for them.

**This also reinforces keeping `react-native-svg` as a direct dependency.** Both
libraries declare it as a peer, and it is the package that survived only
transitively until S0 — `.ai/04-coding-standards.md`.

### Removed — kept for provenance

| Dropped | Licence | Why, and what it would take to bring back |
|---|---|---|
| **NativeWind** (+ `tailwindcss`, `babel-preset-expo`) | MIT | Installed in S0 per the sprint checklist, then removed at the S0 ponytail review with **zero `className` uses in the codebase**. Measured cost: **iOS bundle 5.8 → 4.6 MB, Android 6.1 → 4.9 MB.** It also required pinning `babel-preset-expo` explicitly (SDK 57 no longer ships one at top level) and forced `darkMode: 'class'` to stop it following the OS scheme and throwing on web — a dark mode arriving by accident, against a v2 decision. |

**The reason it is unlikely to come back.** The primitives in
`apps/mobile/src/components/` are specified to the pixel — a 1.5px border, a
0.965 press scale, a knob moved by `translate3d` — and `StyleSheet` expresses
that directly while a utility class does not. Two styling systems in one app is
also how a second palette gets in, which `theme/tokens.ts` exists to prevent.

Re-add it the moment a screen genuinely wants utility classes, and wire its
theme from `tokens.ts` as before so there is still exactly one palette.

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
