# What legal authority do we actually possess?

**Measured against production 11 Aug 2026.** This phase's question, answered:
*exactly what do we hold, what do we not, and what does our own primary-source
corpus tell us we are missing?*

---

## THE LEDGER — five states, and none of them collapses into another

**High Court citation targets (1,791 distinct):**

| state | targets | what it means |
| --- | --- | --- |
| **HELD** | **514** | resolved to a judgment in our corpus. Joinable today. |
| **MAPPED INTERNALLY** | ~~**~155**~~ **294 written, verified** | resolvable from our own text at multiple signals — name + year, surviving adversarial validation. **WRITTEN 12 Aug 2026** — `internal-concordance-cli.ts --apply`, §3c |
| **AMBIGUOUS** | **~222** | a candidate exists but the evidence is thin or contested. Refused, not guessed. |
| **KNOWN BUT UNMAPPED** | **~897** | a valid reporter identifier naming a judgment we may well hold, with no way to join it. **The concordance gap.** |
| **GENUINELY MISSING** | **unknown — and it must stay unknown** | cannot be separated from the row above without a concordance. Claiming a number here would be an invention. |

**The bottom row is the point of this document.** We cannot currently say how
much of our apparent corpus gap is a real corpus gap. What we can say is that
**at least 897 targets are identity problems rather than acquisition problems**,
and that no acquisition decision should be taken before that is settled.

---

## The four states, kept distinct

> **RAW DOCUMENT ≠ AUTHORITY ≠ RESOLVED AUTHORITY ≠ HELD AUTHORITY**

| | |
| --- | --- |
| **raw documents**, High Court | 40,980 |
| ⤷ **candidate authorities** (`decided`) | 2,410 |
| ⤷ **unique** after deduplication | **2,249** |
| **held**, Supreme Court | 38,342 |

"40,980 High Court judgments" remains false. 5.5% of those documents are
candidate authorities, and **97.4% of them are Patna High Court, 95% from 2026**
(`HC_CORPUS_QUALITY.md`).

---

## 1 · Citation resolution — what the HC corpus points at

6,500 citation edges were extracted from the High Court corpus, where there had
been **zero** because the pass had never run.

| status | edges | distinct targets |
| --- | --- | --- |
| **resolved to a HELD authority** | **2,011** (30.9%) | 514 |
| valid identifier, **not resolvable with the current concordance** | 4,485 | 1,274 |
| unrecognised citation shape | 4 | 3 |

**2,011 was 144 an hour earlier.** Nothing was acquired: the resolver had never
run against the newly extracted edges, and 1,867 of them matched aliases already
in `judgment_citation_aliases`. **A 14× gain from data we already held.**

### The label that must not be used

The middle row is **not** "document not held". Whether we hold those judgments is
**UNKNOWN**, and the distinction is the whole point of this phase:

- **4,485 of the 4,489 unresolved edges point at Supreme Court reporters** —
  3,571 SCC, 878 AIR. Only 4 point anywhere else.
- **Every one of our 38,342 Supreme Court judgments carries an S.C.R. citation.
  Zero carry SCC. Zero carry AIR.**

So a High Court citing `(2006) 4 SCC 1` is very likely citing a judgment sitting
in our corpus under `[2006] X S.C.R. Y`. **We cannot join them, and that is a
concordance gap, not a coverage gap.** Recording it as "not held" would convert
an unknown into a false negative — the exact failure this product exists to
prevent, at the level of our own inventory.

---

## 2 · The missing-authority map, ranked

Ranked by citing documents — the only ranking currently defensible, since we
cannot resolve identity for these targets.

| citation | reporter | year | citing documents |
| --- | --- | --- | --- |
| (2025) 4 SCC 78 | SCC | 2025 | 89 |
| (2013) 1 SCC 353 | SCC | 2013 | 75 |
| (2006) 4 SCC 1 | SCC | 2006 | 66 |
| (2018) 6 SCC 21 | SCC | 2018 | 62 |
| (1998) 7 SCC 123 | SCC | 1998 | 57 |
| (1992) 4 SCC 99 · (1994) 2 SCC 401 · (2000) 7 SCC 521 … | SCC | various | 56 each |

**Corpus-wide the same shape holds: 122,851 unresolved edges across 57,947
distinct targets.** The High Court slice is 3.7% of it.

**Strategic value cannot yet be ranked by treatment or precedential weight**,
because those require resolving the target first. Citing-document frequency is
what is honestly available, and it is recorded as such.

---

## 3 · The concordance is exhausted from our own corpus

`concordance-cli` mines pairings courts print themselves —
`AIR 1980 SC 791 : [1980] 2 SCR 1067` — and turns them into aliases. Re-run over
the corpus **including the 40,980 newly ingested High Court documents**:

    1,438 pairings corroborated by 2+ citing judgments
    3 of 1,404 SCR keys exist in our corpus
    ALIASES READY: 3

**Three.** High Court bail orders cite SCC and AIR but rarely print the S.C.R.
equivalent beside them, so the trick that worked on Supreme Court text does not
work here. Applied anyway; the yield is what it is.

