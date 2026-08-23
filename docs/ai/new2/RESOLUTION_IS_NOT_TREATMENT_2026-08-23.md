# RESOLUTION IS NOT TREATMENT — the contract, and TREATMENT_ENRICHMENT_CONTRACT_V1

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Consumers:** LCC (resolver
COMPONENT V0, `propagate-treatment.ts`), NEW1 (retrieval), RCC (rendering)

Founder instruction, binding: *a citation edge saying A CITES B does not
establish FOLLOWED, RELIED_ON, DISTINGUISHED, DOUBTED, OVERRULED, SET_ASIDE or
APPROVED. Citation identity resolution and treatment/currentness are separate
systems. Do not increase LawMind's currentness coverage merely because resolver
coverage increases.*

This document makes that mechanical rather than remembered, and reports what the
treatment claims we already hold actually rest on.

---

## 1 · The pipeline, and where each state is allowed to change

```
REFERENCE EXTRACTED        citation_text is printed in the citing judgment
        ↓
TARGET RESOLVED            cited_judgment_id points at a held judgment
        ↓
SEMANTIC RELATIONSHIP      UNKNOWN — and it stays UNKNOWN
        ↓
VERIFIED TREATMENT         only on independent evidence, per §4
```

**Nothing on the left may write anything on the right.** Concretely:

| a resolver may write | a resolver may NEVER write |
| --- | --- |
| `cited_judgment_id` | `relationship` |
| its own confidence / candidate count | `evidence` |
| `TARGET_NOT_HELD`, `AMBIGUOUS`, `REFUSED` | `judgments.overruled_status` |

### Already enforced, verified in code rather than asserted

- **LCC's resolver v0** returns `relationship: 'UNKNOWN'` and
  `verifiedTreatmentEligible: false` on **every** result including unique ones,
  and has no `--apply` flag (bus 1055 §2). Those are values a consumer must
  handle, not defaults it can forget.
