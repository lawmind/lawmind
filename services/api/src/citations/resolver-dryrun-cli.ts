/**
 * A BOUNDED dry run of the resolver. It writes nothing, ever.
 *
 *   pnpm --filter @lawmind/api resolver:dryrun -- --sample 2000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A DRY RUN IS THE WHOLE DELIVERABLE THIS ROUND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A corpus backfill is forbidden until three things are true: NEW2's truth
 * battery is finished, the fifth agent independently confirms safety, and the
 * approved sample shows ZERO material false unique resolutions. None of those
 * has happened, and the failure mode of writing first is not recoverable by a
 * revert — a wrong `cited_judgment_id` propagates into the treatment graph, and
 * the treatment graph is what tells an advocate whether law is good.
 *
 * So this measures and reports. `--apply` does not exist as a flag, deliberately:
 * a flag that is only unsafe today is a flag somebody passes tomorrow.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAMPLE IS BOUNDED AND SAYS HOW IT WAS DRAWN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `TABLESAMPLE` is not used — NEW3 measured that `SYSTEM` clusters by page and
 * misrepresents anything correlated with insert order, which citation extraction
 * certainly is. This takes an ordered window with an explicit offset instead, so
 * the draw is reproducible and its bias is stateable: it is a CONTIGUOUS window,
 * not a random sample, and the report says so rather than implying a random one.
 */
import postgres from 'postgres';

import { metricsFor, resolveBatch, RESOLVER_VERSION, type Resolution } from './resolver.ts';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v === undefined ? fallback : Number(v);
}

function strArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

const SAMPLE = arg('--sample', 2000);
const OFFSET = arg('--offset', 0);
/** A seek key rather than a deep OFFSET. See the query's note. */
const AFTER = strArg('--after');
const BATCH = 500;

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Refusing rather than guessing a connection.');
    return 2;
  }
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  try {
    /**
     * Unresolved edges only — an edge that already carries a `cited_judgment_id`
     * has been resolved by something else, and including it would measure
     * agreement with the existing resolver rather than new coverage.
     */
    /**
     * `normalised_citation` where it exists, `citation_text` otherwise.
     *
     * Observed on this database: `citation_text` legitimately carries a newline
     * mid-citation — "AIR 1981 SC" then "1861" on the next line — where the
     * source PDF wrapped, and `normalised_citation` is the repaired form. Both
     * produce the same canonical key, because the key strips everything that is
     * not a letter or a digit, so this changes no result. It is chosen so the
     * REPORT shows what an extractor produced rather than a wrapping artefact.
     *
     * **A large OFFSET is deliberately not how a later window is drawn.**
     * `OFFSET 1000000` makes Postgres walk a million rows before returning one,
     * and on a contended box that alone exceeded a two-minute budget. `--after`
     * takes an id and seeks, which is an index scan whatever the depth.
     */
    const rows = await sql<{ raw: string }[]>`
      SELECT COALESCE(NULLIF(btrim(normalised_citation), ''), citation_text) AS raw
        FROM judgment_citations
       WHERE cited_judgment_id IS NULL
         ${AFTER ? sql`AND id > ${AFTER}::uuid` : sql``}
       ORDER BY id
       OFFSET ${OFFSET} LIMIT ${SAMPLE}`;

    if (rows.length === 0) {
      console.log('no unresolved citations in that window — nothing to measure');
      return 0;
    }

    const started = Date.now();
    const results: Resolution[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH).map((r) => r.raw);
      results.push(...(await resolveBatch(sql, slice)));
    }
    const elapsedMs = Date.now() - started;
    const m = metricsFor(results);

    /**
     * The resource context, sampled at report time.
     *
     * A latency figure from this box means nothing without it — this repository
     * has already timed a 1.4-second query at over twelve minutes because
     * something else was running. LOCAL_CONTENDED is the label unless the
     * database is genuinely quiet.
     */
    const [act] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM pg_stat_activity WHERE state = 'active'`;
    const contended = Number(act!.n) > 2;

    /** The refusal reasons, so a bad gate is visible as a shape rather than a number. */
    const reasons = new Map<string, number>();
    for (const r of results) {
      if (r.refusedReason) reasons.set(r.refusedReason, (reasons.get(r.refusedReason) ?? 0) + 1);
    }

    /**
     * Ambiguity SIZE, not just its rate. A key shared by two judgments and a key
     * shared by 253 connected petitions are both "ambiguous" and mean completely
     * different things: the first might be a data problem, the second is a common
     * order and is the courts working normally.
     */
    const ambiguous = results.filter((r) => r.state === 'AMBIGUOUS');
    const sizes = ambiguous.map((r) => r.heldCandidates).sort((a, b) => a - b);
    const pct = (p: number) => (sizes.length === 0 ? 0 : sizes[Math.floor((sizes.length - 1) * p)]!);

    console.log(`RESOLVER DRY RUN — ${RESOLVER_VERSION}`);
    console.log(
      `window        ${AFTER ? `id > ${AFTER} ` : ''}OFFSET ${OFFSET} LIMIT ${SAMPLE} ` +
        '(contiguous, ORDER BY id — NOT a random sample)',
    );
    console.log(`n             ${m.n}`);
    const empty = results.filter((r) => r.refusedReason === 'empty').length;
    console.log(`refused       ${m.refused}  (${((m.refused / m.n) * 100).toFixed(1)}% of all)`);
    console.log(
      `  of which EMPTY  ${empty}  (${((empty / m.n) * 100).toFixed(1)}% of the window) ` +
        `<- a stored row with no citation in it at all`,
    );
    console.log(`formed        ${m.formed}   <- every rate below is over THIS`);
    console.log(`hit%          ${(m.hitRate * 100).toFixed(2)}`);
    console.log(`unique%       ${(m.uniqueRate * 100).toFixed(2)}   (${m.unique})`);
    console.log(`ambiguous%    ${(m.ambiguousRate * 100).toFixed(2)}   (${m.ambiguous})`);
    console.log(`not-held%     ${(m.targetNotHeldRate * 100).toFixed(2)}   (${m.targetNotHeld})`);
    console.log(
      `ambiguity size  p50 ${pct(0.5)} · p90 ${pct(0.9)} · max ${sizes.at(-1) ?? 0}`,
    );
    console.log(`elapsed       ${elapsedMs} ms  ->  ${((elapsedMs / m.n) * 1000).toFixed(0)} ms per 1k references`);
    console.log(`cost          0 model calls, 0 tokens — this resolver makes no model call at all`);
    console.log(`label         ${contended ? 'LOCAL_CONTENDED' : 'LOCAL_QUIET'} (${act!.n} active queries)`);
    console.log('\nrefusal reasons');
    for (const [why, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(6)}  ${why}`);
    }
    console.log(
      '\nFALSE-UNIQUE RATE IS NOT REPORTED HERE, and its absence is deliberate:\n' +
        '  it cannot be computed without an independently adjudicated sample, and\n' +
        '  printing a plausible number for it is exactly the mistake that would let\n' +
        '  a backfill through. NEW2 owns source-truth validation; the fifth agent\n' +
        '  reviews. Until both are done, unique% is a CANDIDATE rate, not an\n' +
        '  accuracy.\n' +
        '\nNOTHING WAS WRITTEN. A resolved citation is not a legal treatment:\n' +
        '  every result carries relationship UNKNOWN and is ineligible to become a\n' +
        '  verified treatment edge or to move currentness coverage.',
    );

    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
