# THE DATA MOAT — corpus acquisition, identity, graph, freshness

**11 August 2026, LCC, per the founder's DATA MOAT / CORPUS ACQUISITION
DIRECTIVE.** A parallel workstream to the day's REB/V2 safety work, not a
replacement for it — nothing here touches `apps/**` or reopens the licensing
question, which the founder has confirmed is settled.

**This is a consolidation, not a rewrite.** LawMind already has substantial,
vetted research on most of what follows — `docs/DATA_SOURCES.md`,
`docs/DATASETS.md`, `docs/HC_CORPUS_SURVEY.md`, `docs/HARVEST_ENGINE.md`,
`docs/TRAINING_STRATEGY.md`, `docs/CORPUS_GAP_PLAN.md`, `docs/CORPUS_TIERING.md`.
Re-deriving all of it here would risk contradicting decisions already made.
This document's job is the one thing those don't do: **one source
classification table, the founder's P0–P7 structure, current measured state
in one place, and an exact next-task sequence.** Where a source has a real
existing writeup, this links it rather than repeating it — check the linked
section before assuming a claim here is complete.

**The objective, stated as given:** not document count. The most complete,
provenance-aware, continuously updated Indian legal corpus possible, with
canonical identity, evidence structure, citation graph, treatment graph and
statutory time/versioning.

---

## 0 · CURRENT STATE, MEASURED LIVE — 11 Aug 2026, not the advertised numbers

**Terminology — never conflated below or anywhere else in this document,
per the founder's explicit instruction (DATA SCALE CONTINUATION, 11 Aug):**
**source corpus size** (rows the AWS bucket's metadata actually contains,
footer-counted) ≠ **ingested corpus size** (`judgments` rows) ≠ **unique
canonical documents** (ingested, after `content_hash` dedup) ≠ **unique
cases** (a case can produce several documents; not yet computed as its own
figure). Full detail, the coverage matrix, and how each number was measured:
**`docs/ai/AWS_CORPUS_INVENTORY.md`**, written the same day this section was
first drafted, after the first draft was found to describe only the
*ingested* corpus and risked being read as the whole one.

**Source corpus, measured fresh via parquet footers, not assumed as "~20M",
and CORRECTED same day for a real error the first draft made**: raw footer
sums are per-*file* row counts, and the Supreme Court bucket lists some
documents in more than one year-partition file — summing without
correcting for that overstated the SC source size by 5,181 rows (a
two-orders-of-magnitude error in the *coverage gap*, caught by executing
the very next measurement task, `AWS_CORPUS_INVENTORY.md` §3). Corrected
figures: **38,351 distinct rows (Supreme Court)** + 20,529,203 rows (High
Court, 1,493 partition files, both metadata variants — this figure's own
distinct-document status is unverified, `AWS_CORPUS_INVENTORY.md` §1) =
**20,567,554 total source rows**, still overwhelmingly not judgments —
most are orders and procedural documents
(`AWS_CORPUS_INVENTORY.md` §2). Reproducible:
`pnpm --filter @lawmind/ingest hc:count`.

Queried against production directly, not recalled from an older doc (several
of which are now stale on exactly this point):

