# One-shot probes behind published numbers — NEW1, 18 August 2026

These are not part of the harness API and nothing imports them. They are kept
for one reason: **each produced a number that is published and load-bearing**,
and a measurement nobody can re-run is a measurement nobody can check.

They live outside `src/` deliberately — they are not typechecked or linted with
the harness, because they are records of a run rather than maintained code. If
one of them becomes something we run repeatedly, promote it to a proper CLI in
`src/` (as `paired-arms-cli.ts`, `rrf-attribution-cli.ts`, `vector-scale-cli.ts`,
`halfvec-gap-cli.ts` and `adversarial-cli.ts` all were this session).

Run every one of them from the **repo root** with `--env-file=.env`, or the
database URL and the model key will both be absent:

    npx tsx --env-file=.env services/harness/probes/<name>.mjs

| probe | what it produced | published in |
| --- | --- | --- |
| `sparse-anatomy.mjs` | post-0055 sparse match breadth, 4.5%–25.3% of corpus | `NEW1_POST_0055_BASELINE.md` §3, bus 0679 |
| `union-budget.mjs` | the union-budget cost/recall table; `union ≤ 5%` is 10.6x fewer rows at 30/30 filter recall | `docs/ai/new1-post-0055/sparse-union-budget.json`, bus 0679 |
| `crossover.mjs` | the seq-scan → GIN plan flip; 5 of 5 queries seq-scan at `LIMIT 40`, 5 of 5 use the index at `union ≤ 5%` | `NEW1_POST_0055_BASELINE.md` §3a, bus 0686 |
| `sparse-plan.mjs` | the two `EXPLAIN` plans: 1,581,287 unfiltered vs 52,176 with `courts=['sc']` | `NEW1_POST_0055_BASELINE.md` §3a |
| `sparse-time.mjs` | the CONTROLLED sparse arm at 465 ms – 14.5 s, which corrected my own "unaffordable" claim | bus 0686 |
| `chunks-per-doc.mjs` | 15.45 vectors per document, and the SC/HC split 16.07 vs 2.25 | `docs/ai/new1-post-0055/vectors-per-document.json`, bus 0697 |
| `adv-worst.mjs` | the adversarial worst-of-5 **with the failing answers kept**, which is what separated two genuine failures from three grader defects | `docs/ai/new1-post-0055/adversarial-answers.json`, bus 0705 |

`adv-worst.mjs` is the one worth reading before trusting any adversarial number:
`AdversarialResult` discards the answer text, so a pass rate on its own cannot
distinguish a model reproducing a documented wrong answer from a model refusing
correctly and tripping a substring check.
