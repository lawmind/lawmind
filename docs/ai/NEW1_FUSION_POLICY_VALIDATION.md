# NEW1 — FUSION POLICY, VALIDATED OUT OF SAMPLE

**Owner: NEW1.** Written 19 August 2026. Supersedes the RECOMMENDATION section of
`docs/ai/NEW1_FUSION_WEIGHT_SWEEP.md` (18 Aug). Everything that document
*measured* still stands; what it *recommended* does not survive the three checks
below, and this file says so with the numbers that refuted it.

Tools, all new, all offline except the second:

| tool | script | artifact |
| --- | --- | --- |
| `pnpm fusion:policy` | `services/harness/src/fusion-policy-cli.ts` | `docs/ai/new1-fusion-policy/fusion-policy.json` |
| `pnpm fusion:reach` | `services/harness/src/fusion-reachability-cli.ts` | `docs/ai/new1-fusion-policy/fusion-reachability.json` |
| `pnpm fusion:routable` | `services/harness/src/fusion-routing-feasibility-cli.ts` | `docs/ai/new1-fusion-policy/fusion-routable*.json` |
| per-court coverage | one bounded `GROUP BY` | `docs/ai/new1-fusion-policy/embedding-coverage-by-court.json` |

---

## THE HEADLINE

**`QUERY_ROUTED_HYBRID` as specified on 18 August must not ship.** Not because
the defect it addresses is imaginary — it is real and it replicates out of
sample — but because each of its three moving parts fails a check the sweep did
not run:

| part of the recommendation | verdict | the number |
| --- | --- | --- |
| the criminal routing SIGNAL | **survives** | +1.78 pts success@5 on held-out halves, 95% CI [0.00, 3.52], P(Δ>0) = 0.969 |
| `wSparse = 0.15`, the CONSTANT | **refuted** | fitting θ on a training half costs 0.72 pts vs the parameter-free form; θ lands on 0 in 49% of splits, 0.05 in 23%, **0.85 in 21%** |
| the coverage GATE (`AND document is embedded`) | **untested, and analytically backwards** | it changed **0 of 283** queries here; 100% of candidates in this benchmark are embedded, so the gate never fired |
| routing on `group` at all, IN PRODUCTION | **not implementable today** | the best precision-100% classifier recovers 20.5% of criminal queries; the routed policy then scores **−0.37 pts**, CI [−0.70, 0.00] |

**Ship nothing. Keep equal-weight RRF.** The recommended replacement is at the
bottom, and it routes on a signal the server actually has.

---

## 1 · THE SIGNAL SURVIVES — held out, 2,000 stratified split-halves

Repeated split-half, stratified so both halves keep the 83/200 criminal/civil
ratio. Tuned policies fit θ on the TRAIN half only and are scored on the TEST
half; untuned policies are scored on the identical TEST halves. Seed 20260819.

| policy | test succ@5 | test rec@20 | Δ vs EQUAL (95% CI) |
| --- | --- | --- | --- |
| DENSE_ONLY | 21.9% | 40.5% | +1.45 [−2.82, 5.63] |
| **CURRENT_EQUAL_RRF** | **20.4%** | **36.3%** | reference |
| CRIMINAL_DENSE_ONLY + CIVIL_EXISTING_HYBRID | **22.2%** | 37.7% | **+1.78 [0.00, 3.52]** |
| CRIMINAL_SPARSE_DOWNWEIGHT(θ fitted) + CIVIL_EXISTING_HYBRID | 21.5% | 37.6% | +1.06 [0.00, 2.82] |
| GLOBAL_DOWNWEIGHT(θ fitted) | 21.9% | 40.1% | +1.52 [−1.41, 4.23] |

Paired bootstrap on the full 283, 10,000 resamples, stratified, identical draws
shared across comparisons:

| comparison | Δ succ@5 | 95% CI | P(Δ > 0) |
| --- | --- | --- | --- |
| CRIMINAL_DENSE_ONLY − CURRENT_EQUAL | **+1.76** | [0.00, 3.53] | **0.969** |
| DENSE_ONLY − CURRENT_EQUAL | +1.42 | [−2.47, 5.30] | 0.734 |
| CRIMINAL_DENSE_ONLY − DENSE_ONLY | +0.34 | [−3.18, 3.89] | 0.538 |

Criminal subgroup alone (n = 83): EQUAL 10.8% [4.8, 18.1] vs routed 16.9%
[9.6, 25.3], **Δ +6.10 pts**.

**Three things this table settles.**

1. The criminal harm is not a fit to the 83 queries it was found on. Held out, on
   halves the policy never saw, it is still worth +1.78 points.
