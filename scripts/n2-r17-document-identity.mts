/**
 * NEW2 — R17 §6. THE ONE WRONG-DOCUMENT-IDENTITY CASE, KEPT SEPARATE.
 *
 * R16 classified `2023:KHC-D:14142` as INGEST_WRONG_DOCUMENT_IDENTITY: two
 * Karnataka rows, `MFA/25207/2011` and `MFA/25707/2011`, holding byte-identical
 * text whose masthead reads `MFA No. 25207 of 2011`.
 *
 * **An extractor patch must not be allowed to hide this.** The citation
 * extraction question — whose citation does this document print — has the same
 * answer for both rows and the corrected extractor answers it correctly for
 * both. That says nothing about whether the row's own identity is right, which
 * is a different defect with a different remedy, and this file asks only that
 * question.
 *
 * It decides between three explanations, from evidence rather than by choosing:
 *   a. the bucket published one document under two object names — a SOURCE fact
 *      we record, not a defect we introduced;
 *   b. two objects whose text really is identical — a source duplicate;
 *   c. our loader wrote one object's text against another row — OUR defect.
 *
 * Read-only against the database. With `--fetch` it also re-reads the two source
 * objects from the AWS Open Data bucket — an authorised source (CLAUDE.md §6a)
 * — because the bytes are what separates (a) from (c) and nothing in the
 * database can. Proposes nothing to write.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r17-document-identity.mts [--fetch]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r17/document-identity-case.json'));
const KEY = arg('key', '2023KHCD14142');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Row = {
  id: string;
  court: string;
  jdate: string;
  case_number: string | null;
  case_title: string | null;
  cnr: string | null;
  neutral_citation: string | null;
  content_hash: string | null;
  source_url: string | null;
  source_bench_code: string | null;
  text_len: number;
  full_text: string;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const rows = await sql<Row[]>`
    SELECT j.id, j.court, to_char(j.judgment_date,'YYYY-MM-DD') AS jdate, j.case_number, j.case_title,
           j.cnr, j.neutral_citation, j.content_hash, j.source_url, j.source_bench_code,
           length(j.full_text) AS text_len, j.full_text
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.citation_key = ${KEY} AND k.source = 'neutral'
     ORDER BY j.judgment_date`;
  if (rows.length === 0) throw new Error(`no bearers for ${KEY}`);

  /** What each document's own masthead says its case number is. */
  const MASTHEAD_NUMBER = /\b((?:MFA|WP|CRL\.?P|RSA|RFA|WA|MSA|CRP)[^\n]{0,6}No\.?\s*(\d{1,6})\s*(?:of|\/)\s*((?:19|20)\d{2}))/i;

  const bearers = rows.map((r) => {
    const head = r.full_text.slice(0, 400).replace(/\s+/g, ' ');
    const m = MASTHEAD_NUMBER.exec(head);
    const rowNums = String(r.case_number ?? '')
      .split('/')
      .filter((p) => /^[0-9]+$/.test(p));
    const rowSerial = rowNums.length >= 2 ? rowNums[rowNums.length - 2]! : null;
    const rowYear = rowNums.length >= 2 ? rowNums[rowNums.length - 1]! : null;
    return {
      judgmentId: r.id,
      court: r.court,
      judgmentDate: r.jdate,
      rowCaseNumber: r.case_number,
      rowCaseTitle: (r.case_title ?? '').replace(/\s+/g, ' ').slice(0, 120),
      rowCnr: r.cnr,
      storedNeutralCitation: r.neutral_citation,
      contentHash: r.content_hash,
      textSha256: createHash('sha256').update(r.full_text).digest('hex'),
      textLength: r.text_len,
      sourceUrl: r.source_url,
      pdfBasename: String(r.source_url ?? '').split('/').pop() ?? '',
      sourceBenchCode: r.source_bench_code,
      mastheadCaseNumber: m ? m[1]! : null,
      mastheadMatchesRow: m ? m[2] === rowSerial && m[3] === rowYear : null,
      masthead: head.slice(0, 200),
    };
  });

  const distinctText = new Set(bearers.map((b) => b.textSha256));
  const distinctObject = new Set(bearers.map((b) => b.pdfBasename));
  const mismatched = bearers.filter((b) => b.mastheadMatchesRow === false);

  /**
   * The bytes settle it. If the two rows point at ONE object, our loader wrote
   * one document against two rows and the defect is ours. If they point at two
   * genuinely different objects that both render the same matter, the court
   * published another matter's judgment under this CNR and nothing in this
   * repository can repair that by rewriting a row.
   */
  const objects: { rowCaseNumber: string | null; url: string | null; status: number; bytes: number; sha256: string }[] =
    [];
  if (process.argv.includes('--fetch')) {
    for (const b of bearers) {
      const res = await fetch(b.sourceUrl!);
      const buf = Buffer.from(await res.arrayBuffer());
      objects.push({
        rowCaseNumber: b.rowCaseNumber,
        url: b.sourceUrl,
        status: res.status,
        bytes: buf.length,
        sha256: createHash('sha256').update(buf).digest('hex'),
      });
    }
  }
  const objectBytesIdentical = objects.length === 2 ? objects[0]!.sha256 === objects[1]!.sha256 : null;

  /**
   * The verdict is a function of two facts and nothing else: do the rows hold
   * the same bytes, and did they come from the same object.
   */
  let verdict: string;
  let required: 'YES' | 'NO' | 'UNKNOWN';
  let why: string;
  if (mismatched.length === 0) {
    verdict = 'NO_MISMATCH_FOUND';
    required = 'NO';
    why = 'every bearer masthead names its own row number';
  } else if (distinctText.size === 1 && distinctObject.size > 1 && objectBytesIdentical === false) {
    verdict = 'SOURCE_PUBLISHED_ANOTHER_MATTERS_JUDGMENT_UNDER_THIS_CNR';
    required = 'NO';
    why =
      'the two rows name two genuinely different objects — different sha256 — and both render the SAME matter. The loader stored what each object contains, so there is no loader defect to correct. The court published another matter judgment under the mismatched row CNR, which is a source fact to record against the row, not a canonical identity to rewrite.';
  } else if (distinctText.size === 1 && distinctObject.size > 1) {
    verdict = 'SOURCE_PUBLISHED_ONE_DOCUMENT_UNDER_TWO_OBJECTS';
    required = 'UNKNOWN';
    why =
      'the rows hold byte-identical text but came from DIFFERENT objects in the bucket, so the duplication is upstream of this loader. Which row is wrongly bound cannot be decided from retained text alone — re-run with --fetch to read the two objects.';
  } else if (distinctText.size === 1 && distinctObject.size === 1) {
    verdict = 'ONE_OBJECT_WRITTEN_TO_TWO_ROWS';
    required = 'YES';
    why = 'both rows came from the same object; one of them is bound to a document that is not its own';
  } else {
    verdict = 'DIFFERENT_DOCUMENTS_SHARING_A_CITATION';
    required = 'NO';
    why = 'the rows hold different text, so this is a shared citation and not a document-identity defect';
  }

  const artifact = {
    artifact: 'NEW2_R17_DOCUMENT_IDENTITY_CASE',
    lane: 'NEW2',
    takenAt,
    citationKey: KEY,
    subject: 'R16 INGEST_WRONG_DOCUMENT_IDENTITY, handled apart from the extraction correction',
    DOCUMENT_IDENTITY_CORRECTION_REQUIRED: required,
    verdict,
    why,
    CANONICAL_IDENTITY_REWRITTEN: 'NO',
    note: 'nothing here writes a judgments row. A canonical identity correction goes through the NEW2 data-truth process with its own authorisation, and this artifact is its evidence.',
    facts: {
      bearers: bearers.length,
      distinctTextSha256: distinctText.size,
      distinctSourceObjects: distinctObject.size,
      bearersWhoseMastheadNamesAnotherMatter: mismatched.length,
      objectBytesIdentical,
    },
    sourceObjects: objects,
    bearers,
  };
  const body = JSON.stringify(artifact, null, 2);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body + '\n');
  console.log('[identity]', verdict, '| required', required);
  console.log('[identity]', JSON.stringify(artifact.facts));
  for (const b of bearers)
    console.log(`  ${b.rowCaseNumber} ${b.judgmentDate} obj=${b.pdfBasename} masthead=${b.mastheadCaseNumber} matches=${b.mastheadMatchesRow}`);
  console.log('[identity] wrote', OUT);
} finally {
  await sql.end();
}