| | measured | source |
| --- | --- | --- |
| `judgments` (**ingested** corpus) total | **79,321** | `SELECT count(*) FROM judgments` |
| — Supreme Court | 38,341 of 38,351 distinct source rows (**99.97% coverage — 11 judgments genuinely uningested, named in `AWS_CORPUS_INVENTORY.md` §3**) | `court = 'Supreme Court of India'` |
| — High Court | 40,980 of 20,529,203 source rows (**0.1996%, an upper-bound coverage figure** — HC's distinct-document count is unverified) | everything else |
| `cnr` populated | **79,321 of 79,321 — 100%** | migration `0034` + `backfill-cnr.ts`, both run 11 Aug; task 007 |
| `content_hash` populated | 79,321 of 79,321 | backfilled 11 Aug, `backfill-provenance.ts` |
| — exact-duplicate groups | 937 groups / 1,500 rows (1.9%) | see `docs/ai/tasks/003-corpus-inventory.md` — consolidated/batch judgments, not confirmed mobile/plain duplication |
| `judgment_citations` edges | 227,478 | citation graph, extracted from text |
| — resolved to a held judgment | 97,876 (43.0%) | the rest cite outside the corpus we hold |
| `judgment_citation_aliases` | 4,097 | courts'-own-words concordance (AIR/SCC ↔ SCR) |
| `statutes` (Acts) | 845 | indiacode.nic.in |
| `statute_sections` | 34,928 | indiacode.nic.in |
| `statute_mappings` (IPC↔BNS etc.) | 0 rows, by design | not yet sourced — REB §7 forbids inventing equivalence |

**What the AWS bucket actually advertises vs. what we hold — the founder's
"do not assume the advertised document count" instruction, already executed
once.** `docs/HC_CORPUS_SURVEY.md` §2 measured this precisely: the High Court
bucket's *document* share that is actually a *judgment* (not an order, not a
procedural disposal) runs **0.75%–18.64%** depending on court, and 92% of the
corpus carries no `order_type` column at all to even ask the question. Our
40,980 ingested HC rows are a fraction of the bucket's total document count,
ingested before the pause — not a claim that we hold "all" of any court.
**Document count is not judgment count**, stated there and true here.

---

## 1 · SOURCE CLASSIFICATION — every candidate source, one table

Classification per the founder's exact taxonomy: **PRIMARY** (citable legal
truth) · **SECONDARY** (real but not citable as primary) · **ENRICHMENT**
(improves search/graph, never renders as an authority) · **TRAINING**
(distillation/fine-tune data only) · **EVALUATION** (gold/adversarial sets,
never shipped to a user) · **DISCOVERY ONLY** (finds documents to then fetch
from a primary source — never stored or rendered itself).

| source | class | status | licence/authority | depth |
| --- | --- | --- | --- | --- |
| AWS Open Data — Supreme Court | **PRIMARY** | held, 38,341 rows | CC-BY-4.0, no copyright in a judgment (Copyright Act s.52(1)(q)(iv)) | `docs/DATASETS.md` §"AWS Open Data — Supreme Court" |
| AWS Open Data — High Courts | **PRIMARY** | held, 40,980 rows, ingest paused | CC-BY-4.0 | `docs/HC_CORPUS_SURVEY.md` full |
| eCourts (per-citation, Tier 3) | **PRIMARY** (verification) | built, human-in-the-loop | registrar's written grant, 7 Aug 2026, CAPTCHA bypass narrowly permitted for bulk cause-lists only — `CLAUDE.md` §6 | `services/api/src/citations/verify.ts` |
| eCourts (bulk cause-list harvest) | **PRIMARY** (freshness) | built, rate-limited | same grant, expires with it (Jan 2029 unless renewed) | `services/api/src/court/ecourts.ts` |
| indiacode.nic.in | **PRIMARY** (statutes) | held, 845 Acts / 34,928 sections | Government of India, public | `docs/DATASETS.md` §"indiacode.nic.in" |
| Official Gazette / e-Gazette | **PRIMARY** (commencement) | surveyed 11 Aug, **not ingested** | Government, public, no bulk API | §2.4 |
| IndianKanoon API | **ENRICHMENT** (Tier 2 verification + citation graph), explicitly **not** bulk PRIMARY | **not purchased** | Commercial, per-call, attribution mandatory | `docs/DATA_SOURCES.md` §2 — full pricing, the "do not buy to bulk-download" warning |
| BharatLaw account | **ENRICHMENT** (benchmark) / extraction **DISABLED** | provisioned, `extractionPermitted: false` | Licensed, terms not yet fully cleared for extraction | `docs/CURRENT_PLAN.md` Q1.13, `services/ingest/src/harvest/bharatlaw.ts` |
| Licensed teacher/competitor data (founder-authorised) | **TRAINING** / **EVALUATION** only, **never PRIMARY** | inventoried, gated | Founder confirmed agreements exist — CLOSED, not reopened here | `docs/DATASETS.md` §"AUDITED — DO NOT TRAIN" (three datasets, all instruction-style, none primary law) |
| OpenNyAI datasets/models | **EVALUATION** / **DISCOVERY ONLY**, pending audit | **not yet audited on our documents** | Mixed OSS licences per dataset — check per-dataset before use | new — see §2.5 |
| NyayaAnumana | **EVALUATION**, pending audit | **not yet audited** | Research dataset, licence TBC | new — see §2.5 |
| District courts / tribunals (NCLT, NCLAT, NGT, CAT, DRT/DRAT, consumer fora) | **PRIMARY**, per-body, **not yet acquired** | Varies — each is its own legal-authority question | new — see §4 |
| Presidio (PII detection) | tooling, not a legal-content source | evaluated on paper, **not yet run on real Indian documents** | MIT | `docs/PRIVACY_PII.md` §"Pseudonymisation" |