2. **Routing is not distinguishable from DENSE_ONLY on this benchmark**
   (+0.34, CI spanning zero). Routing's justification is therefore NOT that it
   beats dense-only — it is that it keeps the sparse arm for the 99.8% of the
   corpus dense cannot reach. That is a coverage argument, and §3 shows this
   benchmark is structurally incapable of testing it.
3. `GLOBAL_DOWNWEIGHT`, tuned exactly as hard, gets a similar mean with an
   interval that includes zero. The parameter-free routed form is the
   better-supported change of the two — which is an argument against the free
   parameter, not for it.

### The constant is refuted by its own histogram

θ chosen on the training half, across 2,000 splits:

```
CRIMINAL_SPARSE_DOWNWEIGHT   θ=0 ×49%   θ=0.05 ×23%   θ=0.85 ×21%   θ=1 ×7%
GLOBAL_DOWNWEIGHT            θ=0 ×2%  0.05 ×43%  0.1 ×6%  0.15 ×2%  0.5 ×10%  0.6 ×3%  0.85 ×30%  1 ×5%
```

A training half of 141 queries picks **0.85 more than a fifth of the time** and
**0.15 twice in a hundred**. `wSparse = 0.15` is not a weak estimate of the right
constant; it is one draw from a distribution that spans the whole grid. Tie-breaks
in this loop go to the LARGER weight deliberately — a flat surface must not drift
the policy toward dropping the sparse arm on noise.

And the fitted form is WORSE than the parameter-free one on held-out data
(+1.06 vs +1.78). The free parameter costs 0.72 points and buys nothing.

---

## 2 · THE COVERAGE GATE NEVER FIRED, AND ITS SHAPE IS BACKWARDS

`pnpm fusion:reach` took every candidate id the frozen run returned — 4,868
distinct judgments — and asked the database which carry a chunk.

```
embedded candidates      4868 / 4868   100.0%
dense arm returned       5659 / 5659   100.0% embedded
sparse arm returned      5660 / 5660   100.0% embedded
gold                      283 /  283   100.0% embedded
```

Re-running the fusion with and without the gate gives **identical numbers to
three decimal places** on every metric. The gate is a no-op on this benchmark, so
the 18 Aug recommendation's safety argument rests on a term that was never
exercised.

**Why 100%, and it is not a coincidence.** The CONTROLLED pass is `courts=[sc]`,
and the Supreme Court is the one court that is fully embedded:

| court | held | embedded | coverage |
| --- | --- | --- | --- |
| Supreme Court of India | 38,342 | 38,341 | **99.9974%** |
| Gauhati High Court | 273,226 | 492 | 0.1801% |
| Patna High Court | 1,639,111 | 1,208 | 0.0737% |
| Allahabad / Bombay / Madras / P&H / Telangana / Rajasthan / Karnataka / Orissa … | 11.6M+ | **0** | **0.0000%** |
| **all 26 courts** | **17,945,147** | **40,161** | **0.2238%** |

Embedding coverage is **court-shaped and effectively binary**: one court at ~100%,
every other court at or below 0.46%. (Note the denominator: 17,945,147 judgments
as of 19 Aug, up from the 14,973,372 in LCC's bus 0723 — NEW2 has been ingesting
under it, so the 0.42% figure in the 18 Aug sweep is stale twice over.)

**The gate's direction is wrong where it would fire.** Written as
`wSparse = θ if criminal AND embedded, else 1`, it removes sparse influence from
exactly the documents the dense arm CAN rank, and leaves full sparse weight on the
documents the dense arm cannot see. In a mixed-court result set that **promotes
unembedded documents relative to embedded ones** — the opposite of the intent. On
a pure-HC criminal query, where ~100% of candidates are unembedded, it is a
complete no-op. Neither behaviour is visible here because here everything is
embedded.

This is not a tuning detail to fix later. **A per-document coverage term inside
RRF changes the relative order of the two populations, which is not what
"preserve coverage" means.** Coverage belongs on the CANDIDATE UNIVERSE, not on
the individual document — §5.

---

## 3 · THE ROUTER CANNOT SEE WHAT IT ROUTES ON

The benchmark's `group` is not a property of the query. `build-queries.ts`
selects candidates with `AND ci.case_type::text = ${caseType}` — the `case_type`
of the **citing** judgment the passage was cut from. Production
(`services/api/src/search/route.ts`) exposes `filters.caseType` as an **optional
user-supplied filter** and derives nothing from query text.

So the shippable question is not "does routing help given a perfect label" but
"can the label be produced". Measured with a transparent 39-marker lexicon
(BNS/BNSS/BSA and IPC/CrPC/Evidence Act both sides of the July 2024 transition,
POCSO/NDPS/UAPA/PC Act/NI Act, plus criminal procedural vocabulary):

| threshold | queries routed criminal | precision | recall |
| --- | --- | --- | --- |
| 1 marker | 46 | 93.5% | 51.8% |
| 2 markers | 17 | **100.0%** | 20.5% |
| 3 markers | 8 | 100.0% | 9.6% |

