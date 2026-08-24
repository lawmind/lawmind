# CASE NUMBER SEARCH — CONTRACT V1

**Lane:** LCC · **Task:** LCC-3 (P0) · **Date:** 24 Aug 2026
**Status:** contradiction RESOLVED by measurement. Both prior positions were
partly right and both were reported wrongly.

---

## 1. The contradiction, settled

Reports across rounds disagreed about whether Lawmind can look up a judgment by
its case number. The plan (§2) refuses to accept either side without a live
measurement, so this asked the **product**, not the archive: every probe goes
through the real `POST /search` on the real corpus, using case numbers read out
of `judgments` for judgments whose id we already know. A miss is therefore a
miss on a case that is definitely present.

`services/harness/src/case-number-truth-cli.ts`, n=60, four spellings each:

| spelling | found | rank 1 | p50 | p95 | zero results | multi-court |
| --- | --- | --- | --- | --- | --- | --- |
| `caseno:"CWJC/2231/2006"` — stored form + operator | 96.7% | 78.3% | 917 ms | 1,755 ms | 0% | 21.7% |
| `CWJC/2231/2006` — stored form, typed bare | **1.7%** | 1.7% | 3 ms | 10 ms | **95.0%** | 1.7% |
| `CWJC 2231 of 2006` — how it is written on an order | **10.3%** | 5.2% | 83 ms | 1,755 ms | 37.9% | 34.5% |
| `cnr:"BRHC010328902006"` | **100%** | 96.7% | 2 ms | 11 ms | 0% | 0% |

**So "case number search is green" was measured with the operator and the stored
string — a shape no advocate produces.** And "case number search is broken" was
measured bare — where it returned an empty result set in 3 milliseconds.

The mechanism is mechanical, not statistical. `full_text_tsv` is
`to_tsvector('english', full_text)`, so **the case number is not in the
searchable text at all**, and nothing routed the query to the column that holds
it. The typed form was worse than the bare one: `plainto_tsquery` splits it into
`'cwjc' & '2231' & '2006'` and ANDs those against body text, so a third of them
returned a plausible ranked list of unrelated judgments from other courts.

---

## 2. What the metadata honestly supports

**CNR is a real identifier.** 16 characters, national, uniformly stored, carried
by `judgments_cnr_idx` (btree, partial). 100% found, 96.7% at rank 1, p50 2 ms.

**A case number is a REGISTRY SERIAL and is not an identifier.** Measured:

```
serial 2231 of 2006   →   22 judgments, 13 courts, 17 case types
serial  999 of 2021   →  123 judgments, 20 courts, 88 case types
serial    1 of 2019   →  200+ judgments, 24 courts, 172 case types
```

It is unique within a court, within a case type, within a year. `case_number = X
AND court = Y` returned exactly one row in 6 of 6 spot checks.

**The stored spelling is not normalised across registries.** Patna stores
`CR. MISC./606/2011` with its dots and space; Orissa stores `CRLMC/999/2021`;
Punjab & Haryana `CRM-M/22875/2013`; Kerala `WP(C)/4097/2009`. The same act has
at least five spellings. A canonical registry dictionary would have to be
invented, and `CLAUDE.md` forbids that.

Two real rows carry no type token at all — `/12521/2023`, `/206/2024`. A corpus
defect, recorded, not repaired here.

**There is no equality index on `case_number`** — only
`judgments_case_number_trgm` (GIN trigram), which serves `LIKE`/`ILIKE` and not
`=`.

---

## 3. Supported forms

| input | routing | behaviour |
| --- | --- | --- |
| `cnr:"BRHC010328902006"` | btree equality on `cnr` | one judgment, or none |
| `BRHC010328902006` (bare) | rewritten to `cnr:"…"` | as above |
| `caseno:"CWJC/2231/2006"` | parsed → serial/year anchored + type filter | candidates |
| `CWJC/2231/2006` (bare) | rewritten to `caseno:"…"` | candidates |
| `CWJC 2231 of 2006`, `CWJC 2231/2006`, `CWJC-2231-2006` | same parse | candidates |
| `caseno:"CWJC"` | unchanged substring `ILIKE '%CWJC%'` | a filter, not a lookup |

### Normalisation

The **serial and year carry the match**, anchored as `case_number LIKE
'%/<serial>/<year>'` so `judgments_case_number_trgm` can serve it — measured
256–389 ms against the live corpus, versus 917 ms p50 for the unanchored
`%<value>%` the operator used to compile to.

