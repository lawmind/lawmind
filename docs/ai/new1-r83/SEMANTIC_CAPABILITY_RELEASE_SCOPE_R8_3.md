# SEMANTIC CAPABILITY RELEASE SCOPE — R8.3

**Lane:** NEW1 (retrieval/index/evaluation) · **Deliverable:** §12 N1-7
**Version:** `SEMANTIC_SCOPE_R8_3@v1` · **As of:** 2026-08-26
**Status:** **PROVISIONAL-COMPLETE.** Every verdict below is `DISABLED`,
`EXPERIMENTAL_INTERNAL` or `LIMITED`. The pending experiment (§12 N1-5) can only
*narrow* them further or leave them; it cannot promote any of them to `ENABLED`,
because none is gated on evidence the experiment produces. Published now, ahead
of the experiment, because **LCC is building the §6 capability registry today**
and a registry written without these would have to guess.

---

## 0. The one sentence a release decision needs

**Nothing semantic is release-ready, exact/structured search does not depend on
any of it, and a LIMITED V1 can therefore ship with every capability below
switched off at the server.**

That is the mechanism §6 exists for. This document supplies the rows.

---

## 1. Registry rows — paste-ready for `RELEASE_CAPABILITIES_R8_3`

| capability | state | reason (short) |
|---|---|---|
| `search.semantic.broad` | `EXPERIMENTAL_INTERNAL` | `cond_s@5` 0.3715 route-reachable, 95% CI [0.327, 0.444]; end-to-end `s@5` 0.0136; no Gold V3 |
| `search.semantic.supporting_authority` | `DISABLED` | 0/6 at every human-readable depth; ranking failure at 100–500; n=6 |
| `search.semantic.adverse_authority` | `DISABLED` | 0/4 at `c@5`; 0.50 only at depth 100+ |
| `search.semantic.counterarguments` | `DISABLED` | derived from the two rows above; both are zero at served depth |
| `search.semantic.long_input` | `LIMITED` (guided refusal) | >500 chars is a refusal family; **no silent truncation** |
| `search.semantic.abstention` | `DISABLED` | `NOT_DEPLOYABLE` — signal failure, not an untuned threshold |
| `generation.evidence_from_passages` | `DISABLED` | generation-evidence eligibility is `NOT_MEASURED`; role is not yet on the wire |
| `search.exact` / `search.structured` | **not mine** — independent of every row above | no semantic dependency; see §5 |

`version: SEMANTIC_SCOPE_R8_3@v1`, `as_of: 2026-08-26`, `owner: NEW1`.

---

## 2. Broad semantic — `EXPERIMENTAL_INTERNAL`

```
route-reachable cond_s@5   0.3715   (288 tasks inside production's 500-char bound)
all 295 tasks              0.3831   95% CI [0.3265, 0.4444], clustered on TARGET, 2000 resamples
end-to-end s@5             0.0136
exact-arm ceiling          0.4034   — the index, not the ANN, is the limit
```

Three separate reasons, any one of which is sufficient:

1. **It is wrong about three times in five** on the tasks it was built for, and
   the confidence interval is clustered on the target rather than the task —
   tasks sharing an authority are not independent, and treating them as
   independent would have narrowed this interval dishonestly.
2. **Gold V3 does not exist.** §5.6 requires it before broad semantic goes
   public. Nothing in R8.3 creates it.
3. **What comes back is mostly not the court.** On NEW2's widened census at
   production `ef_search=200`, `COURT_REASONING` is **1.04%** of retrieved
   passages and `REPORTER_EDITORIAL` is **6.46%**. A surface that says *here is
   what the court held* would be describing about one passage in a hundred.

`EXPERIMENTAL_INTERNAL` rather than `DISABLED` because the tranche and index are
a live research asset and the moat work continues against them post-freeze. It
must not be reachable by any client route.

### The correction that is NOT a reason to disable it

`REPORTER_EDITORIAL` enrichment is **1.45x**, not the 5.95x my R8.1 artifacts
claimed. NEW2's `LIMIT`-after-filter defect inflated my denominator, and I
reproduced their corrected pool independently at 4.34% against their 4.44%. The
enrichment story is retired. **The exposure is not** — the pool carries 2.8x more
reporter apparatus than I was telling people, so the honest revision makes the
corpus problem larger while making the *ranking* story disappear.

---

## 3. Supporting and adverse authority — `DISABLED`

| family | tasks | c@1 | c@5 | c@100 | c@500 |
|---|---:|---:|---:|---:|---:|
| `supporting_authority` | 6 | 0 | **0** | **0** | 0.3333 |
| `adverse_authority` | 4 | 0 | **0** | 0.50 | 0.50 |

**This is a ranking failure at human depth, not proven representation absence,
and the distinction decides what may be built.** The target was in the index for
all six supporting-authority tasks. `exact` recovers **4 of 6 by depth 500**;
`ann_ef200` recovers 2 of 6. The authorities are held and findable — they rank
between 100 and 500, below every depth a person reads.

Consequences, both binding:

- **No representation rebuild for this family.** It would be answering a question
  the evidence does not ask.
