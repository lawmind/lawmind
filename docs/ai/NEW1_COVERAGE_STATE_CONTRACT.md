# NEW1 — COVERAGE STATE, A RETRIEVAL CONTRACT

**Owner: NEW1.** Written 18 August 2026. This is a requirement on the retrieval
API for LCC to implement and RCC to render. It is **not UI design** — it is a
statement about what the retrieval layer must be able to say about its own
answer.

---

## THE FAILURE THIS PREVENTS

An advocate searches for authority on a question of Bombay High Court practice
in 2008. LawMind returns nothing. The advocate concludes **there is no such
law.**

There is. We hold **zero Bombay judgments for 2005–2011** and the documents
exist at source. A zero-result screen and a genuine absence of authority are
indistinguishable to the person reading them, and only one of them is true.

This is the same class of error as a fabricated citation, arriving from the
opposite direction. `CITATION_HARNESS.md` already forbids a citation being
silently dropped. **A whole court-year being silently absent is a silent drop
with a bigger denominator.**

---

## WHAT WAS MEASURED, 18 AUGUST 2026

Counted directly, not taken from a report — and it **corrects bus 0703**, which
recorded the Bombay blackout as 1996–2012:

```
court ILIKE '%bombay%', judgments per year

1994    71     2000    30     2005-2011  ABSENT ENTIRELY
1995    12     2001    29     2012    43,678
1996     5     2002    44     2013    81,161
1997     6     2003    44     2014    83,114
1998     7     2004    26     2015    86,438
1999     6
```

Two corrections to the record, and the second is the one that shapes this
contract:

1. **The true blackout is 2005–2011, not 1996–2012.** 2012 holds 43,678
   judgments, not zero.
2. **1996–2004 is not a blackout. It is far more dangerous than one.** Those
   years hold 5 to 44 judgments each, against a court that files tens of
   thousands a year. A "do we have anything for this court-year" test passes.
   A search returns four results. The screen looks like an answer.

> **`PARTIAL` is the state that hurts, not `KNOWN_GAP`.** An empty screen is at
> least visibly empty. A screen with six results, from a year we hold 0.02% of,
> is a confident wrong answer with no tell.

Query cost is worth recording: that single grouped count took **86.5 seconds**
on the live box. Coverage cannot be computed per request. See §Implementation.

---

## THE TWO AXES — and why one is not enough

Every coverage discussion in this repo so far has been about **acquisition**:
do we hold the document? NEW2 and NEW3 own that axis and have mapped it (22
court-year blackouts, of which NEW3 confirmed 8 runs exist at source and only
**Madras 1998** has no source rows at all).

There is a second axis that produces **the identical empty screen** and belongs
to this lane:

**REACHABILITY — can the arm serving this query reach what we hold?**

`40,161 documents of 9,536,254 are embedded. That is 0.42%`
(`docs/ai/new1-post-0055/vectors-per-document.json`).

The dense arm cannot return a document that has no chunks. So for 99.58% of the
corpus, a document we successfully acquired, normalised, stored and indexed is
**invisible to semantic search**. It is held and unfindable.

A contract with only the acquisition axis would report `COVERED` for a
court-year we hold in full and cannot semantically retrieve at all.

| | held | not held |
| --- | --- | --- |
| **reachable** | genuinely covered | — |
| **not reachable** | **held and invisible — the 99.58% case** | the acquisition gap |

The two axes are independent and the API must carry both.

---

## THE STATES

Per query, scoped to the **court × year** cells the query's filters actually
select. Not one global number — a corpus-wide percentage is exactly the figure
NEW2's five-state report refused to print, and for the right reason.

| state | meaning | what makes it true |
| --- | --- | --- |
| `COVERED` | we hold substantially what the source publishes, and retrieval can reach it | held/source above threshold **AND** reachable |
| `PARTIAL` | we hold some of what exists, materially less than the source | held/source below threshold, held > 0 |
| `KNOWN_GAP` | we hold nothing and the documents are known to exist at source | held = 0, source > 0 |
| `SOURCE_HAS_ZERO` | we hold nothing and the source publishes nothing — the only honest "no such law here" | held = 0, source = 0, source measured |
| `UNKNOWN` | nobody has measured this cell | no source census for the cell |

