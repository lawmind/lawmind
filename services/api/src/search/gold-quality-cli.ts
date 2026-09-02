/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUALITY HALF OF A PERFORMANCE CHANGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A retrieval change that is measured only by a clock cannot be accepted. This
 * scores the SAME ranker the round-measure CLI times, against NEW1's
 * `ADVOCATE_RETRIEVAL_GOLD_V2` splits, and reports `target@10` and `target@50`
 * per family so a regression cannot hide inside an aggregate.
 *
 *   pnpm --filter @lawmind/api gold:quality -- --split train --json out.json
 *
 * **WHAT IT MAY AND MAY NOT CONCLUDE.**
 *
 * - It scores `hybridSearch` at candidate depth, which is what `/search`
 *   paginates. It is the ranker's output, not a second implementation of it.
 * - **There is no embedder here**, so the dense arm does not run and the
 *   families that depend on it (`pasted_passage`, `long_narrative`) measure
 *   their LEXICAL half only. Their absolute numbers are a floor and mean
 *   nothing on their own; the same run before and after a change is the only
 *   thing this tool is for.
 * - `retrievable_today: false` rows are KEPT and counted. Excluding them would
 *   make the denominator move with the corpus and turn a recall loss into a
 *   smaller denominator — the shape this repository has already recorded twice.
 *   They are reported separately so the reader can see both.
 *
 * **THE HOLDOUT SPLIT IS NOT READ BY THIS FILE AND MUST NOT BE.** It is
 * FIFTH-owned. Only `--split train` and `--split dev` are accepted, and `dev`
 * is a final check run once, never a tuning surface.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { hybridSearch } from './retrieve.ts';
import { sslFor } from '../db-ssl.ts';

type GoldRow = {
  id: string;
  family: string;
  query: string;
  target_judgment_id: string;
  retrievable_today: boolean;
};

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
}

const SPLIT = flag('--split') ?? 'train';
if (SPLIT !== 'train' && SPLIT !== 'dev') {
  console.error(
    `--split must be train or dev. The holdout is FIFTH-owned and this CLI cannot read it.`,
  );
  process.exit(2);
}
const JSON_OUT = flag('--json');
const LABEL = flag('--label') ?? SPLIT;

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

/**
 * Resolved from THIS MODULE, never from the working directory. A relative path
 * made the CLI depend on being launched from the repo root, which is the one
 * place a package script never runs from.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PATHS = {
  train: `${REPO_ROOT}docs/ai/new2-r7/advocate-gold-v2-train.json`,
  dev: `${REPO_ROOT}docs/ai/new2-r7/advocate-gold-v2-dev.json`,
} as const;

/** Candidate depth. `/search` pages within this; ranking past it does not exist. */
const DEPTH = 50;

const rows = JSON.parse(readFileSync(PATHS[SPLIT], 'utf8')) as GoldRow[];
const sql = postgres(url, { max: 4, ssl: sslFor(url) });

type Scored = {
  id: string;
  family: string;
  retrievableToday: boolean;
  /** 1-based position of the gold target, or null when it never appeared. */
  rank: number | null;
  resultCount: number;
  latencyMs: number;
};

const scored: Scored[] = [];
try {
  for (const row of rows) {
    const started = performance.now();
    let results: { judgmentId: string }[] = [];
    try {
      results = await hybridSearch(sql, row.query, null, {}, DEPTH);
    } catch {
      // A thrown query scores as "target absent", which is the truthful reading:
      // the advocate did not get the authority. It is NOT silently skipped.
    }
    const idx = results.findIndex((r) => r.judgmentId === row.target_judgment_id);
    scored.push({
      id: row.id,
      family: row.family,
      retrievableToday: row.retrievable_today,
      rank: idx === -1 ? null : idx + 1,
      resultCount: results.length,
      latencyMs: Math.round(performance.now() - started),
    });
  }
} finally {
  await sql.end();
}

function at(set: Scored[], k: number): number {
  if (set.length === 0) return 0;
  return set.filter((s) => s.rank !== null && s.rank <= k).length / set.length;
}
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

const families = [...new Set(scored.map((s) => s.family))].sort();
console.log(`\nGOLD QUALITY — ${LABEL} — split=${SPLIT} n=${scored.length} depth=${DEPTH}`);
console.log('NO EMBEDDER: the dense arm did not run. Lexical half only.\n');
console.log(
  'family'.padEnd(28) +
    'n'.padStart(5) +
    '@10'.padStart(9) +
    '@50'.padStart(9) +
    'p50ms'.padStart(9),
);
for (const f of families) {
  const set = scored.filter((s) => s.family === f);
  const lat = set.map((s) => s.latencyMs).sort((a, b) => a - b);
  console.log(
    f.padEnd(28) +
      String(set.length).padStart(5) +
      pct(at(set, 10)).padStart(9) +
      pct(at(set, 50)).padStart(9) +
      `${lat[Math.floor(lat.length / 2)] ?? 0}`.padStart(9),
  );
}
const retr = scored.filter((s) => s.retrievableToday);
console.log(
  `\nALL          n=${scored.length}  @10=${pct(at(scored, 10))}  @50=${pct(at(scored, 50))}`,
);
console.log(
  `retrievable_today only  n=${retr.length}  @10=${pct(at(retr, 10))}  @50=${pct(at(retr, 50))}`,
);

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    `${JSON.stringify(
      {
        label: LABEL,
        split: SPLIT,
        collectedAt: new Date().toISOString(),
        depth: DEPTH,
        embedder: 'absent — dense arm did not run',
        n: scored.length,
        aggregate: { at10: at(scored, 10), at50: at(scored, 50) },
        retrievableToday: { n: retr.length, at10: at(retr, 10), at50: at(retr, 50) },
        byFamily: Object.fromEntries(
          families.map((f) => {
            const set = scored.filter((s) => s.family === f);
            return [f, { n: set.length, at10: at(set, 10), at50: at(set, 50) }];
          }),
        ),
        scored,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`\nmachine-readable: ${JSON_OUT}`);
}
