/**
 * NEW2 §8/NEW2-2 — TWO THINGS THE RESIDUAL DIAGNOSIS TURNED UP.
 *
 * (A) LCC's despatch-stamp gate (bus 1116) is a MONTH-NAME ALLOW-LIST. The
 *     corpus contains MISSPELLED month names -- `2011:JANURARY:19`,
 *     `2011:SEPTEMEBER:26`. Those pass the gate. They are missing key rows today
 *     only because their ingest batch was never walked; the moment the catch-up
 *     reaches them they become resolver inputs, which is exactly the regression
 *     bus 1112 reported and 1116 closed.
 *
 * (B) Whole ingest batches were never walked at all -- not one row in the batch
 *     carries a key. That is a different defect from lag and it does not close
 *     itself.
 *
 * Method for (A): do NOT extend the allow-list by guessing spellings. Enumerate
 * every alphabetic token that appears in the `dddd <ALPHA> dd` shape and report
 * it with its count, so the vocabulary comes from the corpus rather than from
 * me. A shape test plus a day-range test is then checked against that census.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, statement_timeout: 900000, idle_timeout: 0, onnotice: () => {} });
// Deliberately month-AGNOSTIC: four digits, an alphabetic run, one or two digits.
const SHAPE = `^[0-9]{4}:?[A-Z]+:?[0-9]{1,2}$`;
const out = { generated_at: new Date().toISOString(), steps: {} };
const step = async (name, fn) => {
  const t = Date.now(); const rows = await fn(); const ms = Date.now() - t;
  out.steps[name] = { ms, rows };
  console.log(`\n== ${name}  ${ms}ms`);
  console.log(JSON.stringify(rows, null, 1).slice(0, 4000));
  return rows;
};

try {
  // 1. THE VOCABULARY CENSUS. Every alphabetic token in the stamp shape, from
  //    the corpus. This is the list a gate should be built against.
  await step('alpha_token_census', () => sql`
    SELECT upper((regexp_match(upper(replace(neutral_citation,' ','')), '^[0-9]{4}:?([A-Z]+):?[0-9]{1,2}$'))[1]) AS token,
           count(*)::int AS judgments,
           count(DISTINCT court)::int AS courts,
           min(judgment_date)::text AS first_decided,
           max(judgment_date)::text AS last_decided
      FROM judgments
     WHERE neutral_citation IS NOT NULL
       AND upper(replace(neutral_citation,' ','')) ~ ${SHAPE}
     GROUP BY 1 ORDER BY 2 DESC LIMIT 60`);

  // 2. How many of those already sit in the key index despite LCC's fix?
  await step('shape_rows_still_indexed', () => sql`
    SELECT count(*)::int AS key_rows, count(DISTINCT k.judgment_id)::int AS judgments
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.source='neutral'
       AND upper(replace(j.neutral_citation,' ','')) ~ ${SHAPE}`);

  // 3. THE UNWALKED HOLE, sized properly. Batches (created_at) where NOTHING
  //    carries a neutral key row, but at least one member has a neutral citation.
  await step('never_walked_batches', () => sql`
    WITH b AS (
      SELECT j.created_at,
             count(*)::int AS judgments_in_batch,
             count(*) FILTER (WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> '')::int AS with_neutral,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM judgment_citation_keys k
                                             WHERE k.judgment_id=j.id AND k.source='neutral'))::int AS keyed
        FROM judgments j
       WHERE j.created_at >= '2026-08-17'::timestamptz
       GROUP BY 1)
    SELECT count(*)::int AS batches_examined,
           count(*) FILTER (WHERE keyed = 0 AND with_neutral > 0)::int AS never_walked_batches,
           coalesce(sum(with_neutral) FILTER (WHERE keyed = 0 AND with_neutral > 0),0)::int AS judgments_stranded,
           coalesce(sum(judgments_in_batch) FILTER (WHERE keyed = 0 AND with_neutral > 0),0)::int AS rows_in_those_batches
      FROM b`);

  writeFileSync('docs/ai/new2/resolver-monthfuzz-census.json', JSON.stringify(out, null, 2));
  console.log('\nwrote docs/ai/new2/resolver-monthfuzz-census.json');
} finally { await sql.end({ timeout: 10 }); }
