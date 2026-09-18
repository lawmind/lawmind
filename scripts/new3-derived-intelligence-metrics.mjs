/**
 * NEW3 derived-intelligence measurement — every number with its denominator.
 * Deliberately cheap: the data plane (GPU sidecar, coarse walk, doc-vector
 * embed, ingest) is running and this must not compete with it.
 */
import postgres from 'postgres';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\ufeff/, '').trim())
    .filter((l) => /^[A-Za-z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const sql = postgres(env.DATABASE_URL, { max: 2, idle_timeout: 15 });

const out = { takenAt: new Date().toISOString(), estimates: {}, exact: {}, notes: [] };

// Planner estimates first — labelled as estimates, never quoted as counts.
out.estimates.reltuples = await sql`
  SELECT st.relname AS relname, c.reltuples::bigint AS reltuples,
         st.last_vacuum, st.last_autovacuum, st.last_analyze, st.last_autoanalyze
  FROM pg_stat_user_tables st JOIN pg_class c ON c.oid = st.relid
  WHERE st.relname IN ('judgments','judgment_citations','judgment_statute_refs','judgment_chunks',
                       'new1_doc_vector_stage','statute_sections','statutes','ecourts_observation',
                       'ecourts_fetch_ledger','matters','users','search_events','searches')
  ORDER BY relname`;

// Small tables: exact counts are cheap.
out.exact.smallTables = {};
for (const t of [
  'ecourts_observation',
  'ecourts_fetch_ledger',
  'ecourts_transition',
  'cause_list_syncs',
  'matters',
  'matter_authorities',
  'users',
  'statutes',
  'saved_searches',
  'searches',
  'search_events',
  'activation_events',
  'entitlements',
  'alerts',
  'citation_disputes',
]) {
  try {
    const [r] = await sql`SELECT count(*)::bigint AS c FROM ${sql(t)}`;
    out.exact.smallTables[t] = Number(r.c);
  } catch (e) {
    out.exact.smallTables[t] = 'ERROR: ' + e.message;
  }
}

// Statute sections — a bounded population, exact is cheap.
{
  const [r] = await sql`SELECT count(*)::bigint AS c FROM statute_sections`;
  out.exact.statuteSections = Number(r.c);
}

// Embedding coverage: the coarse snapshot stage is NEW1's own table.
try {
  const [r] = await sql`SELECT count(*)::bigint AS c FROM new1_doc_vector_stage`;
  out.exact.coarseStaged = Number(r.c);
} catch (e) {
  out.exact.coarseStaged = 'ERROR: ' + e.message;
}
try {
  const [r] = await sql`SELECT count(*)::bigint AS c FROM judgment_chunks`;
  out.exact.judgmentChunks = Number(r.c);
} catch (e) {
  out.exact.judgmentChunks = 'ERROR: ' + e.message;
}
try {
  const [r] = await sql`SELECT count(*)::bigint AS c FROM new1_tranche_passages`;
  out.exact.tranchePassages = Number(r.c);
} catch (e) {
  out.exact.tranchePassages = 'ERROR: ' + e.message;
}

// The semantic population is DOCUMENTS, not chunks — a chunk count is not a
// coverage number and has been misread as one before.
try {
  const [r] = await sql`SELECT count(DISTINCT judgment_id)::bigint AS c FROM judgment_chunks`;
  out.exact.documentsWithChunks = Number(r.c);
} catch (e) {
  out.exact.documentsWithChunks = 'ERROR: ' + e.message;
}

// Citation graph, with both denominators kept apart.
try {
  const [r] = await sql`
    SELECT count(*)::bigint AS reference_strings,
           count(cited_judgment_id)::bigint AS resolved_rows
    FROM judgment_citations`;
  out.exact.citationReferenceStrings = Number(r.reference_strings);
  out.exact.citationResolvedRows = Number(r.resolved_rows);
} catch (e) {
  out.exact.citationGraph = 'ERROR: ' + e.message;
}

// Statute references.
try {
  const [r] = await sql`
    SELECT count(*)::bigint AS refs,
           count(statute_id)::bigint AS linked
    FROM judgment_statute_refs`;
  out.exact.statuteRefs = Number(r.refs);
  out.exact.statuteRefsLinked = Number(r.linked);
} catch (e) {
  out.exact.statuteRefs = 'ERROR: ' + e.message;
}

// Identity coverage on the corpus — one pass, all four fields at once, rather
// than four passes.
try {
  const t0 = Date.now();
  const [r] = await sql`
    SELECT count(*)::bigint                          AS total,
           count(neutral_citation)::bigint           AS with_neutral,
           count(cnr)::bigint                        AS with_cnr,
           count(case_number)::bigint                AS with_case_number,
           count(judgment_date)::bigint              AS with_date,
           count(source_url)::bigint                 AS with_source_url
    FROM judgments`;
  out.exact.judgmentsIdentity = {
    total: Number(r.total),
    withNeutralCitation: Number(r.with_neutral),
    withCnr: Number(r.with_cnr),
    withCaseNumber: Number(r.with_case_number),
    withJudgmentDate: Number(r.with_date),
    withSourceUrl: Number(r.with_source_url),
    elapsedMs: Date.now() - t0,
  };
} catch (e) {
  out.exact.judgmentsIdentity = 'ERROR: ' + e.message;
}

// What else was on the box while this ran — a timing without it is unreadable.
out.concurrentActivity = await sql`
  SELECT state, count(*)::int AS n, max(now() - query_start) AS longest
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`;

fs.mkdirSync('docs/product', { recursive: true });
fs.writeFileSync(
  'docs/product/DERIVED_INTELLIGENCE_METRICS_R12.json',
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 1));
await sql.end();
