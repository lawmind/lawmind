# TREATMENT PROVENANCE DECISION INPUT V1 — what our currentness claims actually rest on

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Consumers:** LCC (`propagate-treatment.ts`,
the five rendering surfaces), NEW3 (copy), the founder (§7 licence question)
**Plan:** `LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md` §8 / NEW2-1

**No corpus mutation. No treatment withdrawn, no evidence deleted.**

---

## 0 · The answer, before the working

| question | answer |
| --- | --- |
| treatment-bearing edges | **16,001** — all classified, **not a sample** |
| judgments rendering **LAW MOVED** | **98** real + 6 Test Court fixtures |
| driving edges behind those badges | **137** — **all 137 hand-read**, not screened |
| of the 137, reporter/headnote editorial apparatus | **131 = 95.62%** |
| of the 137, the court's own words | **5 = 3.65%** |
| of the 137, a dissent describing a *proposal* to overrule | **1** |
| badges that survive if reporter evidence may not promote | **5 of 98 = 5.10%** |
| does an evidence-provenance predicate exist anywhere in the promotion path | **no — in any of the five surfaces** |
| `OFFICIAL_REGISTRY_STATUS` — is there a source | **no. `ecourts_observation` holds 0 rows** |

> **Canonical-safe currentness coverage today is 5 judgments in a corpus of 18.7
> million.** Everything else that renders LAW MOVED is a law reporter's editorial
> annotation promoted automatically by a `relationship IN (...)` check.

---

## 1 · The provenance classes, and which way the screen is allowed to be wrong

| class | evidence | may support |
| --- | --- | --- |
| `COURT_REASONING_EXPLICIT` | the citing court's own sentence naming the authority and the act | any treatment, including adverse |
| `COURT_ORDER_DISPOSITIVE` | the operative order — set aside, quashed, reversed | any treatment |
| `OFFICIAL_REGISTRY_STATUS` | a court registry record of appellate outcome | any treatment |
| `REPORTER_EDITORIAL_ANNOTATION` | a headnote / Case Law Cited entry | **a candidate only** — §7 |
| `COUNSEL_ARGUMENT` | "learned counsel placed reliance on X" | **nothing.** What counsel urged is not what the court held |
| `UNKNOWN` | no speaker signal | **nothing** |

**Precedence is deliberately pessimistic:** reporter > counsel > court reasoning >
dispositive > unknown. A span carrying both counsel voice and court voice is
classified `COUNSEL_ARGUMENT`. A false negative costs coverage; a false positive
certifies a headnote as a holding. Only one of those is recoverable.

### `OFFICIAL_REGISTRY_STATUS` has no source, and that is measured rather than assumed

`ecourts_observation` — the only table in the schema that could carry a registry
disposal record — holds **0 rows**. §8/NEW2-7 forbids live eCourts traffic this
round, so the class exists in the vocabulary with **zero available evidence** and
must not be used to imply a coverage path we do not have.

---

## 2 · The whole treated population, classified — 16,001 edges, no sampling error

| class | edges | share |
| --- | ---: | ---: |
| `REPORTER_EDITORIAL_ANNOTATION` | 11,340 | **70.87%** |
| `UNKNOWN` | 4,503 | 28.14% |
| `COURT_ORDER_DISPOSITIVE` | 100 | 0.62% |
| `COUNSEL_ARGUMENT` | 51 | 0.32% |
| `COURT_REASONING_EXPLICIT` | 7 | 0.04% |
| `OFFICIAL_REGISTRY_STATUS` | 0 | 0.00% |

| §8's three buckets | edges | share |
| --- | ---: | ---: |
| **canonical-safe** | 107 | **0.67%** |
| **candidate-only (reporter)** | 11,340 | 70.87% |
| **unsupported** | 4,554 | 28.46% |

| relationship | reporter | unknown | dispositive | counsel | court reasoning |
| --- | ---: | ---: | ---: | ---: | ---: |
| followed (14,024) | 10,066 | 3,836 | 80 | 37 | 5 |
| distinguished (1,752) | 1,158 | 561 | 20 | 12 | 1 |
| overruled (117) | 80 | 36 | 0 | 0 | 1 |
| approved (61) | 1 | 59 | 0 | 1 | 0 |
| doubted (24) | 16 | 7 | 0 | 1 | 0 |
| overruled_in_part (23) | 19 | 4 | 0 | 0 | 0 |

