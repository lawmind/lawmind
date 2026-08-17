/**
 * `pnpm gold:presence` — is the gold authority even IN the corpus?
 *
 * **The question this exists to stop us getting wrong.** The first local
 * baseline against the 7,296,068-judgment corpus reported 14 of 25 gold
 * authorities as `NOT RETRIEVED`. That single label covers three completely
 * different situations, and they call for three different responses:
 *
 *   ABSENT       the gold judgment is not in `judgments` at all. A CORPUS gap.
 *                No amount of ranking work fixes it, and counting it as a
 *                retrieval failure overstates the failure rate and aims effort
 *                at the wrong subsystem.
 *   UNEMBEDDED   the judgment is present but carries no chunk, so the dense arm
 *                cannot reach it however good the query embedding is. An
 *                EMBEDDING-COVERAGE gap — exactly the pilot-population question.
 *   REACHABLE    present and embedded, and retrieval still did not return it.
 *                Only THIS is a retrieval failure, and only this belongs in a
 *                ranking experiment.
 *
 * NEW2's 0631 named the same trap from the corpus side: a gold authority sitting
 * in the classifier's `unclassified` residue is unclassified, not missing. This
 * is the retrieval-side instrument for that distinction.
 *
 * Read-only, and every lookup is by primary key.
 */
import { readFileSync } from 'node:fs';

import postgres from 'postgres';

import { sslFor } from './db-url.ts';

type Query = {
  readonly id: string;
  readonly group: string;
  readonly goldJudgmentIds: readonly string[];
};

const FIXTURES = ['queries.derived.json', 'queries.hand.json', 'queries.eval.json'];

function loadQueries(): Query[] {
  const out: Query[] = [];
  for (const f of FIXTURES) {
    const j = JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')) as
      | { queries?: Query[] }
      | Query[];
    const qs = Array.isArray(j) ? j : (j.queries ?? []);
    for (const q of qs) if (Array.isArray(q.goldJudgmentIds)) out.push(q);
  }
  return out;
}

async function main(): Promise<number> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set. There is nothing to check a gold label against.');
    return 2;
  }
  const sql = postgres(url, { ssl: sslFor(url), max: 2, connection: { statement_timeout: 0 } });

  try {
    const queries = loadQueries();
    const ids = [...new Set(queries.flatMap((q) => q.goldJudgmentIds))];
    console.log(`gold      ${queries.length} queries · ${ids.length} distinct gold judgment ids`);
    console.log('');

    /** Present, and whether anything embedded it. Both by primary key. */
    const rows = await sql<{ id: string; chunks: string; paras: string }[]>`
      SELECT j.id::text AS id,
             (SELECT count(*)::text FROM judgment_chunks c WHERE c.judgment_id = j.id) AS chunks,
             (SELECT count(*)::text FROM judgment_paragraphs p WHERE p.judgment_id = j.id) AS paras
        FROM judgments j
       WHERE j.id = ANY(${ids}::uuid[])`;

    const byId = new Map(rows.map((r) => [r.id, r]));
    const state = (id: string): 'ABSENT' | 'UNEMBEDDED' | 'REACHABLE' => {
      const r = byId.get(id);
      if (!r) return 'ABSENT';
      return Number(r.chunks) === 0 ? 'UNEMBEDDED' : 'REACHABLE';
    };

    const tally = { ABSENT: 0, UNEMBEDDED: 0, REACHABLE: 0 };
    for (const id of ids) tally[state(id)]++;

    console.log('per gold judgment id');
    console.log('─'.repeat(78));
    console.log(`  ABSENT      ${String(tally.ABSENT).padStart(5)}  not in judgments at all — a CORPUS gap`);
    console.log(`  UNEMBEDDED  ${String(tally.UNEMBEDDED).padStart(5)}  present, zero chunks — the dense arm cannot reach it`);
    console.log(`  REACHABLE   ${String(tally.REACHABLE).padStart(5)}  present and embedded — only these can be retrieval failures`);
    console.log('');

    console.log('per query, worst gold state (a query is only as reachable as its best authority)');
    console.log('─'.repeat(78));
    const perGroup = new Map<string, { n: number; anyReachable: number }>();
    for (const q of queries) {
      const states = q.goldJudgmentIds.map(state);
      const best = states.includes('REACHABLE')
        ? 'REACHABLE'
        : states.includes('UNEMBEDDED')
          ? 'UNEMBEDDED'
          : 'ABSENT';
      const g = perGroup.get(q.group) ?? { n: 0, anyReachable: 0 };
      g.n++;
      if (best === 'REACHABLE') g.anyReachable++;
      perGroup.set(q.group, g);
      if (best !== 'REACHABLE') {
        console.log(`  ${q.id.padEnd(24)} ${best}  (${q.goldJudgmentIds.length} gold id(s))`);
      }
    }
    console.log('');
    for (const [group, g] of [...perGroup].sort()) {
      const pct = ((100 * g.anyReachable) / g.n).toFixed(1);
      console.log(
        `  ${group.padEnd(12)} n=${String(g.n).padStart(4)}  ${g.anyReachable} have a reachable authority (${pct}%)`,
      );
    }
    console.log('');
    console.log(
      'A query with NO reachable gold authority CANNOT be answered by any ranking change.\n' +
        'Its failure is a corpus or embedding-coverage fact, and scoring it as a retrieval\n' +
        'miss overstates the failure rate.',
    );
    return 0;
  } finally {
    await sql.end();
  }
}

process.exitCode = await main();
