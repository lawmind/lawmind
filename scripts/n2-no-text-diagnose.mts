/**
 * NEW2 — R10 §1. WHY 10,308 FETCHED PDFs YIELDED NO TEXT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING THAT MADE THIS NECESSARY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `n2-terminal-reverify.mts` probed the ledger's terminal marks against the live
 * bucket. Every `pdf_absent` stratum came back confirmed — the objects really are
 * gone or really are soft-404s. **Every `no_text` stratum came back 100%
 * PRESENT**: 410 of 410 sampled objects are live, real PDFs with `%PDF` magic
 * bytes, and 3,709 of them are marked `permanent`.
 *
 * A `permanent` mark is a claim that the SOURCE cannot supply the record. For a
 * `no_text` row that claim is false by construction: we fetched the artifact
 * successfully and our own extraction produced nothing. It is our failure filed
 * under the publisher's name, and it inflates `accounted_upstream`.
 *
 * The founder's rule is explicit — a failure that clusters by court, object,
 * parser or source pattern is a defect to diagnose, never a cluster to
 * terminalise. **9,919 of the 10,308 `no_text` rows are one court**, Punjab and
 * Haryana (3_22). That is the definition of a cluster.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SEPARATES, AND WHY THE TWO ANSWERS DEMAND OPPOSITE WORK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   IMAGE_ONLY      the PDF has pages and no text layer. A scan. Extraction was
 *                   right to return nothing, the record is recoverable only by
 *                   OCR, and it is NOT a pipeline defect — it is a known cost.
 *   TEXT_PRESENT    the PDF has an extractable text layer and our extractor
 *                   still returned nothing. **A real extraction defect**, and the
 *                   record is recoverable today by re-running the loader.
 *   ENCRYPTED       the PDF is password-protected or has a permissions handler.
 *   MALFORMED       the parser throws on the bytes.
 *
 * `unpdf` is the extractor the loader uses, so it is the extractor asked here.
 * Measuring with a different library would answer a different question — whether
 * SOME tool can read it — when the question is whether OURS can.
 *
 * Network only. Reads the database for the sample. Writes one artifact.
 *
 * Usage:
 *   tsx scripts/n2-no-text-diagnose.mts [--sample 60] [--out docs/ai/new2-r10/no-text-diagnosis.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const SAMPLE = Number(arg('sample', '60'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r10/no-text-diagnosis.json'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Diagnosis = 'IMAGE_ONLY' | 'TEXT_PRESENT' | 'ENCRYPTED' | 'MALFORMED' | 'FETCH_FAILED';

const { extractText, getDocumentProxy } = (await import(
  '../services/ingest/node_modules/unpdf/dist/index.mjs'
)) as {
  extractText: (d: unknown, o?: { mergePages?: boolean }) => Promise<{ totalPages: number; text: string }>;
  getDocumentProxy: (b: Uint8Array) => Promise<unknown>;
};

async function diagnose(url: string): Promise<{
  diagnosis: Diagnosis;
  pages: number | null;
  chars: number | null;
  bytes: number;
  error: string | null;
}> {
  let bytes = 0;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-notext/1.0' } });
    if (!res.ok) return { diagnosis: 'FETCH_FAILED', pages: null, chars: null, bytes: 0, error: `HTTP ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    bytes = buf.byteLength;
    if (Buffer.from(buf.subarray(0, 5)).toString('latin1') !== '%PDF-') {
      return { diagnosis: 'FETCH_FAILED', pages: null, chars: null, bytes, error: 'not a PDF (soft 404)' };
    }
    const doc = await getDocumentProxy(buf);
    const { totalPages, text } = await extractText(doc, { mergePages: true });
    const chars = (Array.isArray(text) ? text.join('') : text).trim().length;
    /*
     * The threshold is deliberately low. The question is not "is this a good
     * extraction" but "did the text layer exist at all" — a page of running
     * headers alone is still a text layer, and calling it IMAGE_ONLY would
     * misfile a real extraction defect as a scanning cost.
     */
    return {
      diagnosis: chars > 40 ? 'TEXT_PRESENT' : 'IMAGE_ONLY',
      pages: totalPages,
      chars,
      bytes,
      error: null,
    };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return {
      diagnosis: /password|encrypt/i.test(msg) ? 'ENCRYPTED' : 'MALFORMED',
      pages: null,
      chars: null,
      bytes,
      error: msg.slice(0, 200),
    };
  }
}

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const population = await sql<{ court_code: string; permanent: boolean; n: string }[]>`
    SELECT court_code, permanent, count(*)::text AS n
      FROM hc_ingest_ledger WHERE outcome = 'no_text'
     GROUP BY 1, 2 ORDER BY count(*) DESC`;

  const strata: Record<string, unknown>[] = [];
  for (const p of population) {
    if (Number(p.n) < 5) continue;
    const rows = await sql<{ source_url: string }[]>`
      SELECT source_url FROM hc_ingest_ledger
       WHERE outcome = 'no_text' AND court_code = ${p.court_code} AND permanent = ${p.permanent}
       ORDER BY md5(source_url) LIMIT ${SAMPLE}`;
    const tally: Record<Diagnosis, number> = {
      IMAGE_ONLY: 0,
      TEXT_PRESENT: 0,
      ENCRYPTED: 0,
      MALFORMED: 0,
      FETCH_FAILED: 0,
    };
    const examples: unknown[] = [];
    let pagesSum = 0;
    let pagesN = 0;
    for (const r of rows) {
      const d = await diagnose(r.source_url);
      tally[d.diagnosis]++;
      if (d.pages) {
        pagesSum += d.pages;
        pagesN++;
      }
      if (examples.length < 6) examples.push({ url: r.source_url, ...d });
    }
    strata.push({
      court: p.court_code,
      permanent: p.permanent,
      population: Number(p.n),
      sampled: rows.length,
      ...tally,
      meanPages: pagesN ? Number((pagesSum / pagesN).toFixed(1)) : null,
      extractionDefectRate: rows.length ? Number((tally.TEXT_PRESENT / rows.length).toFixed(4)) : null,
      examples,
    });
    console.log(
      `[no_text] ${p.court_code} perm=${p.permanent} pop=${p.n} sampled=${rows.length} ` +
        `IMAGE_ONLY=${tally.IMAGE_ONLY} TEXT_PRESENT=${tally.TEXT_PRESENT} ENCRYPTED=${tally.ENCRYPTED} MALFORMED=${tally.MALFORMED} FETCH_FAILED=${tally.FETCH_FAILED}`,
    );
  }

  const totalPop = population.reduce((a, p) => a + Number(p.n), 0);
  const permPop = population.filter((p) => p.permanent).reduce((a, p) => a + Number(p.n), 0);
  const artifact = {
    artifact: 'NEW2_NO_TEXT_DIAGNOSIS_R10',
    lane: 'NEW2',
    takenAt,
    question:
      'the ledger holds no_text rows, 3,709 of them marked permanent, and every sampled object is a live real PDF. Is our extractor failing, or are these scans?',
    extractor: 'unpdf — the same library services/ingest uses, because the question is whether OURS can read it, not whether some tool can',
    population: { total: totalPop, permanent: permPop, open: totalPop - permPop },
    strata,
    consequence: {
      note:
        'a no_text row can never be terminal: the artifact was fetched, so the source supplied it. Whatever the split below, all 3,709 permanent no_text marks are counted OUT of accounted_upstream.',
      imageOnlyIsACost: 'IMAGE_ONLY records are recoverable only by OCR and are a known cost, not a pipeline defect',
      textPresentIsADefect: 'TEXT_PRESENT records are recoverable today by re-running the loader and are a real extraction defect',
    },
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1));
  console.log(`[no_text] wrote ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
