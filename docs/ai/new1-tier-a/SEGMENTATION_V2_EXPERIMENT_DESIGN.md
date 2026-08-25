# SEGMENTATION V2 — BOUNDED PINPOINT / SOURCE-OFFSET EXPERIMENT (DESIGN)

**Deliverable:** R8.1 §6.8 — *"After the current experiment, run a versioned
segmentation-V2 pinpoint/source-offset experiment before any full passage build."*
**Lane:** NEW1 · **Date:** 26 Aug 2026 · **Status:** `DESIGN ONLY — NOT RUN`

**Gate:** nothing in this file executes, and `chunk.ts` is not touched, until the 100k
tranche is closed and `HEAD_VS_PASSAGE_DECISION_V2` is published. `chunk.ts` is the
segmentation identity of **both** `judgment_chunks` and the tranche; changing it earlier
moves `chunk.ts/defaults@F_ALL_CHUNKS` underneath the artifact the G3 gate rests on.

---

## 1. What is already proven, so the experiment does not re-prove it

From bus 1224, measured over 78,732 real passages and 26,000 documents:

- `char_offset = -1` means *the span could not be verified*, which is the honest
  behaviour. At passage level it is 2.95% and **that is the wrong number**, because the
  loss is document-shaped: **1,357 documents lose every span** and can therefore never
  supply a pinpoint citation.
- The trigger is exact and lives in a 320-character window. A document just over
  `maxChars` with no paragraph boundary is split mid-paragraph by `splitLongParagraph`;
  the tail falls under `minChars` and is merged back as `` `${last.text}\n\n${buffer.text}` ``
  — **a canonical `\n\n` that was never in the source**. `fullText.slice(offset, offset +
  bodyLength) === body.text` then correctly fails and the offset becomes `-1`.
- Partitioned with **no false positives**: in the 2401–2720 band, 1,369 of 2,977 documents
  (45.99%) lose every span; outside the band, **0 of 23,223 (0.00%)**.
- `TABLESAMPLE SYSTEM (0.05)`, n = 9,404: **6.14% of the corpus is in the band** → ≈2.8%
  of the corpus, on the order of **500,000 documents**, can never supply a pinpoint cite.

Independent confirmation on a different population, measured 26 Aug on the live tranche:
**6,376 of 251,664 passages (2.53%) carry `char_offset = -1`** — the same order, on
documents drawn by a different rule.

**The mechanism is not in question.** The one-line fix is known:

```js
// instead of:  `${last.text}\n\n${buffer.text}`
fullText.slice(last.start, buffer.start + buffer.text.length)
```

The chunk text then **is** the real span by construction, and verification cannot fail
for this reason.

**So this experiment is not asking "is the bug real". It asks the two questions that
decide whether the fix may ship:**

> **Q1 — does the fix recover the lost spans?**
> **Q2 — does it change anything for documents that were never affected?**

Q2 is the one that matters. A segmentation change that silently re-cuts the other 94% of
the corpus would invalidate every passage number this round produced.

---

## 2. Preregistered predictions

Written before the run, so the result can falsify them.

| # | prediction | falsified if |
|---|---|---|
| P1 | In-band documents: span verification rises from ~54% to **100%** | any in-band document still has `char_offset = -1` from the merge path |
| P2 | Out-of-band documents: **byte-identical** chunk boundaries and text, V1 vs V2 | any out-of-band document differs in chunk count, text, offset or body length |
| P3 | In-band chunk **count** is unchanged; only the recorded text and offset change | chunk count moves for any document |
| P4 | Embeddings for out-of-band passages are **bit-identical** | any cosine ≠ 1.0 on an out-of-band passage |
| P5 | In-band embeddings change **slightly** — the merged text loses a `\n\n` it never had | median cosine to V1 < 0.98, which would mean the text changed more than a separator |

P2 and P4 are the safety properties. **If either fails, the fix does not ship as a
one-line change** and becomes a full re-segmentation decision with its own cost.

---

## 3. Design

### 3.1 Bounded, and bounded on purpose
No corpus pass. No re-embedding of the tranche. Sampling frame:

