# THE FIRST LOCAL RETRIEVAL BASELINE — 17 August 2026

**Owner: NEW1.** Status: **PARTIAL — the run is still in flight.** Everything
below is OBSERVED unless it says otherwise. Sections marked PENDING have not
been measured and must not be quoted as zero.

Raw output: `docs/ai/new1-local-baseline/baseline-local.log`.

---

## 0. THIS IS NOT A REGRESSION, BECAUSE THERE IS NOTHING TO REGRESS FROM

The obvious reading of the numbers below is "retrieval got worse after the
migration". **There is no evidence for that, in either direction.**

`docs/ai/PRE_MIGRATION_RETRIEVAL_BASELINE.md` §0 records that the pre-migration
Gate S2 run was **killed** on the 16 Aug stop-order before scoring finished, that
`HARNESS_JSON` only writes at the very end of `main()`, and that the artefact is
empty. **Zero per-query ranks, zero `success@5`, zero `precision@5`, zero
`recall@20`, zero `MRR` were ever produced.**

So this is the **first measurement of these numbers that has ever existed on this
benchmark**. It is a baseline in the literal sense: the first point, with no
second point to draw a line to.

It is entirely plausible that growing the corpus 79,321 → 7,296,068 degraded
retrieval. That is a hypothesis, not a finding, and this document does not
support it.

## 1. CORPUS UNDER MEASUREMENT

    judgments          72,96,068
    embedded chunks     6,20,300
    citation edges      1,15,041
    overruled                 95

`judgment_chunks` covers a small fraction of `judgments`. That is expected —
chunking is Supreme-Court-led — and it is **not** the cause of the failures in
§3; see §4.

## 2. THE QUERY SET

Gate S2's own set: **25 of 30**. The 5 missing are BNS queries, `NOT WRITTEN`,
blocked on Workstream C1 — `statute_mappings` holds no rows. Their absence is
recorded by the harness itself and is not a silent gap.

## 3. RETRIEVAL QUALITY — MEASURED

    criminal   n=10   success@5 10.0%   never retrieved 7
    civil      n=10   success@5 40.0%   never retrieved 5
    hindi      n= 5   success@5 20.0%   never retrieved 2

    mean precision@5  4.8%
    recall@20        44.0%
    MRR              0.219
    DRM              95.2%

**14 of 25 gold authorities are not returned anywhere in the top 20.**

The per-query detail — including the near-misses, which matter because they point
at ranking rather than retrieval — is in the log:

    criminal-96f5c829   found at 16      civil-5e38aa21   found at 8
    criminal-e39b2b83   found at 11      hindi-187694cc   found at 12
    hindi-bcc47cbd      found at 8

Five queries retrieve the right authority and rank it out of the top 5. Those are
a different problem from the fourteen that never surface it at all, and they
should never be pooled into one "failure" bucket.

## 4. THE COMFORTABLE EXPLANATION IS DEAD — MEASURED, NOT ASSUMED

`NOT RETRIEVED` covers three findings that call for three different responses:

| | | fix |
| --- | --- | --- |
| **ABSENT** | not in `judgments` at all | acquire the corpus. No ranking change helps. |
| **UNEMBEDDED** | present, zero chunks | embedding coverage — the pilot-population question |
| **REACHABLE** | present and embedded, still missed | **retrieval.** Only this belongs in a ranking experiment. |

`pnpm gold:presence`, every lookup by primary key, across **all 308 queries and
278 distinct gold judgment ids**:

    ABSENT        0
    UNEMBEDDED    0
    REACHABLE   278      civil 210/210 · criminal 93/93 · hindi 5/5, all 100%

**Every gold authority is present and embedded.** The failures in §3 are genuine
retrieval failures. They cannot be attributed to corpus coverage or to embedding
coverage, and the most comfortable available explanation is therefore unavailable.

This also answers NEW2's 0631 concern from the retrieval side: no gold authority
is sitting in the classifier's `unclassified` residue.

## 5. THE EXACT-CITATION HOT PATH IS NOT WHAT IS FAILING

Measured with `classifyQuery` + `warrantsExactLookup` before any run: **zero of
the 308 eval / derived / hand queries route to `exactCitation`.**

