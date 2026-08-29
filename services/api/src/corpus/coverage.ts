/**
 * Corpus coverage — what we hold, against what exists, per court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS ENDPOINT EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SELECT court, count(*) FROM judgments` returns **one row: Supreme Court of
 * India, 38,341.** An advocate practising in a High Court searches, gets a
 * confident-looking result set, and is told nothing about the fact that we hold
 * **0 of 3,493,695** Allahabad documents.
 *
 * `CLAUDE.md`: **silence about a gap does the same damage as a fabricated
 * citation** — both let an advocate rely on something that is not there. A
 * fabricated citation is caught in open court; an invisible gap is not caught at
 * all, which is arguably worse.
 *
 * An ADDITION to the frozen contract, not a change to an existing shape, so it
 * cannot break work already built against it — the same standing this repo gave
 * the bare-acts endpoints.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WORD THIS FILE REFUSES TO SAY IS "JUDGMENTS"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `sourceDocuments` counts **documents**. `docs/HC_CORPUS_SURVEY.md` measured the
 * judgment share of the AWS High Court bucket at a **range of 0.75% to 18.64%**,
 * because the only published label carries a `View Judgement/Order` value on
 * 17.89% of rows that does not distinguish a judgment from an order.
 *
 * So the response says `sourceDocuments`, and `judgmentShareUnknown: true` says
 * out loud that the denominator is not a judgment count. **Rendering "0 of
 * 3,493,695 judgments" would be a confident wrong number**, and this project has
 * caught itself doing that often enough to name it here.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

/** The bucket this coverage describes. One source today; the column exists for the next. */
const HIGH_COURT_SOURCE = 'aws_high_court';

type CoverageRow = {
  court_name: string;
  court_code: string;
  source_documents: string;
  first_year: number;
  last_year: number;
  held: number;
};

export async function getCorpusCoverage(c: Context, sql: Sql): Promise<Response> {
  const rows = await sql<CoverageRow[]>`
    -- Still derived live, never stored. A cached count drifts the moment an
    -- ingest writes a row, and a coverage figure that is stale in the
    -- REASSURING direction is worse than no figure at all.
    --
    -- ONE aggregate, not one per court. This was a correlated subquery
    -- --  (SELECT count(*) FROM judgments j WHERE j.court = cov.court_name)
    -- and the planner turned it into 25 SERIAL index-only scans, one per court
    -- group. Measured 28 Aug 2026 on a settled box, EXPLAIN (ANALYZE, BUFFERS):
    --
    --   correlated     26,156 ms   25 loops x 1,002 ms, no parallelism
    --   GROUP BY once   2,764 ms   Parallel Index Only Scan, 5 workers
    --
    -- 9.5x, and the buffer counts are nearly identical (1.43M vs 1.44M pages,
    -- 3.45M heap fetches either way). It is not reading less; it is reading the
    -- same index ONCE and in parallel. A correlated subquery cannot be
    -- parallelised, which is the whole difference.
    --
    -- Worth stating what did NOT fix it: VACUUM took the visibility map from
    -- 75.14% to 83.52% and cut heap fetches 36% and disk reads 61%, and the
    -- correlated query still took 26,156 ms against 25,025 ms before. Fewer
    -- heap fetches were not the bottleneck; the serial plan was.
    WITH held AS (
      SELECT court, count(*)::int AS n FROM judgments GROUP BY court
    )
    SELECT cov.court_name,
           min(cov.court_code)          AS court_code,
           sum(cov.source_documents)::text AS source_documents,
           min(cov.year)::int           AS first_year,
           max(cov.year)::int           AS last_year,
           -- LEFT JOIN + COALESCE, because a court we hold NOTHING for has no
           -- row in the aggregate at all, and the correlated form returned 0
           -- for it. A NULL here would render as a missing figure rather than
           -- as the honest zero, on exactly the courts where the gap is total.
           coalesce(max(held.n), 0)     AS held
    FROM judgment_coverage cov
    LEFT JOIN held ON held.court = cov.court_name
    WHERE cov.source = ${HIGH_COURT_SOURCE}
    GROUP BY cov.court_name
    ORDER BY sum(cov.source_documents) DESC
  `;

  const [enumerated] = await sql<{ at: string | null }[]>`
    -- ISO-8601, not Postgres text. enumeratedAt goes straight onto the wire, and
    -- the old ::text form is the one Hermes refuses to parse. The test guarding
    -- it only asserted Date.parse was not NaN, which passes on Node against the
    -- broken value -- exactly the trap src/iso-time.ts names in its header.
    SELECT ${sql.unsafe(isoColumn('max(enumerated_at)'))} AS at
    FROM judgment_coverage WHERE source = ${HIGH_COURT_SOURCE}
  `;

  // The Supreme Court is not in judgment_coverage: its bucket is a different
  // shape and Stage 1 already loaded it. Reported separately and honestly rather
  // than folded in with a source total nobody enumerated.
  const [supreme] = await sql<{ held: number }[]>`
    SELECT count(*)::int AS held FROM judgments WHERE court = 'Supreme Court of India'
  `;

  return ok(c, {
    /**
     * **Present and complete.** Stage 1 loaded the Supreme Court bucket, so this
     * is the one court where "held" is the whole story. `sourceDocuments` is null
     * rather than 0 — we have not enumerated that bucket per year, and **unknown
     * is a state, not zero.**
     */
    supremeCourt: {
      courtName: 'Supreme Court of India',
      held: supreme?.held ?? 0,
      sourceDocuments: null,
    },
    highCourts: rows.map((r) => ({
      courtName: r.court_name,
      courtCode: r.court_code,
      /** DOCUMENTS, not judgments. See the module comment. */
      sourceDocuments: Number(r.source_documents),
      held: r.held,
      firstYear: r.first_year,
      lastYear: r.last_year,
    })),
    /**
     * **Says out loud that the denominator is not a judgment count.** A client
     * that ignores this and renders "N judgments" is stating something nobody
     * measured; `docs/HC_CORPUS_SURVEY.md` §2 puts the real share between 0.75%
     * and 18.64%.
     */
    judgmentShareUnknown: true,
    judgmentShareRange: [0.0075, 0.1864],
    /** When the SOURCE was counted. A coverage claim with no date is not checkable. */
    enumeratedAt: enumerated?.at ?? null,
  });
}
