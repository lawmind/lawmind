# NEW1 — the "clean issue statement beats a citing passage" inference does not reproduce

20 Aug 2026. `docs/ai/new1-crosslingual/query-shape-arms.json`,
`services/harness/src/query-shape-arms.mjs`.

## The question this closes

`NEW1_CROSSLINGUAL.md` closed the language question and left a sharper one open in
its own text. Hindi out-scored English 2:1 on the same five gold judgments, and
the two sides were not the same kind of text: the Hindi rows were hand-authored
restatements of one legal issue, the English rows were raw citing passages cut
from a later judgment. So the comparison as run was *"a clean issue statement
against a real passage"*, and it was recorded as **INFER, not KNOW**, with the
follow-up named — author English restatements and run all three arms.

If it had held it would have mattered a great deal: every headline this lane has
published, 21.5% success@5 on the expansion benchmark and 21.9% on the CONTROLLED
baseline, is measured on citing-passage queries, and **an advocate does not type a
citing passage.**

## The third arm already existed as data

No authoring was needed and none was done. `queries.hand.json` carries
`provenance.issue` on every row — a hand-written English statement of exactly the
issue the Hindi row restates, put there to document what the Hindi query was a
restatement OF. The gold judgment is unchanged and the issue text was written from
the derived query, not from the target judgment, so nothing about the pairing
moves.

## The result: at success@5 there is no effect at all

Same five gold judgments, same index, dense arm, `ef_search=200`, chunks
deduplicated to one row per judgment before ranking.

```
arm                 success@5   recall@20   found   MRR      mean chars
hindiRestatement       40%         80%       4/5    0.3111       240
englishIssue           40%         40%       4/5    0.2545        90
englishPassage         40%         60%       3/5    0.1611       826
```

Per pair, the gold's rank:

```
pair        hindi   englishIssue   englishPassage
e39b2b83      1          1               4
187694cc      6          4               -
a259ece9     18        103              18
bcc47cbd      3         78               2
6f885356      -          -               -
```

**All three arms are identical at success@5.** The inference that a clean issue
statement retrieves better than a citing passage is not supported by this
measurement, and it should not be repeated.

What survives is weaker and points the other way from "short is better":

- **MRR orders the arms** — 0.311 Hindi, 0.255 English issue, 0.161 English
  passage — so the passage arm finds the gold at worse ranks when it finds it.
- **`recall@20` favours the Hindi restatement** (80% against 40% and 60%), and the
  English *issue* arm is the WORST of the three there. `bcc47cbd` at rank 78 and
  `a259ece9` at rank 103 are both the 90-character issue arm, and both are inside
  the top 20 for at least one other arm. A 90-character phrase is evidently too
  thin a query, and "clean and short" is not one property but two pulling in
  opposite directions.

## Two things this does NOT say

- **It does not reproduce the original 40%/20% split.** The English passage arm
  scores 40% here against 20% in `NEW1_CROSSLINGUAL.md`. The measurement differs:
  this deduplicates `judgment_chunks` to one row per judgment before ranking, so a
  verbose judgment occupying several of the top five is counted once. The two
  numbers are therefore not comparable and the earlier one is not withdrawn — it
  answered a slightly different question.
- **n = 5.** Every difference above is one or two queries. This was never going to
  settle the question; it was worth running only to say whether the effect is
  large enough to justify a properly powered set. **At success@5 the effect is
  zero, so it is not.** The MRR ordering is worth a powered set if anyone wants to
  spend one, and the practical form of that experiment is now clear: vary query
  LENGTH at fixed cleanliness, because length is what separated the two English
  arms.

## What it means for the published numbers

The 21.5% and 21.9% success@5 figures stand as measured. They should still be read
as *"on citing-passage queries"* — that caveat was right and remains right — but
there is now no evidence that a differently-shaped query would move them, and the
lane should stop treating the benchmark's construction as a likely explanation for
its ceiling. The ceilings that ARE measured are elsewhere: 13.2% of cited
authorities refused by the eligibility contract, and only 38.6% of gold reaching a
200-deep candidate pool.
