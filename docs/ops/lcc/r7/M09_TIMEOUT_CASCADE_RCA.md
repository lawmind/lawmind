# M09_TIMEOUT_CASCADE_RCA

**Owner:** LCC · **Date:** 25 August 2026 · **R7 §8 LCC-P0**
**PASS condition, as written:** *"one request timing out cannot poison the next legal-truth request."*

**VERDICT: PASS.** The cascade does not exist at the connection or session level, proven on
both shapes that could produce it. A different, real defect was found in the same request and
is fixed: a statement timeout was surfacing as an opaque `INTERNAL 500`.

---

## 1. What was reported

R5 dossier, matter M09:

> Judgment GET took about 40 seconds and returned 500 (`57014` statement timeout); subsequent
> treatment route also returned 500 — **Fail**
>
> M09 also exposed a hidden failure cascade: a statement timeout inside citation-key work was
> followed by a treatment-path `TypeError`. A request timeout must not poison or deform the
> next legal-truth response.

and its stated hypothesis:

> the M09 citation-key query timeout was followed by a different treatment-path 500,
> **suggesting request/session cleanup is not isolated enough.**

Three claims. Measured below, one holds, one is disproven, one is not reproducible.

---

## 2. The 40 seconds is not the query — `CORRECTION_OF` the implied cause

`OBSERVED_BY_LIVE_DB`, on the exact row: M07's `openedJudgmentId`
`0f4788ed-5399-4891-bc2b-327a71fcf47b`, from `docs/ai/new3/ten-matter-regression.json`.

```
judgment SELECT   Index Scan using judgments_pkey   cost=0.56..2.78 rows=1
treatment query   Index Scan using judgment_citations_cited_relationship_idx
                                                    cost=0.42..5.70  →  Unique cost 5.76
document size     42,046 characters · 24 kB stored
```

Timed three times, `OBSERVED_BY_EXECUTION`, with 1 concurrent active backend:

```
judgment SELECT        41ms / 1ms / 0ms
treatment DISTINCT      3ms / 1ms / 0ms
```

**Nothing about that request is slow.** Both indexes exist and are used.

### So what made it 40,024 ms

`CORE_STATEMENT_TIMEOUT_MS` is **10,000**. A single statement cannot run 40 seconds — the
timeout would have fired at 10. So 40,024 ms is arithmetically inconsistent with "one slow
query", and entirely consistent with **queue wait plus a statement**.

`pools.ts` already names the mechanism in its own opening comment, written after the previous
incident:

> *"The resource that runs out is **this process's own connection queue** … `postgres.js` then
> makes every other caller WAIT. Not fail: wait, with no timeout of its own."*
>
> *"A pool queue is unbounded and invisible. The 200th queued search is indistinguishable from
> the 1st until it eventually runs, 40 minutes later, for a user who left."*

The two-pool split (CORE 8 connections / 10 s · RESEARCH 6 / 15 s) fixed **cross-class**
starvation — research can no longer starve auth and matters. It did not make the **core** queue
finite, and the admission gate that turns a full queue into an answer is only in front of
research. So a contended box still turns a 1 ms judgment read into a 40-second request, and
`statement_timeout` cannot help, because it bounds the statement and the waiting happens before
the statement starts.

This is the same family as LCC's own bus 1060 — *"the `statement_timeout` I added bounds TIME
not MEMORY"*. A bound that does not bound the thing that actually runs out.

**Corroborating context, NEW3's own run notes:** dense arm DISABLED, box `LOCAL_CONTENDED`,
ingest fleet and a GPU walk live throughout. Their own report says of it: *"NOT characterised: I
have not separated document size from court from contention."* They were right to hold back. It
was contention.

---

## 3. Session cleanup is NOT the problem — hypothesis disproven

`OBSERVED_BY_EXECUTION`. Tested on a `max: 1` pool, which forces every query onto the **same
physical connection** so a dirty session has nowhere to hide.

**Shape A — a bare statement timeout:**

```
1. baseline legal-truth read     ok, 146ms
2. force a timeout               57014 | canceling statement due to statement timeout
3. the NEXT legal-truth request  ok, 0ms      <-- NOT poisoned
4. and again                     ok
5. session state                 {"state":"active"}
```

**Shape B — a timeout INSIDE a transaction.** This is the shape that genuinely can poison: a
statement cancelled mid-transaction leaves the backend `idle in transaction (aborted)`, where
every later statement fails `25P02` until someone rolls back.

```
timeout inside sql.begin()       57014
next legal-truth request         ok      <-- NOT poisoned
session state                    {"state":"active"}
```

`postgres.js` rolls the transaction back for us. **The connection is returned to the pool
clean, in both shapes.** R5's hypothesis — *"request/session cleanup is not isolated enough"* —
is disproven.

---

## 4. The `TypeError` does not reproduce — and the artifact says the cascade did not happen

`OBSERVED_BY_EXECUTION`, `docs/ai/new3/ten-matter-regression.json`, M07's step sequence:

