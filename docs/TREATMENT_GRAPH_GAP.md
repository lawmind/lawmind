# TREATMENT-GRAPH GAP — 34 unresolved overruled/doubted edges, all Supreme Court

**NEW3, 13 Aug 2026. Highest-priority finding this lane has produced.** Not
a generic missing-authority item — this is a direct instance of the
product's own stated worst failure mode: *"overruled law rendered WITHOUT
the LAW MOVED mark is as severe as a hallucination"* (`CLAUDE.md`).

---

## 1 · WHAT WAS FOUND

Queried `judgment_citations` (read-only, corpus snapshot at 579,840
judgments) for relationships that are NOT plain `cites` — i.e. an explicit
editorial/judicial statement that a target case's status changed — where
the target is unresolved:

| relationship | total | resolved | **unresolved** |
| --- | --- | --- | --- |
| followed | 14,007 | 9,441 | 4,566 |
| distinguished | 1,734 | 1,154 | 580 |
| **overruled** | 117 | 89 | **28** |
| **overruled_in_part** | 23 | 18 | **5** |
| **doubted** | 21 | 20 | **1** |
| approved | 21 | 19 | 2 |

**The 34 rows across overruled/overruled_in_part/doubted are the ones that
matter most** — `followed`/`distinguished`/`approved` affect ranking and
context, but `overruled`/`doubted` affect **whether a judgment is safe to
cite at all**, the one thing `CLAUDE.md` sets a **zero-threshold** bar on.

**Every one of the 34 is a Supreme Court judgment declaring another
Supreme Court judgment overruled/doubted, cited in SCC/AIR/SCR form —
never neutral citation.** That is the exact shape of the already-known
SCC/AIR↔S.C.R. concordance gap (`MISSING_AUTHORITY_QUEUE.md`), but applied
to the highest-stakes edge type in the whole graph. **Because LawMind's own
Supreme Court holding is 99.977% complete** (`COVERAGE_GAP_MATRIX.md`), the
overruled *target* in most of these 34 rows is very likely **already
sitting in the corpus right now, under its S.C.R. or neutral citation,
un-linked to the judgment that overruled it.**

**What this means concretely, stated as a real risk, not a certainty
(labelled INFER, not KNOW — this lane does not resolve citations):** if any
of these 34 targets is a judgment currently held and citable in the
product, an advocate could see it rendered as ordinary good law — no LAW
MOVED mark — because the link that would trigger that mark does not exist.
**This is not proven for any specific judgment; it is the exact shape of
risk the zero-threshold rule exists to catch, and it has not been checked
row-by-row.**

---

## 2 · THE 34 ROWS, full citation text and citing judgment

Several are recognisably major, recent constitution-bench decisions —
named here only because they are the judgment DOING the overruling
(already held, already correctly dated/titled in the corpus), never
asserting anything about the unresolved target from memory:

