# RESOLVER FALSE-UNIQUE AUDIT V1 — the rate LCC declined to print, and the mechanism underneath it

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Consumers:** LCC (`citation-resolver-v0.1`,
`resolve-cli.ts`, `citation-keys-cli.ts`), the fifth agent
**Plan:** `LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md` §8 / NEW2-2

LCC measured the resolver on live edges and deliberately did **not** report a
false-unique rate: *"it needs an independently adjudicated sample, and printing a
plausible number for it is exactly what would let a backfill through"*
(CURRENT_PLAN 23 Aug §4). That was the right refusal. This lane owns the
adjudicated sample, so this document is where the number is allowed to come from.

**No corpus mutation. Every query read-only. `--apply` was not run and does not exist.**

---

## 0 · The answer, before the working

| question | answer |
| --- | --- |
| false-unique rate, any severity | **10 / 64 = 15.63%** · 95% CI [8.71, 26.43] |
| **materially unsafe** — the pin names a different authority | **0 / 64 = 0.00%** · 95% CI [0.00, **5.66**] |
| non-citations wrongly resolved | **0 of 40** |
| phantom pins (we hold nothing, resolver pinned anyway) | **0** |
| adverse treatments (`overruled`/`doubted`/`overruled_in_part`) sitting on a collision | **0 of 137** |
| is a backfill approved by this document | **no** |

**Every one of the 10 false uniques, and all 24 recall misses, has the same
cause, and it is not the resolver's rules.** It is the index the rules read.

---

## 1 · FALSE_UNIQUE, defined before it was counted

> A **FALSE UNIQUE** is: the resolver answered `UNIQUE`, and a caller that pinned
> that single candidate would have written a pointer the adjudicated evidence
> contradicts.

Graded in three severities, because collapsing them is how a frightening number
gets discounted and a real one gets ignored:

| severity | what a pin does to the advocate | must be |
| --- | --- | --- |
| **MATERIAL** | opens a **different authority** — different parties, different case number, different bytes | **zero** |
| **STRUCTURAL** | opens one order of a **common order over connected matters**. The proposition can be right and the case name wrong | bounded, disclosed |
| **BENIGN** | opens one of several **duplicate ingestions of the same authority**. Right case, untidy graph | tolerable |

Denominator: resolver-`UNIQUE` answers over **adjudicated** records only. The 82
records the truth set records as `UNKNOWN` are excluded and counted separately —
an unadjudicated record is not evidence of safety.

---

## 2 · The reconciliation — truth set v2.0.0 × `citation-resolver-v0.1`

283 records, of which **201 adjudicated**, 82 `UNKNOWN`/`SOURCE_UNAVAILABLE`.
The resolver was run through its own `resolveBatch`, so the thing measured is the
thing that would ship.

```
resolver states   UNIQUE 133 · AMBIGUOUS 7 · TARGET_NOT_HELD 133 · REFUSED 10
```

| verdict | n |
| --- | ---: |
| CORRECT_TARGET_NOT_HELD | 66 |
| CORRECT_UNIQUE | 54 |
| CORRECT_REJECTED_NON_CITATION | 40 |
| CORRECT_AMBIGUOUS_REFUSAL | 5 |
| RECALL_MISS | 24 |
| FALSE_UNIQUE_BENIGN | 7 |
| FALSE_UNIQUE_STRUCTURAL | 3 |
| **FALSE_UNIQUE_MATERIAL** | **0** |
| FALSE_UNIQUE_PHANTOM | 0 |
| FALSE_RESOLVE_NON_CITATION | 0 |
| CONSERVATIVE_MISS | 2 |

### What the resolver got right, and it is the part that matters most

- **40 of 40 non-citations rejected.** All 30 `PSEUDO_MONTH_STAMP_KEY` records and
  all 10 `PLACEHOLDER_SENTINEL` records produced `REFUSED` or `TARGET_NOT_HELD`.
  A registry despatch stamp never reached a lookup.
- **0 phantom pins.** Every one of the 66 `TARGET_NOT_HELD` records was answered
  `TARGET_NOT_HELD` or `REFUSED`. The resolver never invented a target.
- **AIR: 0 uniques from 15 records**, matching the truth set's finding that 15 of
  16 AIR references name judgments we do not hold. The resolver does not
  hallucinate coverage it lacks.

