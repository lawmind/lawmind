# NEW2 R14 — the citation falsifier, and STATUTE_FRESHNESS_V1

**Lane NEW2. 31 August 2026.** Nothing was applied. `CITATION_BULK_APPLY`
remains **HOLD**, and this round earns that word rather than inheriting it.

FIFTH held the third resolver gate (bus 1583/1584) on two grounds the earlier
evidence could not answer — the alias path was never adjudicated *as a path*,
and cross-court collisions were outside the in-sample replay. Both are answered
below. The gate still fails, and it fails on something neither of us was
looking at.

---

## 1. The root cause, in one sentence

**A neutral citation is not a unique key in this corpus** — the registry stamps
one on every connected matter disposed of by a common order, and our own ingest
additionally lands the same judgment twice from two sources — **so the
resolver's `UNIQUE` reports how much of the corpus has landed, not how many
judgments bear the citation, and a pin made before the second bearer lands is a
false unique that all three freshness gates are structurally unable to see.**

The gates in `services/api/src/citations/resolver.ts` reason about rows above
the builder's cursor, rows below it, and the corpus-wide lag. Every one of them
reasons about rows that **exist**. The second bearer of `2026:JHHC:24297` did
not exist in our corpus on 27 August and did on 29 August, and FIFTH's two
falsifiers are exactly that:

```
2026:JHHC:24297   MR SANTOSH KUMAR Vs UMA DEVI                    ingested 27 Aug
2026:JHHC:24297   DIVISIONAL MANAGER NATIONAL INSURANCE Vs UMA DEVI  ingested 29 Aug
```

Same court, same date, same citation, two different case titles — cross-appeals
from one award, decided by one order. Nothing was wrong with the resolver on
27 August. The corpus was.

---

## 2. The new immutable apply candidate

Frozen, hashed, unapplied. The earlier evidence was not relabelled and no
historical receipt was reconstructed.

```
APPLY_POPULATION_ID     NEW2-R14-APPLY-4a1a8f4838d8804b
APPLY_POPULATION_HASH   4a1a8f4838d8804bd356ca5dce396edf7a892873ce7778afff0e80c7213a4371
APPLY_POPULATION_COUNT  2,559,529
FRONTIER_BINDING        snapshotAt 2026-08-30 21:32:48.762506+00
                        keyFreshness CURRENT · judgments 18,759,022 · keys 1,431,403
                        max judgment created_at 2026-08-30 14:05:19.255799+00
                        max key      created_at 2026-08-30 14:40:51.259401+00
RESOLVER_VERSION        citation-resolver-v0.1
```

`docs/ai/new2-r14/citation-apply-candidate.json`. Decided 6,051,882 edges:
`TARGET_NOT_HELD` 3,137,306 · `UNIQUE` 2,559,529 · `AMBIGUOUS` 354,220 ·
`REFUSED` 827.

Any write authorised against this candidate must re-read the journal, verify
the hash, and refuse if the frontier has moved. **A newer population is a
different population and needs its own evidence** — that is the whole reason
the old signature decayed while it was being checked.

---

## 3. The falsifier is prediction-blind, and can prove it

`docs/ai/new2-r14/blind-package.json`, sha256
`0383988c26d87df06f1b6a3c4b895c8e5bdbd7f76f3f0cd54f4fd924dd46b736`.

3,600 edges in nine strata, selected in a pass that **never called the
resolver** — `resolverConsulted: false` — from `judgment_citation_keys`, the
court and title columns of `judgments`, and the pure `canonicalKeyFor` gate.
The file was written and hashed **before** anything was resolved, and the
adjudicator re-verifies that hash before scoring a single row.

| stratum | why it exists | population edges | sampled |
|---|---|---:|---:|
| `A_ALIAS_PATH` | the path FIFTH named | 1,548,529 | 400 |
| `B_REPORTER_PATH` | a reporter names a publisher, not a court | 17,399 | 400 |
| `C_NEUTRAL_SINGLE_CLAIM` | the ordinary case, the bulk of any apply | 864,336 | 400 |
| `D_MULTI_SAME_CASE` | the same judgment ingested twice | 244,180 | 400 |
| `E_MULTI_DISTINCT_CASE` | **one citation naming two different cases** | 106,323 | 400 |
| `F_CROSS_COURT_COLLISION` | the class the earlier replay excluded | 3,717 | 400 |
| `G_LATE_LEARNED_KEY` | the target that had not landed at T0 | 129,265 | 400 |
| `H_TARGET_NOT_HELD` | difficult negative: we do not hold it | 3,137,306 | 400 |
| `I_REFUSED_FORM` | difficult negative: refused before lookup | 827 | 400 |