- **This lane's writer** never reads the resolution when deciding treatment.
  `detectTreatment(text, end)` in
  [citations.ts:283](services/ingest/src/citations.ts#L283) takes the citing
  judgment's own text and an offset, and returns `cites` unless it finds an
  explicit annotation. `cited_judgment_id` is not one of its arguments — the
  separation is in the function signature, which is the only place it cannot rot.
- **`propagate-treatment.ts`** consumes only `relationship IN ('overruled',
  'overruled_in_part', 'doubted')` — it reads the treatment, never the pin.

### The one number that would prove a breach

`count(*) WHERE cited_judgment_id IS NOT NULL AND relationship <> 'cites'`
divided by `count(*) WHERE cited_judgment_id IS NOT NULL` must not move when a
resolver backfills. Today: **10,754 / 231,412 = 4.647%**. If a backfill raises
the numerator, something read a pin as a treatment.

---

## 2 · What our existing treatment claims actually rest on

16,001 edges carry a treatment; 10,754 of them are also pinned.

| relationship | rows | pinned |
| --- | ---: | ---: |
| followed | 14,024 | 9,442 |
| distinguished | 1,752 | 1,156 |
| overruled | 117 | 97 |
| approved | 61 | 19 |
| doubted | 24 | 21 |
| overruled_in_part | 23 | 19 |

### 2.1 None of it is the court reasoning. 56% of it is a law reporter's headnote.

400 treated edges, classified by what surrounds the citation:

| where the annotation sits | share |
| --- | ---: |
| reporter headnote apparatus (`SUPREME COURT REPORTS`, `[Para 20][591-D-F]`) | 35.75% |
| reporter "Case Law Reference" table (`relied on Para 51`) | 20.25% |
| **court reasoning** (`we are of the considered view…`, `we are bound by…`) | **0.00%** |
| unclassified | 44.00% |

A hand read of the unclassified sample found most of it is also headnote
material without those exact markers, plus a minority of genuine court prose.
**Zero of 400 landed in court reasoning.** A separate mechanical speaker screen
over 120 edges agrees: court voice 4.17%, counsel voice 5.00%, **no speaker
signal at all 90.83%**.

The reason is structural, not a defect: `— overruled.` is the notation a law
report uses to close a Case Law Cited entry. Courts do not write it.

### 2.2 That makes it a LICENCE question as well as a quality one — founder call

`CLAUDE.md` §6: *"What IS protected is a reporter's copy-edited version —
headnotes, editorial numbering (Eastern Book Company v. D.B. Modak) — so use raw
court text and never a law report's edition of it."*

The annotations above are exactly that editorial apparatus, read off SCR volumes
in the corpus. **This is not a decision this lane may take.** Filed in
`docs/FOUNDER_QUEUE.md` as `FQ-TREATMENT-HEADNOTE-PROVENANCE`. Nothing was
deleted and no treatment was withdrawn.

### 2.3 One polarity defect, found exactly, and fixed at the writer

`MARKER_RE` opened with `[-–—]\s*`. The hyphen inside **dis-approved** satisfies
it, so the marker matched `approved` and the edge recorded the **opposite** of
what the court did.

| | |
| --- | ---: |
| `approved` rows in the corpus (all read, not sampled) | **61** |
| polarity-inverted | **4 (6.56%)** |
| `overruled` rows (all 117 read) | 0 inverted |
| `doubted` (24), `overruled_in_part` (23) | 0 inverted |
| `distinguished` (400 of 1,752 read) | 0 inverted |

An earlier pass of this measurement reported 8 inversions including one
`overruled`. **That was my own screen, not the data**: my ±220-character window
was wider than the writer's reachable window, so it matched a "disapproved" that
belonged to a neighbouring entry in the same headnote list. Every hit was
re-read with the matched substring printed, and the four survivors are the
hyphenated form. `detectTreatment` already guards neighbouring entries with a
`\sv\.?s?\.?\s` boundary; that guard was working.

**Fixed:** `(?<![A-Za-z])[-–—]` — a closing annotation dash follows a citation,
which ends in a digit or a bracket, never a letter. Pinned by two tests in
`citations.test.ts`, one for the four real corpus strings and one proving the
legitimate `221- approved` form still reads.

**The four rows are NOT corrected in the database.** `approved` is not in
`propagate-treatment.ts`'s `IN ('overruled','overruled_in_part','doubted')`, so
no `judgments.overruled_status` and no LAW MOVED badge was ever driven by them.
Ids in `docs/ai/new2/treatment-polarity-bad-rows.json` — LCC's call, since a
re-scan is their pass.

### 2.4 Parallel reporter forms double-count treatment

11.56% of resolved edges are a second citation form naming a pair already
present (§1.3 of `CITATION_TABLE_SEMANTICS_2026-08-23.md`). *Rajeev Kumar Gupta*
appears as both `(2016) 13 SCC 153` and `[2016] 3 SCR 407`, each carrying
`– relied on`. Any treatment count must be `DISTINCT (citing, cited)`.

---

## 3 · TREATMENT_ENRICHMENT_CONTRACT_V1

**No massive model job. Nothing launched.** This is the design a later run must
satisfy, with precision measured first.

### 3.1 Evidence classes, ranked, and what each may support

| evidence | may support | may NOT support |
| --- | --- | --- |
| `COURT_REASONING_EXPLICIT` — the citing court's own sentence naming the authority and the act ("we are bound by X", "X is overruled") | any treatment, incl. adverse | — |
| `REPORTER_EDITORIAL_ANNOTATION` — a Case Law Cited / headnote entry | a **candidate** only, never a rendered adverse treatment, and blocked pending §2.2 | `overruled_status` |
| `COUNSEL_SUBMISSION` — "learned counsel placed reliance on X" | **nothing**. What counsel urged is not what the court held. | any treatment |
| `PROXIMITY_ONLY` — a verb near a citation with no speaker signal | **nothing** | any treatment |
| `NO_EVIDENCE` — a resolved edge | **nothing** | any treatment |

90.83% of the current treated population is `PROXIMITY_ONLY` or weaker by the
speaker screen. That is the size of the problem, stated before any model is
asked to solve it.

### 3.2 The required fields, so a claim can be withdrawn later

```
treatment_claim
  citing_judgment_id
  cited_judgment_id            -- identity, resolved separately
  treatment                    -- FOLLOWED | DISTINGUISHED | ... | UNKNOWN
  evidence_class               -- the table above
  evidence_span                -- the exact characters relied on
  speaker                      -- COURT | COUNSEL | REPORTER_EDITOR | UNKNOWN
  polarity_checked             -- boolean; the dis-approved class
  method                       -- writer id + version, e.g. detect-treatment-v1.1
  decided_at
  supersedes                   -- previous claim id, never overwritten in place
```

`treatment` and `evidence_class` are separate columns on purpose. A single enum
that means both is how "we found the word overruled" becomes "this judgment is
overruled".

### 3.3 The order the work must happen in

1. **Precision before coverage.** Measure on a held-out, hand-adjudicated sample
   before any corpus pass. A currentness product is safety-critical in both
   directions: a false adverse treatment defames good law, a false "still good"
   sends an advocate to court on a dead authority.
2. **Bound the population first.** Start from `COURT_REASONING_EXPLICIT` only.
   That class is 0.00% of what we hold today, which means the first job is
   *finding* it, not classifying it.
3. **No treatment claim is created by resolution.** §1.
4. **Adverse treatments are adjudicated, not inferred.** `overruled` and
   `set_aside` reach `judgments.overruled_status`, which drives LAW MOVED at a
   stale rate threshold of zero.

### 3.4 Gates before V2 may run at scale

- precision on a held-out adjudicated sample, per class, reported with an
  interval, and **a stated prior** — a per-class accuracy is not precision
- a polarity test in the suite for every new verb added
- the §2.2 licence answer, because the richest available evidence is the one we
  may not be allowed to use
- an explicit refusal rate: what share the method declines to classify. A method
  that classifies everything has not been shown to be safe, it has been shown to
  be confident.

---

## 4 · Reproduce

```
node --env-file=.env services/ingest/.n2b-p12-treatment.mjs     # coverage + speaker screen
node --env-file=.env services/ingest/.n2b-p12-provenance.mjs    # where the evidence sits
node --env-file=.env services/ingest/.n2b-p12-verify.mjs        # every polarity hit, matched text printed
node --env-file=.env services/ingest/.n2b-p12-badrows.mjs       # the 4 rows, by id
```

Artifacts: `treatment-evidence-study.json` · `treatment-provenance.json` ·
`treatment-polarity.json` · `treatment-polarity-bad-rows.json`.