### By stratum — where the uniques come from and where they break

| stratum | n | resolver UNIQUE | false unique | material |
| --- | ---: | ---: | ---: | ---: |
| SCC | 25 | 14 | 0 | 0 |
| SCR | 24 | 12 | 0 | 0 |
| INSC | 16 | 11 | 0 | 0 |
| OTHER_FORM | 21 | 8 | 0 | 0 |
| NEUTRAL_BENCH_QUALIFIED | 16 | 4 | 1 | 0 |
| **ALLAHABAD_LKO_AUR** | **20** | **4** | **4** | 0 |
| **SEED_UNSAFE_AMBIGUITY** | **3** | **3** | **3** | 0 |
| NEUTRAL_UNQUALIFIED | 4 | 2 | 2 | 0 |
| OCR_DAMAGED_CITING | 8 | 3 | 0 | 0 |
| LOW_TEXT_QUALITY_CITING | 7 | 3 | 0 | 0 |
| AIR | 15 | 0 | 0 | 0 |
| PSEUDO_MONTH_STAMP_KEY | 30 | 0 | 0 | 0 |
| PLACEHOLDER_SENTINEL | 10 | 0 | 0 | 0 |
| PH_SHARED_COMMON_ORDER | 2 | 0 | 0 | 0 |

**Every false unique is a neutral-citation stratum, and 4 of 10 are Allahabad.**
Reporter forms produced 34 uniques and zero false uniques. The failure is not
spread across the corpus; it has an address.

Artifact: `resolver-reconciliation.json` (every record, every verdict).

---

## 3 · The mechanism — the safety of `AMBIGUOUS` rests on an index nobody had measured

The resolver's whole safety argument is that a shared key returns `AMBIGUOUS`
with every candidate and picks no winner. That argument is only as good as the
table it counts candidates in.

**It reads one table: `judgment_citation_keys`.** The truth set finds candidates
through two arms. Across the 34 misgraded records:

| how the adjudicated candidate is reachable | candidates |
| --- | ---: |
| `judgments.neutral_citation` only | **58** |
| `judgment_citation_keys` | 10 |

A group of two that the key table holds **once** is returned `UNIQUE`. That is a
false unique **manufactured by the index, not by the rules** — and the rules
cannot see it happening.

### The corpus-wide census

Over all 155,388 shared-neutral groups (`new2_neutral_dupe_groups`, this lane's
22 Aug census), counting how many members `judgment_citation_keys` can see:

| | groups | share |
| --- | ---: | ---: |
| **collapse to a false UNIQUE** (key table holds exactly 1) | **33,013** | **21.25%** |
| invisible entirely (holds 0) → `TARGET_NOT_HELD` | 77,222 | 49.70% |
| partially visible → `AMBIGUOUS`, understated | 197 | 0.13% |
| fully visible → correct `AMBIGUOUS` | 44,956 | 28.93% |

Split of the 33,013 collapses by the group's **own** evidence:

| | groups |
| --- | ---: |
| byte-identical members — duplicate ingestion (BENIGN) | 14,321 |
| differing bytes, one case number — same matter (STRUCTURAL) | 2,794 |
| **differing bytes AND differing case numbers** | **15,898** |

### 15,898 is an upper bound, and saying otherwise would be the error this lane keeps catching

`hashes > 1 AND case numbers > 1` cannot tell a **connected-matter common order**
from **genuinely different authorities** — connected petitions disposed of by one
order each get their own case number and their own PDF. Only adjudication
separates them, and the truth set adjudicated exactly that shape:

| within `hashes>1 AND case numbers>1` | n |
| --- | ---: |
| CONNECTED_MATTER_COMMON_ORDER | 11 |
| **DIFFERENT_AUTHORITIES** | **1** |

**1 of 12 = 8.33%, 95% CI [1.49, 35.39].** Applied to 15,898 that is a point
estimate of **≈1,300 groups, CI [236, 5,626]** where a collapse would put an
advocate in front of a different case.

**The interval is the finding, not the point.** n = 12. Anyone quoting 1,325 as
a fact is quoting a number whose confidence interval spans a factor of 24.

Court concentration is not in doubt, though:

