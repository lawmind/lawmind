/**
 * THE STRUCTURED FRESHNESS OBJECT — RECENCY AND COMPLETENESS, NEVER COLLAPSED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND FILE AND NOT A FIELD ON `/corpus/freshness`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `freshness.ts` answers "how current is what we hold" from OUR side only. Its
 * own module comment says so: `newestItemAtSource` is `null` on every adapter
 * and labelled `NOT_MEASURED`, because knowing it needs a listing fetch per
 * adapter and that endpoint performs none.
 *
 * NEW2 then measured the other side (`docs/ai/new2-r83/source-freshness-decomposition.json`,
 * bus 1329) and the answer inverted the diagnosis: **upstream wrote TODAY**.
 * The AWS High Court bucket's newest object was written 2026-08-27T13:30:48Z
 * with 42 objects in the preceding seven days. So the corpus is not behind
 * because the courts have not published — it is behind because OUR ingest
 * stopped, and those are different sentences with different remedies.
 *
 * A freshness object that reports only the local side cannot tell them apart.
 * This one carries both sides and the gap between them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Recency and completeness are never collapsed into one number.**
 *
 *   recency      = "what is the newest thing"        -> a DATE
 *   completeness = "how much of the window is here"  -> a RATIO
 *
 * A month holding one judgment has a perfect newest-date and no coverage. On
 * 25 Aug 2026 the naive reading said eight days behind; the real answer was
 * fifty-six, because August held 480 judgments against a baseline of 117,332.
 * Any single "freshness score" that mixes the two reproduces that error by
 * construction, so this object refuses to produce one.
 *
 * The naive reading is CARRIED and LABELLED rather than suppressed — the same
 * decision `freshness.ts` made, for the same reason: it is what anybody computes
 * for themselves in one query, and the only way to stop it being believed is to
 * show it next to the honest number, losing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE UPSTREAM SIDE IS READ AND NEVER FETCHED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measuring upstream means walking 1,438 parquet partitions over the network.
 * NEW2's walk of 28 Aug took long enough to be a job with a lease; it is not
 * something an HTTP handler may do. So the upstream side is read from the
 * enumeration NEW2 persists, and every upstream field carries the timestamp of
 * the measurement it came from.
 *
 * An upstream figure with no `measuredAt` is not a fact about upstream, it is a
 * fact about the last time somebody looked — and this object says which.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DENOMINATOR IS THE HONEST PART, AND IT IS NOT WHAT WAS ASKED FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `upstreamLocalCompleteness` is specified with the denominator "upstream unique
 * records in the measured window, after upstream-side dedup". **We do not hold
 * that number.** `judgment_coverage.source_documents` is 20,529,202 across 889
 * court/year rows and it counts PARQUET ROWS, not unique records:
 *
 *   - each partition is published in TWO variants (plain and mobile) whose row
 *     counts differ and whose `pdf_link` naming differs, so a naive sum
 *     double-counts;
 *   - `source-minus-held` on this denominator can never reach zero, which is
 *     how it was caught;
 *   - a `bench=testcase` fixture partition contributed 289,502 of those rows
 *     and was the entire residual frontier until NEW2 gave it its own class.
 *
 * So the ratio is returned with `denominatorState` naming exactly what the
 * denominator is. It is NOT rounded up into the field that was asked for and it
 * is NOT silently omitted: a completeness ratio whose denominator is
 * undeclared is the same defect as a citation with no verification state.
 */
import type { Sql } from 'postgres';

import { isoColumn } from '../iso-time.ts';

/** NEW2's thresholds, carried unchanged so the two computations cannot drift. */
const COMPLETE_ENOUGH_FLOOR = 0.6;
const PARTIAL_FLOOR = 0.1;
/**
 * How many trailing months are excluded from a court's own baseline.
 *
 * NEW2's `n2-source-freshness-decomposition.mts` uses
 * `monthsSeen.slice(0, length - 2)`. Two, and it is carried rather than
 * re-chosen: a baseline that includes the months under test cannot detect the
 * dip it exists to detect.
 */