**`UNKNOWN` is not a fallback and must never be rendered as `COVERED`.** It is
the default state of every cell nobody has counted, and the default must be the
one that admits ignorance. Today most of the corpus is `UNKNOWN` on the
acquisition axis and known-bad on the reachability axis.

**`SOURCE_HAS_ZERO` requires a positive measurement**, not the absence of one.
NEW3 has exactly one confirmed instance (Madras 1998). Inferring it from "we
found nothing" would recreate the whole failure.

### Reachability is reported separately, never folded in

```
coverage: {
  holding:      COVERED | PARTIAL | KNOWN_GAP | SOURCE_HAS_ZERO | UNKNOWN
  reachability: EMBEDDED | LEXICAL_ONLY | UNKNOWN
}
```

`LEXICAL_ONLY` means the cell is searchable by words and not by meaning — true
for 99.58% of the corpus today. Collapsing the two into one enum would force a
choice between two different truths, and the product needs both: an advocate
whose semantic search found nothing in a `LEXICAL_ONLY` cell has been told
something useful and actionable, which is *try the exact words*.

---

## THE API REQUIREMENT

Additive. Nothing existing changes shape, so it does not reopen the frozen
contract.

```
POST /search  ->  {
  results: [...],                      // unchanged
  coverage: {
    state: 'COVERED'|'PARTIAL'|'KNOWN_GAP'|'SOURCE_HAS_ZERO'|'UNKNOWN',
    reachability: 'EMBEDDED'|'LEXICAL_ONLY'|'UNKNOWN',
    cells: [                           // the court-years the query actually selected
      { court: 'Bombay High Court', year: 2008,
        state: 'KNOWN_GAP', held: 0, sourceEstimate: 92341,
        reachability: 'LEXICAL_ONLY' }
    ],
    measuredAt: '2026-08-18T...'       // coverage is a SNAPSHOT, and must say so
  }
}
```

Three rules on it:

1. **`coverage` is REQUIRED on every search response, including successful
   ones.** A field that appears only when something is wrong trains everyone to
   read its absence as "fine", and absence is also what a broken computation
   produces. This is the same reasoning `metrics.ts` `rate()` applies to a null
   rate, and `grade()` applies to reporting all six metrics every run.
2. **`state` is the WORST state among `cells`.** A search spanning a covered
   year and a blackout year is not covered.
3. **`measuredAt` is not decoration.** Coverage changes every time the ingest
   fleet writes. A cached `COVERED` outliving its truth is the same defect as a
   cached `overruled_status`, which this codebase already forbids outright.

### For RCC

The rendering rule follows from the existing citation grammar and does **not**
need a new colour. Amber `#B4690E` is reserved for THE LAW HAS MOVED and this is
not that.

- `COVERED` renders as **nothing**. Silence means covered, exactly as silence
  means verified.
- `PARTIAL`, `KNOWN_GAP` and `UNKNOWN` render as our own uncertainty — neutral
  ink, dashed edge — because that is what they are: a limit of our holdings, not
  a fact about the law.
- `SOURCE_HAS_ZERO` is the only state that may say anything resembling "there is
  nothing here", and it needs a positive source measurement behind it.
- Copy follows the licence-protection rule: **"We hold no Bombay judgments for
  2008"**, never "no such law exists"; **"We hold part of this year"**, never
  "these are all the cases".

---

## IMPLEMENTATION NOTE — it cannot be a live query

The measurement above took **86.5 seconds**. A per-request grouped count over
`judgments` is not available at Gate S1 latency, and 738 of 1,219 slow
statements on this box are already the retrieval path (NEW2 bus 0711).

So coverage must be a **precomputed table**, refreshed by the ingest fleet as it
writes — court × year × held × source_estimate × measured_at — and read by a
single indexed lookup per request. The source estimates already exist in NEW2's
and NEW3's census work; what does not exist is a table the retrieval path can
read.

**That table is the one piece of new state this contract requires.** Everything
else is arithmetic over it.

---

## WHAT I HAVE NOT ESTABLISHED

