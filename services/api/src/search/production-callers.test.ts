/**
 * EVERY PRODUCTION PATH INTO RETRIEVAL, ENUMERATED STRUCTURALLY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A TEST THAT READS THE SOURCE TREE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The sparse safety bound lives INSIDE `hybridSearch`, and the concurrency bound
 * lives OUTSIDE it, at the route. That split is deliberate — the first is about
 * one query's match set, the second is about how many of them run at once — and
 * it has one failure mode: a new route can call `hybridSearch` and simply not
 * take a slot. Nothing about that is a type error and nothing about it fails a
 * behavioural test, because the route works perfectly until the pool is full.
 *
 * It has now happened TWICE.
 *
 *   * `/arguments/counter` ran the same ranker with no admission slot, so the
 *     bound applied to `/search` only. `counter.ts` still carries the note.
 *   * `/saved-searches/:id/feed` did the same thing, found 25 Aug 2026 by the
 *     enumeration this file automates. It was the easiest to miss because it
 *     does not look like a search — it is mounted between a list and a delete —
 *     and a client opening the app polls several of them at once.
 *
 * Twice is a pattern, and a pattern gets a test rather than a third comment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE CLASSES OF CALLER, AND HOW EACH IS DECIDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every non-test `.ts` file that calls `hybridSearch(` is discovered by scanning
 * the tree, and must land in exactly one class:
 *
 *   TEST_BENCH_CLI — a test, a `-cli.ts` or a bench. Runs deliberately, one at a
 *     time, under a human who is watching. Forcing an admission gate on a
 *     benchmark would make the benchmark measure the gate.
 *
 *   USER_REQUEST — an advocate's HTTP request can reach it. Decided from the
 *     server's IMPORT GRAPH (`index.ts` outwards), not from the file's name. Must
 *     acquire an admission slot and release it in `finally`.
 *
 *   RELEASE_OPS — corpus-generation tooling. Must be UNREACHABLE from the server
 *     entry, imported only by tooling, and carries its own pinned contract below.
 *     Registered by name: "anything under release/ is safe" is not a rule, and a
 *     second release caller fails here until someone writes down why.
 *
 * R31 (LCC, 16 Sep 2026): `release/activation.ts` — the activation smoke —
 * called `hybridSearch` once and the old two-class guard read it as an ungated
 * production route. It is not one; the fix is the classification, not an
 * allowlist line under "production".
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { activationDecision, smokeVerdict } from '../release/activation.ts';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The process `pnpm start` runs. Anything it cannot import cannot serve a request. */
const SERVER_ENTRY = 'index.ts';

/** The ranker itself. Calls to it from inside it are not callers. */
const RANKER = 'search/retrieve.ts';

/**
 * USER_REQUEST — the complete set of request-serving callers of `hybridSearch`.
 * Each must take and release an admission slot. A new one fails the enumeration.
 */
const USER_REQUEST_CALLERS: readonly string[] = [
  'search/route.ts',
  'arguments/counter.ts',
  'search/saved.ts',
];

/**
 * RELEASE_OPS — each with the reason it runs without the user concurrency gate.
 * The reason is pinned by the contract test below, not merely asserted here.
 */
const RELEASE_OPS_CALLERS: Readonly<Record<string, string>> = {
  'release/activation.ts':
    'the corpus-generation activation smoke: one fixed, sparse-only, limit-5 ' +
    'probe run by release-restore tooling before a generation may be activated. ' +
    'Not mounted, not concurrent, records no search event, and a failure REFUSES ' +
    'activation.',
};

/** Runs deliberately, under a human, one at a time. Not a product surface. */
const TEST_BENCH_CLI = /\.test\.ts$|-cli\.ts$|\/bench\.ts$|^bench\.ts$/;

type Src = { path: string; text: string };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files: Src[] = walk(SRC).map((f) => ({
  path: relative(SRC, f).replaceAll('\\', '/'),
  text: readFileSync(f, 'utf8'),
}));

const shipped = files.filter((f) => !TEST_BENCH_CLI.test(f.path));

