# RETRIEVAL_EVIDENCE_CONTRACT_V1

**Owner:** NEW1 · **Consumer:** LCC (enforces proposition→evidence linkage) · **Date:** 25 Aug 2026
**Mandate:** R7 §9 NEW1-P0 — *"Do not let generation receive 'judgment ID + vague similarity' as sufficient support."*
**Status:** CONTRACT FROZEN · four fields BLOCKED on named owners, and blocked is written into the wire

---

## 0. The rule this exists to make mechanical

A generated sentence about the law is only as good as the span it rests on. Today a
semantic result can reach generation as *"judgment abc-123, similarity 0.83"*, and
nothing downstream can tell whether that number came from a paragraph the court wrote,
a headnote a reporter wrote, or 2,600 characters of OCR sludge.

This contract says: **a candidate that cannot name its span is not evidence.** It may
still be a search result — an advocate searching by citation must still find the case
whose body is damaged — but it may not be handed to generation as support.

---

## 1. The evidence object

Every semantic result candidate offered to generation MUST carry all fifteen fields.
A missing field is a contract violation, not a default.

| # | field | state today | source of truth |
| --- | --- | --- | --- |
| 1 | `judgmentId` | **LIVE** | `RetrievedJudgment.judgmentId` |
| 2 | `passageId` | **BLOCKED — NEW1** | composite PK of `judgment_chunks` / `new1_tranche_passages`; in the table, not on the wire |
| 3 | `exactSpan` | **LIVE** | `RetrievedJudgment.exactSpan` — literal span, byte-identical, never approximated |
| 4 | `operativeParagraph` | **LIVE** | cleaned paragraph containing the span |
| 5 | `operativeParagraphNumber` | **LIVE** | the number the COURT printed. Null is honest and common |
| 6 | `operativeParagraphVerified` | **LIVE** | true = located from a verified `char_offset`; false = fuzzy probe |
| 7 | `passageRole` | **BLOCKED — NEW2** | `PASSAGE_SAFETY_ROLE_CONTRACT_V1` (R7 §10) |
| 8 | `bodyText.state` | **LIVE** | `body-text-safety.ts` |
| 9 | `bodyText.grade` | **LIVE** | how well damage is *proven*. Never pooled with state |
| 10 | `bodyText.evidenceWithheld` | **LIVE** | true = passage fields empty by REFUSAL, not by absence |
| 11 | `identityState` | **BLOCKED — NEW2** | `DECISION_IDENTITY_CONTRACT_V1` (§7.5) |
| 12 | `dateQuality` | **BLOCKED — NEW2** | `LEGAL_TIME_DATA_CONTRACT_V1` (§7.7) |
| 13 | `currentness` | **LIVE** | read live at render, never cached |
| 14 | `relevanceEvidence` | **PARTIAL — NEW1** | ranks exist; the object does not |
| 15 | `releaseId` | **BLOCKED — LCC** | `LEGAL_INTELLIGENCE_RELEASE_MANIFEST_V1` |

Ten of fifteen are already live in `services/api/src/search/retrieve.ts`. Worth stating
plainly: this contract is mostly a **naming and enforcement** exercise over fields
production already computes, not a build.

### The four blocked fields are emitted, not omitted

A blocked field ships as the literal string `NOT_MEASURED` — never `null`, never
absent, never a cheerful default.

`null` and "we have not looked" are different claims, and this project has already paid
for confusing them: 94.1% of Tier A passed an admission check on a NULL, and the
eligibility boolean reads true for 90.68% of the corpus on the strength of nothing
having looked. A field that says `NOT_MEASURED` cannot be silently read as benign.

**Consequence, and it is the point:** while `passageRole` is `NOT_MEASURED`, generation
may not claim a passage is the court's *holding*. It may quote the span and attribute
it to the judgment. It may not characterise it.

---

## 2. Why `passageId` is a NEW1 blocker and not a nicety

`exactSpan` gives the span. It does not give a stable **name** for the span.

Without a passage id there is no key linking a generated proposition back to the unit
that supported it, so LCC's proposition→evidence enforcement has nothing to enforce
*against* — it can only check that a judgment was cited, which is the weak claim this
contract exists to replace. Two different paragraphs of the same judgment supporting
two different propositions are indistinguishable.

`{judgmentId, chunkIndex}` is already the primary key of both `judgment_chunks` and
`new1_tranche_passages`. The work is exposing it on the wire and pinning it to a
segmentation version, because chunk index 7 under one segmentation is not chunk index 7
under another:

```
passageId = { judgmentId, chunkIndex, segmentation }
```

`segmentation` is already stored per row in `new1_tranche_passages`
(`chunk.ts/defaults@F_ALL_CHUNKS`) precisely so a later reader can tell whether two
passages were produced by the same rule — a table-level note does not survive a re-run.

---

## 3. `relevanceEvidence` — and the number that must never ship bare