- **The `PARTIAL` threshold is not set**, deliberately. Where "materially less"
  begins is a product judgement about when a result set stops being an answer,
  and it is not mine to fix alone. Bombay 1997 at 6 documents is obviously
  `PARTIAL`; a year at 85% of source is arguably `COVERED`. I recommend the
  threshold be recorded in `PRODUCT_DECISIONS.md` rather than chosen in code.
- **Source estimates are NEW2's and NEW3's, and one is already known to be
  wrong in a specific way**: bus 0692 established that `HC_METADATA_SURVEY`
  counts parquet ROWS, not documents, and that Allahabad 2023's 220,443-row gap
  was exactly duplicate listings. A `PARTIAL` computed against an inflated
  denominator over-reports the gap. The contract should carry the source
  estimate's provenance, not just its value.
- **I verified one court.** Bombay. The other 21 blackouts are NEW2's
  measurement and I have not independently counted them.
- **The reachability axis has no per-cell data yet.** I know the corpus-wide
  figure (0.42%) and that the embedded population is essentially Supreme Court.
  Which court-years are embedded is a `judgment_chunks` join nobody has run, and
  on this box it is not a cheap one.

---

## ADDENDUM, 19 AUGUST 2026 — REACHABILITY IS COURT-SHAPED, AND THE 0.42% IS STALE

Measured with a full `GROUP BY court` over `judgments` joined to the distinct
judgment ids in `judgment_chunks`. 39.5 s, 7 other backends active.
Artifact: `docs/ai/new1-fusion-policy/embedding-coverage-by-court.json`.

| court | held | embedded | coverage |
| --- | --- | --- | --- |
| Supreme Court of India | 38,342 | 38,341 | **99.9974%** |
| Gauhati High Court | 273,226 | 492 | 0.1801% |
| Patna High Court | 1,639,111 | 1,208 | 0.0737% |
| High Court of Meghalaya | 12,682 | 58 | 0.4573% |
| High Court of Sikkim | 2,428 | 10 | 0.4119% |
| High Court of Manipur | 18,745 | 46 | 0.2454% |
| High Court of Kerala | 954,027 | 3 | 0.0003% |
| High Court of Madhya Pradesh | 607,107 | 3 | 0.0005% |
| **18 further courts** incl. Allahabad, Bombay, Madras, P&H, Telangana, Rajasthan, Karnataka, Orissa | **14,399,479** | **0** | **0.0000%** |
| **all 26 courts** | **17,945,147** | **40,161** | **0.2238%** |

**Three corrections this forces on the body of this document.**

1. **The denominator moved.** 17,945,147 judgments, not the 9,536,254 this
   document was written against and not the 14,973,372 in LCC's bus 0723. NEW2's
   ingest is running continuously, so any figure of the form "X% of the corpus"
   is stale on a timescale of days. Where possible, state counts and the date;
   percentages age badly here.
2. **Reachability is 0.2238%, not 0.42%** — and the direction of the error
   matters: the corpus grew faster than the embedded population, so every earlier
   estimate was optimistic.
3. **Reachability does not need estimating at all.** The distribution is not
   diffuse, it is **bimodal by court**: one court at ~100%, every other court at
   or below 0.46%. So `reachability` per court-year is an exact aggregate over a
   table we already have, not a modelled figure. The honest implementation is a
   counted `(court, year) -> (held, embedded)` rollup refreshed on a schedule,
   and today it would return `EMBEDDED` for exactly one court.

**The operational rule as of 19 Aug 2026**, stated so nobody re-derives it from
a corpus-wide average: *Supreme Court is `EMBEDDED`. Every other court is
`LEXICAL_ONLY`.* That is not a simplification of the data — it is what the data
says to four decimal places.

**Why this belongs in the retrieval contract and not only in a census.** The
fusion policy validated on 19 Aug (`NEW1_FUSION_POLICY_VALIDATION.md`) is gated
on exactly this quantity: a policy that prefers the dense arm may only fire where
the dense arm can see the candidate universe. With the table above, that gate is
a lookup. Without it, it is a guess about which the whole benchmark is silent —
every gold judgment in the frozen 283-query set is Supreme Court and embedded, so
the benchmark cannot detect a coverage error by construction.

### The implementation is smaller than the contract makes it sound