2,000 adversarial negatives, 1,600 adversarial positives.

---

## 4. Four counts, reported separately, with the untestable ones visible

```
FALSE_PIN_RESULT     0 of 1,600 positives
FALSE_UNIQUE_RESULT  0 of 1,600 positives
AMBIGUOUS_RESULT     1,200 — correct refusals, not errors
UNTESTABLE_RESULT    0 rows had no discriminator at all
```

Nothing untestable is hidden inside a percentage. Where a single check could not
fire it is named: the court token was untestable on 2,646 of 3,600 rows, and the
title window carried no party name at all on 171.

**And a fifth count that is neither of the four, and is the finding:**

```
SELF_EDGE            1,146 of 1,600 positives (71.6%)
```

A judgment prints its own neutral citation in its own header. The extractor
makes a citation edge of it. The resolver pins it — **correctly** — back to the
judgment it came from. The identity is right; the edge should never have
existed. Scoring this as a false pin would have sent the next fix into the
resolver, which is the one component that behaved. My first adjudication pass
did exactly that and reported a 99.75% false-pin rate on ordinary citations;
the number was mine, not the resolver's.

Counted over the **whole** frozen candidate rather than estimated from the
sample:

```
1,003,733 of 2,559,529  =  39.2% of the apply candidate is a judgment
                            pointing at itself
```

Applying the candidate today writes a million self-loops into the citation
graph. They corrupt no case identity, and they wreck every "how many judgments
cite X" count in the product — including the citator the retention moat is
built on. This belongs to the **extractor**, not the resolver.

---

## 5. The alias path — FIFTH's first objection, answered by enumeration

Not sampled. **All 4,394 alias rows were adjudicated**, because 4,394 is small
enough that sampling would be a choice to know less.

| check | failures |
|---|---:|
| alias names the Supreme Court, target sits elsewhere | 0 |
| reporter year precedes the decision year | 0 |
| reporter lag beyond the corroborated range | 0 |
| `corroborations` below the schema's floor of 2 | 0 |
| **the stored `evidence` span does not contain the alias it justifies** | 0 |
| alias key also claimed by another judgment | 0 |
| **total rows with any failure** | **0 of 4,394** |

The fifth line is the provenance check FIFTH asked for by name. Every alias in
the corpus is contained in the evidence span that justified it.

The 400 blind-sampled alias edges: court `AGREE` 400/400, year `AGREE` 400/400,
identity basis `DERIVED_ALIAS` 400/400 — this is the one path where the year
and court are genuine independent discriminators rather than a transcription of
the target's own published form, and it passes on both.

**But the alias path is the highest-leverage surface in the system, and that is
new** (`docs/ai/new2-r14/alias-concentration.json`):

```
4,394 alias rows carry            1,548,529 edges   (53.1% of every pinnable edge)
mean edges per alias                    352.4
ONE alias — (2012) 10 SCC 303,
Gian Singh v State of Punjab —       66,171 edges
top 10 aliases carry                    19.6% of all alias-path edges
```

`judgment_citation_aliases_key` is a UNIQUE index, so **an alias can never
resolve AMBIGUOUS**. A wrong alias is a confident wrong pin that no gate in the
resolver is able to fire on, multiplied by its edge count. Today every one of
them checks out. That is not a reason to stop checking; it is the reason the
check has to be cheap enough to run every round.

---

## 6. Cross-court collisions — FIFTH's second objection

400 sampled from the 3,717 edges whose key is claimed by judgments in more than
one court. **The resolver refused all 400** — `AMBIGUOUS`, which is the correct
answer. It never picks a winner between two courts.

Corpus-wide there are 12 such keys. All twelve are neutral-source, and all
twelve name distinct cases.

---

## 7. The temporal holdout — the instrument that decides the gate

