/**
 * `pnpm --filter @lawmind/harness experiment:citation-strip` — Q1.45's
 * measurement, run against the actual corpus rather than reasoned about.
 *
 * Baseline (original query text) vs candidate (`stripResidualCitations`
 * applied), both `mode: 'sparse'` so the haystack is identical between arms
 * by construction — this is the same corpus and the same mode, only the
 * query text differs, so there is no haystack-size confound to control for
 * the way `arms-cli.ts` had to for sparse-vs-dense.
 *
 * The negative control is not a separate pass: `stripResidualCitations` is a
 * proven no-op on any query with no citation-shaped span
 * (`citation-strip.test.ts`), so running EVERY query through both arms and
 * then splitting the result by "did this query actually change" gives the
 * control population for free, from the same run, with no risk of the two
 * populations drifting apart across separate invocations.
 *
 * Checkpointed per query pair -- long runs against this proxy die otherwise,
 * learned repeatedly this session.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';

import { stripResidualCitations } from './citation-strip.ts';
import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';
import { meanNdcgAtK } from './metrics.ts';

const CHECKPOINT_PATH = new URL('../../../experiment-citation-strip-checkpoint.jsonl', import.meta.url);

type Row = {
  id: string;
  changed: boolean; // true if stripping actually altered this query's text
  baseFoundAtAnyRank: number | null;
  baseTop5: boolean;
  candFoundAtAnyRank: number | null;
  candTop5: boolean;
};

function loadFixture(name: string): { queries?: HarnessQuery[] } {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as never;
}

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const evalFx = loadFixture('queries.eval.json');
  const handFx = loadFixture('queries.hand.json');
  const derivedFx = loadFixture('queries.derived.json');
  const all = [...(evalFx.queries ?? []), ...(handFx.queries ?? []), ...(derivedFx.queries ?? [])];
  const byId = new Map(all.map((q) => [q.id, q]));
  const queries = [...byId.values()];

  const already = new Map<string, Row>();
  if (existsSync(CHECKPOINT_PATH)) {
    for (const line of readFileSync(CHECKPOINT_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as Row;
      already.set(r.id, r);
    }
  }
  const pending = queries.filter((q) => !already.has(q.id));
  console.log(`${queries.length} total, ${already.size} already checkpointed, ${pending.length} pending`);

  const sql = await openDb(url, 8);
  try {
    const embedder = await getEmbedder();
    const embedQuery = async (text: string): Promise<string | null> => {
      const [e] = await embedder.embed([text]);
      return e ? toVectorLiteral(e.vector) : null;
    };

    const CONCURRENCY = Number(process.env['STRIP_CONCURRENCY'] ?? 5);
    let next = 0;
    let done = 0;
    const startedAt = Date.now();

    async function scoreOne(q: HarnessQuery): Promise<void> {
      const stripped = stripResidualCitations(q.query);
      const changed = stripped !== q.query;

      const base = await scoreQuery(sql, q, embedQuery, 20, undefined, false, undefined, 'sparse', {});
      const cand = changed
        ? await scoreQuery(sql, { ...q, query: stripped }, embedQuery, 20, undefined, false, undefined, 'sparse', {})
        : base; // proven no-op -- do not spend a second query on identical text

      const row: Row = {
        id: q.id,
        changed,
        baseFoundAtAnyRank: base.foundAtAnyRank,
        baseTop5: base.goldRanks.length > 0,
        candFoundAtAnyRank: cand.foundAtAnyRank,
        candTop5: cand.goldRanks.length > 0,
      };
      appendFileSync(CHECKPOINT_PATH, JSON.stringify(row) + '\n');
      done++;
      if (done % 20 === 0 || done === pending.length) {
        console.log(`  ${done}/${pending.length} (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
      }
    }

    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= pending.length) return;
        await scoreOne(pending[i]!);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));

    // ── Report ── re-read the checkpoint fresh so the report reflects
    // everything on disk, not just what `already` held before this run started.
    const results: Row[] = [];
    for (const line of readFileSync(CHECKPOINT_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      results.push(JSON.parse(line) as Row);
    }

    const changedRows = results.filter((r) => r.changed);
    const unchangedRows = results.filter((r) => !r.changed);

    const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);
    const summarize = (label: string, rs: Row[]) => {
      const baseSuccess = rs.filter((r) => r.baseTop5).length;
      const candSuccess = rs.filter((r) => r.candTop5).length;
      const baseRecall = rs.filter((r) => r.baseFoundAtAnyRank !== null).length;
      const candRecall = rs.filter((r) => r.candFoundAtAnyRank !== null).length;
      const baseNdcg = meanNdcgAtK(rs.map((r) => r.baseFoundAtAnyRank), 5);
      const candNdcg = meanNdcgAtK(rs.map((r) => r.candFoundAtAnyRank), 5);
      console.log(`\n${label} (n=${rs.length})`);
      console.log(`  success@5   base ${pct(baseSuccess, rs.length)}  candidate ${pct(candSuccess, rs.length)}`);
      console.log(`  recall@20   base ${pct(baseRecall, rs.length)}  candidate ${pct(candRecall, rs.length)}`);
      console.log(`  nDCG@5      base ${baseNdcg.toFixed(3)}  candidate ${candNdcg.toFixed(3)}`);
      let gained = 0;
      let lost = 0;
      for (const r of rs) {
        if (r.candTop5 && !r.baseTop5) gained++;
        if (r.baseTop5 && !r.candTop5) lost++;
      }
      console.log(`  discordant on success@5: +${gained} / -${lost}`);
    };

    console.log('\n' + '='.repeat(78));
    console.log('Q1.45 RESULT');
    console.log('='.repeat(78));
    summarize('ALL 288', results);
    summarize('CHANGED BY STRIPPING (the actual test population)', changedRows);
    summarize('UNCHANGED -- NEGATIVE CONTROL (must show zero discordant pairs)', unchangedRows);

    const controlDiscordant = unchangedRows.some((r) => r.baseTop5 !== r.candTop5);
    console.log(
      `\nNEGATIVE CONTROL INTEGRITY: ${
        controlDiscordant ? 'FAILED -- an unchanged query moved, something is wrong with this experiment' : 'held -- 0 unchanged queries moved, exactly as required'
      }`,
    );
  } finally {
    await sql.end();
  }
}

await main();
