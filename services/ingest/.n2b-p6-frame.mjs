/**
 * NEW2 P6 — the uncited-authority frame, drawn BLIND.
 *
 * NEW1 (bus 1049) measured 40.09% of the corpus unreachable solely for want of
 * an inbound citation, and decomposed it: 39.25% is the <2,000-character LENGTH
 * gate, 0.84% is the refused-CLASS gate. The length gate is 47x the class gate.
 *
 * The founder's question is whether a HIGH-PRECISION positive class —
 * SUBSTANTIVE_DECISION_VERIFIED — can be built that does not need a document to
 * be popular, WITHOUT converting ordinary procedural orders into authority.
 *
 * This draws the frame and nothing else. It carries NO label and NO candidate
 * rule's verdict, because a frame that arrives pre-labelled by the thing under
 * test measures the labeller. Labels are added in a second pass, from the
 * primary text, and the rule is tested on a held-out half that was never read
 * while the rule was being written.
 *
 * Read-only.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000,
});
const OUT = 'docs/ai/new2/uncited-authority-frame.json';
const N = Number(process.env.N ?? 80);

try {
  /* The population NEW1's counterfactual names: otherwise-eligible, short, and
   * with no inbound citation. Identity and text axes must PASS, or the document
   * is refused for a reason that has nothing to do with being uncited. */
  /* TABLESAMPLE first, predicate second. `ORDER BY md5(id)` over the whole
   * qualifying set sorts tens of millions of rows and never returns on a
   * contended box — the first attempt at this frame did exactly that. A
   * system sample is still unrelated to every property under test. */
  const rows = await sql`
    SELECT j.id, j.court, j.judgment_date::text AS judgment_date, j.case_number,
           j.case_title, j.hc_document_class, j.hc_class_method,
           j.disposal_nature, j.script_quality, j.text_quality,
           length(j.full_text) AS chars,
           j.full_text AS text
      FROM judgments j TABLESAMPLE SYSTEM (0.35) REPEATABLE (7)
     WHERE length(j.full_text) BETWEEN 400 AND 1999
       AND j.content_hash IS NOT NULL
       AND j.case_number IS NOT NULL
       AND j.judgment_date IS NOT NULL
       AND j.court IS NOT NULL
       AND length(coalesce(j.case_title,'')) > 3
       AND coalesce(j.text_quality, 0) >= 0.85
       AND (j.script_quality IS NULL OR j.script_quality IN ('clean','mixed_script_ok'))
       AND NOT EXISTS (SELECT 1 FROM judgment_citations c WHERE c.cited_judgment_id = j.id)
     LIMIT ${N}`;

  console.log('frame drawn:', rows.length);
  const frame = {
    generatedAt: new Date().toISOString(),
    question:
      'among documents refused ONLY for being short and uncited, what share are substantive authorities — and can a positive rule find them at high precision?',
    population_predicate:
      'length(full_text) BETWEEN 400 AND 1999 AND identity+text axes pass AND no inbound citation',
    drawn_by: 'TABLESAMPLE SYSTEM (0.35) REPEATABLE (7), then the predicate — reproducible, and unrelated to any property under test',
    n: rows.length,
    split: {
      train: rows.slice(0, Math.floor(rows.length / 2)).map((r) => r.id),
      heldout: rows.slice(Math.floor(rows.length / 2)).map((r) => r.id),
      note: 'the held-out half is not read while the candidate rule is written',
    },
    documents: rows.map((r, i) => ({
      seq: i + 1,
      split: i < Math.floor(rows.length / 2) ? 'train' : 'heldout',
      id: r.id,
      court: r.court,
      judgment_date: r.judgment_date,
      case_number: r.case_number,
      case_title: (r.case_title ?? '').slice(0, 140),
      hc_document_class: r.hc_document_class,
      hc_class_method: r.hc_class_method,
      disposal_nature: r.disposal_nature,
      chars: r.chars,
      text: String(r.text ?? '').replace(/\s+/g, ' ').trim(),
      label: null,
      label_reason: null,
    })),
  };
  writeFileSync(OUT, JSON.stringify(frame, null, 1));

  const byClass = {};
  for (const r of rows) byClass[r.hc_document_class ?? '<NULL>'] = (byClass[r.hc_document_class ?? '<NULL>'] ?? 0) + 1;
  console.log('hc_document_class in the frame:', JSON.stringify(byClass));
  console.log('written ->', OUT);
} finally { await sql.end(); }
