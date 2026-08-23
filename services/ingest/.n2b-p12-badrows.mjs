import postgres from 'postgres';
import { writeFileSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');
const rows = await sql`
  select c.id, c.citing_judgment_id, c.cited_judgment_id, c.citation_text, c.evidence, c.char_offset, j.court, j.case_title,
         substr(j.full_text, c.char_offset, length(c.citation_text) + 60) as ahead
    from judgment_citations c join judgments j on j.id = c.citing_judgment_id
   where c.relationship = 'approved'`;
const bad = [];
for (const r of rows) {
  const a = flat(r.ahead);
  if (/dis[-–—]\s*approved/i.test(a)) bad.push({
    edge_id: r.id, citing_judgment_id: r.citing_judgment_id, cited_judgment_id: r.cited_judgment_id,
    citation_text: r.citation_text, stored_evidence: r.evidence, court: r.court,
    case_title: (r.case_title||'').slice(0,90), text_after_citation: a.slice(0, 130),
  });
}
console.log('approved rows total:', rows.length, '| polarity-inverted:', bad.length);
writeFileSync('docs/ai/new2/treatment-polarity-bad-rows.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  defect: 'MARKER_RE read the hyphen inside "dis-approved" as the annotation dash; fixed in services/ingest/src/citations.ts by a (?<![A-Za-z]) lookbehind, 23 Aug 2026',
  approved_rows_total: rows.length, inverted_rows: bad.length,
  inverted_pct: +(bad.length / rows.length * 100).toFixed(2),
  propagation: "approved is NOT in propagate-treatment.ts's IN ('overruled','overruled_in_part','doubted'), so no judgments.overruled_status and no LAW MOVED badge was ever driven by these rows",
  corrected_in_database: false,
  rows: bad,
}, null, 1));
for (const b of bad) console.log('\n', b.edge_id, '|', b.citation_text, '|', b.text_after_citation);
await sql.end();
