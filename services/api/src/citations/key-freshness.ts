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
  /**
   * How many records that replay actually graded. Load-bearing: a rate of 0 over
   * 0 records is not a passing check, and only the denominator can say so.
   */
  lastRiskReplayRecords: number | null;
  /** The cursor the replay was run against, so "which index did it vouch for" is answerable. */
  lastRiskReplayFrontierAt: string | null;
  /** Every reason the state is not CURRENT. Empty when it is. */
  because: string[];
};


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RISK EVIDENCE IS A SEPARATE QUESTION FROM INDEX LAG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Until 25 Aug 2026 this file READ `resolver_risk_replay`, RETURNED it, and
 * never consulted it. NEW2 ran the gate against the live database and got:
 *
 *     resolver_risk_replay rows       0
 *     freshness state                 CURRENT
 *     lastRiskReplayAt                null
 *     because                         []
 *     mayAssertUnique                 TRUE
 *
 * **An empty risk table and a clean risk table were the same reading.** The gate
 * bounded how far the index had fallen behind and never asked whether anyone had
 * ever checked what the resolver actually answers. That is the same shape as the
 * incident this file was written for: a gate reading CURRENT while telling the
 * truth about the wrong thing.
 *
 * §G4 and §8.3 both require the replay to be nonempty AND current before a
 * UNIQUE is served. Five distinct ways it is not, each named separately so an
 * operator sees which one fired:
 *
 *   1. no replay at all           — nobody has ever adjudicated this resolver
 *   2. a replay that graded zero  — a run that checked nothing vouches for nothing
 *   3. replay older than the index— it vouched for a cursor that has since moved
 *   4. replay of a DIFFERENT index— `frontier_at` disagrees with the live cursor
 *   5. the replay found damage    — direct evidence, not a staleness proxy
 *
 * (2) is the non-vacuity guard, and it is the one worth stating out loud: a
 * check that returns "0 defects" over 0 records is not a passing check.
 */
