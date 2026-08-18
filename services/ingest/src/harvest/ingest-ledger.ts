/**
 * The durable failure ledger for `hc-load-cli.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TABLE HAS EXISTED SINCE MIGRATION 0047 AND NOTHING EVER WROTE IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc_ingest_ledger` is applied to the database, carries two purpose-built
 * indexes, and holds **zero rows**. `grep hc_ingest_ledger services --include=*.ts`
 * returns **nothing**: the migration landed, the writer was never built, and the
 * table has been sitting there being ANALYZEd. Found 17 Aug 2026 while looking
 * for somewhere durable to record `pdf_missing` — I had already written in
 * `CURRENT_PLAN.md` that no such home existed, which was wrong in the most
 * embarrassing direction. The home existed; the plumbing did not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT COSTS TO NOT HAVE THIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.source_url` is a SUCCESS ledger — `existingSourceUrls` consults it,
 * so a document already written is never re-fetched. **A document that FAILED
 * leaves no trace at all**, so every restart re-downloads and re-attempts every
 * one of them, forever, and nothing can distinguish "not yet tried" from "tried
 * and failed three times".
 *
 * Measured on the first post-cutover fleet, not hypothesised: scope
 * `hc-boot-23_23-y2024` was scheduled against **15,890 remaining** documents and
 * finished having recorded **15,869 `pdf_missing`** — the metadata rows are in
 * the parquet, the PDFs are not in the bucket. The genuinely recoverable
 * population was about **21**. Without this ledger that scope re-fetches 15,869
 * URLs that 404 on every future start, and the year-scope planner keeps ranking
 * it at 15,890 because `source - held` cannot see that the documents do not
 * exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERMANENT vs RETRYABLE — the distinction the migration was designed around
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Taken from the migration's own header rather than invented here:
 *
 * - **Row-level metadata defects are permanent on first sight.** `no_title`,
 *   `no_decision_date`, `unparseable_date`, `no_pdf_link`, `test_fixture_bench`
 *   are properties of the bucket's own metadata row. It will read identically on
 *   attempt 10. Retrying is pure waste.
 * - **Fetch and parse failures are retryable to `MAX_ATTEMPTS`.** `pdf_timeout`,
 *   `pdf_failed`, `pdf_unavailable`, `no_text` might be a transient S3 hiccup or
 *   a stalled socket. Three attempts matches this codebase's standing "3 failed
 *   cycles then stop" convention, after which the document stops costing a
 *   download without a single bad network moment condemning it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `pdf_absent` — THE PREMISE OF THE RETRY RULE DOES NOT HOLD FOR A 404
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The rule above justified retrying `pdf_missing` on the ground that one request
 * "cannot tell them apart". That reasoning is sound and its premise was false:
 * the status WAS available and was being thrown away. `hc-load-cli` matched
 * `/→ \d{3}$/` against the error `text.ts` throws, so a 404 and a 503 landed in
 * the same bucket and were retried on the same schedule.
 *
 * Measured 18 Aug 2026 rather than assumed — 120 `pdf_missing` URLs drawn at
 * random from the 63,122 then in the table, HEADed: **120 of 120 returned 404.**
 * Zero 5xx, zero timeouts. On an S3 bucket a 404 for a keyed object is a
 * definite answer about that key, and it is distinguishable from a 5xx inside a
 * single response.
 *
 * So the split is by what the server actually said:
 *
 *   `pdf_absent`       404 / 403 / 410  the object is not there. Permanent on
 *                                       sight — a second GET reads the same
 *                                       absence, exactly like a metadata defect.
 *   `pdf_unavailable`  5xx / 429 / 408  the server declined to answer. Genuinely
 *                                       ambiguous, so the retry rule stands.
 *
 * `pdf_missing` is retained as a RETRYABLE legacy value and is never written
 * again. The 63,122 rows carrying it were classified before the split and must
 * not be condemned by a label whose meaning changed underneath them; each is
 * relabelled by evidence on its next attempt, or by
 * `scripts/migration/new2-ledger-absence-probe.mjs`, which HEADs them and
 * promotes only the confirmed 404s.
 *
 * A SUCCESS DELETES ITS ROW. If a document that failed twice later loads, the
 * ledger must not keep claiming it failed — `judgments.source_url` becomes the
 * record at that point and two contradictory sources of truth is worse than one
 * incomplete one.
 */
