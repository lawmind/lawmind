/**
 * At what match breadth does the planner stop sequential-scanning `judgments`
 * and go back to the GIN index? If there is a crossover, the union budget is a
 * step change in plan, not a linear saving in rows.
 *
 * EXPLAIN only. Nothing executes.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim();
const sql = postgres(url, { max: 2, idle_timeout: 20 });

const doc = JSON.parse(readFileSync('services/harness/src/fixtures/queries.eval.json', 'utf8'));
const BUDGETS = [null, 0.01, 0.02, 0.05, 0.1, 0.2];
const corpus = Number((await sql`select reltuples::bigint est from pg_class where relname='judgments'`)[0].est);

const nodeOf = (p) => {
  const seen = [];
  const walk = (n) => { seen.push(n['Node Type']); for (const c of n.Plans ?? []) walk(c); };
  walk(p);
  if (seen.some((t) => /Bitmap Index Scan/.test(t))) return 'BITMAP INDEX SCAN (GIN)';
  if (seen.some((t) => /Seq Scan/.test(t))) return 'SEQ SCAN (full table)';
  return seen.join(' / ');
};

console.log(`corpus ${corpus.toLocaleString()}\n`);
console.log('query               budget      terms  planner rows    share   plan');
console.log('─────────────────────────────────────────────────────────────────────────────────');

for (const qi of [0, 60, 120, 180, 240]) {
  const q = doc.queries[qi];
  const scored = await sql`
    WITH scored AS (
      SELECT l.lexeme, coalesce(f.document_count::numeric / nullif(f.sampled_documents,0), 0) AS df
        FROM unnest(to_tsvector('english', ${q.query})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ), d AS (SELECT lexeme, df FROM scored WHERE df <= 0.5)
    SELECT lexeme, df::float8 df FROM (SELECT lexeme, df FROM d UNION ALL SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM d)) c
    ORDER BY df ASC, length(lexeme) DESC`;

  for (const budget of BUDGETS) {
    let chosen = [];
    if (budget === null) chosen = scored.slice(0, 40);
    else {
      let u = 0;
      for (const t of scored) {
        const next = 1 - (1 - u) * (1 - Math.min(0.999, t.df));
        if (chosen.length > 0 && next > budget) break;
        chosen.push(t); u = next;
        if (chosen.length >= 40) break;
      }
    }
    const tsq = chosen.map((t) => `'${t.lexeme.replace(/'/g, "''")}'`).join(' | ');
    const plan = await sql.unsafe(
      `EXPLAIN (FORMAT JSON) SELECT j.id FROM judgments j
         WHERE j.full_text_tsv @@ to_tsquery('english', $1)
         ORDER BY ts_rank(j.full_text_tsv, to_tsquery('english', $1)) DESC LIMIT 200`,
      [tsq],
    );
    const p = plan[0]['QUERY PLAN'][0].Plan;
    const find = (n) => { if (/Scan/.test(n['Node Type'])) return n; for (const c of n.Plans ?? []) { const r = find(c); if (r) return r; } return null; };
    const scan = find(p);
    const est = scan ? Math.round(scan['Plan Rows'] * (scan['Parallel Aware'] ? (p['Workers Planned'] ?? 0) + 1 : 1)) : 0;
    console.log(
      `${q.id.padEnd(19)} ${(budget === null ? 'LIMIT 40' : `<=${(budget * 100).toFixed(0)}%`).padEnd(10)} ` +
        `${String(chosen.length).padStart(4)}  ${est.toLocaleString().padStart(11)}  ${((est / corpus) * 100).toFixed(2).padStart(6)}%   ${nodeOf(p)}`,
    );
  }
  console.log('');
}
await sql.end();