The one falsifier here that can see a false unique caused by an authority that
had not landed, because it lets the corpus answer 12 days later. It reads no
resolver output whatsoever.

Keys single-claim in the index at T0 = 18 August, re-examined on 30 August:

```
keys single-claim at T0                 971,879
of those, multi-claim now                33,344   (3.43%)
  ├─ same case, ingested twice           33,118   recall loss, no wrong authority
  └─ DIFFERENT cases sharing one key        226   FALSE UNIQUE  (0.0233%)
        of which cross-court                  3
```

**226 keys would have been pinned to the wrong authority** by a bulk apply run
on 18 August. 116 of them point at genuinely different documents; 110 share a
document but carry different parties, so an advocate reads the right text under
the wrong case name. Both are wrong under `CITATION_HARNESS.md`.

Two secondary holdouts were run and **must not be quoted as safety**:
T0 = 25 Aug gives 434 of 1,052,217, T0 = 28 Aug gives 7 of 1,065,317. Almost no
corpus landed in those windows. They measure a quiet ingest fleet, not resolver
precision.

---

## 8. The gate

`docs/CITATION_HARNESS.md` sets the threshold at zero, and zero is not a
rounding target. The gate is evaluated against the **population** instruments as
well as the sample, because 3,600 rows cannot clear a 2.5M-row write on their
own: an in-sample zero is consistent with thousands of false pins.

```
FALSE_PIN_GATE       FAIL
CITATION_BULK_APPLY  HOLD

  sample false pin                    0      pass
  sample false unique                 0      pass
  population material false unique  226      FAIL
  population self-edges       1,003,733      FAIL
```

**HOLD is unchanged, and the reason for it has changed.** FIFTH held on missing
evidence. It is now held on measured defects, both of which are fixable and
neither of which is in the resolver.

### What would let it pass, in the order I would take it

1. **Drop self-edges from the candidate.** A pin whose target is the citing
   judgment is never a citation. This is a one-predicate change in the
   extractor and a filter on the candidate, and it removes 39.2% of the write.
   **NEW2's, and the next thing I do.**
2. **Refuse a pin on any key whose court+date cohort holds a sibling.** The 226
   are connected matters: same court, same date, one order, different parties.
   That cohort is queryable before the pin, not after — the resolver would
   answer `AMBIGUOUS` where today it answers `UNIQUE` on partial ingest. This
   crosses `services/api/**` and is **handed to LCC**, not self-served.
3. **Re-freeze and re-run this file.** Both instruments are scripted; the round
   is repeatable at `--stage package|freeze|adjudicate|report`.

Nothing here tunes around a falsifier. Neither change makes a wrong pin right;
both make the resolver decline where it should never have claimed.

---

## 9. Caveats — what is unverified, assumed, or weak

- **The sample is a sample.** An in-sample zero on 3,600 rows bounds the
  false-pin rate at roughly 1e-3, not at zero. The population instruments are
  what decide the gate, and they are what failed it.
- **The corroboration screen has low precision and I will not dress it up.** It
  flagged 41 pins where the citing text names parties and none is the target.
  Six were hand-read: five are explained by tokenisation (`Brajendra singh` in
  the text against `BRAJENDRASINGH` in the title) or by the citation sitting in
  a *Cases referred* list; **one is unresolved** — `(2010) 7 SCC 626`, cited as
  *Union of India v. National Confederation for Blind*, pinned to *Govt. of
  India v. Ravi Prakash*. That one needs a human with the reports, and it is
  named here rather than averaged away. Party similarity was used only to
  falsify or corroborate; it created no edge anywhere in this round.
- **My first adjudication pass was wrong and is recorded as wrong.** It scored
  self-edges as false pins and read the absence of a party name in a footnote as
  a contradiction, producing a 99.75% false-pin rate on ordinary citations and
  174 "contradicted" pins. Both were my classifier. The corrected rules are in
  `scripts/n2-citation-falsifier-r14.mts` with the reasoning attached.
- **The court-code map is derived from our own corpus**, so a code we hold from
  only one court reads unanimous whether or not it is. It is unusable on 2,646
  of 3,600 rows and says so rather than guessing.
- **The `E_MULTI_DISTINCT_CASE` stratum only contains collisions we can already
  see.** By construction it cannot contain the dangerous case — the sibling that
  has not landed. Only the holdout reaches that, and only backwards.
