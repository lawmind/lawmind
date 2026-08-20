# TREATMENT_MANIFEST_RECONCILED — 20 August 2026

**Supersedes `TREATMENT_MANIFEST_V2.md` (NEW3, 19 Aug 22:30) on three rows and
on the population count.** V2 is not wrong; it is 90 minutes older than the work
that changed the answer, which is a different thing and is recorded that way.

Every figure below was read from the live database in this session. Nothing is
carried from a prior report, including this lane's own. Where V2 and the database
disagree, **the database wins and the disagreement is printed** rather than
silently resolved — the founder directive for this pass was explicit that the
newer report does not win merely by being newer, so the evidence is shown.

---

## 0 · THE POPULATION MOVED: 33 → 27

V2's population query, re-run live:

```sql
SELECT relationship, count(*) FROM judgment_citations
WHERE relationship IN ('overruled','overruled_in_part','doubted')
  AND cited_judgment_id IS NULL AND coalesce(citation_text,'') <> '';
```

| relationship | V2 (19 Aug) | live (20 Aug) | delta |
| --- | ---: | ---: | ---: |
| `overruled` | 26 | 20 | **−6** |
| `overruled_in_part` | 5 | 4 | **−1** |
| `doubted` | 2 | 3 | **+1** |
| **total** | **33** | **27** | **−6** |

Seven edges were linked to a corpus judgment by `0da8e62` (this lane, 20 Aug) and
two new `doubted` edges appeared, one of which is a duplicate — see §4.

**The 32/33/34 vocabulary is retired.** V2 asked that 34 never reappear; the same
now applies to 32 and 33. The live number is **27 unlinked** and **137 linked**,
and both come from one query rather than from a convention.

> **V2's "no new overruled-class rows have appeared" is no longer true.** Two
> arrived at `2026-08-20T00:02:40Z`, ninety minutes after V2 was cut. That is not
> an error in V2 — it is why a manifest states its `takenAt` and why this file
> re-runs the query instead of quoting one.

---

## 1 · THE THREE ROWS WHERE V2 AND THE DATABASE DISAGREE

V2 §2 lists TM-004, TM-005, TM-006 and TM-007 as `overruled_status = none`,
"still unfixed, re-confirmed live". **Three of the four are now `set_aside`.**

Read directly from the `judgments` row:

| id | judgment | date | V2 says | **live** | verdict |
| --- | --- | --- | --- | --- | --- |
| TM-004 | P. Kannadasan v. State of Tamil Nadu | 1996-07-26 | `none` | **`set_aside`** | V2 stale |
| TM-005 | E.V. Chinnaiah v. State of Andhra Pradesh | 2004-11-05 | `none` | **`set_aside`** | V2 stale |
| TM-006 | Synthetics & Chemicals v. State of U.P. | 1989-10-25 | `none` | **`set_aside`** | V2 stale |
| TM-007 | M.K. Kunhimohammed v. P.A. Ahmedkutty | 1987-09-01 | `none` | `none` | **V2 correct** |

TM-001, TM-002 and TM-003 are `set_aside` live, as V2 states. **6 of 7 named
identities agree; 3 rows were stale in the safe direction** — V2 under-reported
what had been fixed, never over-reported it.

**TM-007 is still `none` and that is correct, not an omission.** It carries zero
adverse edges in the graph. Its citing judgment prints no citation/case pairing,
so there is no printed evidence to link on, and the four guards in
`treatment-link.ts` refuse it. A refusal with a stated reason is a result.

---

## 2 · EVERY ROW VERIFIED AGAINST ITS OWN PASSAGE

The directive asks for the exact treatment passage and the printed
citation/case pairing per row, not a status. All seven, from `evidence`:

| target | edge | citing judgment | citing date | printed pairing |
| --- | --- | --- | --- | --- |
| S. Azeez Basha v. Union of India | `overruled` | Aligarh Muslim University v. Naresh Agarwal | 2024-11-08 | `[1968] 1 SCR 833 : AIR 1968 SC 662` |
| Synthetics & Chemicals v. State of U.P. | `overruled` | State of U.P. v. M/S Lalta Prasad Vaish | 2024-10-23 | `(1990) 1 SCC 109` |
| P. Kannadasan v. State of Tamil Nadu | `overruled` | Mineral Area Development Authority v. SAIL | 2024-07-25 | `[1996] Supp. 4 SCR 92 : (1996) 5 SCC 670` |
| M/S Sun Export Corporation v. Collector of Customs | `overruled` | Commissioner of Customs (Import) v. Dilip Kumar | 2018-07-30 | `(1977) 6 SCC 564` — misprint, see below |
| E.V. Chinnaiah v. State of Andhra Pradesh | `overruled` | State of Punjab v. Davinder Singh | 2024-08-01 | `(2005) 1 SCC 394` |
| SEBI v. Roofit Industries | `overruled` | Adjudicating Officer SEBI v. Bhavesh Pabari | 2019-02-28 | `(2016) 12 SCC 125` |
| M.K. Kunhimohammed v. P.A. Ahmedkutty | *(none)* | — | — | **no pairing printed — correctly refused** |

