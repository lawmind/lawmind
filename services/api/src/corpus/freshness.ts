/**
 * Corpus freshness — how current the law we hold actually is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `max(judgment_date)` IS NOT THE ANSWER, AND THIS FILE EXISTS BECAUSE IT WAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On 25 August 2026 the corpus's newest judgment was dated 2026-08-18, so the
 * naive reading was "eight days behind". The real answer was **fifty-six**.
 * August held **480** judgments against a trailing baseline of 117,332 a month —
 * 0.4% of a month, with a newest date. NEW2 measured it
 * (`docs/ai/new2-r8/SOURCE_FRESHNESS_R8.md`) and the rule that came out of it is
 * the rule this endpoint implements:
 *
 *   **Currency is a completeness ratio against a trailing baseline. It is never
 *   a maximum.** A month containing one document has a newest date and no
 *   coverage, and one recent row must never make the corpus read as current.
 *
 * Both numbers are reported. The naive one is carried explicitly, labelled, and
 * next to the honest one — because the naive reading is what anybody computes
 * for themselves in one query, and the only way to stop it being believed is to
 * show it losing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT "AVAILABLE" MEANS PER FIELD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every section reports what it can measure and says so when it cannot:
 *
 *   legalCurrency   measured from `judgments.judgment_date`, index-backed, and
 *                   bounded to the trailing window. This is the load-bearing one.
 *   sources         last INGEST activity per source, from the ledgers that record
 *                   it. Not "newest item at source" — that needs a listing fetch
 *                   per adapter and nothing here performs one. NEW2 flagged it
 *                   NOT_MEASURED and it stays NOT_MEASURED.
 *   courts          per court, the last time ingest touched it, from
 *                   `hc_ingest_ledger`. Court/month HOLDINGS are `/corpus/coverage`;
 *                   duplicating that query here would make this endpoint a
 *                   twenty-second one for no new fact.
 *   ecourts         observation time when the adapter is active, and an explicit
 *                   state when it is not. Zero observations is a state, not a
 *                   date, and `ecourts_observation` is empty today.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THRESHOLDS ARE OURS AND ARE NOT VALIDATED AGAINST A COURT CALENDAR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 0.6 and 0.1 of baseline were chosen by NEW2 and carried here unchanged so the
 * two agree. They are not derived from any court's publication schedule, and the
 * response says so in `caveats` rather than in a comment nobody ships. The
 * confounder that matters: Indian courts take a summer vacation from mid-May to
 * early July, so June is genuinely thin and July genuinely rises. The baseline
 * therefore SKIPS the months under test rather than averaging them in.
 *
 * An ADDITION to the frozen contract — a new path, no existing shape changed —
 * on the same standing `/corpus/coverage` was given.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

/** Below this share of the trailing baseline a month is not fully published to us. */
const PARTIAL_MONTH_FLOOR = 0.6;
/** Below this a month is not meaningfully present at all, whatever its newest date. */
const EMPTY_MONTH_FLOOR = 0.1;
/** Months of history the baseline averages, taken from BELOW the months under test. */
const BASELINE_MONTHS = 6;
/**
 * How many recent months are treated as possibly-incomplete and therefore
 * excluded from the baseline they are measured against. Three, because the
 * vacation confounder spans roughly that long and a baseline that contains the
 * dip it is meant to detect cannot detect it.
 */
const MONTHS_UNDER_TEST = 3;

type MonthRow = { m: string; n: string };

export type MonthState = 'CURRENT' | 'PARTIAL' | 'EFFECTIVELY_ABSENT';

function stateOf(ratio: number): MonthState {
  if (ratio < EMPTY_MONTH_FLOOR) return 'EFFECTIVELY_ABSENT';
  if (ratio < PARTIAL_MONTH_FLOOR) return 'PARTIAL';
  return 'CURRENT';
}

