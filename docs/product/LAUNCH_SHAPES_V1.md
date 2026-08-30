# TWO LAUNCH SHAPES — both executable now

**NEW3, 30 August 2026. R13.** Roadmap v7.1 §4.1 and §5.3.1, restated as a product
definition rather than a plan summary.

**Both shapes are maintained from today.** Not one plan with a contingency — two
plans, both currently executable, and the 8 September decision selects between them
rather than starting work on one.

> **Launch is 23 October under either shape.** Shape B is not a delay, a fallback,
> or a failure. It is a launch.

---

## THE TRIGGER — and it is not a judgement call

```
SHAPE_A  ⟺  all twelve conditions in roadmap §5.3.1 pass on 8 September
SHAPE_B  ⟺  they do not
```

**Twelve of twelve. Not "most", not "the important ones".** The evidence matrix is
`MONITORING_12_CONDITION_MATRIX.json`, and it is filled in continuously **so the
8 September decision cannot cherry-pick**. A condition that is unmeasured on the day
is a **fail**, not a "probably fine" — because the failure mode this gate exists to
prevent is two mediocre pilot days qualifying a legal monitoring product.

**Today: 0 of 12 pass.** `ecourts_observation = 0`.

---

## SHAPE A — RESEARCH + MONITORING

| | |
|---|---|
| **Product** | Research + Reader + statutes + matters + freshness/source surface, **plus** court monitoring |
| **Premium** | metered monitoring, **beta tier** |
| **Website** | a monitoring page **may** go live — *only if* the capability requirements permit the claim |
| **Launch** | 23 October |

**Three things `SHAPE_A_SCOPE_CANDIDATE = yes` does not authorise**, and they are
the three a launch plan gets wrong:

1. **It is not permission to market.** Monitoring stays capability-gated until
   remote scheduling passes **Gate C**. A candidate is a candidate.
2. **It is not permission to price.** Monetisation is forbidden until conditions
   **10** (measured request budget against the proposed cadence) and **9**
   (retention) are measured. No SLA, no published polling frequency, no price.
3. **It is not permission to promise coverage.** The encoded limits are 2,000 ms
   minimum interval, 100/hour, 1,000/day. Naive per-matter-per-day polling caps the
   entire product at under ~1,000 monitored matters **across all users, forever**.
   A monitoring product sold without an answer to that is sold on a number nobody
   computed.

**User-facing state, non-negotiable in Shape A:** `LISTED_OBSERVED` never renders as
`HEARING_OCCURRED`. What we saw is that a case appeared on a list. Whether the
hearing happened is not something a cause list knows.

---

## SHAPE B — RESEARCH ONLY

| | |
|---|---|
| **Product** | Research + Reader + statutes + matters + a trustworthy freshness/source surface |
| **Premium** | **deferred.** Free beta. Monetisation moves to v1.1 |
| **Website** | monitoring = **"Coming soon"**, with **no** capability claim attached |
| **Launch** | **23 October — unchanged** |

**Shape B is a good product.** Research, reader, statutes, matters and an honest
freshness surface over 18.7 million judgments already beats most of what Indian
advocates use daily. **Monitoring is the differentiator, not the minimum.**

**What "Coming soon" may and may not say:**

- **May:** "Court monitoring is coming."
- **May not:** a date · a price · a polling frequency · a court list · a coverage
  figure · a screenshot of a monitoring screen · "join the waitlist for real-time
  alerts". *"Coming soon" is still a claim about the future, and an unmeasured
  future claim is an unmeasured claim.*

**Deferring the premium tier is a commercial decision, not a technical one, and it
has a cost worth naming:** launching free means the first paying-user signal arrives
at v1.1 instead of at launch. That is the honest trade for not selling a monitoring
product we cannot measure.

---

## WHAT IS IDENTICAL IN BOTH SHAPES

Everything that matters most:

- The four core research capabilities and the reader.
- The citation harness and the three-field model. **Verified is silent.**
- The trust-state contract, in full.
- The freshness/source surface — **never paywalled**, in either shape.
- Every claim in `V1_CLAIMS_REGISTER_R13.md` sections A and B.
- The iOS party-search kill switch and its visible degrade.
- The 23 October launch date and the review buffer to 30 October.

**Nothing in section B of the claims register — trust, currentness, provenance —
differs between the shapes.** Monitoring is an addition, never a change to what we
say about the law.

---

## THE DECISION, WHEN IT COMES

On 8 September, read `MONITORING_12_CONDITION_MATRIX.json` and count. Twelve
`PASS` selects Shape A. Anything else selects Shape B.

**Whoever takes that decision does not also get to grade the evidence that day.**
The matrix is filled in as the evidence arrives, by the lane that produced it, with
its numerator and denominator. That separation is the entire mechanism.

**And the launch date does not move under either answer.** If Shape B is selected,
eCourts engineering continues on exactly the same schedule — it simply stops being
on the launch critical path, which is where it should never have been.
