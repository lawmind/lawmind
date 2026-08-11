/**
 * Move the S3 partition key out of `judgments.bench` and into
 * `judgments.source_bench_code` — migration `0040`.
 *
 *   pnpm --filter @lawmind/ingest run backfill:bench-code            # report only
 *   pnpm --filter @lawmind/ingest run backfill:bench-code --confirm  # write
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WENT WRONG, AND WHY IT LOOKED RIGHT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `harvest/hc-load.ts` mapped `bench: partitions.bench`. `partitions.bench` is
 * the AWS bucket's path segment — `.../court=10_8/bench=patnahcucisdb94/...` —
 * which names the court ESTABLISHMENT that published the file.
 * `judgments.bench` means the JUDGES WHO SAT: `judgments/route.ts` sends it and
 * the judgment screen renders it as the coram.
 *
 * The word is identical in both places and denotes two different things, so the
 * assignment reads as correct at every step. Measured against production
 * 11 Aug 2026: **40,705 of 79,322 rows, 51.3% of the corpus**, every one of them
 * a High Court row, **zero** with a matching `judgment_judges` row. It was never
 * a badly-formatted judge list; it was not a judge list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SELECTION IS BY SHAPE, AND WHY THAT IS SAFE HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A coram in this corpus is printed as names: capitals, spaces, initials, and
 * commas between judges — `K. RAMASWAMY, G.B. PATTANAIK`. A partition key is a
 * single lowercase token with no space — `patnahcucisdb94`, `gujarathc`,
 * `newos`, `phhc`, and `mphc_db_gwl` in the shape the fixtures already carry.
 * The two sets cannot overlap: **a judge's name cannot be a single lowercase
 * word with no space.**
 *
 * That is still a shape argument, so this CLI never writes on that argument
 * alone. It **prints every distinct value it is about to move, with its court
 * and row count**, and writes nothing without `--confirm`. A value that is not
 * a court code is meant to be visible in that list before anyone types the flag.
 *
 * Nothing is destroyed: the value moves, and `bench` goes NULL — an existing,
 * already-handled state (16 rows were NULL before this) and the honest one,
 * because the plain High Court metadata variant publishes no judge field at all.
 */
import postgres from 'postgres';

/**
 * A single lowercase token: letters, digits, underscores, no space. Anchored at
 * both ends so `k. ramaswamy` and `Patna High Court` cannot match.
 *
 * Doubled backslashes are deliberate where a class needs them — a plain JS
 * string drops an unrecognised escape before Postgres ever sees the pattern,
 * which has silently produced "0 results" in this repository three times. POSIX
 * classes are used below for the same reason.
 */
const SLUG = '^[a-z0-9_]+$';

type Candidate = { bench: string; court: string; n: number };

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const confirm = process.argv.includes('--confirm');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  try {
    const candidates = await sql<Candidate[]>`
      SELECT bench, court, count(*)::int AS n
      FROM judgments
      WHERE bench ~ ${SLUG} AND source_bench_code IS NULL
      GROUP BY bench, court
      ORDER BY n DESC`;

    if (candidates.length === 0) {
      console.log('nothing to move — no bench value has the shape of a court code.');
      return;
    }

    const rows = candidates.reduce((a, c) => a + c.n, 0);
    console.log(`${candidates.length} distinct values across ${rows} rows:\n`);
    for (const c of candidates) {
      console.log(`  ${c.bench.padEnd(22)} ${String(c.n).padStart(6)}  ${c.court}`);
    }

    // A judge list would have a space or a capital. If one appears here the
    // pattern is wrong, and the run must stop rather than blank a real coram.
    const suspicious = candidates.filter((c) => /[A-Z]|\s|\./.test(c.bench));
    if (suspicious.length > 0) {
      throw new Error(
        `these do not look like court codes and would have been blanked: ` +
          suspicious.map((s) => s.bench).join(', '),
      );
    }

    if (!confirm) {
      console.log('\nreport only. re-run with --confirm to move them.');
      return;
    }

    const moved = await sql`
      UPDATE judgments
         SET source_bench_code = bench, bench = NULL
       WHERE bench ~ ${SLUG} AND source_bench_code IS NULL
      RETURNING id`;
    console.log(`\nmoved ${moved.length} rows.`);

    const [after] = await sql<{ slug_left: number; coded: number; null_bench: number }[]>`
      SELECT count(*) FILTER (WHERE bench ~ ${SLUG})::int AS slug_left,
             count(source_bench_code)::int AS coded,
             count(*) FILTER (WHERE bench IS NULL)::int AS null_bench
      FROM judgments`;
    console.log(
      `verified: ${after?.slug_left} bench values still look like a code, ` +
        `${after?.coded} rows carry source_bench_code, ${after?.null_bench} have no coram.`,
    );
  } finally {
    await sql.end();
  }
}

await main();
