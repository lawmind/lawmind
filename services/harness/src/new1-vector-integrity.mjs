/**
 * NEW1 — live vector integrity over the stage table, per generation.
 *
 * R12 measured this once, by hand, at 2,455,863 current-generation rows
 * (docs/ai/new1-r12/stage-integrity-and-generation.json). The generation is now
 * more than three times that size and no script reproduced the measurement, so
 * the only integrity evidence for 5.2M of the vectors was an artifact describing
 * a different population. This is that measurement as a command.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY sqrt(-(embedding <#> embedding)) AND NOT l2_norm()
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two l2_norm overloads resolve ambiguously on this install and the call errors.
 * The negative inner product of a vector with itself is the exact fp32 dot
 * product pgvector already computes, so this is the same number by a path that
 * compiles. Carried forward verbatim from R12 so the two measurements are
 * comparable rather than merely similar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A CHECK THAT CANNOT FIRE IS STILL WORTH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * wrongDimensions cannot be non-zero while the column is typed vector(1024), and
 * non-finite values cannot be stored because pgvector rejects NaN and Infinity at
 * input. Both are kept. A type can be altered and an input path can change; a
 * check that could only ever fire after such a change is exactly the check worth
 * having, and the norm bounds below are the positive evidence in the meantime.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const OUT_DIR = new URL(process.env.NEW1_OUT_DIR ?? 'docs/ai/new1-r15/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });

const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';
/** R12 used 1e-3 and 1e-2. Kept identical so the two rounds compare. */
const TOL = 1e-3;

const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });
const t0 = Date.now();

try {
  /**
   * Sampled with every timing, because a 1.4s query on this box has been timed at
   * over twelve minutes while an unrelated fleet held the disk. A scan time with
   * no concurrency reading beside it is not a measurement of this query.
   */
  const [{ n: busy }] = await sql`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'active'`;

  const generations = await sql`
    SELECT coalesce(snapshot_hash, 'NULL_OLD_GENERATION')            AS generation,
           count(*)::bigint                                          AS rows,
           count(*) FILTER (WHERE embedding IS NULL)::bigint         AS null_embeddings,
           count(*) FILTER (WHERE vector_dims(embedding) <> 1024)::bigint AS wrong_dimensions,
           count(*) FILTER (WHERE sqrt(-(embedding <#> embedding)) = 0)::bigint AS zero_vectors,
           count(*) FILTER (WHERE abs(sqrt(-(embedding <#> embedding)) - 1) > ${TOL})::bigint AS non_unit_beyond_tol,
           min(sqrt(-(embedding <#> embedding)))                     AS min_norm,
           max(sqrt(-(embedding <#> embedding)))                     AS max_norm
    FROM new1_doc_vector_stage
    GROUP BY 1 ORDER BY 2 DESC`;

  const [dup] = await sql`
    SELECT count(*)::int AS duplicate_content_hashes,
           coalesce(sum(n - 1), 0)::int AS surplus_rows
    FROM (SELECT content_hash, count(*) AS n FROM new1_doc_vector_stage
          WHERE snapshot_hash = ${SNAPSHOT} GROUP BY content_hash HAVING count(*) > 1) t`;

  const rows = generations.map((g) => ({
    generation: g.generation,
    rows: Number(g.rows),
    nullEmbeddings: Number(g.null_embeddings),
    wrongDimensions: Number(g.wrong_dimensions),
    zeroVectors: Number(g.zero_vectors),
    nonUnitBeyondTolerance: Number(g.non_unit_beyond_tol),
    minNorm: g.min_norm === null ? null : Number(g.min_norm),
    maxNorm: g.max_norm === null ? null : Number(g.max_norm),
  }));

  const clean = rows.every(
    (g) => g.nullEmbeddings === 0 && g.wrongDimensions === 0 && g.zeroVectors === 0 && g.nonUnitBeyondTolerance === 0,
  );

  const out = {
    kind: 'new1_vector_integrity',
    measuredAt: new Date().toISOString(),
    elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
    otherActiveBackendsAtStart: busy,
    activeSnapshotHash: SNAPSHOT,
    normTolerance: TOL,
    method:
      'Full scan of new1_doc_vector_stage grouped by generation. Norm computed as ' +
      'sqrt(-(embedding <#> embedding)) — the exact fp32 inner product — because two ' +
      'l2_norm() overloads resolve ambiguously on this install.',
    generations: rows,
    duplicateContentIdentity: {
      DUPLICATE_CONTENT_HASHES: dup.duplicate_content_hashes,
      SURPLUS_ROWS: dup.surplus_rows,
      reading:
        'The stage is keyed on judgment_id, so two judgment rows sharing a content hash ' +
        'is legal and each is a wasted embed, not a corruption. JUDGMENT_ID duplicates are ' +
        'structurally impossible — new1_doc_vector_stage_pkey is UNIQUE on judgment_id.',
    },
    nonFiniteNote:
      'pgvector rejects NaN and Infinity at input, so non-finite values cannot be stored. ' +
      'The norm bounds above are the positive evidence that none is present.',
    VECTOR_INTEGRITY: clean ? 'PASS' : 'FAIL',
  };

  writeFileSync(new URL('vector-integrity.json', OUT_DIR), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
  if (!clean) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
