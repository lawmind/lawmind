# LCC R15-F1 — the cohort gate read capital letters, not matter numbers

**Round:** LCC R15-F1, 31 August 2026
**Driver:** NEW2 bus 1637 / `docs/ai/new2-r15/`, commit `a8f97ba6`
**HEAD at start:** `93ca23f4`
**Mutation:** `services/api/src/citations/cohort.ts` and its tests only
**`CITATION_BULK_APPLY`:** **HOLD**, unchanged. No edge written, no candidate frozen.

---

## 0 · Reproduced before anything was changed

NEW2's defect reproduces exactly on the module at `93ca23f4`:

| input                                                                     | declaredMatters | connector | blocks UNIQUE (held=1) |
| ------------------------------------------------------------------------- | --------------: | --------- | ---------------------- |
| `WRIT PETITION No. 123 of 2020` / `WITH` / `WRIT PETITION No. 456 of 2020` |           **2** | WITH      | true                   |
| `Writ Petition No. 123 of 2020` / `With` / `Writ Petition No. 456 of 2020` |           **0** | WITH      | **false**              |
| `(CIVIL APPEAL No. 2047 of 2007)`                                         |               1 | null      | false                  |
| `(Civil appeal No. 2047 of 2007)`                                         |               0 | null      | false                  |

FIFTH's falsifier `2026:JHHC:24297` remained protected throughout (2 declared
matters, blocks at held=1, stops blocking at held=2).

Reproduced on NEW2's own population too — the 472 would-be-`UNIQUE` rows of
`docs/ai/new2-r15/falsifier-adjudicated.jsonl` read `declaredMatters` **`{"0": 472}`**
against the pre-fix grammar. Identical to NEW2's report.

## 1 · Root cause

> **`R15_F1_ROOT_CAUSE`** — `MATTER_LONG` and `MATTER_SLASH` captured the matter
> type as `[A-Z][A-Z.&'-]*` while `CONNECTORS` matched case-insensitively, so a
> cause title printed in title case yielded a connector and zero matters, and
> `declaredMatters > heldCandidates` was `0 > 1` — false. The gate failed OPEN on
> the exact shape it exists to refuse.

This is asymmetric normalisation: one half of a comparison normalised, the other
not. It is permissive by construction, and an all-upper-case fixture set cannot
see it.

## 2 · The obvious repair was measured and is not what shipped

Case-sensitivity had been doing a second job by accident. Indian judgment PROSE
is title case, so `[A-Z]`-only matching had been suppressing the FIR, the
sessions trial and the mid-sentence recital as a side effect of suppressing half
the real cause titles.

Censused over 1,358 key-bearing judgments (`matter-form-census.json`), ignoring
case alone adds 552 matches. The largest single group is not a cohort:

```
102  Case Crime No.60 of 2019      arising out of Case Crime No.60 of 2019
102  Writ Petition No. 15983/2025  S.B. Civil Writ Petition No. 15983/2025
 59  Bail Application No. 4180/2024
 16  Criminal Case No. 1996 of 2022   criminal proceedings of Criminal Case ...
 11  Case No.834/2020                 as entire proceedings of Case No.834/2020
 10  FIR No.132/2018                  Cr.P.C. in connection with FIR No.132/2018
```

So the rule is **structural instead of orthographic**: a matter DECLARATION opens
a line, or opens the text immediately after a conjunction the court printed. A
case number recited mid-sentence is a reference, not a sibling.

Scored side by side on NEW2's temporal holdout (T0 2026-08-18), `grammar-sweep.json`:

| grammar                                | recall      | false refusals   | titles read |
| -------------------------------------- | ----------- | ---------------- | ----------- |
| upper-case only, unanchored (`bd2aa74a`) | 97/180 53.9% | 34/2,295 1.48% | 54.3%       |
| case-insensitive, unanchored           | 98/180 54.4% | 42/2,295 1.83%   | 78.1%       |
| case-insensitive, anchored             | 98/180 54.4% | 35/2,295 1.53%   | 72.9%       |
| **+ the registry type forms — shipped** | **101/180 56.1%** | **39/2,295 1.70%** | **77.2%** |

The population reproduces the previous round exactly — 226 keys, 180 reachable,
2,295 controls, and `97/34` for the pre-fix grammar — so this is one comparison,
not two rounds.

### The matter key changed, on enumerated evidence