| relationship | target citation (as printed) | citing judgment | citing date |
| --- | --- | --- | --- |
| doubted | (1994) 4 SCC 142 | Vishnu Kumar Shukla & Anr. v. State of U.P. & Anr. | 2023-11-28 |
| overruled | (1996) 5 SCC 670 | Mineral Area Development Authority & Anr. v. M/S Steel Authority of India & Anr. Etc. | 2024-07-25 |
| overruled | AIR 1968 SC 662 | Aligarh Muslim University v. Naresh Agarwal & Ors. | 2024-11-08 |
| overruled | (2005) 1 SCC 394 | The State of Punjab & Ors. v. Davinder Singh & Ors. | 2024-08-01 |
| overruled | (1990) 1 SCC 109 | State of U.P. & Ors v. M/S Lalta Prasad Vaish and Sons | 2024-10-23 |
| overruled | (2021) 4 SCC 379 | M/S N.N. Global Mercantile Private Limited v. M/S Indo Unique Flame Ltd. & Ors. | 2023-04-25 |
| overruled | (2014) 11 SCC 381 | M/S. Lisie Medical Institutions v. The State of Kerala and Ors. | 2023-02-09 |
| overruled | (1983) 3 SCC 284 | State of Himachal Pradesh & Ors. v. Raj Kumar & Ors. | 2022-05-20 |
| overruled | (2020) 2 SCC 109 | Government of Maharashtra (WRD) v. M/S Borse Brothers Engineers & Contractors Pvt. Ltd. | 2021-03-19 |
| overruled | (2007) 1 SCC 663 | Chairman-cum-MD, Mahanadi Coalfields Ltd. v. Sri Rabindranath Choubey | 2020-05-27 |
| overruled | [2017] 4 SCR 232 | Shiv Kumar & Anr. v. Union of India & Ors. | 2019-10-14 |
| overruled | (2017) 6 SCC 751 | Shiv Kumar & Anr. v. Union of India & Ors. | 2019-10-14 |
| overruled | (2005) 2 SCC 479 | HUDA v. Vidya Chetal | 2019-09-16 |
| overruled | (1999) 4 SCC 453 | Vasant Ganpat Padave (D) by LRs. & Ors. v. Anant Mahadev Sawant (D) through LRs. & Ors | 2019-09-18 |
| overruled | (2004) 6 SCC 689 | State of Madhya Pradesh and Others v. Lafarge Dealers Association and Others | 2019-07-09 |
| overruled | (2000) 9 SCC 63 | M/S. Vijay Industries v. Commissioner of Income Tax | 2019-03-01 |
| overruled | (2016) 12 SCC 125 | Adjudicating Officer, SEBI v. Bhavesh Pabari | 2019-02-28 |
| overruled | (1988) 2 SCC 72 | Joseph Shine v. Union of India | 2018-09-27 |
| overruled | (2018) 1 SCC 340 | Janabai v. Additional Commissioner and Others | 2018-09-19 |
| overruled | (2014) 1 SCC 1 | Navtej Singh Johar & Ors. v. Union of India | 2018-09-06 |
| overruled | [2013] 17 SCR 1019 | Navtej Singh Johar & Ors. v. Union of India | 2018-09-06 |
| overruled | (1977) 6 SCC 564 | Commissioner of Customs (Import), Mumbai v. M/S. Dilip Kumar and Company & Ors. | 2018-07-30 |
| overruled | (2015) 4 SCC 325 | Indore Development Authority v. Shailendra (Dead) through LRs. & Ors. | 2018-02-08 |
| overruled | (2015) 3 SCC 353 | Indore Development Authority v. Shailendra (Dead) through LRs. & Ors. | 2018-02-08 |
| overruled | (2009) 3 SCC 506 | Chairman cum Managing Director Indian Oil Corporation Ltd. v. Sunita Kumari & Anr. | 2014-09-18 |
| overruled | (2005) 11 SCC 600 | Anvar P.V. v. P.K. Basheer and Ors. | 2014-09-18 |
| overruled | (1996) 9 SCC 766 | Bharat Parikh v. C.B.I. & Anr. | 2008-07-14 |
| overruled | AIR 1987 SC 2158 | State of Punjab & Ors. v. Bhajan Kaur & Ors. | 2008-05-08 |
| overruled | 2003 (6) SCC 675 | Radhey Shyam & Anr. v. Chhabi Nath & Ors. | 2015-02-26 |
| overruled_in_part | (2013) 8 SCC 781 | Surendran v. State of Kerela | 2022-05-13 |
| overruled_in_part | (2015) 13 SCC 713 | M/S Lion Engineering Consultants v. State of M.P. & Ors. | 2018-03-22 |
| overruled_in_part | AIR 2015 SC 710 | M/S Lion Engineering Consultants v. State of M.P. & Ors. | 2018-03-22 |
| overruled_in_part | (2017) 4 SCC 150 | Santhini v. Vijaya Venketesh | 2017-10-09 |
| overruled_in_part | 2000 (4) SCC 130 | United India Insurance Co. Ltd. v. Shila Datta & Ors. | 2011-10-13 |

**Method note:** query against `judgment_citations` joined to `judgments`
for the citing side only. No target was looked up or matched against
anything by this lane — that is exactly the concordance-resolution step
`services/ingest/src/internal-concordance.ts` already does mechanically,
and re-deriving it by hand from memory here would be the precise mistake
`CLAUDE.md` forbids (*"the model never emits a citation from memory"*).
This table is a priority list for that existing tool, not a set of claims
about what the targets are.

---

## 3 · WHY THIS OUTRANKS THE GENERIC MISSING-AUTHORITY QUEUE

`docs/MISSING_AUTHORITY_QUEUE.md` ranks by citing frequency — a reasonable
default when every edge is an ordinary `cites`. **These 34 are a different
class of risk entirely**, because the failure mode if left unresolved is
not "search finds one less result" but **"a dead authority renders as
live"** — the exact zero-threshold violation `CLAUDE.md` names by name.
Recommend LCC's concordance/resolution work prioritise these 34 rows ahead
of raw citation-frequency ranking, even though 34 is a small number next to
the queue's 8,733 distinct unresolved keys.

**Also worth flagging separately:** `followed` (4,566 unresolved) and
`distinguished` (580 unresolved) are lower-stakes than `overruled` but not
zero-stakes — a "distinguished" relationship left unresolved means the
citator cannot show *why* a precedent doesn't apply, which is a
completeness gap in the product's core differentiator, not a safety one.
Not escalated with the same urgency, but not nothing either.

---

## 4 · WHAT THIS LANE DID NOT DO

- **Did not attempt to identify any of the 34 target judgments by name or
  citation from memory.** That is exactly the hallucination risk this
  product exists to prevent, and it is LCC's concordance tooling's job
  specifically because that tooling verifies against corpus text rather
  than trusting a model's recall.
- **Did not check whether any target is genuinely absent** (as opposed to
  held-but-unaliased). Given the Supreme Court corpus is 99.977% complete
  by document count, absence is unlikely for most of these but not
  eliminated — a pre-1950 target (before the corpus's own start date) would
  genuinely not be held, and none of the 34 rows' citation years were
  checked against 1950 as a floor.
- **Did not write anything to `judgment_citations` or any resolution
  table.** This lane does not write corpus tables.
