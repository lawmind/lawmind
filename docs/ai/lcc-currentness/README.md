# CURRENTNESS FIXTURES — the retrieval safety layer, 20 August 2026

`currentness-fixtures.json` · 98 rows · LCC

## What this is for

An authority's identity resolving is not evidence that it is good law. Search
finds *E.V. Chinnaiah* because the judgment exists, is indexed, and matches the
query — and all three of those remain true after a seven-judge bench overruled
it. **Retrieval and currentness are independent axes and the first cannot answer
the second.**

So currentness is a **safety layer over** retrieval, never a filter inside it.
These 98 judgments may legitimately be returned by a search. What they may never
be is *rendered without their mark*.

## The counts, read live 20 Aug 2026

```
set_aside          73     add-to-matter DISABLED
partly_set_aside    8
doubted            17
                   --
                   98
```

**Every one of the 98 carries a supporting adverse edge in
`judgment_citations`** — zero are marked on a `distinguished` edge alone, zero
have no edge at all. Verified in `docs/TREATMENT_MANIFEST_RECONCILED.md` §3.

## This is a fixture, not a cache. The distinction is the whole rule.

`overruled_status` is **never cached**. Verification is permanent; good-law
status is not. A judgment verified in March is still verified in December; a
judgment that was good law in March may not be in December, and the row is the
only thing that knows.

**Use these rows to test that the rendering path marks them. Never use them as a
source of truth at request time** — read `judgments.overruled_status` live, at
render, on every surface. A test fixture that becomes a lookup table is how a
stale-overruled bug is introduced by the code written to prevent one.

The stale-overruled threshold is **zero**. Overruled law rendered without the
LAW MOVED mark is as severe as a hallucinated citation.

## What each row carries, and why

| field | why it is here |
| --- | --- |
| `judgmentId` | the join key; the only thing a renderer should need |
| `overruledStatus` | the derived currentness. One of three non-`none` values |
| `addToMatterDisabled` | `true` exactly when `set_aside` — the one case where Lawmind refuses to let an authority be used |
| `adverseEdges[]` | the **verified treatment edges** that support the status: relationship, citing judgment, its date, and the citation text as printed |

`adverseEdges` is present so a test can assert the *reason* and not merely the
*state*. A fixture that only carried the status would pass against an
implementation that had guessed it.

## Treatment and currentness are two fields, deliberately

`adverseEdges[].relationship` uses the full seven-value edge vocabulary
(`cites · followed · distinguished · overruled · approved · doubted ·
overruled_in_part`). `overruledStatus` is a four-value **derivation**. They are
not the same axis and a renderer must not collapse them:

- **distinguished** is not adverse. A court saying "that case turned on
  different facts" leaves the precedent fully good law.
- **doubted** is not overruled. It is a signal to check, not a bar.
- **partly_set_aside** means part of the authority survives, and which part is a
  question this fixture does not answer.

## Known defect these fixtures inherit — OD-14

**73 of the 98 carry `set_aside` derived from an edge whose relationship is
`overruled`.** Those are different legal acts: setting aside undoes the judgment
in its own case; overruling kills the proposition while the decision between the
original parties stands, and the judgment often remains citable for propositions
the later court never reached.

The evidence is sound and no row needs re-deriving — but `set_aside` disables
add-to-matter, so an overruled-but-intact authority is currently refused on the
same footing as a judgment that no longer exists. That is `OD-14` in
`docs/OPEN_DECISIONS.md`, open, and **not to be resolved by whoever consumes this
file.**

If OD-14 resolves toward a distinct `overruled` state, `addToMatterDisabled`
changes for up to 73 of these rows. Treat that field as the least stable thing
here.

## Regenerating

Live query, no artifact dependency:

```sql
SELECT j.id, j.case_title, j.judgment_date, j.court, j.neutral_citation,
       j.overruled_status
  FROM judgments j
 WHERE j.overruled_status <> 'none'
 ORDER BY j.judgment_date DESC;
```

The count moves whenever the treatment graph is extended — it was 92 on 19 Aug
and is 98 today. **Regenerate rather than quoting a count from this file**, and
if a test asserts `98` it will fail correctly the next time an authority is
marked.
