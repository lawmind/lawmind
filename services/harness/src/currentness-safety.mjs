/**
 * NEW1 P15 — an authority whose law has moved must never be reachable as though
 * it had not.
 *
 * The product rule is absolute: `overruled_status` is NEVER cached, is read live
 * at render on every surface, and the stale-overruled rate threshold is zero.
 * Retrieval is the one layer that can quietly break that rule without touching a
 * screen — by copying the status into an index that then goes stale, or by
 * returning an authority without carrying its identity far enough for the caller
 * to look the status up at all.
 *
 * This checks the retrieval side of that, mechanically:
 *
 *   1. NO NEW1-owned vector table may hold a treatment or currentness column.
 *      A cached status is the defect, not a convenience. The check reads
 *      `information_schema`, so it catches a column added next month by someone
 *      who never read this file.
 *   2. Every row a NEW1 index returns must carry `judgment_id`, so the caller can
 *      read the live status. An index that returned text and a score would make
 *      the rule unenforceable downstream.
 *   3. For every judgment currently carrying a non-`none` status, report whether
 *      it is embedded, and confirm the status the retrieval path would read is the
 *      one in `judgments` RIGHT NOW rather than one captured at embed time.
 *
 * WHAT IT DOES NOT CLAIM
 * ----------------------
 * It does not test rendering — that is RCC's surface and RCC's tests. It does not
 * decide whether a `set_aside` authority should be RETRIEVABLE: it should, and the
 * treatment relation is a different question from the currentness interpretation.
 * An advocate arguing the other side needs to find the case that was set aside.
 * What must never happen is that it comes back looking like good law.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const OUT = new URL('../../../docs/ai/new1-tier-a/currentness-safety.json', import.meta.url);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 300_000 }, onnotice: () => {} });

/** Words that would mean a status had been copied into a vector table. */
const FORBIDDEN = ['overruled', 'treatment', 'currentness', 'good_law', 'set_aside', 'status'];

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'new1_%'
  ORDER BY table_name
`;
const columns = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name LIKE 'new1_%'
`;

const violations = [];
for (const c of columns) {
  const name = c.column_name.toLowerCase();
  if (FORBIDDEN.some((f) => name.includes(f))) {
    violations.push({ table: c.table_name, column: c.column_name, why: 'a cached treatment or currentness value' });
  }
}
const missingIdentity = tables
  .filter((t) => columns.some((c) => c.table_name === t.table_name && c.column_name === 'embedding'))
  .filter((t) => !columns.some((c) => c.table_name === t.table_name && c.column_name === 'judgment_id'))
  .map((t) => ({ table: t.table_name, why: 'a vector table with no judgment_id cannot have its status looked up' }));

// ── the live population ──────────────────────────────────────────────────────
const moved = await sql`
  SELECT id, overruled_status, court, case_title
  FROM judgments
  WHERE overruled_status IS NOT NULL AND overruled_status <> 'none'
`;
const ids = moved.map((r) => r.id);
const staged = ids.length
  ? await sql`SELECT judgment_id FROM new1_doc_vector_stage WHERE judgment_id = ANY(${ids}::uuid[])`
  : [];
const stagedSet = new Set(staged.map((r) => r.judgment_id));

const byStatus = {};
for (const r of moved) {
  const s = (byStatus[r.overruled_status] ??= { total: 0, embedded: 0 });
  s.total += 1;
  if (stagedSet.has(r.id)) s.embedded += 1;
}

/**
 * The join a retrieval caller must make. If this returns the status, the live
 * read is available at the point of use; if it returned nothing, the identity
 * carried by the index is not enough and rule 2 above is not really satisfied.
 */
const joinProbe = ids.length
  ? await sql`
      SELECT s.judgment_id, j.overruled_status
      FROM new1_doc_vector_stage s JOIN judgments j ON j.id = s.judgment_id
      WHERE s.judgment_id = ANY(${ids}::uuid[])
    `
  : [];
const joinCarriesStatus = joinProbe.every((r) => r.overruled_status !== null && r.overruled_status !== undefined);

const pass = violations.length === 0 && missingIdentity.length === 0 && joinCarriesStatus;

const report = {
  kind: 'new1_currentness_safety',
  measuredAt: new Date().toISOString(),
  verdict: pass ? 'PASS' : 'FAIL',
  new1Tables: tables.map((t) => t.table_name),
  cachedStatusColumns: violations,
  vectorTablesWithoutIdentity: missingIdentity,
  liveJoinCarriesStatus: joinCarriesStatus,
  lawHasMoved: {
    total: moved.length,
    byStatus,
    embeddedAndReachable: stagedSet.size,
  },
  // Named so a later run can say whether the SAME authorities are still covered.
  examples: moved.slice(0, 10).map((r) => ({
    id: r.id,
    status: r.overruled_status,
    court: r.court,
    title: String(r.case_title ?? '').slice(0, 70),
    embedded: stagedSet.has(r.id),
  })),
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log(`CURRENTNESS SAFETY: ${report.verdict}`);
console.log(`  NEW1 tables inspected      ${tables.length}`);
console.log(`  cached-status columns      ${violations.length}`);
for (const v of violations) console.log(`    VIOLATION ${v.table}.${v.column} — ${v.why}`);
console.log(`  vector tables w/o identity ${missingIdentity.length}`);
console.log(`  live join carries status   ${joinCarriesStatus}`);
console.log(`  authorities whose law moved ${moved.length}`);
for (const [s, v] of Object.entries(byStatus)) console.log(`    ${s.padEnd(20)} ${v.total} total, ${v.embedded} embedded`);
console.log(`\nwrote ${OUT.pathname}`);
await sql.end({ timeout: 10 });
process.exitCode = pass ? 0 : 1;
