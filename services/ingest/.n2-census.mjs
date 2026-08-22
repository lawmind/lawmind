// NEW2 P1.1 — one-pass census of neutral citations shared by >1 judgment.
// Writes an analysis-only table (prefixed new2_) plus a JSON artifact. Rewrites nothing.
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const out = { startedAt: new Date().toISOString(), steps: [] };
const art = 'docs/ai/new2/shared-neutral-census.json';
const step = (name, v) => { out.steps.push({ name, at: new Date().toISOString(), ...v }); writeFileSync(art, JSON.stringify(out, null, 1)); console.log(name, JSON.stringify(v)); };
try {
  await sql`set statement_timeout = 0`;
  const t0 = Date.now();
  await sql`drop table if exists new2_neutral_dupe_groups`;
  await sql.unsafe(`create table new2_neutral_dupe_groups as
    select upper(regexp_replace(neutral_citation,'[^A-Za-z0-9]','','g')) as k,
           min(neutral_citation) as sample_raw,
           count(*)::int as n,
           count(distinct case_number)::int as distinct_case_numbers,
           count(distinct content_hash)::int as distinct_content_hashes,
           count(distinct court)::int as distinct_courts,
           min(court) as a_court,
           min(judgment_date) as first_date,
           max(judgment_date) as last_date
    from judgments
    where neutral_citation is not null and neutral_citation <> ''
    group by 1 having count(*) > 1`);
  step('groups_table_built', { seconds: Math.round((Date.now()-t0)/1000) });
  await sql`create index on new2_neutral_dupe_groups (k)`;
  await sql`create index on new2_neutral_dupe_groups (n desc)`;
  await sql`analyze new2_neutral_dupe_groups`;
  const tot = await sql`select count(*)::int groups, sum(n)::int rows_in_groups, max(n)::int worst from new2_neutral_dupe_groups`;
  step('totals', tot[0]);
  const shape = await sql`select
      count(*) filter (where distinct_case_numbers > 1)::int groups_multi_casenumber,
      count(*) filter (where distinct_case_numbers = 1)::int groups_single_casenumber,
      count(*) filter (where distinct_content_hashes = 1)::int groups_byte_identical,
      count(*) filter (where distinct_courts > 1)::int groups_cross_court,
      count(*) filter (where n = 2)::int groups_of_2,
      count(*) filter (where n between 3 and 9)::int groups_3_9,
      count(*) filter (where n between 10 and 49)::int groups_10_49,
      count(*) filter (where n >= 50)::int groups_50_plus
    from new2_neutral_dupe_groups`;
  step('shape', shape[0]);
  const byCourt = await sql`select a_court court, count(*)::int groups, sum(n)::int rows, max(n)::int worst,
      count(*) filter (where distinct_content_hashes = 1)::int byte_identical_groups
    from new2_neutral_dupe_groups group by 1 order by groups desc limit 40`;
  step('by_court', { rows: byCourt });
  const denom = await sql`select count(*)::int rows_with_neutral, count(distinct upper(regexp_replace(neutral_citation,'[^A-Za-z0-9]','','g')))::int distinct_neutral
    from judgments where neutral_citation is not null and neutral_citation <> ''`;
  step('denominator', denom[0]);
  out.finishedAt = new Date().toISOString();
  writeFileSync(art, JSON.stringify(out, null, 1));
  console.log('DONE');
} catch (e) { console.error('ERR ' + e.message); out.error = e.message; writeFileSync(art, JSON.stringify(out, null, 1)); process.exitCode = 1; }
await sql.end();