export async function getCorpusFreshness(c: Context, sql: Sql): Promise<Response> {
  const startedAt = Date.now();

  /**
   * One index-backed pass over the trailing window. Bounded deliberately: the
   * unbounded form is a scan of 18.7M rows, and this endpoint answers a question
   * about the RECENT edge of the corpus, which is the only part where currency
   * is even a question.
   */
  const months = await sql<MonthRow[]>`
    SELECT date_trunc('month', judgment_date)::date::text AS m, count(*)::text AS n
      FROM judgments
     WHERE judgment_date >= (date_trunc('month', current_date)
                             - (${BASELINE_MONTHS + MONTHS_UNDER_TEST} || ' months')::interval)
       AND judgment_date <= current_date
     GROUP BY 1
     ORDER BY 1`;

  const series = months.map((r) => ({ month: r.m, documents: Number(r.n) }));
  const underTest = series.slice(-MONTHS_UNDER_TEST);
  const baselineMonths = series.slice(0, Math.max(series.length - MONTHS_UNDER_TEST, 0));
  const baseline =
    baselineMonths.length > 0
      ? Math.round(baselineMonths.reduce((a, b) => a + b.documents, 0) / baselineMonths.length)
      : 0;

  const graded = series.map((s) => {
    const ratio = baseline > 0 ? s.documents / baseline : 0;
    return {
      month: s.month,
      documents: s.documents,
      ratioToBaseline: Number(ratio.toFixed(4)),
      state: baseline > 0 ? stateOf(ratio) : ('EFFECTIVELY_ABSENT' as MonthState),
      underTest: underTest.some((u) => u.month === s.month),
    };
  });

  /**
   * The honest frontier: the newest month that is NOT below the partial floor.
   * `dataAsOf` is the last day of that month, because a month graded CURRENT is
   * a claim about the whole month and nothing finer was measured.
   */
  const frontier = [...graded].reverse().find((g) => g.state === 'CURRENT') ?? null;
  const dataAsOf = frontier
    ? new Date(Date.UTC(Number(frontier.month.slice(0, 4)), Number(frontier.month.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10)
    : null;

  const [naive] = await sql<{ newest: string | null; oldest: string | null }[]>`
    SELECT max(judgment_date)::text AS newest, min(judgment_date)::text AS oldest FROM judgments`;

  const dayMs = 86_400_000;
  const today = Date.now();
  const naiveLagDays = naive?.newest
    ? Math.floor((today - Date.parse(`${naive.newest}T00:00:00Z`)) / dayMs)
    : null;
  const realLagDays = dataAsOf
    ? Math.floor((today - Date.parse(`${dataAsOf}T00:00:00Z`)) / dayMs)
    : null;

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * THE LEDGER IS THE FAILURE SIDE. IT HOLDS NO SUCCESSES AT ALL.
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `hc_ingest_ledger` was added on 17 Aug 2026 for exactly one reason: a
   * document that never loads leaves NO trace in `judgments`, so the corpus can
   * only ever be asked what it has, never what it lost. Every one of its 231,946
   * rows is a failure — `pdf_absent`, `no_text`, `pdf_failed`, `no_title` — and
   * there is no `ok` outcome in it.
   *
   * The first version of this endpoint asked it for `count(*) FILTER (WHERE
   * outcome = 'ok')` and published **`ingestSucceeded: 0`**, which reads as a
   * total ingest failure and is the exact class of confident wrong number this
   * project keeps catching. Corrected before it shipped, and named here so the
   * next reader does not re-derive it.
   *
   * So the two facts are read from the two different places that hold them:
   * failures and last ACTIVITY from the ledger, last SUCCESS from
   * `judgments.created_at`, which is index-backed and exists precisely because
   * something worked.
   */
  const [hc] = await sql<{ failures: string; permanent: string; last_attempt: string | null }[]>`
    SELECT count(*)::text AS failures,
           count(*) FILTER (WHERE permanent)::text AS permanent,
           ${sql.unsafe(isoColumn('max(last_attempted_at)'))} AS last_attempt
      FROM hc_ingest_ledger`;

  const [lastWrite] = await sql<{ at: string | null }[]>`
    SELECT ${sql.unsafe(isoColumn('max(created_at)'))} AS at FROM judgments`;

  const failureKinds = await sql<{ outcome: string; n: string }[]>`
    SELECT outcome, count(*)::text AS n FROM hc_ingest_ledger GROUP BY outcome ORDER BY count(*) DESC`;

  const [enumerated] = await sql<{ source: string; at: string | null; total: string | null }[]>`
    SELECT source, ${sql.unsafe(isoColumn('max(enumerated_at)'))} AS at,
           max(source_total)::text AS total
      FROM corpus_coverage GROUP BY source ORDER BY source LIMIT 1`;

  const [sc] = await sql<{ held: string; newest: string | null }[]>`
    SELECT count(*)::text AS held, max(judgment_date)::text AS newest
      FROM judgments WHERE court = 'Supreme Court of India'`;

  /**
   * Per court, the last time ingest TOUCHED it. Deliberately from the ledger and
   * not from `judgments`: a `GROUP BY court` over the heap is a full scan, and
   * the fact this endpoint is asked for is operational — which courts have gone
   * quiet — not a holdings count. Holdings per court are `/corpus/coverage`.
   */
  const courts = await sql<
    {
      court_code: string;
      last_attempt: string | null;
      attempts: string;
      newest_year: number | null;
    }[]
  >`
    SELECT court_code,
           ${sql.unsafe(isoColumn('max(last_attempted_at)'))} AS last_attempt,
           count(*)::text AS attempts,
           max(year)::int AS newest_year
      FROM hc_ingest_ledger
     GROUP BY court_code
     ORDER BY max(last_attempted_at) DESC NULLS LAST`;

  /**
   * eCourts. The only adapter that can ever close the currency gap, and it has
   * never observed anything. Reported as a STATE with a zero count rather than
   * as a null date, because "no observations" and "observed long ago" are
   * different facts and a null cannot tell them apart.
   */
  const [ec] = await sql<
    { n: string; last_observed: string | null; last_asserted: string | null }[]
  >`
    SELECT count(*)::text AS n,
           ${sql.unsafe(isoColumn('max(observed_at)'))} AS last_observed,
           ${sql.unsafe(isoColumn('max(source_asserted_at)'))} AS last_asserted
      FROM ecourts_observation`;
  const ecourtsObservations = Number(ec?.n ?? 0);

  return ok(c, {
    computedAt: new Date().toISOString(),
    computeMs: Date.now() - startedAt,

    /**
     * **The number nobody should act on**, carried so that anyone who computes
     * it themselves can see it lose. `max(judgment_date)` said 8 days on a
     * corpus that was 56 days behind.
     */
    naive: {
      newestJudgmentDate: naive?.newest ?? null,
      oldestJudgmentDate: naive?.oldest ?? null,
      lagDays: naiveLagDays,
      reading:
        'max(judgment_date). A month holding a single document has a newest date and no coverage — ' +
        'never quote this as currency.',
    },

    /** The honest reading. A completeness ratio, never a maximum. */
    legalCurrency: {
      dataAsOf,
      lagDays: realLagDays,
      honestFrontierMonth: frontier?.month ?? null,
      baselineDocumentsPerMonth: baseline,
      baselineBuiltFrom: baselineMonths.map((m) => m.month),
      monthsUnderTest: underTest.map((m) => m.month),
      months: graded,
      thresholds: {
        partialMonthFloor: PARTIAL_MONTH_FLOOR,
        emptyMonthFloor: EMPTY_MONTH_FLOOR,
        baselineMonths: BASELINE_MONTHS,
      },
    },

    sources: [
      {
        source: 'aws_high_court',
        kind: 'bulk_dump',
        lastIngestActivityAt: hc?.last_attempt ?? null,
        lastSuccessfulIngestAt: lastWrite?.at ?? null,
        /** FAILURES only — see the note above the query. Never read as attempts. */
        failuresRecorded: Number(hc?.failures ?? 0),
        failuresPermanent: Number(hc?.permanent ?? 0),
        failuresByKind: Object.fromEntries(failureKinds.map((f) => [f.outcome, Number(f.n)])),
        sourceEnumeratedAt: enumerated?.at ?? null,
        newestItemAtSource: null,
        newestItemAtSourceState: 'NOT_MEASURED — needs a listing fetch per adapter',
      },
      {
        source: 'aws_supreme_court',
        kind: 'bulk_dump',
        lastIngestAttemptAt: null,
        lastSuccessfulIngestAt: null,
        held: Number(sc?.held ?? 0),
        newestJudgmentDate: sc?.newest ?? null,
        newestItemAtSource: null,
        newestItemAtSourceState: 'NOT_MEASURED — needs a listing fetch per adapter',
      },
    ],

    /**
     * FAILURE ACTIVITY per court, not holdings and not successes. The ledger has
     * no success side; a court absent from this list has recorded no failures,
     * which is a different and much better fact than "no ingest".
     */
    courts: courts.map((r) => ({
      courtCode: r.court_code,
      lastFailureRecordedAt: r.last_attempt,
      failuresRecorded: Number(r.attempts),
      newestPartitionYear: r.newest_year,
    })),

    ecourts: {
      observations: ecourtsObservations,
      state: ecourtsObservations === 0 ? 'NO_OBSERVATIONS' : 'ACTIVE',
      lastObservedAt: ec?.last_observed ?? null,
      lastSourceAssertedAt: ec?.last_asserted ?? null,
      note:
        'observed_at is when WE saw it; source_asserted_at is when the registry says it happened. ' +
        'A listing is never evidence that a hearing occurred — derived state lives in ecourts_transition.',
    },

    caveats: [
      'The 0.6 / 0.1 thresholds were chosen by this project and are NOT validated against any ' +
        "court's publication calendar.",
      'Indian courts take a summer vacation from mid-May to early July, so a thin June and a ' +
        'recovering July are expected and are excluded from the baseline rather than averaged into it.',
      'Newest item AT SOURCE is not measured for any adapter. Everything here is measured on what ' +
        'we hold and on what ingest attempted.',
      'hc_ingest_ledger holds FAILURES ONLY — it has no success rows at all. Court entries are ' +
        'last recorded FAILURE, never last successful ingest; holdings per court are /corpus/coverage.',
    ],
  });
}