const MONTHS_EXCLUDED_FROM_BASELINE = 2;

export type MonthCompleteness = 'COMPLETE_ENOUGH' | 'PARTIAL' | 'EFFECTIVELY_ABSENT' | 'NO_BASELINE';

/** NEW2's exact grading. One function, so there is one definition of the word. */
export function completenessOf(ratio: number | null): MonthCompleteness {
  if (ratio === null) return 'NO_BASELINE';
  if (ratio >= COMPLETE_ENOUGH_FLOOR) return 'COMPLETE_ENOUGH';
  if (ratio >= PARTIAL_FLOOR) return 'PARTIAL';
  return 'EFFECTIVELY_ABSENT';
}

export type UpstreamLocalCompleteness = {
  /** Local records / upstream records in the window. Null when upstream is unmeasured. */
  ratio: number | null;
  upstreamRecords: number | null;
  localRecords: number;
  /** What the denominator ACTUALLY counts. Never assume it is deduped records. */
  denominatorState:
    | 'PARQUET_ROWS_NOT_DEDUPED'
    | 'UPSTREAM_UNIQUE_RECORDS'
    | 'NOT_MEASURED';
  denominatorNote: string;
  /** When the upstream side was enumerated. A ratio with no date is not a fact. */
  upstreamMeasuredAt: string | null;
  window: string;
};

export type CourtMonthCell = {
  month: string;
  documents: number;
  ratioToOwnBaseline: number | null;
  state: MonthCompleteness;
};

export type CourtMonthDetail = {
  court: string;
  baselinePerMonth: number;
  months: CourtMonthCell[];
};

export type FreshnessObject = {
  computedAt: string;
  computeMs: number;
  latestUpstreamDecisionDate: string | null;
  latestUpstreamDecisionState: 'MEASURED' | 'NOT_MEASURED';
  latestUpstreamMeasuredAt: string | null;
  latestLocalDecisionDate: string | null;
  lastSuccessfulIngestAt: string | null;
  upstreamLocalCompleteness: UpstreamLocalCompleteness;
  /** upstream − local, in days. Null whenever either side is unknown. */
  sourceLagDays: number | null;
  sourceLagState: 'MEASURED' | 'UNKNOWN_UPSTREAM' | 'UNKNOWN_LOCAL';
  unavailableSourceCount: number;
  unavailableSources: { source: string; reason: string }[];
  courtMonthDetail: CourtMonthDetail[];
  /**
   * The reading nobody should act on, kept next to the honest one.
   * `max(judgment_date)` is a RECENCY figure and says nothing about coverage.
   */
  naive: {
    newestJudgmentDate: string | null;
    lagDays: number | null;
    reading: string;
  };
  caveats: string[];
};

const DAY_MS = 86_400_000;

