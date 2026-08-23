/**
 * NEW2 P0 — PRIMARY-SOURCE validation of the claimed UNIQUE targets.
 *
 * Every other check in the truth set reads `judgments.full_text`, which is OUR
 * extraction of a PDF. For a claim of the form "this reference resolves to
 * exactly this judgment" that is one inference short of the paper. So a bounded
 * set of UNIQUE records is checked against the source PDFs themselves with an
 * INDEPENDENT extractor (poppler, not the unpdf path ingest used):
 *
 *   1. does the CITING document print this reference?
 *   2. does the TARGET document print this citation as its own?
 *
 * Both must hold before a UNIQUE claim is marked primary_source_checked.
 * No OCR: an image-only page is SOURCE_UNAVAILABLE_IMAGE_ONLY, never a guess.
 */
import postgres from 'postgres';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 120000 });
const OUT = 'docs/ai/new2/citation-truth-set-v2.json';
const REPORT = 'docs/ai/new2/citation-truth-primary-evidence.json';
const DIR = join(tmpdir(), 'lawmind-n2b-pdf');
mkdirSync(DIR, { recursive: true });
const MAX_RECORDS = Number(process.env.MAX_RECORDS ?? 26);

const state = JSON.parse(readFileSync(OUT, 'utf8'));

function pdftotext(path) {
  try { return execFileSync('pdftotext', ['-layout', '-q', path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return null; }
}
async function fetchPdf(url, dest) {
  if (!url) return { ok: false, reason: 'NO_SOURCE_URL' };
  if (existsSync(dest)) return { ok: true, cached: true, bytes: readFileSync(dest).length };
  let res;
  try { res = await fetch(url); } catch (e) { return { ok: false, reason: 'FETCH_FAILED', message: e.message }; }
  if (!res.ok) return { ok: false, reason: 'HTTP_' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  // A soft 404 serves 200 with a tiny HTML body under a PDF content type.
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, reason: 'SOFT_404_NOT_PDF', bytes: buf.length };
  }
  writeFileSync(dest, buf);
  return { ok: true, bytes: buf.length };
}
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');

const unique = state.records.filter((r) => r.relationship === 'UNIQUE' && r.source_evidence.source_pdf);
const picked = unique.slice(0, MAX_RECORDS);
console.log('UNIQUE records:', unique.length, '· checking against paper:', picked.length);

const report = {
  generatedAt: new Date().toISOString(),
  truth_set_version: state.truth_set_version,
  tool: 'poppler pdftotext -layout, independent of the unpdf path used at ingest',
  checked: 0, citing_confirmed: 0, target_confirmed: 0, both_confirmed: 0,
  source_unavailable: 0, contradicted: 0, records: [],
};

try {
  for (const rec of picked) {
    const row = { truth_id: rec.truth_id, raw_reference: rec.raw_reference, stratum: rec.stratum };
    // --- 1 · the citing document ------------------------------------------
    const citingDest = join(DIR, rec.source_judgment_id + '.pdf');
    const gotCiting = await fetchPdf(rec.source_evidence.source_pdf, citingDest);
    if (!gotCiting.ok) {
      row.citing = { evidence_class: 'SOURCE_UNAVAILABLE', ...gotCiting };
    } else {
      const text = pdftotext(citingDest);
      const stripped = flat(text);
      if (!text || stripped.trim().length < 40) {
        row.citing = { evidence_class: 'SOURCE_UNAVAILABLE_IMAGE_ONLY', note: 'no extractable text layer; NOT OCR-ed' };
      } else {
        const needle = flat(rec.raw_reference).trim();
        const idx = stripped.indexOf(needle);
        row.citing = {
          evidence_class: idx >= 0 ? 'PRINTED_ON_DOCUMENT' : 'NOT_FOUND',
          pdf_position: idx,
          pdf_chars: text.length,
          context: idx >= 0 ? stripped.slice(Math.max(0, idx - 160), idx + needle.length + 80) : null,
        };
      }
    }
    // --- 2 · the target document ------------------------------------------
    const targetId = rec.correct_target_ids[0];
    const [t] = targetId
      ? await sql`select id, source_url, case_title, neutral_citation, case_number from judgments where id = ${targetId}`
      : [];
    if (!t) {
      row.target = { evidence_class: 'SOURCE_UNAVAILABLE', reason: 'NO_TARGET_ROW' };
    } else {
      const tDest = join(DIR, t.id + '.pdf');
      const gotT = await fetchPdf(t.source_url, tDest);
      if (!gotT.ok) {
        row.target = { evidence_class: 'SOURCE_UNAVAILABLE', ...gotT };
      } else {
        const text = pdftotext(tDest);
        const stripped = flat(text);
        if (!text || stripped.trim().length < 40) {
          row.target = { evidence_class: 'SOURCE_UNAVAILABLE_IMAGE_ONLY' };
        } else {
          const needle = flat(rec.raw_reference).trim();
          const idx = stripped.indexOf(needle);
          const num = t.case_number ? stripped.toUpperCase().includes(String(t.case_number).toUpperCase()) : false;
          row.target = {
            evidence_class: idx >= 0 ? 'PRINTS_THIS_CITATION_AS_ITS_OWN'
              : num ? 'CASE_NUMBER_MATCHES_CITATION_NOT_PRINTED' : 'NOT_FOUND',
            pdf_position: idx,
            case_number_on_paper: num,
            case_title: (t.case_title ?? '').slice(0, 100),
            context: idx >= 0 ? stripped.slice(Math.max(0, idx - 120), idx + needle.length + 60) : null,
          };
        }
      }
    }

    const citingOk = row.citing?.evidence_class === 'PRINTED_ON_DOCUMENT';
    const targetOk = row.target?.evidence_class === 'PRINTS_THIS_CITATION_AS_ITS_OWN';
    row.verdict = citingOk && targetOk ? 'PRIMARY_SOURCE_CONFIRMED'
      : (row.citing?.evidence_class?.startsWith('SOURCE_UNAVAILABLE') || row.target?.evidence_class?.startsWith('SOURCE_UNAVAILABLE'))
        ? 'SOURCE_UNAVAILABLE'
        : (row.citing?.evidence_class === 'NOT_FOUND' || row.target?.evidence_class === 'NOT_FOUND')
          ? 'NOT_CONFIRMED_ON_PAPER'
          : 'PARTIAL';
    report.checked += 1;
    if (citingOk) report.citing_confirmed += 1;
    if (targetOk) report.target_confirmed += 1;
    if (row.verdict === 'PRIMARY_SOURCE_CONFIRMED') report.both_confirmed += 1;
    if (row.verdict === 'SOURCE_UNAVAILABLE') report.source_unavailable += 1;
    if (row.verdict === 'NOT_CONFIRMED_ON_PAPER') report.contradicted += 1;
    report.records.push(row);

    // write the verdict back onto the truth record
    rec.source_evidence.primary_source_checked = true;
    rec.primary_source_verdict = row.verdict;

    console.log(`${rec.truth_id} ${String(rec.raw_reference).slice(0, 26).padEnd(28)} citing=${row.citing?.evidence_class ?? '-'} target=${row.target?.evidence_class ?? '-'} -> ${row.verdict}`);
    writeFileSync(REPORT, JSON.stringify(report, null, 1));
    writeFileSync(OUT, JSON.stringify(state, null, 1));
  }
  writeFileSync(REPORT, JSON.stringify(report, null, 1));
  writeFileSync(OUT, JSON.stringify(state, null, 1));
  console.log('\nchecked', report.checked, '| citing printed', report.citing_confirmed,
    '| target prints its own', report.target_confirmed, '| BOTH', report.both_confirmed,
    '| source unavailable', report.source_unavailable, '| not confirmed', report.contradicted);
} finally { await sql.end(); }