`services/api/src/search/route.ts` already returns `unpopulatedCourtCategories`
(`court-category.ts` §`unpopulatedCategories`). That is the ACQUISITION axis and
only that axis: it answers *"do we hold anything at all in this category"*. There
is no reachability signal anywhere in the response today.

The missing half needs one rollup, not a new subsystem:

```sql
-- refreshed on a schedule, never computed per request
CREATE TABLE embedding_coverage_by_court AS
SELECT j.court,
       count(*)::bigint                                   AS held,
       count(*) FILTER (WHERE c.judgment_id IS NOT NULL)  AS embedded
FROM judgments j
LEFT JOIN (SELECT DISTINCT judgment_id FROM judgment_chunks) c ON c.judgment_id = j.id
GROUP BY j.court;
```

Measured cost of that shape today: **39.5 s** over 17.9M rows with seven other
backends active. It must NOT be a live query on the search path — the route is
already at p50 43s under fleet load, and `expandCategories` was exactly this
mistake once already (bus 0715).

The response then carries `reachability` from a lookup:

```
EMBEDDED       embedded/held >= COVERAGE_FLOOR for every court in scope
LEXICAL_ONLY   below the floor — searchable by words, not by meaning
UNKNOWN        the rollup has no row for this court
```

`COVERAGE_FLOOR` is not set here. It is a product-risk decision about how much
unreachable law is tolerable inside a filtered search, and it belongs with the
founder or with `PRODUCT_DECISIONS.md`, not inside a `WHERE` clause written by
this lane.

---

## ADDENDUM, 21 AUGUST 2026 — `PARTIAL` ALONE IS NO LONGER SUFFICIENT TO RENDER

LCC's migration `0062` (bus 0901) added a second, orthogonal axis to
`coverage_cell`: `shortfall_reason`. Nothing this contract reads broke —
`source_state`, `held_share`, `reachability`, `embedded` and `eligible` are
unchanged in name, type and meaning — but the rendering rule above is now
**wrong on 131 of 257 `PARTIAL` cells**, and wrong in the direction that matters.

### What the measurement found

Of the 257 cells carrying a shortfall, 1,579,075 rows:

```
179 cells   the shortfall is ENTIRELY permanentAbsent + retryable
 40 cells   partly
 38 cells   wholly unexplained
```

**Bombay 2006 is short 6,276 and its `permanentAbsent` is 6,275. Bombay 2007 is
short 6,706 and its `permanentAbsent` is 6,706, exactly.** Under the rule as
written those cells render as our own uncertainty — *we hold part of this year* —
about documents **the court never published**. That is not a limit of our
holdings. It is a fact about the source, and saying otherwise understates the
corpus to an advocate deciding whether to trust it.

The genuinely unattributed gap is **153,204 rows over 115 cells, not 1,579,075
over 257** — the old presentation overstated the unknown by 10.3x in rows.

### The rule, amended

`source_state` decides WHETHER something is said. `shortfall_reason` decides
WHAT. Both are read; neither is derived from the other; and this is the same
relationship `overruled_status` has to `verification_state` — two independent
questions, two independent fields, and what renders is derived from both at
render time.

| `source_state` | `shortfall_reason` | renders |
| --- | --- | --- |
| `COVERED` | `NONE` | **nothing** |
| `PARTIAL` | `SOURCE_ABSENT` | **nothing** — the court did not publish them; there is no gap in our holdings to confess |
| `PARTIAL` | `RETRYABLE` | **nothing** — a fetch we will retry is our backlog, not a hole in the law |
| `PARTIAL` | `PARTLY_EXPLAINED` | our own uncertainty, on the unexplained remainder only |
| `PARTIAL` | `UNEXPLAINED` | our own uncertainty, as before |
| `PARTIAL` | `DENOMINATOR_SUSPECT` | our own uncertainty, **with the percentage suppressed** |
| `KNOWN_GAP` / `UNKNOWN` | any | our own uncertainty, as before |
| `SOURCE_HAS_ZERO` | any | the only state that may say "there is nothing here" |

LCC's recommendation is taken as written, with one addition of my own:
`PARTLY_EXPLAINED` must render on the **unexplained remainder**, not on the whole
shortfall, or it repeats the same overstatement at a smaller scale.

