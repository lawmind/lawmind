/**
 * NEW1 P3 — the milestone report for the Tier-A embedding run.
 *
 * Run it at 250k, 500k, 1M, 2M and at the end. It answers, from the database and
 * the run log rather than from anyone's recollection:
 *
 *   attempted · written · duplicate-skipped · now-ineligible · no-text
 *   invalid or non-unit-norm vectors
 *   model and recipe, as recorded ON THE ROWS
 *   self-retrieval on a RANDOM sample
 *   throughput, batch time, and what the GPU was doing
 *
 * SELF-RETRIEVAL IS THE ONLY ONE THAT TESTS MEANING
 * -------------------------------------------------
 * Row counts and vector norms prove the write path worked. A pipeline that
 * embedded the wrong text, or the same text repeatedly, passes both. Re-embedding
 * a document's own HEAD span and asking whether its nearest neighbour is itself is
 * the cheapest question that can fail for the right reason.
 *
 * The sample is RANDOM per run, deliberately. The older sanity check ordered by
 * `judgment_id` and took the first eight, which is the same eight documents every
 * time — all from the lowest uuid range, all from batch 0. It would have passed
 * unchanged while every later batch wrote rubbish.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const GPU = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const N = Number(process.env.SELF_RETRIEVAL_N ?? 20);
const LABEL = process.env.MILESTONE ?? 'adhoc';
const OUT = new URL(`../../../docs/ai/new1-tier-a/milestone-${LABEL}.json`, import.meta.url);
const STAGE_LOG = new URL('../../../docs/ai/new1-tier-a/stage-embed.log', import.meta.url);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 600_000 } });

const [{ staged }] = await sql`SELECT count(*)::int AS staged FROM new1_doc_vector_stage`;
const [{ refused }] = await sql`SELECT count(*)::int AS refused FROM new1_doc_vector_stage_refused`;

// `<#>` is negative inner product; for a unit vector the self product is -1. A row
// whose norm has drifted is a row the sidecar or the write path mangled, and it
// must be counted rather than assumed absent.
const [{ bad }] = await sql`
  SELECT count(*)::int AS bad FROM new1_doc_vector_stage
  WHERE abs(1 - (embedding <#> embedding) * -1) > 0.01
`;
const [{ nulls }] = await sql`
  SELECT count(*)::int AS nulls FROM new1_doc_vector_stage
  WHERE embedding IS NULL OR tokens IS NULL OR tokens <= 0
`;
const recipes = await sql`
  SELECT recipe, model, count(*)::int AS n, min(created_at) AS first, max(created_at) AS last
  FROM new1_doc_vector_stage GROUP BY 1, 2 ORDER BY n DESC
`;
const byCourt = await sql`
  SELECT court, count(*)::int AS n FROM new1_doc_vector_stage
  GROUP BY 1 ORDER BY n DESC LIMIT 15
`;
const [{ courts }] = await sql`SELECT count(DISTINCT court)::int AS courts FROM new1_doc_vector_stage`;

// ── the run log is the only record of attempted-vs-written per batch ──────────
const lines = readFileSync(STAGE_LOG, 'utf8').split('\n');
const done = lines
  .filter((l) => l.includes('STAGE DONE'))
  .map((l) => JSON.parse(l.slice(l.indexOf('{'))));
const batchesCompleted = new Set(done.map((d) => d.batchFile)).size;
const failedLines = lines.filter((l) => l.includes('FAILED')).length;
const sum = (k) => done.reduce((a, d) => a + (Number(d[k]) || 0), 0);
const recent = done.slice(-10);

/**
 * The per-batch ineligible RATE, as a trend rather than a total.
 *
 * NEW2 is classifying ahead of this walk in the same primary-key order, which is
 * what makes the pre-GPU skip worth anything: a document only gets refused if a
 * rule has already looked at it. So the rate is a live readout of whether they
 * are still in front.
 *
 * A FALLING rate is the alarm, and it is the kind of alarm that otherwise looks
 * like good news. It does not mean the corpus got cleaner; it means the walk has
 * overtaken the classifier and is embedding documents nobody has judged — the
 * same population reading as clean because nothing looked at it.
 */
const ineligibleTrend = done
  .filter((d) => d.skippedNowIneligible !== undefined)
  .slice(-20)
  .map((d) => {
    const newRows = Math.max(1, d.rowsInBatch - (d.skippedAlreadyStaged ?? 0));
    return {
      batch: d.batchFile.replace(/.*tier-a-/, '').replace('.jsonl', ''),
      newRows,
      ineligible: d.skippedNowIneligible,
      ratePct: Number(((100 * d.skippedNowIneligible) / newRows).toFixed(2)),
      byClass: d.skippedByRefusedClass ?? {},
    };
  });