| court | groups | collapses | of which different-document |
| --- | ---: | ---: | ---: |
| **Allahabad** | 130,577 | **32,853** | 15,878 |
| Karnataka | 4,266 | 99 | 9 |
| Punjab & Haryana | 382 | 28 | 5 |
| Bombay | 767 | 27 | 0 |
| Delhi | 180 | 4 | 4 |
| Madras | 102 | 2 | 2 |

**99.5% of the exposure is one court.**

Artifact: `resolver-collapse-census.json`.

---

## 4 · Rule or backlog? — tested, because the two have opposite fixes

`citation-keys-cli.ts` has **no exclusion**: every judgment with a non-empty
`neutral_citation` gets a row. It walks a `(created_at, id)` cursor, and
`services/ingest/.checkpoints/citation-keys.json` says that cursor last moved
**17 August 2026**, at 16,551,619 rows scanned.

| | |
| --- | ---: |
| judgments carrying a neutral citation (22 Aug census) | 1,370,683 |
| distinct judgments with a `source='neutral'` key row | 1,061,269 |
| **shortfall** | **309,414** |
| judgments **above the cursor** carrying a neutral citation | **309,130** |

**309,130 against 309,414 — the backlog accounts for 99.91% of the gap.** It is a
stale index, not a rule.

*Falsifier run:* the 20,000 newest judgments **below** the cursor were checked for
a missing key row — 293 missing, 1.47%. That window is deliberately the residue
just under the cursor (a builder interrupted mid-page leaves exactly that), so it
is a biased window and is reported as one, not as a corpus rate.

### What re-running the builder actually fixes — a prediction, with its number

For each of the 33,013 collapsed groups, are the members the key table cannot see
the ones above the cursor?

| | groups |
| --- | ---: |
| collapsed today | 33,013 |
| **repaired by re-running the builder** | **33,001 (99.96%)** |
| still collapsed afterwards | 12 |
| **of those, different-document class** | **0** |

**The entire materially-risky collapse population is closed by running an
existing CLI with no code change.** This is a prediction and it is stated with
its number so LCC can falsify it: re-run `citation-keys`, re-run
`.n2c-p2-collapse.mjs`, and `collapses_to_false_unique` must fall to ~12.

---

## 5 · What is already written in the graph

| | |
| --- | ---: |
| citation edges | 22,322,063 |
| pinned (`cited_judgment_id` non-null) | 231,412 |
| carrying a treatment (`relationship <> 'cites'`) | 16,001 |
| pinned **and** treated | 10,754 |

Pins landing in a shared-neutral group:

| | pins | share of pins |
| --- | ---: | ---: |
| into any shared group | 22,469 | 9.71% |
| into a byte-identical group | 14,533 | 6.28% |
| into a same-matter group | 2,994 | 1.29% |
| into a different-document group | 4,942 | 2.14% |

**The historical writer had the same blind spot.** `resolve-cli.ts`'s `KEYED`
CTE reads `judgment_citation_keys` alone and writes when `targets = 1` — the
exact rule the census indicts. These 22,469 pins were therefore written without
the group being visible.

### The number that decides whether this is an emergency

| relationship | pins | into a shared group | into a different-document group |
| --- | ---: | ---: | ---: |
| followed | 9,442 | 76 | 11 |
| distinguished | 1,156 | 5 | 3 |
| **overruled** | 97 | **0** | **0** |
| **doubted** | 21 | **0** | **0** |
| **approved** | 19 | **0** | **0** |
| **overruled_in_part** | 19 | **0** | **0** |

**Not one adverse treatment sits on a collision.** Every row that can reach
`judgments.overruled_status` and drive **LAW MOVED** — 137 of them — is pinned to
a judgment whose neutral citation is not shared. The stale-overruled threshold is
zero and this population does not threaten it.

The exposed set is **14 pins**: 11 `followed` and 3 `distinguished` into
different-document groups. Those are named in `resolver-ingraph-audit.json` and
are a bounded hand-adjudication, not a mass rewrite.

---

## 6 · `citation_concordance_resolutions` — can a model-selected candidate become canonical?

**No, and it never has.** 156 rows, and the columns are built to prevent it:
`validation_status` defaults `'unvalidated'`, `needs_human_review` defaults
`true`, and `candidate_judgment_id` is separate from anything the graph reads.

