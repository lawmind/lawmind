/**
 * NEW2 §8/NEW2-5 — summarise the passage sample FROM THE ARTEFACT.
 *
 * The sampler's own end-of-run summary is wrong after a RESUME: `docs` only
 * accumulates strata the resumed process actually queried, so a run that skipped
 * 31 checkpointed strata reported `documents: 12` and a chunks-per-document mean
 * of 110.6. The passage COUNT was right because it is read back from the JSONL;
 * every per-document figure beside it was computed from an in-memory list that
 * the resume had emptied.
 *
 * Recomputed here from `passage-sample.jsonl`, which is the artefact of record.
 * A summary derived from anything other than the file it describes is a summary
 * that can disagree with it.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const rows = readFileSync('docs/ai/new2/passage-sample.jsonl', 'utf8')
  .trim().split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));

const byDoc = new Map();
for (const r of rows) {
  if (!byDoc.has(r.judgment_id)) byDoc.set(r.judgment_id, []);
  byDoc.get(r.judgment_id).push(r);
}
const perDoc = [...byDoc.values()].map((v) => v.length).sort((a, b) => a - b);
const median = perDoc[Math.floor(perDoc.length / 2)];
const tally = (fn) => rows.reduce((a, r) => { const k = fn(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});

const docTally = (fn) => [...byDoc.values()].reduce((a, v) => { const k = fn(v[0]); a[k] = (a[k] ?? 0) + 1; return a; }, {});

const summary = {
  generated_at: new Date().toISOString(),
  source: 'docs/ai/new2/passage-sample.jsonl',
  chunker: 'services/embed/src/chunk.ts chunkJudgment @ defaultChunkOptions (2400/320/240)',
  frame: 'judgments (NOT new1_doc_vector_stage), md5(id)-ordered, full_text >= 2000, 8 courts x 4 eras',
  documents: byDoc.size,
  passages: rows.length,
  chunks_per_document: {
    mean: +(rows.length / byDoc.size).toFixed(2),
    median,
    min: perDoc[0],
    max: perDoc[perDoc.length - 1],
    p90: perDoc[Math.floor(perDoc.length * 0.9)],
  },
  /* THE NUMBER THAT MATTERS TO NEW1: how much text a passage build reads that
   * the HEAD:4800 recipe has never seen. */
  passages_beyond_head_4800: rows.filter((r) => r.beyond_head_4800).length,
  share_beyond_head_4800: +(rows.filter((r) => r.beyond_head_4800).length / rows.length).toFixed(4),
  documents_in_production_stage: [...byDoc.values()].filter((v) => v[0].in_production_stage).length,
  doc_evidence_mix: docTally((d) => d.doc_body_text_evidence),
  passages_by_doc_evidence: tally((r) => r.doc_body_text_evidence),
  by_era: tally((r) => String(r.stratum).split(' | ')[1]),
  by_court: tally((r) => r.court),
  chars: {
    mean: +(rows.reduce((a, r) => a + r.chars, 0) / rows.length).toFixed(0),
    min: Math.min(...rows.map((r) => r.chars)),
    max: Math.max(...rows.map((r) => r.chars)),
  },
  /* Damage, at PASSAGE level, against the DOCUMENT-level verdict. */
  damage: {
    passages_control_char_density_gt_0_05: rows.filter((r) => r.control_char_density > 0.05).length,
    passages_control_char_density_gt_0_2: rows.filter((r) => r.control_char_density > 0.2).length,
    passages_english_density_lt_0_5: rows.filter((r) => r.english_density < 0.5).length,
    passages_english_density_lt_0_3: rows.filter((r) => r.english_density < 0.3).length,
    passages_with_devanagari: rows.filter((r) => r.devanagari_density > 0.01).length,
  },
};

writeFileSync('docs/ai/new2/passage-sample-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