| stratum | n | why |
|---|---:|---|
| in-band, all spans lost (2401–2720 chars, 1 passage, no paragraph structure) | 400 | the population the fix targets |
| in-band, spans verified | 400 | the fix must not break the half that already worked |
| just outside the band, both sides (2300–2400, 2721–2820) | 400 | boundary behaviour |
| far outside, stratified by length decile | 800 | P2/P4 at scale |
| **total** | **2,000** | |

Drawn by seeded hash over `judgments.id`, recorded as a frame digest before any code
changes — the same commit-then-draw discipline the tranche selector uses, for the same
reason.

### 3.2 Versioned, never in place
V2 is a **new segmentation identity**, not an edit to an existing one:

```
chunk.ts/defaults@F_ALL_CHUNKS       -> V1, frozen, what the tranche was built with
chunk.ts/v2-span@F_ALL_CHUNKS        -> V2
```

Both run in the same process over the same 2,000 documents; nothing is written to
`judgment_chunks` or `new1_tranche_passages`. Output is a single comparison artifact,
`SEGMENTATION_V2_COMPARISON.json`, carrying per-document V1/V2 chunk arrays so Fifth can
re-score it without re-running anything.

### 3.3 The comparison is exact, not statistical
For every document, per chunk: `index`, `char_offset`, `body_length`, `text` SHA-256.
Equality is byte equality. **A "97% similar" answer is a failure** — P2 asserts identity,
and identity is either true or it is not.

Embeddings (P4/P5) on a 200-document subsample only, since it needs the GPU: V1 and V2
text through the same sidecar, cosine per passage, reported as a distribution and not a
mean.

### 3.4 Determinism
Every document segmented twice under each version. Any disagreement is a stop, not a
footnote — the V1 condenser work (`LONG_FACT_VALIDATION_V2` §4d) established that
determinism gets asserted far more often than it gets measured.

---

## 4. What the result licenses

| outcome | consequence |
|---|---|
| P1–P5 all hold | the one-line fix is a **safe versioned bump**; ~500,000 documents regain pinpoint capability; re-segmentation is needed only for in-band documents |
| P1 holds, P2/P4 fail | **not** a one-line fix. It becomes a full re-segmentation with a corpus-wide re-embed cost, and the §6 storage arithmetic applies |
| P1 fails | the mechanism is incompletely understood; back to diagnosis, no code change |

**None of these outcomes is a decision to run a full passage build.** That needs NEW1
evidence **and** Fifth approval **and** founder approval if compute or storage expands
materially — and `NEW1_PROCESS_RESOURCE_REPORT_R8_1` §6 already shows the full build does
not fit on this box at current per-passage cost.

---

## 5. Wire impact — the answer LCC asked for in bus 1232

LCC's question was whether fixing this changes `exactSpan` / `operativeParagraphVerified`
on the wire, because an advocate reads those as *"we can point you at the paragraph."*

**Answer, conditional on P1–P5 holding: the field shapes do not change; their
availability does.**

- No new field, no removed field, no changed type.
- Documents that currently return `exactSpan: null` / `operativeParagraphVerified: false`
  **because of this defect** would begin returning a real span. That is a
  *false-negative repair*, not a contract change.
- **A client must not read the change as retroactive.** Rows segmented under V1 keep
  `char_offset = -1` until they are re-segmented, so the two populations coexist and the
  segmentation version is the only thing that distinguishes them. The version is already
  recorded per row, which is what makes a mixed table readable rather than ambiguous.
- **Nothing about this makes an unverified span verified.** `-1` still means *we could not
  verify a position*; V2 removes one **cause** of that state, not the state.

If P2 or P4 fails, this section is void and the wire question reopens as part of a full
re-segmentation.

---

## 6. Explicitly out of scope

- Changing `maxChars`, `minChars` or any other segmentation parameter. The experiment
  isolates **one** cause; a parameter change would confound it.
- Re-segmenting `judgment_chunks`. Production's dense path reads it, and changing it
  mid-round is the exact failure the tranche's own table exists to avoid.
- Re-embedding the tranche. It is frozen evidence for G2/G3.
- Any claim about the ~500,000-document figure beyond its measured basis: a
  `TABLESAMPLE SYSTEM (0.05)` band rate of 6.14% times a measured 45.99% in-band loss.
  It is a projection with a stated frame, not a count.
