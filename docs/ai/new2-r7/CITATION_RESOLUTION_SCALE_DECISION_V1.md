# CITATION_RESOLUTION_SCALE_DECISION_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Machine-readable:** `docs/ai/new2-r7/citation-extraction-precision.json`
**Decision:** **CONDITIONAL GO for unique-safe bulk resolution — after two blockers are cleared.** Neither is a research problem; both are bounded and named in §5.

---

## 0. The decision in one table

| phase | gate | verdict |
| --- | --- | --- |
| **A — extraction precision** | is the extractor producing citations or garbage? | **PASS** — 99.949% structurally unrefuted; 0.051% refutable |
| **B — freshness correctness** | can a newly ingested collision produce a false unique? | **PASS, newly** — the ingest-side race is closed and proven (`CITATION_BATCH_GAP_RCA.md`); the serving-side bound is LCC's `RESOLVER_CORRECTNESS_FRESHNESS_V3` and is **not yet numeric** |
| **C — safe bulk resolution** | may we materialise unique resolutions at scale? | **CONDITIONAL** — the mechanism is sound and the yield is large, but **two defects must be fixed first or scaling multiplies them** |

**The prize, measured:** bulk unique-safe resolution would take the resolved
graph from **231,412** to approximately **2,735,781** — an **11.8×** increase — and
it is achievable with deterministic joins, no model, and no new source.

---

## 1. Phase A — extraction precision

### 1.1 The population is not the one everybody quotes

`judgment_citations` holds 22,322,063 rows. **16,090,216 of them (72.08%) are
sentinels, not references**: exactly one row per citing judgment, with
`citation_text = ''`, `char_offset = 0`, `evidence IS NULL` and
`cited_judgment_id IS NULL`. They record *"this document was processed and
yielded nothing"*, which is a legitimate thing to record and is not a citation.

**Every figure in this document is over the real population of 6,231,847
extracted citation strings.**

### 1.2 Structural precision — `SAMPLED`, 1-in-400, n = 15,662

| class | share |
| --- | ---: |
| `REPORTER_SHAPE` (AIR / SCC / SCR / CriLJ / ILR / …) | 75.584% |
| `NEUTRAL_SHAPE` (`2024:AHC-LKO:85127`) | 19.225% |
| `WELL_SHAPED_UNCLASSIFIED` | 4.846% |
| `BRACKET_MISMATCH_SUSPECT` — `(1964] 5 S.C.R. 931` | 0.294% |
| `NOT_A_CITATION_DESPATCH_STAMP` | 0.038% |
| `NOT_A_CITATION_NO_YEAR` | 0.013% |

```
structurally refuted                 0.051%
upper bound on structural precision  99.949%
resolved to a held judgment           3.703%
```

**This is an UPPER bound and is labelled as one everywhere it is used.** A rule
set can say with confidence that a string is *not* a citation; it cannot say a
well-shaped string points at the case the extractor thought. That question needs
the surrounding text and primary evidence, and is answered by
`citation-truth-set-v2`, not here.

By era and by court the picture is flat, which is itself the finding — extraction
quality is not the corpus's problem:

| era | sampled | refuted | resolved |
| --- | ---: | ---: | ---: |
| pre-1990 | 25 | 0.00% | 48.00% |
| 1990–2009 | 703 | 0.00% | 7.25% |
| 2010–2019 | 4,807 | 0.15% | 3.18% |
| 2020+ | 10,127 | 0.01% | 3.59% |

**Madras High Court is the only court above 0.1% refuted, at 0.82%** — entirely the
despatch-stamp class (§4). The Supreme Court resolves at 44.82% against every
High Court under 5.02%, which is a corpus-coverage fact, not an extraction one.

**Phase A PASSES.** The extractor is not the bottleneck. 96.3% of real references
fail to resolve because we do not hold the target, not because the string is bad.

---

## 2. Phase C — what a bulk resolution would actually produce

Measured before any write, by joining a 1-in-200 sample of real references to
`judgment_citation_keys` and counting **distinct** target judgments. n = 31,318.

