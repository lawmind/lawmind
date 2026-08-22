# Release gates, in four classes — so one broken feature does not hold the product

The binding addendum, §4: *"A failed FEATURE gate blocks that feature, not
necessarily LawMind."* This file is that rule made concrete for the server side,
because the failure it prevents is real and has a shape: a launch held for
months by a gate nobody could argue with, on a surface that could simply have
been hidden.

Written 22 Aug 2026 by LCC. Server-side gates only — NEW3 owns the mobile and
store gates, and the classes are shared vocabulary rather than my list of theirs.

---

## The four classes

**LEGAL_SECURITY** — blocks the whole product, no exceptions, no hiding.
A failure here means we could mislead an advocate about the law, expose one
advocate's client data to another, or breach an obligation. There is no version
of LawMind that ships with one of these red.

**CORE_PRODUCT** — blocks the whole product, because without it there is no
product to ship. Find the authority, show why it is relevant, say honestly
whether it still stands.

**FEATURE** — blocks THAT FEATURE. Ships if the surface can be honestly hidden:
not greyed out with a promise, not "coming soon" over a broken call — absent, or
plainly marked as unavailable.

**COMMERCIAL_MEASUREMENT** — blocks revenue or blocks our ability to know what
is happening. Does not block a free or core release.

---

## The gates, as they stand today

### LEGAL_SECURITY

| gate | state | evidence |
| --- | --- | --- |
| No citation reaches a user without verification | GREEN | search results ARE corpus rows; Tier 1 by construction |
| Overruled status read live, never cached, on every surface | GREEN | derived through `precedential-effect.ts` on search, judgment detail, `cite:`, add-to-matter, and — since 22 Aug — briefings |
| Known-damaged body text never becomes evidence | GREEN | one predicate, read live, on every body-text path; 10/10 guard tests; proved end-to-end on `2023:PHHC:092818` |
| An advocate cannot reach `/admin/*` | GREEN | migration `0074` + `requireAdmin`; 10 route-level 403 assertions |
| Raw advocate queries are not persisted | GREEN | `search_events` has no query-text column |
| Account deletion actually deletes | GREEN | 6/6 tests; rows gone, identity anonymised, ledger intact |
| A verified adverse treatment with unresolved scope never reads as "no adverse treatment" | GREEN (server) | `treatmentScope` = `UNRESOLVED`; **the UX is founder-gated and NOT closed** |
| eCourts: no request outside the grant | GREEN | `decide()` refuses five ways; 52 ledger rows, zero live requests |

### CORE_PRODUCT

| gate | state | evidence |
| --- | --- | --- |
| Citation search finds the case | GREEN | 20/20 rank 1, p50 6 ms (LOCAL_CONTENDED) |
| Case-name search finds the case | GREEN | 15/15 rank 1, p50 9 ms |
| An ambiguous citation or title is reachable in full | GREEN | pagination; every candidate of a real 6–20 group reached |
| Statute / BNS lookup | AMBER | correct, but 2 of 5 probes hit the 15 s ceiling and report `degraded` |
| Concept search over High Court law | **RED** | NEW1: dense reaches 0 of 60; the lexical arm is the whole of it, and it still times out on common-term queries. **This is a coverage fact, not a tuning fact** |
| A degraded search never reads as "no law found" | GREEN | `degraded[]` on the wire; 503 `SEARCH_BUSY` rather than an empty page |

### FEATURE

| gate | blocks | state |
| --- | --- | --- |
| 24-hour briefing | the briefing surface | GREEN server-side |
| Saved-search feed | that feed | GREEN |
| Counter-arguments | that screen | GREEN, and it names `set_aside` exclusions rather than dropping them |
| Uploads / OCR | uploads | BLOCKED — the countersigned DPA is still owed (OD-6) |
| eCourts monitoring | monitoring only | BLOCKED — founder-gated actor + canary |
| Push alerts | reliable push | not this lane's |

### COMMERCIAL_MEASUREMENT

| gate | blocks | state |
| --- | --- | --- |
| Billing / entitlement | paid launch | NOT BUILT. LCC owns server entitlement truth when it starts |
| Server observability | our ability to see an incident | GREEN — `/admin/metrics` with alert conditions in code |
| Search telemetry | knowing what advocates actually run | GREEN — privacy-safe events |

---

## How to read the one RED

Concept search over High Court law is red, and it does not follow that LawMind
cannot ship. It follows that **"search every High Court by concept" cannot be
said**, and that the surface which implies it must not exist.

What is measured and safe to describe today: citation search, case-name search,
the statute/BNS path, and the briefing. NEW1's 1010 says exactly this and it has
not changed.

A gate is not a wish. Moving this one green needs High Court vectors in a table
production can see, and that is a measured programme, not a copy change.

---

## The rule that makes the classes worth having

**A FEATURE gate may only be waived if the surface can be honestly hidden.**
Hidden means absent or plainly unavailable. A button that fails, a screen that
loads empty, or a label saying "coming soon" over a broken call are all worse
than the gate being red, because each one teaches an advocate that the product
is unreliable — and that is the thing the whole citation harness exists to
prevent, arriving through a different door.
