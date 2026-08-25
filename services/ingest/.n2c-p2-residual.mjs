/**
 * NEW2 §8/NEW2-2 — WHY 303 KEYABLE NEUTRAL CITATIONS SIT BELOW A FRONTIER THAT
 * HAS ALREADY WALKED PAST THEM.
 *
 * LCC measured the shortfall at 163 and called it "rows inserted while it
 * walked". If that were the whole story those rows would sit ABOVE the frontier
 * and the next pass would take them. They do not: `above_frontier_unwalked` is
 * 0 and the shortfall is 734.
 *
 * HYPOTHESIS (falsifiable): `created_at` is a BATCH constant, not a row insert
 * time -- thousands of judgments share one value. A `(created_at, id)` keyset
 * cursor inside such a batch degenerates to an ID watermark, and ids are random
 * uuids, so a row inserted into an already-walked batch lands BELOW the cursor
 * and is never walked. That would make the residual structural and permanent,
 * not a lag, and no number of re-runs would close it.
 *
 * FALSIFIER: if the missing rows' created_at values are unique-ish, or if their
 * ids are ABOVE the max keyed id in their own batch, the hypothesis is wrong and
 * the cause is something else.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, statement_timeout: 900000, idle_timeout: 0, onnotice: () => {} });
const MONTHS = '(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)';
const STAMP_RE = `^[0-9]{4}:?${MONTHS}:?[0-9]{1,2}$`;
const CURSOR_AT = '2026-08-24 18:59:19.088501+00';

const out = { generated_at: new Date().toISOString(), steps: {} };
const step = async (name, fn) => {
  const t = Date.now(); const rows = await fn(); const ms = Date.now() - t;
  out.steps[name] = { ms, rows };
  console.log(`\n== ${name}  ${ms}ms`);
  console.log(JSON.stringify(rows, null, 1).slice(0, 2600));
  return rows;
};

const MISSING = sql`
  SELECT j.id, j.created_at, j.court, j.neutral_citation
    FROM judgments j
   WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
     AND j.created_at <= ${CURSOR_AT}::timestamptz
     AND upper(replace(j.neutral_citation,' ','')) !~ ${STAMP_RE}
     AND NOT EXISTS (SELECT 1 FROM judgment_citation_keys k
                      WHERE k.judgment_id = j.id AND k.source='neutral')`;

try {
  // 1. How many judgments share each missing row's created_at? A batch constant
  //    makes the compound cursor an id watermark inside that batch.
  await step('batch_size_of_missing_rows', () => sql`
    WITH m AS (${MISSING})
    SELECT m.created_at,
           count(*)::int                                         AS missing_here,
           (SELECT count(*)::int FROM judgments j2
             WHERE j2.created_at = m.created_at)                 AS judgments_sharing_this_created_at
      FROM m GROUP BY m.created_at ORDER BY missing_here DESC LIMIT 12`);

  // 2. THE FALSIFIER. Inside each affected batch, is the missing id below the
  //    highest id that DID get keyed? If yes the walker passed it.
  await step('missing_id_vs_walked_id_in_same_batch', () => sql`
    WITH m AS (${MISSING}),
    batch AS (
      SELECT DISTINCT created_at FROM m),
    walked AS (
      SELECT b.created_at, max(j.id::text) AS max_keyed_id, count(*)::int AS keyed_in_batch
        FROM batch b JOIN judgments j ON j.created_at = b.created_at
       WHERE EXISTS (SELECT 1 FROM judgment_citation_keys k
                      WHERE k.judgment_id = j.id AND k.source='neutral')
       GROUP BY b.created_at)
    SELECT count(*)::int                                                  AS missing_examined,
           count(*) FILTER (WHERE m.id::text < w.max_keyed_id)::int             AS below_a_walked_id,
           count(*) FILTER (WHERE m.id::text > w.max_keyed_id)::int             AS above_every_walked_id,
           count(*) FILTER (WHERE w.max_keyed_id IS NULL)::int            AS batch_never_walked_at_all
      FROM m LEFT JOIN walked w ON w.created_at = m.created_at`);

  // 3. Court spread -- a single-court residual is a source defect, a spread one
  //    is a walker defect.
  await step('court_spread', () => sql`
    WITH m AS (${MISSING})
    SELECT court, count(*)::int AS missing FROM m GROUP BY 1 ORDER BY 2 DESC`);

  // 4. Does the citation itself normalise to a key at all? If canonicalKeyFor
  //    would return null the miss is CORRECT and my "unexplained" is over-counted.
  await step('shape_sample', () => sql`
    WITH m AS (${MISSING})
    SELECT neutral_citation, count(*)::int AS n FROM m GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);

  // 5. Do these judgments have key rows from OTHER sources? A row keyed as
  //    'reported' but not 'neutral' is a different defect from no row at all.
  await step('other_source_keys', () => sql`
    WITH m AS (${MISSING})
    SELECT k.source, count(*)::int AS rows
      FROM m JOIN judgment_citation_keys k ON k.judgment_id = m.id
     GROUP BY 1 ORDER BY 2 DESC`);

  writeFileSync('docs/ai/new2/resolver-residual-diagnosis.json', JSON.stringify(out, null, 2));
  console.log('\nwrote docs/ai/new2/resolver-residual-diagnosis.json');
} finally { await sql.end({ timeout: 10 }); }
