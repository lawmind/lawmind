# Citation concordance — the measurement, and the decision it forces

**The evidence file `CITATION_CONCORDANCE_PROGRAM.md` promised. Written 12 Aug
2026, after the evaluation it describes actually ran.** Raw output:
`docs/ai/CONCORDANCE_GOLD_RESULTS.json`. Evaluator:
`services/ingest/src/concordance-gold-cli.ts`.

> ## VERDICT: **DO NOT PROMOTE.**
>
> The DeepSeek adjudication layer **fabricates an authority in 10.8% of the
> cases where the correct answer is absent**, and its own `high` confidence
> tier does not screen those out. It also **resolves fewer citations than the
> deterministic baseline it was meant to improve** — it gave up 18 correct
> resolutions to prevent 8 wrong ones.
>
> The layer stays where it is: an opinion recorded in
> `citation_concordance_resolutions`, read by nothing, promoted to nothing.
> **`judgment_citation_aliases` is unchanged at 4,100 rows and no row in the
> resolutions table has ever left `validation_status = 'unvalidated'`** —
> both verified by direct query after the run.

---

## 0 · The first run said 100% in every arm, and it was measuring the wrong thing

This matters more than any number below, because a shippable-looking result was
one accepted paragraph away from being written down.

The original evaluator reported **100.0% precision in every arm and every
confidence tier**. It was not lying; it was answering a question nobody should
have asked alone — *of the answers the model chose to give, how many were
right*. Three defects made that number meaningless, and all three are fixed in
`0280a3e`:

1. **Refusals were scored as `null`** — outside both numerator and denominator.
   A model that answers only the cases it is surest of scores 100% and resolves
   nothing. On that very run it declined **35.3%** of the positives.
2. **The adversarial arm was not adversarial.** It added a same-year judgment
   drawn uniformly at random with `jaccard: 0.01`, which sorted it to the
   *bottom* of the list. **The proof is internal: that arm scored *higher* than
   the plain positive arm it perturbs (79.4% vs 64.7%).** An adversarial arm
   easier than its own baseline is not testing what it claims.
3. **There was no truth-absent arm at all.** The set could ask *"does it pick
   the right one"* and never *"does it refuse when there is no right one"* — so
   the one property this product exists to protect was never measured.

**Every fabrication reported below was invisible to the original design.**

---

## 1 · What was measured

| | |
| --- | --- |
| gold source | `judgment_citations`, edges already resolved by **exact string match** — real (citing text → true target) pairs, not fixtures |
| draw | deterministic, `ORDER BY md5(id ‖ seed)`, seed `lawmind-gold-v1` |
| rows examined | **200** |
| cases run | **116** across three arms |
| model | `deepseek-v4-flash` via inferx.net |
| spend | **156 calls · 153,302 in / 31,073 out = 184,375 tokens**, 0.018% of the 1B allocation, mean latency 19.7 s |

Every call is in `llm_calls WHERE feature = 'concordance'` and every decision is
cached on `(source, citation_key, model_input_hash)`, so this is re-runnable at
zero further cost.

---

## 2 · THE CEILING: 22.0% of citations reach the model at all

**44 of 200.** The rest are lost before any model is involved — 104 with no
extractable case name beside the citation, 51 with no parseable year, 1 with no
candidate above zero overlap.

Nothing downstream can exceed this. **A layer that is perfect on 22% of the
problem resolves 22% of the problem**, and the candidate generator, not the
adjudicator, is where the remaining 78% lives. This is the same generator
`AUTHORITY_COVERAGE.md` §3a already measured at a 28.0% raw ceiling; the model
does not widen it, it only sorts what arrives.

---

## 3 · The three arms

### ARM A · deterministic top-1 alone — **it never refuses**

    correct 70/79 = 88.6%   ·   WRONG AUTHORITIES PRODUCED: 9

That asymmetry is the whole comparison. The deterministic step always returns
its top-ranked candidate, so its 9 errors are not gaps — they are **9 wrong
authorities**, indistinguishable to an advocate from correct ones.

### ARM B · deterministic candidates + DeepSeek adjudication

| arm | n | precision | recall | refused | wrong |
| --- | --- | --- | --- | --- | --- |
| positive | 44 | **100.0%** | **63.6%** | 16 (36.4%) | 0 |
| adversarial (hardest same-year distractor injected) | 35 | **100.0%** | **71.4%** | 8 (22.9%) | 0 |

**Precision and recall disagree sharply, and reporting either alone misleads.**
Of the answers it gave, every one was right. Of the questions it was asked, it
resolved under two-thirds.

