/**
 * NEW2 P6 — is there a COURT-ISSUED substantive signal that does not need the
 * document to be popular?
 *
 * Reading the train half by hand turned one up that is not our inference at all:
 * several High Courts stamp their own orders
 *
 *     Whether reportable?          Yes / No
 *     Whether reasoned/speaking?   Yes / No
 *
 * That is the registry's own classification of the order, printed on the paper.
 * If it is both common enough and honest enough, it is exactly what the founder
 * asked for: a positive class that does not ask whether anyone has cited the
 * document yet.
 *
 * This measures prevalence and the Yes/No split. It does NOT decide precision —
 * that is the held-out half, read separately.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000,
});
const OUT = 'docs/ai/new2/reportable-stamp-census.json';

const out = { generatedAt: new Date().toISOString(), sample: {}, by_court: {}, examples: [] };
try {
  /* Bounded: a system sample, not a corpus scan. The stamp appears near the end
   * of the document, so the last 1,200 characters are enough to find it. */
  const rows = await sql.unsafe(`
    SELECT id, court, length(full_text) AS chars, hc_document_class,
           right(full_text, 1400) AS tail
      FROM judgments TABLESAMPLE SYSTEM (0.25) REPEATABLE (11)
     WHERE full_text IS NOT NULL AND length(full_text) > 400
     LIMIT 30000`);
  console.log('sampled', rows.length);

  const STAMP = /whether\s+report\s*able\s*[?:\s]*\s*(yes|no)/i;
  const SPEAKING = /whether\s+(reasoned|speaking)[^?]*[?:\s]*\s*(yes|no)/i;
  let stamped = 0; let yes = 0; let no = 0; let speakingYes = 0;
  const byCourt = {};
  for (const r of rows) {
    const t = String(r.tail ?? '').replace(/\s+/g, ' ');
    const m = t.match(STAMP);
    if (!m) continue;
    stamped += 1;
    const v = (m[1] ?? '').toLowerCase();
    if (v === 'yes') yes += 1; else no += 1;
    const s = t.match(SPEAKING);
    if (s && (s[2] ?? '').toLowerCase() === 'yes') speakingYes += 1;
    const c = (byCourt[r.court] ??= { stamped: 0, yes: 0, no: 0 });
    c.stamped += 1;
    if (v === 'yes') c.yes += 1; else c.no += 1;
    if (out.examples.length < 6 && v === 'yes') {
      out.examples.push({ id: r.id, court: r.court, chars: r.chars, hc_document_class: r.hc_document_class, stamp: m[0], tail: t.slice(-320) });
    }
  }

  out.sample = {
    n: rows.length,
    documents_carrying_the_stamp: stamped,
    stamp_prevalence_pct: +((stamped / rows.length) * 100).toFixed(3),
    reportable_yes: yes,
    reportable_no: no,
    yes_share_of_stamped_pct: stamped ? +((yes / stamped) * 100).toFixed(2) : null,
    also_reasoned_speaking_yes: speakingYes,
    note: 'a stamp read off the last 1,400 characters; a document that carries it elsewhere is undercounted, so prevalence is a floor',
  };
  out.by_court = Object.fromEntries(
    Object.entries(byCourt).sort((a, b) => b[1].stamped - a[1].stamped).slice(0, 12),
  );
  console.log(JSON.stringify(out.sample, null, 1));
  console.log(JSON.stringify(out.by_court, null, 1));
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('written ->', OUT);
} finally { await sql.end(); }