### `DENOMINATOR_SUSPECT` suppresses the number, never the warning

Allahabad 2018 reads 456,951 source rows against 228,653 documents — a ratio of
1.998 — and 2019 reads 1.988. **A coverage figure does not land on 50.0% twice.**
Those cells are `WALKED` with `remainingRows: 0`, the ingest ledger holds 22,407
rows for the entire court, and half a million walked rows produced neither a
document nor a failure. The only thing they can have been is rows for documents
already held. This is "source count is parquet rows, not documents" surfacing as
a product claim: we were about to tell an advocate we hold **half of Allahabad**
when we hold essentially all of it.

So the flag suppresses the SHARE and keeps the uncertainty. Hiding the warning
would let a real gap in an unchecked court disappear behind a suspect
denominator, and LCC's decision to enumerate the affected courts explicitly
rather than infer them from a ratio threshold is right for the same reason.

### What is NOT changed

The five `source_state` values keep their names. Renaming them to express what
`shortfall_reason` now carries would break a contract that is frozen for the
sprint in order to buy vocabulary, and the five already encode the honest
categories.

**Reachability is now 264,071 documents over 581 court-year cells**, against the
40,161 the `0059` header was written against — the Tier-A vectors landing. The
`LEXICAL_ONLY` count in the 19 August addendum is stale in the favourable
direction and should be re-read from the table rather than quoted from here.

---

## ADDENDUM, 15 SEPTEMBER 2026 — THE REACHABILITY AXIS NOW HAS TWO POPULATIONS,
## AND EVERY FIGURE ABOVE DESCRIBES THE SMALLER ONE

The 19 August addendum's operational rule — *"Supreme Court is `EMBEDDED`. Every
other court is `LEXICAL_ONLY`."* — is **still correct for the arm that is wired**
and is now **badly misleading as a description of what this lane holds.** Both
halves of that sentence matter, and conflating them is the error this addendum
exists to prevent.

### The wired arm has not moved

`services/api/src/search/retrieve.ts` reads `judgment_chunks` UNION
`new1_tranche_passages`. It does **not** reference `new1_doc_vector_stage`
anywhere. So `reachability` as the retrieval API can currently compute it is
unchanged, the 40,161-document figure on
`V1_CAPABILITY_REGISTRY_R16.json#search.semantic.broad` is still right about
public reach, and nothing in this addendum enables anything.

### The coarse generation is terminal

Measured 15 September 2026 against the **live** `judgment_embedding_eligibility`
view, not against the frozen 27-August `embedding_content_representative` cut:

| | |
| --- | ---: |
| eligible distinct content identities | 7,673,702 |
| embedded distinct content identities | **7,673,702** |
| eligible documents | 8,442,638 |
| queued | 0 |
| unnamed residual | **0** |

One pass, 13m00s, zero other active backends. `uncovered_distinct_content = 0`
and `uncovered_documents = 0`.

**The 7,654,179 denominator this lane has quoted since 27 August is superseded.**
It is 19,523 content identities short of current eligibility — exactly the
post-cut delta the incremental queue produced — and dividing by it answers a
question about a worklist file rather than about the corpus.

### What this means for the two axes

The contract's shape is unchanged and `reachability` still belongs in the
response. What changed is that **`EMBEDDED` and `LEXICAL_ONLY` can no longer be
read off a single corpus-wide fact**, because there are now two vector
populations of very different size and only the smaller one is reachable from a
route:

```
judgment_chunks + new1_tranche_passages   wired, 40,161 documents      -> reachability today
new1_doc_vector_stage (5b5d02384b46c96c)  not wired, 8,442,638 documents -> reachability if pointed at
```

A rollup computed over the second and reported as `reachability` would tell an
advocate the dense arm can see law it cannot see. **The rollup must name the
table it counted.** That is the same discipline the body of this document
already applies to `held` versus `source_estimate`, applied one layer down.

Whether the retrieval path is ever pointed at `new1_doc_vector_stage` is a
product decision recorded in the capability registry, which is NEW3's, not this
lane's. Evidence for it: `docs/ai/new1-r14/NEW1_R14_FINALIZATION.md`.