LCC's migration `0052` took `cite:` from **15.31 s → 0.1 ms** and `exactCaseTitle`
from **47.85 s → 0.0 ms** (bus 0649), with rows verified identical before timings
on every probe. That is a real fix to a real production hot path — and it **cannot
move any number in §3**, because none of these queries goes near it.

The two facts are orthogonal and must not be quoted against each other in either
direction. The corollary is a gap in **this lane**: the exact-citation path is
graded only by the adversarial cases and the structured gate, never by the eval
set. Recorded in `NEW1_CX1_BENCHMARK_CONTRACT.md` §2.

## 6. LATENCY — DELIBERATELY NOT REPORTED FROM THIS RUN

Two samples 20 s apart during the run showed **my backend and LCC's
`hotpath-measure` backend both active**; LCC's later observation (0654) showed the
cluster idle with only my run on it. So the run **started contended and finished
clean**.

That is worse than either state for a latency series, so **no per-query latency
figure from this run will be quoted.** A single unopposed timing pass is owed,
now that LCC's index builds are finished.

What is safe to say, because it is an order-of-magnitude observation rather than a
measurement: individual retrieval queries were observed running **2–4 minutes**,
against Gate S1's **3-second** budget. See §7 — the cause is being isolated
separately.

## 7. THE STRUCTURAL PROBLEM THIS RUN EXPOSED

The harness issues one retrieval per gold query, then up to ~100 more in the
overruled leakage/staleness sections (`overruled-checks.ts` — `LIMIT 50` plus a
sample). At the observed per-query cost, **one full Gate S2 pass takes hours.**

That is not merely inconvenient. The founder's directive is a continuous loop —
*baseline → failure bucket → experiment → rerun → next bucket*. **A loop whose
measurement step costs hours is not a loop.** Reducing per-query retrieval cost is
therefore a prerequisite for the entire experiment programme, not a nice-to-have
that comes after it.

The suspect, from reading the query the harness actually issues: the lexical arm
ORs up to 40 lexemes (`ORDER BY length(lexeme) DESC LIMIT 40`) and then
`ORDER BY ts_rank(...)` over **every** match. The lexeme cap bounds query length
but not match breadth — OR-ing 40 terms maximises the matched set, and `ts_rank`
must then be computed per matching row. Whether the cost is the index probe or the
rank computation is **being measured now**; they have opposite fixes, so it will
not be guessed.

**PENDING — do not quote as zero:** the isolation of probe cost vs rank cost.

## 8. NOT YET MEASURED IN THIS RUN

The run had not reached these when this file was written. **Absent is not zero
and is not a pass:**

- overruled leakage · stale-overruled rate
- `structuredExactness` · `fieldPrecision` (release gates, threshold 1)
- `hallucinationRate` · `silentDropRate` · `adversarialPassRate`

### 8a. A stale claim in `CURRENT_PLAN.md`, caught before it was repeated here

`hallucinationRate` and `silentDropRate` need an LLM key. `docs/CURRENT_PLAN.md`
§110 states:

> **`OPENROUTER_API_KEY` is set** (73 chars) and `ANTHROPIC_API_KEY` is set.

**Checked directly, not taken on trust: neither is set** — not in `.env`, not in
this session's environment. So those two metrics will read `not measured` in this
run, exactly as they did pre-migration, and for the same reason.

This draft originally repeated the plan's claim as though it were an observation.
It was not; it was a nine-day-old note about a different environment. Recorded
because a metric that reads `not measured` for an unnoticed reason is how a gate
quietly stops gating — and because `CURRENT_PLAN.md` §110 needs correcting by
whoever owns it.

## 9. WHAT HAPPENS NEXT, IN ORDER

1. Finish the run; record §8 rather than leaving it absent.
2. Isolate the per-query cost (§7). It gates everything else.
3. One unopposed latency pass (§6).
4. Failure taxonomy over the 14 never-retrieved and the 5 rank-only misses —
   **as separate populations**, because they are different defects.
5. Only then: experiments. `BENCHMARK_FROZEN` to CX1 with a path and SHA-256.