function riskReplayReasons(
  replay:
    | {
        ran_at: string;
        records: number;
        false_unique: number;
        materially_unsafe: number;
        frontier_at: string | null;
      }
    | undefined,
  frontier: { cursor_at: string; updated_at: string } | undefined,
): string[] {
  if (!replay) {
    return [
      'resolver_risk_replay is empty — no adjudicated risk evidence exists for this resolver at all, ' +
        'and an empty risk table must never read the same as a clean one',
    ];
  }

  const reasons: string[] = [];

  if (replay.records <= 0) {
    reasons.push(
      'the newest resolver_risk_replay graded 0 records — a run that adjudicated nothing ' +
        'vouches for nothing, however clean its counters look',
    );
  }

  if (replay.false_unique > 0 || replay.materially_unsafe > 0) {
    reasons.push(
      `the newest risk replay found ${replay.false_unique} false UNIQUE and ` +
        `${replay.materially_unsafe} materially unsafe of ${replay.records} — ` +
        'direct evidence of unsafety, not a staleness proxy',
    );
  }

  if (frontier) {
    if (Date.parse(replay.ran_at) < Date.parse(frontier.updated_at)) {
      reasons.push(
        `the risk replay ran ${replay.ran_at} but the key builder has published since ` +
          `(${frontier.updated_at}) — the replay predates the index it is vouching for`,
      );
    }
    if (
      replay.frontier_at === null ||
      Date.parse(replay.frontier_at) !== Date.parse(frontier.cursor_at)
    ) {
      reasons.push(
        `the risk replay was run against cursor ${replay.frontier_at ?? 'unrecorded'} ` +
          `and the live cursor is ${frontier.cursor_at} — it vouches for a different index`,
      );
    }
  }

  return reasons;
}

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
    {
      ran_at: string;
      records: number;
      false_unique: number;
      materially_unsafe: number;
      frontier_at: string | null;
      truth_set: string | null;
    }[]
  >`SELECT ran_at::text, records, false_unique, materially_unsafe,
           frontier_at::text, truth_set
      FROM resolver_risk_replay ORDER BY ran_at DESC LIMIT 1`;

  const lastRiskReplayAt = replay?.ran_at ?? null;
  const lastRiskReplayFalseUniqueRate =
    replay && replay.records > 0 ? replay.false_unique / replay.records : null;
  const lastRiskReplayRecords = replay?.records ?? null;
  const lastRiskReplayFrontierAt = replay?.frontier_at ?? null;

  if (!frontier) {
    return {
      state: 'UNKNOWN',
      frontierAt: null,
      ingestAt: null,
      lagRows: 0,
      lagHours: null,
      lastRiskReplayAt,
      lastRiskReplayFalseUniqueRate,
      lastRiskReplayRecords,
      lastRiskReplayFrontierAt,
      because: [
        'citation_key_frontier is empty — the key builder has never published a cursor, ' +
          'so how much of the corpus the index has seen is not known',
        // UNKNOWN already fails closed. The risk reasons ride along so an
        // operator fixing the frontier does not then discover a second gate.
        ...riskReplayReasons(replay, undefined),
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

  // Index lag and risk evidence are different questions and either one alone
  // leaves the gate open. A perfectly current index still says nothing about
  // what the resolver ANSWERS from it.
  because.push(...riskReplayReasons(replay, frontier));

  return {
    state: because.length === 0 ? 'CURRENT' : 'STALE',
    frontierAt: frontier.cursor_at,
    ingestAt: lag?.ingest_at ?? null,
    lagRows,
    lagHours,
    lastRiskReplayAt,
    lastRiskReplayFalseUniqueRate,
    lastRiskReplayRecords,
    lastRiskReplayFrontierAt,
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EXACT FRONTIER CHECK — because a global threshold cannot see ONE collision
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R7 §8 predicted this in one sentence: *"A small newly ingested collision may
 * not remain confidently UNIQUE because global backlog is below a broad
 * threshold."*
 *
 * It is not a prediction. Reproduced against the live database on 25 Aug 2026,
 * inside a rolled-back transaction:
 *
 *     freshness BEFORE                CURRENT · lagRows 0 · lagHours 19.1
 *     resolve "1950 INSC 1"           UNIQUE · 1 candidate
 *     insert a colliding judgment     same neutral citation, no key row yet
 *     freshness AFTER                 CURRENT · lagRows 1 · because []
 *     resolve "1950 INSC 1"           **UNIQUE · 1 candidate**
 *
 * Two judgments claim that citation and the resolver says exactly one. The
 * threshold gate did nothing, and it was right not to by its own terms: 1 is a
 * very long way below `MAX_LAG_ROWS = 25,000`.
 *
 * That is the structural problem with a global bound. `MAX_LAG_ROWS` answers
 * *"how much damage might there be across the whole corpus"*, which is the right
 * question for an operator and the wrong one for a single answer handed to an
 * advocate. The advocate's citation does not care that the other 24,999 unwalked
 * rows are irrelevant to it.
 *
 * So this asks the exact question instead: **is there anything in the unwalked
 * window that claims THIS key?** The unwalked window is bounded by the frontier
 * cursor and is normally empty, so the check is cheap precisely when it is
 * uninformative and does real work exactly when it matters.
 *
 * Canonicalisation happens in JS with `keyOf` — the caller passes the same
 * function the resolver and the key builder use. Reimplementing it in SQL would
 * be a second definition of citation identity, and two definitions of identity
 * is how a resolver and its index come to disagree about the same citation.
 *
 * Returns the set of keys that MUST NOT be answered UNIQUE.
 */
export async function collidingKeysInUnwalkedWindow(
  sql: Sql,
  frontier: KeyFreshness,
  keys: readonly string[],
  keyOf: (citation: string) => string | null,
): Promise<Set<string>> {
  const unsafe = new Set<string>();
  if (keys.length === 0) return unsafe;
  // Nothing unwalked, nothing to hide. The overwhelmingly common case.
  if (!frontier.frontierAt || frontier.lagRows === 0) return unsafe;

  /**
   * A ceiling on how much of the unwalked window we will read.
   *
   * Above it the honest answer is that we cannot check exactly, and the
   * threshold gate — which will already have said STALE at 25,000 — is the
   * backstop. Below it, this is exact. The bound exists so that a builder which
   * has been down for a week cannot turn every citation lookup into a scan of
   * everything ingested since.
   */
  const WINDOW_CAP = 50_000;
  if (frontier.lagRows > WINDOW_CAP) return unsafe;

  const rows = await sql<{ neutral_citation: string | null; reporter_citations: string[] }[]>`
    SELECT neutral_citation, reporter_citations
      FROM judgments
     WHERE created_at > ${frontier.frontierAt}
     LIMIT ${WINDOW_CAP}`;

  const wanted = new Set(keys);
  for (const row of rows) {
    const citations = [row.neutral_citation, ...(row.reporter_citations ?? [])];
    for (const citation of citations) {
      if (!citation) continue;
      const key = keyOf(citation);
      if (key && wanted.has(key)) unsafe.add(key);
    }
  }
  return unsafe;
}
