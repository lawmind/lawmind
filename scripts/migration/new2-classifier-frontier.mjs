#!/usr/bin/env node
/**
 * NEW2 — WHERE THE CLASSIFIER'S WALK ACTUALLY IS, IN THE KEY SPACE.
 *
 * ---------------------------------------------------------------------------
 * WHY A COUNT CANNOT ANSWER THIS
 * ---------------------------------------------------------------------------
 *
 * NEW1 (bus 0902) asked NEW2 to classify AHEAD of the embedding walk, because
 * both walk `judgments` in primary-key order and anything classified before the
 * GPU arrives at it is impurity that never costs a vector. Whether that is
 * working is a question about POSITION, and `count(*) WHERE hc_class_method IS
 * NOT NULL` cannot answer it — three million rows scattered evenly and three
 * million rows in a contiguous prefix give the same number and mean opposite
 * things.
 *
 * So this measures coverage per SLICE of the id space. `judgments.id` is uuid
 * v4, i.e. uniform over the key space, so equal id ranges hold equal numbers of
 * rows and the profile reads directly as "how far has the walk got".
 *
 * ---------------------------------------------------------------------------
 * BOUNDED PER SLICE, NOT A SCAN
 * ---------------------------------------------------------------------------
 *
 * Each slice is probed by drawing a bounded page from the START of the slice
 * through `judgments_pkey` and reporting the share of it that carries a method.
 * That is one index descent and `--probe` rows per slice, rather than counting
 * 1.17 million rows sixteen times.
 *
 * It measures the LEADING EDGE of each slice, which is exactly the right thing
 * for a question about a walk that moves forward: a slice whose opening rows are
 * unclassified has not been reached, whatever is true deeper inside it.
 *
 *   node --env-file=.env scripts/migration/new2-classifier-frontier.mjs [--probe 400]
 */
import postgres from 'postgres';
import { sslFor } from './new2-ssl.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PROBE = Number(arg('probe', '400'));
const SLICES = Number(arg('slices', '32'));

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set — run with node --env-file=.env');
  process.exit(2);
}
const sql = postgres(url, {
  ssl: sslFor(url),
  max: 1,
  idle_timeout: 5,
  connect_timeout: 60,
  prepare: false,
});

/** Slice boundary as a uuid: the fraction `i / SLICES` of the key space. */
function boundary(i) {
  const frac = i / SLICES;
  /* Only the leading 32 bits are varied. Uuid v4 is uniform, so an even split of
   * the high word is an even split of the rows. */
  const hi = Math.min(0xffffffff, Math.floor(frac * 0x100000000));
  return `${hi.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`;
}

try {
  const rows = [];
  for (let i = 0; i < SLICES; i++) {
    const lo = boundary(i);
    const page = await sql`
      SELECT hc_class_method IS NOT NULL AS has_method
        FROM judgments
       WHERE id >= ${lo}::uuid
       ORDER BY id
       LIMIT ${PROBE}`;
    const withMethod = page.filter((r) => r.has_method).length;
    rows.push({
      slice: i,
      fromId: lo,
      probed: page.length,
      withMethod,
      share: page.length ? withMethod / page.length : null,
    });
  }

  /* The frontier is the first slice whose leading edge is not essentially fully
   * classified. Reported as a slice index and as a percentage of the key space,
   * because the second is the number that compares to NEW1's batch position. */
  const firstGap = rows.find((r) => (r.share ?? 0) < 0.98);
  const frontierPct = firstGap ? (100 * firstGap.slice) / SLICES : 100;

  console.log(
    [
      `slices ${SLICES} · ${PROBE} rows probed at the leading edge of each`,
      '',
      ...rows.map(
        (r) =>
          `  ${String(((100 * r.slice) / SLICES).toFixed(1)).padStart(5)}%  ${r.fromId.slice(0, 8)}  ` +
          `${String(r.withMethod).padStart(4)}/${String(r.probed).padStart(4)}  ` +
          `${r.share === null ? '—' : `${(100 * r.share).toFixed(1)}%`}`,
      ),
      '',
      `classifier frontier: ${frontierPct.toFixed(1)}% of the id space is classified at its leading edge`,
      firstGap
        ? `first slice not covered: ${firstGap.fromId.slice(0, 8)} (${(100 * (firstGap.share ?? 0)).toFixed(1)}%)`
        : 'no gap found in any probed slice',
      '',
      'CAVEAT: this probes the leading edge of each slice, not the whole slice. It answers',
      '"how far has a forward walk got", which is the question. It does NOT measure total',
      'coverage, and a slice reading 0% may still hold classified rows deeper inside it.',
    ].join('\n'),
  );
} finally {
  await sql.end({ timeout: 5 });
}