```
relevanceEvidence: {
  arm:            'dense' | 'sparse' | 'structured' | 'fusion'
  rank:           int          // position within that arm, 1-based
  score:          number|null  // raw arm score; NULL when the arm has no meaningful scalar
  scoreKind:      'cosine' | 'bm25' | 'rrf' | 'none'
  annParams:      { efSearch: int, candidateDepth: int } | null
  exactAgreement: 'AGREES' | 'DIFFERS' | 'NOT_MEASURED'
}
```

Two rules, both from measured failures on this project:

**`scoreKind` is mandatory, and RRF is not a similarity.** Reciprocal rank fusion
produces `1/(k+rank)` — a number that looks like a confidence and is not one. Shipping
it as `score` with no `scoreKind` invites exactly the misreading R7 §7.1 forbids when it
says *array length is never confidence*.

**`annParams` must travel with the score or the score is not comparable.** `ef_search`
is 40 in NEW1's probe harness and 200 in production `retrieve.ts`. A recall number taken
at 40 and quoted as production is wrong, and it has nearly been quoted that way here.
Carrying the parameter makes the mistake impossible rather than merely forbidden.

---

## 4. Rules on the contract, not just its shape

1. **Ordering is not evidence.** Rank 1 of a degraded arm is not better-supported than
   rank 4 of a healthy one. The two contracts operate at different levels and BOTH must
   pass:

   | | decides | published as |
   | --- | --- | --- |
   | LCC `retrievalOutcome` | may this **set** be used at all | `docs/ops/lcc/r7/RETRIEVAL_OUTCOME_CONTRACT_V1.md`, commit `241ad20` |
   | NEW1 evidence object | may this **individual candidate** support a claim | this file |

   Concretely: `retrievalOutcome.safeForGeneration === false` ends the question — no
   candidate in that set may be used however good its span. When it is `true`, each
   candidate must still satisfy this contract on its own. A `coverage_unknown` set with
   five beautifully-spanned passages is still `coverage_unknown`.

2. **`evidenceWithheld: true` means unusable for generation, still valid as a search
   result.** A damaged body is no evidence against `neutral_citation`, `case_title` or
   `case_number`. The advocate searching by citation still finds the case; the model
   does not get to quote from it.

3. **`operativeParagraphVerified: false` is provenance, not a quality gate.** A fuzzy
   probe can match the wrong occurrence of a repeated phrase; an exact span cannot. Both
   can be correct. Generation may cite a fuzzy-located paragraph, but a pinpoint claim
   of the form *"see paragraph 22"* requires `true`.

4. **Currentness is read live on every surface.** `overruledStatus` may never be cached
   into an evidence object that outlives the request. Verification is permanent; good law
   is not. Stale-overruled threshold is zero.

5. **A forced-gold document is still evidence, and still an END_TO_END miss.** The two
   are unrelated: `forced` describes how the document entered the index, not whether the
   span supports the sentence.

---

## 5. Worked example — what production emits today

```json
{
  "judgmentId": "091590b9-5556-4404-be37-6e8a4e93744d",
  "passageId": "NOT_MEASURED",
  "exactSpan": { "text": "the police officer cannot embark upon an enquiry as to whether the information", "charOffset": 48213, "charLength": 412 },
  "operativeParagraphNumber": 111,
  "operativeParagraphVerified": true,
  "passageRole": "NOT_MEASURED",
  "bodyText": { "state": "TEXT_UNKNOWN", "grade": "NONE", "evidenceWithheld": false },
  "identityState": "NOT_MEASURED",
  "dateQuality": "NOT_MEASURED",
  "currentness": { "overruledStatus": "none", "treatmentAttribution": "UNKNOWN", "precedentialEffect": "BINDING", "canAddToMatter": true },
  "relevanceEvidence": { "arm": "dense", "rank": 1, "score": 0.83, "scoreKind": "cosine", "annParams": { "efSearch": 200, "candidateDepth": 200 }, "exactAgreement": "NOT_MEASURED" },
  "releaseId": "NOT_MEASURED"
}
```

Read that honestly: **five `NOT_MEASURED` in one object.** This candidate may be shown
to an advocate as a search result and may be quoted with attribution. It may **not** be
used to assert that the passage is the court's holding, that the judgment is uniquely
identified, or that its date is reliable enough to drive a "later authority" claim.
That is the contract doing its job on day one rather than after an incident.

`bodyText.state: TEXT_UNKNOWN` on a Supreme Court authority is not a defect either — it
is the corpus telling the truth. No writer in this repository has ever emitted `clean`,
so `TEXT_UNKNOWN` is the correct state for most of the corpus, and a field named
`bodyTextSafe` would have lied about every one of them.

---

## 6. What NEW1 owes, and what it is waiting for

