#!/usr/bin/env node
/**
 * GUARD — every SERVING caller of retrieval must publish a retrieval outcome.
 *
 * LCC, 25 Aug 2026. R7 §7.1 and §8 LCC-P0.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A GUARD AND NOT A CODE REVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This repository has the same defect on record three separate times, and
 * `arguments/counter.ts` states it in its own comments:
 *
 *     "a rule implemented at one call site is a rule the second call site
 *      does not have."
 *
 * The receipts:
 *
 *   - the admission gate and the research pool were wired into `/search` and not
 *     into `/arguments/counter`, so counter-arguments ran the same ranker on the
 *     CORE pool with unlimited concurrency — the exact starvation that had
 *     already been measured and fixed once (core p95 2,809 ms -> 69 ms);
 *   - OD-14 was fixed in one place and ran stale in three more;
 *   - `onDegrade` was added for the search route, and `counter.ts` and
 *     `saved.ts` — the two surfaces where incompleteness matters MOST — were
 *     still discarding it on 25 Aug 2026.
 *
 * That last one is why this file exists. `/arguments/counter` is a claim about
 * what the opposing side can reach for, and `/search/saved/:id/feed` is the one
 * screen an advocate does not re-read critically. Both were answering
 * confidently from whatever the ranker happened to return, and neither response
 * could say so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CHECKS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every file that imports `hybridSearch` is either
 *
 *   SERVING       — it puts results in front of a user, and must therefore both
 *                   pass an `onDegrade` callback and derive a retrieval outcome;
 *   NON-SERVING   — a benchmark, a CLI, an audit harness. Named explicitly here,
 *                   with a reason, so that "it is only a script" is a decision
 *                   somebody wrote down rather than an assumption.
 *
 * A new serving caller fails this until it publishes an outcome. That is the
 * point: the fourth caller of `hybridSearch` should not be able to repeat what
 * the second and third did.
 *
 * Static. Opens no socket, touches no database.
 *
 *   node scripts/check-retrieval-outcome-coverage.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_SRC = join(ROOT, 'services', 'api', 'src');

/**
 * Callers that do NOT serve a user and therefore owe no outcome.
 *
 * Each needs a reason, and the reason is checked by a human at review time
 * rather than by this script — but writing it down is what stops the list
 * becoming a place to silence the guard.
 */
const NON_SERVING = new Map([
  ['search/bench.ts', 'benchmark harness — measures the ranker, renders nothing to an advocate'],
  ['search/retrieval-regression-cli.ts', 'CLI regression runner, developer-facing output only'],
  [
    'search/overruled-retrieval-audit-cli.ts',
    'CLI audit over known-overruled judgments, developer-facing output only',
  ],
  ['search/retrieve.ts', 'the ranker itself — it RAISES the degradation, it does not consume it'],
]);

const failures = [];
const fail = (file, check, detail) => failures.push({ file, check, detail });

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = walk(API_SRC);
const serving = [];

for (const full of files) {
  const rel = relative(API_SRC, full).replace(/\\/g, '/');
  const body = readFileSync(full, 'utf8');

  // Only files that actually CALL it. An import for a type, or a mention in a
  // comment, is not a call — and this codebase's comments discuss `hybridSearch`
  // in at least four files that never invoke it.
  if (!/\bhybridSearch\s*\(/.test(body)) continue;
  if (rel === 'search/retrieve.ts') continue;

  if (NON_SERVING.has(rel)) continue;
  serving.push(rel);

  if (!/deriveRetrievalOutcome\s*\(/.test(body)) {
    fail(
      rel,
      'serving caller publishes no retrieval outcome',
      'calls hybridSearch and never calls deriveRetrievalOutcome — this response cannot tell an ' +
        'advocate "we could not search" apart from "there is no law on this" (R7 §7.1, RCC bus 1128)',
    );
  }

  // The outcome is only as honest as its inputs. A caller that derives an
  // outcome while passing no `onDegrade` reports `degradedArms: []` on every
  // request and will never say `degraded` — which is worse than not deriving
  // one at all, because it looks like the rule is being followed.
  const passesOnDegrade = /onDegrade|\(arm\)\s*=>|degradedArms\.push/.test(body);
  if (!passesOnDegrade) {
    fail(
      rel,
      'serving caller collects no degradation signal',
      'calls hybridSearch without an onDegrade callback, so its outcome would report an empty ' +
        'degradedArms on every request and could never reach the `degraded` state',
    );
  }
}

/**
 * The reverse audit: is anything deriving an outcome from inputs it invented?
 *
 * `SEMANTIC_INDEX_SUFFICIENT` is a single constant on purpose (R7 §8: "until
 * NEW1 thresholds pass, semantic-dependent routes default conservatively"). A
 * route that passes a literal `true` for `semanticIndexSufficient` has opted
 * itself out of that default without anyone deciding it should — the same shape
 * as `enrich-worker.cmd` opting out of a fleet-wide pause because it had its own
 * loop.
 */
for (const full of files) {
  const rel = relative(API_SRC, full).replace(/\\/g, '/');
  if (rel === 'search/outcome.ts') continue;
  const body = readFileSync(full, 'utf8');
  if (!/deriveRetrievalOutcome\s*\(/.test(body)) continue;
  if (/semanticIndexSufficient:\s*true\b/.test(body)) {
    fail(
      rel,
      'hard-codes semanticIndexSufficient: true',
      'must pass SEMANTIC_INDEX_SUFFICIENT — the conservative default is one constant so that ' +
        'flipping it is a decision reviewed once, not a literal repeated at five call sites',
    );
  }
}

if (serving.length === 0) {
  fail(
    '(repo)',
    'no serving callers found',
    'this guard found nothing to check, which means its detection is broken rather than that ' +
      'the codebase is clean — a check that passes vacuously is not a check',
  );
}

if (failures.length > 0) {
  console.error(`retrieval outcome coverage: ${failures.length} problem(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.check}`);
    console.error(`    ${f.detail}\n`);
  }
  console.error(
    'Fix by deriving the outcome in the route that serves the results, from real inputs:\n' +
      '  services/api/src/search/outcome.ts — deriveRetrievalOutcome / mayGenerateFrom',
  );
  process.exit(1);
}

console.log(
  `retrieval outcome coverage: OK — ${serving.length} serving caller(s) ` +
    `(${serving.join(', ')}) each collect degradation and publish an outcome; ` +
    `${NON_SERVING.size - 1} non-serving caller(s) named and exempt`,
);
