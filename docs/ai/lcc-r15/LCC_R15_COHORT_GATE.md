# LCC R15 — the fourth resolver gate, and the self-edge

**Lane LCC. 31 August 2026.** Answering NEW2 bus 1622, against `0c554799`.

`CITATION_BULK_APPLY` **remains HOLD**, and nothing in this round moves it. No
`judgment_citations` row was written, deleted or rewritten; no NEW2 population
was touched; no journal hash was altered. NEW2 owns the apply decision after
this, independently.

---

## 1. LCC_ROOT_CAUSE, in one sentence

**`resolveBatch` decided `UNIQUE` from the number of bearers that had LANDED,
using an input — a bare citation string — that carried neither who printed it
nor what the printing document said about the matters it disposed of, so a
common order with one member ingested and a judgment quoting its own citation
were both indistinguishable from a judgment uniquely bearing a citation.**

Which gates failed to observe the condition, precisely:

| gate | file | what it observes | why it cannot see this |
| --- | --- | --- | --- |
| corpus-wide lag | `key-freshness.ts` `mayAssertUnique` | index vs ingest frontier | reasons about rows the index has not READ |
| unwalked window | `key-freshness.ts` `collidingKeysInUnwalkedWindow` | rows above the builder's cursor | the sibling is not above the cursor; it is not in the corpus |
| dirty work | `citation-key-dirty.ts` `dirtyKeysBlockingUnique` | rows changed below the cursor | same |

All three reason about **rows that exist**. On 27 August the second bearer of
`2026:JHHC:24297` did not exist here, so all three were correct and the answer
was still wrong. There is no threshold below zero, which is why the fix is a
different question rather than a wider bound.

The self-edge has a separate root cause in the same sentence: the resolver's
input type. `services/ingest/src/citations-cli.ts:193` and `:378` already refuse
to self-pin (`target && target !== judgment.id ? target : null`) and `schema.ts`
keeps the unresolved row for coverage. Verified, both still true, both left
alone. The resolver took `readonly string[]`, and a string is the same string
whoever wrote it.

---

## 2. Reproduced independently, before any code changed

```
2026:JHHC:24297  66f8a648-…  C.O./9/2022     ingested 2026-08-27 09:30:27Z
2026:JHHC:24297  e092675e-…  MA/134/2018     ingested 2026-08-29 07:48:57Z
                 High Court of Jharkhand · both decided 2026-08-13
```

NEW2's temporal holdout re-derived from scratch, same T0, same instrument:
**226 material false uniques**, matching R14 §7 exactly.

**And the 226 are two different defects, not one.** This is the first thing the
handoff did not say, and it changes what can be fixed here:

```
180  same court, same date        connected matter / common order   LCC's
 43  same court, DIFFERENT dates  a judgment carrying another's NC  NEW2's
  3  different courts             same                              NEW2's
```

All 567 bearer rows across the 226 are `source = 'neutral'`, i.e. the string
sits in `judgments.neutral_citation` on every bearer. `2023:AHC:169934-DB` has
five bearers spanning August 2023 to November 2024 across three different court
rooms; `2023:AHC:152051-DB` has an **Andhra Pradesh** writ petition carrying an
**Allahabad** neutral citation. Those are not cohorts and no resolver gate can
repair them — see §6.

---

## 3. The invariant, and what the gate does NOT do

Preserved exactly:

- Exact citation evidence stays necessary for identity. The gate creates no edge
  and promotes nothing; it only ever WITHHOLDS a claim.
- No party, date, title or embedding similarity anywhere. The inputs are
  case-number tokens the court printed and a conjunction it printed between them.
- One landed bearer is no longer treated as proof that one judgment bears the
  citation.
- The candidate is still returned on every refusal. What is withheld is the word
  "only" — the same shape as the three gates before it.
- The gate is not asked to know unknowable future corpus state. It compares what
  the court SAID it decided together against what we HOLD, and stops firing on
  its own once the siblings land. No threshold, nothing to switch off.

---

## 4. The gate

`services/api/src/citations/cohort.ts`. Pure, no database, no clock.

> The cause title of `2026:JHHC:24297`, printed by the court, lines 2-4:
> `1 M.A. No. 134 of 2018` / `With` / `C.O. No. 09 of 2022`.
> `judgments.case_number` for the row we held names **one** of them. The proof
> was in the corpus on 27 August, twelve days before the sibling landed.

