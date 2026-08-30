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

/**
 * `bail_order` was here and is not any more — migration `0066` (21 Aug) made bail
 * orders their own reachable tier, `BAIL_ORDER_REACHABLE`, on the strength of this
 * lane's own measurement that 12 of 250 citation-verified gold authorities are
 * bail orders a judge really cited.
 *
 * This is exactly the case the file's header argued for moving rather than
 * deleting: "deleting them throws away real GPU work for a classification that
 * could be revised". It was revised inside thirty-six hours, and `--restore` puts
 * 29,349 vectors back at no GPU cost at all.
 */
const REFUSED = ['procedural_disposal', 'reference_stub', 'decided_brief'];
const APPLY = process.argv.includes('--apply');

/**
 * Move rows the other way: quarantine -> stage, for classes the contract has
 * started admitting. Named explicitly rather than derived from the difference
 * between the old and new lists, because "everything not currently refused" would
 * silently restore a class nobody decided about.
 */
const restoreIdx = process.argv.indexOf('--restore');
const RESTORE = restoreIdx >= 0 ? (process.argv[restoreIdx + 1] ?? '').split(',').filter(Boolean) : [];
if (RESTORE.length > 0) {
  const before = await sql`
    SELECT refused_class, count(*)::int AS n FROM new1_doc_vector_stage_refused
    WHERE refused_class = ANY(${RESTORE}) GROUP BY 1 ORDER BY n DESC
  `;
  const total = before.reduce((a, r) => a + r.n, 0);
  console.log(`restore ${RESTORE.join(',')}: ${total} quarantined rows`);
  for (const r of before) console.log(`  ${r.refused_class.padEnd(22)} ${String(r.n).padStart(7)}`);
  if (!APPLY) {
    console.log('\ndry run — pass --apply to move them back');
    await sql.end();
    process.exit(0);
  }
  // One statement again: never in both tables, never in neither.
  const moved = await sql`
    WITH lifted AS (
      DELETE FROM new1_doc_vector_stage_refused
      WHERE refused_class = ANY(${RESTORE})
      RETURNING judgment_id, content_hash, court, year, member_count, text_chars,
                embedded_chars, tokens, recipe, model, embedding, created_at,
                -- A lift back is not a new generation. Carrying the identity is
                -- the only way a restored row keeps saying which snapshot made
                -- it; before 30 Aug 2026 the quarantine table had no such column
                -- at all, so every restore silently re-labelled 72,099 rows with
                -- whatever generation happened to be current.
                snapshot_hash
    )
    INSERT INTO new1_doc_vector_stage
      (judgment_id, content_hash, court, year, member_count, text_chars,
       embedded_chars, tokens, recipe, model, embedding, created_at, snapshot_hash)
    SELECT * FROM lifted
    ON CONFLICT (judgment_id) DO NOTHING
  `;
  const [{ main }] = await sql`SELECT count(*)::int AS main FROM new1_doc_vector_stage`;
  const [{ q }] = await sql`SELECT count(*)::int AS q FROM new1_doc_vector_stage_refused`;
  writeFileSync(
    new URL('../../../docs/ai/new1-tier-a/stage-restore.json', import.meta.url),
    JSON.stringify(
      { kind: 'new1_stage_restore', restoredClasses: RESTORE, movedRows: moved.count ?? total, stageRowsAfter: main, quarantineRowsAfter: q, byClassBefore: before, appliedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );
  console.log(`\nrestored ${moved.count ?? total}; stage now ${main}, quarantine now ${q}`);
  await sql.end();
  process.exit(0);
}

/**
 * `--text-unsafe` — quarantine on PROVEN TEXT DAMAGE rather than on document class.
 *
 * LCC's TEXT_UNSAFE_CONTRACT_READY (bus 0960) deployed a writer, not a new rule:
 * `axis_b_text` has been an allow-list since 0056 and always refused a stored
 * damage verdict — 99.7% of the corpus simply had no verdict. Now 63,565 of this
 * lane's staged vectors carry one, and every one of them is `NOT_ELIGIBLE`.
 *
 * The predicate is read from the deployed view's own `text_safety` column
 * (migration 0067), NOT from a copy of NEW2's 12-per-thousand English-density
 * floor. This file has already watched a copied predicate drift twice — the
 * bail-order episode and the CITED_AUTHORITY_REACHABLE exemption — and a third
 * copy of a threshold nobody owns is how it happens again.
 *
 * `refused_class` records `text_unsafe:<script_quality>` rather than a bare class
 * name, because these rows were NOT refused for their role and a later reader must
 * not think they were. It also means `--restore text_unsafe:damaged_other` works
 * through the existing path unchanged: `script_quality` is one column, and a
 * document repaired by OCR walks straight back in when the verdict is cleared.
 *
 * NOT quarantined: `text_safety = 'UNKNOWN'`. That is 652,869 rows and absence of
 * evidence is not evidence of damage — the same rule LCC's writer applies.
 */
if (process.argv.includes('--text-unsafe')) {
  const beforeT = await sql`
    SELECT e.text_safety, coalesce(e.script_quality, '(null)') AS sq, count(*)::int AS n
    FROM new1_doc_vector_stage s
    JOIN judgment_embedding_eligibility e ON e.id = s.judgment_id
    WHERE e.text_safety = 'UNSAFE_VERIFIED'
    GROUP BY 1, 2 ORDER BY n DESC
  `;
  const totalT = beforeT.reduce((a, r) => a + r.n, 0);
  // A row that is UNSAFE_VERIFIED but still eligible would mean the two halves of
  // the contract disagree, and quarantining it would be this lane acting on its
  // own authority. Refuse rather than guess.
  const [{ contradiction }] = await sql`
    SELECT count(*)::int AS contradiction
    FROM new1_doc_vector_stage s
    JOIN judgment_embedding_eligibility e ON e.id = s.judgment_id
    WHERE e.text_safety = 'UNSAFE_VERIFIED' AND e.semantic_tier <> 'NOT_ELIGIBLE'
  `;
  console.log(`text-unsafe rows currently in new1_doc_vector_stage: ${totalT}`);
  for (const r of beforeT) console.log(`  ${r.sq.padEnd(22)} ${String(r.n).padStart(7)}`);
  console.log(`UNSAFE_VERIFIED but still eligible (must be 0): ${contradiction}`);
  if (contradiction > 0) {
    console.error('REFUSING: the view calls these rows damaged AND eligible. Do not quarantine on a contradiction.');
    await sql.end();
    process.exit(1);
  }
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
  await sql`ALTER TABLE new1_doc_vector_stage_refused ADD COLUMN IF NOT EXISTS refused_class text`;
  await sql`ALTER TABLE new1_doc_vector_stage_refused ADD COLUMN IF NOT EXISTS quarantined_at timestamptz DEFAULT now()`;
  // One statement, so the row is never in both tables and never in neither.
  const movedT = await sql`
    WITH doomed AS (
      SELECT s.judgment_id, 'text_unsafe:' || coalesce(e.script_quality, 'unknown') AS reason
      FROM new1_doc_vector_stage s
      JOIN judgment_embedding_eligibility e ON e.id = s.judgment_id
      WHERE e.text_safety = 'UNSAFE_VERIFIED'
    ), lifted AS (
      DELETE FROM new1_doc_vector_stage s
      USING doomed d WHERE s.judgment_id = d.judgment_id
      RETURNING s.*, d.reason
    )
    INSERT INTO new1_doc_vector_stage_refused
      (judgment_id, content_hash, court, year, member_count, text_chars,
       embedded_chars, tokens, recipe, model, embedding, created_at, refused_class,
       snapshot_hash)
    SELECT judgment_id, content_hash, court, year, member_count, text_chars,
           embedded_chars, tokens, recipe, model, embedding, created_at, reason,
           snapshot_hash
    FROM lifted
    ON CONFLICT DO NOTHING
  `;
  const [{ mainT }] = await sql`SELECT count(*)::int AS "mainT" FROM new1_doc_vector_stage`;
  const [{ qT }] = await sql`SELECT count(*)::int AS "qT" FROM new1_doc_vector_stage_refused`;
  writeFileSync(
    new URL('../../../docs/ai/new1-tier-a/stage-quarantine-text-unsafe.json', import.meta.url),
    JSON.stringify(
      {
        kind: 'new1_stage_quarantine_text_unsafe',
        predicate: "judgment_embedding_eligibility.text_safety = 'UNSAFE_VERIFIED' (deployed view, migration 0067)",
        note: 'UNKNOWN is NOT quarantined. Absence of evidence is not evidence of damage.',
        movedRows: movedT.count ?? totalT,
        stageRowsAfter: mainT,
        quarantineRowsAfter: qT,
        byScriptQualityBefore: beforeT,
        appliedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`\nmoved ${movedT.count ?? totalT}; stage now ${mainT}, quarantine now ${qT}`);
  await sql.end();
  process.exit(0);
}

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