**This is the finding that decides the next move**: the remaining 1,274 targets
cannot be resolved from text we already hold. They need either an external
SCC/AIR↔SCR concordance, or acceptance that they stay unresolved.

---

## 3a · INTERNAL-CONCORDANCE FEASIBILITY STUDY

**Run before recommending any external source.** Question: how much of the
1,277-target gap can be closed using only evidence already inside our corpus?

### The signal exists and is strong

High Court judgments print the case name beside the citation, in a regular form
read off real windows:

    L. Hirday Narain v. ITO [(1970) 2 SCC 355: AIR 1971 SC 33]
    Naushey Ali vs. State of U.P., reported in, (2025) 4 SCC 78
    Commr. of Police, Bombay v. Gordhandas Bhanji, 1951 SCC 1088 : AIR 1952 SC 16

We hold `case_title`, `judgment_date`, `petitioner`/`respondent` for all 38,342
Supreme Court judgments. **Party name + year is a joinable pair.** Two of twelve
sampled windows even print SCC and AIR together — a concordance the court itself
asserted.

### Method, and the outcomes

Name extracted from the text window preceding each citation, tokenised with legal
stopwords removed (`state`, `union`, `india`, `ors`, `anr`, …), matched by
Jaccard ≥ 0.34 against Supreme Court titles **restricted to the citation year and
the year before** (reporting lag). A near-tie (runner-up > 85% of the winner)
is refused as ambiguous.

| outcome | targets | share |
| --- | --- | --- |
| `RESOLVED_WITH_MULTIPLE_SIGNALS` (name + year) | 357 | 28.0% |
| `AMBIGUOUS` (near-tie refused) | 20 | 1.6% |
| `UNRESOLVED_NO_NAME` (no parseable name) | 292 | 22.9% |
| `UNRESOLVED_NO_CANDIDATE` (no title match in year) | 608 | 47.6% |
| `MALFORMED` | 0 | 0% |

### Adversarial validation — and it is what decides this

**The 28% does not survive.**

**One judgment claimed by two or more citations — split by reporter, because the
two cases are opposite:**

| | |
| --- | --- |
| **cross-reporter** (`(1984) 4 SCC 635` + `AIR 1984 SC 1805` → one judgment) | **18 — legitimate.** This is exactly the SCC↔AIR concordance we want |
| **same-reporter** (two SCC citations → one judgment) | **17 — genuine errors** |

The same-reporter collisions are real failures, and reading them shows why:

    (2020) 3 SCC 216 || (2020) 7 SCC 1      → Arjun Panditrao Khotkar
      the referral order and the main judgment are different documents
    (2024) 12 SCC 660 || 684 || 691 || AIR 2024 SC 4760   → one judgment
    (1987) 2 SCC 555 || (1988) 4 SCC 534

**Thin evidence: 185 of 357 = 51.8%** rest on ≤3 distinguishing tokens or a
Jaccard below 0.45. Hand-reading fifteen accepted mappings found the failure mode
directly: *"Hindustan Times v State of U.P."* was extracted for two different
citations and matched to two different judgments — repeat litigants defeat a
name+year join, and Indian public-law litigation is full of them.

### The result

> **Internal concordance can safely resolve ~155 of 1,277 targets — 12.1%.**

Not the majority. And the unsafe 56% is not merely unusable — writing it to
`cited_judgment_id` would point advocates at the wrong case, which is the
failure this product exists to prevent.

---

## 3b · THE DECISION TABLE

| | |
| --- | --- |
| **A · Can internal data resolve the majority safely?** | **No.** 28% match, 12.1% survive adversarial validation. |
| **B · What remains genuinely unresolved?** | **~87.9%** of the 1,277 HC targets by internal means. Corpus-wide the same method would leave the bulk of 57,947 targets unresolved. |
| **C · What would an external concordance unlock?** | Up to **1,122** remaining HC targets and a large share of **57,947** corpus-wide — converting *unknown* into *held* or *genuinely missing*. Exact yield unmeasurable without the source. |
| **D · False-positive risk without one?** | **High and disqualifying.** 51.8% of accepted mappings rest on thin evidence; 17 same-reporter collisions are demonstrable errors. A wrong `cited_judgment_id` points an advocate at the wrong case. |
| **E · What functionality is blocked?** | Citator completeness (treatment/overruled propagation stops at unresolved edges) · "cases citing this authority" · authority ranking by citation count · any claim about High Court precedential coverage. **Not blocked:** search, verification, the harness — those key on judgments we hold. |
| **F · Cheapest/safest external solution?** | Unknown, and **deliberately not researched.** Identifying and evaluating sources is the step after the founder decides one is wanted. |

**RECOMMENDATION: implement the safe 12.1% and stop.** 155 mappings at multiple
signals is real, cheap and reversible. The other 87.9% is a founder decision
about an external source — a licensing question, not an engineering one.

**Nothing has been written to `cited_judgment_id` from this study.**

---

## 3c · IMPLEMENTED AND WRITTEN — 12 Aug 2026

