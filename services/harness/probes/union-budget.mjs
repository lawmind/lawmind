/**
 * Does a UNION budget bound the sparse arm's cost without costing recall?
 *
 * `SPARSE_MAX_DOCUMENT_FREQUENCY = 0.5` is a PER-TERM ceiling. The cost driver
 * is the OR'd UNION of the 40 selected terms, and a union of forty terms each
 * at 3% is ~70%, not 3%. Measured 18 Aug: post-0055 match breadth is 4.5-25.3%
 * of 9.3M rows, which is 0.4M-2.4M tsvectors `ts_rank` must still read.
 *
 * So: add terms rarest-first until the MODELLED union crosses a budget, rather
 * than always taking 40. Two things are then measured per budget:
 *
 *   COST    planner-estimated rows matched (EXPLAIN, nothing executed)
 *   RECALL  does the gold judgment still MATCH the narrowed tsquery?
 *
 * The recall test is a primary-key lookup against the known gold ids, so it is
 * instant and it is exact for the half that matters here: whether the filter
 * can still reach gold at all. It says NOTHING about where ts_rank then puts
 * it — a term dropped from the query also cannot contribute to the score. That
 * second half needs a scored run and is not claimed here.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim();
const sql = postgres(url, { max: 3, idle_timeout: 30 });

const doc = JSON.parse(readFileSync('services/harness/src/fixtures/queries.eval.json', 'utf8'));
const N = Number(process.env.N ?? 30);
const step = Math.max(1, Math.floor(doc.queries.length / N));
const picked = [];
for (let i = 0; i < doc.queries.length && picked.length < N; i += step) picked.push(doc.queries[i]);

const corpus = Number((await sql`select reltuples::bigint est from pg_class where relname='judgments'`)[0].est);
console.log(`corpus ${corpus.toLocaleString()} · ${picked.length} queries\n`);

/** Budgets on the modelled union share. `null` = today's behaviour, LIMIT 40. */
const BUDGETS = [null, 0.01, 0.02, 0.05, 0.1, 0.2];
const totals = new Map(BUDGETS.map((b) => [String(b), { terms: 0, rows: 0, goldMatched: 0, goldTotal: 0, n: 0 }]));

const rows = [];
for (const q of picked) {
  const scored = await sql`
    WITH scored AS (
      SELECT l.lexeme,
             coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
        FROM unnest(to_tsvector('english', ${q.query})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    discriminating AS (SELECT lexeme, df FROM scored WHERE df <= 0.5)
    SELECT lexeme, df::float8 AS df FROM (
      SELECT lexeme, df FROM discriminating
      UNION ALL
      SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM discriminating)
    ) c
    ORDER BY df ASC, length(lexeme) DESC`;

  const perQuery = { id: q.id, group: q.group, gold: q.goldJudgmentIds.length, budgets: {} };

  for (const budget of BUDGETS) {
    let chosen;
    if (budget === null) {
      chosen = scored.slice(0, 40);
    } else {
      chosen = [];
      let union = 0;
      for (const t of scored) {
        const next = 1 - (1 - union) * (1 - Math.min(0.999, t.df));
        // Always keep at least one term: an empty tsquery is the failure the
        // whole function was rewritten to avoid.
        if (chosen.length > 0 && next > budget) break;
        chosen.push(t);
        union = next;
        if (chosen.length >= 40) break;
      }
    }
    const modelled = 1 - chosen.reduce((a, t) => a * (1 - Math.min(0.999, t.df)), 1);
    const tsq = chosen.map((t) => `'${t.lexeme.replace(/'/g, "''")}'`).join(' | ');

    let est;
    try {
      const plan = await sql.unsafe(
        `EXPLAIN (FORMAT JSON) SELECT j.id FROM judgments j
           WHERE j.full_text_tsv @@ to_tsquery('english', $1)
           ORDER BY ts_rank(j.full_text_tsv, to_tsquery('english', $1)) DESC LIMIT 200`,
        [tsq],
      );
      const p = plan[0]['QUERY PLAN'][0].Plan;
      const find = (n) => { if (/Scan/.test(n['Node Type'])) return n; for (const c of n.Plans ?? []) { const r = find(c); if (r) return r; } return null; };
      const scan = find(p);
      est = scan ? Math.round(scan['Plan Rows'] * (scan['Parallel Aware'] ? (p['Workers Planned'] ?? 0) + 1 : 1)) : null;
    } catch { est = null; }

    const hit = await sql`
      SELECT count(*)::int AS n FROM judgments
       WHERE id = ANY(${q.goldJudgmentIds}::uuid[])
         AND full_text_tsv @@ to_tsquery('english', ${tsq})`;

    perQuery.budgets[String(budget)] = {
      terms: chosen.length,
      modelledUnion: modelled,
      plannerRows: est,
      goldMatched: hit[0].n,
      goldTotal: q.goldJudgmentIds.length,
    };
    const t = totals.get(String(budget));
    t.terms += chosen.length; t.rows += est ?? 0; t.goldMatched += hit[0].n; t.goldTotal += q.goldJudgmentIds.length; t.n++;
  }
  rows.push(perQuery);
  process.stdout.write('.');
}
console.log('\n');

console.log('budget      avg terms   avg planner rows   share of corpus   gold still matched');
console.log('──────────────────────────────────────────────────────────────────────────────');
for (const b of BUDGETS) {
  const t = totals.get(String(b));
  const avgRows = t.rows / t.n;
  console.log(
    `${(b === null ? 'LIMIT 40 (now)' : `union<=${(b * 100).toFixed(0)}%`).padEnd(16)}` +
      `${(t.terms / t.n).toFixed(1).padStart(5)}   ` +
      `${Math.round(avgRows).toLocaleString().padStart(14)}   ` +
      `${((avgRows / corpus) * 100).toFixed(2).padStart(13)}%   ` +
      `${String(t.goldMatched).padStart(4)}/${t.goldTotal}  (${((t.goldMatched / t.goldTotal) * 100).toFixed(1)}%)`,
  );
}

writeFileSync('docs/ai/new1-post-0055/sparse-union-budget.json', JSON.stringify({ corpus, budgets: BUDGETS, totals: Object.fromEntries(totals), rows }, null, 2));
console.log('\nwrote docs/ai/new1-post-0055/sparse-union-budget.json');
await sql.end();
