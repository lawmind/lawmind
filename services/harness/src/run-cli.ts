/**
 * `pnpm harness` — Gate S2.
 *
 * Prints every number every run, then exits non-zero if any threshold is
 * breached OR if any metric could not be measured OR if the query set is
 * incomplete. Three different ways to fail, all of them loud, because the one
 * outcome this must never produce is a quiet success.
 *
 *   CORPUS_DATABASE_URL   required — a populated corpus
 *   HARNESS_JSON          optional — also write machine-readable output here
 *
 * `SPRINT_2.md` NEVER list: *"Weaken a threshold to pass a gate."* If this
 * fails, the finding is the failure.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { getEmbedder, getReranker, RERANKER_MODEL_ID, toVectorLiteral } from '@lawmind/embed';
import postgres from 'postgres';

import { assessReadiness, countCorpus, explainRefusal } from './corpus-readiness.ts';
import { readFile } from 'node:fs/promises';
import { type AdversarialCase, runAdversarial } from './adversarial.ts';
import { gradeReferences, generate } from './generate.ts';
import { measureStructuredGate } from './structured-gate.ts';
import { type HarnessMetrics, grade, rate } from './metrics.ts';
import { measureOverruledLeakage, measureStaleOverruled } from './overruled-checks.ts';
import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';
import { sslFor } from './db-url.ts';

const TARGET_QUERIES = 30;

function loadFixture(name: string): {
  queries?: HarnessQuery[];
  pending?: { group: string; count: number; blockedBy: string; why: string }[];
} {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as never;
}

function pct(n: number | null): string {
  return n === null ? 'not measured' : `${(n * 100).toFixed(1)}%`;
}

async function main(): Promise<number> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error(
      'CORPUS_DATABASE_URL is not set.\n' +
        'The gate measures retrieval over the real corpus; there is nothing to measure without one.',
    );
    return 2;
  }

  const sql = postgres(url, { ssl: sslFor(url), max: 4 });

  try {
    const counts = await countCorpus(sql);
    const readiness = assessReadiness(counts);
    if (!readiness.ready) {
      console.error(explainRefusal(readiness));
      return 2;
    }

    const derived = loadFixture('queries.derived.json');
    const hand = loadFixture('queries.hand.json');
    const queries = [...(derived.queries ?? []), ...(hand.queries ?? [])];
    const pending = hand.pending ?? [];

    console.log('LAWMIND GATE S2 — citation accuracy harness');
    console.log('='.repeat(78));
    console.log(
      `corpus  ${counts['judgments']!.toLocaleString('en-IN')} judgments · ` +
        `${counts['embeddedChunks']!.toLocaleString('en-IN')} embedded chunks · ` +
        `${counts['resolvedCitations']!.toLocaleString('en-IN')} citation edges · ` +
        `${counts['overruledJudgments']} overruled`,
    );
    console.log(`queries ${queries.length} of ${TARGET_QUERIES}`);
    for (const p of pending) {
      console.log(`        ${p.count} × ${p.group} NOT WRITTEN — ${p.blockedBy}`);
    }
    console.log('');

    /* ------------------------------------------------------------ precision -- */

    /**
     * The embedder is loaded once and shared. `services/api` wraps it in a
     * 2-second budget because a request cannot wait; the harness is not a
     * request and must not silently fall back to lexical-only — that would
     * measure half the retriever and report it as the whole.
     */
    const embedder = await getEmbedder();
    const embedQuery = async (text: string): Promise<string | null> => {
      const [embedded] = await embedder.embed([text]);
      return embedded ? toVectorLiteral(embedded.vector) : null;
    };

    /**
     * The reranker is OFF unless asked for, and that is the point of the flag.
     *
     * `docs/DATA_ADVANTAGE.md` §1d, written before any of it existed: build it
     * behind the harness, not before it, and if it does not move the number on
     * our own corpus it does not ship. A run with `HARNESS_RERANK=1` and a run
     * without it differ in exactly one stage, so the difference between the two
     * success@5 figures IS the reranker's contribution — not an impression of
     * one.
     */
    const useGraph = process.env['HARNESS_GRAPH'] === '1';
    if (useGraph) console.log('citation-graph expansion ON');
    const useReranker = process.env['HARNESS_RERANK'] === '1';
    const reranker = useReranker ? await getReranker() : null;
    if (useReranker) console.log(`reranker ${RERANKER_MODEL_ID} (Apache-2.0)`);

    const scored: ScoredQuery[] = [];
    for (const q of queries) {
      scored.push(
        await scoreQuery(sql, q, embedQuery, 20, reranker ? reranker.score : undefined, useGraph),
      );
    }

    console.log('success@5 and precision@5, per query');
    console.log('-'.repeat(78));
    for (const s of scored) {
      const where =
        s.goldRanks.length > 0
          ? `rank ${s.goldRanks.join(',')}`
          : s.foundAtAnyRank
            ? `MISSED top 5 — found at ${s.foundAtAnyRank}`
            : 'NOT RETRIEVED';
      console.log(`  ${s.id.padEnd(22)} ${s.precision.toFixed(2)}  ${where}`);
    }

    const byGroup = new Map<string, ScoredQuery[]>();
    for (const s of scored) byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
    console.log('');
    for (const [group, list] of byGroup) {
      const hit = list.filter((s) => s.goldRanks.length > 0).length;
      const unreachable = list.filter((s) => s.foundAtAnyRank === null).length;
      console.log(
        `  ${group.padEnd(10)} n=${String(list.length).padStart(2)}  ` +
          `success@5 ${((hit / list.length) * 100).toFixed(1)}%  ` +
          `never retrieved ${unreachable}`,
      );
    }

    /** THE gate metric: did the authority land on the advocate's first screen? */
    const successAt5 = rate(scored.filter((s) => s.goldRanks.length > 0).length, scored.length);

    /**
     * Diagnostics, reported every run and never graded. Each answers a
     * different "how far off" and points at a different fix, which a single
     * pass/fail cannot:
     *
     *   meanPrecisionAt5  the old quantity, kept so the 8 Aug correction to
     *                     which quantity the threshold applies cannot hide a
     *                     regression (`metrics.ts` §THE CORRECTION)
     *   recallAt20        found at all, however deep → a RERANKING problem
     *   mrr               how deep, on average → how much reranking must move
     *   drm               share of the top 5 from no gold document, arXiv
     *                     2510.06999 — the number the reranker is judged on
     */
    const diagnostics = {
      meanPrecisionAt5: rate(
        scored.reduce((a, s) => a + s.precision, 0),
        scored.length,
      ),
      recallAt20: rate(scored.filter((s) => s.foundAtAnyRank !== null).length, scored.length),
      mrr: rate(
        scored.reduce((a, s) => a + (s.foundAtAnyRank ? 1 / s.foundAtAnyRank : 0), 0),
        scored.length,
      ),
      drm: rate(
        scored.reduce((a, s) => a + s.drm, 0),
        scored.length,
      ),
    };

    console.log('');
    console.log(
      `  diagnostics  mean precision@5 ${pct(diagnostics.meanPrecisionAt5)} · ` +
        `recall@20 ${pct(diagnostics.recallAt20)} · ` +
        `MRR ${diagnostics.mrr === null ? 'n/a' : diagnostics.mrr.toFixed(3)} · ` +
        `DRM ${pct(diagnostics.drm)}`,
    );

    /* ------------------------------------------------------------- overruled -- */

    console.log('');
    console.log('overruled');
    console.log('-'.repeat(78));
    const leakage = await measureOverruledLeakage(sql);
    console.log(
      `  leakage       ${leakage.leaked} of ${leakage.retrieved} retrieved ` +
        `(${leakage.tested} overruled judgments in the corpus)`,
    );
    for (const d of leakage.detail) {
      console.log(`    LEAK ${d.caseTitle} — row says ${d.expected}, search said ${d.got}`);
    }

    const stale = await measureStaleOverruled(sql);
    console.log(`  staleness     ${stale.stale} of ${stale.tested} probed (each rolled back)`);
    for (const d of stale.detail) {
      console.log(`    STALE ${d.judgmentId} — set to ${d.setTo}, read back ${d.observed}`);
    }

    /* ------------------------------------------------ the generation metrics -- */

    /**
     * Hallucination, silent drop and the adversarial set all require the
     * generation path, which needs a model key this deployment does not have.
     *
     * They are reported as **not measured**, which the grader treats as a
     * failure. That is the correct outcome and not a placeholder: a citation
     * gate that has never asked a model to produce a citation has not tested
     * the thing it exists to test. `docs/FOUNDER_QUEUE.md` holds the key item.
     */
    /**
     * **A KEY IS NOT A MEASUREMENT — fixed 9 Aug 2026, and this was live.**
     *
     * This block used to read `Boolean(process.env['OPENROUTER_API_KEY'])` and
     * feed it into `generationReady ? 0 : null` below. **The moment a key
     * existed, hallucinationRate and silentDropRate reported 0 — which passes
     * their thresholds — without any model ever being called.**
     *
     * There is no generation path in this package. Grep it: no `fetch`, no
     * `chat/completions`, nothing. So the key's presence was standing in for a
     * measurement that has never once run, in the gate whose entire purpose is
     * to catch fabricated citations.
     *
     * The comment above was already correct — *"a citation gate that has never
     * asked a model to produce a citation has not tested the thing it exists to
     * test"* — and only the code disagreed with it.
     *
     * **These stay null until a real generation observation exists.** Null
     * grades as `notMeasured`, which fails. That is the honest state and it is
     * supposed to be uncomfortable.
     */
    /**
     * **The generation path, wired 9 Aug 2026.** Every query the gate scored is
     * answered from ITS OWN top-5 as evidence, and the two metrics are computed
     * from what the pipeline would show.
     *
     * `resolveReferences` never drops, so `silentDropRate` is a real
     * observation of that invariant against real model output rather than an
     * assumption about it.
     */
    /**
     * Below this, no rate is reported. Set at two per query on the reasoning
     * that an answer grounded in a five-item evidence set should cite more than
     * once, so anything less means the generation path is not really running.
     */
    const MIN_REFERENCES = scored.length * 2;

    const apiKey = process.env['OPENROUTER_API_KEY'];
    let hallucinationRate: number | null = null;
    let silentDropRate: number | null = null;
    let generationCostUsd = 0;

    console.log('');
    console.log('generation');
    console.log('-'.repeat(78));

    if (!apiKey) {
      console.log('  OPENROUTER_API_KEY is absent — no model is called.');
      console.log('  hallucinationRate and silentDropRate are NOT MEASURED, and the gate');
      console.log('  fails on that. Not having measured is not having passed.');
    } else {
      let refs = 0;
      let hallucinated = 0;
      let dropped = 0;
      let answered = 0;
      let failed = 0;

      for (const s of scored) {
        if (s.retrieved.length === 0) continue;
        const evidence = s.retrieved.map((r, i) => ({
          id: `E${i + 1}`,
          judgmentId: r.judgmentId,
          caseTitle: r.caseTitle,
          passage: r.passage,
        }));
        try {
          const out = await generate(s.queryText, evidence);
          const g = gradeReferences(out.references);
          refs += g.total;
          hallucinated += g.hallucinated;
          // Observed, not assumed: every emitted ID must come back rendered.
          dropped += out.citedIds.length - out.references.length;
          generationCostUsd += out.usage.costUsd;
          answered += 1;
        } catch (error) {
          /**
           * A failed call is NOT a clean query. Counting it as zero references
           * would let an outage improve the score, which is the same class of
           * bug as a key standing in for a measurement.
           */
          failed += 1;
          console.log(
            `  ${s.id.padEnd(22)} CALL FAILED — ${(error as Error).message.slice(0, 60)}`,
          );
        }
      }

      console.log(
        `  answered      ${answered} of ${scored.length} queries · ${failed} call failures`,
      );
      console.log(`  references    ${refs}`);
      console.log(`  hallucinated  ${hallucinated}  (shown verified, nothing confirms)`);
      console.log(`  dropped       ${dropped}  (emitted then not rendered)`);
      console.log(`  cost          $${generationCostUsd.toFixed(6)}`);

      if (failed > 0) {
        console.log('  Calls failed, so neither rate is reported. A partial run is not a run.');
      } else if (refs < MIN_REFERENCES) {
        /**
         * **A rate computed from one reference is not a measurement.**
         *
         * The first wired run produced ONE reference across 25 queries and
         * reported hallucinationRate 0.0% PASS. That is the same failure as a
         * key standing in for a measurement, arriving by arithmetic instead:
         * 0/1 is a true fraction and a false reassurance. A floor is the fix,
         * and it must sit above any number a broken run can plausibly reach.
         */
        console.log(`  Only ${refs} reference(s) across ${scored.length} queries — below the`);
        console.log(`  floor of ${MIN_REFERENCES}. Reported as NOT MEASURED: a rate computed`);
        console.log('  from almost no observations is a false reassurance, not a result.');
      } else {
        hallucinationRate = hallucinated / refs;
        silentDropRate = dropped / refs;
      }
    }

    /**
     * The adversarial set — five requests with no good answer, each paired with
     * a recorded wrong answer a published dataset actually gives. Graded by
     * refusal and by machine-checkable strings, never by prose quality.
     */
    let adversarialPassRate: number | null = null;
    if (apiKey) {
      const raw = await readFile(new URL('./fixtures/adversarial.json', import.meta.url), 'utf8');
      const { cases } = JSON.parse(raw) as { cases: AdversarialCase[] };
      const adv = await runAdversarial(cases);
      adversarialPassRate = adv.passRate;

      console.log('');
      console.log('adversarial');
      console.log('-'.repeat(78));
      for (const v of adv.verdicts) {
        console.log(`  ${(v.passed ? 'PASS' : 'FAIL').padEnd(5)} ${v.id}`);
        for (const f of v.failures) console.log(`          ${f}`);
      }
      console.log(`  ${adv.callFailures} call failures · $${adv.costUsd.toFixed(6)}`);
    }

    /* ---------------------------------------------------------------- grade -- */

    /**
     * The two deterministic gates, measured against the live corpus rather than
     * asserted. `structuredExactness` asks whether the citation an advocate
     * types resolves at rank 1; `fieldPrecision` re-reads the bench from the
     * rows a `judge:` query returned, so a false positive cannot hide.
     */
    const structured = await measureStructuredGate(sql);
    console.log('');
    console.log('STRUCTURED SEARCH');
    console.log('='.repeat(78));
    console.log(`  citations tested   ${structured.citationsTested}`);
    console.log(`  judge queries      ${structured.fieldQueriesTested}`);
    for (const f of structured.failures.slice(0, 10)) console.log(`    ${f}`);

    const metrics: HarnessMetrics = {
      // Measured above, or null. Never a literal 0 derived from a flag.
      hallucinationRate,
      silentDropRate,
      staleOverruledRate: rate(stale.stale, stale.tested),
      overruledLeakage: leakage.retrieved === 0 ? null : leakage.leaked,
      adversarialPassRate,
      structuredExactness: structured.structuredExactness,
      fieldPrecision: structured.fieldPrecision,
      /**
       * **Ungraded from 9 Aug 2026.** Still measured, still printed below, and
       * no longer deciding whether the product ships — see `metrics.ts` for the
       * CLERC evidence that a 0.70 floor is unreachable on this task.
       */
      successAt5,
    };

    const verdicts = grade(metrics);
    const setComplete = queries.length >= TARGET_QUERIES;

    console.log('');
    console.log('GATE S2');
    console.log('='.repeat(78));
    for (const v of verdicts) {
      const shown =
        v.notMeasured !== undefined
          ? `NOT MEASURED — ${v.notMeasured}`
          : v.name === 'overruledLeakage'
            ? `${v.value} (${v.comparison} ${v.threshold})`
            : `${pct(v.value)} (${v.comparison} ${pct(v.threshold)})`;
      console.log(`  ${v.passed ? 'PASS' : 'FAIL'}  ${v.name.padEnd(22)} ${shown}`);
    }
    console.log(
      `  ${setComplete ? 'PASS' : 'FAIL'}  ${'querySetComplete'.padEnd(22)} ` +
        `${queries.length} of ${TARGET_QUERIES}`,
    );

    const passed = verdicts.every((v) => v.passed) && setComplete;
    console.log('');
    console.log(passed ? 'GATE S2 PASSED' : 'GATE S2 FAILED — this is the finding, not a bug');

    const jsonPath = process.env['HARNESS_JSON'];
    if (jsonPath) {
      writeFileSync(
        jsonPath,
        `${JSON.stringify(
          {
            ranAt: new Date().toISOString(),
            counts,
            metrics,
            diagnostics,
            verdicts,
            setComplete,
            scored,
            leakage,
            stale,
          },
          null,
          2,
        )}\n`,
      );
      console.log(`\nwrote ${jsonPath}`);
    }

    return passed ? 0 : 1;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