And the policy run on the classifier's labels instead of the oracle's:

| policy | succ@5 | vs EQUAL | held-out Δ (95% CI) |
| --- | --- | --- | --- |
| ROUTED (oracle label) | 22.3% | +6/−1 | +1.78 [0.00, 3.52] |
| ROUTED (lexicon, threshold 1) | 20.5% | +1/−1 | −0.02 [−0.70, 0.70] |
| ROUTED (lexicon, threshold 2) | 20.1% | +0/−1 | **−0.37 [−0.70, 0.00]** |
| ROUTED (lexicon, threshold 3) | 20.5% | +0/−0 | +0.00 [0.00, 0.00] |

**Every implementable version of the policy is worth between −0.37 and +0.00
points.** The entire +1.78 lives in the gap between the oracle label and any
label the server can compute. A better classifier might close some of it; nobody
has built or measured one, and until they do the routed policy is a result about
a signal we do not have.

Worth stating why the lexicon fails, because it is not laziness: the queries are
**passages cut from judgments**, and a passage from a criminal judgment
frequently discusses evidence, limitation or procedure in language that carries no
criminal marker at all. 66 of 83 criminal queries contain fewer than two markers.
The label is a property of the CASE; the query is a paragraph from it.

---

## 4 · WHAT IS STILL TRUE FROM 18 AUGUST

Unchanged and re-confirmed by this run:

- EQUAL is worse than DENSE_ONLY on this set at every `k` tested.
- The criminal damage is one-sided: EQUAL destroys 6 criminal dense successes at
  top-5 and creates 0. (The sweep said 7; this tool counts 6 under its own
  depth-20 reconstruction. The direction and the one-sidedness are identical, the
  count differs by one query at the boundary.)
- The displacers are real and they are sparse-only: of 46 documents that outrank
  gold in the damaged criminal queries, **18 appear in no dense list at all**.
- 0055 remains quality-neutral. Nothing here re-opens it.

---

## 5 · THE REPLACEMENT RECOMMENDATION

Two changes, in this order. Neither needs a constant and neither needs a
classifier.

### 5.1 · HOLD. Keep equal-weight RRF in production.

No policy measured here is positive on an implementable signal. The correct
action on this evidence is to change nothing in `retrieve.ts` and to stop
treating `wSparse` as the lever.

### 5.2 · When a signal exists, route on the EXACT one, gated on the UNIVERSE

```
wSparse(request) =
    0     if  request.filters.caseType === 'criminal'          // explicitly set by the user
          and  every court in scope has embedding coverage ≥ COVERAGE_FLOOR
    1     otherwise
```

Both terms are exact, server-side, and free:

- **`filters.caseType`** already exists in the contract and is user-asserted, so
  there is no classifier error to propagate. Its production frequency is unknown
  to this lane and should be measured before anyone estimates the win.
- **The coverage term is on the QUERY'S CANDIDATE UNIVERSE, not on each
  document.** Today exactly one court clears any sensible floor
  (`Supreme Court of India`, 99.9974%); every other court is ≤ 0.46%, so the
  policy fires only where the benchmark's evidence actually applies and is inert
  everywhere else. As Tier A embedding lands, the set of qualifying courts widens
  from the coverage table itself — measured, never hand-edited.
- The `COVERAGE_FLOOR` value is not settled here. It is a product-risk choice
  about how much unreachable law is acceptable inside a filtered search, and it
  belongs with the coverage-state contract, not inside a WHERE clause.

**What is still owed before even 5.2 ships**: the criminal effect is 83 queries
in one court, CI touching zero, and Bonferroni-marginal. It deserves replication
on an independent criminal query set — which is exactly what the Tier-A expansion
benchmark (P6) will produce.

---

## CONFIDENCE

| claim | status |
| --- | --- |
| criminal routing signal survives held-out validation | **KNOW** — 2,000 splits, 10,000 bootstrap resamples, artifact on disk |
| `wSparse = 0.15` is unsupported | **KNOW** — θ histogram spans the grid; fitted form loses 0.72 pts to the parameter-free form |
| the coverage gate never fired in this benchmark | **KNOW** — 4,868/4,868 candidates embedded, identical metrics with and without it |
| the gate promotes unembedded documents where it does fire | **INFER** — arithmetic of weighted RRF, stated in §2; not observed, because no population here can exercise it |
| routing is not implementable on query text today | **KNOW** — lexicon at 100% precision recovers 20.5%; routed result −0.37 to +0.00 |
| per-court coverage table | **KNOW** — full `GROUP BY` over 17,945,147 rows, 39.5 s, 7 other backends active |
| a better classifier would recover the +1.78 | **GUESS — unverified.** Nobody has built one. Do not plan against it. |
