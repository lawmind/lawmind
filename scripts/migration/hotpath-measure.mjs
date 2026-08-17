#!/usr/bin/env node
/**
 * The two exact-lookup hot paths, measured with `EXPLAIN (ANALYZE, BUFFERS)`
 * against the LOCAL cluster — before and after `0052`, same probe values both
 * times.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SCRIPT AND NOT A PASTED EXPLAIN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder's P2 asks for "measure before and after" and for the semantic
 * result to be unchanged. Those are two different claims and a pasted plan
 * proves neither: a plan shows what the planner intended, not that the rewrite
 * returns the same rows. So this runs BOTH shapes, compares their OUTPUT first,
 * and only then compares their cost. **If the rows differ, the timings are not
 * printed at all** — a faster query that answers a different question is not an
 * improvement, and showing its speed invites someone to ship it.
 *
 * LOCAL ONLY. It refuses any URL that is not loopback: these are multi-minute
 * sequential scans on the pre-index side, and running them against a shared
 * database would be a self-inflicted outage.
 *
 *   node scripts/migration/hotpath-measure.mjs --phase before
 *   node scripts/migration/hotpath-measure.mjs --phase after
 *
 * Results are appended to docs/ops/migration/HOTPATH_MEASUREMENTS.md so the
 * before-numbers survive the session that produced them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO_ROOT, 'docs', 'ops', 'migration', 'HOTPATH_MEASUREMENTS.md');

const phase = (() => {
  const i = process.argv.indexOf('--phase');
  const v = i === -1 ? 'before' : process.argv[i + 1];
  if (v !== 'before' && v !== 'after') {
    console.error('--phase must be `before` or `after`');
    process.exit(2);
  }
  return v;
})();

function localUrl() {
  const line = fs
    .readFileSync(path.join(REPO_ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('LOCAL_DATABASE_URL='));
  if (!line) throw new Error('LOCAL_DATABASE_URL missing from .env');
  const url = line.slice('LOCAL_DATABASE_URL='.length).trim();
  const host = new URL(url).hostname;
  // Same refusal shape as NEW1's gate. Railway is dead infrastructure and these
  // queries are heavy enough that "pointed at the wrong database" must be an
  // error, never a slow success.
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`refusing a non-loopback host: ${host}`);
  }
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// The four query shapes. The `baseline` strings are copied from retrieve.ts as
// it stands; the `candidate` strings are what 0052 makes indexable. Filters are
// omitted on both sides equally — they are appended identically by the real
// call site, and including one would measure the filter rather than the shape.
// ─────────────────────────────────────────────────────────────────────────────
const SHAPES = {
  citation: {
    label: 'exactCitation  (cite: lookup)',
    baseline: `
      SELECT j.id
      FROM judgments j
      WHERE (
        upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = $1
        OR EXISTS (
          SELECT 1 FROM unnest(j.reporter_citations) AS rc
          WHERE upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) = $1
        )
      )
      LIMIT 2`,
    // Each branch PARENTHESISED. `SELECT … LIMIT 2 UNION SELECT … LIMIT 2` is a
    // syntax error (42601) — a `LIMIT` binds to the whole set operation, so an
    // un-parenthesised branch carrying one is rejected at PARSE time, before any
    // row is read and before `lawmind_citation_keys` is even looked up. This file
    // and `retrieve.ts` both shipped without the parentheses; NEW1 found it in
    // `retrieve.ts` (bus 0638) and the same defect was sitting here, where it
    // would have turned the whole "after" measurement into an error rather than
    // a number. Must stay byte-identical in shape to `retrieve.ts` — a measurement
    // of a query the API does not run is worse than no measurement.
    candidate: `
      SELECT id FROM (
        (SELECT j.id
         FROM judgments j
         WHERE upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = $1
         LIMIT 2)
        UNION
        (SELECT j.id
         FROM judgments j
         WHERE lawmind_citation_keys(j.reporter_citations) @> ARRAY[$1::text]
         LIMIT 2)
      ) t
      LIMIT 2`,
  },
  title: {
    label: 'exactCaseTitle (case-name lookup)',
    baseline: `
      SELECT j.id
      FROM judgments j
      WHERE lower(btrim(regexp_replace(j.case_title, '\\s+', ' ', 'g'))) =
            lower(btrim(regexp_replace($1, '\\s+', ' ', 'g')))
      LIMIT 2`,
    // Identical text. The index in 0052 matches this expression byte-for-byte,
    // so the rewrite is "build the index", not "change the query" — worth
    // measuring precisely because nothing about the SQL changes.
    candidate: `
      SELECT j.id
      FROM judgments j
      WHERE lower(btrim(regexp_replace(j.case_title, '\\s+', ' ', 'g'))) =
            lower(btrim(regexp_replace($1, '\\s+', ' ', 'g')))
      LIMIT 2`,
  },
};

/**
 * Probe values are read out of the corpus, never invented. A citation key that
 * matches nothing measures how fast we can fail to find it, which is the one
 * number nobody cares about.
 */