| §7.4 outcome | n | share | already resolved today |
| --- | ---: | ---: | ---: |
| `TARGET_NOT_HELD` | 15,706 | **50.15%** | 0 |
| `UNIQUE_VERIFIED_INDEX_CURRENT` | 13,750 | **43.90%** | 987 |
| `AMBIGUOUS` (2–5 targets) | 1,632 | 5.21% | **115** |
| `AMBIGUOUS` (6+ targets, worst **1,257**) | 230 | 0.73% | **2** |

Extrapolated to the 6,231,847 real references:

```
would resolve UNIQUE          ≈ 2,735,781
already resolved                  231,412
NEW unique resolutions        ≈ 2,504,369          ← the prize
would be AMBIGUOUS            ≈   116,000          ← must stay explicit, never a rank-1 pick
target not held               ≈ 3,125,000
```

---

## 3. BLOCKER 1 — the existing resolved graph already contains ~10.6% ambiguous pins

This is the finding that changes the decision from GO to CONDITIONAL.

Of the 1,104 sample references that **already carry a `cited_judgment_id`**, **117
have a citation key that maps to more than one judgment**:

```
already resolved, key maps to exactly 1 judgment      987
already resolved, key maps to 2-5 judgments           115
already resolved, key maps to 6+ judgments              2
                                                   ------
ambiguous pins in the EXISTING graph          117 / 1,104  =  10.60%
```

Extrapolated: **roughly 24,500 of the 231,412 existing resolutions are pinned to
one of several possible targets.** The advocate sees a confirmed citation — and
verified is silent, so there is nothing on the surface to distrust — pointing at
a case chosen from a set.

**Scaling before fixing this multiplies it.** A bulk pass that inherits the same
"take what matched" behaviour turns 24,500 ambiguous pins into a proportional
share of 2.7M.

---

## 4. BLOCKER 2 — 26.32% of citation-bearing judgments share their neutral citation, and the cause is an ingest defect

A neutral citation identifies one judgment. In this corpus it frequently does not.

| distinct judgments per neutral key | keys | judgments |
| --- | ---: | ---: |
| **1 — genuinely unique** | 1,009,559 | **1,009,559 (73.68%)** |
| 2–9 | 154,206 | 325,274 |
| 10–49 | 978 | 17,648 |
| **50 or more** | 114 | **17,770** |
| | **1,164,857** | **1,370,251** |

**155,299 keys are ambiguous.** The worst maps to **1,257 judgments**.

### The shape, and why it is ours rather than the court's

`2025:AHC-LKO:30511` is carried by 1,257 Allahabad (Lucknow) judgments:

```
rows            1257
case numbers    1252      -- genuinely different cases
CNRs            1252
content hashes  1255      -- genuinely different texts
distinct dates     1      -- ALL decided 2025-05-28
```

Not a common order — the texts differ. It is one day's citation copied across
that day's output. The pattern repeats:

| key | judgments sharing it | date | that court's judgments with a neutral citation that day |
| --- | ---: | --- | ---: |
| `2025:CGHC:57112` | 845 | 2025-11-23 | 1,020 |
| `2024:HHC:11126` | 483 | 2024-11-12 | 543 |
| `2025:RJ-JP:37072-DB` | 463 | 2025-09-11 | 737 |
| `2025:JHHC:38697` | 399 | 2025-12-23 | 464 |

**A large fraction of a court's daily output receives one citation.** Two keys
break the pattern in a worse way — `2025:AHC:179271-DB` spans **22 different
dates** and `2024:AHC:38820-DB` spans **39** — which cannot be a single day's
batch and suggests a second mechanism.

Whether the defect is in the AWS Open Data source metadata or in our extraction
is **`NOT_MEASURED`**, and it is the first thing to find out, because it decides
whether the repair is re-extraction or a source correction. **We hold no source
document for any judgment** (`storage_key IS NOT NULL` is true for 0 of
18,698,984), so answering it requires re-fetching from AWS.

