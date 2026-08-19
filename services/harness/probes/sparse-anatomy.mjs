/**
 * What the post-0055 sparse arm actually selects, and how much of the corpus
 * the resulting tsquery matches. Planner ESTIMATES only (EXPLAIN without
 * ANALYZE) so this costs nothing while the ingest fleet is writing.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim();
const sql = postgres(url, { max: 2, idle_timeout: 30 });

const doc = JSON.parse(readFileSync('services/harness/src/fixtures/queries.eval.json', 'utf8'));
const N = Number(process.env.N ?? 8);
const picked = [];
for (let i = 0; i < doc.queries.length && picked.length < N; i += Math.max(1, Math.floor(doc.queries.length / N))) {
  picked.push(doc.queries[i]);
}

const MAXDF = 0.5;

const relRows = await sql`select reltuples::bigint est from pg_class where relname='judgments'`;
const corpus = Number(relRows[0].est);
console.log(`corpus (reltuples estimate): ${corpus.toLocaleString()}\n`);

const out = [];
for (const q of picked) {
  // 1 — the term selection, exactly as retrieve.ts does it.
  const terms = await sql`
    WITH scored AS (
      SELECT l.lexeme,
             coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
        FROM unnest(to_tsvector('english', ${q.query})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    discriminating AS (SELECT lexeme, df FROM scored WHERE df <= ${MAXDF})
    SELECT lexeme, df::float8 AS df FROM (
      SELECT lexeme, df FROM discriminating
      UNION ALL
      SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM discriminating)
    ) c
    ORDER BY df ASC, length(lexeme) DESC
    LIMIT 40`;

  const allTerms = await sql`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE coalesce(f.document_count::numeric / nullif(f.sampled_documents,0),0) > ${MAXDF})::int AS dropped,
           count(*) FILTER (WHERE f.lexeme IS NULL)::int AS unmeasured
      FROM unnest(to_tsvector('english', ${q.query})) AS l
      LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme`;

  // 2 — independence model of the OR'd union. Not truth (terms correlate),
  //     but it says whether the SELECTION can possibly bound the match set.
  const modelled = 1 - terms.reduce((a, t) => a * (1 - Math.min(0.999, t.df)), 1);

  // 3 — the planner's own estimate of rows matched by the OR'd tsquery, and
  //     the plan chosen for the ORDER BY. EXPLAIN only; nothing executes.
  const tsq = terms.map((t) => `'${t.lexeme.replace(/'/g, "''")}'`).join(' | ');
  let est;
  let planTop;
  try {
    const plan = await sql.unsafe(
      `EXPLAIN (FORMAT JSON) SELECT j.id FROM judgments j
         WHERE j.full_text_tsv @@ to_tsquery('english', $1)
         ORDER BY ts_rank(j.full_text_tsv, to_tsquery('english', $1)) DESC LIMIT 200`,
      [tsq],
    );
    const p = plan[0]['QUERY PLAN'][0].Plan;
    planTop = p['Node Type'];
    const findScan = (n) => {
      if (/Scan/.test(n['Node Type'])) return n;
      for (const c of n.Plans ?? []) { const r = findScan(c); if (r) return r; }
      return null;
    };
    const scan = findScan(p);
    est = scan ? scan['Plan Rows'] * (scan['Parallel Aware'] ? (p['Workers Planned'] ?? 0) + 1 : 1) : null;
  } catch (e) {
    planTop = 'ERR ' + e.message.slice(0, 80);
  }

  const rarest = terms.slice(0, 3).map((t) => `${t.lexeme}=${(t.df * 100).toFixed(2)}%`).join(' ');
  const commonest = terms.slice(-3).map((t) => `${t.lexeme}=${(t.df * 100).toFixed(2)}%`).join(' ');
  const row = {
    id: q.id,
    group: q.group,
    queryChars: q.query.length,
    lexemesTotal: allTerms[0].n,
    droppedAboveMaxDf: allTerms[0].dropped,
    unmeasured: allTerms[0].unmeasured,
    termsUsed: terms.length,
    maxDfUsed: terms.length ? terms[terms.length - 1].df : null,
    modelledUnionShare: modelled,
    plannerRowsMatched: est,
    plannerShare: est === null ? null : est / corpus,
    planTop,
  };
  out.push(row);
  console.log(
    `${q.id.padEnd(20)} ${String(q.query.length).padStart(5)}ch  lex ${String(allTerms[0].n).padStart(4)}` +
      `  dropped>50% ${String(allTerms[0].dropped).padStart(3)}  unmeasured ${String(allTerms[0].unmeasured).padStart(4)}` +
      `  used ${String(terms.length).padStart(2)}  maxdf ${((row.maxDfUsed ?? 0) * 100).toFixed(2)}%`,
  );
  console.log(
    `${' '.repeat(20)} modelled union ${(modelled * 100).toFixed(1)}%   planner rows ` +
      `${est === null ? 'n/a' : Math.round(est).toLocaleString()} (${est === null ? 'n/a' : ((est / corpus) * 100).toFixed(1)}%)   top=${planTop}`,
  );
  console.log(`${' '.repeat(20)} rarest ${rarest}  |  commonest-used ${commonest}`);
}

console.log('\nJSON');
console.log(JSON.stringify({ corpus, maxDf: MAXDF, rows: out }, null, 2));
await sql.end();
