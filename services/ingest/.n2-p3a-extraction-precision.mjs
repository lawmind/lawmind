/**
 * NEW2 P3.A — EXTRACTION PRECISION for `judgments.neutral_citation`, measured
 * over the WHOLE citation-bearing population, not only over shared groups.
 *
 * Why this exists as a separate measurement: the shared-citation study can only
 * see contamination that happened to collide. A document that picked up a
 * cited authority's citation NOBODY else picked up sits in no duplicate group
 * at all and is invisible there. Only a random sample of the population can
 * price that, and this is the question "did this judgment actually print this
 * citation, as its own?" asked of a random draw.
 *
 * Stratified by court so a 280k-row court and a 43-row court both get read.
 * Read-only. Two stages: ids first, text second, so nothing detoasts 18.7M rows.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const OUT = 'docs/ai/new2/extraction-precision.json';
const PER_COURT = Number(process.env.PER_COURT ?? 160);

const AUTHORITY_CUES = /(reliance|relied|reported|referred|judgment of|judgement of|order of|decision of|division bench|coordinate bench|apex court|supreme court|\bvs?\.?\b|versus|\bin re\b|following|covered by|passed in)\s*[^.]{0,60}$/i;
const OWN_LABEL = /(neutral\s*citation|(^|\s)nc\s*:?\s*$|citation\s*n[o0]\.?\s*:?\s*-?\s*$)/i;
const COURT_NAME = /(HIGH COURT|SUPREME COURT|IN THE COURT)/i;
const MONTHS = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANURARY|SEPTEMEBER|ARPIL|AGT)$/i;
const codeOf = (c) => (String(c).match(/^\d{4}:([A-Za-z-]+):/) ?? [])[1] ?? '';

function roleOf(r, cite) {
  const pos = Number(r.first_pos);
  if (pos === 0) return 'ABSENT_FROM_TEXT';
  const ctx = (r.ctx ?? '').replace(/\s+/g, ' ');
  const idx = ctx.indexOf(cite);
  const before = idx > 0 ? ctx.slice(0, idx) : '';
  const tail = before.slice(-90);
  if (pos <= 6) return 'OWN_HEADER_STAMP';
  if (pos <= 260 && !COURT_NAME.test(before)) return 'OWN_HEADER_STAMP';
  if (OWN_LABEL.test(tail)) return 'OWN_LABELLED';
  const occ = Number(r.occurrences);
  const pages = Math.max(1, Math.round(Number(r.len) / 1800));
  if (occ >= 3 && occ >= pages * 0.5) return 'OWN_PAGE_STAMP';
  if (occ >= 2 && r.solo_line) return 'OWN_PAGE_STAMP';
  if (AUTHORITY_CUES.test(tail)) return 'CITED_AUTHORITY';
  if (r.solo_line) return 'SOLO_LINE_ONCE';
  return 'IN_BODY_UNLABELLED';
}
const OWN = new Set(['OWN_HEADER_STAMP', 'OWN_LABELLED', 'OWN_PAGE_STAMP']);

const TEXT_SQL = [
  'select j.id, j.court, j.case_number, j.judgment_date, j.neutral_citation, length(j.full_text) as len,',
  '       position(j.neutral_citation in j.full_text) as first_pos,',
  "       (length(j.full_text) - length(replace(j.full_text, j.neutral_citation, ''))) / greatest(length(j.neutral_citation),1) as occurrences,",
  "       j.full_text ~ ('(^|' || chr(10) || ')[ ]*(NC[ ]*:?[ ]*)?'",
  "                     || regexp_replace(j.neutral_citation, '([.^$*+?()\\[\\]{}|\\\\-])', '\\\\\\1', 'g')",
  "                     || '[ ]*(' || chr(13) || ')?($|' || chr(10) || ')') as solo_line,",
  '       substr(j.full_text, greatest(1, position(j.neutral_citation in j.full_text) - 260), 380) as ctx,',
  '       j.text_quality, j.native_text, j.text_extraction_method, j.hc_document_class',
  '  from judgments j where j.id = any($1::uuid[])',
].join('\n');

const state = { generatedAt: new Date().toISOString(), perCourt: PER_COURT, rows: [] };

try {
  await sql`set statement_timeout = 0`;

  // ---- stage A: a court-stratified id sample, no document text touched ----
  const tA = Date.now();
  const ids = await sql.unsafe(
    'select id, court from ('
    + '  select id, court, row_number() over (partition by court order by md5(id::text)) rn'
    + '    from judgments where neutral_citation is not null and neutral_citation <> \'\''
    + ') t where rn <= ' + PER_COURT,
  );
  console.log('stage A — ' + ids.length + ' ids sampled across '
    + new Set(ids.map((r) => r.court)).size + ' courts in ' + Math.round((Date.now() - tA) / 1000) + 's');

  // ---- stage B: read those documents by primary key -----------------------
  const tB = Date.now();
  for (let i = 0; i < ids.length; i += 250) {
    const batch = ids.slice(i, i + 250).map((r) => r.id);
    const rows = await sql.unsafe(TEXT_SQL, [batch]);
    for (const r of rows) {
      const cite = r.neutral_citation;
      const role = MONTHS.test(codeOf(cite)) ? 'NOT_A_CITATION' : roleOf(r, cite);
      state.rows.push({
        id: r.id,
        court: r.court,
        case_number: r.case_number,
        date: String(r.judgment_date).slice(0, 10),
        citation: cite,
        code: codeOf(cite),
        len: r.len,
        first_pos: Number(r.first_pos),
        occurrences: Number(r.occurrences),
        solo_line: r.solo_line,
        role,
        printed_as_own: OWN.has(role),
        evidence_class: Number(r.first_pos) > 0
          ? 'PRINTED_ON_DOCUMENT'
          : (r.court === 'Supreme Court of India' ? 'OFFICIAL_METADATA_ONLY' : 'NOT_FOUND'),
        text_quality: r.text_quality,
        native_text: r.native_text,
        extraction: r.text_extraction_method,
        ctx: (r.ctx ?? '').replace(/\s+/g, ' ').slice(0, 300),
      });
    }
    if (i % 2500 === 0) console.log('  stage B ' + i + '/' + ids.length);
  }
  console.log('stage B — ' + state.rows.length + ' documents read in ' + Math.round((Date.now() - tB) / 1000) + 's');

  // ---- population weights -------------------------------------------------
  const pop = await sql`select court, count(*)::int rows from judgments where neutral_citation is not null and neutral_citation <> '' group by 1`;
  const popByCourt = new Map(pop.map((p) => [p.court, p.rows]));
  const totalPop = pop.reduce((a, b) => a + b.rows, 0);

  const byCourt = {};
  for (const r of state.rows) {
    const c = (byCourt[r.court] ??= { sampled: 0, roles: {}, own: 0, cited_authority: 0, not_a_citation: 0, absent: 0 });
    c.sampled += 1;
    c.roles[r.role] = (c.roles[r.role] ?? 0) + 1;
    if (r.printed_as_own) c.own += 1;
    if (r.role === 'CITED_AUTHORITY') c.cited_authority += 1;
    if (r.role === 'NOT_A_CITATION') c.not_a_citation += 1;
    if (r.role === 'ABSENT_FROM_TEXT') c.absent += 1;
  }
  let wOwn = 0; let wCited = 0; let wNot = 0; let wAbsent = 0; let wCovered = 0;
  for (const [court, c] of Object.entries(byCourt)) {
    const p = popByCourt.get(court) ?? 0;
    c.population_rows = p;
    c.printed_as_own_pct = +((c.own / c.sampled) * 100).toFixed(2);
    c.cited_authority_pct = +((c.cited_authority / c.sampled) * 100).toFixed(2);
    c.not_a_citation_pct = +((c.not_a_citation / c.sampled) * 100).toFixed(2);
    wCovered += p;
    wOwn += (c.own / c.sampled) * p;
    wCited += (c.cited_authority / c.sampled) * p;
    wNot += (c.not_a_citation / c.sampled) * p;
    wAbsent += (c.absent / c.sampled) * p;
  }

  state.population_rows_with_neutral_citation = totalPop;
  state.by_court = byCourt;
  state.weighted = {
    printed_as_own_pct: +((wOwn / wCovered) * 100).toFixed(2),
    cited_authority_pct: +((wCited / wCovered) * 100).toFixed(2),
    not_a_citation_pct: +((wNot / wCovered) * 100).toFixed(2),
    absent_from_text_pct: +((wAbsent / wCovered) * 100).toFixed(2),
    estimated_wrong_rows: Math.round(wCited + wNot),
  };
  writeFileSync(OUT, JSON.stringify(state, null, 1));

  const tally = {};
  for (const r of state.rows) tally[r.role] = (tally[r.role] ?? 0) + 1;
  console.log('\nrole tally over the sample:');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k.padEnd(22) + String(v).padStart(6) + '  ' + ((v / state.rows.length) * 100).toFixed(2) + '%'));
  console.log('\npopulation-weighted over ' + totalPop.toLocaleString() + ' citation-bearing rows:');
  console.log(JSON.stringify(state.weighted, null, 1));
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  state.error = e.message;
  writeFileSync(OUT, JSON.stringify(state, null, 1));
  process.exitCode = 1;
}
await sql.end();