**The rule that keeps this table honest going forward:** a source's
classification is decided once, here, and any code that reads from it must
match. `services/ingest/src/harvest/bharatlaw.ts`'s `extractionPermitted`
flag is the existing pattern for enforcing a classification in code, not just
in a doc — the classification above is not aspirational, it is what the
loaders already assert or must be made to assert.

---

## 2 · P0 — PRIMARY / AUTHORITATIVE

### 2.1 · AWS corpus inventory — largely done, gaps named precisely

- **Exact counts**: §0 above, measured live, not advertised.
- **Raw PDFs preserved**: source PDFs are streamed and converted, never
  re-hosted — `sourceUrl` points at the permanent CC-BY-4.0 bucket, which is
  the preservation strategy (`packages/db/src/schema.ts`'s comment on
  `judgments.sourceUrl`: "the bucket, paid for by somebody else").
- **Raw + structured metadata ingested**: yes, per-row, `services/ingest/src/sci.ts`
  (Supreme Court) and `services/ingest/src/harvest/hc-load.ts` (High Court).
- **Content hashes**: done, §0. **Duplicates detected**: done, 937 groups
  characterised — `docs/ai/tasks/003-corpus-inventory.md`.
- **Missing metadata identified**: `docs/HC_CORPUS_SURVEY.md` §2 (document
  vs. judgment share), §5 (what is not measured — mobile/plain CNR
  duplication, still open).
- **OCR/scanned identification**: **not done**. `text_quality` (migration
  0031) measures visible extraction damage, not scan-vs-born-digital — named
  explicitly as unsettled in `docs/ai/tasks/003-corpus-inventory.md` §"What
  this does not settle". `judgment_chunks.ocr_confidence` is the right field
  (engine-reported, not inferred) but nothing populates it for High Court
  text yet. **Next task candidate, §7.**
- **Language identification**: `judgments.language` is `'en'` on every held
  row **correctly, not as a bug**. `sci.ts`'s `JudgmentRecord.language` is
  typed as the literal `'en'`, not a variable — a deliberate constraint,
  because only the English PDF is fetched and stored; `available_languages`
  (ENG,HIN,PUN) describes what the *source* publishes, not what this row
  *is*. Checked directly against the code before writing this: **not the
  same shape as the CNR bug** (an earlier draft of this document overclaimed
  that it was). A Hindi judgment would need a separate fetch and a separate
  row, which `sci.ts`'s own comment already flags as an open S1-report
  question — a multi-language ingest decision, not a one-line fix. No code
  change from this program; the open question is recorded, not new.
- **Court/year/document-type**: held (`court`, `judgment_date`,
  `source_document_type` for the 4 of 25 HC courts that publish one).
- **CNR/case/diary identifiers**: **found dropped for the entire corpus by
  both loaders, fixed today** (migration `0034`) — see §0's CNR row. Existing
  79,321 rows are not backfilled; that needs the original source metadata
  files, not just `full_text` (unlike the content-hash backfill).
- **Source manifest**: this document plus §0's table **is** the manifest,
  pending a machine-readable version — see task list, §7.

