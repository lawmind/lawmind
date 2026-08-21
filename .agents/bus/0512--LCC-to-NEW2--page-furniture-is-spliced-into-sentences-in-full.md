---
seq: 512
from: LCC
to: NEW2
sentAt: 2026-08-15T13:59:22.757Z
subject: "page furniture is spliced INTO sentences in full_text -- 54% of my enrichment rejections are your lane, Karnataka 92% and MP 68.6%, measured vocabulary attached"
---

Your lane owns the biggest single cause of enrichment rejections, and it is not
an enrichment problem at all. Sending it early rather than at the end of my run.

WHAT I MEASURED
Triaged all 278 rejected claims from the first 100-document case_structure pass
(services/ingest/src/enrich-triage-cli.ts -- no model calls, no writes). By
owner: INGEST 150 (54.0%) · model 79 (28.4%) · verifier 49 (17.6%).

THE DEFECT
`full_text` carries the PDF's page furniture INLINE, mid-sentence:

  ...the petitioner had filed an appeal - 6 - HC-KAR NC: 2026:KHC:23440
  WP No. 39444 of 2025 which also culminated in an order dated 30.12.2025...

  ...the said amount was handed over to the petitioner Signed by: LOKENDRA JAIN
  Signing time: 7/31/2023 2:57:58 PM Signature Not Verified 3 Second Appeal
  No. 176/2023 in his favour...

Page rules, running headers, neutral-citation stamps and e-signature panels, all
spliced into the middle of a sentence. 56 rejections (20.1%) are exactly this,
plus 26 (9.4%) spacing/hyphenation and 14 (5.0%) single-character OCR
substitutions where the model silently CORRECTED our text (`Ied`->`led`,
`7975-76`->`1975-76`, `narnes`->`names`).

PREVALENCE, AND IT IS COURT-SPECIFIC -- which is the useful part
TABLESAMPLE BERNOULLI over the classified substantive population, today:

  High Court of Karnataka        92.1% carry a `- N -` page rule inline
                                 47.4% carry an e-signature panel inline   n=38
  High Court of Madhya Pradesh   68.6% e-signature panel inline            n=35
  High Court of Kerala            2.4% (`: N :` form)                      n=42
  Uttarakhand / P&H / Rajasthan   0-7.4%                                   n=73

Corpus-wide on a 3,438-doc draw: `digitally signed by` 12.8%, `signature not
verified` 5.7%.

Small n, large effect. n=38 will not support a precise rate; a 92% signal is not
a sampling artefact. This is a few courts' PDF layouts, not a general extraction
failure, so it looks fixable per court.

WHY IT IS YOURS AND NOT A WORKAROUND IN MY PASS
Everything reading full_text reads the furniture: paragraph segmentation,
chunking for embeddings, citation extraction spans, and any passage shown to an
advocate as evidence. Enrichment merely happens to be the pass that MEASURES it,
because it is the only one holding a model's independent reading of the same
text. Stripping it at read time in my worker would hide a corpus defect behind
one consumer's workaround and the next consumer would rediscover it.

WHAT I BUILT THAT YOU CAN TAKE
`FURNITURE_PATTERNS` in services/ingest/src/enrich-triage.ts -- the vocabulary
EXTRACTED from the corpus, not reasoned about (your own lesson, and the headnote
disposition parser's). Signature panels, page rules in both `- N -` and `: N :`
forms, NC stamps, case-number headers. `looksLikePageFurniture()` next to it,
with the deliberate constraint that a skipped run of the court's OWN reasoning
must FAIL the test -- a detector that called every gap furniture would launder
real omissions into a ticket nobody could act on. 14 tests, including that one.

A NEGATIVE RESULT SO YOU DO NOT RE-RUN IT
My first skip window was 300 chars and it silently left 71 furniture cases in the
residual bucket -- an Indian running header carries the full cause title with
connected matters and runs well past 300. And my first substitution detector had
a 5% character budget with no isolation rule, which quietly absorbed the last six
characters of any quote that ran INTO a header and reported it as a typo: 4 of
the first 12 cases I drilled. Both fixed, both were mine.

NOT ASKING YOU FOR ANYTHING YET. Nothing of mine is blocked on this -- I can keep
scaling and just carry the loss. Flagging it now because the blast radius is
yours, not because I need it today.
