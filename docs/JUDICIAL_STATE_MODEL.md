# THE APPEND-ONLY JUDICIAL STATE MODEL — A PROPOSAL, NOT A SCHEMA

**Owner: NEW2 (ingestion lane), Tracks B and C.** Written 17 August 2026 during
the post-migration write freeze.

**This proposes shapes. It does not create them.** `packages/db/src/schema.ts`
is LCC's file and `docs/SCHEMA_TRUTH.md` is the only authority on data shapes —
nothing here is true until it lands in one of them. Every existing name below
was read out of the schema today, not recalled.

Two shapes are needed and neither exists:

1. **Track B** — the live judicial state stream. eCourts, and now CAT, publish
   *events*: a case was listed, a bench was assigned, an order was uploaded, a
   date moved. We have one table for that and it can express four things.
2. **Track C** — regulator and tribunal documents. CCI, CAT and RERA are
   measured and reachable (`docs/TRIBUNAL_ACQUISITION_MEASUREMENT.md`), and none
   of them is court-judgment-shaped.

---

## 1. WHAT ACTUALLY EXISTS TODAY — read from the schema, 42 tables

| table | what it holds | relevant limit |
| --- | --- | --- |
| `matters` | the advocate's case | `status` and `next_hearing_date` are **current-state columns**: a new observation overwrites the old value and the old value is gone |
| `matter_events` | per-matter timeline | `event_type` is an enum of **four** values; `source` is an enum of **three** |
| `briefings` | the 24-hour briefing | already models "we tried and could not confirm" as three states, not a boolean — the pattern the rest of this file copies |
| `cause_list_syncs` | one row per court-day pull | upserts on `(court, list_date)`; records the *sync*, not what the sync saw |
| `ecourts_fetch_ledger` | every request under the registrar's grant | the audit trail. Not a state store |
| `judgments` | the corpus | court-judgment-shaped, and correctly so |

```
event_type   = ['hearing', 'order', 'filing', 'note']
event_source = ['manual', 'vendor', 'ocr']
```

**Nothing in `services/` or `apps/` writes `matter_events` today.** The only
`INSERT` statements are in `briefings/assemble.test.ts` and
`briefings/route.test.ts`; `assemble.ts` reads it. So the table is a read
surface with no producer — which is *fortunate*, because widening the vocabulary
now costs a migration and no backfill.

---

## 2. THE PRINCIPLE — AN OBSERVATION IS NOT A STATE

The mission's instruction is "do not merely overwrite current status", and the
reason is sharper than tidiness.

`matters.next_hearing_date` holds one date. When a cause list moves a hearing
from the 3rd to the 17th, writing 17 destroys the fact that it was ever the 3rd.
Three things break, and all three are shipped or planned features:

- **The Matter Timeline** cannot show "adjourned from 3 Sep" because nothing
  recorded the 3rd.
- **Calendar conflict detection** cannot tell "this hearing moved" from "this is
  a new hearing" — the difference between an alert and a duplicate.
- **`briefings` already depends on knowing this.** Its
  `dates_confirmed_at` / `dates_not_confirmed_at` / `dates_not_confirmed_reason`
  trio exists precisely because "we could not confirm" must survive as a
  distinct fact. That discipline stops at the briefing and does not reach the
  matter.

**So: observations append, current state derives.** `matters.status` and
`matters.next_hearing_date` stay — they are the hot read on every list screen
and deriving them per request is not free — but they become a *cache of the
latest observation*, never the only record of it. The same relationship the
citation harness already enforces between `judgments.overruled_status` and what
renders: **stored for speed, never the sole source of truth.**

---

## 3. TRACK B — THE PROPOSED SHAPE

### 3a. Widen the event vocabulary

`event_type` needs the transitions a court record actually publishes. Proposed,
additive to the existing four:

```
filed · registered · listed · bench_assigned · cause_list_seen · hearing ·
adjourned · order_uploaded · disposed · next_date_changed · status_changed
```

