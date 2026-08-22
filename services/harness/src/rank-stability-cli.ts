/**
 * `pnpm --filter @lawmind/harness rank:stability` — P5's gating measurement: is
 * the same search, run again, the same search?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DECIDES THE PAGINATION DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `PAGINATION_RANKING_CONTRACT.md` §5 recommends deterministic re-execution over
 * a materialised snapshot, for a reason that is about correctness rather than
 * simplicity: a snapshot outlives the corpus, and `CITATION_HARNESS.md` requires
 * `overruled_status` to be read live at render on every surface. A frozen page
 * is a page whose currentness can go stale.
 *
 * But re-execution is only safe if executing twice gives the same ordered
 * result. Two things in the current pipeline threaten that, and neither is a
 * ranking bug:
 *
 *   1. TIES WITH NO FINAL KEY. `word_similarity DESC` over a duplicated-title
 *      set is a dense tie — every member scores exactly 1.000 — and RRF sums
 *      collide too. With no `id` tie-break the order is physical row order,
 *      which an UPDATE anywhere can change.
 *   2. AN ARM THAT SOMETIMES TIMES OUT. If sparse contributes on one execution
 *      and not the next, the fusion is over different candidate lists and the
 *      page is legitimately different.
 *
 * So this runs the same queries three times through the real app and reports,
 * per query: is the returned id SET identical, is the ORDER identical, and did
 * the degraded set change between executions. Nothing is inferred from code
 * reading — the pipeline is asked.
 *
 * Deliberately small. This is a yes/no gate on a design decision, not a
 * benchmark, and it shares a contended box with the Tier-A walk.
 */
import { writeFileSync } from 'node:fs';

import { createApp } from '@lawmind/api/app';
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const REPS = Number(process.env['STABILITY_REPS'] ?? 3);
const PER_CLASS = Number(process.env['STABILITY_PER_CLASS'] ?? 3);
const OUT = new URL('../../../docs/ai/new1-tier-a/rank-stability.json', import.meta.url);

type Exec = { ids: string[]; degraded: string[]; ms: number; status: number };

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  const pick = (cls: string): typeof gold.rows => gold.rows.filter((r) => r.launchClass === cls).slice(0, PER_CLASS);
  const queries = [...pick('case_title'), ...pick('citation'), ...pick('nl_doctrine'), ...pick('fact_passage')];

  const sql = postgres(url, { max: 4, ssl: sslFor(url), onnotice: () => {}, connection: { statement_timeout: 25_000 } });
  const embedder = await getEmbedder();
  const embedQuery = async (q: string): Promise<string | null> => {
    const [e] = await embedder.embed([q]);
    return e === undefined ? null : toVectorLiteral(e.vector);
  };
  const app = createApp({ ping: async () => void (await sql`SELECT 1`), search: { sql, embedQuery } });

  const rows: {
    queryId: string;
    launchClass: string;
    chars: number;
    execs: Exec[];
    sameSet: boolean;
    sameOrder: boolean;
    degradedVaried: boolean;
  }[] = [];

  for (const g of queries) {
    const execs: Exec[] = [];
    for (let r = 0; r < REPS; r += 1) {
      const t = Date.now();
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: g.query, language: 'en' }),
      });
      const body = (await res.json()) as {
        data?: { results?: { judgmentId?: string; id?: string }[]; degraded?: string[] };
      };
      execs.push({
        ids: (body.data?.results ?? []).map((x) => x.judgmentId ?? x.id ?? ''),
        degraded: body.data?.degraded ?? [],
        ms: Date.now() - t,
        status: res.status,
      });
    }
    const first = execs[0]!;
    const sameOrder = execs.every((e) => e.ids.join(',') === first.ids.join(','));
    const sameSet = execs.every((e) => [...e.ids].sort().join(',') === [...first.ids].sort().join(','));
    const degradedVaried = !execs.every((e) => [...e.degraded].sort().join(',') === [...first.degraded].sort().join(','));
    rows.push({
      queryId: g.queryId,
      launchClass: g.launchClass,
      chars: g.query.length,
      execs,
      sameSet,
      sameOrder,
      degradedVaried,
    });
    process.stdout.write(
      `${g.queryId.padEnd(16)} ${g.launchClass.padEnd(13)} sameSet=${sameSet ? 'Y' : 'N'} sameOrder=${sameOrder ? 'Y' : 'N'} degradedVaried=${degradedVaried ? 'Y' : 'n'}  ms=${execs.map((e) => e.ms).join('/')}\n`,
    );
  }

  const summary = {
    kind: 'new1_rank_stability',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    conditions: 'LOCAL_CONTENDED — the Tier-A walk and the sparse-arm run were live',
    reps: REPS,
    queries: rows.length,
    sameSet: rows.filter((r) => r.sameSet).length,
    sameOrder: rows.filter((r) => r.sameOrder).length,
    degradedVaried: rows.filter((r) => r.degradedVaried).length,
    byClass: Object.fromEntries(
      [...new Set(rows.map((r) => r.launchClass))].map((c) => {
        const rs = rows.filter((r) => r.launchClass === c);
        return [c, { n: rs.length, sameSet: rs.filter((r) => r.sameSet).length, sameOrder: rs.filter((r) => r.sameOrder).length }];
      }),
    ),
    verdict:
      rows.every((r) => r.sameOrder) ?
        'STABLE under these conditions — deterministic re-execution is viable, subject to the total-order rules'
      : 'UNSTABLE — re-execution alone cannot paginate; fix the cause (ties or degraded arms) before choosing a mechanism',
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\n${summary.verdict}\nWROTE ${OUT.pathname}\n`);
  await sql.end();
  process.exit(0);
}

await main();
