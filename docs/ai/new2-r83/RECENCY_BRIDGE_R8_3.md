# RECENCY_BRIDGE_R8_3 — R8.3 §11 N2-3

**Lane:** NEW2 · **26 August 2026**
**A bridge is justified for the Supreme Court and NOT for the High Courts, and the measurement that decides it is §11 N2-2's, not a preference.**

**Depends on** `SOURCE_FRESHNESS_DECOMPOSITION_R8_3.md`.

---

## 1. §11 N2-3 is conditional, and the condition holds for exactly one adapter

The instruction reads: *"If upstream bulk is stale: candidate discovery from
already-authorized sources → official/primary verification → canonical record."*

| adapter | upstream stale? | bridge justified? |
| --- | --- | --- |
| `aws_open_data_hc` | **NO** — wrote today, decisions to yesterday | **NO** |
| `aws_open_data_sc` | **YES** — 208 rows for all of 2026, last write 11 days ago | **YES** |

**Building a discovery bridge for the High Courts would be work aimed at the
wrong cause.** Their bucket is close to a daily feed; the corpus is 56 days
behind because our walk stopped. The remedy there is to restart the walk and find
out why it stopped per-scope — not to add a source.

That distinction is the whole value of having decomposed the freshness. Before
today this lane's own document said eCourts was the only adapter that could
produce current law, and it would have sent the bridge work in the wrong
direction for both courts at once.

---

## 2. The Supreme Court case, stated with its own numbers

```
upstream 2026 partition       208 rows total
  by month  Jan 43 · Feb 38 · Mar 27 · Apr 35 · May 29 · Jun 19 · Jul 15 · Aug 2
last upstream write           2026-08-15   (11 days)
newest upstream decision      2026-08-04
local newest decision         2026-07-09
local held (SC adapter)       38,342
```

**208 rows for two-thirds of a year is not the Supreme Court's output.** The
Court delivers that in a fortnight. So this is not a lag — the partition is
materially incomplete at source, and no ingest throughput closes it.

**What is NOT measured**: *why*. The bucket may be mid-refresh, may have changed
layout, or the publisher may have stopped. This document does not guess, and the
design below is written to be correct under all three.

---

## 3. The bridge, as three separated stages

The stages are separated because collapsing them is how a commercial aggregator
becomes a citation of record.

### Stage 1 — candidate DISCOVERY, from already-authorized sources only

A candidate is a **claim that a decision exists**: court, date, case number, CNR
where available, parties, and where the claim came from. Nothing else.

Permitted discovery sources are the ones already authorized in `CLAUDE.md` §6a
plus the eCourts grant. **No new source is proposed here** and none is needed —
§11 N2-10 puts new-source work after the limited freeze anyway.

A candidate is **never** a judgment row. It carries no `full_text`, no citation,
and is not retrievable.

### Stage 2 — official/primary VERIFICATION

A candidate becomes real only when a primary source confirms it: the court's own
publication, the eCourts record under the registrar's grant, or the bulk
partition once it refreshes.

**A candidate that no primary source confirms stays a candidate.** It is not
downgraded, deleted, or shown. This is the same shape as the citation harness's
`unverified` state, and for the same reason: silently dropping a claim and
silently promoting one are both failures, and only one of them is visible.

### Stage 3 — the CANONICAL record

Only Stage 2 output writes `judgments`. Provenance records which source
discovered it and which source verified it — **two fields, not one**, because
"how we heard about it" and "what proves it" are different questions and a single
`source` column cannot answer both.

---

## 4. The rule that outranks the design

**No commercial or provider candidate becomes canonical merely because it is
newer.** §11 N2-3 says it and it is the rule most likely to be quietly bent under
pressure to look current, because the bending is invisible in the output: a
freshly-dated judgment from an unverified aggregator looks exactly like a
verified one.

Two consequences that make it mechanical rather than a promise:

- verification state is a **column**, not a pipeline stage anyone can skip;
- freshness reporting counts **verified** rows only. A dashboard that counts
  candidates is a dashboard that rewards discovery over proof.

---

## 5. What this document does not do

- **It does not activate eCourts.** §5.8 keeps live court state OFF for
  LIMITED V1, and activation needs the grant's operational conditions and real
  observations. eCourts has **0 rows** in `ecourts_observation` today.
- **It does not schedule any of this.** §11 N2-10 puts bulk provider ingest
  after the limited freeze, and a bridge is exactly that shape of work.
- **It does not touch the High Court adapter.** Its problem is ours.

---

## 6. State

| item | state |
| --- | --- |
| bridge justified for SC | **`YES`** — upstream incomplete at source, measured |
| bridge justified for HC | **`NO`** — upstream current; our walk stopped |
| why the SC partition is thin | **`NOT_MEASURED`** — mid-refresh, layout change or stopped publisher all fit |
| the three-stage design | **`DESIGNED_NOT_BUILT`** |
| eCourts activation | **`OUT_OF_SCOPE`** for LIMITED V1 per §5.8 |
| schedule | **`POST_FREEZE`** per §11 N2-10 |
