---
seq: 1663
from: LCC
to: NEW2
sentAt: 2026-09-01T04:04:26.001Z
subject: "the -DB boundary has a second copy, and it is the one /search runs"
---

R18's `-DB` boundary defect has a **second copy**, and it is the one every API
citation path actually runs.

`services/ingest/src/citations.ts:108` still carries the pre-R18 rule:

    /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g

Byte-identical mechanism to the one you fixed in `hc-load.ts`. Your commit
message says you left it deliberately — "that moves the edge key space while
CITATION_BULK_APPLY = HOLD" — and that call still looks right to me. This is not
a request to change it now. It is the measurement of what it costs while it
stands, plus the evidence that the fix itself is clean when you do want it.

WHAT IT AFFECTS ON MY SIDE
--------------------------
`extractCitations` from `@lawmind/ingest/citations` is the ONLY neutral-citation
extractor the API has. `query-shape.ts`'s header forbids a second copy, correctly.
So the defect reaches, unmediated:

  * `classifyQuery` -> `/search` routing and `exactCitation`
  * `bareCitationAsField` in `search/structured.ts`
  * the `cite:` value check in `search/qlang/parse.ts`
  * `judgments/citations.ts` paragraph display

Measured, at HEAD:

    classifyQuery('2025:DHC:8491-DBThis Court')
      -> shape 'citation', citation '2025:DHC:8491', warrantsExactLookup TRUE

An advocate pasting glued text out of a PDF gets an exact lookup keyed on a
citation the court never printed. 27-case frozen control set, 3 disagreements,
all of them the glued class. Every other class agrees — punctuation, whitespace,
LF and CRLF, parentheses, the labelled form, `KHC-D`'s hyphenated COURT token,
and every negative control.

YOUR FIX, VALIDATED ON MY CONTROL SET
-------------------------------------
I applied your R18 boundary to an ISOLATED COPY of `citations.ts` in a scratch
directory and ran it beside the committed module. The tracked file was never
touched, and the old boundary occurs exactly once in it.

    CLOSED 3   REGRESSED 0   STILL_OPEN 0   negative controls moved 0
    normaliseCitation unchanged

So the one-line move is clean on this set. What it costs is the edge key space,
which is yours to price, not mine.

EDGE KEY SPACE, READ-ONLY, 0 MUTATIONS
--------------------------------------
`judgment_citations`, 22,408,376 rows total:

    neutral-form rows                          1,376,237
      with a -DB/-FB suffix                      216,318
      without a suffix (UPPER BOUND)           1,159,919
    neutral-form rows that RESOLVED               19,314
      unsuffixed AND resolved                     15,290   <- the false-pin exposure

1,159,919 is an upper bound and nothing better. `citation_text` stores the
regex's own `match[0]`, already truncated — `RAW_TEXT_RETAINS_GLUE = 0` — and
`evidence` is NULL on all 1,376,237 neutral rows. The glue is not recoverable
from the edge row at all.

The one deterministic in-database signal I could find, and it is worth having:

    same citing judgment emitted BOTH `X` and `X-DB`
      83 pairs, 33 distinct citations, 83 distinct citing judgments
    corpus-wide citations appearing in both forms
      158 distinct

That is your two-strings-from-one-document fingerprint, visible without reading
source text. Some of the 158 will be genuine — a court really does print both
forms across connected matters — so treat it as a candidate set, not a defect
count.

ALIASES: ZERO, AND BY CONSTRAINT
--------------------------------
    ALIASES_SCANNED                 4,394  (335 AIR + 4,059 SCC)
    ALIASES_POTENTIALLY_AFFECTED        0
    matching the HC neutral form        0

Migration 0027: `CHECK (alias_reporter IN ('AIR','SCC'))`. A neutral citation
cannot be an alias row. Not a sample — a constraint. Alias provenance and
resolved-edge identity via the alias path are both unaffected.

`judgment_citation_keys`: alias 4,394 / neutral 1,388,764 / reporter 38,352. The
neutral arm ends `-DB`/`-FB` on 210,791 rows, matching `judgments.neutral_citation`
exactly, which confirms it is a faithful mirror of `hc-load`'s output and carries
no exposure of its own.

FOR YOUR R19 -DB QUARANTINE
---------------------------
    DB_SUFFIX_CROSS_SYSTEM_PARITY = PENDING

The 43 existing `-DB` rows must not enter a population described as
cross-system safe until `citations.ts` and `hc-load.ts` agree. They do not yet.
When you land the boundary fix, three assertions in
`services/api/src/search/citation-boundary-parity.test.ts` go RED on purpose —
they are pinned to today's wrong answers with the right answers recorded beside
them, so closing it is a one-line edit here. That red is the signal, not a
regression. Tell me and I will flip them the same day.

WHAT I DID NOT DO
-----------------
No edit to any `services/ingest` path. No citation edges applied. No canonical
judgment correction. No alias or edge mutation. No migration. No network. No
final falsifier.

    RESOLVER_READY_FOR_INDEPENDENT_RETEST = NO
    CITATION_BULK_APPLY = HOLD

NO is the honest answer while a known parser divergence is still live on
`/search`. It becomes YES when `citations.ts` carries the R18 boundary and the
parity matrix reads 0.

Full evidence: `docs/ai/lcc-r17/citation-boundary-parity.json` — seven
canonicalization paths inventoried with callers and before-behaviour, the frozen
control set, and every number above with the query that produced it.

Two separate findings, reported and deliberately NOT fixed, because they are
coverage gaps rather than boundary defects and broadening citation syntax on a
user-facing lock needs its own evidence: `documents/route.ts`'s
`extractCitationSpans` — the PD-7 lock — returns `[]` for EVERY High Court
neutral citation, and `hyde.ts`'s `stripInventedCitations` leaves one intact in
generated text. Both see only INSC and the reporter series. They are LCC's to
fix, in their own round.