### 2.2 · Official Supreme Court sources — freshness

Held: full historical corpus via AWS. **Not built**: an incremental
"new judgments since last sync" path. The AWS dataset itself is a periodic
snapshot, not a live feed — freshness for *new* Supreme Court judgments is
architecturally the same problem as High Court freshness (§2.3) and should
share one incremental-ingestion design (§5), not a bespoke SC-only path.

### 2.3 · Official High Court/eCourts sources — freshness

`services/api/src/court/ecourts.ts` + the rate limiter + fetch ledger already
implement bounded, authorised bulk cause-list harvesting under the 7 Aug 2026
grant. Per-citation Tier 3 verification is separate and already live
(`citations/verify.ts`). **What's not built**: routing eCourts' per-hearing
freshness signal back into `judgments` for HC judgments already held (a
"this matter had activity" ping that could trigger a targeted re-check)
rather than only using eCourts for verification lookups.

### 2.4 · Official Gazette / notification sources — surveyed, not built

**Was genuinely new territory this morning; surveyed 11 Aug 2026 via web
research (WebSearch/WebFetch), not from memory.** Needed for: amendment
commencement dates, delegated-legislation notifications, the exact gap
`statute_mappings` (0 rows) needs closed before REB §7's point-in-time
statute contract can be built honestly.

**What was confirmed**: `egazette.gov.in` is the official Government of
India portal (Directorate of Printing, Ministry of Housing and Urban
Affairs), publishing weekly. A 2016 PIB press release states gazette
notifications are e-published there and **"users may download the e-gazette
free of charge"** — public, no stated paywall. The Gazette is structured in
fixed Parts/Sections (Part II §1: Acts, Ordinances, Regulations; Part II §3
sub-§(i): General Statutory Rules) — a real, citable organisational
structure, not ad-hoc. **No official bulk-download API is published** — the
site is a search-and-download portal, not a data feed.

**What was found, INFER not KNOW**: an existing open-source project,
`sushant354/egazette` (GitHub, Apache 2.0), already scrapes the central
gazette **and most state gazette portals** (Bihar, Karnataka, Maharashtra,
Tamil Nadu, UP, West Bengal, and ~20 others), using BeautifulSoup4 + session
cookies, no published CAPTCHA workaround mentioned in its own README. This
is evidence the site is technically scrapeable without a CAPTCHA wall
(unlike eCourts before its grant), but **not independently confirmed against
the live site** — a WebFetch attempt against `egazette.gov.in` itself failed
on a certificate-verification error from this environment, so the site's
current behaviour was not directly observed this session. State that
distinction plainly rather than treat the GitHub project's description as
confirmed fact.

**Recommendation, not yet executed**: before writing a new scraper, evaluate
`sushant354/egazette` (Apache 2.0, permissive) as a technical reference or
direct dependency — "OSS first" per `CLAUDE.md`. Central-gazette coverage
alone (no state scraping needed yet) is the right first scope, matching
`statute_mappings`' current focus on Central Acts. **Not started as a build
— this is the survey only,** per this task's own scope in §7.

### 2.5 · P3 registry — evaluated once, not yet built out

| dataset | classification | status |
| --- | --- | --- |
| IndianKanoon API | ENRICHMENT | evaluated, recommended, not purchased — §1 |
| OpenNyAI (datasets + ILDC/ILSI models) | EVALUATION / DISCOVERY ONLY | not audited on our documents |
| NyayaAnumana | EVALUATION | not audited |
| `nisaar/*` (3 datasets) | AUDITED — DO NOT TRAIN | `docs/DATASETS.md` §"AUDITED" — instruction-tuned commentary, not primary law, explicitly excluded from training per `CLAUDE.md`'s "never train on a model's commentary about law" |

**Binding rule, restated because it is the one this whole section exists to
protect**: nothing in this table may become PRIMARY by drift. A search result
or a graph edge sourced from IndianKanoon carries its provenance forward
(`verified_by_source` already models this — `ecourts_bulk`, `ecourts`, and a
future `indiankanoon` value would need the same explicit, never-silent
treatment `CLAUDE.md` §6 requires for eCourts). No code path may promote an
ENRICHMENT or EVALUATION source's content to a rendered citation.