```
declaredMatters > heldCandidates   ->   COHORT_INCOMPLETE
no cause title to read             ->   INSUFFICIENT_TO_PROVE_UNIQUE
otherwise                          ->   UNIQUE_NOT_REFUTED
```

Not `UNIQUE_PROVEN`: nothing here proves world-uniqueness, and `resolver.ts` has
said so since v0. This instrument can only refute.

Two new resolver states, because the remedies differ and collapsing them hides
an acquisition gap inside an indexing metric:

- `UNIQUE_UNCONFIRMED_COHORT` — clears when the sibling is **acquired**.
- `UNIQUE_UNCONFIRMED_STALE_INDEX` — clears when the index **catches up**. Unchanged.
- `SELF_REFERENCE` — not a refusal; the reference is well formed and simply is
  not an edge.

**The unreadable case fails CLOSED.** A judgment whose text we cannot read
(tiered to R2, or absent from the fetch) yields `INSUFFICIENT_TO_PROVE_UNIQUE`
and does not get `UNIQUE`. Measured 31 August: 0 of 1,358 sampled key-bearing
judgments are tiered, so this costs nothing today and stays correct when
`CORPUS_TIERING.md` Tier 3 reaches them.

### What it is worth

`docs/ai/lcc-r15/cohort-gate.json`, scored on NEW2's holdout, which reads no
resolver output and therefore cannot be tuned against.

```
 97 of the 180 reachable false uniques   53.9%    no longer claim UNIQUE
 34 of 2,295 keys that stayed single      1.48%   lose the word "only"
```

Window and connector swept rather than asserted:

| variant | reachable positives | refusals on 2,295 controls |
| --- | ---: | ---: |
| connector @400 | 93/180 | 28 (1.22%) |
| **connector @800** | **97/180** | **34 (1.48%)** |
| connector @1200 | 97/180 | 44 (1.92%) |
| connector @2400 | 99/180 | 104 (4.53%) |
| no connector required @800 | 108/180 | 502 (21.9%) |

Dropping the conjunction requirement buys 11 positives for 468 more refusals.
Widening past 800 buys nothing until 2,400, which buys 2 for 70.

### Observed end to end, in the CLI rather than only in a test

`pnpm --filter @lawmind/api resolver:dryrun -- --sample 20000 --offset 400000`,
31 August 2026, `LOCAL_QUIET`:

```
n 20,000   unique 6,129   ambiguous 266   not-held 10,229
self-ref  3,370      cohort-held  2      stale-held  0
2,971 ms  ->  149 ms per 1,000 references
```

**3,370 of 20,000 references are a judgment printing its own citation**, and
every one of them was `UNIQUE` before this round. As a share of what the old
resolver would have called a confident pin — 6,129 + 3,370 — that is **35.5%,
against NEW2's 39.2%** of the frozen apply candidate, measured on a different
population by a different method. Neither number is derived from the other.

`cohort-held 2` is low because this window is EDGES, not keys, and edges
concentrate on heavily-cited old Supreme Court authorities, which are
single-matter. The 1.48% above is over keys and is the figure to quote.

---

## 5. The self-edge

Verified first, per the instruction, rather than assumed:

| component | behaviour | verdict |
| --- | --- | --- |
| extractor `citations-cli.ts` | `target !== judgment.id ? target : null` | correct, untouched |
| `schema.ts` unresolved retention | keeps the row for coverage | correct, untouched |
| `resolveBatch` | took a bare string, no citing context | **the defect** |
| `resolver-dryrun-cli.ts` | selected `raw` only | **the defect's only caller** |

Fixed on the resolver side, as the instruction requires, by giving the resolver
the fact it was missing: `ResolverReference { raw, citingJudgmentId? }`. A bare
string is still accepted and reports `selfExcluded: false`, which means "no
citing context was supplied" and never "nothing was dropped" — a sweep that
forgot to pass the id sees it in its own output rather than in a million rows a
fortnight later. The dry-run CLI now passes it.

`metricsFor` gained `selfReference`, `uniqueUnconfirmedCohort` and
`uniqueUnconfirmedStaleIndex`. **`uniqueRate` before and after v0.2 is not
comparable**: self-references and one-member cohorts were being counted as
confident pins.

### The first cut of this fix produced a NEW false pin, on FIFTH's own falsifier

