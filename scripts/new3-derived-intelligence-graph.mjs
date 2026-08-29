/**
 * Second measurement pass — the graph-shaped numbers. Every query is bounded by
 * a statement_timeout and an unfinished one is recorded as UNMEASURED rather
 * than estimated, because an estimate that looks like a count is worse than a
 * gap that says so.
 */
import postgres from 'postgres';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/^﻿/, '').trim())
    .filter((l) => /^[A-Za-z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const sql = postgres(env.DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connection: { statement_timeout: '600000' },
});

const out = { takenAt: new Date().toISOString(), measured: {}, unmeasured: [] };

async function bounded(name, fn) {
  const t0 = Date.now();
  try {
    const v = await fn();
    out.measured[name] = { value: v, elapsedMs: Date.now() - t0 };
    console.log('OK  ', name, Date.now() - t0 + 'ms', JSON.stringify(v).slice(0, 300));
  } catch (e) {
    out.unmeasured.push({ name, reason: e.message, elapsedMs: Date.now() - t0 });
    console.log('MISS', name, e.message);
  }
}

await bounded('overruledDistribution', async () => {
  const rows = await sql`SELECT overruled_status, count(*)::bigint AS c
                         FROM judgments GROUP BY overruled_status ORDER BY 2 DESC`;
  return Object.fromEntries(rows.map((r) => [r.overruled_status, Number(r.c)]));
});

await bounded('citationCheckStates', async () => {
  const rows = await sql`SELECT verification_state, verified_by_source, count(*)::bigint AS c
                         FROM citation_checks GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40`;
  return rows.map((r) => ({
    verificationState: r.verification_state,
    verifiedBySource: r.verified_by_source,
    count: Number(r.c),
  }));
});

await bounded('distinctResolvedEdges', async () => {
  const [r] = await sql`
    SELECT count(*)::bigint AS c FROM (
      SELECT DISTINCT citing_judgment_id, cited_judgment_id
      FROM judgment_citations WHERE cited_judgment_id IS NOT NULL) d`;
  return Number(r.c);
});

await bounded('judgmentsWithOutgoingResolvedCitation', async () => {
  const [r] = await sql`
    SELECT count(DISTINCT citing_judgment_id)::bigint AS c
    FROM judgment_citations WHERE cited_judgment_id IS NOT NULL`;
  return Number(r.c);
});

await bounded('judgmentsWithIncomingResolvedCitation', async () => {
  const [r] = await sql`
    SELECT count(DISTINCT cited_judgment_id)::bigint AS c
    FROM judgment_citations WHERE cited_judgment_id IS NOT NULL`;
  return Number(r.c);
});

await bounded('judgmentsWithAnyCitationRow', async () => {
  const [r] = await sql`SELECT count(DISTINCT citing_judgment_id)::bigint AS c FROM judgment_citations`;
  return Number(r.c);
});

await bounded('judgmentsWithStatuteRef', async () => {
  const [r] = await sql`SELECT count(DISTINCT judgment_id)::bigint AS c FROM judgment_statute_refs`;
  return Number(r.c);
});

await bounded('retainedSourceArtifacts', async () => {
  const rows = await sql`SELECT text_state, count(*)::bigint AS c
                         FROM official_source_artifact GROUP BY 1 ORDER BY 2 DESC`;
  return Object.fromEntries(rows.map((r) => [String(r.text_state), Number(r.c)]));
});

await bounded('courtsHeld', async () => {
  const [r] = await sql`SELECT count(DISTINCT court)::int AS c FROM judgments`;
  return r.c;
});

out.concurrentActivity = await sql`
  SELECT state, count(*)::int AS n, max(now() - query_start)::text AS longest
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`;

fs.writeFileSync(
  'docs/product/DERIVED_INTELLIGENCE_METRICS_R12_GRAPH.json',
  JSON.stringify(out, null, 2),
);
console.log('\nWROTE docs/product/DERIVED_INTELLIGENCE_METRICS_R12_GRAPH.json');
await sql.end();