```
search      200   1,242ms
judgment    500  40,024ms      <-- the timeout
treatment   200      17ms      <-- the NEXT legal-truth request, clean
create_matter 201    2ms
save_authority 201  13ms
...
```

**The subsequent treatment route returned 200 in 17 ms.** The cascade R5 recorded did not occur
in this run.

Why it plausibly occurred once and does not now: the harness's `data()` helper returns `{}` for
a failed step, and the treatment step takes its judgment id from the **search** result, not
from the judgment response —

```ts
const openId = fx.anchorJudgmentId ?? (results[0]?.['judgmentId'] as string) ?? null;
…
const jd = data(await call('judgment', `/judgments/${openId}`));   // {} on failure
const td = data(await call('treatment', `/judgments/${openId}/treatment`));
```

— so there is no dereference of a missing judgment body to throw. Whether the older harness did
the same **cannot be established from here and is not asserted.** `NOT_MEASURED`. A
`TypeError` is a JavaScript defect, not a connection one, and §3 rules out the connection.

---

## 5. What WAS real, and is fixed

A `57014` reached `app.onError` and came back as:

```json
{"ok":false,"error":{"code":"INTERNAL","message":"something went wrong"}}
```

**500. Indistinguishable from a bug in the reader.** The server was busy and it told the
advocate it was broken.

`/search` already answers this correctly — `SEARCH_BUSY`, 503, `Retry-After: 2` — and `pools.ts`
argues for it explicitly: an admission gate *"makes exceeding it an ANSWER instead of a hang."*
Every other route, including the judgment reader an advocate cannot work without, had neither.

Now, in one place rather than at thirty call sites:

```
503 · Retry-After: 2 · code TIMEOUT
"That took longer than we allow and was stopped. Nothing is wrong with the record —
 the server is busy. Please try again in a moment."
```

Three things about that, each deliberate:

- **503, not 500.** A 500 tells a client to give up and an operator to hunt a bug. A 503 with
  `Retry-After` tells both the truth, and keeps a capacity incident visible as a capacity
  incident rather than buried in the 5xx rate.
- **The copy says the server is busy, never that the record is wrong.** `CITATION_HARNESS.md`'s
  rule — copy is licence protection — applies to an outage exactly as it applies to a citation.
- **`isStatementTimeout` walks the `cause` chain**, because a timeout raised inside a
  `sql.begin()` is re-thrown wrapped and the outer error carries no `code` of its own. It
  duck-types on `code` rather than `instanceof`, because the error crosses a driver boundary; a
  missed match degrades silently to the old 500, which is the behaviour being fixed.

---

## 6. Acceptance test

`services/api/src/m09-timeout-cascade.test.ts`. `OBSERVED_BY_EXECUTION`, 6/6 pass:

```
✔ a bare statement timeout leaves the connection usable
✔ a timeout INSIDE a transaction leaves the connection usable
✔ the session is not left in an aborted transaction
✔ reports a timeout as BUSY with a Retry-After, never as an opaque 500
✔ finds a timeout wrapped in a cause chain, as a transaction re-throw produces
✔ a genuine fault is still a 500 — the timeout path must not swallow bugs
```

The last one matters as much as the others: a handler that turns every error into a friendly
503 would pass the fourth test and hide every real bug behind "the server is busy". A `TypeError`
must still be a 500.

**Falsified.** Disabling the branch (`if (false && isStatementTimeout(error))`) fails 2 of 6;
restoring passes 6 of 6. The test skips rather than passes without `DATABASE_URL` — a suite that
cannot reach Postgres has not proven the cascade is absent, it has proven nothing.

---

## 7. What is still open

**The core pool queue is still unbounded.** This RCA fixes how a timeout is *reported*; it does
not make the wait finite. A contended box can still make a judgment read take tens of seconds
before answering 503. The honest fix is a bounded acquire — core requests failing fast with the
same 503 rather than queueing invisibly — and it is a real change to the request path that
deserves measurement rather than assumption.

**Deliberately deferred to LCC-P1 mixed-load/backpressure**, which is the work that measures
p50/p95/p99, admission refusals and pool saturation at concurrency 1/5/10/25 and can therefore
tell whether a bounded acquire helps or simply moves the failure. Building it now would be
guessing at a number the very next task exists to measure.

Recorded here so it is a decision and not an oversight:

| item | state |
|---|---|
| core-pool queue wait is unbounded | **known, unfixed**, LCC-P1 |
| there is no admission gate in front of core | known, and correct today — core work is short and indexed; the gate exists for rankers |
| whether 40 s recurs at rest | it does not: 41 ms cold, 1 ms warm, measured |

---

## 8. Gate effect

**G5 input.** R7's M09 PASS condition — *"one request timing out cannot poison the next
legal-truth request"* — is **met and proven**, on both the shape that cannot poison and the
shape that can.

Two claims in the R5 dossier are corrected by measurement rather than by argument: the 40
seconds was contention and not the reader, and session cleanup was never the mechanism. The
defect that was real — an opaque 500 on a capacity condition — is fixed, tested and falsified.