Recorded because it is the more useful half of the round. Dropping only the
citing judgment and pinning what remains is the obvious implementation, and it is
wrong. `2026:JHHC:24297` has two bearers now, so asked as the first of them it
left exactly one candidate — the connected sibling — and answered:

```
state UNIQUE   candidates [ e092675e-… ]   selfExcluded true
```

That asserts **"M.A. 134/2018 cites C.O. 9/2022"**. It does not. Both matters
printed the citation of the one common order that disposed of both. A fix for a
false pin that manufactures a subtler false pin is worse than no fix, and this
was found by probing the code rather than by reasoning about it.

**The rule is therefore: the citer claiming the key ends the question, however
many others claim it too.** `candidates` comes back EMPTY on `SELF_REFERENCE`
even where other judgments claim the key, so nothing is there for a careless
consumer to pin. It is a test.

---

## 6. What is NOT fixed, and the data contract that is missing

**83 of the 180 reachable positives are unreachable from any document we hold.**
The court issued SEPARATE orders under one neutral citation, each declaring only
its own matter:

```
2023:KHC-D:12668-DB   MFA 101864/2016   11,679 chars
2023:KHC-D:12668-DB   MFA 101863/2016   54,016 chars   different text entirely
```

No amount of reading the first reveals the second. Nothing in `judgments` or
`judgment_citation_keys` records connected-matter membership, so this residue
cannot be closed in the resolver. **The missing contract, stated exactly:**

> a per-judgment list of the case numbers disposed of by the same order, from
> the source that knows it — the eCourts cause list or the registry's own
> connected-matter field — landed as data rather than re-derived from text.

`SCHEMA_CHANGE_REQUIRED = YES for that residue, and it is not made this round.`
No migration was written. The gate that ships needs no schema change at all.

**46 of the 226 are not cohorts** and belong to ingest (§2): a judgment carrying
another judgment's neutral citation in `judgments.neutral_citation`. Handed to
NEW2; not absorbed into a resolver gate that would then look better than it is.

Known limitation, asserted in a test rather than described in prose:
`judgment_citation_aliases_key` is UNIQUE, so **no alias key has two claimants
and no gate can ever fire on one**. Confirmed today: 4,394 alias keys, 0
multi-claim. NEW2's six deterministic checks pass on all 4,394. That is today's
answer.

---

## 7. How to re-run any of this

```
node scripts/lcc-cohort-measure.mts keys 2026-08-18    # rebuild the 226 from the holdout
node scripts/lcc-cohort-measure.mts score 2026-08-18   # score every variant, rewrite the JSON
node scripts/lcc-cohort-inspect.mts 12                 # read what the gate fires on, verbatim
pnpm --filter @lawmind/api resolver:dryrun -- --sample 20000 --offset 400000
```

`keys` creates a scratch table `lcc_r15_falseunique` and `score` reads it. That
table is the only thing this round wrote to the database, it holds 226 citation
keys and nothing else, and it is dropped when the round ends — `keys` rebuilds it
in about a minute.

---

## 8. Caveats

- **53.9% is not 100%.** The gate closes just over half of the reachable
  positives and none of the unreachable ones. A bulk apply today would still
  write false uniques, which is one of several reasons HOLD stands.
- **The 1.48% is a recall cost, not a wrong answer** — in each case the court did
  print a conjunction and a sibling we do not hold. Hand-reading the fires, the
  commonest one not worth making joins a lower-court or FIR number:
  `CRIMINAL APPEAL No. 123 of 2013 ... connected with S.T. No. 751 of 2009` is
  one proceeding. Separating those needs a list of High Court registry types,
  and a list scored on the documents it was written from is not evidence.
- **The controls are a hash sample of 2,295 keys**, not the population. The
  population refusal count is an extrapolation and is not quoted as a count.
- **The holdout is backwards-looking.** It sees a sibling that landed by
  30 August. A sibling still unlanded is invisible to it, so 226 is a floor.
- **The 180/46 split uses today's corpus shape**, which can change as more
  bearers land.
- **The first window sweep was worthless and is recorded as such** — every
  variant was clamped to the shipped constant, so four rows measured one window.
  `declaredCohort` now takes the bound as an argument and the table above is
  from the corrected run.
- **`RESOLVER_VERSION` moved to `citation-resolver-v0.2`.** Any stored v0.1
  result was produced by a resolver that could say `UNIQUE` in both these cases.
