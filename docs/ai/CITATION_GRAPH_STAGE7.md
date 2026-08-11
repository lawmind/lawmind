# CITATION GRAPH — Stage 7, measured against production

**11 August 2026, LCC, Stage 7 of the DATA → RETRIEVAL EXECUTION PROGRAM.**

## 1 · WHAT WAS ALREADY BUILT

`judgment_citations.relationship` already separates CITES from TREATMENT,
with `evidence` (the court's exact printed phrase) on every non-`cites` row —
Stage 7's core structural requirement. Two independent classifiers write
this column: `services/ingest/src/citations.ts`'s `detectTreatment` (used by
`citations-cli.ts`, the initial-extraction pass) and `services/ingest/src/
treatment.ts`'s `readTreatment` (used by `citator-cli.ts`, a later,
more-careful re-classification pass with negation handling). Both had to be
kept consistent for this stage's change.

## 2 · THE REAL FINDING: `approved` vs `affirmed`/`reversed`

Stage 7 names `approves`/`affirms`/`reverses` as distinct graph edges,
currently folded into `followed` or unmodelled
(`docs/ai/DATA_MOAT_PROGRAM.md` §4). A 2,000-row `TABLESAMPLE` survey tested
which are safely extractable:

- **`approved`**: appears in the same `– approved` table-annotation shape as
  `– followed`/`– overruled` **61 times** in the sample, comparable to
  `– followed` itself (84). Real, distinct, deliberately-chosen reporter
  vocabulary — safe to split out because the extractor already anchors the
  match immediately after a resolved citation with a required separator (the
  same guard that makes `followed`/`overruled` safe).
- **`affirmed`/`reversed`: NOT split, and this is a finding, not an
  oversight.** An unanchored full-text search for these words turned up
  real-looking `– affirmed`/`reversed` hits, but reading them showed they
  overwhelmingly describe **the citing judgment's own procedural history**
  ("convicted… Affirmed by High Court", "the High Court… reversed the order
  of the le[arned trial court]") — nothing to do with how this judgment
  treats a cited precedent. Unlike `approved`, these words carry a second,
  very common meaning in Indian judgment prose that a naive keyword pattern
  cannot distinguish from the real signal without much more careful,
  citation-anchored testing than this session ran. **Deferred, not
  abandoned** — the citation-anchor test (does `– affirmed` occur inside the
  existing `readTreatment`/`detectTreatment` window, not just anywhere in
  `full_text`) is the concrete next step, not yet run.

## 3 · WHAT LANDED

- `services/ingest/src/{citations,treatment}.ts`: `Relationship` gains
  `'approved'`, split from the `'followed'` pattern in both classifiers.
- Migration `0039`: `judgment_citations_relationship_check` widened to
  include `approved`.
- **`services/api/src/judgments/treatment.ts` fixed in the same commit as the
  split, not after** — its `counts` object hardcodes relationship keys, and
  this is the *exact* bug class already found once (RCC bus 0035,
  `overruledInPart` silently uncounted): a relationship value present in
  `judgment_citations` but absent from `counts` is a gap `total` hides. Added
  `counts.approved` and ranked it beside `followed` in the treatment-list
  ordering.
- **Reclassified 21 existing rows** — `relationship = 'followed'` rows whose
  stored `evidence` contains "approved" (word-boundary matched; a debugging
  step caught the *exact same* `\y`-inside-a-JS-template-literal defect this
  program has now hit three separate times — `\y` is not a recognised JS
  string escape, so it silently became `yapprovedy` until fixed with `\\y`).
  0 ambiguous (none also contained "followed"/"relied on"). Verified: 14,028
  → 14,007 `followed`, 21 `approved`, total unchanged at 227,478.
- Tests: `citations.test.ts`, `treatment.test.ts` updated; `services/ingest`
  full suite **343/343**.

## 4 · WHAT THIS DOCUMENT DOES NOT DO

- Does not add `affirmed`/`reversed` — §2 names the exact test that would
  justify it, not yet run.
- Does not add a stored `resolution_state` distinguishing ambiguous-refused
  from genuinely-absent at the row level — both extraction-time (resolver)
  and query-time (`StructuredOutcome`'s `ambiguous` kind) already refuse a
  guessed match, which is the safety property that matters; the row-level
  distinction would be schema complexity for a cosmetic gap.
- Does not touch `apps/**`.
