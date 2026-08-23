/**
 * NEW2 P1 — the semantics of the 22M-row citation table, measured.
 *
 * The founder's question: which rows may enter a resolver, and which must never.
 * Answering it needs the row STATES named and counted, not estimated by eye.
 *
 * Exact counts are taken where an index can serve them (the partial index on
 * `normalised_citation WHERE cited_judgment_id IS NULL` makes both the sentinel
 * count and the unresolved count index-only scans). Everything else is a bounded
 * sample with a stated denominator — the box is shared and a 22M seq scan for a
 * proportion is not worth what it costs the lanes that are running.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const OUT = 'docs/ai/new2/citation-table-semantics.json';
const one = async (t) => (await sql.unsafe(t))[0];
const ci = (k, n) => { // Wilson 95%
  if (!n) return [null, null];
  const p = k / n; const z = 1.96; const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [+((c - m) * 100).toFixed(2), +((c + m) * 100).toFixed(2)];
};

const out = { generatedAt: new Date().toISOString(), exact: {}, sampled: {}, notes: [] };
try {
  console.log('exact counts (index-only scans) ...');
  const sentinel = Number((await one(`select count(*)::text n from judgment_citations where cited_judgment_id is null and normalised_citation = ''`)).n);
  const unresolved = Number((await one(`select count(*)::text n from judgment_citations where cited_judgment_id is null`)).n);
  const resolved = Number((await one(`select count(*)::text n from judgment_citations where cited_judgment_id is not null`)).n);
  const total = unresolved + resolved;
  const extracted = unresolved - sentinel;
  out.exact = {
    total_rows: total,
    PLACEHOLDER_SENTINEL: sentinel,
    EXTRACTED_REFERENCE_unresolved: extracted,
    RESOLVED_REFERENCE: resolved,
    sentinel_pct: +(sentinel / total * 100).toFixed(2),
    extracted_pct: +(extracted / total * 100).toFixed(2),
    resolved_pct: +(resolved / total * 100).toFixed(2),
    method: 'count(*) over judgment_citations_unresolved_idx (partial, index-only) plus judgment_citations_cited_idx',
  };
  console.log(JSON.stringify(out.exact, null, 1));

  console.log('\nsentinel is one-per-judgment? ...');
  const s2 = await one(`select count(*)::text rows, count(distinct citing_judgment_id)::text judgments
                          from (select citing_judgment_id from judgment_citations
                                 where cited_judgment_id is null and normalised_citation = ''
                                 limit 400000) t`);
  out.exact.sentinel_one_per_judgment = {
    rows_probed: Number(s2.rows), distinct_citing_judgments: Number(s2.judgments),
    verdict: s2.rows === s2.judgments ? 'ONE_PER_JUDGMENT_CONFIRMED' : 'MORE_THAN_ONE_SEEN',
    guaranteed_by: "unique index judgment_citations_unique_edge (citing_judgment_id, normalised_citation) — '' can occur at most once per judgment",
  };
  console.log(JSON.stringify(out.exact.sentinel_one_per_judgment, null, 1));

  console.log('\nsampled shape of the EXTRACTED population ...');
  const N = 40000;
  const rows = await sql.unsafe(`
    select citation_text, normalised_citation, char_offset, citing_judgment_id, cited_judgment_id
      from judgment_citations tablesample bernoulli (0.35)
     where normalised_citation <> ''
     limit ${N}`);
  const n = rows.length;
  const MONTHS = /^\d{4}\s*:\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i;
  let month = 0; let neutral = 0; let insc = 0; let reporter = 0; let other = 0; let offsetZero = 0;
  for (const r of rows) {
    const t = r.citation_text;
    if (MONTHS.test(t)) month += 1;
    else if (/^\d{4}\s*:/.test(t)) neutral += 1;
    else if (/INSC/i.test(t)) insc += 1;
    else if (/SCC|SCR|AIR|SCALE/i.test(t)) reporter += 1;
    else other += 1;
    if (r.char_offset === 0) offsetZero += 1;
  }
  out.sampled.form_mix = {
    sample_n: n,
    NOT_A_CITATION_month_stamp: { k: month, pct: +(month / n * 100).toFixed(3), ci95: ci(month, n) },
    NEUTRAL: { k: neutral, pct: +(neutral / n * 100).toFixed(2) },
    INSC: { k: insc, pct: +(insc / n * 100).toFixed(2) },
    REPORTER: { k: reporter, pct: +(reporter / n * 100).toFixed(2) },
    OTHER: { k: other, pct: +(other / n * 100).toFixed(2) },
    char_offset_zero: { k: offsetZero, pct: +(offsetZero / n * 100).toFixed(3) },
  };
  console.log(JSON.stringify(out.sampled.form_mix, null, 1));

  console.log('\nparallel reporter forms — two rows of one citing judgment pinned to one target ...');
  const par = await sql.unsafe(`
    with pinned as (
      select citing_judgment_id, cited_judgment_id, count(*) n, count(distinct normalised_citation) forms
        from judgment_citations
       where cited_judgment_id is not null
       group by 1,2
    )
    select count(*)::text pairs,
           count(*) filter (where n > 1)::text multi_row_pairs,
           coalesce(sum(n) filter (where n > 1),0)::text rows_in_multi,
           max(n)::text worst
      from pinned`);
  out.exact.LEGITIMATE_PARALLEL_REPORTER = {
    distinct_citing_target_pairs: Number(par[0].pairs),
    pairs_carrying_more_than_one_row: Number(par[0].multi_row_pairs),
    rows_involved: Number(par[0].rows_in_multi),
    worst_pair_rows: Number(par[0].worst),
    meaning: 'one citing judgment naming one target through more than one citation form — a parallel reporter citation, NOT a duplicate. Collapsing it would under-count nothing; counting it twice over-counts the treatment.',
  };
  console.log(JSON.stringify(out.exact.LEGITIMATE_PARALLEL_REPORTER, null, 1));

  console.log('\nDUPLICATE_REFERENCE — structurally impossible? ...');
  out.exact.DUPLICATE_REFERENCE = {
    count: 0,
    reason: 'the unique index judgment_citations_unique_edge (citing_judgment_id, normalised_citation) makes an exact duplicate reference unrepresentable. A repeated citation inside one judgment is de-duplicated on first appearance by extractCitations() before insert.',
    verified_by: 'pg_indexes + services/ingest/src/citations.ts extractCitations() seen Map',
  };

  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('\nwritten ->', OUT);
} finally { await sql.end(); }