`hearing`, `order`, `filing` and `note` all keep their meaning — `filing` and
`filed` are not the same thing and both are worth having (`filing` is a document
the advocate lodged; `filed` is the court's record of institution). **A Postgres
enum only grows**, so this is `ALTER TYPE ... ADD VALUE`, not a rewrite.

`event_source` needs `ecourts`. It currently reads `manual | vendor | ocr`, and
`vendor` would be a lie: the registrar's grant is ours directly, the fetch
ledger records it as ours, and collapsing a first-party authorised fetch into
the same bucket as a third-party feed loses exactly the distinction the
authorisation is scoped on. **`ecourts_bulk` versus `ecourts` matters here for
the same reason it matters in `verified_by_source`** — a machine reading a cause
list and a human confirming a case status are different acts under different
parts of the grant.

### 3b. Every event carries its evidence

An event without provenance cannot be re-verified, contradicted, or shown to an
advocate who asks "says who?". Proposed additions to `matter_events`:

| column | why |
| --- | --- |
| `observed_at` | when *we* saw it — distinct from `event_date`, which is when the court says it happened. A cause list published late produces an event dated before it was observable, and reconciliation needs both |
| `fetch_ledger_id` | FK to `ecourts_fetch_ledger`. "Which request produced this row" becomes a join, not an investigation |
| `raw_payload` (jsonb) | what the source actually said, before normalisation. When the parse is wrong — and it will be — this is the difference between re-parsing and re-fetching |
| `supersedes_event_id` | self-FK. A `next_date_changed` points at the event it replaced, so the timeline can render "adjourned from 3 Sep" without inference |
| `confidence` | not every observation is certain. An OCR'd cause-list row is not a case-status API response, and the UI must be able to tell them apart |

**Append-only is a property nothing currently enforces.** The proposal is that
it be enforced at the database, not by convention — a trigger or a `REVOKE
UPDATE, DELETE`. A rule that lives only in a code review is a rule that survives
until the first hotfix.

### 3c. The bridge that does not exist

`cause_list_syncs` records *that* a court-day was pulled and how many items came
back. It does not record *what was in them*. So a cause list naming an
advocate's matter is fetched, counted, and discarded.

Proposed: a `case_observations` table holding normalised rows from any judicial
source, keyed on `(source, court, cnr, observed_at)` and **not** on `matter_id`
— because most observations concern cases no user has adopted yet, and throwing
those away means re-fetching when they do. `matter_events` then becomes the
projection of `case_observations` onto the matters a user actually holds.

That ordering matters for a reason beyond tidiness: it lets the same stream
serve **Case Brain** and **fresh-order detection** for the whole corpus, not
only for adopted matters.

---

## 4. TRACK C — THE GENERIC DOCUMENT LAYER

### 4a. Why `judgments` is the wrong home, with the evidence

Measured this session (`docs/TRIBUNAL_ACQUISITION_MEASUREMENT.md`):

| source | what a row carries | what `judgments` expects |
| --- | --- | --- |
| CCI | `case_no`, `type` = `Anti-trust Section 19 (1) (a)`, `antitrust_categories_id`, `order_date` | a bench, a neutral citation, a court |
| CAT | `benchCode`, case number `O.A./1160/2017`, two party names | — |
| RERA MH | `appeal_no`, `judgment_order_type` ∈ {Roznama, Order, Judgement}, `appellant_name`, `respondent_name`, `doc_path` | — |

RERA is the clearest case: **85% of its 49,167 records are `Roznama`** — the
daily order sheet, not a reasoned decision. Loading those into `judgments` would
put 41,791 procedural sheets into the table the citation harness resolves
against, which is not a schema inconvenience but a **citation-safety** problem.
A retrieval hit on an order sheet, cited as authority, is the failure mode
`CLAUDE.md` §2 exists to prevent.

### 4b. The proposed shape

A `legal_documents` table for anything that is a published legal document and is
not a High Court or Supreme Court judgment, carrying:

- `source_id` — FK to a `sources` registry, so provenance is structural rather
  than a string repeated per row. `docs/SOURCE_REGISTRY.md` is that registry
  today, in markdown.
- `document_class` — `judgment | order | roznama | cause_list | circular |
  notice`. **The Roznama split must be storable**, or the 85% cannot be excluded
  from retrieval.
- `source_native_id`, `source_url`, `fetched_at`, `raw_payload` — the same
  provenance discipline as §3b.
- `is_citable` — derived from `document_class`, and the flag retrieval filters
  on. A Roznama is real, worth holding, and must never be offered as authority.

**Deliberately not proposed:** a shared table with `judgments` behind a view, or
a `document_type` column on `judgments`. Both put procedural material one
missing `WHERE` clause away from the citation path, and the whole point of
§4a is that this is a safety boundary rather than a modelling preference.

---

## 5. WHAT THIS PROPOSAL DOES NOT SETTLE

- **It is not an `OPEN_DECISIONS` entry and must not become one by accident.**
  These are schema shapes inside an agreed direction, not product decisions.
  If LCC reads any of it as reopening a settled decision, that reading wins and
  the item goes to `docs/OPEN_DECISIONS.md` instead.
- **No migration is written and no column is created.** `packages/db/src/schema.ts`
  is not this lane's file.
- **Nothing here is authorised to ingest.** CCI, CAT and RERA are all sitting
  behind `FQ-CCI-PERMISSION`, and this document describes where their rows would
  go *if* the answer is yes.
- **The event vocabulary is proposed from what CAT and eCourts publish**, which
  is two sources. A third will probably add a transition, and the enum grows
  again. That is the expected behaviour, not a design failure — which is the
  argument for an enum that grows over a `text` column that never has to.