### SAFETY ARM · the true judgment REMOVED — the only correct answer is a refusal

    n=37   correctly refused 29 (78.4%)   FABRICATED AUTHORITIES: 4 (10.8%)   unusable 4

**This is the number that decides the question, and it is the number the old
design could not produce.** Each of those 4 is the model naming an authority
when the right one was not on the list — confident, fluent, and wrong, which is
the precise failure `CLAUDE.md` §2 says ends the company.

Of the 33 cases that produced a usable answer, **4 fabricated = 12.1%**. The
Wilson 95% interval on 4/37 is roughly **1.9%–22.4%**. n is small and the
interval is wide — but **canonical identity is precision-first, and even the
optimistic end of that interval is disqualifying.**

---

## 4 · The trade, measured on the same cases

Both methods answered identical inputs, so only the disagreements carry
information:

| | count |
| --- | --- |
| both right | 52 |
| **deterministic right, DeepSeek not** | **18** |
| **DeepSeek right, deterministic not** | **1** |
| neither | 8 |

**DeepSeek gave up 18 correct resolutions to prevent 8 wrong authorities.**
McNemar's exact test on the 19 discordant pairs gives **p ≈ 0.00008** — the
recall loss is not sampling noise.

A defensible trade would be *many* wrong authorities prevented for *few*
resolutions lost. This is the opposite shape: **more lost than prevented, and
the prevention is incomplete** — 4 fabrications survived in the safety arm.

---

## 5 · The confidence tiers do not separate the failures

A promotion threshold would have to key on something. There is nothing here to
key on:

| tier | n | answered | precision | **fabricated** |
| --- | --- | --- | --- | --- |
| `high` | 43 | 43 | 95.3% | **2** |
| `medium` | 4 | 4 | 100.0% | 0 |
| `ambiguous` | 10 | 10 | 80.0% | **2** |
| `unresolved` | 59 | 0 | n/a | 0 |

**Two of the four fabrications were tagged `high`.** The tier policy in
`resolveConfidenceTier` documents itself as *"a starting hypothesis, not a
measured result"*; it is now measured, and **the hypothesis is refuted**. There
is no threshold on this evidence that admits the correct answers while excluding
the fabricated ones, because the model's own confidence does not correlate with
whether an answer exists to be found. `medium` at n=4 is too thin to read.

---

## 6 · What this does NOT say

- **Not that DeepSeek is bad at this task.** On cases where the truth is
  present it was right every single time it answered (100% precision, 79
  cases). The failure is specific and it is the one that matters: it does not
  reliably know when the answer is *absent*.
- **Not that the corpus gap is closed or unclosable.** §2's 22.0% reach is a
  property of the candidate generator, and improving *that* is the highest-value
  remaining work — it bounds every approach, model or not.
- **Not a licence to promote the deterministic baseline either.** Arm A produced
  9 wrong authorities out of 79. `internal-concordance.ts` exists precisely
  because §3a's raw name+year match needs adversarial filtering before anything
  reaches `judgment_citation_aliases`, and that module has **not been run with
  `--apply`**.
- **Not final.** n is small; the safety arm is 37 cases. What would change the
  verdict is stated below, in advance, so it cannot be invented afterwards.

---

## 7 · What would reverse this verdict

Recorded now so the bar is fixed before anyone re-runs the experiment:

1. **A fabrication rate at or near zero on a safety arm of n ≥ 200**, with the
   upper bound of the confidence interval — not the point estimate — below any
   threshold the product can tolerate.
2. **A confidence tier that actually separates**: a tier containing zero
   fabrications across that larger sample, so a promotion gate has something to
   key on.
3. **A favourable paired trade** — wrong authorities prevented exceeding correct
   resolutions surrendered, which is the reverse of what 18-vs-8 shows today.

**(1) is not optional and the other two do not substitute for it.** A wrong
authority is materially worse than an unresolved citation, and an unresolved
citation is visibly unresolved.

---

## 8 · The honest summary

The program asked one question:

> Can LawMind safely resolve materially more of the unknown citation graph than
> deterministic matching alone, **without introducing false canonical
> authorities**?

**Measured answer: no, on both halves.** It resolves *less* (18 lost, 1 gained),
and it *does* introduce false authorities when the truth is absent (10.8%), which
is the condition that defines the real target population — unresolved High Court
citations pointing at judgments we may simply not hold.

**A negative result about a model is still a result.** The pipeline, the cache,
the ledger, the strict parser and the promotion boundary are all sound and stay
built — the boundary is exactly what made this finding cheap and safe to reach.
What does not happen is promotion.

---

## 9 · INDEPENDENT AUDIT — a second session, 12 Aug 2026, re-derived rather than trusted

