/** LCC R15 — read-only inspection of what the shipped gate fires on. */
import postgres from 'postgres';
import {
  declaredCohort,
  cohortBlocksUnique,
  CAUSE_TITLE_CHARS,
} from '../services/api/src/citations/cohort.ts';

const T0 = '2026-08-18';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20 });

const rows = await sql<{ citation_key: string; head: string }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), still AS (
    SELECT k.citation_key, min(k.judgment_id::text) AS jid
      FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) = 1
  )
  SELECT s.citation_key, left(j.full_text, ${CAUSE_TITLE_CHARS}) AS head
    FROM still s JOIN judgments j ON j.id = s.jid::uuid
   WHERE mod(abs(hashtext(s.citation_key)), 397) = 11
   LIMIT 6000`;

const fired = rows.filter((r) => cohortBlocksUnique(declaredCohort(r.head), 1));
console.log('controls', rows.length, 'fired', fired.length);
for (const f of fired.slice(0, Number(process.argv[2] ?? 10))) {
  const d = declaredCohort(f.head);
  console.log(
    '===',
    f.citation_key,
    '| connector',
    d.connector,
    '| matters',
    d.matters.map((m) => m.key).join(' + '),
  );
  console.log('   ', f.head.split('\n').slice(0, 6).join(' / ').slice(0, 260));
}
await sql.end();