const throughput = {
  batchesCompleted,
  stageStartLines: lines.filter((l) => l.includes('STAGE START')).length,
  stageDoneLines: done.length,
  failedLines,
  attemptedRows: sum('rowsInBatch'),
  inserted: sum('inserted'),
  skippedAlreadyStaged: sum('skippedAlreadyStaged'),
  skippedNowIneligible: sum('skippedNowIneligible'),
  skippedNoText: sum('skippedNoText'),
  tokens: sum('tokens'),
  lastTenMeanTokensPerSecond: recent.length ? recent.reduce((a, d) => a + d.tokensPerSecond, 0) / recent.length : null,
  lastTenMeanBatchSeconds: recent.length ? recent.reduce((a, d) => a + d.elapsedSeconds, 0) / recent.length : null,
};

// ── self-retrieval on a random sample ────────────────────────────────────────
const docs = await sql`
  SELECT s.judgment_id, s.embedded_chars, s.court, left(j.full_text, s.embedded_chars) AS head
  FROM new1_doc_vector_stage s
  TABLESAMPLE SYSTEM (2)
  JOIN judgments j ON j.id = s.judgment_id
  WHERE j.full_text IS NOT NULL
  LIMIT ${N}
`.catch(async () => {
  // TABLESAMPLE cannot be applied to the left side of a join in this position on
  // every version; fall back to a random cut of a bounded window rather than
  // silently testing the same rows the old check tested.
  return sql`
    SELECT s.judgment_id, s.embedded_chars, s.court, left(j.full_text, s.embedded_chars) AS head
    FROM (SELECT * FROM new1_doc_vector_stage ORDER BY random() LIMIT ${N}) s
    JOIN judgments j ON j.id = s.judgment_id
    WHERE j.full_text IS NOT NULL
  `;
});

let selfFirst = 0;
let selfTop3 = 0;
const ranks = [];
if (docs.length > 0) {
  const res = await fetch(GPU, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: docs.map((d) => d.head) }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error('sidecar ' + res.status);
  const body = await res.json();
  for (const [i, d] of docs.entries()) {
    const lit = '[' + body.vectors[i].join(',') + ']';
    const hits = await sql`
      SELECT judgment_id FROM new1_doc_vector_stage
      ORDER BY embedding <=> ${lit}::vector LIMIT 3
    `;
    const rank = hits.findIndex((h) => h.judgment_id === d.judgment_id) + 1;
    ranks.push({ judgmentId: d.judgment_id, court: d.court, rank: rank || null });
    if (rank === 1) selfFirst += 1;
    if (rank >= 1 && rank <= 3) selfTop3 += 1;
  }
}

const report = {
  kind: 'new1_stage_milestone',
  milestone: LABEL,
  measuredAt: new Date().toISOString(),
  stagedRows: staged,
  quarantinedRows: refused,
  nonUnitNormVectors: bad,
  nullOrZeroTokenRows: nulls,
  distinctCourts: courts,
  recipes,
  topCourts: byCourt,
  throughput,
  ineligibleTrend,
  selfRetrieval: {
    sampled: docs.length,
    selfIsNearestNeighbour: selfFirst,
    selfInTop3: selfTop3,
    ranks,
  },
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log(`MILESTONE ${LABEL}`);
console.log(`  staged rows            ${staged}`);
console.log(`  quarantined rows       ${refused}`);
console.log(`  non-unit-norm vectors  ${bad}`);
console.log(`  null / zero-token rows ${nulls}`);
console.log(`  distinct courts        ${courts}`);
for (const r of recipes) console.log(`  recipe                 ${r.recipe} | ${r.model} | ${r.n}`);
console.log(`  batches completed      ${throughput.batchesCompleted}`);
console.log(`  attempted / inserted   ${throughput.attemptedRows} / ${throughput.inserted}`);
console.log(`  dup / ineligible / noText  ${throughput.skippedAlreadyStaged} / ${throughput.skippedNowIneligible} / ${throughput.skippedNoText}`);
console.log(`  last-10 tok/s          ${throughput.lastTenMeanTokensPerSecond?.toFixed(0) ?? 'n/a'}`);
console.log(`  last-10 batch seconds  ${throughput.lastTenMeanBatchSeconds?.toFixed(0) ?? 'n/a'}`);
if (ineligibleTrend.length > 0) {
  const rates = ineligibleTrend.map((t) => t.ratePct);
  const half = Math.ceil(rates.length / 2);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(
    `  ineligible rate        ${mean(rates.slice(0, half)).toFixed(1)}% -> ${mean(rates.slice(-half)).toFixed(1)}% over the last ${rates.length} batches`,
  );
  console.log('    a FALLING rate means the walk has overtaken the classifier, not that the corpus got cleaner');
}
console.log(`  self-retrieval         ${selfFirst}/${docs.length} nearest, ${selfTop3}/${docs.length} in top 3`);
console.log(`\nwrote ${OUT.pathname}`);

await sql.end({ timeout: 10 });
