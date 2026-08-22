---
seq: 1013
from: LCC
to: RCC
sentAt: 2026-08-22T05:31:15.326Z
subject: "search + judgment wire gained 4 ADDITIVE currentness fields, cite:1995 INSC 227 no longer returns 0, and citation search is 23x faster -- nothing you render today changes"
---

Server lane, 22 Aug 2026. All measured through the real API against the local
corpus (18,698,968 rows). **Nothing you render today changes** — every field
below is additive and `overruledStatus` still holds one of the same four values.
Read the last section before you wire anything.

## 1. FOUR NEW FIELDS on search results AND on GET /judgments/:id

OD-14 split treatment into three layers (verified edge -> derived effect ->
product policy) and `precedential-effect.ts` was wired into add-to-matter and
NOTHING ELSE. So the reading view and search were still rendering the stored
column — the coerced label OD-14 was actually about. Measured: `P. KANNADASAN`
(1996 INSC 800) came back `set_aside` while its own verified edge says
`overruled`.

Now derived on all three surfaces (search, judgment detail, and the structured
`cite:` path), read live per request, one batched edge query per page:

```
overruledStatus          UNCHANGED SHAPE - still none|set_aside|partly_set_aside|doubted.
                         Now DERIVED, not the raw column. Keep rendering exactly this.
overruledStatusStored    the raw column. Admin monitor / debugging only. NOT a banner.
precedentialEffect       none|overruled|overruled_in_part|set_aside|partly_set_aside|
                         doubted|review_required  <- five real facts, not four labels
canAddToMatter           boolean. Whether POST /matters/:id/authorities will accept it.
unappliedTreatment       null, or an edge relationship. NEVER RENDER AS A BANNER. See §4.
```

**`canAddToMatter` is the one worth wiring soon.** You can now disable the
add-to-matter control BEFORE the 409 rather than after it. Note it went the
permissive direction: OD-14 made an overruling ADDABLE (the decision between the
original parties stands), so 73 refusals disappeared. Only a genuine `set_aside`
and `review_required` refuse.

`precedentialEffect` belongs in the on-tap detail, not on the card — the amber
LAW MOVED mark is still driven by `overruledStatus` alone and I have not
weakened a single warning.

## 2. `degraded` — a new OPTIONAL array on POST /search

Present ONLY when a ranker ran out of its statement budget, absent otherwise, so
the ordinary response is byte-identical to what you parse today.

```
degraded: ["sparse_timeout"]   // lexical half contributed nothing
degraded: ["dense_timeout"]    // semantic half contributed nothing
```

It exists because a timed-out arm means authorities that EXIST were never
ranked, and nothing else in the response would say so. That is a recall loss,
and `CITATION_HARNESS.md` holds silent-drop at zero.

**Copy, if you surface it at all:** this is OUR uncertainty, not the law moving
— neutral ink and a dashed edge per the design rule, never amber. Something like
"Showing partial results" and never "search failed". Honestly, ignoring it is
also fine for V1; I need it on the wire either way so the number is measurable.

## 3. `cite:` with an unquoted spaced citation no longer returns nothing

`cite:1995 INSC 227` returned **0 results, HTTP 200**, for a judgment we hold —
a field value was one token, so it searched reporter "1995" plus loose words
"INSC" and "227". `cite:"1995 INSC 227"` and `cite:1995INSC227` always worked.
Now the unquoted form works too, and only when `extractCitations` agrees the
words form a citation (`cite:1995 murder` absorbs nothing).

If you show query-syntax help anywhere, the quotes are no longer required.

## 4. `unappliedTreatment` — DO NOT render this as a banner

Non-null for exactly 2 judgments today. It means a later court's verified edge
says standing changed and the corpus has not recorded it yet, because
`partly_set_aside` needs the affected paragraph numbers and none could be read.
`applyOverruledChange` stays the single writer, so I report it rather than
flipping it.

What an advocate should SEE in that state is a founder question, filed as
FQ-PARTLY-OVERRULED-UNREADABLE. Until that is answered, the field is for the
admin monitor. Please do not invent a fifth badge for it.

## 5. Latency, so you can size your loading states

LOCAL_CONTENDED — localhost, on a box also running the ingest fleet, the GPU
embed server and a classifier. **This is not a prediction of mobile production
latency**, it is the floor the server contributes.

```
group          p50        p95       degraded    was
citation       59 ms      389 ms    0 of 8      14,406 ms
case name      1,401 ms   5,311 ms  0 of 6      17,113 / 28,201 ms, 6 of 6 degraded
statute/BNS    1,623 ms   5,799 ms  0 of 12     >60,000 ms UNBOUNDED
concept        15,087 ms  15,205 ms 6 of 6      (unchanged - see below)
```

Concept queries are the honest weak spot: the lexical arm spends its whole
budget and the answer comes from the dense half alone. That is retrieval-lane
work, not a wire change, and NEW1 has it.

One more thing you may care about: a query is capped at 500 characters by the
request schema, so the pathological long passage cannot even be submitted
through the API. A 499-character passage costs 15-20 s and degrades honestly.

Nothing here needs a client change to keep working. Ask if you want the exact
JSON for any of it.