`TYPE|serial|year` → `serial|year`. The registry prints ONE matter under two
names in the same cause title (`MFA No. 101864 of 2016` and
`MISCELLANEOUS FIRST APPEAL NO. 101864 OF 2016`), and the old key counted that as
a two-matter cohort. Every collapse the new key makes was enumerated first
(`key-collapse.json`): **623 events over 2,521 documents, 25 distinct type pairs,
and all 25 are an abbreviation beside its own expansion.** Not one pair is two
different matters.

Residual risk, stated not hidden: two genuinely different matters sharing a
serial AND a year in one cause title would collapse to one and the gate would
under-refuse. None was found in 623 collapses.

### Three registry forms, each with a judgment id

Not thresholds moved until a number improved — named forms that silently cost a
whole declaration, because the pattern requires `No.` immediately after the type:

| form                                              | example                            |
| ------------------------------------------------- | ---------------------------------- |
| a standalone dash in the type                     | `Case :- WRIT - C No. - 19783 of 2022` |
| a digit group in the type                         | `MATTERS UNDER ARTICLE 227 No. - 541 of 2024` |
| a slash in the type                               | `APPLICATION U/S 482 No. - 391 of 2024` |

`MATTERS UNDER ARTICLE 227` also needed `NOT_A_MATTER` to be tested against the
WHOLE captured type rather than `typeToken`'s last-two-word abbreviation, which
normalised it to `ARTICLE` and threw a real matter away as legislation.

## 3 · Failure-first tests

`services/api/src/citations/cohort-case.test.ts` — 10 tests, every fixture
verbatim corpus text with its judgment id recorded. Against `93ca23f4`: **7 of 10
fail.** Three are behavioural failures, four are the key-format change:

```
✖ a title-case common order is a cohort          declaredMatters 0, no refusal
✖ a title-case list joined by a/w is a cohort    declaredMatters 0, no refusal
✖ the declared sibling is the matter, not the FIR  counted FIR|193|2023
```

The third is the subtler half: the pre-fix gate DID refuse
`c2e629b9-…` — for the wrong reason. It could not see
`Criminal Writ Petition No.1406 of 2023` and counted `FIR No.193 of 2023` from
the body instead. A gate reaching the right verdict from the wrong evidence is
not protection.

Fail-closed and true-unique controls both hold: an unreadable cause title still
returns `INSUFFICIENT_TO_PROVE_UNIQUE` and blocks; single-matter judgments in
title case (`00654e68-…`) and upper case (`d1a4c477-…`) declare one and are not
refused.

## 4 · Re-measured (`remeasure.json`)

```
COHORT_TITLES_SCANNED              2,295
COHORT_TITLES_RECOGNIZED           1,247 -> 1,772   (54.3% -> 77.2%)
REACHABLE_FALSE_UNIQUE_CLOSED         97 -> 101     of 180
RECALL_COST_KEYS                      34 -> 39      of 2,295
UNREADABLE_FAIL_CLOSED                 0
```

On NEW2's blind package, the 472 would-be-`UNIQUE` rows:

```
declaredMatters pre-fix    {"0": 472}
declaredMatters post-fix   {"0": 294, "1": 178}
UNIQUE_WITHHELD_BY_COHORT  0 -> 0
```

**No verdict changes on that population, and that is the honest result.** Its
`UNIQUE` rows contain no connected-matter cohort. What changed is that the gate
now SEES evidence on 178 of them instead of being blind on all 472.

The 294 still reading zero are **all Supreme Court** (`residual-blind.json`), the
SCR reporter format — `(Special Leave Petition (Crl.) No. 8989 of 2010 etc.)`, or
no case number in the window at all. Only **6 of them print a connector at all**,
so at most 6 could ever have a verdict changed by extending the grammar further.
Bounded, measured, and deliberately not chased.

## 5 · The unreachable residue — re-derived, and the earlier conclusion survives

The previous round attributed 83 misses to a data-contract gap **using a parser
that could not read half the cause titles** — a conclusion drawn from an
instrument broken in the same direction. Re-run against the corrected parser,
asking of every miss whether the SIBLING's own case number appears anywhere in
the bearer's cause title (`residue.json`):

| outcome                                                     |  n  |
| ----------------------------------------------------------- | --- |
| caught by the gate                                          | 101 |
| no conjunction printed AND sibling not named — **UNREACHABLE** |  78 |
| sibling named but no conjunction joins it                   |   0 |
| conjunction + named sibling the parser still misses         |   1 |