import type { Sql } from 'postgres';

/** Matches the migration's stated convention and the repo's "3 cycles" rule. */
export const MAX_ATTEMPTS = 3;

/**
 * Outcomes that are a property of the METADATA ROW, not of the network. These go
 * permanent immediately — a second attempt reads the identical bytes.
 */
const PERMANENT_ON_SIGHT = new Set([
  'test_fixture_bench',
  'no_pdf_link',
  'no_decision_date',
  'unparseable_date',
  'no_title',
  /**
   * Not a metadata-row property — a NETWORK answer, and the one network answer
   * that is definite. See the `pdf_absent` section of the header: 120/120
   * sampled returned 404, and a repeated GET reads the identical absence.
   * `pdf_unavailable` deliberately does NOT appear here.
   */
  'pdf_absent',
]);

export type LedgerOutcome = {
  readonly sourceUrl: string;
  readonly outcome: string;
  readonly courtCode: string;
  readonly year: number;
};

/**
 * Which of these URLs should NOT be fetched again.
 *
 * Deliberately mirrors `existingSourceUrls`: same shape, same batching concern,
 * consulted at the same point in the loop. One is the success ledger and this is
 * the failure ledger, and the loop needs both to know what is genuinely left.
 *
 * Returns an EMPTY SET if the table is missing rather than throwing. A worker
 * whose database predates migration 0047 must still ingest — degrading to "retry
 * everything" is the old behaviour, which is wasteful but correct, whereas
 * refusing to start is neither.
 */
export async function permanentlyFailedUrls(sql: Sql, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  try {
    const rows = await sql<{ source_url: string }[]>`
      SELECT source_url FROM hc_ingest_ledger
      WHERE permanent = true AND source_url = ANY(${urls})
    `;
    return new Set(rows.map((r) => r.source_url));
  } catch {
    return new Set();
  }
}

/**
 * Record this batch's failures.
 *
 * ON CONFLICT bumps `attempts` and promotes to `permanent` once the count
 * reaches `MAX_ATTEMPTS`, so the promotion is decided by the DATABASE from the
 * accumulated count rather than by a per-process counter that resets on every
 * restart — which is the whole failure being fixed, and would have been
 * reintroduced by tracking attempts in memory.
 *
 * `outcome` is overwritten on conflict: the most recent reason is the useful one,
 * and a document that was `pdf_timeout` and is now `pdf_missing` has told us
 * something new.
 *
 * Never throws. This is an operational ledger, not corpus data: a ledger write
 * that fails must not lose a batch of judgments that was successfully inserted.
 * The cost of a lost ledger row is one redundant fetch later.
 */
export async function recordFailures(sql: Sql, rows: readonly LedgerOutcome[]): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const values = rows.map((r) => ({
      source_url: r.sourceUrl,
      outcome: r.outcome,
      permanent: PERMANENT_ON_SIGHT.has(r.outcome),
      court_code: r.courtCode,
      year: r.year,
    }));
    await sql`
      INSERT INTO hc_ingest_ledger ${sql(
        values,
        'source_url',
        'outcome',
        'permanent',
        'court_code',
        'year',
      )}
      ON CONFLICT (source_url) DO UPDATE SET
        outcome = EXCLUDED.outcome,
        attempts = hc_ingest_ledger.attempts + 1,
        permanent = EXCLUDED.permanent
                    OR hc_ingest_ledger.attempts + 1 >= ${MAX_ATTEMPTS},
        last_attempted_at = now()
    `;
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * A document that finally loaded is no longer a failure. Called after a
 * successful upsert so the two ledgers cannot disagree.
 */
export async function clearSucceeded(sql: Sql, urls: readonly string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await sql`DELETE FROM hc_ingest_ledger WHERE source_url = ANY(${urls as string[]})`;
  } catch {
    /* operational only — see recordFailures */
  }
}
