#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §17 — DID THIS ROUND TOUCH ANYTHING THAT DECIDES A SEARCH RESULT?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The round brief asks to PROVE the DB-role refactor did not regress search,
 * and there are two ways to answer. A before/after result diff is the obvious
 * one and needs a baseline captured before the change — which this round does
 * not have, because `retrieval-regression-baseline.json` did not exist until
 * today.
 *
 * The other way is stronger where it applies: if no file that produces a result
 * changed, no result can have changed. That is checkable rather than
 * persuasive, so this walks the transitive import closure of the ranking entry
 * point and intersects it with what this round actually modified.
 *
 * It is deliberately narrow about what counts as "produces a result": the
 * closure of `search/retrieve.ts`, which is where ranking, admission, the
 * document-frequency fence and every arm live. A change to a file OUTSIDE that
 * closure can still change what a ROUTE returns — response shape, a filter
 * built before the call — and this does not claim otherwise. It answers the
 * ranking question only, and the split matrix answers the route question by
 * driving the routes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'services', 'api', 'src', 'search', 'retrieve.ts');

/** Every relative import reachable from `entry`, resolved to a real file. */
function closure(entry) {
  const seen = new Set();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      let target = resolve(dirname(file), m[1]);
      if (!existsSync(target)) {
        for (const ext of ['.ts', '.mts', '/index.ts']) {
          if (existsSync(target + ext)) {
            target += ext;
            break;
          }
        }
      }
      queue.push(target);
    }
  }
  return [...seen].map((f) => relative(ROOT, f).split(sep).join('/')).sort();
}

const baseRef = process.argv[2] ?? 'HEAD';
const changed = execFileSync('git', ['diff', '--name-only', baseRef], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const files = closure(ENTRY);
const touched = files.filter((f) => changed.includes(f));

console.log(`ranking closure of search/retrieve.ts: ${files.length} files`);
console.log(`modified since ${baseRef}: ${changed.length} files`);
console.log(`intersection: ${touched.length}`);
for (const f of touched) console.log(`  TOUCHED ${f}`);
console.log(
  `\nSEARCH_RANKING_CLOSURE_TOUCHED = ${touched.length === 0 ? 'NO' : `YES (${touched.join(', ')})`}`,
);
if (files.length < 5) {
  console.error('the closure walk found almost nothing; it has stopped working');
  process.exitCode = 2;
}