Each citing judgment is a real, correctly-dated decision and each is the
authority that actually performed the overruling. The two `[LCC correction,
14 Aug 2026]` annotations are preserved verbatim in `evidence`: the Sun Export
row's citing text prints `(1977) 6 SCC 564` where the real citation is
`(1997) 6 SCC 564`, and the correction travels with the row rather than being
applied to it silently.

---

## 3 · TREATMENT IS NOT CURRENTNESS — AND THE SPLIT ALREADY EXISTS

The directive requires **A. verified treatment edge** and **B. derived
currentness / precedential status** to be represented separately, and warns
against collapsing `OVERRULED · SET_ASIDE · DISTINGUISHED · DOUBTED ·
CRITICIZED · APPROVED · FOLLOWED` into one "not good law" field.

**They are already separate, and the vocabulary of A is intact.**

**A — the verified treatment edge** is `judgment_citations.relationship`, per
citing judgment, with `evidence` and `char_offset`. Seven values, live counts:

```
cites              22,306,046
followed               14,024
distinguished           1,752
overruled                 117
approved                   61
doubted                    24
overruled_in_part          23
```

**B — derived currentness** is `judgments.overruled_status`:
`none | set_aside | partly_set_aside | doubted`. It is a *derivation*, and a
derivation is entitled to a coarser vocabulary than its evidence.

### Every derived state is evidenced. Measured, not assumed.

```
                    judgments with     judgments with NO
currentness         an overruled edge   adverse edge at all   only `distinguished`
set_aside                        73                      0                       0
partly_set_aside                  8*                     0                       0
doubted                          17**                    0                       0
```

\* all eight carry `overruled_in_part`.  \*\* all seventeen carry `doubted`.

**Zero judgments are marked non-current on a `distinguished` edge alone, and zero
have no adverse edge at all.** The collapse the directive warns about — a
distinguished precedent rendered as bad law — **does not exist in this data.**
Nine `set_aside` judgments do also carry a `distinguished` edge, but every one of
them independently carries an `overruled` edge; the distinguishing is a second
court's separate act, not the basis of the state.

### The defect that IS present is vocabulary, and it is not mine to fix

**73 of 98 non-current judgments carry `set_aside` derived from an `overruled`
edge. Those are different legal acts.**

- **Set aside** — an appellate court undid *this judgment in this case*. The
  decision between the parties is gone.
- **Overruled** — a later, usually larger bench held the *proposition* is no
  longer good law. The original decision between the original parties **stands**,
  and the judgment often remains citable for propositions the later court never
  touched.

Every one of the seven rows in §2 is an **overruling by a Constitution Bench**,
not an appellate setting-aside. E.V. Chinnaiah was overruled by a seven-judge
bench in *Davinder Singh*; nothing was set aside in Chinnaiah's own case.

This has a product consequence, which is why it is being raised rather than
noted: `CLAUDE.md` §6 — *"`set_aside` disables add-to-matter — the one case where
Lawmind refuses to let an authority be used."* So an overruled-but-intact
authority is currently refused on the same footing as a judgment that no longer
exists.

**Raised as `OD-14`, not resolved here.** The `overruled_status` values appear in
`CLAUDE.md`, the session hook, `SCHEMA_TRUTH.md` and RCC's rendering; changing
them is a cross-lane contract change mid-sprint, and whether an overruled
authority should be addable to a matter is a product judgement.
`docs/OPEN_DECISIONS.md` holds it.

**Nothing about the evidence is wrong. No row needs re-deriving.** If OD-14
resolves toward a distinct `overruled` state, the migration is a relabel of 73
rows whose supporting edges already say `overruled` — the data to do it correctly
is already in the graph.

---

## 4 · A DUPLICATE DECISION IS DOUBLE-COUNTING THE GRAPH — exactly one, located