- **1,003,733 self-edges is exact** (every candidate row checked against its own
  citing judgment), not sampled.

---

## 10. A second frozen candidate, with the self-edges removed

Not a replacement. Two files, because a candidate that quietly replaced the one
the evidence was written against is the exact failure this round exists to
prevent.

```
APPLY_POPULATION_ID     NEW2-R14-APPLY-6a24a6fec752d0fe
APPLY_POPULATION_HASH   6a24a6fec752d0fe84fc2ba60a996a58a006543a4c98e63e7d6507a2acd785c1
APPLY_POPULATION_COUNT  1,555,796
SELF_EDGES_EXCLUDED     1,003,733
snapshotAt              2026-08-30 21:48:45.626959+00
```

The exclusion count agrees exactly with the independently computed figure in
§4, by a different method on a different run. Both journals were re-hashed from
disk after the fact and match their metadata.

**v2 still fails the gate.** It removes the self-edge defect and leaves the
holdout's 226 untouched, because the two failures are unrelated. It is here so
that the next round starts from a candidate whose only known defect is the one
that needs LCC.

---

## 11. STATUTE_FRESHNESS_V1

`docs/ai/new2-r14/statute-freshness-v1.json`. Measured, not redesigned: no
ingestion path was built, no statute row was written, no text changed.

Source: **India Code**, the Government of India's own repository, and nothing
else. It has migrated hosts — `www.indiacode.nic.in/handle/…` now 404s and
`indiacode.gov.in` serves a DSpace 7 REST API. **Half our stored Act URLs point
at the dead host.**

49 Acts across six strata — the six named Acts taken whole rather than sampled,
plus heavily judgment-referenced, amended, recent central, repeal-titled and
pre-independence.

```
STATUTE_SAMPLE          49 Acts · 5 dimensions · 245 dimension checks
EXACT_MATCH             46
STALE                    0
UNKNOWN                 74
SOURCE_UNAVAILABLE     125
MATERIAL_TEMPORAL_ERRORS 0
```

Per Act, worst-dimension: `UNKNOWN` 24, `SOURCE_UNAVAILABLE` 25, and **zero
Acts fully matched** — because no Act clears all five dimensions.

| dimension | exact | stale | unknown | unavailable |
|---|---:|---:|---:|---:|
| act identity (number, year) | 23 | 0 | 1 | 25 |
| commencement (enactment date) | 23 | 0 | 1 | 25 |
| current/repealed state | 0 | 0 | 24 | 25 |
| latest represented amendment | 0 | 0 | 24 | 25 |
| section existence | 0 | 0 | 24 | 25 |

**Nothing we hold was shown to be stale. Almost nothing was shown to be fresh
either.** 46 of 245 checks could be evaluated at all. That is the honest answer
and it is a statement about the source and our stored URLs, not a clean bill.

### The three reasons a check could not fire

1. **25 of 49 Acts are unreachable** — a dead `indiacode.nic.in` handle and no
   search candidate agreeing on act number *and* year *and* being an ACT item.
   That is one cluster, and it is escalated as a cluster: no statute row was
   updated on the strength of this sample.
2. **The source publishes no commencement field and no amendment history on the
   item.** Our `enforcement_date` — including the 2024-07-01 on BNS, BNSS and
   BSA — is therefore *unchecked by this measurement, not confirmed by it*, and
   `latestRepresentedAmendment` is UNKNOWN for every Act rather than matched.
3. **`statutes` has no repeal column**, so `currentRepealedState` is UNKNOWN on
   our side for the entire corpus. That is a schema gap, not 24 per-Act gaps.

### Two things worth the founder's attention, neither of which is a conclusion

- **India Code's own `dc.identifier.repealed` flag reads `false` for the Indian
  Penal Code, the Code of Criminal Procedure and the Indian Evidence Act.** It
  is recorded verbatim and interpreted nowhere. **No applicability conclusion is
  drawn here** — not that the IPC applies, not that it does not, and no
  automatic IPC→BNS inference anywhere in this file. `DOMAIN_TRUTH.md` is the
  authority on the 2024 transition and this measurement does not touch it.
