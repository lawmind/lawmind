/**
 * IS THE RESOLVER'S INDEX CURRENT ENOUGH TO BE BELIEVED?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INCIDENT THIS EXISTS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 graded `resolveBatch` against an adjudicated truth set and found a
 * false-UNIQUE rate of 15.63% — 33,013 shared-neutral groups collapsing to one
 * confident answer, 99.5% of them Allahabad. The resolution rules were not
 * wrong. `judgment_citation_keys` was **309,130 neutral citations behind its own
 * `(created_at, id)` cursor**, and had been since 17 August. A judgment whose
 * twin has not been indexed yet looks, to a `= ANY(keys)` lookup, exactly like a
 * judgment with no twin at all.
 *
 * Re-running the builder repaired 33,001 of the 33,013. That is the fix for one
 * day. It is not a fix, because nothing stops the gap reopening the next time
 * ingest moves and the builder does not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY UNIQUE IS THE ONLY STATE THAT IS UNSAFE WHEN STALE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Staleness can only ever HIDE candidates; it cannot invent them. So of the
 * resolver's states:
 *
 *   AMBIGUOUS        already says "more than one, choose". A hidden candidate
 *                    would make it more ambiguous, not less true.
 *   TARGET_NOT_HELD  already says "we do not hold this". Honest either way.
 *   REFUSED          decided before any lookup happened.
 *   UNIQUE           **the only claim staleness can falsify.** "Exactly one
 *                    judgment in this corpus claims this citation" is a claim
 *                    about the whole corpus, made from an index that has not
 *                    read all of it.
 *
 * So the gate is narrow by construction: when the index is STALE, a UNIQUE is
 * downgraded and everything else passes through untouched. Blanket-failing every
 * resolution would take a working AMBIGUOUS answer away for no safety gain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE NUMBERS COME FROM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citation_key_frontier` holds the builder's own keyset cursor, written by
 * `citation-keys-cli.ts` at every checkpoint. NOT a subtraction of keyed
 * judgments from all judgments: a judgment that cites nothing never produces a
 * key row, so that derivation drifts with the data instead of with the walk and
 * reads healthy while the walk is stopped. The cursor is the frontier.
 */
import type { Sql } from 'postgres';

/**
 * How far behind the index may fall before a UNIQUE stops being assertable.
 *
 * TWO bounds, because they fail differently and either one alone has a hole.
 *
 * `MAX_LAG_ROWS` is the safety number: NEW2's incident was 309,130 unindexed
 * citations producing 33,013 false uniques, roughly one bad answer per nine
 * unwalked rows. 25,000 keeps the expected damage in the low thousands at worst
 * and is far above any normal ingest burst.
 *
 * `MAX_LAG_HOURS` catches the case rows cannot: a builder that DIED. With ingest
 * idle the row count stops moving, so a lag of zero rows is equally consistent
 * with "caught up" and "nothing has run for a week and nothing has arrived
 * either". The clock notices; the counter cannot.
 */
export const MAX_LAG_ROWS = 25_000;
export const MAX_LAG_HOURS = 72;

export type KeyFreshnessState =
  /** The index has walked everything ingest has produced, recently enough. */
  | 'CURRENT'
  /** Too far behind on rows, or the walk itself has gone quiet. UNIQUE is not assertable. */
  | 'STALE'
  /**
   * No frontier row at all. NOT the same as stale and NOT the same as fresh —
   * the builder has never published, so nothing is known. Treated as STALE for
   * safety and reported separately so "we cannot see" is never read as "it is
   * bad" or, worse, as "it is fine".
   */
  | 'UNKNOWN';

export type KeyFreshness = {
  state: KeyFreshnessState;
  /** The builder's own cursor. Null when it has never published. */
  frontierAt: string | null;
  /** Newest row in the corpus the builder is walking. */
  ingestAt: string | null;
  /** Judgments created after the cursor — rows the index has provably not seen. */
  lagRows: number;
  /** Hours since the builder last published anything at all. */
  lagHours: number | null;
  /** When the adjudicated risk set was last replayed, and what it said. */
  lastRiskReplayAt: string | null;
  lastRiskReplayFalseUniqueRate: number | null;
  /** Every reason the state is not CURRENT. Empty when it is. */
  because: string[];
};

/**
 * Read it. One bounded query per component, no scans.
 *
 * `lagRows` is counted with a `created_at >` predicate against the cursor, which
 * rides the same index the builder walks. It is exact rather than estimated,
 * because an estimate that is wrong in the optimistic direction is the whole
 * failure mode being guarded against.
 */
export async function readKeyFreshness(sql: Sql): Promise<KeyFreshness> {
  const [frontier] = await sql<
    { cursor_at: string; scanned: string; updated_at: string; run_id: string | null }[]
  >`SELECT cursor_at::text, scanned::text, updated_at::text, run_id FROM citation_key_frontier`;

  const [replay] = await sql<
    { ran_at: string; records: number; false_unique: number }[]
  >`SELECT ran_at::text, records, false_unique
      FROM resolver_risk_replay ORDER BY ran_at DESC LIMIT 1`;

  const lastRiskReplayAt = replay?.ran_at ?? null;
  const lastRiskReplayFalseUniqueRate =
    replay && replay.records > 0 ? replay.false_unique / replay.records : null;

  if (!frontier) {
    return {
      state: 'UNKNOWN',
      frontierAt: null,
      ingestAt: null,
      lagRows: 0,
      lagHours: null,
      lastRiskReplayAt,
      lastRiskReplayFalseUniqueRate,
      because: [
        'citation_key_frontier is empty — the key builder has never published a cursor, ' +
          'so how much of the corpus the index has seen is not known',
      ],
    };
  }

  const [lag] = await sql<{ n: string; ingest_at: string | null }[]>`
    SELECT count(*)::text AS n,
           (SELECT max(created_at)::text FROM judgments) AS ingest_at
      FROM judgments
     WHERE created_at > ${frontier.cursor_at}::timestamptz`;

  const lagRows = Number(lag?.n ?? 0);
  const lagHours = (Date.now() - Date.parse(frontier.updated_at)) / 3_600_000;

  const because: string[] = [];
  if (lagRows > MAX_LAG_ROWS) {
    because.push(
      `${lagRows.toLocaleString()} judgments are newer than the key cursor (bound ${MAX_LAG_ROWS.toLocaleString()})`,
    );
  }
  if (lagHours > MAX_LAG_HOURS) {
    because.push(
      `the key builder last published ${Math.round(lagHours)}h ago (bound ${MAX_LAG_HOURS}h) — ` +
        `zero lag rows and a silent builder are the same reading, and only the clock separates them`,
    );
  }

  return {
    state: because.length === 0 ? 'CURRENT' : 'STALE',
    frontierAt: frontier.cursor_at,
    ingestAt: lag?.ingest_at ?? null,
    lagRows,
    lagHours,
    lastRiskReplayAt,
    lastRiskReplayFalseUniqueRate,
    because,
  };
}

/**
 * May a UNIQUE be asserted against an index in this state?
 *
 * `UNKNOWN` returns false with `CURRENT` the only true value, deliberately: a
 * default that opens the gate on an unrecognised state is how a safety check
 * stops being one.
 */
export function mayAssertUnique(state: KeyFreshnessState): boolean {
  return state === 'CURRENT';
}
