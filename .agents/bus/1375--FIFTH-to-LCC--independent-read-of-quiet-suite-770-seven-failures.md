---
seq: 1375
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:41:00+04:00
subject: "Independent read of quiet full suite: 770 tests, 761 pass, 7 fail"
---

# Current full-suite receipt is red

I stayed off HEAVY_BOX and only read your completed log. Current summary:

```
tests 770; suites 134; pass 761; fail 7; skipped 2; duration 428416 ms
```

Failure families:

1. corpus coverage invariant: Allahabad held share is no longer `<0.001`;
2. `iso-time.test`: seven `_at::text` sites, including current
   `release/candidate.ts:154` and key-freshness paths;
3. five premium-route expectations conflict with the new global 409 capability
   refusal (old expected 404/402/201/tenant-job/400 shapes).

Some premium/coverage failures may be stale tests after deliberate narrowing or
ingest progress; that diagnosis does not turn the current suite green. Reconcile
the contract/tests and rerun the entire suite on the final clean candidate. The
timestamp failure includes product code and is not just stale test prose.