function daysBetween(laterIso: string | null, earlierIso: string | null): number | null {
  if (!laterIso || !earlierIso) return null;
  const a = Date.parse(`${laterIso}T00:00:00Z`);
  const b = Date.parse(`${earlierIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / DAY_MS);
}

/**
 * The upstream enumeration, as stored. Never fetched.
 *
 * `judgment_coverage` is written by NEW2's walk and is the only durable record
 * of what upstream holds. It carries no upstream DECISION date — it counts
 * documents per court/year — so `latestUpstreamDecisionDate` is genuinely
 * unavailable from the database and is reported `NOT_MEASURED` rather than
 * substituted with a year, an object write time, or our own maximum. Each of
 * those three substitutions would produce a plausible date that is not the
 * thing the field names.
 */
async function upstreamSide(sql: Sql) {
  const [row] = await sql<{ documents: string | null; at: string | null }[]>`
    SELECT sum(source_documents)::text AS documents,
           ${sql.unsafe(isoColumn('max(enumerated_at)'))} AS at
      FROM judgment_coverage`;
  return {
    records: row?.documents == null ? null : Number(row.documents),
    measuredAt: row?.at ?? null,
  };
}

export async function buildFreshnessObject(sql: Sql): Promise<FreshnessObject> {
  const startedAt = Date.now();

  const [local] = await sql<{ newest: string | null; held: string }[]>`
    SELECT max(judgment_date)::text AS newest, count(*)::text AS held
      FROM judgments`;

  const [ingest] = await sql<{ at: string | null }[]>`
    SELECT ${sql.unsafe(isoColumn('max(created_at)'))} AS at FROM judgments`;

  const upstream = await upstreamSide(sql);

  /**
   * Court x month, computed EXACTLY as NEW2 computes it — same predicate, same
   * grouping, same per-court baseline, same floors.
   *
   * A court's own settled months are its baseline. A corpus-wide baseline would
   * call every small High Court incomplete for being small, which is a statement
   * about its size and not about our coverage. NEW2's words, and the reason the
   * two implementations must not diverge.
   *
   * Bounded to the current calendar year and index-backed on `judgment_date`.
   * The unbounded form is a scan of 18.7M rows.
   */
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const cells = await sql<{ court: string; m: string; n: number }[]>`
    SELECT court, to_char(date_trunc('month', judgment_date), 'YYYY-MM') AS m, count(*)::int AS n
      FROM judgments
     WHERE judgment_date >= ${yearStart}::date
     GROUP BY 1, 2`;

  const byCourt = new Map<string, Record<string, number>>();
  for (const c of cells) {
    if (!byCourt.has(c.court)) byCourt.set(c.court, {});
    byCourt.get(c.court)![c.m] = c.n;
  }
  const monthsSeen = [...new Set(cells.map((c) => c.m))].sort();
  const settled = monthsSeen.slice(0, Math.max(monthsSeen.length - MONTHS_EXCLUDED_FROM_BASELINE, 1));

  const courtMonthDetail: CourtMonthDetail[] = [...byCourt.entries()]
    .map(([court, ms]) => {
      const base = settled.map((m) => ms[m] ?? 0);
      const baseline = base.length > 0 ? base.reduce((a, x) => a + x, 0) / base.length : 0;
      return {
        court,
        baselinePerMonth: Math.round(baseline),
        months: monthsSeen.map((m) => {
          const n = ms[m] ?? 0;
          const ratio = baseline > 0 ? Number((n / baseline).toFixed(4)) : null;
          return { month: m, documents: n, ratioToOwnBaseline: ratio, state: completenessOf(ratio) };
        }),
      };
    })
    .sort((a, b) => b.baselinePerMonth - a.baselinePerMonth);

  /**
   * A source is UNAVAILABLE when we cannot state its current position — not
   * when it is broken.
   *
   * Counted rather than listed-and-forgotten because the count is the field that
   * gets rendered, and a zero would say "we know where every source stands".
   * Today none of the three can be stated, and eCourts has never observed
   * anything at all, which is a state and not a date.
   */
  const [ec] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM ecourts_observation`;
  const unavailableSources = [
    {
      source: 'aws_high_court',
      reason:
        'newest DECISION date at source is NOT_MEASURED — it needs a parquet walk, which an ' +
        'HTTP handler may not perform. NEW2 measured it out of band on 2026-08-27.',
    },
    {
      source: 'aws_supreme_court',
      reason: 'newest DECISION date at source is NOT_MEASURED, same reason.',
    },
    ...(Number(ec?.n ?? 0) === 0
      ? [
          {
            source: 'ecourts',
            reason:
              'NO_OBSERVATIONS — the adapter has never run, so it has no lag to measure. Zero ' +
              'observations is a state, not a date.',
          },
        ]
      : []),
  ];

  const localNewest = local?.newest ?? null;

  /**
   * NOT_MEASURED, and deliberately not substituted.
   *
   * `judgment_coverage` counts documents per court/year and holds no upstream
   * DECISION date. A partition year, an S3 object write time and our own
   * maximum would each yield a plausible date that is not this field, and the
   * third would make `sourceLagDays` read as a confident zero.
   *
   * Kept as a variable rather than inlined as `null` so that the arithmetic
   * below is already correct on the day a walk starts persisting it.
   */
  const upstreamNewest: string | null = null;
  const sourceLagDays = daysBetween(upstreamNewest, localNewest);

  return {
    computedAt: new Date().toISOString(),
    computeMs: Date.now() - startedAt,

    latestUpstreamDecisionDate: upstreamNewest,
    latestUpstreamDecisionState: upstreamNewest === null ? 'NOT_MEASURED' : 'MEASURED',
    latestUpstreamMeasuredAt: upstream.measuredAt,

    latestLocalDecisionDate: localNewest,
    lastSuccessfulIngestAt: ingest?.at ?? null,

    upstreamLocalCompleteness: {
      ratio:
        upstream.records && upstream.records > 0
          ? Number((Number(local?.held ?? 0) / upstream.records).toFixed(4))
          : null,
      upstreamRecords: upstream.records,
      localRecords: Number(local?.held ?? 0),
      denominatorState: upstream.records === null ? 'NOT_MEASURED' : 'PARQUET_ROWS_NOT_DEDUPED',
      denominatorNote:
        'judgment_coverage.source_documents counts PARQUET ROWS, not unique records after ' +
        'upstream-side dedup. Each partition is published in two variants (plain and mobile) with ' +
        'differing row counts, so this denominator double-counts and source-minus-held can never ' +
        'reach zero. The specified denominator — upstream unique records after dedup — is not held ' +
        'anywhere today.',
      upstreamMeasuredAt: upstream.measuredAt,
      window: 'whole corpus, all courts and years enumerated so far',
    },

    /**
     * Null, and the STATE says which side is missing.
     *
     * A lag of null with no explanation is indistinguishable from a lag of zero
     * in most renderings, and "we are perfectly current" is the single most
     * dangerous thing this object could accidentally say.
     */
    sourceLagDays,
    sourceLagState:
      upstreamNewest === null
        ? 'UNKNOWN_UPSTREAM'
        : localNewest === null
          ? 'UNKNOWN_LOCAL'
          : 'MEASURED',

    unavailableSourceCount: unavailableSources.length,
    unavailableSources,

    courtMonthDetail,

    naive: {
      newestJudgmentDate: localNewest,
      lagDays: localNewest
        ? Math.floor((Date.now() - Date.parse(`${localNewest}T00:00:00Z`)) / DAY_MS)
        : null,
      reading:
        'max(judgment_date) — a RECENCY figure only. A month holding one judgment has a newest ' +
        'date and no coverage; on 2026-08-25 this read 8 days against a real 56. Never quote it ' +
        'as currency.',
    },

    caveats: [
      'Recency and completeness are separate fields here and must stay separate. There is no ' +
        'single freshness score and one must not be derived from these.',
      'The 0.6 / 0.1 floors are this project\'s and are NOT validated against any court\'s ' +
        'publication calendar. Indian courts take a summer vacation from mid-May to early July, ' +
        'so a thin June is expected — which is why the months under test are excluded from the ' +
        'baseline they are measured against rather than averaged into it.',
      'latestUpstreamDecisionDate is NOT_MEASURED. Measuring it means walking 1,438 parquet ' +
        'partitions, which a request handler may not do. NEW2 measured it out of band on ' +
        '2026-08-27 and found upstream had written that day — so a large local gap is OUR ingest ' +
        'being behind, not the law being unpublished.',
      'upstreamLocalCompleteness uses a parquet-row denominator, not deduped unique records. See ' +
        'denominatorState.',
      'courtMonthDetail is computed identically to NEW2\'s decomposition: per-court baselines from ' +
        'that court\'s own settled months, because a corpus-wide baseline calls every small High ' +
        'Court incomplete for being small.',
    ],
  };
}
