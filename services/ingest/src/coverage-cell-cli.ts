/**
 * `pnpm --filter @lawmind/ingest coverage:cells [--apply] [--frontier <path>]`
 *
 * Fills `coverage_cell` (migration 0059) — the precomputed court × year table the
 * retrieval path reads instead of recomputing coverage per request.
 *
 * **DRY BY DEFAULT.** `--apply` writes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT READS ARTEFACTS FOR ONE AXIS AND THE DATABASE FOR THE OTHER, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ACQUISITION comes from NEW2's `new2-frontier.json`: source rows per cell from
 * `HC_METADATA_SURVEY`, held per cell from an exact `count(*)` NEW2 already ran.
 * Recomputing held here would be a second sequential scan of 18.6M judgments to
 * learn what the lane that owns ingestion measured an hour ago. It also carries
 * `heldFreshness`, which this reproduces rather than flattening: when a worker
 * wrote after the held snapshot, every `acquired` is a LOWER bound and the cell
 * can read as a gap that has since been filled.
 *
 * REACHABILITY is measured here because no artefact carries it. It is the union
 * of two populations and both are small: `judgment_chunks` (40,161 distinct
 * judgments, the frozen chunk architecture) and `new1_doc_vector_stage` (NEW1's
 * Tier-A document vectors). Around 150k primary-key lookups against `judgments`,
 * not a scan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COURT KEY IS A CODE ON ONE SIDE AND A NAME ON THE OTHER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.court` holds a NAME; the frontier is keyed by the survey CODE.
 * `HC_METADATA_SURVEY.json`'s `perCourt` is the join, exactly as
 * `new2-held-refresh.mjs` uses it. The Supreme Court has judgments and no survey
 * code — it is not a High Court and the survey does not cover it — so its cells
 * carry `source_state = 'UNKNOWN'` rather than being dropped or, worse, counted
 * as a gap against a denominator that does not exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO THRESHOLD IS APPLIED HERE EITHER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `PARTIAL` is "held some, not all" and nothing more. Where partial becomes
 * *"too little to be an answer"* is a product judgement (`PRODUCT_DECISIONS.md`),
 * and `held_share` is written so that policy can be applied later without
 * recomputing anything.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from './db-host.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const APPLY = process.argv.includes('--apply');
const FRONTIER = arg('frontier', join(ROOT, 'docs', 'ops', 'migration', 'new2-frontier.json'));
const SURVEY = arg('survey', join(ROOT, 'docs', 'HC_METADATA_SURVEY.json'));

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
  process.exit(2);
}

type FrontierCell = {
  court: string;
  year: number;
  sourceRows: number;
  acquired: number;
  state?: string;
};
type Frontier = {
  takenAt: string;
  derivedFrom?: { source?: string; held?: string };
  heldFreshness?: { heldTakenAt?: string; heldIsStale?: boolean };
  cells: FrontierCell[];
};

const frontier = JSON.parse(readFileSync(FRONTIER, 'utf8')) as Frontier;
const survey = JSON.parse(readFileSync(SURVEY, 'utf8')) as {
  perCourt?: { name: string; code: string }[];
};
const nameByCode = new Map((survey.perCourt ?? []).map((c) => [c.code, c.name]));

/**
 * `SOURCE_HAS_ZERO` requires a POSITIVE measurement of zero — a cell the survey
 * counted and found empty. A cell the survey never counted is `UNKNOWN`, and the
 * difference is the whole reason the state exists: inferring "the source has
 * nothing" from "we found nothing" is the failure it reports.
 */
function sourceState(sourceRows: number | null, held: number): string {
  if (sourceRows === null) return 'UNKNOWN';
  if (sourceRows === 0) return 'SOURCE_HAS_ZERO';
  if (held === 0) return 'KNOWN_GAP';
  return held >= sourceRows ? 'COVERED' : 'PARTIAL';
}

const sql = await openDb(dbUrl, 2);

