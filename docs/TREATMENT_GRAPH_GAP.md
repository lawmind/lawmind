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

## 3b · EXTERNAL VERIFICATION, 13 Aug 2026 — answering LCC's exact question (bus 0126/0141)

LCC's `overruled-resolve-cli.ts` ran name-matching against our own corpus
over all 34 rows: 13 candidate matches, 1 ambiguous, 6 thin evidence, 1
no-name-beside-citation, **13 with no candidate at all** — and asked this
lane directly: for those 13, is it a name-extraction failure, or is the
target genuinely absent from a 99.98%-complete SC corpus? *"That
distinction is your lane's core question and I cannot answer it from
inside the corpus."*

**Checked 4 of the 34 citation texts against real external sources** (news
coverage and case-law sites reporting the actual overruling judgments —
never this lane's own memory of case law):

| target citation | verified real case | how confirmed |
| --- | --- | --- |
| `AIR 1968 SC 662` | **S. Azeez Basha and Anr. v. Union of India** (1968 AIR 662, 1968 SCR (1) 833), decided 20 Oct 1967 | Multiple independent sources (BusinessToday, EPW, Supreme Court Observer, bnblegal) confirm this is exactly what the AMU 2024 judgment overruled |
| `(2005) 1 SCC 394` | **E.V. Chinnaiah v. State of Andhra Pradesh** | SCC Online's own blog, Wikipedia and two case-law sites confirm this exact citation as what Davinder Singh (2024 INSC 562) overruled |
| `(1990) 1 SCC 109` | **Synthetics and Chemicals Ltd. v. State of U.P.** | Confirmed via search |
| `(1996) 5 SCC 670` | **RESOLVED 13 Aug 2026 — by LCC, from inside the corpus, not by this lane's external search.** MADA v. SAIL overrules several cases in the same passage, not only India Cement — this lane's search had simply found a different one of the several targets. The actual case: **P. Kannadasan v. State of Tamil Nadu** (`1996 INSC 800`, 26 Jul 1996) — already held, currently `overruled_status = 'none'`, rendering as live good law. MADA's own text prints the name beside the citation: *"P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled."* Full account: `docs/ai/OVERRULED_GROUP_MARKERS.md` |

**3 of 4 checked are exact, independently-confirmed, well-known landmark
judgments — not obscure or dubious citations.** This is real, external
evidence (not corpus-internal, not memory) that the extraction is
generally trustworthy and that **most of the 13 no-candidate rows are far
more likely to be "held but unaliased" than "genuinely absent" or
"extraction failure."** The one inconclusive case (`(1996) 5 SCC 670`)
needs LCC's own tool — reading the exact text beside the citation in the
citing judgment — not more external search; the ambiguity is exactly why
that tool checks the source document instead of trusting a citation string
in isolation.

**Method note, same discipline as §2 above:** every case name in this
table came from an external source describing the actual overruling
event, cross-checked against the citation form independently. None was
supplied from this lane's own recollection of Indian case law and then
merely "confirmed" by a search that would happily agree with a wrong
guess.

---

## 3c · THE FINDING BEHIND THE FINDING — a systemic extraction bug, and an internal concordance source, both found chasing one citation

**LCC's resolution of `(1996) 5 SCC 670` (§3b) surfaced two things bigger
than the one citation, neither this lane's to fix but both directly
relevant to this queue.** Full account: `docs/ai/OVERRULED_GROUP_MARKERS.md`.

1. **The `– overruled.` marker scopes a semicolon-separated GROUP of
   citations, and the extractor scopes only the last one before it.**
   MADA v. SAIL's Case Law section lists at least five cases in one group
   ending `– overruled.`; the extractor attached the relationship to only
   the final citation, silently missing the earlier ones in the same
   group. 45 judgments contain `– overruled.` (35 contain `– affirmed.`).

   **CORRECTED TWICE, 13 Aug 2026.** First correction: LCC measured the
   missed-population figure at 22, superseding an earlier "low hundreds"
   estimate from one observed group. **Second correction, same day: 22 is
   the count of missed EXTRACTION EDGES, not the count of judgments
   rendering as bad law — those are different quantities, and this lane's
   first write-up conflated them.** LCC checked 9 of the 22 against the
   corpus directly:

   | outcome | count | detail |
   | --- | --- | --- |
   | confirmed `overruled_status = 'none'`, rendering as good law | **6** | mineral-royalty line + HDFC v. J.J. Mannan |
   | already marked (some other path set it) | 1 | Siddharam Satlingappa Mhetre — `set_aside` despite the missed edge |
   | not held in the corpus at all | 2 | Federation of Mining Associations, Randhir Singh Rana — a graph gap, not a mis-render; nothing displays them, so nothing displays them wrongly |
   | unchecked | 13 | remaining of the 22 |

   **A missed edge pointing at a judgment we hold and mismark is a
   rendering defect (zero-threshold territory, `CLAUDE.md` §6). A missed
   edge pointing at a judgment we don't hold is an acquisition gap** — the
   two-not-held rows are this lane's, not LCC's, and are logged in
   `CORPUS_ACQUISITION_QUEUE.md`. **Worth recording how the 22 itself was
   reached, because two earlier parser versions were both wrong and both
   dangerous, and neither was shipped:** v1 would have marked ten real
   landmark judgments — including **Shayara Bano, Kihoto Hollohan and
   Tulsiram Patel** — as overruled by Puttaswamy (they are not); v2 still
   wrongly marked E.P. Royappa, Navtej Singh Johar and Anuj Garg as
   overruled by Joseph Shine (it actually overruled two different cases).
   Both were caught by testing against known landmark cases before writing
   anything. What actually fixed it: extracting the *closed set* of
   marker phrases genuinely used across these 45 judgments (14 total —
   `referred to`, `relied on`, `overruled`, `followed`, `distinguished`,
   `held inapplicable`, `affirmed`, `approved`, `clarified`, `explained`,
   `disapproved`, `partially overruled`, `held not correct law`, `per
   incurium`) rather than guessing at a regex boundary. **This marker
   vocabulary is not documented anywhere on the web** — LCC searched
   first and found nothing; the corpus itself was the only reliable
   source, worth remembering as a general pattern for a court's own
   internal drafting conventions.

   **The confirmed-bad-law 6 are dominated by the mineral-royalty
   line** — India Cement, Orissa Cement, Mahalaxmi Fabric Mills,
   Saurashtra Cement, Mahanadi Coalfields (plus HDFC v. J.J. Mannan;
   Federation of Mining Associations and P. Kannadasan belong to the same
   line but are NOT_HELD / already-resolved respectively, not part of
   this 6) — exactly what the MADA nine-judge bench overruled. This is
   exactly the zero-threshold risk this document exists to track, a
   second, structurally different cause from the SCC/AIR↔SCR identity gap
   in §1. **Not this lane's to fix** — LCC built and ran the report-only
   pass (v3, human-read, writes nothing) per the same "test before
   rewriting" discipline `RING_PROGRAM.md` records elsewhere.
2. **A free, internal, already-held source for the SCC/AIR↔S.C.R.
   concordance — potentially closing the dominant share of this entire
   document.** The same passages print citations in **paired form**,
   `S.C.R. cite : SCC cite`, e.g. *"P Kannadasan v. State of Tamil Nadu
   [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670."* **656 judgments in the
   corpus already contain this pairing.** No model, no external source,
   no adjudication — a string pair sitting in text already held. See
   `SOURCE_REGISTRY.md` §5a and `MISSING_AUTHORITY_QUEUE.md` for what this
   means for the acquisition priority this document previously set (the
   Supreme Court's own Equivalent Citation Table, still blocked on
   tooling) — this internal source may make that external one unnecessary
   for most of the gap.

---

## 3d · INDEPENDENT CROSS-CHECK, 13 Aug 2026 — this lane's own verification of the internal pairing, by a different method than LCC's

**Not building the harvester — verifying its premise independently**, using
`judgment_citations`' existing char_offset data (indexed, no full-text
scan) rather than name-matching. For each of the 34 targets, checked
whether another citation in the *same* citing judgment, of S.C.R. form,
sits within 100 characters — then pulled the actual text window around
each hit to confirm genuine `X : Y` adjacency rather than a coincidental
nearby citation (LCC's own passages are grouped lists of 5+ cases, so
proximity alone is not proof).

**Result: 13 of the 34 have a confirmed, read-verified internal pairing** —
independently matching LCC's own resolver's *"13 candidate found"* count
via a completely different method (text-window adjacency vs. name-Jaccard
matching). Convergent evidence from two unrelated techniques is stronger
than either alone. The confirmed 13 include `(1996) 5 SCC 670` (P.
Kannadasan, matching LCC's own finding exactly) and `AIR 1968 SC 662` (S.
Azeez Basha, matching this lane's earlier *external* web verification —
three independent methods now agree on this one).

**The other 21 candidates from the proximity check were NOT all real —
6 were confirmed false positives**, and one of them is a live, in-corpus
example of the exact trap LCC warned about: `(2014) 11 SCC 381`'s nearby
"citation" was a **page header artifact** (`"354 [2023] 6 S.C.R. 354"`
injected mid-text by PDF extraction), not a real S.C.R. form of the target
at all. Recorded as a concrete instance, not just the abstract warning.

**What this changes:** nothing written, same discipline as before. But it
raises confidence that LCC's 13/34 figure is real and reproducible, and it
confirms the internal-pairing approach's failure mode is exactly proximity
false-positives — meaning any future automation of this MUST check
punctuation-level adjacency (colon or semicolon immediately between the
two citations), never distance alone.

---

## 3e · §3d's false-positive catch was a live defect in LCC's writing path, now fixed (bus 0240)

**The `(2014) 11 SCC 381` page-header trap in §3d was not a hypothetical —
LCC's harvester was about to write exactly that kind of pairing.** Its
`citationOf` matcher searched each entry for an S.C.R. form and an SCC form
independently and paired whatever it found, with no adjacency check. The
`INTERPOLATED_HEADER` stripper caught the periods-form (`S.C.R.`) but not the
unspotted variant (`SCR` no periods) — the exact shape our false positive was.

**Fix, confirmed by LCC:** an entry now needs `paired: true`, set only when
both forms come from one `X : Y` construction with the colon between them —
punctuation-level adjacency, not proximity. Three tests built directly from
this false positive, including the page-header case. The loose fields still
feed the human-read disposition report; only colon-paired entries reach the
function that writes. Precision where it writes, recall where it is read.

**CORRECTED 13 Aug 2026 (bus 0249) — the SC-only scoping assumption does not
hold.** The `--all-courts` sweep this section flagged as pending has run:
**97 judgments outside the Supreme Court print paired SCR : SCC citations.**
This lane's fact was right but aimed at the wrong question — SCR *is* the
Supreme Court's own exclusive reporter (confirmed, `SOURCE_REGISTRY.md`
§5d), but that fact constrains what SCR *publishes*, not which *courts'
judgments can cite an SC case in paired form*. Any High Court judgment
citing Supreme Court precedent can print `X : Y` in its own text — the
headnote apparatus is the SC reporter's, but the citing sentence is the
citing court's. This lane's confirmation to LCC was correctly flagged as
corroboration rather than independent verification at the time (bus 0241)
— the caveat held; the conclusion under it didn't. Harvester scope is
therefore all-courts, not SC-only, going forward — LCC's call, not this
lane's to fix.

Still nothing written by the harvester — dry run in progress, report before
any `--apply`.

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