async function probes(sql) {
  const [neutral] = await sql`
    SELECT upper(regexp_replace(coalesce(neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) AS key
    FROM judgments
    WHERE neutral_citation IS NOT NULL AND neutral_citation <> ''
    LIMIT 1`;
  const [reporter] = await sql`
    SELECT upper(regexp_replace(reporter_citations[1], '[^A-Za-z0-9]', '', 'g')) AS key
    FROM judgments
    WHERE reporter_citations IS NOT NULL
      AND array_length(reporter_citations, 1) > 0
      AND reporter_citations[1] IS NOT NULL
    LIMIT 1`;
  const [title] = await sql`
    SELECT case_title FROM judgments
    WHERE case_title IS NOT NULL AND length(case_title) BETWEEN 20 AND 120
    LIMIT 1`;
  return {
    neutralKey: neutral?.key ?? null,
    reporterKey: reporter?.key ?? null,
    title: title?.case_title ?? null,
  };
}

async function rowsOf(sql, text, param) {
  const r = await sql.unsafe(text, [param]);
  return r.map((x) => x.id).sort();
}

async function explain(sql, text, param) {
  const r = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, [param]);
  const plan = r[0]['QUERY PLAN'][0];
  const node = plan.Plan;
  // Walk for the most informative scan node rather than reporting the top node,
  // which is always the LIMIT and says nothing.
  const scans = [];
  (function walk(n) {
    if (/Scan/.test(n['Node Type']))
      scans.push(
        `${n['Node Type']}${n['Relation Name'] ? ` on ${n['Relation Name']}` : ''}${n['Index Name'] ? ` using ${n['Index Name']}` : ''}`,
      );
    for (const c of n.Plans ?? []) walk(c);
  })(node);
  return {
    execMs: plan['Execution Time'],
    planMs: plan['Planning Time'],
    sharedRead: node['Shared Read Blocks'] ?? 0,
    sharedHit: node['Shared Hit Blocks'] ?? 0,
    scans: [...new Set(scans)],
  };
}

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`);

async function measure(sql, shape, param, lines) {
  console.log(`\n── ${shape.label}\n   probe: ${JSON.stringify(param).slice(0, 90)}`);
  lines.push(`\n### ${shape.label}\n`, `probe: \`${String(param).slice(0, 120)}\`\n`);

  // Correctness first. Timings are not even computed if the rows disagree.
  const baseRows = await rowsOf(sql, shape.baseline, param);
  const candRows = await rowsOf(sql, shape.candidate, param);
  const same = baseRows.length === candRows.length && baseRows.every((v, i) => v === candRows[i]);
  console.log(
    `   rows: baseline ${baseRows.length}, candidate ${candRows.length} — ${same ? 'IDENTICAL' : 'DIFFERENT'}`,
  );
  lines.push(
    `- rows returned: baseline ${baseRows.length}, candidate ${candRows.length} — **${same ? 'IDENTICAL' : 'DIFFERENT'}**`,
  );
  if (!same) {
    console.error('   REFUSING to report timings: the rewrite does not return the same rows.');
    lines.push(
      '- **timings withheld — the rewrite changed the answer, which makes its speed irrelevant**',
    );
    return false;
  }

  for (const which of ['baseline', 'candidate']) {
    const e = await explain(sql, shape[which], param);
    console.log(
      `   ${which.padEnd(9)} exec ${fmtMs(e.execMs).padStart(9)}  plan ${fmtMs(e.planMs).padStart(8)}  blocks read ${e.sharedRead}  ${e.scans.join(' + ')}`,
    );
    lines.push(
      `- \`${which}\` — exec **${fmtMs(e.execMs)}**, planning ${fmtMs(e.planMs)}, shared blocks read ${e.sharedRead}, hit ${e.sharedHit}`,
      `  - plan: ${e.scans.join(' + ') || 'no scan node'}`,
    );
  }
  return true;
}

async function main() {
  const sql = postgres(localUrl(), { max: 1, idle_timeout: 5, connect_timeout: 20 });
  const lines = [`\n---\n\n## ${phase.toUpperCase()} — ${new Date().toISOString()}\n`];
  try {
    const p = await probes(sql);
    console.log(
      `probes: neutral=${p.neutralKey} reporter=${p.reporterKey} title=${p.title?.slice(0, 60)}`,
    );

    let ok = true;
    if (p.neutralKey) ok = (await measure(sql, SHAPES.citation, p.neutralKey, lines)) && ok;
    // The reporter-citation arm gets its own run. It is the arm that cannot be
    // indexed today and the one that only 0.53% of rows can satisfy, so folding
    // it into the neutral-citation probe would hide it behind a fast answer.
    if (p.reporterKey) ok = (await measure(sql, SHAPES.citation, p.reporterKey, lines)) && ok;
    if (p.title) ok = (await measure(sql, SHAPES.title, p.title, lines)) && ok;

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.appendFileSync(OUT, lines.join('\n') + '\n');
    console.log(`\nappended to ${path.relative(REPO_ROOT, OUT)}`);
    if (!ok) process.exit(1);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(String(e.stack ?? e.message));
  process.exit(2);
});