const callsHybrid = (f: Src) => /\bhybridSearch\s*\(/.test(f.text);

/** Relative imports only — static, re-export, side-effect and dynamic. */
function importsOf(f: Src): string[] {
  const out: string[] = [];
  for (const m of f.text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    out.push(posix.normalize(posix.join(posix.dirname(f.path), m[1]!)));
  }
  return out;
}

function reachableFrom(all: readonly Src[], entry: string): Set<string> {
  const byPath = new Map(all.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (seen.has(p)) continue;
    const f = byPath.get(p);
    if (!f) continue;
    seen.add(p);
    stack.push(...importsOf(f));
  }
  return seen;
}

/**
 * The whole classification rule as a function of a source tree, so the
 * falsifiers below can hand it a tree that SHOULD fail. Returns every violation.
 */
function callerViolations(
  all: readonly Src[],
  userCallers: readonly string[],
  releaseOps: readonly string[],
): string[] {
  const v: string[] = [];
  const serving = reachableFrom(all, SERVER_ENTRY);
  const byPath = new Map(all.map((f) => [f.path, f]));
  if (!serving.has(SERVER_ENTRY)) v.push(`server entry ${SERVER_ENTRY} not found`);

  const callers = all.filter(
    (f) => !TEST_BENCH_CLI.test(f.path) && f.path !== RANKER && callsHybrid(f),
  );
  for (const c of callers) {
    if (!userCallers.includes(c.path) && !releaseOps.includes(c.path)) {
      v.push(
        `${c.path} calls hybridSearch and is unclassified — add it to USER_REQUEST_CALLERS ` +
          `with an admission slot, or to RELEASE_OPS_CALLERS with a pinned reason`,
      );
    }
  }

  for (const path of userCallers) {
    const f = byPath.get(path);
    if (!f) {
      v.push(`${path} is a USER_REQUEST caller but not on disk`);
      continue;
    }
    if (!callsHybrid(f))
      v.push(`${path} is a USER_REQUEST caller but no longer calls hybridSearch`);
    if (!serving.has(path))
      v.push(`${path} is a USER_REQUEST caller but ${SERVER_ENTRY} cannot reach it`);
    if (
      !/admission\s*(\?\.|\.)\s*acquire\s*\(|admission\s*\?\s*await\s*admission\.acquire/.test(
        f.text,
      )
    ) {
      v.push(
        `${path} calls hybridSearch without acquiring an admission slot. The sparse ` +
          `bound inside hybridSearch does NOT cover this — it bounds one query’s ` +
          `match set, not how many run at once.`,
      );
    }
    // A slot leaked on the error path is worse than no gate at all: the limit
    // ratchets down to zero over a run of failures and every later search is
    // refused for capacity that is not actually in use.
    if (!/finally\s*\{[^}]*release\(\)/s.test(f.text)) {
      v.push(`${path} must release its admission slot in a finally block`);
    }
  }

  for (const path of releaseOps) {
    const f = byPath.get(path);
    if (!f) {
      v.push(`${path} is a RELEASE_OPS caller but not on disk`);
      continue;
    }
    if (!callsHybrid(f)) v.push(`${path} is a RELEASE_OPS caller but no longer calls hybridSearch`);
    if (serving.has(path)) {
      v.push(
        `${path} is RELEASE_OPS but ${SERVER_ENTRY} can import it — it is now a serving ` +
          `path and must be gated as USER_REQUEST`,
      );
    }
    const importers = all.filter((o) => importsOf(o).includes(path)).map((o) => o.path);
    for (const imp of importers) {
      if (!TEST_BENCH_CLI.test(imp)) {
        v.push(`${path} is RELEASE_OPS but is imported by non-tooling ${imp}`);
      }
    }
  }
  return v;
}

describe('production retrieval callers', () => {
  it('every hybridSearch caller is classified, and each class holds its invariant', () => {
    assert.deepEqual(
      callerViolations(files, USER_REQUEST_CALLERS, Object.keys(RELEASE_OPS_CALLERS)),
      [],
    );
  });

  it('the request-serving set is exactly the released three', () => {
    // Pinned separately so a reclassification cannot quietly shrink it.
    const serving = reachableFrom(files, SERVER_ENTRY);
    const reachableCallers = shipped
      .filter((f) => f.path !== RANKER && callsHybrid(f) && serving.has(f.path))
      .map((f) => f.path)
      .sort();
    assert.deepEqual(reachableCallers, [...USER_REQUEST_CALLERS].sort());
  });

  describe('RELEASE_OPS contract — release/activation.ts', () => {
    const f = files.find((x) => x.path === 'release/activation.ts')!;

    it('is imported only by release tooling, never by the server', () => {
      const importers = files
        .filter((o) => importsOf(o).includes(f.path))
        .map((o) => o.path)
        .sort();
      assert.deepEqual(importers, [
        'ops/release-restore-cli.ts',
        'release/activation.test.ts',
        'search/production-callers.test.ts',
      ]);
      assert.equal(reachableFrom(files, SERVER_ENTRY).has(f.path), false);
    });

    it('runs exactly one bounded, sparse-only, vector-free ranker probe', () => {
      const calls = [...f.text.matchAll(/\bhybridSearch\s*\(([^)]*)\)/g)];
      assert.equal(calls.length, 1, 'a second ranker call in the smoke needs its own review');
      const args = calls[0]![1]!.split(',').map((a) => a.trim());
      assert.equal(args[2], 'null', 'queryVector must be null — the smoke never embeds');
      assert.ok(
        Number(args[4]) > 0 && Number(args[4]) <= 10,
        `limit ${args[4]} is not small and fixed`,
      );
      assert.equal(args[5], "'sparse'", 'the smoke must not run the semantic arm');
    });

    it('records no user search event and cannot touch capability state', () => {
      const imports = importsOf(f);
      for (const forbidden of [
        'search/event.ts',
        'product/activation.ts',
        'release/capabilities.ts',
        'release/enforce.ts',
      ]) {
        assert.ok(!imports.includes(forbidden), `activation smoke imports ${forbidden}`);
      }
      assert.doesNotMatch(f.text, /recordSearchEvent|search_events|platform_config/);
      assert.doesNotMatch(f.text, /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i);
    });

    it('a ranker probe that throws REFUSES activation', () => {
      const smoke = smokeVerdict([
        {
          name: 'exact citation',
          query: 'q',
          ms: 1,
          results: 1,
          degraded: [],
          outcome: 'matched',
          error: null,
        },
        {
          name: 'normal research query',
          query: 'q',
          ms: 1,
          results: 0,
          degraded: [],
          outcome: 'threw',
          error: 'boom',
        },
      ]);
      const statistics = { ready: true, absent: [], unanalyzed: [], empty: [] };
      const decision = activationDecision({ restoreVerified: true, statistics, smoke });
      assert.equal(decision.activate, false);
      assert.equal(decision.verdict, 'REFUSE');
      // And a smoke that never ran is not a pass either.
      assert.equal(
        activationDecision({ restoreVerified: true, statistics, smoke: smokeVerdict([]) }).activate,
        false,
      );
    });
  });

  describe('negative falsifiers — the guard must fail on these trees', () => {
    const entry: Src = {
      path: 'index.ts',
      text: "import { createApp } from './app.ts';",
    };
    const ranker: Src = { path: RANKER, text: 'export async function hybridSearch() {}' };
    const gated: Src = {
      path: 'search/route.ts',
      text: 'const s = await admission.acquire(); try { await hybridSearch(sql) } finally { s.release() }',
    };

    it('A: a new serving caller without admission', () => {
      const tree = [
        { path: 'app.ts', text: "import './search/route.ts'; import './notes/new.ts';" },
        entry,
        ranker,
        gated,
        { path: 'notes/new.ts', text: 'export const h = () => hybridSearch(sql, q);' },
      ];
      const v = callerViolations(tree, ['search/route.ts'], []);
      assert.ok(
        v.some((x) => x.startsWith('notes/new.ts calls hybridSearch and is unclassified')),
        v.join('\n'),
      );
      // Registering it without a slot still fails.
      const v2 = callerViolations(tree, ['search/route.ts', 'notes/new.ts'], []);
      assert.ok(
        v2.some((x) => x.includes('notes/new.ts calls hybridSearch without acquiring')),
        v2.join('\n'),
      );
    });

    it('B: a release-looking file that is not registered', () => {
      const tree = [
        { path: 'app.ts', text: "import './search/route.ts';" },
        entry,
        ranker,
        gated,
        {
          path: 'release/other-smoke.ts',
          text: 'await hybridSearch(sql, q, null, {}, 5, "sparse");',
        },
      ];
      const v = callerViolations(tree, ['search/route.ts'], []);
      assert.ok(
        v.some((x) =>
          x.startsWith('release/other-smoke.ts calls hybridSearch and is unclassified'),
        ),
        v.join('\n'),
      );
    });

    it('B2: a registered release caller that the server can import', () => {
      const tree = [
        {
          path: 'app.ts',
          text: "import './search/route.ts'; import { run } from './release/smoke.ts';",
        },
        entry,
        ranker,
        gated,
        { path: 'release/smoke.ts', text: 'await hybridSearch(sql, q, null, {}, 5, "sparse");' },
      ];
      const v = callerViolations(tree, ['search/route.ts'], ['release/smoke.ts']);
      assert.ok(
        v.some((x) => x.includes('can import it')),
        v.join('\n'),
      );
      assert.ok(
        v.some((x) => x.includes('imported by non-tooling app.ts')),
        v.join('\n'),
      );
    });

    it('C: a serving caller that acquires but never releases in finally', () => {
      const tree = [
        { path: 'app.ts', text: "import './search/route.ts';" },
        entry,
        ranker,
        {
          path: 'search/route.ts',
          text: 'const s = await admission.acquire(); await hybridSearch(sql); s.release();',
        },
      ];
      const v = callerViolations(tree, ['search/route.ts'], []);
      assert.deepEqual(v, ['search/route.ts must release its admission slot in a finally block']);
    });

    it('the real tree passes the same function the falsifiers fail', () => {
      const tree = [{ path: 'app.ts', text: "import './search/route.ts';" }, entry, ranker, gated];
      assert.deepEqual(callerViolations(tree, ['search/route.ts'], []), []);
    });
  });

  /**
   * The OTHER way to reach the corpus: not `hybridSearch` at all.
   *
   * There are two production retrieval implementations, not one, and the first
   * draft of this test did not know that:
   *
   *   * `search/retrieve.ts` — the sparse ‖ dense ranker. Carries the match-set
   *     bound; the admission gate sits outside it, at the route.
   *   * `search/qlang/compile.ts` — the STRUCTURED path. Compiles a parsed query
   *     language node to a WHERE clause and executes it, including a `count(*)`
   *     with no LIMIT. It is reached only through `search/structured.ts`, which
   *     is called by `search/route.ts` AFTER that route has taken its slot — so
   *     it is inside the contract, by call graph rather than by its own code.
   *
   * Each entry names WHY it is allowed. An entry without a reason is how a
   * genuine bypass gets added to an allowlist and disappears.
   */
  const EXECUTES_ITS_OWN_QUERY: Readonly<Record<string, string>> = {
    'search/retrieve.ts': 'the ranker itself — owns the sparse match-set bound',
    'search/qlang/compile.ts':
      'the structured path; only reachable via structured.ts from search/route.ts, ' +
      'which acquires its admission slot before calling it',
    'statutes/route.ts':
      'a different corpus — statute_sections, 35,395 rows as at 25 Aug 2026, not ' +
      'the 20M-row judgment table. Bounded by LIMIT/OFFSET. The unbounded count(*) ' +
      'beside it is cheap at this scale and would NOT be at corpus scale, so this ' +
      'entry is a standing bound rather than a blanket exemption.',
  };

  it('every production file that runs its own full-text query is a known one', () => {
    const executors = shipped
      .filter((f) => /await sql/.test(f.text))
      .filter((f) =>
        /\b(plainto_tsquery|websearch_to_tsquery|phraseto_tsquery|to_tsquery)\s*\(/.test(f.text),
      )
      .map((f) => f.path)
      .sort();

    assert.deepEqual(
      executors,
      Object.keys(EXECUTES_ITS_OWN_QUERY).sort(),
      'a production file executes its own full-text query. It inherits NEITHER the ' +
        'sparse match-set bound nor the admission gate unless its call graph puts it ' +
        'inside one. Route it through hybridSearch, or add it above with the reason ' +
        'it is safe.',
    );
  });

  it('no production file outside the ranker runs a raw vector similarity scan', () => {
    // `<=>` is pgvector cosine distance. A hand-rolled ANN scan misses the
    // preflight, the probe settings and the degraded-state reporting.
    const offenders = shipped
      .filter((f) => f.path !== RANKER)
      .filter((f) => /<=>/.test(f.text))
      .map((f) => f.path);

    assert.deepEqual(offenders, [], 'raw pgvector distance outside retrieve.ts');
  });
});
