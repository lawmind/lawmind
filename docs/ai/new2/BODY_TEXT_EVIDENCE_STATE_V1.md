# BODY-TEXT EVIDENCE STATE V1 — the screening already happened, and the import is arithmetic

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Consumer:** LCC (owns
`judgment_quality_contract`, the migration, and `body-text-safety.test.ts`)
**Plan:** `LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md` §8 / NEW2-3
**Supersedes the open question in** `BODY_TEXT_EVIDENCE_STATE_2026-08-23.md`

**No corpus mutation. Nothing written. This measures what a migration WOULD produce.**

---

## 0 · The answer, before the working

§8: *"Do not rescan 18.7M documents unnecessarily if completed screen evidence
can be imported/persisted."*

**It can, and no rescan is needed — but not by the watermark the checkpoint
offers.**

| | |
| --- | ---: |
| documents the checkpoint says were screened | **18,698,968** |
| documents created before the run started | **18,698,968** |
| difference | **0** |
| documents created after the run | 16 |
| of those 16, how many sit BELOW the checkpoint's id cursor | **16 of 16** |

The count reconciles **exactly**. The id cursor is **unusable**, and would
falsely certify 100% of the rows created since. The safe watermark is time.

---

## 1 · The defect being fixed, restated with today's numbers

`judgment_quality_contract.text_state` collapses two different facts into
`TEXT_UNKNOWN`. Counted 23 August over all 18,698,984 rows:

| `script_quality` | `script_quality_method` | rows |
| --- | --- | ---: |
| `NULL` | `NULL` | **16,906,663** |
| `damaged_other` | `english_density_screen_v1` | 1,264,107 |
| `damaged_other` | `text-damage-v2.0` | 469,599 |
| `legacy_font_ascii` | `text_marker_screen_v1` | 58,615 |
| `clean` / `mixed_script_ok` | — | **0** |

**No writer has ever emitted a clean verdict**, so 100% of `TEXT_UNKNOWN` is
today indistinguishable from *never looked at* — 90.42% of the corpus.

And that is the wrong way round, because the looking **did** happen.

---

## 2 · The evidence exists; it is in a file that cannot be joined

`services/ingest/.checkpoints/text-safety-screen-all.json`:

```json
{ "scope": "all", "cursor": "ffffff40-1694-46f8-8dc7-f9532537609d",
  "screened": 18698968, "candidates": 1712802, "written": 1712802,
  "byState": { "UNKNOWN": 16986166, "OCR_CANDIDATE": 1654187,
               "LEGACY_FONT_SUSPECT": 58615 },
  "startedAt": "2026-08-21T17:54:09.987Z",
  "updatedAt":  "2026-08-22T05:55:26.326Z" }
```

The screen **writes only when it convicts**. So *"this document was screened and
nothing was found"* — the single most common outcome, 16.9 million times —
survives only as a number in a JSON file. That is the whole gap.

---

## 3 · Why the id cursor must not be the watermark, and the falsifier that proves it

The walk pages `WHERE id > cursor ORDER BY id`, and `judgments.id` is a **random
uuid**. A row inserted after the run gets a random id, which lands below a cursor
of `ffffff40…` with near-certainty. So `id <= cursor` means *"sorts below where
we stopped"*, never *"we looked at it"*.

Run as a falsifier rather than argued:

| | |
| --- | ---: |
| judgments created after the run finished | 16 |
| **of those, sitting below the id cursor** | **16 (100%)** |

Every one would be certified as screened having never been looked at.

`script-quality-page.ts` already carries this warning in its own header —
*"740,993 of 740,993 rows created after the 19 August pass began sort BELOW its
final watermark"* — and provides `pageSince` for incremental work. **The module
knows. The checkpoint format does not.** This document's contribution is the
reconciliation that makes the time watermark usable, and the falsifier count.

### The time watermark, reconciled

| | rows |
| --- | ---: |
| corpus now | 18,698,984 |
| `created_at < 2026-08-21T17:54:09.987Z` | **18,698,968** |
| created **during** the run | **0** |
| created after it | 16 |

**18,698,968 against a claimed 18,698,968.** Not approximately — exactly, and
with an empty during-run window, so there is no ambiguous middle band.

### And "screened" really does mean the detector ran

A count can be inflated by rows the walk fetched but never evaluated — the
`unclassified is two populations` failure. `textVerdict` returns
`NO_EXTRACTABLE_TEXT` for empty text, which is a **verdict**, and the
checkpoint's `byState` has **no such bucket**, implying no row was empty.
Checked independently:

| | |
| --- | ---: |
| `full_text IS NULL` (exact, whole corpus) | **0** |
| `length(full_text) = 0` (94,818 sampled, `TABLESAMPLE SYSTEM (0.5)`) | **0** |

`pageAll` carries no `script_quality IS NULL` filter, so the walk saw every row
rather than only the unconvicted ones — which is also why `screened` equals the
whole corpus rather than 17M.

*(`length(full_text)` over all 18.7M detoasts every value and did not finish
inside ten minutes. The NULL count is exact because NULL lives in the tuple
header; the empty-string count is a bounded sample and is reported as one.)*

---

## 4 · The contract — unchanged in shape, now with a populatable import

`body_text_evidence`, four values, **additive** on `judgment_quality_contract`.
`text_state` and `text_grade` keep their meaning and their consumers.

| value | meaning |
| --- | --- |
| `PROVEN_DAMAGED` | a proof-grade method convicted it (`text-damage-v2.0`) |
| `SCREENED_DAMAGED` | a weaker screen convicted it |
| `SCREENED_NO_DAMAGE_FOUND` | a named screen ran over this document and did not convict |
| `NEVER_SCREENED` | no screen has ever run over it |

