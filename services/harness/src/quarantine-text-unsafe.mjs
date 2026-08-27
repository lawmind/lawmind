#!/usr/bin/env node
/**
 * NEW1 R9 — move staged vectors whose document the deployed view now grades
 * `UNSAFE_VERIFIED` out of the main stage table.
 *
 *   node services/harness/src/quarantine-text-unsafe.mjs            # dry run
 *   node services/harness/src/quarantine-text-unsafe.mjs --apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS ALONGSIDE `stage-quarantine-refused.mjs`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That file moves rows whose `hc_document_class` is a refused CLASS. This one is
 * the TEXT-DAMAGE axis, which it does not cover — different column, different
 * writer, different reason.
 *
 * The walk already refuses `text_safety = 'UNSAFE_VERIFIED'` before the GPU sees
 * a document. What that check structurally cannot reach is a row that was
 * ALREADY STAGED when the verdict landed. NEW2's screen runs over the corpus
 * continuously and convicted 547 documents on 27 Aug at ~13:00Z; five of them had
 * been staged by the delta walk that started at 11:45Z. The walk did nothing
 * wrong and the vectors are real — they are simply vectors over text we have now
 * proven is a glyph dump, and a proven-damaged document with a retrievable vector
 * is the exact thing the check exists to prevent.
 *
 * MOVE, NEVER DELETE. Reversing it is one `INSERT ... SELECT`, printed in the
 * artifact with the ids, and a re-extraction of the same PDF could clear the
 * verdict. `refused_class` records WHY, taken from `script_quality`: a quarantine
 * that does not say what convicted the row is a quarantine nobody can reverse
 * with confidence.
 *
 * Run it after any screen pass. It is idempotent and cheap — the population it
 * finds is normally single digits.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const APPLY = process.argv.includes('--apply');
const OUT = new URL('docs/ai/new1-r9/text-unsafe-quarantine.json', ROOT);

const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });

try {
  const victims = await sql`
    SELECT s.judgment_id, j.script_quality, e.value_band, e.text_length
      FROM new1_doc_vector_stage s
      JOIN judgment_embedding_eligibility e ON e.id = s.judgment_id
      JOIN judgments j ON j.id = s.judgment_id
     WHERE e.text_safety = 'UNSAFE_VERIFIED'
     ORDER BY s.judgment_id`;

  console.log('staged rows now graded UNSAFE_VERIFIED: ' + victims.length);
  for (const v of victims) {
    console.log(`  ${v.judgment_id}  ${v.script_quality}  ${v.value_band}  ${v.text_length} chars`);
  }
  if (victims.length === 0) {
    console.log('nothing to quarantine.');
  } else if (!APPLY) {
    console.log('\ndry run — pass --apply to move them.');
  } else {
    const ids = victims.map((v) => v.judgment_id);
    const reason = new Map(victims.map((v) => [v.judgment_id, v.script_quality]));
    const list =
      'judgment_id, content_hash, court, year, member_count, text_chars, ' +
      'embedded_chars, tokens, recipe, model, embedding, created_at';
    await sql.unsafe(
      `WITH m AS (
         DELETE FROM new1_doc_vector_stage WHERE judgment_id = ANY($1::uuid[]) RETURNING ${list}
       )
       INSERT INTO new1_doc_vector_stage_refused (${list}, refused_class, quarantined_at)
       SELECT ${list}, r.reason, now() FROM m
        JOIN unnest($1::uuid[], $2::text[]) AS r(id, reason) ON r.id = m.judgment_id`,
      [ids, ids.map((id) => reason.get(id))],
    );

    // Verify by re-asking, not by trusting the statement's own success.
    const [after] = await sql`
      SELECT count(*)::bigint AS n FROM new1_doc_vector_stage s
        JOIN judgment_embedding_eligibility e ON e.id = s.judgment_id
       WHERE e.text_safety = 'UNSAFE_VERIFIED'`;
    const [stage] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;
    const [ref] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage_refused`;

    const out = {
      kind: 'new1_text_unsafe_quarantine',
      movedIds: ids,
      moved: ids.length,
      reasons: Object.fromEntries(reason),
      remainingUnsafeInStage: Number(after.n),
      stageRows: Number(stage.n),
      refusedRows: Number(ref.n),
      reversal:
        `INSERT INTO new1_doc_vector_stage (${list}) SELECT ${list} ` +
        'FROM new1_doc_vector_stage_refused WHERE judgment_id = ANY(<movedIds>)',
      at: new Date().toISOString(),
    };
    mkdirSync(new URL('docs/ai/new1-r9/', ROOT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify(out, null, 2));
  }
} finally {
  await sql.end({ timeout: 10 });
}