The `doubted` count rose by one because **two identical edges** were written at
`00:02:39.983Z` and `00:02:40.064Z` — eighty milliseconds apart, same
`citation_text`, same `normalised_citation`, same relationship.

They are not a duplicate extraction. They are **one decision held twice**:

```
edge 1bdba53d -> judgment 9e228fc4   bench=kolhcdb   36,557 chars   md5 7d857098…
edge 47f3097f -> judgment 214c55f2   bench=newas     36,575 chars   md5 2643bfa2…

both:  Bombay High Court · 2010-03-19 · WP/4739/1990
```

Same court, same date, same case number, two S3 bench partitions, two text hashes
eighteen characters apart. **The identity match is deterministic — court + date +
case number — not a similarity score**, which is what makes it safe to state.

Two things follow, and they are the P10 rule in practice:

1. **Neither row may be deleted.** Both are real source artifacts with distinct
   provenance, and the directive is explicit that all case identities, captions,
   numbers and citations are preserved. What may be shared is the *semantic*
   decision representation; the documents stay.
2. **The existing dedup machinery did not catch it.** Both judgments are absent
   from `document_duplicate_members` — the text hashes differ, so a
   hash-equality grouper cannot see them, and an eighteen-character delta is
   almost certainly OCR whitespace.

**Scope, measured rather than feared:** across every citing judgment in the
overruled-class population, this is the **only** identity carrying a twin. All
others are singletons. The contamination is exactly one duplicated `doubted`
edge — the adverse graph is otherwise clean of it. It is not a reason to run a
corpus-wide fuzzy collapse, and doing so on this evidence would be the mistake
P10 exists to prevent.

---

## 5 · THE 27, ENUMERATED

Every remaining unlinked adverse edge, ordered as the query returns them. This
is the actionable queue and it is complete.

| # | edge | printed citation | citing judgment | citing date |
| ---: | --- | --- | --- | --- |
| 1 | `doubted` | `(2017) 14 SCC 533` | Caritas Ayurvedic Hospital Trust v. State of Kerala | 2024-02-20 |
| 2 | `doubted` | `(2003) 2 S.C.C. 3` | Pandit Keshav Chipade v. Atmaram | 2010-03-19 |
| 3 | `doubted` | `(2003) 2 S.C.C. 3` | Pandit Keshav Chipade v. Atmaram *(twin of 2)* | 2010-03-19 |
| 4 | `overruled` | `(2021) 4 SCC 379` | M/S N.N. Global Mercantile | 2023-04-25 |
| 5 | `overruled` | `(2014) 11 SCC 381` | M/S Lisie Medical Institutions v. State of Kerala | 2023-02-09 |
| 6 | `overruled` | `(1983) 3 SCC 284` | State of Himachal Pradesh v. Raj Kumar | 2022-05-20 |
| 7 | `overruled` | `(2020) 2 SCC 109` | Government of Maharashtra v. Borse Brothers | 2021-03-19 |
| 8 | `overruled` | `(2007) 1 SCC 663` | CMD, Mahanadi Coalfields | 2020-05-27 |
| 9 | `overruled` | `(2005) 2 SCC 479` | HUDA v. Vidya Chetal | 2019-09-16 |
| 10 | `overruled` | `(1999) 4 SCC 453` | Vasant Ganpat Padave v. Anant Mahadev Sawant | 2019-09-18 |
| 11 | `overruled` | `(2017) 6 SCC 751` | Shiv Kumar v. Union of India | 2019-10-14 |
| 12 | `overruled` | `[2017] 4 SCR 232` | Shiv Kumar v. Union of India *(same identity as 11)* | 2019-10-14 |
| 13 | `overruled` | `(2004) 6 SCC 689` | State of Madhya Pradesh v. Laxmi Narayan | 2019-07-09 |
| 14 | `overruled` | `(2000) 9 SCC 63` | M/S Vijay Industries v. Commissioner of Income Tax | 2019-03-01 |
| 15 | `overruled` | `(2014) 1 SCC 1` | Navtej Singh Johar v. Union of India | 2018-09-06 |
| 16 | `overruled` | `[2013] 17 SCR 1019` | Navtej Singh Johar *(same identity as 15)* | 2018-09-06 |
| 17 | `overruled` | `(2018) 1 SCC 340` | Janabai v. Additional Commissioner | 2018-09-19 |
| 18 | `overruled` | `(2015) 4 SCC 325` | Indore Development Authority v. Shailendra | 2018-02-08 |
| 19 | `overruled` | `(2005) 11 SCC 600` | Anvar P.V. v. P.K. Basheer | 2014-09-18 |
| 20 | `overruled` | `(2009) 3 SCC 506` | CMD, Indian Oil Corporation | 2014-09-18 |
| 21 | `overruled` | `(1996) 9 SCC 766` | Bharat Parikh v. C.B.I. | 2008-07-14 |
| 22 | `overruled` | `AIR 1987 SC 2158` | State of Punjab v. Bhajan Kaur — **TM-007** | 2008-05-08 |
| 23 | `overruled` | `2003 (6) SCC 675` | Radhey Shyam v. Chhabi Nath | 2015-02-26 |
| 24 | `overruled_in_part` | `AIR 2015 SC 710` | M/S Lion Engineering Consultants | 2018-03-22 |
| 25 | `overruled_in_part` | `(2015) 13 SCC 713` | M/S Lion Engineering *(same identity as 24)* | 2018-03-22 |
| 26 | `overruled_in_part` | `(2017) 4 SCC 150` | Santhini v. Vijaya Venketesh | 2017-10-09 |
| 27 | `overruled_in_part` | `2000 (4) SCC 130` | United India Insurance v. Shila | 2011-10-13 |

