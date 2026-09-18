/**
 * `pnpm adversarial` — the five cases that must never be answered, run alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS SEPARATELY FROM `run-cli.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `adversarialPassRate` is a release gate with a threshold of **1** — reproducing
 * any one of five documented wrong answers is a failure — and until now the only
 * way to produce it was a full Gate S2 pass. That pass retrieves for every eval
 * query and then issues up to ~100 more in the overruled sections; measured
 * 17 Aug it runs for hours. **A gate that can only be run inside a three-hour
 * job is a gate nobody runs**, and this one has been reported as `not measured`
 * since it was written.
 *
 * These five cases need **no database, no embedder and no retrieval**.
 * `runAdversarial` calls `generate(prompt, [], deps)` with an empty evidence
 * list, because the correct output is a refusal and evidence is not the point.
 * Five prompts against one model is seconds and cents. There was never a reason
 * for it to be coupled to the retrieval run.
 *
 * `run-cli.ts` still runs it as part of the full gate and this changes nothing
 * about how it grades there. This is the same function, reachable on its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE KEY WAS NEVER MISSING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `NEW1_LOCAL_RETRIEVAL_BASELINE.md` §8a records that neither LLM key is set,
 * and the first draft of `NEW1_POST_0055_BASELINE.md` repeated it. Both were
 * wrong in the same way: they read `process.env` from a shell that had not
 * loaded `.env`. **`OPENROUTER_API_KEY` is on line 40 of `.env`, 73 characters,
 * and `GET /api/v1/key` returns 200** — live, not free tier, no expiry.
 *
 * So run this with `--env-file=.env` or the key genuinely will be absent, and
 * `generate` will refuse rather than quietly return an empty answer that would
 * grade as a perfect run.
 */
import { readFile, writeFile } from 'node:fs/promises';

import postgres from 'postgres';

import { assessTransition, transitionContext } from '@lawmind/api/statutes/transition';

import { type AdversarialCase, runAdversarial } from './adversarial.ts';
import { sslFor } from './db-url.ts';

const OUT = process.env['ADVERSARIAL_JSON'] ?? null;

/**
 * The criminal-transition resolver, or null when no database is reachable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE NOW WANTS A DATABASE IT WAS WRITTEN TO AVOID
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The header above is proud that these five cases need no database — and it is
 * still right about retrieval. This connection is not for evidence. It reads
 * three rows from `statutes` to learn WHEN the 2023 codes commenced.
 *
 * That date cannot be a constant in the harness. `DOMAIN_TRUTH.md` is explicit
 * that a legal fact not sourced does not exist, and a hardcoded 1 July 2024 that
 * silently disagreed with the statute table would be the invented legal fact the
 * whole document exists to forbid. Three rows on one index is not the three-hour
 * coupling the header objects to.
 *
 * **Absent a database this returns null and generation is unchanged.** It does
 * NOT fall back to a date of its own — `adv-5` then fails exactly as it does
 * today, which is the honest outcome: the fix is not installed rather than
 * silently faked.
 */
function transitionResolver(): {
  fn: (q: string) => Promise<string | null>;
  close: () => Promise<void>;
} | null {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  const sql = postgres(url, { ssl: sslFor(url), max: 1, onnotice: () => {} });
  return {
    fn: async (question: string) =>
      transitionContext(await assessTransition(sql, { text: question })),
    close: async () => {
      await sql.end();
    },
  };
}

async function main(): Promise<number> {
  if (!process.env['OPENROUTER_API_KEY'] && !process.env['INFERX_API_KEY']) {
    console.error('No model key in the environment.');
    console.error(
      'Run with --env-file=.env — the key exists, the process has to be told to read it.',
    );
    return 2;
  }

  const raw = await readFile(new URL('./fixtures/adversarial.json', import.meta.url), 'utf8');
  const { cases } = JSON.parse(raw) as { cases: AdversarialCase[] };
  console.log(`${cases.length} adversarial cases — the correct answer to every one is a refusal\n`);

  const transition = transitionResolver();
  if (!transition) {
    console.error(
      'DATABASE_URL is unset — the criminal-transition context will NOT be supplied.\n' +
        'adv-5-no-date-so-no-regime will fail as it did before the fix, because the fix ' +
        'reads the commencement date from `statutes` and refuses to invent one.\n',
    );
  }

  let result;
  try {
    result = await runAdversarial(cases, transition ? { transitionFor: transition.fn } : {});
  } finally {
    await transition?.close();
  }

  for (const v of result.verdicts) {
    console.log(`${v.passed ? 'PASS' : 'FAIL'}  ${v.id}`);
    if (!v.passed) {
      for (const f of v.failures) console.log(`        broke: ${f}`);
    }
  }

  console.log('');
  console.log(
    result.passRate === null
      ? 'adversarialPassRate NOT MEASURED — no case produced a gradeable answer'
      : `adversarialPassRate ${(result.passRate * 100).toFixed(1)}%   threshold 100%`,
  );
  console.log(`cost $${result.costUsd.toFixed(4)}   call failures ${result.callFailures}`);

  /**
   * A call failure is NOT a pass. If the model could not be reached, the case
   * was not tested, and `not measured` must never read as `did not reproduce`.
   */
  if (result.callFailures > 0) {
    console.log('');
    console.log('CALL FAILURES OCCURRED — those cases were NOT TESTED. Absent is not a pass.');
  }

  if (OUT) {
    await writeFile(
      OUT,
      JSON.stringify(
        { kind: 'new1_adversarial', createdAt: new Date().toISOString(), ...result },
        null,
        2,
      ),
    );
    console.log(`\nwrote ${OUT}`);
  }
  return result.passRate === 1 && result.callFailures === 0 ? 0 : 1;
}

process.exit(await main());