- **Ten of the 24 reachable Acts were ingested from a STATE repository copy on
  India Code, not the central item** — IPC and the Evidence Act from Chandigarh,
  CrPC from Chhattisgarh, BNS from Maharashtra, BNSS from Uttar Pradesh. The
  text of a bare Act reproduced in a State repository is the same Act; the
  provenance is nonetheless not what our `ministry` column claims, and it is
  recorded as a cluster.

`statute_mappings` coverage is reported and nothing more: crpc→bnss 95,
evidence→bsa 117, ipc→bns 14. A mapping row records that the source pairs two
provisions. It states nothing about which applies to any offence on any date.

### A correction I made against myself mid-run

The first pass accepted a search match on act number and year alone. Those are
copied onto a State's subordinate rules and onto individual section items, so it
matched *"…the State of Maharashtra eSakshya Management Rules, 2025"* as BNSS and
a bare *"Short title, application and commencement."* as BSA, and reported both
as `EXACT_MATCH` on identity. The matcher now also requires the item to be an
ACT and the title to carry the Act's distinctive words. **BSA is consequently
`SOURCE_UNAVAILABLE` rather than matched**, which is the true answer.

---

## 12. Continuous ingestion — healthy, and the distinction kept

```
judgments landed   27 Aug 52,305 · 28 Aug 1 · 29 Aug 7,186 · 30 Aug 562
last 6 days        60,017 High Court · 37 Supreme Court
live workers       coarse-walk telemetry · doc-vector-embed (NEW1)  — both running
DB                 quiet, no long-running statement, nothing blocked
```

The three freshness scopes stay separate and **this round did not re-measure
them**. The standing decomposition is `docs/ai/new2-r83/source-freshness-
decomposition.json`, taken 27 August, and it carries two adapters —
`aws_open_data_hc` and `aws_open_data_sc`. **SCI live is in neither.** No
HC-only figure is reported here as all-source parity, and the AWS SC accounting
artefacts are not called backlog.

One thing the holdout makes newly important: **the last five days of near-zero
false-unique rate are a consequence of the ingest fleet being quiet, not of the
resolver being right.** When ingestion resumes at volume the 18 August rate is
the one to expect, not the 28 August one.

---

## 13. What is handed to LCC, not self-served

**The connected-matter cohort refusal.** The 226 material false uniques are all
the same shape: same court, same date, one order, different parties. That cohort
is queryable *before* the pin, not after — a key whose single held claimant has
a same-court same-date sibling bearing a different title should resolve
`AMBIGUOUS`, not `UNIQUE`, because on partial ingest the sibling may simply not
have landed. This lives in `services/api/src/citations/resolver.ts`, which is
LCC's. It is a fourth gate beside the three that already exist, and unlike them
it reasons about the shape of the corpus rather than about rows that exist.

**A repeal state on `statutes`.** There is nowhere to record that an Act has
been repealed, so the freshness measurement can only ever answer UNKNOWN on that
dimension. That is a schema change and therefore LCC's; I did not migrate.

Both are sent on the bus with the measurements attached.

---

## 14. Reproducing this

```
tsx scripts/n2-citation-falsifier-r14.mts --stage package
tsx scripts/n2-citation-falsifier-r14.mts --stage freeze [--exclude-self-edges]
tsx scripts/n2-citation-falsifier-r14.mts --stage adjudicate
tsx scripts/n2-citation-falsifier-r14.mts --stage report
tsx scripts/n2-statute-freshness-r14.mts --cap 10
```

Artifacts, all with hashes recomputed from disk after writing:

| file | sha256 / count |
|---|---|
| `blind-package.jsonl` | `0383988c…6b736` · 3,600 rows |
| `apply-candidate.jsonl` (v1) | `4a1a8f48…a4371` · 2,559,529 |
| `apply-candidate-v2-no-self.jsonl` | `6a24a6fe…785c1` · 1,555,796 |
| `citation-falsifier-r14.json` | the four counts, the holdout, the census |
| `alias-concentration.json` | 4,394 aliases, 1,548,529 edges |
| `statute-freshness-v1.json` | 49 Acts, 245 checks |

The two large journals stay in `.tmp-new2/r14/` and are bound by hash from the
committed metadata; the package and the adjudications are committed in full.
