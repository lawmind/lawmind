/**
 * NEW2 §8/NEW2-2 — RESOLVER KEY FRESHNESS, MEASURED FROM THE FRONTIER.
 *
 * `.n2c-p2-keygap.mjs` has the 17-Aug cursor hardcoded: it was a one-shot
 * diagnosis of a specific backlog, not a monitor, and reading it today reports a
 * gap that was closed on 24 Aug. This is the monitor.
 *
 * The five numbers the round asks for -- key frontier, lag rows, lag time,
 * freshness time, and the residual DECOMPOSED -- because a shortfall that is
 * entirely despatch stamps deliberately refused is a healthy shortfall, and a
 * shortfall of the same size that is unwalked ingest is not. Those two must
 * never be reported as one number again.
 *
 * READ ONLY.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, statement_timeout: 900000, idle_timeout: 0, onnotice: () => {} });
const MONTHS = '(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)';
const STAMP_RE = `^[0-9]{4}:?${MONTHS}:?[0-9]{1,2}$`;

const ckpt = JSON.parse(readFileSync('services/ingest/.checkpoints/citation-keys.json', 'utf8'));
const out = { generated_at: new Date().toISOString(), checkpoint: ckpt, steps: {} };

const step = async (name, fn) => {
  const [{ active }] = await sql`SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
  const t = Date.now();
  const rows = await fn();
  const ms = Date.now() - t;
  out.steps[name] = { ms, pg_active_before: active, rows };
  console.log(`\n== ${name}  ${ms}ms  pg_active_before ${active}`);
  console.log(JSON.stringify(rows, null, 1).slice(0, 3000));
  return rows;
};

try {
  // 1. THE FRONTIER. Lag in rows and in time, measured from the checkpoint the
  //    builder actually resumes from -- not from a date typed into a script.
  await step('frontier_lag', () => sql`
    SELECT ${ckpt.cursorAt}::timestamptz                                   AS key_frontier,
           now() - ${ckpt.cursorAt}::timestamptz                           AS lag_time,
           count(*)::int                                                   AS judgments_above_frontier,
           count(*) FILTER (WHERE neutral_citation IS NOT NULL
                              AND neutral_citation <> '')::int             AS lag_rows_with_neutral,
           max(created_at)                                                 AS newest_ingest
      FROM judgments
     WHERE (created_at, id) > (${ckpt.cursorAt}::timestamptz, ${ckpt.cursorId}::uuid)`);

  // 2. CORPUS-WIDE SHORTFALL, the number LCC closed 309,414 -> 163.
  await step('corpus_shortfall', () => sql`
    SELECT (SELECT count(*)::int FROM judgments
             WHERE neutral_citation IS NOT NULL AND neutral_citation <> '')        AS with_neutral_citation,
           (SELECT count(DISTINCT judgment_id)::int FROM judgment_citation_keys
             WHERE source = 'neutral')                                             AS distinct_judgments_keyed`);

  // 3. THE DECOMPOSITION. A missing key row is only a defect if the citation was
  //    KEYABLE. A despatch stamp that LCC's gate now refuses is a CORRECT miss,
  //    and pooling the two is how a healthy exclusion reads as a backlog.
  await step('residual_decomposed', () => sql`
    WITH missing AS (
      SELECT j.id, j.neutral_citation, j.court, j.created_at
        FROM judgments j
       WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
         AND NOT EXISTS (SELECT 1 FROM judgment_citation_keys k
                          WHERE k.judgment_id = j.id AND k.source = 'neutral'))
    SELECT count(*)::int AS missing_total,
           count(*) FILTER (WHERE upper(replace(neutral_citation,' ','')) ~ ${STAMP_RE})::int
                                                                  AS correctly_refused_despatch_stamp,
           count(*) FILTER (WHERE created_at > ${ckpt.cursorAt}::timestamptz)::int
                                                                  AS above_frontier_unwalked,
           count(*) FILTER (WHERE created_at <= ${ckpt.cursorAt}::timestamptz
                              AND upper(replace(neutral_citation,' ','')) !~ ${STAMP_RE})::int
                                                                  AS UNEXPLAINED
      FROM missing`);

  // 4. If anything is UNEXPLAINED, name it. An unexplained residual reported as a
  //    count and never as rows is how a second cause hides behind a first one.
  await step('unexplained_sample', () => sql`
    SELECT j.court, j.neutral_citation, j.created_at, left(j.case_title, 60) AS title
      FROM judgments j
     WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
       AND j.created_at <= ${ckpt.cursorAt}::timestamptz
       AND upper(replace(j.neutral_citation,' ','')) !~ ${STAMP_RE}
       AND NOT EXISTS (SELECT 1 FROM judgment_citation_keys k
                        WHERE k.judgment_id = j.id AND k.source = 'neutral')
     LIMIT 25`);

  writeFileSync('docs/ai/new2/resolver-freshness.json', JSON.stringify(out, null, 2));
  console.log('\nwrote docs/ai/new2/resolver-freshness.json');
} finally {
  await sql.end({ timeout: 10 });
}
