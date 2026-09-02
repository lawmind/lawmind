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
    'search/sparse-quality-cli.ts',
    'CLI quality battery — writes developer evidence, renders nothing to an advocate',
  ],
  [
    'search/overruled-retrieval-audit-cli.ts',
    'CLI audit over known-overruled judgments, developer-facing output only',
  ],
  [
    'search/gold-quality-cli.ts',
    'CLI gold scorer — measures target@k against a fixed split, renders nothing to an advocate',
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
 * ───────────────────────────────────────────────────────────────────────────
 * BRANCH COVERAGE — because counting CALLERS is not counting ANSWERS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * FIFTH bus 1257. The check above asks "does this FILE call the deriver". It
 * passed for `search/route.ts`, which does — once, on the hybrid path — while
 * three earlier branches returned a 200 with no outcome at all. An exact
 * citation resolving to several judgments, the branch that most needs a server
 * verdict, was the loudest of the three.
 *
 * A file-level check cannot see that. This one walks every success return in a
 * serving file and requires the object literal it returns to carry the field.
 *
 * Brace-matching rather than a regex over the whole body: nested objects are
 * everywhere in these responses, and `/retrievalOutcome/.test(body)` is exactly
 * the file-level mistake being fixed.
 */
/**
 * Blank out comments and string/template literal CONTENTS, preserving length
 * and line structure.
 *
 * Brace-matching over raw source does not survive this codebase: these
 * responses are full of template literals and of comments that themselves
 * contain braces, and a matcher that counts those stops early and then reports
 * that a branch which DOES carry the field does not. The first version of this
 * check did exactly that and accused all four branches of route.ts, including
 * the one it had just been given.
 */
function blankNonCode(body) {
  const out = body.split('');
  let i = 0;
  const N = body.length;
  const SP = ' ';
  while (i < N) {
    const ch = body[i];
    const next = body[i + 1];
    if (ch === '/' && next === '/') {
      while (i < N && body[i] !== String.fromCharCode(10)) { out[i] = SP; i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') {
      out[i] = SP; out[i + 1] = SP; i += 2;
      while (i < N && !(body[i] === '*' && body[i + 1] === '/')) {
        if (body[i] !== String.fromCharCode(10)) out[i] = SP;
        i += 1;
      }
      if (i < N) { out[i] = SP; out[i + 1] = SP; i += 2; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < N) {
        if (body[i] === String.fromCharCode(92)) { out[i] = SP; out[i + 1] = SP; i += 2; continue; }
        if (body[i] === quote) break;
        if (body[i] !== String.fromCharCode(10)) out[i] = SP;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Every success return in a serving file, as a span of source.
 *
 * Offsets come from the blanked copy so braces inside strings and comments
 * cannot close the object early; the reported line number and the text tested
 * for the field come from the same offsets, so they always agree.
 */
function successReturns(body) {
  const code = blankNonCode(body);
  const sites = [];
  const marker = /return ok\(c,\s*\{/g;
  let m;
  while ((m = marker.exec(code)) !== null) {
    const openBrace = code.indexOf('{', m.index);
    let depth = 0;
    let i = openBrace;
    for (; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const line = code.slice(0, m.index).split(String.fromCharCode(10)).length;
    sites.push({ line, offset: m.index, text: code.slice(openBrace, i + 1) });
  }
  return sites;
}

/**
 * Which top-level functions in a file actually perform a retrieval.
 *
 * FUNCTION scope, not file scope, and the distinction is the whole point of
 * this pass. `search/saved.ts` holds `getSavedSearchFeed`, which retrieves and
 * rightly publishes an outcome, alongside `listSavedSearches`,
 * `createSavedSearch` and `deleteSavedSearch`, which are CRUD over a
 * `saved_searches` row and return no authority at all.
 *
 * The first version of this check demanded an outcome from all four and would
 * have had someone bolt a retrieval verdict onto "I deleted your saved search".
 * A field with no meaning on a response is worse than an absent one: it teaches
 * every consumer that the field is noise.
 *
 * The markers are the same ones the file-level pass uses, so there is one
 * definition of "this serves retrieved law" rather than two that can disagree.
 */
const RETRIEVAL_MARKERS = ['hybridSearch(', 'answerStructured('];

function retrievingFunctions(code) {
  const spans = [];
  const decl = new RegExp('function ([A-Za-z0-9_$]+)', 'g');
  const LPAREN = String.fromCharCode(40);
  const RPAREN = String.fromCharCode(41);
  let m;
  while ((m = decl.exec(code)) !== null) {
    // Step over the parameter list by hand rather than describing it in a
    // pattern: a destructured or generic parameter contains braces, and the
    // first brace after the name is then not the function body.
    const lp = code.indexOf(LPAREN, decl.lastIndex);
    if (lp < 0) continue;
    let pdepth = 0;
    let k = lp;
    for (; k < code.length; k += 1) {
      if (code[k] === LPAREN) pdepth += 1;
      else if (code[k] === RPAREN) {
        pdepth -= 1;
        if (pdepth === 0) break;
      }
    }
    const openBrace = code.indexOf('{', k);
    if (openBrace < 0) continue;
    let depth = 0;
    let i = openBrace;
    for (; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    spans.push({ name: m[1], start: openBrace, end: i + 1 });
    decl.lastIndex = openBrace;
  }
  return spans.filter((sp) => {
    const bodyText = code.slice(sp.start, sp.end);
    return RETRIEVAL_MARKERS.some((marker) => bodyText.includes(marker));
  });
}

for (const rel of serving) {
  const raw = readFileSync(join(API_SRC, rel), 'utf8');
  const code = blankNonCode(raw);
  const retrieving = retrievingFunctions(code);
  if (retrieving.length === 0) continue;

  const sites = successReturns(raw).filter((site) =>
    retrieving.some((fn) => site.offset >= fn.start && site.offset < fn.end),
  );
  if (sites.length === 0) continue;

  const naked = sites.filter((site) => !site.text.includes('retrievalOutcome'));
  if (naked.length > 0) {
    fail(
      rel,
      'a retrieving branch returns no retrieval outcome',
      `${naked.length} of ${sites.length} success returns inside ` +
        `${retrieving.map((f) => f.name).join('/')} omit retrievalOutcome ` +
        `(line${naked.length === 1 ? '' : 's'} ${naked.map((n) => n.line).join(', ')}). ` +
        'The field is documented as ALWAYS present; a branch that returns 200 without it ' +
        'leaves the consumer to invent a verdict, and an ambiguous exact citation is ' +
        'precisely the branch where inventing one is worst (FIFTH bus 1257)',
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