**The count reconciles exactly against V2's own sections**, which is the strongest
available check that nothing was lost in the transition:

```
V2 §5 rejected (TM-016)                              1   row 1
V2 §2 still unlinked (TM-007)                        1   row 22
V2 §3 NOT_HELD (TM-008..TM-015, 7 identities)        8   rows 5,6,7,9,10,11,12,18
V2 §4 UNIDENTIFIED, 19 minus the 2 identified
      by `0da8e62` from their own citing judgments   17   the remainder
                                                     --
                                                     27   ✓
```

**Rows 11/12, 15/16 and 24/25 are one identity printed under two reporters** —
SCC and SCR forms of the same judgment. They are separate edges because the
citing judgment printed both, and collapsing them before the target is located
would destroy the second form, which is often the one that resolves.

---

## 6 · UNRESOLVED, STATED AS CATEGORIES

Per the directive: exact unresolved categories, not a residual number.

| category | rows | what would resolve it |
| --- | ---: | --- |
| **NOT_HELD — identity confirmed, corpus holds zero** | 8 | Provider acquisition. V2 §3 re-verified SC-scoped against the current corpus: still zero hits each, confirmed absent rather than inferred. Unchanged this pass. |
| **UNIDENTIFIED — printed citation not yet matched to any identity** | 17 | Concordance/alias work. Two resolved from their own citing judgments in `0da8e62`, so this route is productive and not exhausted. |
| **HELD, no printed pairing to link on** | 1 | TM-007. Blocked on evidence that does not exist in the citing text — **not** on effort. Linking it would require asserting an equivalence no court printed. |
| **REJECTED — extraction misattribution** | 1 | TM-016. Disposition correct and stable; must stay out of every provider queue. Whether `citations-cli.ts` was patched is **not re-checked this pass** and is carried forward as unverified. |
| **DUPLICATE IDENTITY** | 1 pair | Semantic-decision sharing (P10). Blocked on nothing technical; needs the decision in §4 about what may be shared and what must be preserved. |
| **VOCABULARY — `set_aside` used for `overruled`** | 73 judgments | **OD-14.** Founder/product decision. Evidence is already correct; a resolution is a relabel, not a re-derivation. |

## 7 · WHAT THIS FILE DOES NOT CLAIM

- **V2 §4's 19 UNIDENTIFIED rows were not individually re-identified here.** The
  count is reconciled (19 − 2 = 17) and the rows are enumerated in §5, but no new
  identification work was attempted this pass.
- **`char_offset` was not verified against `full_text` for any row.** The
  `evidence` strings were read; the offsets they claim were not re-computed.
  Span verification is P4's discipline and has not been applied to this graph.
- **The 137 LINKED adverse edges were checked in aggregate, not row by row.**
  §3's table proves every non-current judgment has a supporting adverse edge of
  the matching class. It does not prove each individual edge is correctly
  directed. Seven were read in full (§2); 130 were not.
- **`overruled_status` for judgments with no adverse edge was not audited.** This
  file measures forward from the edge to the state. Recall — an authority that
  *should* be marked and is not — is invisible to that direction, and no claim is
  made about it.