> **`UNREACHABLE_83_STATE` = CONFIRMED, now 78, on stronger evidence.** Those 78
> are not merely un-fired: they carry no trace of the sibling at all. The court
> issued SEPARATE orders under one neutral citation and each declares only its
> own matter.

> **`DATA_CONTRACT_GAP`** — for each of the 78, an authoritative statement that a
> neutral citation covers a connected-matter cohort, and which matters, that does
> NOT depend on reading a sibling's own judgment text. The registry's cause-list
> or disposal record for the citation would satisfy it. Nothing in
> `judgments` or `judgment_citation_keys` can supply it. **No schema was
> migrated and no connectedness was manufactured from same court/date/party.**

The single parser gap is a line-wrapped year — Allahabad's
`BAIL APPLICATION No. - 47257 of` / `2021`. Left alone deliberately: un-wrapping
lines would let a declaration form across a boundary the court did not draw,
which is a larger change to what counts as a cause title than one positive in 180
justifies.

## 6 · The other 46 — NOT folded into this gate's metric

`residue.json` → `outOfScope.cases` carries every identity for NEW2.

```
same court, DIFFERENT dates   43
different courts               3
```

> **`INGEST_OR_SOURCE_CITATION_DEFECT` = UNKNOWN**, and it is LCC's read that it
> is not a cohort. A common order is one court on one date; a citation shared
> across dates or courts is a judgment carrying ANOTHER judgment's
> `neutral_citation`. Whether that came from the source or from our extraction is
> not answerable inside the resolver, and LCC did not mutate acquisition or
> source truth to find out.

## 7 · Structured search — inspected, NOT modified

> **`STRUCTURED_SEARCH_SAME_UNIQUENESS_DEFECT` = NO**
> **`STRUCTURED_SEARCH_MUTATED` = NO**

`services/api/src/search/structured.ts` contains no `INSERT`, no `UPDATE`, no
`resolveBatch`, no edge write — it is read-only retrieval and cannot create a
citation identity. Its `total === 1` is a corpus row count rendered as "1 result",
not the resolver's `UNIQUE`, which is an identity assertion used to PIN an edge.

Two of the five required conditions fail outright:

- **reuse without a contract change** — the only existing signal is
  `ambiguous`, whose client copy reads *"This identifier matches N judgments.
  Pick the one you meant."* Setting it at `total === 1` renders
  *"matches 1 judgments"*: incoherent, and a user-visible regression.
- **existing contract semantics require correction** — the contract defines
  `ambiguous` as *"a citation that legitimately identifies more than one
  judgment"* among rows we hold. It is internally consistent and claims no
  world-uniqueness. It would need EXTENDING, not correcting.

**Handed off, named rather than fixed:** a bare `cite:` search returning exactly
one result carries no mark, and an advocate cannot distinguish "one row in our
corpus" from "this citation is that judgment" when the sibling of a common order
has not been ingested. That is a real adjacent risk on an advocate-visible
surface. It needs a contract field and its own round.

## 8 · Tests, and one failure that is not LCC's

```
targeted cohort/parser   22/22   cohort.test.ts + cohort-case.test.ts
full citation suite     104/104  src/citations/*.test.ts (DB-backed)
API suite               969/973 -> 972/973 on re-run
typecheck                 clean  tsc --noEmit, exit 0
```

The one API failure is **`src/search/sparse-bound.test.ts` → "admits a globally
common term inside a NARROW court+date population"**, a LATENCY assertion:
`admitted narrow query must be fast; took 5382ms`. Re-run in isolation on a quiet
box it passes **5/5**. It failed while this round's measurement scripts were
holding the database, which is the box-load trap already recorded in
`record-what-else-was-on-the-box`. Not a correctness failure, and it touches no
citation code.

**The parity-binding failure the round warned about did not appear** — no parity
or freshness-object test failed in this run. No NEW2 artifact was modified to
make anything green.

## 9 · What did not change

- `CITATION_BULK_APPLY` = **HOLD**. No bulk edge write, no candidate approved, no
  historical citation evidence deleted.
- No NEW2 frozen or journal artifact touched.
- No schema migration.
- No heuristic similarity anywhere: no party name, no date proximity, no title
  distance, no embedding. The gate still only ever REFUSES a claim.
- The 800-character cause-title window was **not re-swept** for this grammar. It
  is carried forward from the upper-case sweep, which is a caveat and not a
  result.
