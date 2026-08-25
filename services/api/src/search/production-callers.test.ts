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
 * HOW IT DECIDES WHAT "PRODUCTION" MEANS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A file is production unless it is a test, a CLI, or a bench. Those three run
 * deliberately, one at a time, under a human who is watching — they are exactly
 * the callers that SHOULD be able to run an unbounded ranker, and forcing an
 * admission gate on a benchmark would make the benchmark measure the gate.
 *
 * The allowlist is the point. Adding a caller means adding a line here, and the
 * line is where you notice you have not taken a slot.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The complete set of production callers of `hybridSearch`, and whether each one
 * must hold an admission slot.
 *
 * `false` would mean a production path that is deliberately ungated. There is
 * none, and there should never be one without a sentence here saying why.
 */
const PRODUCTION_CALLERS: Readonly<Record<string, { gated: true }>> = {
  'search/route.ts': { gated: true },
  'arguments/counter.ts': { gated: true },
  'search/saved.ts': { gated: true },
};

/** Runs deliberately, under a human, one at a time. Not a product surface. */
const NOT_PRODUCTION = /\.test\.ts$|-cli\.ts$|\/bench\.ts$|^bench\.ts$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((f) => ({
  path: relative(SRC, f).replaceAll('\\', '/'),
  text: readFileSync(f, 'utf8'),
}));

const production = files.filter((f) => !NOT_PRODUCTION.test(f.path));

describe('production retrieval callers', () => {
  it('the set of production files calling hybridSearch is exactly the allowlist', () => {
    const callers = production
      .filter((f) => f.path !== 'search/retrieve.ts' && /\bhybridSearch\s*\(/.test(f.text))
      .map((f) => f.path)
      .sort();

    assert.deepEqual(
      callers,
      Object.keys(PRODUCTION_CALLERS).sort(),
      'a production file calls hybridSearch and is not in PRODUCTION_CALLERS. ' +
        'Add it there AND give it an admission slot — see this file’s header for ' +
        'the two routes that shipped without one.',
    );
  });

  it('every production caller acquires an admission slot', () => {
    for (const [path, rule] of Object.entries(PRODUCTION_CALLERS)) {
      const file = production.find((f) => f.path === path);
      assert.ok(file, `${path} is in the allowlist but not on disk`);
      if (!rule.gated) continue;
      assert.match(
        file.text,
        /admission\s*(\?\.|\.)\s*acquire\s*\(|admission\s*\?\s*await\s*admission\.acquire/,
        `${path} calls hybridSearch without acquiring an admission slot. The sparse ` +
          `bound inside hybridSearch does NOT cover this — it bounds one query’s ` +
          `match set, not how many run at once.`,
      );
    }
  });

  it('every production caller releases its slot even when retrieval throws', () => {
    // A slot leaked on the error path is worse than no gate at all: the limit
    // ratchets down to zero over a run of failures and every later search is
    // refused for capacity that is not actually in use.
    for (const path of Object.keys(PRODUCTION_CALLERS)) {
      const file = production.find((f) => f.path === path)!;
      assert.match(
        file.text,
        /finally\s*\{[^}]*release\(\)/s,
        `${path} must release its admission slot in a finally block`,
      );
    }
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
    const executors = production
      .filter((f) => /await sql/.test(f.text))
      .filter((f) => /\b(plainto_tsquery|websearch_to_tsquery|phraseto_tsquery|to_tsquery)\s*\(/.test(f.text))
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
    const offenders = production
      .filter((f) => f.path !== 'search/retrieve.ts')
      .filter((f) => /<=>/.test(f.text))
      .map((f) => f.path);

    assert.deepEqual(offenders, [], 'raw pgvector distance outside retrieve.ts');
  });
});