- **A reranker is the shape that addresses ranking at depth 100–500, and it is a
  future hypothesis.** N1-8 forbids it this round and this document does not
  propose it. `n=6`; the family needs a larger task set before anything is built
  against it at all.

*"Find me an authority that supports this proposition"* is close to the centre of
what an advocate wants, and at usable depth we return nothing. That is the reason
for `DISABLED` and it is not softened by the family being small.

---

## 4. Long input — `LIMITED`, guided refusal, and the number that would have been inflated

Production's route bound is 500 characters. 288 of 295 tasks are inside it; 7 are
not.

```
in-band, 288 tasks     cond_s@5  0.3715
out-of-band, 7 tasks   cond_s@5  0.8571
```

The 7 out-of-band tasks concentrate in **3 of 3 `long_narrative`** and **2 of 3
`pasted_passage`** — two of the three best-scoring families. **Pooling them lifts
the headline from 0.3715 to 0.3831 by averaging in queries the product refuses to
route.** That is why the two are reported separately and why the route-reachable
figure is the one that goes anywhere near a claim.

Required behaviour: an explicit, guided refusal. **No silent truncation** — a
truncated 900-character fact pattern is answered as if it were a different
question, and the advocate has no way to see that happened.

---

## 5. Abstention — `DISABLED`, and it is a signal failure

The preregistered calibration ran unchanged on the complete index and the chosen
`answer` threshold landed on the grid's lower edge for the **second** time. The
runbook said in advance what to do if that repeated: **do not widen the grid.**

```
topSim over the 153 DEVELOPMENT tasks   p05 0.6329   p50 0.7001   p95 0.8117
chosen answer threshold                 0.20
```

Every query scores between 0.63 and 0.81 and the threshold is below the entire
observed distribution. **It separates nothing.** A rule with a threshold no
observation ever approaches is a constant, not a rule.

So: absolute cosine similarity does not discriminate answerable from unanswerable
on this feature set. `NOT_DEPLOYABLE`.

**§5.6's line — "abstention failure cannot be promoted to confidence" — is the
load-bearing one.** The failure mode this guards against is a surface reading the
absence of a working abstention rule as permission to answer everything.

---

## 6. Generation evidence — `DISABLED`, and this is the row I cannot yet fill

§5.2 and §0 Correction 5 ask the right question and I do not have the answer:

> what share of served evidence is actually **generation-evidence-eligible
> court-authored text**, under a validated policy?

`NOT_MEASURED`. That is what §12 N1-5 measures, and it is why the experiment
still matters even though it cannot promote anything to `ENABLED`.

What is already known is enough to disable generation on its own:

- role is **not on the evidence wire** yet (LCC §8.6);
- the role classifier's **precision is unmeasured** — FIFTH's blind labelling
  (1321) is what turns it from a signal into a rate;
- `OTHER_UNKNOWN` is **~60%** of the pool and is `EXCLUDED_OR_UNKNOWN` under §8.1,
  not court-authored;
- §8.3 fails closed: high-confidence `REPORTER_EDITORIAL` may not support a
  generated legal proposition, and today nothing at the wire can tell a surface
  which passages those are.

**Premium generation is not required for LIMITED V1** (§5.4), so this costs the
freeze nothing.

---

## 7. What this document does NOT decide

- **No rights conclusion.** §8.2 forbids inferring one permission from another.
  Nothing here says whether reporter/editorial text may be stored, indexed,
  displayed or trained on. The content-use question is open in two places —
  `docs/FOUNDER_QUEUE.md` (*"May we reproduce the OFFICIAL SCR headnotes from
  e-SCR?"*) and OD-13 — and it is not NEW1's.
- **No claim about exact or structured search.** Those are LCC's §5.1 and they
  are independent of every row above: a `DISABLED` semantic capability removes
  nothing from citation, CNR, case-number, title or filter search. That
  independence is what makes a limited freeze possible, and FIFTH should verify it
  rather than accept it from me.
- **No verdict on Hindi or eCourts.** §5.7 and §5.8, not mine.

---

## 8. What would change any row here

| row | what would move it |
|---|---|
| `search.semantic.broad` | Gold V3 existing, **and** a measured generation-evidence rate, **and** a validated role policy |
| `supporting`/`adverse` | a larger task set, then a reranker round — in that order |
| `long_input` | nothing this round; the refusal is correct, not a stopgap |
| `abstention` | a different feature set. Not a wider grid, and not a re-tuned threshold |
| `generation.evidence` | the §12 N1-5 experiment, plus role on the wire, plus FIFTH's precision measurement |

## 9. Caveats

- Every figure is from `PASSAGE_100K_METRICS.json` (R8.1 baseline, built
  2026-08-26T01:55Z) or from NEW2's `ROLE_CENSUS_WIDENED_R8_3.md`, and is labelled
  where it came from. Nothing here is re-derived from memory.
- The role percentages are **conditional on NEW2's regex classifier being right**,
  and its precision is unmeasured. Every number in §2 and §6 that mentions a role
  inherits that.
- `n=6` and `n=4` for the two authority families. They are small, and small is
  exactly why they are `DISABLED` rather than the subject of a build.
- This is `v1`. If the §12 N1-5 experiment changes a row, the version increments
  and the change is stated against this file rather than silently replacing it.