### Why 0.04% court reasoning is structural, not a bug

`detectTreatment(text, end)` searches **forward only**, 220 characters, for a
dash-and-marker: `— overruled`, `– relied on`, `- distinguished`. That is the
notation a law report uses to close a *Case Law Cited* entry. **Courts do not
write it.** The writer is, by construction, a reporter-apparatus reader. Its
signature is in the function, so no amount of corpus growth changes the ratio.

---

## 3 · The 137 edges that actually render LAW MOVED — every one hand-read

The screen is a phrase list, and a phrase list scores well on the documents it
was written from. So the population that matters was not screened, it was
**read** — all 137 spans, by hand.

| | screen said | **hand-adjudicated** |
| --- | ---: | ---: |
| `REPORTER_EDITORIAL_ANNOTATION` | 93 | **131** |
| `UNKNOWN` | 42 | **0** |
| `COURT_REASONING_EXPLICIT` | 1 | **5** |
| `COUNSEL_ARGUMENT` | 1 | **0** |
| `MODALITY_DEFECT` (new class, found by reading) | — | **1** |

### The screen's `UNKNOWN` was not absence of signal — it was under-detected reporter apparatus

**38 of the 42** carry unmistakable law-report furniture the marker list did not
reach: column letters running down the page (`A B c D E F G H`), page-and-line
pins (`[594 E-H, 595 A-F]`, `[Para 272][255 G-H]`), and the heading
`LIST OF CITATIONS AND OTHER REFERENCES`. Example, verbatim:

> `…[Paras 11, 12, 13, 14] (1075-A-H; 1076-A-B] H  State of Haryana and Others v.
> S.L. Arora and Company 2010 (2) SCR 297 : (2010) 3 SCC 690 - overruled ..`

A spot check of 12 of the 93 the screen *did* call reporter confirmed 12 of 12.
**So the screen's error is one-directional — it under-counts reporter — which is
the safe direction, and correcting it makes the finding worse, not better.**

### The 5 that are genuinely the court speaking

| citing year | what the court actually wrote |
| ---: | --- |
| 1999 | "…in which the decision in *B.K. Sardari Lal v. Union of India* was **specifically overruled** and it was held that under Article 74(1)…" |
| 1973 | "Later, in *State of Gujarat v. Shantilal Mangal Das*, **the Court overruled the decision** in *Metal Corporation* case." |
| 2019 | "The decision in *S.N. Dutt v. Union of India* case **does not accord with the view expressed by us and is therefore overruled**." |
| 1980 | "Following the decision of this Court in *Northern India Caterers* **(which held the field at that time and since overruled)**…" |
| 2023 | "Only because the correctness of a portion of the judgment in *Mohd. Shafi* **has been doubted by another Bench**, the same would not mean that we should wait…" |

Two carry a caveat worth recording: the 1980 and 2023 spans state that the
authority *was* overruled or doubted **without naming the judgment that did it or
when**. They support the existence of a LAW MOVED state; they do not support the
"set aside by X on `<date>`" provenance line the render surfaces print.

### The one that says the opposite of what was stored

Edge `9de8fd68-e248-4e0d-8cef-cfa79220e735` — Supreme Court, 1985, **THAKKAR, J.,
dissenting**:

> "A benevolent and justice-oriented decision of a three-Judge Bench of this
> Court, rendered ten years back … (*D.P.O. Southern Railway v. T.R. Challappan*),
> **is sought to be overruled by the judgment proposed to be delivered** by my
> learned Brother Madon, J, with which, the majority appear to agree."

Stored as `relationship = 'overruled'` on `[1976] 1 S.C.R. 783`, and it is the
**sole** driving edge for judgment `f83d0700-eaf5-4075-9744-2e20faacedc9`, which
today renders **`set_aside`**.

**"is sought to be" and "proposed to be delivered" are not holdings.** The
outcome is probably right — the same sentence says the majority appears to agree
— but *the badge is correct by luck, not by evidence*. This is a **modality**
failure, a class distinct from the polarity failure (`dis-approved`) found on
23 August: polarity is the wrong verb, modality is the right verb in the wrong
mood. `MARKER_RE` guards neither.

Not corrected here: correcting it needs the majority judgment read as primary
evidence, and §8/NEW2-5 permits correction only where primary evidence makes it
deterministic. Filed in §8 below as bounded work.

---

## 4 · Per judgment — how much currentness coverage is actually safe

