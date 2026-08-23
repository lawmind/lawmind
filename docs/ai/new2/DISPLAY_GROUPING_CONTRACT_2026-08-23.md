# THE DISPLAY-EQUIVALENCE CONTRACT — what a result page may fold, and what it must never

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Consumers:** LCC (search,
pagination), NEW1 (ranking), NEW3/RCC (result rendering)

26.3% of citation-bearing rows share their neutral citation with another row.
The 22 August source-document study settled *why*, on the PDFs themselves: the
courts are complicated and we ingested some documents twice. **The corpus is not
being deduplicated.** This contract answers a narrower question — given a set of
judgments a search is about to show, which are the same thing *to a reader*.

Module: [display-group.ts](services/ingest/src/display-group.ts) ·
14 tests · measurement CLI `display-group-cli.ts`.

---

## 1 · The five classes, and which two may fold

| class | evidence | search behaviour |
| --- | --- | --- |
| `BYTE_IDENTICAL_DUPLICATE` | one `content_hash` across every member | **COLLAPSE** |
| `SAME_SOURCE_DOCUMENT_DUPLICATE` | one `source_url` or `storage_key`, hashes differ (re-extraction) | **COLLAPSE** |
| `CONNECTED_MATTER_COMMON_ORDER` | one court, one date, several case numbers | GROUP, show the count, never hide |
| `MULTIPLE_ORDERS_SAME_CASE` | one CNR or case number, several dates | GROUP, never hide — the advocate usually wants the latest and sometimes an earlier one |
| `DISTINCT_JUDGMENTS_SHARED_CITATION` | anything else | **NEVER GROUP** |

Asymmetry is deliberate. Hiding an authority the advocate needed is worse than
showing one order twice, so only the two classes resting on *document* evidence
collapse without a human ever having looked.

`isAutoCollapsible()` is the single predicate, and a test asserts the list is
exactly those two — a later edit that adds a third has to change a test that says
why it may not.

## 2 · Measured, weighted by rows

Population: **155,387 groups · 361,044 rows** (`judgments.neutral_citation`,
matching the 22 Aug census of 155,388/361,045 — the corpus moved by one row).
Sample: **700 groups · 1,533 rows**.

| class | groups | rows | share of shared rows |
| --- | ---: | ---: | ---: |
| `BYTE_IDENTICAL_DUPLICATE` | 337 | 782 | **51.01%** |
| `CONNECTED_MATTER_COMMON_ORDER` | 267 | 559 | 36.46% |
| `DISTINCT_JUDGMENTS_SHARED_CITATION` | 80 | 160 | 10.44% |
| `MULTIPLE_ORDERS_SAME_CASE` | 16 | 32 | 2.09% |
| `SAME_SOURCE_DOCUMENT_DUPLICATE` | 0 | 0 | 0% |

### How much duplication disappears

**445 of 1,533 shared rows = 29.03%**, folding only the two document-evidence
classes. Against the whole shared population that is roughly 104,800 rows that
stop appearing twice, and **zero** of them are an authority a reader loses.

### Two honest disagreements with the 22 August study

That study read source PDFs and classified by what the citation *did* in the
document; this one classifies by structured columns. They agree where it matters
and differ where the method differs:

| | PDF study | this contract |
| --- | ---: | ---: |
| duplicate | 53.89% | 51.01% |
| connected matter | 30.74% | 36.46% |
| several orders, one case | 13.85% | **2.09%** |

1. **`MULTIPLE_ORDERS_SAME_CASE` reads low** because it demands one CNR *or* one
   normalised case number. Where a registry numbered the orders differently, the
   group falls into `CONNECTED_MATTER_COMMON_ORDER`. Both are non-collapsing, so
   nothing is hidden by the confusion — but the label is less precise than the
   PDF study's, and the `cnr` column would have to be fuller to fix it.
2. **`DISTINCT_JUDGMENTS_SHARED_CITATION` at 10.44% is an upper bound**, not a
   claim that a tenth of shared citations name different authorities. It is the
   *residue*: everything the four positive tests could not establish. The PDF
   study's 0.11% extractor contamination is the measured lower bound. The truth
   is between, and the contract behaves correctly at either end because this
   class never collapses.

## 3 · The representative is chosen from the document, never from row order

`ORDER BY … LIMIT 1` with no total tiebreak returns whatever the heap hands
back, so two runs disagree and the same judgment paginates onto two pages.
`representative()` applies four document properties in a fixed order:

1. readable text beats proven-damaged text (`script_quality`)
2. a native text layer beats a fought-for extraction (`native_text`)
3. more text beats less — a truncated copy is the worse copy
4. a fetchable source beats one whose paper we cannot show

and then, when every one of those ties, a **total** order: lowest
`content_hash`, then lowest `id`. A test asserts `representative([a,b])` and
`representative([b,a])` return the same id.

## 4 · The shape LCC and NEW1 consume

```ts
type DisplayGroup = {
  group_id: string;                 // dg_<fnv1a over sorted member ids>_<n>
  group_type: GroupType;            // the five above
  auto_collapsible: boolean;        // exactly the two document-evidence classes
  representative_id: string;
  representative_reason: string;    // which criterion decided it
  member_ids: string[];             // SORTED, so no caller can depend on row order
  members_hidden_if_collapsed: number;
  evidence: { members, distinct_content_hashes, distinct_dates,
              distinct_case_numbers, distinct_courts };
  confidence: 'DOCUMENT_EVIDENCE' | 'REGISTRY_EVIDENCE' | 'WEAK';
};
```

`group_id` is stable for a membership and independent of order; adding a member
changes it, which is correct — it is a different group.

### Pagination

NEW1's 1027 measured exact-identity pages as stable 6/6. A collapsed page must
count **groups**, not rows, or the page size drifts as folds are applied. The
representative's stability is what makes `LIMIT/OFFSET` over groups safe.

## 5 · What this contract does NOT do

- **It does not delete or merge a row.** Nothing here writes to the database.
- **It does not decide corpus identity.** `decision-identity.ts` produces
  identity *candidates* with strengths and its own promotion review; display
  equivalence is a rendering question and is deliberately weaker.
- **It does not touch citation resolution.** Two judgments sharing a citation
  stay two judgments; a resolver still refuses to pin one of them.
- **It does not read a group as a treatment.** See
  `RESOLUTION_IS_NOT_TREATMENT_2026-08-23.md`.

## 6 · Reproduce

```
node --env-file=.env --import tsx services/ingest/src/display-group-cli.ts
SAMPLE_GROUPS=700 …   # default 1200
```
Artifact: `docs/ai/new2/display-grouping-measurement.json`.

**One operational note for whoever runs it:** membership is matched through the
*indexed expression* `upper(regexp_replace(neutral_citation,'[^A-Za-z0-9]','','g'))`.
There is no index on the raw column, so an equality on `neutral_citation`
sequentially scans 22 GB **per group** — the first run of this measurement never
finished 900 of them for that reason.
