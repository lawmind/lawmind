/**
 * `pnpm --filter @lawmind/harness head:offset` — the decisive test for
 * `HEAD:4800`, asked the right way.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE FIRST TRUNCATION TEST WAS THE WRONG QUESTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * I measured whether the gold DOCUMENT fits inside 4,800 characters and found
 * 42.2% of the worst misses do, against 49.2% of the successes — near-identical
 * exposure — and concluded truncation was not the mechanism.
 *
 * That test was answering "was anything cut off", when the question that decides
 * a retrieval is "was THE THING THE QUERY IS MADE OF cut off".
 *
 * `semantic-query-audit.json` measured `QUERY_NOT_IN_GOLD = 0` — for all 571
 * semantic gold rows the query text occurs verbatim inside the judgment it is
 * gold for. NEW3 says the same thing about the construction in bus 0940 ("query
 * is a substring of target, upper-bound not paraphrase-robustness"). So every
 * one of these queries has an exact character OFFSET inside its own answer, and
 * the stored vector is `left(full_text, 4800)`.
 *
 * If the sentence sits at offset 12,000, the embedded text never contained it.
 * The document can still fail to be found while being "wholly about" the query,
 * and no amount of index tuning changes that — but a segmented representation
 * would.
 *
 * This computes that offset with `strpos` on the whitespace-normalised text, and
 * crosses it against the measured ANN outcome from `dense-failure-decomposition.json`.
 * Two columns, one table, and the truncation hypothesis is decided:
 *
 *   offset < 4800  ⇒ the query's own words WERE in the embedded window
 *   offset ≥ 4800  ⇒ they were not, and a miss there is expected, not a defect
 *
 * Read-only, one indexed row per query, no embedding, no ANN.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const HEAD_CHARS = Number(process.env['HEAD_CHARS'] ?? 4800);
const OUT = new URL('../../../docs/ai/new1-tier-a/head-offset.json', import.meta.url);

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  const rows0 = gold.rows.filter(
    (r) => r.launchClass === 'nl_doctrine' || r.launchClass === 'fact_passage',
  );
  const dec = JSON.parse(
    readFileSync(
      new URL('../../../docs/ai/new1-tier-a/dense-failure-decomposition.json', import.meta.url),
      'utf8',
    ),
  ) as {
    rows: {
      queryId: string;
      annRank: number | null;
      exactRank: number | null;
      family: string;
      inIndex: boolean;
    }[];
  };
  const byId = new Map(dec.rows.map((r) => [r.queryId, r]));

  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 60_000 },
  });

  const rows: {
    queryId: string;
    launchClass: string;
    offset: number | null;
    docChars: number | null;
    insideHead: boolean | null;
    annRank: number | null;
    exactRank: number | null;
    family: string | null;
  }[] = [];

  for (const [i, g] of rows0.entries()) {
    // Both sides whitespace-normalised, so a line break inside the stored text
    // cannot hide a match the eye would call identical.
    const [r] = await sql<{ pos: string; len: string }[]>`
      SELECT strpos(
               regexp_replace(coalesce(full_text, ''), '\\s+', ' ', 'g'),
               btrim(regexp_replace(${g.query}, '\\s+', ' ', 'g'))
             )::text AS pos,
             length(coalesce(full_text, ''))::text AS len
        FROM judgments WHERE id = ${g.goldAuthorityId}`;
    const pos = r === undefined ? null : Number(r.pos);
    const d = byId.get(g.queryId);
    rows.push({
      queryId: g.queryId,
      launchClass: g.launchClass,
      offset: pos === null || pos === 0 ? null : pos,
      docChars: r === undefined ? null : Number(r.len),
      insideHead: pos === null || pos === 0 ? null : pos <= HEAD_CHARS,
      annRank: d?.annRank ?? null,
      exactRank: d?.exactRank ?? null,
      family: d?.family ?? null,
    });
    if ((i + 1) % 100 === 0) process.stdout.write(`  ${i + 1}/${rows0.length}\n`);
  }

  const scored = rows.filter(
    (r) =>
      r.insideHead !== null &&
      r.family !== null &&
      r.family !== 'NOT_STAGED' &&
      r.family !== 'TEXT_UNSAFE',
  );
  const bucket = (inside: boolean): Record<string, number | null> => {
    const rs = scored.filter((r) => r.insideHead === inside);
    const n = rs.length;
    const at5 = rs.filter((r) => r.annRank !== null && r.annRank <= 5).length;
    const at20 = rs.filter((r) => r.annRank !== null && r.annRank <= 20).length;
    const ex20 = rs.filter((r) => r.exactRank !== null && r.exactRank <= 20).length;
    const pct = (a: number): number | null => (n === 0 ? null : Number(((100 * a) / n).toFixed(2)));
    return { n, successAt5: pct(at5), successAt20: pct(at20), exactRankWithin20: pct(ex20) };
  };

  const summary = {
    kind: 'new1_head_offset',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    headChars: HEAD_CHARS,
    method:
      'the gold query occurs verbatim in its own gold judgment (QUERY_NOT_IN_GOLD = 0); this is its character offset there, ' +
      'crossed against the measured ANN outcome. It decides whether HEAD:4800 removed the words the query is made of.',
    queries: rows.length,
    offsetFound: rows.filter((r) => r.offset !== null).length,
    offsetNotFound: rows.filter((r) => r.offset === null).length,
    insideHead: rows.filter((r) => r.insideHead === true).length,
    beyondHead: rows.filter((r) => r.insideHead === false).length,
    outcomeByBucket: {
      QUERY_TEXT_INSIDE_HEAD_4800: bucket(true),
      QUERY_TEXT_BEYOND_HEAD_4800: bucket(false),
    },
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `\n${JSON.stringify(
      {
        insideHead: summary.insideHead,
        beyondHead: summary.beyondHead,
        offsetNotFound: summary.offsetNotFound,
        outcomeByBucket: summary.outcomeByBucket,
      },
      null,
      2,
    )}\n`,
  );
  await sql.end();
}

await main();