The name is `SCREENED_NO_DAMAGE_FOUND`, **not `SCREENED_CLEAN`**, and that is the
point. Our English-density screen missed **32 of 43** glyph dumps whose signature
footer lifts the English rate. A screen that did not convict has found no damage;
it has not certified the text.

### 4.1 A run-level coverage record, not 18.7 million rows

The predecessor design proposed `quality_screen_runs (judgment_id, method, …)` —
one row per document per method. **That is not needed and cannot be populated**,
because the checkpoint names no ids. What the evidence actually supports is a
**run-level** record, which is both honest and three orders of magnitude smaller:

```sql
CREATE TABLE quality_screen_runs (
  method            text        NOT NULL,   -- 'english_density_screen_v1'
  scope             text        NOT NULL,   -- 'all' | 'staged'
  started_at        timestamptz NOT NULL,   -- THE WATERMARK
  finished_at       timestamptz NOT NULL,
  rows_screened     bigint      NOT NULL,
  convicted         bigint      NOT NULL,
  checkpoint_sha256 text        NOT NULL,   -- the file this row was imported from
  PRIMARY KEY (method, scope, started_at)
);
```

One row per completed pass. `started_at` is the watermark, and it is the field
the whole design turns on:

```sql
CASE
  WHEN j.script_quality_method = 'text-damage-v2.0' THEN 'PROVEN_DAMAGED'
  WHEN j.script_quality IS NOT NULL                 THEN 'SCREENED_DAMAGED'
  WHEN EXISTS (SELECT 1 FROM quality_screen_runs r
                WHERE j.created_at < r.started_at)  THEN 'SCREENED_NO_DAMAGE_FOUND'
  ELSE                                                   'NEVER_SCREENED'
END AS body_text_evidence
```

**`j.created_at < r.started_at`, never `j.id <= r.cursor`.** The cursor is
deliberately not a column of this table, so it cannot be used by accident.

### 4.2 What the column reads, before and after

| | today | after import |
| --- | ---: | ---: |
| `PROVEN_DAMAGED` | 469,599 | 469,599 |
| `SCREENED_DAMAGED` | 1,322,722 | 1,322,722 |
| `SCREENED_NO_DAMAGE_FOUND` | **0** | **16,906,647** |
| `NEVER_SCREENED` | **16,906,663** | **16** |

**Nothing about damage changes.** 1,792,321 documents are refused as research
evidence before and after. What changes is that LawMind stops saying *"we have
never looked"* about 16.9 million documents it did look at.

### 4.3 The safety argument, and its one weak point stated plainly

Shipping the view expression **before** the import is safe: with the table empty,
every unconvicted row reads `NEVER_SCREENED`. The contract can then only become
*more* generous as evidence arrives, never less.

The import itself makes the claim stronger, so it needs the stronger evidence —
which is §3, and it is exact.

**The weak point:** `SCREENED_NO_DAMAGE_FOUND` inherits the *screen's* weakness.
It says a named method ran and did not convict; the same method missed 32 of 43
glyph dumps, and `text_quality >= 0.85` certifies documents that are pure
garbage. The value must never be read as "this text is good" — §4.4 is the whole
consumer contract and it does not change.

### 4.4 Consumer guidance — unchanged in substance

| a consumer asking | reads |
| --- | --- |
| may I quote this text as evidence? | `PROVEN_DAMAGED` / `SCREENED_DAMAGED` → **no**. Anything else → not refused, **not certified** |
| may I embed / index this? | LCC's existing eligibility view. Unchanged |
| is this judgment findable at all? | metadata, **never** this column |
| how strong is the damage verdict? | `text_grade` (`PROOF` / `SCREEN` / `NONE`), unchanged |

**Recovery stays a separate axis.** A recovered document is still
`PROVEN_DAMAGED` in its original text; the recovery sits beside `full_text`,
never over it.

**Do not surface this in the UI by default.** The advocate's question is "can I
rely on this", answered by the citation states. Our screening coverage is an
operational fact about us.

---

## 5 · What this lane will do the moment the table exists

`text-safety-screen-cli.ts` and `text-damage-persist-cli.ts` are this lane's
writers, and both already know per document whether they convicted — they simply
discard the negative. Two changes, both small:

1. **Import the completed pass**: one row, from the checkpoint above, with its
   sha256. No corpus read at all.
2. **Emit a run row on completion** from both CLIs, so the next pass is
   self-recording rather than needing an import.

**Not done unilaterally.** The table and the view are LCC's, and
`body-text-safety.test.ts` deliberately pins the view expression against
`pg_get_viewdef`. That tripwire is working as designed; this document is the
coordination it exists to force.

---

## 6 · What this does not claim

- **It does not certify any text.** See §4.3.
- **It says nothing about the 16.9M documents' quality**, only that a named
  method looked and did not convict.
- **The 16 uncovered rows will grow.** Every new ingest adds to
  `NEVER_SCREENED` until a pass runs again — which is correct behaviour, and the
  reason the incremental `pageSince` path exists.
- **`text-damage-v2.0` coverage is partial and separate.** Its own checkpoint
  reports 1,626,762 rows read, not the corpus, so `PROVEN_DAMAGED` is a floor.
- **The empty-text falsifier is a 0.5% sample**, not a census.

---

## 7 · Reproduce

```
node --env-file=.env services/ingest/.n2c-p3-import.mjs   # §3 watermark + id falsifier
node --env-file=.env services/ingest/.n2c-p3-states.mjs   # §4.2 before/after, empty-text check
```

Artifacts: `body-text-import-feasibility.json` · `body-text-evidence-states.json`.

All timings **LOCAL_CONTENDED**; 6–11 concurrent PostgreSQL queries throughout,
recorded per step.