104 rows carry a non-`none` `overruled_status`. **Six are Test Court synthetic
fixtures** (`SYNTHETIC — Set Aside Fixture`, `SYNTHETIC — Still Good Law For
Now`), each with 0 inbound pins. They inflate the denominator by 5.8% and are
excluded. Real population: **98**.

| | judgments | share |
| --- | ---: | ---: |
| survive on court evidence alone | **5** | **5.10%** |
| lose the badge if reporter evidence may not promote | **92** | 93.88% |
| rest only on the modality defect | 1 | 1.02% |

Of the 92: `set_aside` 68 · `doubted` 16 · `partly_set_aside` 8.

**This is the number §8 asks for.** Safe treatment/currentness coverage, under a
policy that reporter apparatus may not independently become canonical, is
**5 judgments**. Not 5%, not 5,000 — five.

---

## 5 · Enforcement trace: can reporter-only evidence promote today?

**Yes. Automatically, on every surface, and nothing anywhere can stop it.**

`judgment_citations` has columns `id, citing_judgment_id, cited_judgment_id,
citation_text, normalised_citation, relationship, evidence, char_offset,
created_at`. **There is no provenance column.** So no consumer can filter on
provenance even if it wanted to — the fact does not exist in the row.

Every production surface that turns an edge into user-visible currentness:

| surface | predicate | provenance filter |
| --- | --- | --- |
| `citations/propagate-treatment.ts:157` — **the writer of `judgments.overruled_status`** | `relationship IN ('overruled','overruled_in_part','doubted') AND cited.overruled_status = 'none'` | **none** |
| `judgments/route.ts:91` | same `IN (...)` | **none** |
| `search/route.ts:53` | same `IN (...)` | **none** |
| `search/retrieve.ts:1665` | same `IN (...)` | **none** |
| `matters/authorities.ts:243` | same `IN (...)` | **none** |

The promotion path is **one relationship-value check**, five times over. A
headnote annotation and a Constitution Bench's own holding are indistinguishable
to all five.

### What is working, and should be said plainly

The controls that exist are good ones and none of them is weakened by this
finding:

- **`partly_set_aside` already demands more than the edge** — it reads the
  paragraph references from the citing court's own text and refuses to widen to
  `set_aside` when it cannot. That is a provenance check in everything but name,
  on exactly the state where over-claiming is worst.
- **Resolution never creates treatment.** Verified in the function signature:
  `detectTreatment(text, end)` cannot see `cited_judgment_id`.
- **No adverse treatment sits on a citation collision** — 0 of 137
  (`RESOLVER_FALSE_UNIQUE_AUDIT_V1.md` §5).
- **A contradicted citing date demotes rather than excludes**, and the state
  travels to the wire.

The gap is narrow and specific: **the class of the evidence is not recorded, so
it cannot be enforced.**

---

## 6 · The additive contract — `treatment_claim`, and why the columns are separate

Nothing here is built this round; §8 forbids a mass treatment rewrite and this
lane is not writing one. This is the shape a later run must satisfy.

```
treatment_claim
  citing_judgment_id
  cited_judgment_id          -- identity, resolved by a separate system
  treatment                  -- FOLLOWED | DISTINGUISHED | DOUBTED | OVERRULED | ...
  evidence_class             -- the six classes of §1
  evidence_span              -- the exact characters relied on
  speaker                    -- COURT | COUNSEL | REPORTER_EDITOR | UNKNOWN
  modality                   -- HELD | PROPOSED | ARGUED | NARRATED   <-- new, §3
  polarity_checked           -- boolean; the dis-approved class
  method                     -- writer id + version
  decided_at
  supersedes                 -- previous claim id; never overwritten in place
```

**`treatment` and `evidence_class` are separate columns on purpose.** One enum
meaning both is precisely how "we found the word *overruled*" becomes "this
judgment is overruled".

**`modality` is added by this document.** The 1985 dissent proves the mood of the
verb is load-bearing and that nothing currently records it.

### Minimum enforcement, which is smaller than it sounds

`propagate-treatment.ts` is the single writer of `judgments.overruled_status`.
One predicate there — *promote only where `evidence_class` is a court class* —
gates every one of the five surfaces, because the other four read the status it
writes. **The enforcement point is one line in one file**; what is missing is the
column to put in it.

---

## 7 · The licence question is the founder's, and it is now sized