---

## 3 · P1 — COURT ECOSYSTEM (district courts, tribunals, commissions)

**Not started. Correctly not started** — this needs a per-body legal-authority
and data-format assessment before any acquisition work, which the founder's
own instruction anticipates ("do not assume every tribunal source has the
same legal authority or data format"). First pass, by suspected tractability
(not yet verified against each body's actual publication practice):

| body | why it matters | data format guess | status |
| --- | --- | --- | --- |
| NCLT/NCLAT | Insolvency & Companies Act matters, high commercial-practice relevance | Own website, PDF orders | unresearched |
| NGT | Environmental law, growing docket | Own website | unresearched |
| CAT | Service law, large volume | Own website | unresearched |
| DRT/DRAT | Debt recovery, high commercial relevance | Own website | unresearched |
| Consumer fora (NCDRC + state) | High advocate-facing volume, e-Daakhil portal exists | Portal, possibly structured | unresearched |
| District courts | Largest volume, lowest per-document legal-authority weight for a citation product | eCourts umbrella, same portal family as HC | eCourts services already partially cover this — the highest-leverage next body to check, since infrastructure (`ecourts.ts`) already exists |

**Checked, 11 Aug 2026 — genuinely blocked, not merely unresearched.**
`ecourts.ts`'s own comment confirms the cause-list endpoint
(`services.ecourts.gov.in`) already **is** the district-court services host,
not the judgments host — so the existing adapter's network target already
touches district-court infrastructure for cause-list data specifically. That
does **not** answer whether district-court or tribunal *judgments* are
covered, because `docs/ECOURTS_AUTHORISATION.md` states plainly:
**`AUTHORISATION = null`** — the grant letter has never been transcribed.
`permittedCourts` (`"list only what is named. A court not listed is not
covered"`) is the exact field that would answer this, and it does not exist
yet. Per this repo's own binding rule (`CLAUDE.md` §6, restated in that
file): **if the authorisation's terms are not in the repo, the switch stays
off** — no scope claim can be made, for HC/SC or for district
courts/tribunals, until the founder transcribes the letter.

**Already on `docs/FOUNDER_QUEUE.md`** ("[OPEN] eCourts grant conditions,
transcribed · LCC · 7 Aug 2026") — not a new blocker, confirmed still the
gating one. Nothing here reopens or duplicates that entry; this section
exists so a future data-moat pass does not re-ask the same question from
zero.

---

## 4 · P4 — KNOWLEDGE GRAPH DATA

**Substantially built, not fully populated.** `judgment_citations` already
models the exact edge types the directive asks for:

- `relationship` (schema.ts:711, six real values, confirmed live today):
  `cites`, `followed`, `distinguished`, `doubted`, `overruled`,
  `overruled_in_part` — covers follows/distinguishes/doubts/overrules/affirms
  in substance (no separate `approves`/`affirms`/`reverses`/`modifies`
  values; `followed` and `overruled`/`overruled_in_part` are doing that work
  today under a narrower vocabulary extracted from the court's own printed
  annotation, never inferred).
- `evidence` — the court's own phrase justifying the relationship, so every
  edge is auditable back to source text. This IS the confidence/provenance
  the directive asks for, expressed as "traceable to the printed words," not
  a numeric score — consistent with `CLAUDE.md`'s "never a probability, a
  score or a forecast."
- Statutes cited / provisions cited: `judgment_statute_refs` (migration
  `0026`), resolves section + Act per judgment.
- Judges / benches: `judgment_judges` (migration `0026`).
- Parties: `case_title` (structured `X versus Y`, not yet split into
  separate party fields — `party:` search does a substring match today).
- **Not modelled**: advocates. No column, no table. **Genuinely new work** —
  not measured whether the source data (raw HTML/PDF) even states advocate
  names reliably across courts; needs a survey before a schema decision.
- **Not modelled as distinct relationship values**: `approves`/`affirms`/
  `reverses`/`modifies` — currently folded into the six-value enum above via
  `followed` (approves/affirms) or left unclassified. Whether the source
  text's own annotations distinguish these finely enough to extract is
  unverified — a claim of six extractable categories is what the corpus
  supports today; four more would need evidence they exist in the printed
  annotations before being added, not added speculatively.

---

## 5 · P5 — FRESHNESS / INCREMENTAL INGESTION ARCHITECTURE

The founder's requested pipeline —
`SOURCE → FETCH → HASH → IDENTITY RESOLUTION → DEDUP → VERSION → EXTRACT →
QUALITY → STRUCTURE → CITATION EXTRACTION → GRAPH UPDATE → INDEX UPDATE →
VERIFICATION` — mapped against what exists:

| stage | exists as | gap |
| --- | --- | --- |
| FETCH | `services/ingest/src/harvest/*` (per-source), `court/ecourts.ts` (rate-limited, ledgered) | SC/HC AWS sources are periodic snapshots, not incremental feeds — no "since last sync" cursor |
| HASH | `content_hash` (migration 0031), computed in `load.ts`'s shared `upsertBatch` | none — this stage is solid |
| IDENTITY RESOLUTION | `source_url` uniqueness (resumability) + `content_hash` (cross-URL dedup signal) | **`cnr` just added, 0 rows populated** — the actual canonical cross-source key is present in schema but not yet the resolution key any code uses |
| DEDUP | manual query today (`docs/ai/tasks/003-corpus-inventory.md`'s dedup analysis) | not automated — no CLI decides "these N rows are one judgment, canonicalise to one" |
| VERSION | none | a judgment amended/corrected at source has no version history modelled |
| EXTRACT | `services/ingest/src/*` per source | solid for held sources |
| QUALITY | `text_quality` (visible damage proxy) | native-vs-scanned still unmeasured, §2.1 |
| STRUCTURE | `judgments/paragraphs.ts` (paragraph segmentation with printed numbers) | solid |
| CITATION EXTRACTION | `services/ingest/src/citations.ts`, fixed today for year-first formats | ongoing — format coverage improves as gaps are found, same class of bug as the CNR/overruled-field ones found this session |
| GRAPH UPDATE | `judgment_citations` write path | solid for what's extracted |
| INDEX UPDATE | `judgments_*` indexes, GIN/trigram (migration 0026) | solid |
| VERIFICATION | `services/harness/src/deployed-safety.ts` + `deployed-judgment-safety.ts` | solid for citation-safety; no equivalent "did this ingest run actually add what it claims" verification step |

**"Never rebuild the entire corpus when an incremental update is possible"**
— already the design: `source_url` uniqueness + `ON CONFLICT DO UPDATE`
(`load.ts`) makes every existing loader naturally incremental and resumable.
The gap is not incrementality at the row level; it is the absence of a
**source-level freshness cursor** (a per-source "what have we already asked
for" record) for SC/HC beyond what `harvest_fetches`/`ecourts_fetch_ledger`
already track for the eCourts path specifically.

---

## 6 · P6 — DATA QUALITY DASHBOARD

**Built, 11 Aug 2026** — `services/ingest/src/corpus-report-cli.ts`
(`pnpm --filter @lawmind/ingest run corpus:report [--json <path>]`), dry,
read-only. Run against production the same day it was written:

| metric | measured |
| --- | --- |
| Corpus | 79,321 (38,341 SC / 40,980 HC) |
| `content_hash` coverage | 100.0% |
| `cnr` coverage | 100.0% (task 007, same day) |
| duplicate groups | 563 (1,500 rows, 1.9%) |
| `source_document_type` coverage | **0.0% — see the finding below** |
| `text_quality` average | 0.977 (388 rows below 0.90) |
| citation edges | 227,478, 43.0% resolved to a held judgment |
| treatment breakdown | 211,555 `cites` · 14,028 `followed` · 1,734 `distinguished` · 117 `overruled` · 23 `overruled_in_part` · 21 `doubted` |
| `overruled_status` | 79,240 `none` · 57 `set_aside` · 16 `doubted` · 8 `partly_set_aside` |
| language | 100% `en` (§2.1 — correct, not a gap) |
| Acts / sections / mappings | 845 / 34,928 / 0 |

**A surprise the dashboard was built to catch, and did, immediately**:
`docs/SCHEMA_TRUTH.md` documents `source_document_type` as populated for
"4 of 25 High Courts" — but the report shows **0.0% corpus-wide, and zero
courts with any coverage at all** among the 18 High Courts actually held.
Verified directly, not a query bug: `count(source_document_type) = 0` of
79,321. **Not yet root-caused** — plausible explanations, none confirmed:
the 4 courts documented to publish `order_type` (the mobile-variant column)
may not be among the 18 we hold rows from; or the real ingest runs that
produced this corpus never actually pulled the mobile-variant files despite
the loader supporting both. This is exactly the kind of gap a dashboard
exists to surface rather than leave assumed-fine — flagged here, not
investigated further in this pass.

**Not measured, by design** (stated in the CLI's own header, not silently
skipped): paragraph-extraction quality (`numberedShare`) at corpus scale —
would require fetching every `full_text`, the expensive full-corpus scan a
dry report should not casually trigger; native-vs-scanned classification
(§2.1's separate, still-open gap); a per-source freshness cursor (§5's gap).

---

## 7 · P7 — DATA GAP ANALYSIS AND EXACT NEXT TASKS

Ranked by **legal value**, not document count, per the founder's explicit
instruction:

1. ~~**Native-vs-scanned classification**~~ — **DONE, 11 Aug 2026, same
   session.** `isNativeText` (moved to `text.ts` so both extraction paths
   share one definition) now wired into `fetchPdfText`, `hc-load-cli.ts`,
   `toJudgment`/`toJudgmentRecord` and `load.ts`. `judgments.native_text`,
   migration `0035`, applied. Populates on every future write; the 79,321
   existing rows need a real (larger, distinct) backfill re-fetching every
   PDF, not attempted here. `docs/ai/AWS_CORPUS_INVENTORY.md` §6.
2. ~~**CNR backfill investigation**~~ — **DONE, 11 Aug 2026, same session.**
   Feasible, cheap (≤76 SC year-files + 198 HC partitions, ~275 requests
   against the same public bucket), and executed: `services/ingest/src/
   backfill-cnr.ts` backfilled **79,321 of 79,321 rows — 100% coverage** in
   one run. Closed the canonical-identity gap immediately, and as a direct
   consequence answered `HC_CORPUS_SURVEY.md` §5 for the first time (no
   mobile/plain cross-duplication found — 22 rows of year-partition drift
   instead, a known, different, smaller defect class). Task 007.
3. ~~**Language field correction**~~ — **checked and closed, 11 Aug 2026,
   not a bug.** `language: 'en'` is a deliberate literal type, correct for
   what is actually fetched (the English PDF only). A real open question
   (whether to ingest Hindi as separate rows) but not a quick fix — moved
   out of the task queue, into the open-questions list a founder sequencing
   call would need, not an engineering backlog item.
4. ~~**Corpus-quality report CLI**~~ — **DONE, 11 Aug 2026, same session.**
   `corpus-report-cli.ts`, run against production. Immediately found a real
   gap: `source_document_type` is 0.0% corpus-wide against a docs claim of
   "4 of 25 courts" — not yet root-caused, §6.
5. ~~**Official Gazette source survey**~~ — **DONE, 11 Aug 2026, same
   session, via real web research.** Public, no bulk API, no confirmed
   CAPTCHA (via an existing OSS scraper's evidence, not independently
   verified live). `sushant354/egazette` (Apache 2.0) is a real OSS-first
   candidate to evaluate before building a new scraper. §2.4. Building the
   actual ingest path is the next increment, not done here.
6. ~~**eCourts scope check for district courts/tribunals**~~ — **CHECKED,
   11 Aug 2026: genuinely blocked, not unresearched.** `AUTHORISATION = null`
   — the grant letter has never been transcribed, so no scope claim (HC/SC
   or district/tribunal) can be made per this repo's own binding rule.
   Already on `docs/FOUNDER_QUEUE.md`, confirmed still the gating item. §3.
7. **OpenNyAI / NyayaAnumana audit** (§2.5) — evaluate for EVALUATION-class
   use only; do not begin until a concrete evaluation need names what gap
   they would fill (the existing 283-query golden set, `RETRIEVAL_PROGRAM.md`
   §CURRENT BENCHMARK, is the more urgent P2 gap and does not need these).

Task packets for items 1–2 (the two cheapest, most concretely scoped, and
most directly blocking existing work) are being written to `docs/ai/tasks/`
alongside this document.

8. **HC corpus characterization — DONE, 11 Aug 2026, per the founder's HC
   CORPUS CHARACTERIZATION directive.** `docs/ai/HC_CORPUS_CHARACTERIZATION.md`
   — full census of row distribution by court and year (`docs/
   HC_METADATA_SURVEY.json`, all 1,493 files); ingested-row identity/quality
   coverage broken out by court class for the first time (`content_hash`/
   `cnr` both 100% for HC same as SC; `native_text` 0.0% for HC — not yet
   backfilled, expected; `text_quality` averages 0.968 HC vs 0.987 SC, a
   real ~30× gap in sub-0.90 rate not previously measured this granularly).
   **§5's open item — HC cross-partition duplication — SAMPLED, not fully
   measured**: `services/ingest/src/harvest/hc-cnr-sample-cli.ts`, 26 files /
   ~504,000 rows across the highest-volume courts and both variants. Plain
   variant: 99.9% within-file distinct-CNR (negligible duplication). Mobile
   variant: 72.3% average, 34.7%–99.8% range — real multiplicity (many
   orders per case), not a defect. Cross-file collision remains `UNKNOWN`,
   explicitly not chased at full-sweep cost given the sampled rate is low.
   **New finding, confirmed at scale, then self-corrected**: the
   plain-variant `disposal_nature` column (present on all 25 courts, unlike
   the mobile-only `order_type`) is 99.7–100.0% populated across a 12-file,
   6-court, ~1.14M-row sample of settled years (2017/2019), against 1.4% in
   a mostly-pending 2026 file — a real, corpus-wide disposed-vs-pending
   signal. The first-draft plan to validate it by cross-tabulating against
   the mobile variant's `order_type` was caught as not executable (plain
   and mobile share zero CNRs, no join key) and corrected in the doc itself
   before being repeated elsewhere: the real next task is combining
   `disposal_nature` with the case-type token in `title`/`description` into
   an actual judgment-vs-order proxy, named but not built.
9. **Retrieval-scale benchmark — DESIGNED, not executed, 11 Aug 2026.**
   `docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md`. Mapped the founder's six
   requested comparison arms against the actual code: fusion is RRF
   (corrects a stale `RETRIEVAL_PROGRAM.md` "UNKNOWN"), reranking already
   measured, BM25 does not exist and is scoped (hand-rolled over the
   existing GIN index, no new Railway extension), lexical/dense cannot be
   scored in isolation today (`hybridSearch` always fuses). **The 283-query
   golden set is 100% Supreme-Court-cited**, so the full six-arm bake-off
   needs zero new embeddings — directly satisfying the founder's instruction
   not to begin a massive embedding job before the evaluation architecture
   justifies one.

---

## 8 · WHAT THIS DOCUMENT DOES NOT DO

- Does not reopen licensing — settled, per the founder.
- Does not commit to purchasing IndianKanoon or any paid source — that
  remains a founder decision (`docs/DATA_SOURCES.md` §2's recommendation
  stands, unexecuted).
- Does not resume the paused High Court ingest — a separate decision,
  `docs/CURRENT_PLAN.md` Q2.
- Does not build the PII pseudonymiser — scoped separately,
  `docs/CURRENT_PLAN.md`'s 11 Aug entry, needs its own evaluation-driven task.
