/**
 * NEW1 — move staged vectors whose document is now a REFUSED class out of the
 * main stage table.
 *
 * WHY MOVE RATHER THAN DELETE OR FILTER
 * -------------------------------------
 * 34,257 of 217,756 manifest-sourced staged rows — 15.7% — carry
 * `bail_order` or `procedural_disposal`, two classes the deployed eligibility
 * view refuses. They are in the stage table because the manifest froze their
 * eligibility on 19 Aug and NEW2 classified them afterwards; the walk itself did
 * nothing wrong.
 *
 * Deleting them throws away real GPU work for a classification that could be
 * revised — `bail_order` scored 100/100 in NEW2's audit, but "reliable label" and
 * "should never be retrievable" are different questions and only the first is
 * settled. Leaving them in place is worse: every Tier-A quality number would
 * quietly be about a population 15.7% of which Tier A excludes, and a filter that
 * every future query must remember is a filter some future query will forget.
 *
 * So they move to a table whose name says what they are. Nothing is lost, the
 * main table means exactly one thing, and reversing this is an INSERT ... SELECT.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {} });

const REFUSED = ['procedural_disposal', 'reference_stub', 'bail_order', 'decided_brief'];
const APPLY = process.argv.includes('--apply');

const before = await sql`
  SELECT coalesce(j.hc_document_class, '(null)') AS cls, count(*)::int AS n
  FROM new1_doc_vector_stage s JOIN judgments j ON j.id = s.judgment_id
  WHERE j.hc_document_class = ANY(${REFUSED})
  GROUP BY 1 ORDER BY n DESC
`;
const total = before.reduce((a, r) => a + r.n, 0);
console.log(`refused-class rows currently in new1_doc_vector_stage: ${total}`);
for (const r of before) console.log(`  ${r.cls.padEnd(22)} ${String(r.n).padStart(7)}`);

if (!APPLY) {
  console.log('\ndry run — pass --apply to move them');
  await sql.end();
  process.exit(0);
}

await sql`
  CREATE TABLE IF NOT EXISTS new1_doc_vector_stage_refused (
    LIKE new1_doc_vector_stage INCLUDING DEFAULTS INCLUDING CONSTRAINTS
  )
`;
// `refused_class` is recorded on the row rather than re-derived on read: the
// class that caused the move is the evidence, and re-deriving it later would
// answer a different question if the classifier changes underneath.
await sql`ALTER TABLE new1_doc_vector_stage_refused ADD COLUMN IF NOT EXISTS refused_class text`;
await sql`ALTER TABLE new1_doc_vector_stage_refused ADD COLUMN IF NOT EXISTS quarantined_at timestamptz DEFAULT now()`;

// One statement, so the row is never in both tables and never in neither.
const moved = await sql`
  WITH doomed AS (
    SELECT s.judgment_id, j.hc_document_class AS cls
    FROM new1_doc_vector_stage s JOIN judgments j ON j.id = s.judgment_id
    WHERE j.hc_document_class = ANY(${REFUSED})
  ), lifted AS (
    DELETE FROM new1_doc_vector_stage s
    USING doomed d WHERE s.judgment_id = d.judgment_id
    RETURNING s.*, d.cls
  )
  INSERT INTO new1_doc_vector_stage_refused
    (judgment_id, content_hash, court, year, member_count, text_chars,
     embedded_chars, tokens, recipe, model, embedding, created_at, refused_class)
  SELECT judgment_id, content_hash, court, year, member_count, text_chars,
         embedded_chars, tokens, recipe, model, embedding, created_at, cls
  FROM lifted
  ON CONFLICT DO NOTHING
`;

const [{ main }] = await sql`SELECT count(*)::int AS main FROM new1_doc_vector_stage`;
const [{ q }] = await sql`SELECT count(*)::int AS q FROM new1_doc_vector_stage_refused`;
const summary = {
  kind: 'new1_stage_quarantine',
  refusedClasses: REFUSED,
  movedRows: moved.count ?? total,
  stageRowsAfter: main,
  quarantineRowsAfter: q,
  byClassBefore: before,
  appliedAt: new Date().toISOString(),
};
writeFileSync(
  new URL('../../../docs/ai/new1-tier-a/stage-quarantine.json', import.meta.url),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(`\nmoved ${summary.movedRows}; stage now ${main}, quarantine now ${q}`);
await sql.end();
