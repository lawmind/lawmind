/**
 * NEW2 P5b — before withdrawing ANY treatment claim, prove none of them is
 * holding up a LAW MOVED badge.
 *
 * Withdrawing an adverse treatment REMOVES a warning from an advocate. That is
 * the dangerous direction: the stale-overruled threshold is 0 and adverse
 * treatment visibility is non-gateable. So the impact check is a precondition,
 * not a formality.
 *
 * READ ONLY.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:600000,onnotice:()=>{}});
try {
  const d = JSON.parse(readFileSync('docs/ai/new2/treatment-rederivation.json','utf8'));
  const ids = d.diffs.filter(x=>x.kind==='UNREPRODUCIBLE').map(x=>x.edge_id);
  const rows = await sql`
    SELECT c.id, c.relationship, c.evidence, c.citation_text, c.cited_judgment_id,
           cited.overruled_status,
           (SELECT count(*)::int FROM judgment_citations x
             WHERE x.cited_judgment_id = c.cited_judgment_id
               AND x.relationship IN ('overruled','overruled_in_part','doubted')) AS drivers_on_target
      FROM judgment_citations c
      LEFT JOIN judgments cited ON cited.id = c.cited_judgment_id
     WHERE c.id = ANY(${ids}::uuid[])`;
  const adverse = new Set(['overruled','overruled_in_part','doubted']);
  const out = rows.map(r=>({
    edge_id:r.id, relationship:r.relationship, evidence:r.evidence,
    pinned: r.cited_judgment_id !== null,
    target_overruled_status: r.overruled_status,
    drivers_on_target: r.drivers_on_target,
    is_adverse: adverse.has(r.relationship),
    would_remove_a_badge: adverse.has(r.relationship) && r.cited_judgment_id !== null
                          && r.overruled_status !== null && r.overruled_status !== 'none'
                          && r.drivers_on_target <= 1,
  }));
  const risky = out.filter(o=>o.would_remove_a_badge);
  console.log('rows checked:', out.length);
  console.log('pinned to a target:', out.filter(o=>o.pinned).length);
  console.log('adverse relationship:', out.filter(o=>o.is_adverse).length);
  console.log('target currently carries a LAW MOVED state:', out.filter(o=>o.target_overruled_status && o.target_overruled_status!=='none').length);
  console.log('WOULD REMOVE A BADGE:', risky.length);
  for (const o of out) console.log(' ', o.edge_id.slice(0,8), o.relationship.padEnd(18), 'pinned='+o.pinned, 'status='+o.target_overruled_status, 'drivers='+o.drivers_on_target);
  writeFileSync('docs/ai/new2/treatment-correction-impact.json', JSON.stringify({generated_at:new Date().toISOString(), rows:out, would_remove_a_badge:risky.length},null,2));
  console.log('wrote docs/ai/new2/treatment-correction-impact.json');
} finally { await sql.end({timeout:10}); }