try {
  // Reachability: every judgment carrying ANY vector, by court and year. The two
  // populations are unioned because either one makes a document reachable by the
  // dense arm, and a document can be in both.
  console.log('counting reachable documents (judgment_chunks ∪ new1_doc_vector_stage) …');
  const embeddedRows = await sql<{ court: string | null; year: number | null; n: number }[]>`
    WITH embedded AS (
      SELECT DISTINCT judgment_id FROM judgment_chunks
      UNION
      SELECT DISTINCT judgment_id FROM new1_doc_vector_stage
    )
    SELECT j.court, EXTRACT(YEAR FROM j.judgment_date)::int AS year, count(*)::int AS n
      FROM embedded e
      JOIN judgments j ON j.id = e.judgment_id
     GROUP BY 1, 2`;
  const embeddedBy = new Map(embeddedRows.map((r) => [`${r.court ?? ''}|${r.year ?? 0}`, r.n]));
  const embeddedTotal = embeddedRows.reduce((a, r) => a + r.n, 0);
  console.log(
    `  ${embeddedTotal.toLocaleString()} reachable documents over ${embeddedRows.length} court-year cells`,
  );

  // Tier-A eligibility per cell, from the census the embed lane already ran.
  const eligibleRows = await sql<
    { court: string | null; judgment_year: number | null; n: string }[]
  >`
    SELECT court, judgment_year, sum(rows)::text AS n
      FROM embedding_census_cell
     WHERE bucket LIKE 'tier_a%'
     GROUP BY 1, 2`;
  const eligibleBy = new Map(
    eligibleRows.map((r) => [`${r.court ?? ''}|${r.judgment_year ?? 0}`, Number(r.n)]),
  );

  const heldMeasuredAt = frontier.heldFreshness?.heldTakenAt ?? frontier.takenAt;
  const provenance = frontier.derivedFrom?.source ?? 'new2-frontier.json';

  type Upsert = {
    court: string;
    year: number;
    sourceRows: number | null;
    held: number;
    heldShare: number | null;
    state: string;
    embedded: number;
    eligible: number | null;
    reachability: string;
  };
  const upserts: Upsert[] = [];
  const unjoined = new Set<string>();

  for (const cell of frontier.cells) {
    const court = nameByCode.get(cell.court);
    if (!court) {
      unjoined.add(cell.court);
      continue;
    }
    const key = `${court}|${cell.year}`;
    const embedded = embeddedBy.get(key) ?? 0;
    const held = cell.acquired ?? 0;
    const sourceRows = typeof cell.sourceRows === 'number' ? cell.sourceRows : null;
    upserts.push({
      court,
      year: cell.year,
      sourceRows,
      held,
      heldShare: sourceRows && sourceRows > 0 ? Number((held / sourceRows).toFixed(6)) : null,
      state: sourceState(sourceRows, held),
      embedded,
      eligible: eligibleBy.get(key) ?? null,
      reachability: embedded > 0 ? 'EMBEDDED' : 'LEXICAL_ONLY',
    });
  }

  /**
   * Cells the survey does not cover — the Supreme Court, which is not a High
   * Court — still get a row, because a cell that is absent from this table reads
   * as "nobody has measured it" through the same UNKNOWN default and the caller
   * cannot tell the two apart. Written explicitly with a null denominator.
   */
  for (const [key, embedded] of embeddedBy) {
    const [court, yearText] = key.split('|');
    if (!court || !yearText) continue;
    const year = Number(yearText);
    if (!year) continue;
    if (upserts.some((u) => u.court === court && u.year === year)) continue;
    upserts.push({
      court,
      year,
      sourceRows: null,
      held: 0,
      heldShare: null,
      state: 'UNKNOWN',
      embedded,
      eligible: eligibleBy.get(key) ?? null,
      reachability: embedded > 0 ? 'EMBEDDED' : 'LEXICAL_ONLY',
    });
  }

  const byState = new Map<string, number>();
  for (const u of upserts) byState.set(u.state, (byState.get(u.state) ?? 0) + 1);
  const reachable = upserts.filter((u) => u.reachability === 'EMBEDDED').length;

  console.log(`\ncells ${upserts.length}`);
  for (const [state, n] of [...byState].sort((a, b) => b[1] - a[1]))
    console.log(`  ${state.padEnd(16)} ${n}`);
  console.log(
    `  reachability     EMBEDDED ${reachable} · LEXICAL_ONLY ${upserts.length - reachable}`,
  );
  if (unjoined.size > 0)
    console.log(`  survey codes with no court name: ${[...unjoined].join(', ')}`);
  if (frontier.heldFreshness?.heldIsStale) {
    console.log(
      '  held is STALE — a worker wrote after the snapshot, so every held count is a LOWER bound',
    );
  }

  if (!APPLY) {
    console.log('\nNothing written — re-run with --apply.');
  } else {
    for (const u of upserts) {
      await sql`
        INSERT INTO coverage_cell (court, year, source_rows, source_provenance, source_measured_at,
                                   held, held_measured_at, held_share, source_state,
                                   embedded, eligible, embedded_measured_at, reachability, updated_at)
        VALUES (${u.court}, ${u.year}, ${u.sourceRows}, ${provenance}, ${frontier.takenAt}::timestamptz,
                ${u.held}, ${heldMeasuredAt}::timestamptz, ${u.heldShare}, ${u.state},
                ${u.embedded}, ${u.eligible}, now(), ${u.reachability}, now())
        ON CONFLICT (court, year) DO UPDATE SET
          source_rows = EXCLUDED.source_rows,
          source_provenance = EXCLUDED.source_provenance,
          source_measured_at = EXCLUDED.source_measured_at,
          held = EXCLUDED.held,
          held_measured_at = EXCLUDED.held_measured_at,
          held_share = EXCLUDED.held_share,
          source_state = EXCLUDED.source_state,
          embedded = EXCLUDED.embedded,
          eligible = EXCLUDED.eligible,
          embedded_measured_at = EXCLUDED.embedded_measured_at,
          reachability = EXCLUDED.reachability,
          updated_at = now()`;
    }
    console.log(`\nWrote ${upserts.length} cells.`);
  }
} finally {
  await sql.end();
}
