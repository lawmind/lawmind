/**
 * LCC R16 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * R15-F1 measured against a holdout FROZEN in `lcc_r15_falseunique` (226 keys,
 * derived once at T0 2026-08-18). This re-derives the same question from the
 * live index today, because the frozen table cannot grow and thirteen more days
 * of NEW2 ingestion have landed since. The T0 is unchanged so the two numbers
 * are the same measurement taken twice, not two different measurements.
 *
 *   pnpm exec tsx scripts/lcc-r16-population.mts
 */
import postgres from 'postgres';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cohortBlocksUnique, cohortVerdict, declaredCohort } from '../services/api/src/citations/cohort.ts';

const T0 = '2026-08-18';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

/**
 * Keys single-claim at T0 that now name more than one distinct CASE.
 *
 * `n_title > 1` is not decoration and dropping it is not a wider measurement.
 * It is the definition `scripts/lcc-cohort-measure.mts` froze into
 * `lcc_r15_falseunique` and the one NEW2's R14 falsifier used: a false unique is
 * a key that now covers more than one distinct normalised `case_title`. Counting
 * distinct `judgment_id` instead counts a case INGESTED TWICE as a collision,
 * which is an ingest duplicate and not a wrong pin — the same authority reached
 * by either row. Measured 31 August 2026, that single substitution moves the
 * population from 226 to 33,344: the other 33,118 keys gained a second row
 * carrying the SAME case title. That is the whole difference between a resolver
 * question and a deduplication one, and the 33,118 are reported rather than
 * discarded because they are a real ingest observation for NEW2.
 */
const live = await sql<{ citation_key: string; n_title: number; n_court: number }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys
     WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), gone AS (
    SELECT k.citation_key FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) >= 2
  )
  SELECT g.citation_key,
         count(DISTINCT upper(regexp_replace(coalesce(jj.case_title,''),'[^A-Za-z0-9]','','g')))::int AS n_title,
         count(DISTINCT jj.court)::int AS n_court
    FROM gone g
    JOIN judgment_citation_keys kk ON kk.citation_key = g.citation_key
    JOIN judgments jj ON jj.id = kk.judgment_id
   GROUP BY g.citation_key
  HAVING count(DISTINCT upper(regexp_replace(coalesce(jj.case_title,''),'[^A-Za-z0-9]','','g'))) > 1`;

/** The same keys WITHOUT the `n_title > 1` filter — the deduplication population. */
const [dupRow] = await sql<{ n: number }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys
     WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  )
  SELECT count(*)::int AS n FROM (
    SELECT k.citation_key FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) >= 2) x`;

const frozen = await sql<{ citation_key: string }[]>`SELECT citation_key FROM lcc_r15_falseunique`;
const frozenSet = new Set(frozen.map((r) => r.citation_key));
const liveSet = new Set(live.map((r) => r.citation_key));

/** The bearer we held at T0 — the only document the gate may read. */
const shape = await sql<{
  citation_key: string; head: string | null; same_court: boolean; same_date: boolean;
}[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys
     WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), gone AS (
    SELECT k.citation_key FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) >= 2
  ), multi AS (
    SELECT g.citation_key
      FROM gone g
      JOIN judgment_citation_keys kk ON kk.citation_key = g.citation_key
      JOIN judgments jj ON jj.id = kk.judgment_id
     GROUP BY g.citation_key
    HAVING count(DISTINCT upper(regexp_replace(coalesce(jj.case_title,''),'[^A-Za-z0-9]','','g'))) > 1
  ), sh AS (
    SELECT m.citation_key,
           count(DISTINCT j.court) = 1 AS same_court,
           count(DISTINCT j.judgment_date) = 1 AS same_date
      FROM multi m
      JOIN judgment_citation_keys k ON k.citation_key = m.citation_key
      JOIN judgments j ON j.id = k.judgment_id
     GROUP BY m.citation_key
  )
  SELECT DISTINCT ON (sh.citation_key) sh.citation_key, sh.same_court, sh.same_date,
         left(j.full_text, 2400) AS head
    FROM sh
    JOIN judgment_citation_keys k ON k.citation_key = sh.citation_key AND k.created_at < ${T0}::timestamptz
    JOIN judgments j ON j.id = k.judgment_id
   ORDER BY sh.citation_key, k.created_at`;

const reachable = shape.filter((r) => r.same_court && r.same_date);
const closed = reachable.filter((r) => cohortBlocksUnique(declaredCohort(r.head), 1));
const unreachable = reachable.filter((r) => !cohortBlocksUnique(declaredCohort(r.head), 1));

/** Why each miss missed — parser saw nothing / no conjunction / declared <= held. */
const why = { NO_CAUSE_TITLE: 0, NO_CONNECTOR: 0, DECLARED_NOT_GREATER: 0 } as Record<string, number>;
for (const r of unreachable) {
  const d = declaredCohort(r.head);
  if (!d.causeTitleAvailable) why['NO_CAUSE_TITLE']!++;
  else if (d.connector === null) why['NO_CONNECTOR']!++;
  else why['DECLARED_NOT_GREATER']!++;
}

const out = {
  measuredAt: new Date().toISOString(),
  t0: T0,
  note: 'Same question as lcc-r15f1/remeasure.json, re-derived from the live index instead of the frozen lcc_r15_falseunique table.',
  CONNECTED_FALSE_UNIQUES_TOTAL: { frozenAtR15F1: frozenSet.size, liveToday: liveSet.size },
  KEYS_THAT_GAINED_A_ROW: dupRow?.n ?? -1,
  KEYS_THAT_GAINED_ONLY_A_DUPLICATE_TITLE: (dupRow?.n ?? 0) - liveSet.size,
  frozenNotLive: [...frozenSet].filter((k) => !liveSet.has(k)).length,
  liveNotFrozen: [...liveSet].filter((k) => !frozenSet.has(k)).length,
  bearerReadable: shape.length,
  REACHABLE_BY_CURRENT_GATE: reachable.length,
  outOfScopeCrossCourtOrCrossDate: shape.length - reachable.length,
  CLOSED_BY_CURRENT_GATE: closed.length,
  REMAINING_UNREACHABLE: unreachable.length,
  unreachableByReason: why,
  unreachableKeys: unreachable.map((r) => r.citation_key),
};
console.log(JSON.stringify({ ...out, unreachableKeys: `${unreachable.length} keys` }, null, 2));
mkdirSync('docs/ai/lcc-r16', { recursive: true });
writeFileSync('docs/ai/lcc-r16/population.json', JSON.stringify(out, null, 2) + '\n');
console.log('wrote docs/ai/lcc-r16/population.json');
await sql.end();
