/**
 * NEW2 P12 — where our treatment claims actually come from.
 *
 * The windows around treated edges are not the court speaking. They are the
 * Supreme Court Reports' HEADNOTE and its "Case Law Reference" table — the
 * reporter's editorial apparatus. That matters twice over:
 *
 *   quality  — the annotation is accurate, because an editor wrote it on purpose
 *   licence  — CLAUDE.md §6: a reporter's copy-edited version (headnotes,
 *              editorial numbering) is the part that IS protected, per
 *              Eastern Book Company v. D.B. Modak. Raw court text is not.
 *
 * So this measures the share of treatment-bearing edges whose evidence sits in
 * reporter apparatus rather than in the court's own reasoning. Read-only, and it
 * decides nothing: the licence question is the founder's.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const OUT = 'docs/ai/new2/treatment-provenance.json';
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');

/** Markers of a law-report edition, read off the documents themselves. */
const HEADNOTE = /(Case Law Reference|SUPREME COURT REPORTS|S\.C\.R\.\s*$|HEADNOTE|Head ?note)/i;
const REFERENCE_TABLE = /((referred to|relied on|followed|distinguished|overruled)\s+Para\s+\d+)/i;
const PARA_PIN = /\[Paras?\s+[\d,\s]+\]\s*\[\d{2,4}-[A-H]/i;   // [Para 20][591-D-F]
const COURT_REASONING = /(we are of the (considered )?(view|opinion)|in our (considered )?(view|opinion)|we (respectfully )?(follow|agree|hold|find)|we are bound by|this court (has|is) bound)/i;

const out = { generatedAt: new Date().toISOString(), sample: {}, by_relationship: {}, examples: [] };
try {
  const rows = await sql.unsafe(`
    select c.id, c.relationship, c.citation_text, c.evidence, c.char_offset,
           c.cited_judgment_id, j.court, j.source_document_type,
           substr(j.full_text, greatest(1, c.char_offset - 600), 600 + length(c.citation_text) + 500) as span
      from judgment_citations c join judgments j on j.id = c.citing_judgment_id
     where c.relationship <> 'cites'
     limit 400`);
  console.log('sampled treated edges:', rows.length);

  const tally = { REPORTER_HEADNOTE_APPARATUS: 0, REPORTER_REFERENCE_TABLE: 0, COURT_REASONING: 0, UNCLASSIFIED: 0 };
  const byRel = {};
  for (const r of rows) {
    const span = flat(r.span);
    let cls;
    if (REFERENCE_TABLE.test(span)) cls = 'REPORTER_REFERENCE_TABLE';
    else if (HEADNOTE.test(span) || PARA_PIN.test(span)) cls = 'REPORTER_HEADNOTE_APPARATUS';
    else if (COURT_REASONING.test(span)) cls = 'COURT_REASONING';
    else cls = 'UNCLASSIFIED';
    tally[cls] += 1;
    (byRel[r.relationship] ??= { REPORTER_HEADNOTE_APPARATUS: 0, REPORTER_REFERENCE_TABLE: 0, COURT_REASONING: 0, UNCLASSIFIED: 0 })[cls] += 1;
    if (out.examples.length < 6 && (cls === 'COURT_REASONING' || r.relationship === 'overruled')) {
      out.examples.push({ relationship: r.relationship, class: cls, citation_text: r.citation_text, evidence: r.evidence, window: span.slice(0, 420) });
    }
  }
  const n = rows.length;
  out.sample = {
    n,
    ...Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, { k: v, pct: +(v / n * 100).toFixed(2) }])),
    reporter_apparatus_total_pct: +((tally.REPORTER_HEADNOTE_APPARATUS + tally.REPORTER_REFERENCE_TABLE) / n * 100).toFixed(2),
  };
  out.by_relationship = byRel;
  console.log(JSON.stringify(out.sample, null, 1));
  console.log(JSON.stringify(byRel, null, 1));
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('written ->', OUT);
} finally { await sql.end(); }
