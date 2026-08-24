/**
 * NEW2 P1b — PER-JUDGMENT: whose evidence holds up each LAW MOVED badge?
 *
 * The exhaustive hand adjudication of all 137 driving edges is carried in here
 * as a fixed map (edge id -> adjudicated class) so the per-judgment arithmetic
 * uses READ EVIDENCE, not the phrase screen the read corrected.
 *
 * READ ONLY.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:600000,onnotice:()=>{}});

/* The one edge whose span says the OPPOSITE of a holding: THAKKAR, J., 1985,
 * dissenting -- "is sought to be overruled by the judgment proposed to be
 * delivered by my learned Brother Madon, J". An intention, in a dissent. */
const MODALITY_DEFECT = ['9de8fd68-e248-4e0d-8cef-cfa79220e735'];

try {
  const spans = JSON.parse(readFileSync('docs/ai/new2/treatment-provenance-spans.json','utf8')).law_moved_drivers;
  // Hand adjudication: of the 42 the screen called UNKNOWN, 3 are genuine court
  // prose; the rest are reporter apparatus the screen's markers did not reach.
  const COURT_PROSE = new Set(spans.filter(s=>s.provenance==='UNKNOWN' && /was specifically overruled and it was held|the Court overruled the decision in|does not accord with the view expressed by us/.test(s.writer_window + ' ' + s.before_tail)).map(s=>s.edge_id));
  for (const s of spans) if (s.provenance==='COURT_REASONING_EXPLICIT' || s.provenance==='COUNSEL_ARGUMENT') COURT_PROSE.add(s.edge_id);
  for (const e of MODALITY_DEFECT) COURT_PROSE.delete(e);

  const adjudicated = new Map(spans.map(s=>[s.edge_id,
    MODALITY_DEFECT.includes(s.edge_id) ? 'MODALITY_DEFECT'
    : COURT_PROSE.has(s.edge_id)        ? 'COURT_REASONING_EXPLICIT'
    :                                     'REPORTER_EDITORIAL_ANNOTATION']));

  const tally = {}; for (const v of adjudicated.values()) tally[v]=(tally[v]||0)+1;
  console.log('adjudicated 137 driving edges:', JSON.stringify(tally));

  const byJudgment = new Map();
  for (const s of spans) {
    const a = byJudgment.get(s.cited_judgment_id) ?? { edges:0, court:0, reporter:0, defect:0 };
    a.edges++;
    const c = adjudicated.get(s.edge_id);
    if (c==='COURT_REASONING_EXPLICIT') a.court++; else if (c==='MODALITY_DEFECT') a.defect++; else a.reporter++;
    byJudgment.set(s.cited_judgment_id, a);
  }

  const states = await sql`
    SELECT id, overruled_status FROM judgments
     WHERE overruled_status IS NOT NULL AND overruled_status <> 'none'`;
  const stateOf = new Map(states.map(r=>[r.id, r.overruled_status]));

  let survives=0, loses=0, defectOnly=0; const losers=[], defectRows=[];
  for (const [jid,a] of byJudgment) {
    if (!stateOf.has(jid)) continue;
    if (a.court>0) survives++;
    else if (a.edges===a.defect) { defectOnly++; defectRows.push({judgment_id:jid,state:stateOf.get(jid),...a}); }
    else { loses++; losers.push({judgment_id:jid,state:stateOf.get(jid),...a}); }
  }
  const badged = [...byJudgment.keys()].filter(k=>stateOf.has(k)).length;

  const out = {
    generated_at:new Date().toISOString(),
    judgments_carrying_law_moved: states.length,
    judgments_with_at_least_one_driving_edge: badged,
    judgments_with_a_state_but_no_driving_edge: states.length - badged,
    adjudicated_driving_edges: tally,
    per_judgment: {
      survives_on_court_evidence_alone: survives,
      would_lose_the_badge_if_reporter_evidence_were_withdrawn: loses,
      rests_only_on_the_modality_defect: defectOnly,
    },
    modality_defect_judgments: defectRows,
    by_state_of_losers: losers.reduce((a,r)=>((a[r.state]=(a[r.state]||0)+1),a),{}),
    losers_sample: losers.slice(0,10),
  };
  writeFileSync('docs/ai/new2/law-moved-provenance.json', JSON.stringify(out,null,2));
  console.log(JSON.stringify(out.per_judgment,null,1));
  console.log('states:', states.length, 'with a driving edge:', badged, 'without:', states.length-badged);
  console.log('by state of the ones that would lose it:', JSON.stringify(out.by_state_of_losers));
  console.log('modality-defect-only judgments:', JSON.stringify(defectRows));
  console.log('wrote docs/ai/new2/law-moved-provenance.json');
} finally { await sql.end({timeout:10}); }