| | |
| --- | ---: |
| rows | 156 |
| `source` | **`gold_eval` — 156 of 156** |
| model | `deepseek-v4-flash`, all rows |
| `validation_status = 'unvalidated'` | **156 of 156** |
| `decision = 'candidate_selected'` with a candidate id | 91 |

Every row is the harness's gold-evaluation cache. **No production path writes
from it**: the only writers of `cited_judgment_id` are `resolve-cli.ts` (a
deterministic key match, `targets = 1`, no model — its own header says *"the
index never included the concordance"*) and `treatment-link-cli.ts` (*"calls no
model and fetches nothing over the network"*).

### A false alarm I raised and then killed

My first probe asked whether each `candidate_judgment_id` appears **anywhere** as
a pin: **90 of 91**. That reads as contamination and is not. A popular judgment is
cited by many, so co-occurrence proves nothing. Re-asked as the causal question —
is it pinned **on the same citation key the model decided** — the answer is
**30 of 91**, and the writer that made those 30 is deterministic and never reads
this table. They are the model and the key match independently agreeing.

*Same magnitude is not a mechanism.* The first number would have been a
believable, wrong headline.

---

## 7 · Verdict on a backfill, and the safe auto-resolve subset

**No backfill is approved by this document**, and §8's precondition — "only then
can a future backfill be considered" — is not yet met.

**The order of operations, which is not negotiable:**

1. **Re-run `citation-keys` first.** Every number in §2 was measured against a
   6-day-stale index. Re-running it changes the population in **both** directions:
   33,001 collapses become correct `AMBIGUOUS` (safer), and an unknown number of
   currently-invisible references become newly resolvable `UNIQUE` (a **new** risk
   surface that has never been measured).
2. **Re-measure the false-unique rate afterwards.** The 15.63% / 0.00% above does
   not carry across an index rebuild. A rate measured on one population and
   quoted for another is how a backfill gets approved on evidence about something
   else.
3. **Only then** consider a subset.

### The subset that would be defensible, on today's evidence

| may be considered | must be excluded |
| --- | --- |
| **court-assigned forms (INSC, neutral) where primary-source corroboration is available** — 13 of 16 confirmed against the source PDF with an independent extractor | **every Allahabad neutral citation** until the index is current: 32,853 of 33,013 collapses |
| references whose key resolves to one judgment **and** whose key is absent from `new2_neutral_dupe_groups` | **all reporter forms** — SCC/SCR/AIR pins are structurally uncorroborable: a judgment does not print its own reporter citation, so 0 of 10 could be confirmed against paper. That belongs in the resolver's confidence, not a footnote |
| | anything the truth set records `UNKNOWN` — 82 of 283 |

### What this audit cannot see

- **Recall the resolver can never have.** `extractCitations()` has no SCC OnLine
  pattern and no AIR High Court pattern, so those references are never extracted,
  never resolved, and invisible in every denominator including this one.
- **Groups formed since 22 August.** `new2_neutral_dupe_groups` is a snapshot.
- **The 82 unadjudicated records.** Excluded from the rate, not evidence of safety.
- **Reporter-form collisions.** This whole census is the neutral-citation
  mechanism. A reporter citation shared by two judgments is a different
  population and is unmeasured.

---

## 8 · Reproduce

```
npx tsx  --env-file=.env services/api/src/citations/.n2c-p2-reconcile.ts   # §2  grading
node     --env-file=.env services/ingest/.n2c-p2-collapse.mjs             # §3  census
node     --env-file=.env services/ingest/.n2c-p2-keygap.mjs               # §4  rule vs backlog
node     --env-file=.env services/ingest/.n2c-p2-predict.mjs              # §4  the prediction
node     --env-file=.env services/ingest/.n2c-p2-ingraph.mjs              # §5,6 pins + concordance
```

`.n2c-p2-reconcile.ts` **exits non-zero on a single material false unique**, so it
is usable as a gate rather than as a report.

Artifacts: `resolver-reconciliation.json` · `resolver-collapse-census.json` ·
`resolver-keygap.json` · `resolver-backfill-prediction.json` ·
`resolver-ingraph-audit.json`.

All timings **LOCAL_CONTENDED** — 2–13 concurrent PostgreSQL queries throughout,
recorded per step in each artifact.