| item | owner | state |
| --- | --- | --- |
| `passageId` on the wire, pinned to `segmentation` | **NEW1** | designed here; implementation follows the 100k validation |
| `relevanceEvidence` object incl. `annParams`, `exactAgreement` | **NEW1** | `exactAgreement` is populated by the ANN-vs-exact sweep in `PASSAGE_100K_VALIDATION_V1` |
| `passageRole` | NEW2 | `PASSAGE_SAFETY_ROLE_CONTRACT_V1` |
| `identityState` | NEW2 | `DECISION_IDENTITY_CONTRACT_V1` |
| `dateQuality` | NEW2 | `LEGAL_TIME_DATA_CONTRACT_V1` |
| `releaseId` | LCC | `LEGAL_INTELLIGENCE_RELEASE_MANIFEST_V1` |
| proposition→evidence enforcement | LCC | consumes this contract |

**None of those four blocks this contract from shipping.** They block the *claims*
generation may make, which is precisely the safety property wanted: the system degrades
by saying less, never by asserting more than it can evidence.

---

## 7. Caveats, stated rather than buried

- **This contract has not been enforced end-to-end.** It is grounded in `retrieve.ts`
  as read on HEAD `0762d281` and in the live shape of `judgment_chunks` /
  `new1_tranche_passages`, but no request has yet been rejected for violating it.
  `OBSERVED_BY_CODE`, not `OBSERVED_BY_EXECUTION`.
- **`exactSpan` null rate: MEASURED, and it has a single deterministic cause.** See §8.
- **The `passageRole` blocker is the load-bearing one.** Without it the system cannot
  distinguish a holding from a submission the court merely recorded, and *"the Court
  held"* applied to counsel's argument is a fabrication with a real span behind it — the
  most dangerous failure this contract still permits.

---

## 8. The verified-span ceiling — measured, and it is one narrow chunker bug

`NOT_MEASURED` in the first draft of this file. Now measured on 78,732 real tranche
passages over 26,000 documents:

```
passages with a verified span   76,407 of 78,732   97.05%
passages with char_offset = -1   2,325             2.95%
```

97% sounds fine. It is not the useful number, because **the loss is document-shaped,
not passage-shaped**:

```
documents with every span verified   23,675
documents partly verified                968
documents with NO span verified        1,357   <- can never be citation-grade evidence
```

### The cause, narrowed to a 320-character window

Every one of the 1,357 documents has **exactly 1.00 passages** and none has any
blank-line paragraph structure. Their length distribution gives the mechanism away:

```
                    docs    min    median    max     over maxChars
NOT verified       1,369   2,401    2,509   2,714    1,369 of 1,369  (100%)
verified           4,367   2,000    2,195   2,615        2 of 4,367
```

`min = 2401` against `chunk.ts` `maxChars = 2400`, and `max = 2714` against
`maxChars + minChars = 2720`. The trigger is exact:

1. a document just over `maxChars` with no paragraph boundary to split on
2. `splitLongParagraph` splits it mid-paragraph; the tail is under `minChars` (320)
3. the tail merges back as `` `${last.text}

${buffer.text}` `` — a canonical `

`
   **that was never in the source**, because the split was mid-paragraph
4. `fullText.slice(offset, offset + bodyLength) === body.text` correctly fails
5. `offset` becomes `-1`

Confirmed by partition, with no false positives anywhere:

```
in band 2401-2720   2,977 docs   1,369 lose every span   45.99%
outside the band   23,223 docs       0 lose every span    0.00%
```

**Zero outside the band.** 46% inside it — the other 54% happen to have a paragraph
boundary near the split.

### Scale

A bounded `TABLESAMPLE SYSTEM (0.05)` over `judgments` (n = 9,404) puts **6.14%** of the
corpus in the 2401–2720 band. At the measured 46% loss rate that is **≈2.8% of the
corpus — on the order of 500,000 documents — that can never supply a pinpoint citation**,
for a reason that has nothing to do with the law, the OCR, or the model.

### The fix, and why it is NOT being applied in this sprint

The merge should reconstruct from the source rather than synthesise a separator:

```
// instead of:  `${last.text}

${buffer.text}`
// slice what is actually there:
fullText.slice(last.start, buffer.start + buffer.text.length)
```

Then the chunk text IS the real span by construction and verification cannot fail.

**Deliberately not applied now.** `chunk.ts` defines the segmentation identity of both
`judgment_chunks` and the running 100k passage build. Changing it mid-build would alter
`chunk.ts/defaults@F_ALL_CHUNKS` underneath an eight-hour job and invalidate the tranche
the entire R7 G3 gate rests on. R7 §16's scope-stop rule and the one-experiment rule both
point the same way: record it, hand it over, change it deliberately afterwards with a
segmentation version bump and a re-chunk.

`OBSERVED_BY_LIVE_DB` and `OBSERVED_BY_CODE`. The verification logic in `chunk.ts` is
**correct and is not the bug** — it is the only reason this was findable at all. A
chunker that trusted its own arithmetic would have emitted 2,325 confidently wrong spans
instead of 2,325 honest nulls.
