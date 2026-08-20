/**
 * The coverage contract — what we hold, and what the semantic arm can reach,
 * for exactly the court × year cells a query's filters select.
 *
 * `docs/ai/NEW1_COVERAGE_STATE_CONTRACT.md` (bus 0724) specifies the shape.
 * Migration `0059` holds the data. This module is the read side.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVISIONAL AND ADDITIVE — NOT YET ON THE WIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/API_CONTRACTS.md` is frozen for the sprint and the client half of this
 * is RCC's, so nothing here is attached to a response yet. It is built, tested
 * and callable so that wiring it is one line when the contract opens, rather
 * than a feature that starts at zero then.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO AXES, NEVER COLLAPSED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `state` answers *do we hold it*. `reachability` answers *can the arm serving
 * this query reach what we hold* — 150,188 of 18.6M documents carry any vector,
 * so a cell can be COVERED and LEXICAL_ONLY at once, and those two facts produce
 * the same empty screen for opposite reasons. Folding them into one enum would
 * report an acquisition gap where there is a retrieval one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WORST CELL WINS, AND UNKNOWN IS NOT GOOD NEWS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A search spanning a covered year and a blackout year is not covered, so the
 * summary `state` is the worst state among the selected cells. `UNKNOWN` is the
 * default for a cell nobody has measured and it must never render as `COVERED`:
 * the state that admits ignorance has to be the one you get for free.
 *
 * A cell MISSING from `coverage_cell` is `UNKNOWN` for the same reason — absence
 * of a row is absence of a measurement.
 */
import type { Sql } from 'postgres';

export const COVERAGE_STATES = [
  'COVERED',
  'PARTIAL',
  'KNOWN_GAP',
  'SOURCE_HAS_ZERO',
  'UNKNOWN',
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const REACHABILITY_STATES = ['EMBEDDED', 'LEXICAL_ONLY', 'UNKNOWN'] as const;
export type Reachability = (typeof REACHABILITY_STATES)[number];

/**
 * Worst-first. `SOURCE_HAS_ZERO` sits BELOW `KNOWN_GAP` deliberately: it is the
 * only state that is not a failure of ours — the source was measured and holds
 * nothing — so it must not outrank a gap that IS ours.
 */
const STATE_SEVERITY: Record<CoverageState, number> = {
  KNOWN_GAP: 4,
  PARTIAL: 3,
  UNKNOWN: 2,
  SOURCE_HAS_ZERO: 1,
  COVERED: 0,
};

const REACHABILITY_SEVERITY: Record<Reachability, number> = {
  LEXICAL_ONLY: 2,
  UNKNOWN: 1,
  EMBEDDED: 0,
};

export type CoverageCell = {
  court: string;
  year: number;
  state: CoverageState;
  held: number | null;
  sourceEstimate: number | null;
  /** Provenance of `sourceEstimate` — it counts parquet ROWS, not documents, and over-reports gaps. */
  sourceProvenance: string | null;
  heldShare: number | null;
  reachability: Reachability;
  embedded: number | null;
};

export type CoverageReport = {
  state: CoverageState;
  reachability: Reachability;
  cells: CoverageCell[];
  /**
   * The OLDEST measurement in the selection, never the newest. A selection is
   * only as current as its stalest cell, and reporting the newest would let one
   * freshly-counted cell vouch for a year nobody has recounted since. Null when
   * nothing was measured — which is not the same as "measured just now".
   */
  measuredAt: string | null;
};

export type CoverageQuery = {
  /** Court NAMES as stored in `judgments.court`. Empty or absent means every court. */
  courts?: readonly string[] | undefined;
  yearFrom?: number | undefined;
  yearTo?: number | undefined;
};

/** The whole-corpus answer when nothing has been measured for the selection. */
export const UNKNOWN_COVERAGE: CoverageReport = {
  state: 'UNKNOWN',
  reachability: 'UNKNOWN',
  cells: [],
  measuredAt: null,
};

const worst = <T extends string>(
  values: readonly T[],
  severity: Record<T, number>,
  fallback: T,
): T => values.reduce((acc, v) => (severity[v] > severity[acc] ? v : acc), fallback);

/**
 * Summarise a set of cells. Exported separately from the query so the rule —
 * worst cell wins, no cells means UNKNOWN — is testable without a database.
 *
 * `measuredAt` is the caller's: a cell carries no timestamp of its own on the
 * wire, and inventing one here would be a measurement date computed from data
 * that does not contain it.
 */
export function summarise(
  cells: readonly CoverageCell[],
  measuredAt: string | null = null,
): CoverageReport {
  if (cells.length === 0) return UNKNOWN_COVERAGE;
  return {
    state: worst(
      cells.map((c) => c.state),
      STATE_SEVERITY,
      'COVERED',
    ),
    reachability: worst(
      cells.map((c) => c.reachability),
      REACHABILITY_SEVERITY,
      'EMBEDDED',
    ),
    cells: [...cells],
    measuredAt,
  };
}

type Row = {
  court: string;
  year: number;
  source_state: CoverageState;
  held: string | null;
  source_rows: string | null;
  source_provenance: string | null;
  held_share: string | null;
  reachability: Reachability;
  embedded: string | null;
  updated_at: Date;
};

/**
 * One indexed read. NEVER a count over `judgments` — the grouped count this
 * replaces took 86.5 seconds on the live box, and the retrieval path is already
 * the majority of the slow statements on it.
 */
export async function coverageFor(sql: Sql, query: CoverageQuery): Promise<CoverageReport> {
  const courts = query.courts?.filter((c) => c.trim() !== '') ?? [];
  const rows = await sql<Row[]>`
    SELECT court, year, source_state, held, source_rows, source_provenance,
           held_share, reachability, embedded, updated_at
      FROM coverage_cell
     WHERE TRUE
       ${courts.length > 0 ? sql`AND court = ANY(${courts as string[]})` : sql``}
       ${query.yearFrom !== undefined ? sql`AND year >= ${query.yearFrom}` : sql``}
       ${query.yearTo !== undefined ? sql`AND year <= ${query.yearTo}` : sql``}
     ORDER BY court, year`;

  const cells: CoverageCell[] = rows.map((r) => ({
    court: r.court,
    year: r.year,
    state: r.source_state,
    held: r.held === null ? null : Number(r.held),
    sourceEstimate: r.source_rows === null ? null : Number(r.source_rows),
    sourceProvenance: r.source_provenance,
    heldShare: r.held_share === null ? null : Number(r.held_share),
    reachability: r.reachability,
    embedded: r.embedded === null ? null : Number(r.embedded),
  }));

  const measuredAt =
    rows.length === 0
      ? null
      : rows
          .reduce((acc, r) => (r.updated_at < acc ? r.updated_at : acc), rows[0]!.updated_at)
          .toISOString();

  return summarise(cells, measuredAt);
}
