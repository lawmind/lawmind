# LONG-INPUT POLICY — R8.1

**Deliverable:** R8.1 §6.6 — *"measure representative ≤500, 500–1000, ~2500 and
~5000-character inputs only where product intends support. No silent truncation.
Unsupported input gets an explicit guideable outcome."*
**Lane:** NEW1 · **Date:** 26 Aug 2026 · **Status:** policy declared; the passage-arm
re-measurement is `NOT_MEASURED` and gated on the complete tranche.

---

## 1. The policy, in four lines

1. **Supported band: 1–500 characters.** This is the only band the production route
   accepts and the only one any product claim may rest on.
2. **Above 500: refuse, with guidance, and say nothing was shortened.** Already
   implemented, already the shipped behaviour, and it is not being widened this round.
3. **Never truncate, never condense silently.** A silently shortened query answers a
   question the advocate did not ask, and returns it with full confidence.
4. **The 500–5,000 bands are research bands.** They may be measured. They may not be
   reported as product behaviour, and a benchmark built from them is not a
   production-route benchmark.

---

## 2. "No silent truncation" is already satisfied, and this is the evidence

`services/api/src/search/route.ts:206–214` — read, not recalled:

```ts
query: z
  .string()
  .min(1)
  .max(500, {
    message:
      'This search is longer than we can currently run safely (500 characters). ' +
      'Nothing has been shortened — please search the key part of the passage instead.',
  }),
```

This satisfies R8.1 §6.6 on both counts, and it is worth being precise about why:

- **It rejects rather than truncates.** A Zod `.max()` fails the parse; nothing downstream
  ever sees a shortened string.
- **The refusal is guideable.** It states the limit, states explicitly that *nothing has
  been shortened*, and tells the advocate what to do instead. "Search the key part of the
  passage" is an action; "query too long" is not.

**So NEW1 requests no change here.** The R8.1 requirement is met by existing behaviour,
and the honest report is that it was already right rather than that this round fixed it.

---

## 3. Why the cap exists — and why raising it is not a model question

The single most misread fact in this area, so it is stated first:

> **The 500-character cap protects the sparse arm, not the model.**

Measured (P4, `LONG_FACT_SEARCH_CONTRACT_V1`): as input grows from 500 to 5,000
characters, cosine similarity to the **1,000-character prefix** falls `1.0000 → 0.6625`
while cosine to the **full text** rises `0.6435 → 1.0000`. The embedder reads the whole
input and represents it faithfully. It is not truncating and it is not degrading.

What does degrade is the lexical arm. A long paste contains many rare lexemes, and
production's own ranking rule refuses when `min(df)` across the query's terms is too high
to bound the candidate set — the mechanism NEW1 established in bus 1222 and LCC shipped as
`rarestDf` (commit `a0873d7`). Raising the cap therefore does not buy long-passage
research; it buys a larger sparse candidate set and a slower or refused query.

**Consequence for the roadmap:** long-input support is a *retrieval architecture* task
(a bounded passage path that never becomes a corpus-wide sparse scan), not a validator
constant. Changing the number without changing the path would move the failure from an
honest refusal to a slow one.

---

## 4. Measurements that exist, and exactly what each one licenses

### 4.1 Lifted-sentence queries — P4
| size | DIRECT | CONDENSED | CONTROL_500 |
| ---: | ---: | ---: | ---: |
| 500 | 8/25 | 8/25 | 8/25 |
| 1,000 | **4/25** | 8/25 | 8/25 |
| 2,500 | **4/25** | 8/25 | 8/25 |
| 5,000 | **4/25** | 8/25 | 8/25 |

**Licenses:** that appending noise to a sentence *lifted verbatim from the target* halves
retrieval, and that condensing restores it.
**Does not license:** any claim about what an advocate's paragraph of facts does. The
query here is nearly a duplicate of the target; the curve is the decay of a verbatim
overlap.

