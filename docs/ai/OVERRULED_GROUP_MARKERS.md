# The overruled extractor reads the last case in a list and misses the rest

**13 Aug 2026, LCC.** Found while resolving a single citation NEW3 left
inconclusive. Nothing has been written to the database. This is a finding and a
proposal, not a change.

---

## 1 · WHAT WAS BEING CHECKED

`(1996) 5 SCC 670` was one of 34 unresolved `overruled` edges.
`overruled-resolve-cli` reported it as **THIN** — a 1.00 name match on
`P. KANNADASAN ETC. ETC. versus STATE OF TAMIL NADU` refused for having only 3
tokens.

The refusal looked over-cautious for a surname as distinctive as *Kannadasan*,
so the source text was read rather than the score argued with.

---

## 2 · THE CITATION RESOLVES, AND THE CORPUS SAYS SO ITSELF

The citing judgment is **MINERAL AREA DEVELOPMENT AUTHORITY v. STEEL AUTHORITY
OF INDIA**, `2024 INSC 554`, 25 July 2024 — the nine-judge mineral royalty
bench. Its Case Law section reads:

> …State of Orissa v. Mahanadi Coalfields Ltd. [1995] 3 SCR 639 : (1995) Supp 2
> SCC 686; **P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996)
> 5 SCC 670 – overruled.**

The identity is **not an inference**. MADA's own text prints the name beside the
citation. We hold `P. KANNADASAN v. STATE OF TAMIL NADU`, 26 July 1996,
`1996 INSC 800`, and it is the only 1996 Supreme Court judgment of that name.

**It currently carries `overruled_status = 'none'` and therefore renders as live
good law.**

---

## 3 · THE REAL DEFECT: THE MARKER SCOPES A GROUP, THE EXTRACTOR SCOPES A CITATION

`– overruled.` terminates a **semicolon-separated group**. In the passage above
it closes a list of at least five cases. The extractor attached `overruled` to
the last citation before the marker and **missed every earlier case in the same
group**.

Confirmed as a convention, not a one-off. The same region of MADA uses four
grouped markers:

    "– affirmed."   "– clarified."   "– explained."   "– overruled."

and a new semicolon-separated group begins immediately after each one.

### Why this is worse than an ordinary recall miss

`CLAUDE.md` §6: *"overruled law rendered WITHOUT the LAW MOVED mark is as severe
as a hallucination"*, and the stale-overruled threshold is **zero**. A missed
`overruled` edge is not a gap in a nice-to-have — it is the product showing an
advocate that a dead authority is alive.

It is also **invisible to every check we have**. Evidence-span verification
proves a claim is grounded; it cannot detect a claim never made
(`GPU_PLAN.md` §4b). Nothing here compares against ground truth, so the missed
cases leave no trace at all.

### Scale — bounded, and measured before proposing anything

| | |
| --- | --- |
| judgments containing `– overruled.` | **45** |
| judgments containing `– affirmed.` | 35 |
| overruled-type edges held | 161 |
| …of those, unresolved | 34 |
| judgments with `overruled_status <> 'none'` | 81 |

**45 judgments is a human-readable population**, which is what makes a
report-only tool the right shape here rather than a pipeline.

Each group observed holds roughly five cases and we capture one, so the missed
population is plausibly in the low hundreds — **an estimate, not a measurement**,
and the proposal below is what would turn it into one.

---

## 4 · THE SECOND FINDING, WHICH MAY MATTER MORE

