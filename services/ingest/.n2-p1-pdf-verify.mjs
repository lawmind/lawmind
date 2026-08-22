/**
 * NEW2 P1.4, PRIMARY evidence — read the individual source PDFs themselves.
 *
 * Everything else in this study reads `judgments.full_text`, which is OUR
 * extraction of that document's own PDF. That is one inference away from the
 * addendum's primary source, so a small number of PDFs are fetched from the
 * authorised AWS Open Data bucket and re-extracted with an INDEPENDENT tool
 * (poppler `pdftotext -layout`, not the `unpdf` path ingest used), and the
 * question is asked of the paper: does this document print this citation, and
 * where on the page.
 *
 * No OCR. Image-only pages are reported as SOURCE_UNAVAILABLE_IMAGE_ONLY rather
 * than guessed at — OCR digits may not become citation truth.
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const OUT = 'docs/ai/new2/shared-neutral-pdf-evidence.json';
const DIR = join(tmpdir(), 'lawmind-n2-pdf');
mkdirSync(DIR, { recursive: true });

/** The groups chosen because each one decides a different question. */
const TARGETS = [
  { cite: '2026:PHHC:027747-DB', why: 'suspected extractor contamination — 15 judgments, each naming it as an authority they relied on', take: 4 },
  { cite: '2025:PHHC:052490-DB', why: 'suspected legitimate registry batch — 253 connected writ petitions, one common order', take: 4 },
  { cite: '2011:AUGUST:23', why: 'suspected not-a-citation — a Madras despatch stamp', take: 3 },
];

const results = { generatedAt: new Date().toISOString(), tool: 'poppler pdftotext -layout (independent of the unpdf path used at ingest)', groups: [] };

function pdftotext(path) {
  try {
    return execFileSync('pdftotext', ['-layout', '-q', path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return null;
  }
}

async function fetchPdf(url, dest) {
  if (existsSync(dest)) return { ok: true, cached: true, bytes: readFileSync(dest).length };
  const res = await fetch(url);
  if (!res.ok) return { ok: false, status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  // A soft 404 here serves 200 with a tiny HTML body under a PDF content type,
  // so the magic bytes are checked rather than the status line.
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, status: res.status, notPdf: true, bytes: buf.length, head: buf.subarray(0, 80).toString('latin1') };
  }
  writeFileSync(dest, buf);
  return { ok: true, bytes: buf.length };
}

try {
  for (const t of TARGETS) {
    const rows = await sql`
      select id, case_number, judgment_date, source_url, length(full_text) as len,
             position(${t.cite} in full_text) as our_pos
        from judgments
       where neutral_citation = ${t.cite}
       order by judgment_date
       limit ${t.take}`;
    const group = { citation: t.cite, why: t.why, documents: [] };
    for (const r of rows) {
      const dest = join(DIR, r.id + '.pdf');
      const got = await fetchPdf(r.source_url, dest);
      if (!got.ok) {
        group.documents.push({ case_number: r.case_number, source_url: r.source_url, evidence_class: 'SOURCE_UNAVAILABLE', fetch: got });
        continue;
      }
      const text = pdftotext(dest);
      if (text === null) {
        group.documents.push({ case_number: r.case_number, source_url: r.source_url, evidence_class: 'SOURCE_UNAVAILABLE', note: 'pdftotext failed' });
        continue;
      }
      const stripped = text.replace(/\s+/g, ' ');
      if (stripped.trim().length < 40) {
        group.documents.push({ case_number: r.case_number, source_url: r.source_url, evidence_class: 'SOURCE_UNAVAILABLE_IMAGE_ONLY', note: 'no extractable text layer; NOT OCR-ed, per the addendum' });
        continue;
      }
      const idx = stripped.indexOf(t.cite);
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const lineIdx = lines.findIndex((l) => l.includes(t.cite));
      group.documents.push({
        case_number: r.case_number,
        judgment_date: String(r.judgment_date).slice(0, 10),
        source_url: r.source_url,
        pdf_bytes: got.bytes,
        pdf_chars: text.length,
        our_full_text_chars: r.len,
        our_position: Number(r.our_pos),
        evidence_class: idx >= 0 ? 'PRINTED_ON_DOCUMENT' : 'NOT_FOUND',
        pdf_position: idx,
        pdf_line_index: lineIdx,
        pdf_total_lines: lines.length,
        pdf_line: lineIdx >= 0 ? lines[lineIdx].slice(0, 200) : null,
        pdf_first_line: lines[0]?.slice(0, 120) ?? null,
        pdf_context: idx >= 0 ? stripped.slice(Math.max(0, idx - 220), idx + t.cite.length + 90) : null,
      });
    }
    results.groups.push(group);
    console.log('--- ' + t.cite + ' (' + t.why + ')');
    for (const d of group.documents) {
      console.log('  ' + String(d.case_number).padEnd(20) + d.evidence_class.padEnd(28)
        + (d.pdf_line_index !== undefined && d.pdf_line_index !== null && d.pdf_line_index >= 0
          ? 'line ' + (d.pdf_line_index + 1) + '/' + d.pdf_total_lines : ''));
      if (d.pdf_line) console.log('        LINE : ' + d.pdf_line);
      if (d.pdf_context) console.log('        CTX  : ' + d.pdf_context.slice(0, 230));
      if (d.fetch) console.log('        FETCH: ' + JSON.stringify(d.fetch));
    }
  }
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log('written ' + OUT);
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  results.error = e.message;
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  process.exitCode = 1;
}
await sql.end();
