/**
 * NEW1 — order the Tier-A staging queue by RETRIEVABILITY VALUE, not by id.
 *
 * ── THE MEASUREMENT THAT FORCED THIS ────────────────────────────────────────
 *
 * Stage 1 embedded 9,987 Tier-A documents in `representative_judgment_id` order.
 * Of the first 4,600 staged, **8 carry any inbound citation at all** (114 edges).
 * An id-ordered walk is a uniform sample of a corpus that is 80% routine orders,
 * so it produces a population that is almost never the answer to anybody's query
 * — and, separately, a population no citation-grounded benchmark can score,
 * because there are no query→authority pairs pointing into it.
 *
 * At the measured 8,800 tokens/s the whole Tier-A population is on the order of a
 * hundred GPU-hours. WHICH documents go first is therefore not an optimisation,
 * it is the difference between embeddings that change retrieval this week and
 * embeddings that change it next quarter.
 *
 * ── WHAT "VALUE" MEANS HERE, AND WHAT IT DOES NOT ───────────────────────────
 *
 * Inbound citation count: how many distinct judgments cite this one. It is a
 * measured property of the corpus we already hold, not a model's opinion, and it
 * is exactly the signal that makes a document likely to be the authority someone
 * is looking for.
 *
 * It is also a POPULARITY prior, and popularity priors have a known failure mode:
 * they entrench what is already findable and starve the long tail. Two guards:
 *   · this orders the QUEUE, it does not exclude anything — every eligible
 *     document is still in line;
 *   · the cut is recorded with the count distribution so the tail's size is
 *     visible rather than implied.
 *
 * Eligibility is NOT re-invented here. Candidates are filtered through LCC's
 * `judgment_embedding_eligibility` view, so this changes the ORDER of the same
 * population the contract defines and nothing else.
 *
 * Output is the same JSONL shape `doc-vector-embed.mjs` already consumes.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const OUT_DIR = process.env.OUT_DIR ?? new URL('../../../docs/ai/new1-tier-a/', import.meta.url).pathname.replace(/^\//, '');
const TARGET = Number(process.env.TARGET ?? 50000);
const MIN_CHARS = Number(process.env.MIN_CHARS ?? 2000);
const BATCH = Number(process.env.BATCH ?? 10000);
const REBUILD_COUNTS = process.env.REBUILD_COUNTS === '1';
const LOG = new URL('../../../docs/ai/new1-tier-a/value-order.log', import.meta.url);

const log = (m) => {
  const line = new Date().toISOString() + '  ' + m + '\n';
  process.stdout.write(line);
  appendFileSync(LOG, line);
};

const sql = postgres(url, { ssl: false, max: 2, connection: { statement_timeout: 0 } });

try {
  mkdirSync(OUT_DIR, { recursive: true });

  const [{ exists }] = await sql`
    SELECT count(*)::int AS exists FROM pg_class
    WHERE relname = 'new1_inbound_counts' AND relkind = 'r'
  `;
  if (!exists || REBUILD_COUNTS) {
    log('building new1_inbound_counts (one pass over judgment_citations)');
    const t = Date.now();
    await sql`DROP TABLE IF EXISTS new1_inbound_counts`;
    await sql`
      CREATE TABLE new1_inbound_counts AS
      SELECT cited_judgment_id AS judgment_id,
             count(DISTINCT citing_judgment_id)::int AS inbound
      FROM judgment_citations
      WHERE cited_judgment_id IS NOT NULL
      GROUP BY cited_judgment_id
    `;
    await sql`CREATE INDEX new1_inbound_counts_inbound_idx ON new1_inbound_counts (inbound DESC)`;
    await sql`CREATE UNIQUE INDEX new1_inbound_counts_pk ON new1_inbound_counts (judgment_id)`;
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM new1_inbound_counts`;
    log('inbound counts built: ' + n + ' cited judgments, ' + ((Date.now() - t) / 1000).toFixed(1) + 's');
  } else {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM new1_inbound_counts`;
    log('reusing new1_inbound_counts (' + n + ' rows)');
  }

  // Distribution, printed BEFORE the cut so the tail is visible rather than implied.
  const dist = await sql`
    SELECT bucket, count(*)::int AS judgments FROM (
      SELECT CASE
        WHEN inbound >= 100 THEN '100+'
        WHEN inbound >= 20 THEN '20-99'
        WHEN inbound >= 5 THEN '5-19'
        WHEN inbound >= 2 THEN '2-4'
        ELSE '1' END AS bucket
      FROM new1_inbound_counts
    ) x GROUP BY bucket ORDER BY min(bucket)
  `;
  log('inbound distribution: ' + dist.map((d) => d.bucket + '=' + d.judgments).join('  '));

  log('selecting ' + TARGET + ' highest-inbound eligible documents not already reachable');
  const t2 = Date.now();
  const rows = await sql`
    WITH ranked AS (
      SELECT c.judgment_id, c.inbound
      FROM new1_inbound_counts c
      ORDER BY c.inbound DESC
      LIMIT ${TARGET * 4}
    )
    SELECT r.judgment_id AS "judgmentId",
           r.inbound,
           e.court,
           EXTRACT(YEAR FROM e.judgment_date)::int AS year,
           e.content_hash AS "contentHash",
           e.text_length AS "textLength",
           e.value_band AS "valueBand",
           e.script_quality AS "scriptQuality",
           e.hc_document_class AS "documentClass"
    FROM ranked r
    JOIN judgment_embedding_eligibility e ON e.id = r.judgment_id
    WHERE e.axis_a_identity AND e.axis_b_text AND e.axis_c_role
      AND e.text_length >= ${MIN_CHARS}
      AND NOT EXISTS (SELECT 1 FROM judgment_chunks k WHERE k.judgment_id = r.judgment_id)
      AND NOT EXISTS (SELECT 1 FROM new1_doc_vector_stage s WHERE s.judgment_id = r.judgment_id)
    ORDER BY r.inbound DESC
    LIMIT ${TARGET}
  `;
  log('selected ' + rows.length + ' documents in ' + ((Date.now() - t2) / 1000).toFixed(1) + 's');

  if (rows.length > 0) {
    log(
      'inbound range: max ' + rows[0].inbound + '  min ' + rows[rows.length - 1].inbound +
        '  courts ' + new Set(rows.map((r) => r.court)).size,
    );
  }

  const batchHashes = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const page = rows.slice(i, i + BATCH);
    const idx = String(Math.floor(i / BATCH)).padStart(5, '0');
    const file = OUT_DIR + '/tier-a-value-batch-' + idx + '.jsonl';
    const body = page
      .map((r) =>
        JSON.stringify({
          judgmentId: r.judgmentId,
          contentHash: r.contentHash,
          memberCount: 1,
          court: r.court,
          year: r.year,
          textLength: r.textLength,
          valueBand: r.valueBand,
          scriptQuality: r.scriptQuality,
          documentClass: r.documentClass,
          inbound: r.inbound,
        }),
      )
      .join('\n');
    writeFileSync(file, body + '\n');
    const hash = createHash('sha256').update(page.map((r) => r.judgmentId).join(',')).digest('hex');
    batchHashes.push({ file, rows: page.length, idsHash: hash });
    log('wrote ' + file + '  ' + page.length + ' rows  idsHash ' + hash.slice(0, 12));
  }

  writeFileSync(
    OUT_DIR + '/manifest-tier-a-value.json',
    JSON.stringify(
      {
        kind: 'new1_tier_a_value_ordered_manifest',
        generatedAt: new Date().toISOString(),
        order: 'inbound citation count DESC, then eligibility-filtered',
        eligibility: 'judgment_embedding_eligibility axis A+B+C, text_length >= ' + MIN_CHARS,
        excludes: 'documents already in judgment_chunks or new1_doc_vector_stage',
        target: TARGET,
        rows: rows.length,
        inboundMax: rows[0]?.inbound ?? null,
        inboundMin: rows[rows.length - 1]?.inbound ?? null,
        distribution: dist,
        batches: batchHashes,
      },
      null,
      2,
    ) + '\n',
  );
  log('MANIFEST WRITTEN');
} catch (e) {
  log('FAILED ' + e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