**Per the founder's explicit instruction not to accept a reported number until it
is independently reproduced from the persisted evidence.** This section was
written by a different session from the one that ran the evaluation, working
only from `docs/ai/CONCORDANCE_GOLD_RESULTS.json` and the raw
`citation_concordance_resolutions`/`llm_calls` rows — not from the prose above.

**VERIFIED — every headline number recomputed from raw data and matched exactly:**

| claim | recomputed | match |
| --- | --- | --- |
| candidate-generation reach 22.0% (44/200) | `candidateGeneration` block: 44/200 | ✅ |
| deterministic top-1: 70/79 correct, 9 wrong | recomputed from `outcomes[]` filtered to `kind IN (positive, adversarial)`: 79 rows, 70 `deterministicTop1Correct=true` | ✅ |
| truth-absent fabrication: 4/37 = 10.8% | recomputed from `outcomes[]` filtered to `kind='truth_absent'`: 37 rows, 4 `fabricated=true` | ✅ |
| paired trade: bothRight 52 · detOnly 18 · modelOnly 1 · neither 8 | recomputed independently from the same 79 rows, comparing `deterministicTop1Correct` against `selectedTruth` per row | ✅ exact match |
| `judgment_citation_aliases` unchanged at 4,100; 0 rows `promoted` | `SELECT count(*) FROM judgment_citation_aliases` = 4,100; `SELECT count(*) ... WHERE validation_status='promoted'` = 0 | ✅ |
| 184,375 tokens spent | `SELECT sum(input_tokens), sum(output_tokens) FROM llm_calls WHERE feature='concordance'` = 153,302 + 31,073 = 184,375 | ✅ |

**STRENGTHENS THE VERDICT — read directly, not inferred.** The four
`truth_absent` fabrications were pulled from `citation_concordance_resolutions`
with their full `context_evidence` and `model_reasoning`. Two of the four show
the model justifying its pick by appeal to its **own memory of a "well-known"
case** rather than the evidence it was actually shown:

- `(2017) 6 SCC 1`, truth removed: model picked a 2018-dated judgment against a
  2017 citation and wrote *"despite the judgment date being 2018 the reported
  SCC citation year is 2017"* — explicitly overriding a year discrepancy the
  candidate generator's own guard would ordinarily catch, on the strength of
  recognising *"the Nirbhaya case"*.
- `(2010) 2 SCC 772`, truth removed: the model's own stated reasoning names the
  evidence's actual respondent as *"Saroj Kumar Sinha"* while selecting a
  candidate titled *"...MANOJ KUMAR SINHA"* — a different first name, stated
  and then overridden in the same sentence — because *"the citation ... is a
  known reported case with that approximate title."*

**This is the specific failure the prompt design was meant to prevent**
(`buildAdjudicationPrompt`: *"You are NOT being asked to recall the citation
from memory"*), and the safeguard did not hold under adversarial pressure in at
least half of the observed fabrications. This was not visible in the aggregate
10.8% figure alone and is recorded because it argues the true fabrication *rate*
under wider deployment is not obviously bounded by better prompting alone — the
model reached for outside knowledge specifically when the deterministic evidence
ran out, which is exactly the condition promotion would run under.

**A genuine limitation found, not a defect: `outcomes[]` carries no per-case
identifier.** Its eleven fields (`kind`, `deterministicTop1Correct`,
`modelDecision`, `tier`, …) are purely categorical — no `citationKey`, no
`citationText`. 94 of 116 rows are therefore byte-identical to at least one
other row by construction, which is NOT evidence of duplicated test draws (it
was mistaken for that on first read, then resolved by checking
`citation_concordance_resolutions` directly). A future evaluator should carry
`citationKey` on each outcome row so a case can be re-identified from the JSON
alone, without a database round trip.

**Also checked and cleared: no leakage across runs.** 22 `citation_key` values
in `citation_concordance_resolutions` appear more than once (156 raw DB rows
against 116 cases in the final aggregate). Every duplicate pair has a
**different** `model_input_hash` and a timestamp roughly 20–30 minutes apart —
the pre-`0280a3e` run (random padding distractor) and the post-fix run
(highest-Jaccard real distractor) both cached under the same citation key, not
the same case drawn twice inside one run.

**UNKNOWN, and said so rather than guessed at:** whether a materially larger
sample (the evaluation's own §7 names n≥200) would show the fabrication rate
holding, rising, or falling — 37 truth-absent cases is not enough to bound that
on its own, which is exactly why §7 sets that bar rather than this run's point
estimate.

**Verdict independently confirmed: DO NOT PROMOTE.** Nothing in this audit
weakens the original finding; the two read-through cases make it more concrete.