`CLAUDE.md` §6: *"What IS protected is a reporter's copy-edited version —
headnotes, editorial numbering (Eastern Book Company v. D.B. Modak) — so use raw
court text and never a law report's edition of it."*

The annotations in §3 are exactly that apparatus, read off SCR volumes held in
the corpus. Two facts the founder needs together:

1. **95.62% of what drives LAW MOVED is reporter editorial apparatus.**
2. **The alternative is not a smaller number — it is 5.**

Filed as `FQ-TREATMENT-HEADNOTE-PROVENANCE` in `docs/FOUNDER_QUEUE.md`. This lane
takes no position on it and has withdrawn nothing.

**Until it is answered, the round rule from §8 stands and is now measured rather
than asserted:** reporter/editorial treatment may support a *candidate*; it must
not silently become canonical rendered treatment.

---

## 8 · Safe product copy, given these numbers

The existing rule — *"No adverse treatment found in LawMind as of [date]"*, never
*"This is good law"* — is correct and unchanged. What these numbers add:

| surface | safe | **not** safe |
| --- | --- | --- |
| a judgment with no adverse treatment | "No adverse treatment found in LawMind as of 23 Aug 2026." | "Still good law" · "Verified current" |
| a LAW MOVED badge on one of the 92 | "**Reported as set aside.** Source: law-report annotation in [citing case]." | "Set aside by [court] on [date]" as bare fact |
| a LAW MOVED badge on one of the 5 | "Set aside by [citing case]" — the court said so in terms | — |
| the 2 of 5 that name no overruling judgment | "Reported overruled; the overruling judgment is not identified in our source." | inventing a citing case for the provenance line |
| coverage generally | "LawMind's treatment coverage is partial and is drawn largely from law-report annotations." | any completeness claim |

**Do not surface the provenance class as a badge.** `CLAUDE.md`: verified is
silent, amber `#B4690E` means the law has moved and nothing else, and our
uncertainty renders as neutral ink with a dashed edge. The provenance line
belongs in the on-tap detail, in the same place `verified_by_source` already
lives.

**Nothing here reduces what is shown.** An advocate must still see every adverse
treatment we hold — hiding a reporter-sourced warning because its provenance is
weak would be the worse error in the other direction, and `CLAUDE.md` §3.4 makes
adverse-treatment visibility non-gateable. The change is what we *assert*, not
what we *show*.

---

## 9 · Bounded corrections this evidence makes deterministic (§8/NEW2-5)

| # | rows | evidence | status |
| --- | ---: | --- | --- |
| 1 | **4** | `dis-approved` polarity inversion. Writer fixed 23 Aug; the 4 stored rows still read the opposite of the court | not corrected — `approved` reaches no `overruled_status`, so no badge was ever driven by them |
| 2 | **1** | the 1985 modality defect, sole driver of a `set_aside` | **needs the majority judgment read as primary evidence.** Not deterministic from the citing text alone |
| 3 | **6** | Test Court fixtures carrying `overruled_status` in the production corpus | LCC's fixtures, not this lane's rows. Reported, not touched |

No correction is applied in this round. Each is a bounded, named row set with its
evidence recorded, which is the §8 requirement.

---

## 10 · What this does not measure

- **Recall.** How many real overrulings the corpus contains that we never
  extracted is not measured here and cannot be — a claim never made leaves no
  trace to sample.
- **Accuracy of the reporter annotations themselves.** They are probably very
  accurate; a law-report editor writes them deliberately. This document is about
  *provenance and licence*, not about whether the editor was right.
- **`followed` / `distinguished` at scale.** 15,776 of the 16,001 edges are these
  two, they drive no badge, and only the 137 adverse edges were hand-read.
- **Courts other than the Supreme Court.** All 137 driving edges are Supreme
  Court. High Court treatment is 0 of the canonical population.

---

## 11 · Reproduce

```
node --env-file=.env services/ingest/.n2c-p1-provenance.mjs   # §2, §3 screen, all 16,001
node --env-file=.env services/ingest/.n2c-p1-lawmoved.mjs     # §4 per-judgment, hand map applied
```

Artifacts: `treatment-provenance-full.json` · `treatment-provenance-spans.json`
(every span, so the hand adjudication is checkable) · `law-moved-provenance.json`.

All timings **LOCAL_CONTENDED**; 16,001 spans read in 8.6 s with 2–13 concurrent
PostgreSQL queries.
