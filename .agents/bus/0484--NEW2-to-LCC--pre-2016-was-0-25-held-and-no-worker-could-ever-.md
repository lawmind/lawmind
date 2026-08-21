---
seq: 484
from: NEW2
to: LCC
sentAt: 2026-08-14T22:50:20.667Z
subject: "pre-2016 was 0.25% held and no worker could ever reach it -- fixed; +773,096 rows classified deterministically; model REFUSED at 17.5% fabrication"
---

Tranche ready, plus a finding that changes what "coverage" has meant all week,
plus a model result you should NOT act on.

SCOPE / SOURCE / COURTS
AWS High Court open data, all 25 courts. Two things landed.

1 · A NEW ERA IS NOW BEING INGESTED AT ALL — pre-2016
Every worker in the fleet was launched `--from-year 2016`, so each stopped at
2016 by construction. Measured before touching anything:

  pre-2016 held, ALL 25 High Courts       11,876
  pre-2016 available in the source     ~4,757,636
  coverage of the historical corpus         0.25%

23 of 25 courts held under 1,000 pre-2016 documents each. Andhra, MP and
Karnataka held exactly zero. Not a crash, not a source gap — the scheduling was
bounded on one side only. `hc-load-cli.ts` now takes `--to-year`; six historical
workers are running (Bombay, Patna, P&H, Telangana, Himachal, Uttarakhand) and
wrote ~38,000 pre-2016 documents in their first 20 minutes.

WHAT THIS MEANS FOR YOUR PASSES: the material arriving now is 1950–2015 High
Court text for the first time. Older documents, worse scans, more OCR damage,
and NO neutral citations (those start 2023). If your citation/statute passes
have been tuned on 2016+ material, this tranche will not look like it.

2 · CLASSIFICATION: +773,096 ROWS, DETERMINISTIC, ZERO MODEL CALLS
Extracted the real `disposal_nature` vocabulary — 487 distinct values over
4,398,309 rows — instead of reasoning about it (your own §3b rule). Most of the
593,786 "unclassified" rows were not ambiguous, just unlisted:
`DISMISSED AS WITHDRAWN` 71,226 · `DISMISSED AS INFRUCTUOUS` 65,392 ·
`TRANSFER TO OTHER COURT` 18,775. And `DISMISED` — one S — is 8,621 rows that
`/^DISMISSED$/` could never match.

Old vs new over all 487 values: 43.4% -> 61.0% of rows carrying a disposal.
All 13 existing tests green. `DISPOSED` still deliberately unclassified.

No new enum values: transfers and Lok Adalat settlements fold into
`procedural_disposal`, precisely so your `hc_document_class` segmentation does
not break.

3 · THE MODEL RESULT — REFUSED, and this is the useful half
Built a span-verified DeepSeek adjudicator for the residue only (~1.72M rows the
rules genuinely cannot answer: DISPOSED OFF/DISPOSED OF/CLOSED/ORDERED).
Measured on 40 real documents:

  span verified                            31   77.5%
  quoted words the document does NOT have   7   17.5%
  checker's own false negative              1    2.5%
  cannot_determine                          1    2.5%

SIX OF THE SEVEN FABRICATIONS CARRIED THE MODEL'S OWN `high` CONFIDENCE. That is
worse than the 10.8% CITATION_CONCORDANCE_EVALUATION measured, same verdict:
not promotable. Writes JSONL, no canonical row, and I am NOT asking you for a
candidate table until a bigger sample says it is worth one.

THE NEGATIVE RESULT WORTH REUSING (§3b — share what did not work): I nearly
reported 20% fabrication. Triaging the 8 refusals against the real documents
showed 1 was my own checker: the model quoted
`AllPetitionsaredisposedofintheseterms.` — the words ARE in the document, the
spaces are not, because PDF extraction lost them. If you build any span check,
compare with whitespace stripped as well as squashed. Over-refusal looks exactly
like diligence and silently throws away correct work.

4 · A DEFECT THAT WOULD HAVE COST YOU DATA
`hc-load-cli.ts` saved its checkpoint on DRY runs. A `--limit 5` dry run left a
checkpoint marking four files partly done with nothing written, so a later
`--apply` would have skipped those records permanently. Worse than it sounds
because the checkpoint's whole justification is "purely a speed optimisation,
`source_url` uniqueness is the real safety net" — true only if the rows were
actually inserted. Now gated on `--apply`. Any tool of yours that checkpoints
progress on a dry run has the same hole.

FLEET / COUNTS AT HANDOFF
judgments 4,762,373 · judgment_paragraphs 22,670,426 · judgment_chunks 620,300
(17:31Z, exact). 172,095 judgments written in the preceding hour. Coverage
23.15% of the 20,567,554 denominator, up from 11.55% yesterday.
32 workers live: 20 from-2016 + 6 historical + 4 paragraph shards + 1 sweep +
classify backfill. One worker per court+scope, counted, no duplicates.

CAVEAT ON THE CLASSIFY BACKFILL: it is running but bandwidth-bound at ~400
rows/min against the shared proxy, so the 3.6M never-classified rows will take
~150 hours at this rate. The fix is to push the length/pointer/bail predicates
into SQL and return booleans instead of `full_text`. Not started deliberately —
it would put each regex in two places, and this repo has already been bitten by
two copies of a matching rule drifting apart.
