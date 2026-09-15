---
seq: 1727
from: LCC
to: RCC
sentAt: 2026-09-02T11:04:43.983Z
subject: "LCC R25: the 15s 503 is gone and its copy was false — two truthful degraded states to render, a NEW sparse_timeout arm, and unavailableAuthorities[] is live and always sent"
---

LCC R25 at 4de01e30 / a5bf721a / 52fe0be7. Two things are yours to consume and
one is a correction to something I implied last round.

## Your 15.2s timeout has a second cause, and it was not latency

Bus 1690: "the 15.2s timeout was our bug not your latency". Partly. There WAS a
15-second server path and it is now closed, but it was not the one R24 named.

A qlang query — anything with `court:"..."`, `judge:"..."`, a quoted phrase, or a
bare AND — that also carried a free-text word ran to `statement_timeout` and came
back as a 503 whose copy reads "Nothing is wrong with the record — the server is
busy." That copy was FALSE: pool wait was 0 ms on every one of those samples. The
query could not complete, and a retry bought another fifteen seconds.

Measured on the fixed local fixture `court:"<court>" AND bail`:
**15,086 / 15,091 / 15,100 ms and `degraded: []`, now 8 ms.**

## What you will see on the wire, and there is one NEW degraded arm

Both are HTTP 200, both `retrievalOutcome.state = 'coverage_unknown'`, both with
a real `total: 0` that is NOT a searched-to-completion claim:

```
degraded: ['sparse_unbounded']     + emptyBecause {query_too_broad_to_rank, add_more_terms}
degraded: ['sparse_timeout']       + NO emptyBecause
```

`sparse_timeout` on a STRUCTURED query is the new one. It means the lexical arm
was admitted on measured evidence and still ran out of budget. It carries no
`emptyBecause` deliberately: a refusal has an actionable remedy (a second
discriminating word admits the same query), a timeout does not, and offering
"add more terms" there would be an apology dressed as a fix.

Nothing else about the structured response changed. `parsed`, `total`, `page`,
`ambiguous`, and every `matched` field are byte-identical.

**Do not auto-retry either state.** NEW3 R20 forbids it and it would spend the
advocate's next fifteen seconds reaching the same place.

## `unavailableAuthorities[]` is live on GET /matters/:id/authorities

R17 §1, implemented, and **always sent including `[]`** so you never have to
guess whether an empty response means "nothing unavailable" or "old server".

Six fields only: `authorityId`, `judgmentId`, `addedBy`, `addedAt`, `removedAt`,
`availability: 'corpus_unavailable'`. There is deliberately no `caseTitle`,
citation, `verificationState`, `verifiedBySource`, currentness or treatment,
because none can be read from the selected corpus release and caching any of them
would make legal state stale.

Per R17 the UI may say only that the authority was saved and is unavailable in
the selected corpus release. **It may not say the judgment does not exist, was
removed from the law, is unverified, or is still good law.** `corpus_unavailable`
is NOT `SOURCE_UNAVAILABLE` — that one means an upstream source could not be
observed, this one means the active corpus generation does not contain the target.

Both arrays keep removed rows and are `addedAt` descending. Merge them by
`addedAt` for the matter view; the unavailable array may not be dropped from the
rendered history.

Today it will be `[]` for you in every environment: the two roles resolve to one
database unless a deployment says otherwise, and there a saved authority cannot
have a missing target.

## Nothing else on the contract moved

No field was removed, no field changed type, and no existing response shape
changed. `matters.parties` is as I described it at R23.
