/**
 * LCC R15 — which conjunctions do Indian High Courts actually print?
 *
 * `cohort.ts` lists seven. A pattern that never fires on 18.7M judgments is a
 * pattern somebody remembered rather than observed, and `CLAUDE.md` §7 forbids
 * exactly that. This counts them on a hash sample of cause titles, so each entry
 * in the list is kept for a number or dropped.
 *
 *   node scripts/lcc-connector-census.mts [sample]
 */
import postgres from 'postgres';
import { declaredCohort, CAUSE_TITLE_CHARS } from '../services/api/src/citations/cohort.ts';

const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20 });
const N = Number(process.argv[2] ?? 40000);

const rows = await sql<{ court: string; head: string }[]>`
  SELECT j.court, left(j.full_text, ${CAUSE_TITLE_CHARS}) AS head
    FROM judgment_citation_keys k
    JOIN judgments j ON j.id = k.judgment_id
   WHERE mod(abs(hashtext(k.citation_key)), 97) = 5
   LIMIT ${N}`;

const byConnector = new Map<string, number>();
const cohortByConnector = new Map<string, number>();
for (const r of rows) {
  const d = declaredCohort(r.head);
  const c = d.connector ?? '(none)';
  byConnector.set(c, (byConnector.get(c) ?? 0) + 1);
  if (d.connector !== null && d.declaredMatters > 1) {
    cohortByConnector.set(c, (cohortByConnector.get(c) ?? 0) + 1);
  }
}

console.log(`cause titles read: ${rows.length}`);
console.log('connector           printed   of which declare >1 matter');
for (const [c, n] of [...byConnector.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${c.padEnd(18)} ${String(n).padStart(6)}   ${String(cohortByConnector.get(c) ?? 0).padStart(6)}`,
  );
}
await sql.end();

/**
 * Second half: which connector is responsible for each firing of the GATE, on
 * NEW2's holdout. `(none)` cannot appear — the gate requires a conjunction.
 * Requires `lcc_r15_falseunique` (`lcc-cohort-measure.mts keys`).
 */
const T0 = '2026-08-18';
const sql2 = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20 });
const { cohortBlocksUnique } = await import('../services/api/src/citations/cohort.ts');

const pos = await sql2<{ head: string }[]>`
  SELECT DISTINCT ON (f.citation_key) left(j.full_text, ${CAUSE_TITLE_CHARS}) AS head
    FROM lcc_r15_falseunique f
    JOIN judgment_citation_keys k ON k.citation_key = f.citation_key AND k.created_at < ${T0}::timestamptz
    JOIN judgments j ON j.id = k.judgment_id
   ORDER BY f.citation_key, k.created_at`;
const ctl = await sql2<{ head: string }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), still AS (
    SELECT k.citation_key, min(k.judgment_id::text) AS jid
      FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) = 1
  )
  SELECT left(j.full_text, ${CAUSE_TITLE_CHARS}) AS head
    FROM still s JOIN judgments j ON j.id = s.jid::uuid
   WHERE mod(abs(hashtext(s.citation_key)), 397) = 11`;

const tally = (rows: { head: string }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = declaredCohort(r.head);
    if (cohortBlocksUnique(d, 1) && d.connector) m.set(d.connector, (m.get(d.connector) ?? 0) + 1);
  }
  return m;
};
const p = tally(pos);
const c = tally(ctl);
console.log(`\nGATE FIRINGS BY CONNECTOR — positives ${pos.length}, controls ${ctl.length}`);
console.log('connector           caught   refused-in-vain');
for (const k of new Set([...p.keys(), ...c.keys()])) {
  console.log(
    `  ${k.padEnd(18)} ${String(p.get(k) ?? 0).padStart(6)}   ${String(c.get(k) ?? 0).padStart(6)}`,
  );
}
await sql2.end();