These headnote lists print **both citation forms, paired**:

    P Kannadasan v. State of Tamil Nadu   [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670
    Banarsi Dass Chadha v. Lt Governor    [1979] 1 SCR 271      : (1978) 4 SCC 11
    Jindal Stainless Steel v. Haryana     [2016] 10 SCR 1       : (2017) 12 SCC 1

`overruled-resolve-cli`'s own header names the blocker for all 34 unresolved
edges as *"the SCC/AIR → S.C.R. identity gap"*.

**That mapping is printed inside our own corpus, in `X : Y` form, in 656
judgments.** It needs no model, no external source and no adjudication — it is a
string pair sitting in text we already hold, which is the strongest kind of
evidence this project accepts.

Note the trap in that same passage: `Jindal Stainless Steel v. State of Haryana
[2016] 10 SCR 1 : (2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports 12
SCC 1` — a page header injected mid-citation by PDF extraction. **Any parser
built on this must expect interpolated headers**, and that alone is a reason to
report before writing.

---

## 4b · BUILT AND RUN — AND THE FIRST TWO VERSIONS WERE BOTH WRONG

`headnote-dispositions.ts` + `-cli.ts`, 13 tests. **Writes nothing.** Run against
all 45 judgments.

### What it found

| | |
| --- | --- |
| adverse dispositions parsed | **56** |
| the extractor catches today | 28 |
| apparently missed | **28** |
| **SCR↔SCC concordance pairs** | **391 distinct** |
| unresolved adverse edges with a harvested SCR form | **4 of 34** |

### v3 — SOLVED, by measuring the vocabulary instead of guessing it

| | v1 | v2 | **v3** |
| --- | --- | --- | --- |
| adverse parsed | 59 | 56 | **55** |
| caught today | 25 | 28 | **33** |
| **missed** | 34 | 28 | **22** |
| landmark good law wrongly marked overruled | **8+** | **4+** | **0** |

**What fixed it: the disposition vocabulary is a CLOSED SET, and it was
measured from the corpus rather than reasoned about.** A loose pattern run over
the 45 judgments returned, by frequency:

    referred to 288 · relied on 162 · overruled 62 · followed 42
    distinguished 19 · held inapplicable 12 · affirmed 10 · approved 8
    clarified 6 · explained 3 · disapproved 2 · partially overruled 1
    held not correct law 1 · per incurium 1

Everything else the loose pattern matched was prose — `the`, `that`, `of the`,
`see page`, `under section`. **That is why a generic `[a-z ]+` failed in both
directions at once**: it matched prose as dispositions while missing real
markers, so groups both over- and under-ran.

An allow-list cannot match prose and catches every real marker whether or not a
period follows. Matched longest-first, so `partially overruled` is never
truncated to `overruled`.

**The web could not answer this.** SCR is the authorised reporter but the marker
vocabulary is not documented in any research guide found. The corpus we already
hold was the better primary source — 45 judgments beat a secondary description.

### The 22 that remain look right

They are dominated by **the entire mineral-royalty line** — India Cement,
Orissa Cement, Federation of Mining Associations, Mahalaxmi Fabric Mills,
Saurashtra Cement, Mahanadi Coalfields, P. Kannadasan — which is exactly what
the MADA nine-judge bench overruled, and every one of them currently renders as
good law. Also Siddharam Satlingappa Mhetre, Randhir Singh Rana, HDFC Bank v.
J.J. Mannan and others of the same shape.

**Two entries still carry prose in the name** (`(v) whether the decision in
Mukund Dewangan`, `In the judgment of B.V. Nagarathna, J. District Mini…`). Cosmetic
for a human reading 22 rows; **disqualifying for an automatic write**, which is
one more reason the write stays manual.

### The earlier numbers were NOT trustworthy — kept here deliberately

**Version 1 reported ten cases overruled by `Puttaswamy`** — including *Shayara
Bano*, *Kihoto Hollohan* and *Tulsiram Patel*. All good law. The real group is
two cases.

Cause: `– relied on` appears with **no trailing period**
(`– relied on 1.1.3 A constitutional trust…`). The marker regex required one, so
that boundary was never seen and the next group reached back across two
paragraphs of prose and two earlier lists.

Fixed two ways — optional period, and the group is now **walked backward from
the marker until an entry stops parsing as a case**, so a boundary comes from
the text rather than from another regex having worked. Puttaswamy now reports 1.

**Version 2 was still wrong.** `Joseph Shine` reported *E P Royappa*, *Navtej
Singh Johar*, *Anuj Garg* and *Independent Thought* as overruled. It overruled
*V. Revathi* and *Sowmithri Vishnu* and nothing else.

**The third attempt was not a third guess**, which is the distinction
`CLAUDE.md`'s three-strike rule actually draws. Two blind fixes had failed, so
the next step was to stop fixing and go get the evidence that would settle it —
the real marker vocabulary, extracted from the corpus. With that in hand the fix
was obvious and complete. *"What would break the tie"* is the question the rule
exists to force.

### The two halves have different reliability, and this is the useful part

**A concordance pair is read from ONE entry's own text** — `<name> [YYYY] N SCR
P : (YYYY) N SCC P`. It does not depend on where a group starts or which marker
closed it. The boundary bug assigns the wrong *disposition* to an entry; it does
not corrupt that entry's own SCR↔SCC pairing.

> **The 391 pairs are sound. The 28 is not.**

That asymmetry is what makes this worth keeping despite the parser being wrong:
the half that survives is the half that addresses the *"SCC/AIR → S.C.R.
identity gap"* blocking all 34 unresolved edges.

### And the report-only rule is what made this safe

Had version 1 written to `overruled_status`, *Shayara Bano*, *Kihoto Hollohan*
and *Tulsiram Patel* would now be marked dead law across every surface — the
precise failure `CLAUDE.md` §6 calls *"as severe as a hallucination"*, caused by
the tool built to prevent it. The discipline was not caution for its own sake;
it was load-bearing twice in one hour.

---

## 5 · PROPOSED, NOT DONE

1. **A report-only pass over the 45 judgments** that parses grouped dispositions
   and lists every case each `– overruled.` group covers. Output read by a human,
   exactly as `overruled-resolve-cli` is. **Writes nothing.**
2. **Harvest the `SCR : SCC` pairs** from those 656 judgments into a concordance
   table, provenance-tagged to the judgment they were read from. Deterministic,
   no model. This is the one path to the 34 unresolved edges that does not
   involve adjudication — and `CITATION_CONCORDANCE_EVALUATION.md` measured 10.8%
   fabrication when adjudication was trusted where the corpus was silent.
3. **Nothing writes `overruled_status`** without a human reading the group. 45
   judgments is small enough that this is not a compromise.

**Not started.** The extractor change touches the most safety-critical field in
the schema, and `RING_PROGRAM.md` §2a is explicit that the component should be
tested against the failing population before it is rewritten. Step 1 IS that
test.