### 4.2 Posed (paraphrased) queries — V2
`0/6` at 500, 1,000, 2,500 and 5,000 characters, at rank 5 and at rank 20, on every arm
including `LEXICAL_RAREST3` — which P4 had documented in its header and never actually run.

**The floor is already zero at 500 characters, where there is no dilution at all.** So
this experiment cannot answer the dilution question, and it is not evidence that long
input fails.

**Why it is zero is a coverage wall, not a length effect:** of 19 targets, **2** are in
`new1_probe_half_250k`, the index that was searched. 12 have a staged document vector; 4
are in shipped `judgment_chunks`. *The documents the question is about are not in the
index that would answer it.* `adverse_authority` and `pasted_passage` have zero targets in
the probe.

**n = 6, effective n = 2.** No rate, no interval and no between-arm comparison is
supportable at that size.

### 4.3 The condenser finding — the one that changes a design
Advocate-word retention falls **0.924 → 0.244** as input grows from 500 to 5,000
characters. The condenser selects sentences carrying the rarest lexemes by measured
document frequency; pasted judgment text is rarer than an advocate's plain-English
framing, so **it keeps the pasted noise and discards the question.**

This is invisible in a lifted benchmark, where the query's own words *are* the target's
rare words, so selecting for rarity selects for the query. It appears the moment the query
is paraphrased.

> A condenser that wins the benchmark by discarding the advocate's framing is winning the
> benchmark and losing the product.

Retention counts word overlap, not meaning — **0.244 is a floor on the loss, not a measure
of it.** Determinism, at least, is now measured rather than asserted: 24 condensation
pairs, 0 disagreements.

**Status: condensation is `UNTESTED`, not refuted.** Flat at 8/25 in P4 and flat at 0/6 in
V2 — flat at zero is not evidence of robustness. It remains the best available design and
has no posed-query support in either direction.

---

## 5. What R8.1 §6.6 asks me to measure, and what I will

§6.6 says to measure the bands **"only where product intends support."** Product intends
support at ≤500 characters and explicit refusal above it. So:

| band | on the complete tranche | reported as |
|---|---|---|
| ≤ 500 chars | **measured**, all four arms, per family | product behaviour |
| 500–1,000 | measured | research band, off-route |
| ~2,500 | measured | research band, off-route |
| ~5,000 | measured | research band, off-route |

Every off-route number carries the label in the artifact itself, not in a footnote. The
reason is Fifth's finding in bus 1264 and it is a live one: **90 of 480 Gold V2 queries
(18.75%) exceed 500 characters** — 43/60 `long_narrative` (max 1,800) and 47/60
`pasted_passage` (max 600) — and **cannot enter the production route at all**. 89 of the
90 are body-safe and 35 are retrievable today, so this is not the unavailable-target
population; it is a route-compatibility gap. A benchmark that scores those queries against
a direct passage evaluator and reports the result as production retrieval would be
measuring a route the advocate cannot reach.

**Any such query, if scored on the production route, is a REFUSAL outcome scored
separately — never a miss, and never silently clipped to fit.**

---

## 6. Open, and explicitly not decided here

- **Whether the 500 cap moves.** A product decision resting on the lexical arm's safety,
  not on any measurement in this file. NEW1 researches the bounded passage path; LCC
  implements only once a measured design exists; NEW3 builds UX only once the backend
  contract does. That sequence is recorded in the route's own comment and this file does
  not shortcut it.
- **Whether condensation ships.** Needs a posed-query benchmark whose targets are actually
  in the index being searched. The V2 coverage wall means no such measurement exists yet.
- **A retention metric that measures meaning rather than word overlap.** 0.244 is a floor
  on the loss and the true loss is unmeasured.

## 7. Re-measurement pending

Everything in §4 was measured against `new1_probe_half_250k` or the HEAD arm. **None of it
has been re-run against the complete passage tranche**, and the coverage wall that
produced the 0/6 result is precisely the condition the passage build is meant to change.
Until then this policy rests on the *route* evidence (§2, §3), which is current and
code-verified, and not on the *retrieval* evidence, which is not.
