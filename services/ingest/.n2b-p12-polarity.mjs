/**
 * NEW2 P12 — polarity. The one defect class that inverts a treatment.
 *
 * `detectTreatment()` reads a TRAILING annotation after the citation. A trailing
 * reader that matches on the verb alone cannot see a prefix or a negation, so
 *   "…dis-approved the view taken in Babua Ram's case"
 * is recorded as APPROVED. That is not a miss, it is the opposite answer, and
 * it is the exact direction the founder named as damaging.
 *
 * This counts the inverted forms in the stored treatment population. Read-only.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const OUT = 'docs/ai/new2/treatment-polarity.json';
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');

/** Prefixes and negations that reverse the verb they sit on. */
const INVERTERS = [
  { name: 'DIS_PREFIX', re: /\bdis[-\s]?(approv|agree)/i },
  { name: 'NOT_NEGATION', re: /\b(not|never|cannot be said to be|nor)\s+(be\s+)?(followed|approved|overruled|distinguished|doubted)/i },
  { name: 'DECLINED', re: /\b(declin\w+|refus\w+)\s+to\s+(follow|approve|distinguish)/i },
  { name: 'NO_LONGER', re: /\bno longer (good law|binding)/i },
];

const out = { generatedAt: new Date().toISOString(), by_relationship: {}, total: {}, examples: [] };
try {
  const rels = ['approved', 'followed', 'overruled', 'distinguished', 'doubted', 'overruled_in_part'];
  let grand = 0; let grandInverted = 0;
  for (const rel of rels) {
    const rows = await sql.unsafe(`
      select c.id, c.citation_text, c.evidence, c.char_offset, c.cited_judgment_id, j.court,
             substr(j.full_text, greatest(1, c.char_offset - 220), 220 + length(c.citation_text) + 220) as span
        from judgment_citations c join judgments j on j.id = c.citing_judgment_id
       where c.relationship = '${rel}'
       limit 300`);
    let inverted = 0;
    const hits = {};
    for (const r of rows) {
      const s = flat(r.span);
      for (const inv of INVERTERS) {
        if (inv.re.test(s)) {
          inverted += 1;
          hits[inv.name] = (hits[inv.name] ?? 0) + 1;
          if (out.examples.length < 8) {
            out.examples.push({
              relationship: rel, inverter: inv.name, pinned: !!r.cited_judgment_id,
              citation_text: r.citation_text, evidence: r.evidence, court: r.court,
              window: s.slice(0, 340),
            });
          }
          break;
        }
      }
    }
    const n = rows.length;
    grand += n; grandInverted += inverted;
    out.by_relationship[rel] = {
      sampled: n, inverted, inverted_pct: n ? +(inverted / n * 100).toFixed(2) : null, inverters: hits,
    };
    console.log(`${rel.padEnd(20)} sampled ${String(n).padStart(4)} · INVERTED ${String(inverted).padStart(3)} (${n ? (inverted / n * 100).toFixed(2) : '-'}%)`, JSON.stringify(hits));
  }
  out.total = {
    sampled: grand, inverted: grandInverted,
    inverted_pct: +(grandInverted / grand * 100).toFixed(2),
    meaning: 'the stored relationship is the OPPOSITE of what the citing text says, or a refusal read as an adoption',
  };
  console.log('\nTOTAL', JSON.stringify(out.total));
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('written ->', OUT);
} finally { await sql.end(); }