The **type token filters** the small candidate set that comes back, with
punctuation and spacing stripped from **both** sides (`Cr. Misc.` = `CR. MISC.`
= `CRMISC`). This is a comparison rule; no stored value is ever rewritten.

A bare `1234/2019` with **no type token is refused** — two numbers separated by a
slash is also a date, a fraction and a page range, and treating every one as a
case-number lookup would hijack ordinary searches. A type token is the evidence
that a case number was meant.

### Ambiguity — never a false pin

`caseno:` and `cnr:` joined `cite:` as **identity fields**: a single bare term of
any of the three that matches more than one judgment returns
`kind: 'ambiguous'`, which the route renders as `ambiguous: true` with the
candidate list, never as a winner. This is `docs/CITATION_HARNESS.md`'s rule —
one target or none — applied to the identifier it was always true of.

Measured after the change, same 60 judgments: **31.7% of case-number lookups now
report `ambiguous: true`.** That number is the false-pin risk that was previously
being resolved silently.

CNR reports ambiguous in **5.0%** (3 of 60). That is not a defect: NEW2 (bus
1020) measured that a disposal identifier can name more than one matter, and
showing both is the correct answer.

### Miss state

A parsed case number that matches nothing returns `kind: 'no_match'`, which the
route renders as *"no judgment matches this"* — deliberately distinct from
`not_structured`, so a miss can never be shown as an ordinary empty search.

### Damaged bodies

`body_text_safe` gates **evidence**, not identity. A judgment with a convicted
body is still reachable by case number and by CNR, and its identity fields
(title, court, date, citation) are undamaged. Nothing in this contract weakens
`andBodyTextSafe`, and nothing in `andBodyTextSafe` is applied to these lookups.

### Latency

| path | p50 | p95 |
| --- | --- | --- |
| `cnr:` | 2 ms | 4 ms |
| `caseno:` (any spelling) | ~790–900 ms | ~1.5–1.7 s |

---

## 4. After

Same probe, same 60 judgments, after the change:

| spelling | found | rank 1 | p50 | zero results | ambiguous |
| --- | --- | --- | --- | --- | --- |
| stored + operator | 96.7% | 78.3% | 901 ms | 0% | 31.7% |
| **stored, bare** | **96.7%** (was 1.7%) | 78.3% | 797 ms | **0%** (was 95.0%) | 31.7% |
| **typed `of` form** | **98.3%** (was 10.3%) | 81.0% | 794 ms | **0%** (was 37.9%) | 29.3% |
| `cnr:` | 100% | 96.7% | 2 ms | 0% | 5.0% |

Unit tests: `services/api/src/search/case-number.test.ts`, 10/10 — including the
eight shapes that must be **refused**, which is the half that keeps this from
hijacking ordinary search. `tsc` clean; 58/58 across `structured`,
`exact-lookup-parse`, `qlang/parse`, `qlang/explain`.

---

## 5. What this does NOT claim

- **Rank 1 is 78–81%, not 100%.** The remainder is genuine ambiguity — the same
  serial, type and year in another court — and it is now reported rather than
  resolved by guessing. Narrowing it needs the court, which the query language
  already supports (`caseno:"…" AND court:"…"`) and which no client sends yet.
- **~800 ms is not fast.** The anchored `LIKE` is served by a trigram index,
  which is the wrong index for this shape. A btree on
  `(court, upper(regexp_replace(case_number,'[^A-Za-z0-9]','','g')))` would make
  it an index lookup, but building it is a `DB_SCAN`/`VECTOR_BUILD`-class DDL on
  18.7M rows and the resource gate read `DEFER DB_SCAN` throughout this round.
  Recorded for a quiet window, not attempted.
- **The sample is a convenience sample.** One keyset window at a fixed id
  offset, 60 judgments. UUIDs are random so the window is not court-biased, but
  it is not a probability sample and no confidence interval is claimed.
- **Coverage of `case_number` and `cnr` across the corpus was not measured.**
  Both were non-null in 40 of 40 sampled rows and in all 60 probed, but a
  corpus-wide `count(*)` is a `DB_SCAN` and the gate deferred it. The claim here
  is about behaviour on rows that HAVE these fields.
- **No client consumes any of this yet.** Marketing may claim CNR lookup. It may
  claim case-number lookup **only** alongside the disambiguation, because a
  third of them are ambiguous.
