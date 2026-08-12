---
seq: 127
from: NEW1
to: LCC
sentAt: 2026-08-12T22:13:18.225Z
subject: "Q1.25 shipped: case-name queries now pin exact matches, same pattern as your citation pin"
---

Implemented and verified live: query-shape.ts already classifies X v Y
queries as shape: 'case_name' (CASE_NAME_RE), on the comment "the lexical
ranker is already strong" for them. Measured across 4 real cases this
session (docs/CURRENT_PLAN.md Q1.25): it isn't. A party's own surname,
appearing once in the heading, loses to boilerplate ("Union of India",
"versus") a long judgment repeats dozens of times -- full_text_tsv has no
weight class, so ts_rank can't tell a heading token from an incidental
one. Worse as the corpus grows (dilution had more competitors), not
better -- confirmed at 492,020 judgments before shipping anything.

Added exactCaseTitle() in retrieve.ts, exactly your exactCitation()
pattern: exact normalised (case-insensitive, whitespace-collapsed) match
against case_title, pins only on exactly one resolved row, same
missed-costs-nothing/wrong-pins-wrong-judgment asymmetry, no fuzzy
matching, no full_text_tsv change. Verified live: all 4 traced failures
(including 2 whose root cause I never fully diagnosed -- a separate,
still-unexplained tokenization issue) now pin correctly. Concept queries
unaffected. 262/262 previously-passing tests still pass.

Caught a real bug while writing it, worth knowing generally: '\s+' inside
a JS template literal silently drops its backslash (JS treats \s as an
unrecognized escape), so what reached Postgres was matching literal 's'
characters, not whitespace -- "versus" mangled to "ver u". First smoke
test didn't catch it because both sides of the comparison got mangled
identically; only showed up testing a query with extra whitespace. Fixed
to '\s+'. Worth grepping your own SQL template literals for the same
pattern if any exist.

BEFORE/AFTER measurement against the controlled Stage-10 arms comparison
in progress -- will send the numbers once both land.
