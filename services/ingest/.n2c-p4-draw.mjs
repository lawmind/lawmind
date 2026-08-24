/**
 * NEW2 P4 — pull adjudication material for the uncited-authority study V2.
 *
 * Two things this session adds to V1:
 *
 *  1. NEW1's stratified frame is USED rather than admired. Ids come from its
 *     `draws`, so the estimator in ELIGIBILITY_SAMPLING_FRAME.md §5 applies
 *     and the two strata are never pooled unweighted.
 *
 *  2. A CONTROL the study has never had: the same adjudication run over
 *     documents the gate ADMITS (2,000-3,000 chars, still uncited). Without it,
 *     "3.75% of refused documents are substantive" has nothing to be compared
 *     to -- if admitted documents score the same, the gate separates nothing and
 *     the whole framing is wrong. A study with no control cannot find that out.
 *
 * READ ONLY.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:2,prepare:false,statement_timeout:900000,idle_timeout:0,onnotice:()=>{}});
const N_RESIDUAL = Number(process.env.N_RESIDUAL ?? 60);
const N_MARKER   = Number(process.env.N_MARKER   ?? 40);
const N_CONTROL  = Number(process.env.N_CONTROL  ?? 40);

const head = (t,n=900) => String(t??'').replace(/\s+/g,' ').trim().slice(0,n);

try {
  const frame = JSON.parse(readFileSync('docs/ai/new1-tier-a/eligibility-sampling-frame.json','utf8'));
  // Take from the FRONT of each draw list: the frame states the lists are
  // ordered by md5(id), so a prefix is a reproducible random subsample and a
  // later session can extend it by taking more of the same list.
  const residual = frame.draws.RESIDUAL_NO_NEGATIVE_MARKER.slice(0, N_RESIDUAL);
  const marker   = frame.draws.MARKER_CARRYING.slice(0, N_MARKER);

  const fetch = (ids, stratum) => sql`
    SELECT j.id, j.court, j.judgment_date::text AS judgment_date, j.case_number, j.case_title,
           j.hc_document_class, j.disposal_nature, length(j.full_text) AS chars,
           j.full_text
      FROM judgments j WHERE j.id = ANY(${ids}::uuid[])`.then(rs => rs.map(r => ({ stratum, ...r })));

  const [a, b] = await Promise.all([fetch(residual,'RESIDUAL_NO_NEGATIVE_MARKER'), fetch(marker,'MARKER_CARRYING')]);

  /* The control. Same identity/text axes, same "nothing cites it", but ABOVE the
   * 2,000-character gate -- i.e. documents LawMind already treats as eligible.
   * Ordered by md5(id) for the same reproducibility the frame uses. */
  const control = await sql`
    SELECT j.id, j.court, j.judgment_date::text AS judgment_date, j.case_number, j.case_title,
           j.hc_document_class, j.disposal_nature, length(j.full_text) AS chars, j.full_text
      FROM judgment_embedding_eligibility e
      JOIN judgments j ON j.id = e.id
     WHERE e.axis_a_identity AND e.axis_b_text
       AND NOT e.is_cited_authority
       AND e.text_length >= 2000 AND e.text_length < 3000
     ORDER BY md5(j.id::text)
     LIMIT ${N_CONTROL}`;

  const rows = [...a, ...b, ...control.map(r => ({ stratum:'CONTROL_ABOVE_GATE_2000_3000', ...r }))];
  const out = rows.map((r,i) => ({
    seq: i+1, stratum: r.stratum, id: r.id, court: r.court, judgment_date: r.judgment_date,
    case_number: r.case_number, case_title: r.case_title,
    hc_document_class: r.hc_document_class, disposal_nature: r.disposal_nature,
    chars: r.chars, text_head: head(r.full_text, 1100),
    label: null, label_reason: null,
  }));
  writeFileSync('docs/ai/new2/uncited-authority-frame-v2.json', JSON.stringify({
    generated_at: new Date().toISOString(),
    source_frame: 'docs/ai/new1-tier-a/eligibility-sampling-frame.json',
    draw_rule: 'prefix of NEW1 draw lists (ordered by md5(id)); control ordered by md5(id) over the admitted band',
    counts: { RESIDUAL_NO_NEGATIVE_MARKER: a.length, MARKER_CARRYING: b.length, CONTROL_ABOVE_GATE_2000_3000: control.length },
    labelling_rule: 'SUBSTANTIVE = the court decided a contested question ON ITS MERITS and gave a reason another case could use. Application of settled law to facts is NOT a decision of law.',
    documents: out,
  }, null, 1));
  console.log('counts', JSON.stringify({residual:a.length, marker:b.length, control:control.length}));
  console.log('wrote docs/ai/new2/uncited-authority-frame-v2.json');
} finally { await sql.end({timeout:10}); }