---

## 5. The decision

### 5.1 CONDITIONAL GO — the two conditions

- **C1 — unique-only, enforced in the write path, not in a caller.** The bulk
  pass materialises a `cited_judgment_id` **only** where the citation key maps to
  exactly one judgment. Everything else is written as an explicit state
  (`AMBIGUOUS`, `TARGET_NOT_HELD`, `REFUSED_NOT_CITATION`) and never as a NULL
  that a later pass might mistake for "not yet tried".
- **C2 — repair the existing ~24,500 ambiguous pins before adding to them.**
  Deterministic and reversible: null the `cited_judgment_id` wherever the key maps
  to more than one judgment, leaving `citation_text` untouched so the reference
  survives as unresolved. Verified by re-running §3 and observing 0.

### 5.2 What the bulk pass must do — the mechanism, pre-registered

1. **Deterministic canonicalisation.** `upper(regexp_replace(text,'[^A-Za-z0-9]','','g'))`
   — identical to `judgment_citation_keys`, not a second implementation.
2. **Materialise candidate keys, then indexed joins.** Never a per-row LATERAL
   over 6.2M references; that is the shape that produced a 16.4-hour query in
   `resolve-cli.ts`.
3. **`count(DISTINCT judgment_id)` per key, computed once**, not `LIMIT 1`. A
   `LIMIT 1` *is* the ambiguous-pin bug.
4. **Refuse despatch stamps at the gate**, using the normalised key and the same
   predicate as `resolver.ts` — see §6.
5. **No bench fold.** Any reference belonging to the retrieval benchmark's
   holdout is excluded and the exclusion is counted, per R7 §10's "no silent
   bench fold".
6. **Idempotent and resumable**, checkpointing to its artifact as it goes, not at
   the end.

### 5.3 What must NOT be claimed afterwards

Even at full yield the graph would be **2.7M resolved of 6.2M real references
(44%)**, and R7 §10's prohibition stands: *do not market 22M reference rows as a
resolved graph*. After this pass the honest sentence is "2.7 million citations
resolved to judgments we hold, of 6.2 million extracted", and never a number
containing "22 million".

---

## 6. Already found and already reported: 61 live false pins

`judgment_citations` holds 827 rows whose `citation_text` is a registry despatch
stamp. **61 carry a `cited_judgment_id`** — 35 distinct stamps, 35 targets, 61
citing documents.

```
citation_text  2011:FEBRUARY:11
resolves to    J.JANET ELGEEVA, Vs THE TAHSILDAR,  (Madras High Court)
because        that judgment's neutral_citation field also holds "2011:FEBRUARY:11"
```

LCC purged this class from `judgment_citation_keys` on 24 Aug (441 rows, bus
1116) and gated `resolver.ts`. **`judgment_citations.cited_judgment_id` is a
third store** and was covered by neither: the gate stops a stamp resolving at
lookup, it does not un-write an edge resolved before the gate existed.

Reported to LCC (bus 1223) with a bounded, reversible correction. **Not applied
unilaterally** — the data is this lane's, the serving path is theirs.

The general lesson is worth keeping: **a citation can be pinned in three places**
— the key index, the resolver's live lookup, and the materialised
`cited_judgment_id` — and a fix to one is not a fix to the others.

---

## 7. States that stay `UNKNOWN`

| question | state |
| --- | --- |
| true (semantic) extraction precision | `NOT_MEASURED` — §1.2 is a structural upper bound |
| whether the shared-neutral defect is ours or the source's | `NOT_MEASURED` — needs a re-fetch; we hold no source document |
| the second mechanism behind the 22-date and 39-date keys | `UNKNOWN` |
| what share of `TARGET_NOT_HELD` is acquirable from an authorised source | see `AUTHORIZED_SOURCE_DELTA_PLAN_V1` |
| the numeric serving-side freshness bound | LCC's, `RESOLVER_CORRECTNESS_FRESHNESS_V3` |
