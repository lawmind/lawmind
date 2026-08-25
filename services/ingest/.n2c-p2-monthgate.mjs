/**
 * NEW2 §8/NEW2-2 — THE GATE, CHECKED AGAINST THE CORPUS'S OWN VOCABULARY.
 *
 * The token census (`resolver-monthfuzz-census.json`) settles two things at once:
 *
 *  - a SHAPE rule (`dddd <ALPHA> dd`) must never be used: 7,062 real Supreme
 *    Court neutral citations (`2026:INSC:12`) have exactly that shape, along
 *    with KHC/UHC/CGHC/MLHC/JHHC/HHC/AHC/SHC/MNHC/MHC/PHHC. LCC's allow-list
 *    choice was right;
 *  - the allow-list is nine judgments short. The corpus spells three months
 *    wrong -- JANURARY, ARPIL, SEPTEMEBER -- and a misspelling passes a
 *    correctly-spelled allow-list.
 *
 * This measures the residual exposure with the misspellings included.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, statement_timeout: 900000, idle_timeout: 0, onnotice: () => {} });

// Observed in the corpus, not invented. Correct spellings + the three misspellings.
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER',
                'JAN','FEB','MAR','APR','JUN','JUL','AUG','SEP','SEPT','OCT','NOV','DEC',
                'JANURARY','ARPIL','SEPTEMEBER'];
const RE = `^[0-9]{4}:?(${MONTHS.join('|')}):?[0-9]{1,2}$`;
const MISSPELT = `^[0-9]{4}:?(JANURARY|ARPIL|SEPTEMEBER):?[0-9]{1,2}$`;

const out = { generated_at: new Date().toISOString(), months_from_corpus_census: MONTHS, steps: {} };
const step = async (name, fn) => { const t=Date.now(); const rows=await fn(); out.steps[name]={ms:Date.now()-t,rows};
  console.log(`\n== ${name}  ${Date.now()-t}ms`); console.log(JSON.stringify(rows,null,1).slice(0,2500)); return rows; };

try {
  // 1. Does ANY month stamp -- correctly spelt or not -- still hold a key row?
  await step('month_stamps_still_indexed', () => sql`
    SELECT count(*) FILTER (WHERE upper(replace(j.neutral_citation,' ','')) ~ ${RE})::int          AS any_month_token,
           count(*) FILTER (WHERE upper(replace(j.neutral_citation,' ','')) ~ ${MISSPELT})::int    AS misspelt_only
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.source = 'neutral'`);

  // 2. The whole month-stamp population on judgments, and how much of it the
  //    CORRECTLY-SPELT allow-list would miss.
  await step('month_stamp_population', () => sql`
    SELECT count(*) FILTER (WHERE upper(replace(neutral_citation,' ','')) ~ ${RE})::int       AS all_month_stamps,
           count(*) FILTER (WHERE upper(replace(neutral_citation,' ','')) ~ ${MISSPELT})::int AS missed_by_current_gate,
           count(DISTINCT court) FILTER (WHERE upper(replace(neutral_citation,' ','')) ~ ${RE})::int AS courts
      FROM judgments WHERE neutral_citation IS NOT NULL`);

  // 3. The misspelled rows, named. Eleven is small enough to print in full, and
  //    a defect nobody can see the rows of is a defect nobody fixes.
  await step('misspelt_rows', () => sql`
    SELECT j.neutral_citation, j.court, j.judgment_date::text AS decided, left(j.case_title,48) AS title,
           EXISTS (SELECT 1 FROM judgment_citation_keys k WHERE k.judgment_id=j.id AND k.source='neutral') AS indexed
      FROM judgments j
     WHERE j.neutral_citation IS NOT NULL
       AND upper(replace(j.neutral_citation,' ','')) ~ ${MISSPELT}
     ORDER BY 1`);

  writeFileSync('docs/ai/new2/resolver-monthgate-exposure.json', JSON.stringify(out,null,2));
  console.log('\nwrote docs/ai/new2/resolver-monthgate-exposure.json');
} finally { await sql.end({ timeout: 10 }); }