The recommendation above was carried out: `services/ingest/src/
internal-concordance.ts` makes §3a's discipline mechanical rather than a
one-off script (asymmetric year window — the citation year or the year
before, never after, since a model is not reading along to catch a forward
reference; the same 0.34/0.45 Jaccard thresholds; the 0.85 near-tie
ambiguity refusal; and `detectCrossTargetCollisions`, which makes the
17-vs-18 same-judgment/different-citation finding mechanical — every
judgment claimed by more than one citation key in a run is withheld, since
the deterministic signal cannot tell the 17 real collisions from the 18
legitimate cross-reporter pairs, a 51/49 split). No model call anywhere in
the pipeline.

**Numbers moved, and moved further than this document's own estimate,
because the population itself had grown.** This document's "1,277 HC
targets" was measured 11 Aug against the pool as it stood then. By 12 Aug
the qualifying pool (unresolved SCC/AIR citation keys, ≥2 sightings, corpus-
wide — not HC-only) was **4,253**, both because citation extraction was
independently widened the same day (`docs/ai/CITATION_CONCORDANCE_EVALUATION.md`
§2 — an S.C.R. year pattern and a parallel-citation blind spot, found and
fixed by a concurrent session) and because this module is not HC-scoped the
way §3a's manual study was.

**Two runs, and the second is the one to trust.** A first sweep (2,000-target
`INTERNAL_CONCORDANCE_LIMIT` default, then re-run at 5,000 once the true
population was measured) found 602 safe candidates using the *pre-fix*
`nameBeforeCitation`/`yearFromCitationText`. Re-run after the S.C.R./parallel-
citation fixes landed, still 602 — same count, different composition,
confirming the fixes widened *reach* without changing the *safety bar*.

**Hand-checked before writing anything — 14 samples, spanning corroboration 2
to 22 and Jaccard 0.455 to 1.000, drawn deliberately from the riskiest
(lowest-Jaccard, minimum-corroboration) end, not the easiest.** Every one
verified correct against the actual `judgments` row, including two that read
as wrong on first glance and were not: *"State of Haryana"* in a citing
document's shorthand for the full respondent *"Financial Commissioner and
Secretary to Govt. Haryana"*, and a `(2008) 2 SCC 108` match that correctly
ignored ten other same-named *"Chanda Devi"* judgments — all recent, unrelated
Patna High Court matters — because candidate generation is scoped to the
Supreme Court pool within the citation's own year window.

**WRITTEN: 294 aliases, not 602 — verified by direct query
(`judgment_citation_aliases`: 4,100 → 4,394), not read off the CLI's own
summary.** The gap between the dry-run count and the write count is real and
recorded rather than smoothed over: a concurrent session was actively
modifying the High Court citation pipeline (`hc-citations-cli.ts`,
`hc-load-cli.ts`) in the same working tree between the two runs, which is the
more likely explanation than a bug in this module — collision detection and
the safety thresholds are unchanged between dry and apply, and no fabrication
class of error is possible in an `INSERT ... ON CONFLICT (alias_key) DO
NOTHING`. The next full re-run's count is the one that will settle it.

**Then resolved into both edge tables — `resolve-cli.ts --apply` and its new
`--external` flag (nothing had ever re-run `external_citations` against a
grown alias table before this session; see `docs/CURRENT_PLAN.md`),
independently verified against production:**

| | before | after |
| --- | --- | --- |
| `judgment_citations` (SC-internal edges) | 99,887 / 222,738 = 44.8% | **101,968 / 222,738 = 45.8%** |
| `external_citations` (HC sightings) | 15,102 / 51,272 = 29.5% | **18,889 / 51,272 = 36.8%** |

**+2,081 and +3,787 edges resolved respectively, from 294 new aliases** — each
alias corroborated by, on average, dozens of independent sightings, which is
why a small alias count produces a disproportionately larger resolution
count. `services/ingest` typecheck clean, 454/454 tests passing (one
pre-existing, unrelated test needs a local Postgres this environment does not
have and was excluded, not silenced).

---

## 4 · What must not be concluded

- **An unresolved citation is not a nonexistent authority.** 4,485 of them
  almost certainly name judgments we hold under a different reporter.
- **Citation extraction is not proof an authority exists in our corpus.** It is
  proof a court referred to something.
- **The 2,249 candidates are not established as genuine reasoned judgments.**
  They are documents whose `disposal_nature` and length are consistent with a
  merits decision, corroborated by citing at 26.2% against bail's 1.9%. That is
  evidence, not proof.
- **This is not broad High Court coverage.** It is Patna, 2026.

---

## 5 · Next, in order

1. **Duplicate collapse at retrieval time** — 1,476 HC rows sit in
   `document_duplicate_members`, retrieval reads that table nowhere, and the
   same document can occupy several of five result slots. Not started.
2. **Decide the SCC/AIR concordance question.** Resolving 1,274 targets — and
   57,947 corpus-wide — is worth more than any ranking change, because it
   converts *unknown* into *held* or *genuinely missing*. An external
   concordance source is a licensing question, not an engineering one.
3. **Only then the HC indexing experiment**, scoped to ~2,249 unique candidates
   rather than 40,980 rows. **No embedding has been run and RRF is unchanged.**
