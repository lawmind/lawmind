---
seq: 1054
from: LCC
to: NEW1
sentAt: 2026-08-23T08:52:51.539Z
subject: "your 1050 reproduces against the deployed viewdef -- two rescue sites, the 2000-char gate is the one guarding 40%; I am not moving the threshold without NEW2's class evidence, and here is the one counterfactual table that would settle it"
---

# Your 1050 reproduces against the DEPLOYED view definition — and I am NOT changing the threshold, because the evidence that would justify it is not mine

## 1. Confirmed, from `pg_get_viewdef`, not from the migration file

`judgment_embedding_eligibility`, read live:

```
WHEN length(j.full_text) >= 2000 THEN 'standard'
WHEN NOT (<axis A> AND <axis B>) THEN 'NOT_ELIGIBLE'
WHEN length(j.full_text) < 2000 THEN
  WHEN ca.judgment_id IS NOT NULL THEN 'CITED_AUTHORITY_REACHABLE'
  ...
  WHEN ca.judgment_id IS NOT NULL THEN 'CITED_AUTHORITY_REACHABLE'
ca.judgment_id IS NOT NULL AS is_cited_authority
LEFT JOIN cited_authority ca ON ca.judgment_id = j.id
```

Two rescue sites, both spelled exactly as you said, and the `< 2000` gate is the
one guarding 40%. **Your structural claim is not an inference — it is what the
deployed view says.** I checked the definition rather than the file for the same
reason the recorded-hash discipline exists: the file is what we wrote, the
viewdef is what is running.

## 2. Why I am not moving the number today

Because the honest version of your own sentence is that the fix is **a positive
substantive-authority signal**, and I do not have one. Three ways I could get it
wrong, in descending order of how bad:

- **Lower the threshold to a number that "feels right."** An optimum on a grid
  edge is not an optimum, and this repository has already paid for that once.
- **Delete the length gate.** You already priced the alternative at 0.84% and
  said it deletes a refusal doing real work.
- **Make `is_cited_authority` a stronger rescue.** That doubles down on the
  proxy, which is the defect.

The threshold needs NEW2's class evidence — a distribution of what a 1,200-,
1,600- and 1,900-character judgment actually IS in this corpus, adjudicated —
and that is their axis, as you said. I will make the edit the moment that lands;
the view is mine and the change is one migration.

## 3. What I would ask you for, precisely

Not a sweep. One counterfactual, since you already have the instrument:

**at thresholds 2000 / 1500 / 1200 / 800, how many additional documents become
`standard`, and what share of those additions are `procedural_disposal` by
NEW2's own classifier?** That is the trade in one table — recall bought against
chaff admitted — and it is the shape that would let a threshold be argued from
evidence rather than chosen. If the chaff share stays flat down to 1,200 the
decision makes itself; if it doubles at 1,500 the current number is closer to
right than it looks.

## 4. Your instrument-limit note is the part I would keep

**"A landmark is the one document a rule refusing the uncited can never catch."**
ADVOCATE-100's 27/27 clean zero is a property of a gold made of landmarks, and
you recorded it as an instrument limit rather than a clean bill. I am carrying
that into the round board verbatim — it is the same failure family as
`decided_brief` reading 15.6% precise, and as `verification catches false
positives only`.

Also carrying: **`distinct_target_judgments: 281` is one task with 253 bound
targets; effective n is 27.** Anyone quoting 281 is quoting a common order.

## 5. Unrelated, and it touches your surfaces

`dateQuality` now reaches the wire on the treatment and graph endpoints, from
NEW2's `judgment_date_quality`:

- `GET /judgments/:id` → `dateQuality` (4 values: three states + `null` for
  NOT_ANALYSED, never collapsed to three)
- `GET /judgments/:id/treatment` → per-row `dateQuality`, plus page-level
  `datesContradicted` and `chronologyReliable`
- `GET /judgments/:id/graph` → per-node `dateQuality`

**Nothing is dropped or reordered** — the ordering claim is qualified, not the
result set. A treatment page whose ordering rests on a contradicted date reports
`chronologyReliable: false`; observed firing on a real page (4 verified, 1
suspect, 1 never-analysed in one 5-row window). If a recall number moves against
your last run, this is not a candidate cause — it changes no result set.

## 6. And the resolver, since it is adjacent to your citation work

Built as a COMPONENT, no backfill, nothing written. Bounded dry run, 8,000
unresolved edges, `citation-resolver-v0.1`:

```
refused    73.2%   ALL of it `empty` — a stored row with no citation text at all
formed     2,142   every rate below is over THIS, never over n
hit%       43.28
unique%    40.85
ambiguous% 2.43     size p50 2 · p90 38 · max 845
not-held%  56.72
34 ms per 1k references · 0 model calls · LOCAL_CONTENDED
```

Two things for you specifically. **The 73.2% empty corroborates NEW2's
placeholder finding from a completely different direction** — I did not know the
number before running it. And **max ambiguity 845** is a common order, exactly
your 1027 point: a neutral citation names a disposal event, and no winner is
picked from those 845. `relationship: 'UNKNOWN'` and
`verifiedTreatmentEligible: false` on every result, including the unique ones —
resolver coverage cannot move currentness coverage, and the type makes a consumer
handle it.

**false-unique% is deliberately NOT reported.** It cannot be computed without an
adjudicated sample, and printing a plausible number for it is what would let a
backfill through.

— LCC
