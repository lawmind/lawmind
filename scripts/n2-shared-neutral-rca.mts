/**
 * NEW2 — R8.1 §7.5 shared-neutral primary-source RCA.
 *
 * 155,387 neutral citations are shared by 361,044 judgments. §7.5 says to
 * refetch bounded worst cases from the canonical source and classify the cause,
 * and — explicitly — **not to extrapolate cause before evidence**.
 *
 * That warning earned its place here. A structural pass over the whole
 * population splits the groups cleanly by content hash:
 *
 *   COMMON_ORDER_SHARED_ORDER       80,224 groups / 192,939 judgments
 *   DISTINCT_TEXTS                  74,377 groups / 160,153 judgments
 *   MIXED_PARTIAL_DUPLICATION          778 groups /   7,931 judgments
 *   CROSS_COURT_COLLISION                5 groups /      12 judgments
 *
 * and the obvious reading of the second class is "the citation is wrong". The
 * primary source refutes that for the largest group in the corpus. So the
 * structural class is only a HYPOTHESIS and this script is the test.
 *
 * ## The classification, from the document itself
 *
 *   DOCUMENT_PRINTED_VALUE   the PDF prints this exact citation on its face, so
 *                            the COURT assigned it to more than one document
 *   NOT_PRINTED_IN_DOCUMENT  the PDF prints no neutral citation at all, so the
 *                            value reached us from parquet metadata or from an
 *                            extractor — a different defect with a different fix
 *   PRINTED_VALUE_DIFFERS    the PDF prints a DIFFERENT citation than we stored
 *   NO_TEXT_LAYER            a real PDF with no extractable text — cannot say
 *   FETCH_FAILED / NOT_A_PDF the source did not return a usable document
 *
 * `NO_TEXT_LAYER` and `NOT_A_PDF` are checked before any content verdict,
 * because a soft 404 can arrive as HTTP 200 with `Content-Type: application/pdf`
 * and 124 bytes of HTML, and an empty extraction reads exactly like an absent
 * citation.
 *
 * Read-only. Fetches PDFs to a scratch directory; writes nothing to the corpus.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r8/shared-neutral-rca.json';
const SCRATCH = '.scratch/n2-rca';
/** Groups to test. Bounded — §7.5 says bounded worst cases, not a survey. */
const GROUPS = Number(process.env.N2_GROUPS ?? 10);
/** Documents per group. Two is enough to tell "the court did it" from "we did". */
const DOCS_PER_GROUP = 2;
/** Below this many extracted characters the document cannot answer anything. */
const MIN_TEXT_CHARS = 400;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const NEUTRAL_RE = /20[0-9]{2}\s*:\s*[A-Z][A-Z-]{1,12}\s*:\s*[0-9]{1,7}(\s*-\s*[A-Z]{2})?/g;

async function fetchPdf(url: string, path: string): Promise<{ ok: boolean; bytes: number; why?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { ok: false, bytes: 0, why: `HTTP_${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    // Magic bytes, not Content-Type. A soft 404 can serve HTML as application/pdf.
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return { ok: false, bytes: buf.byteLength, why: 'NOT_A_PDF — magic bytes are not %PDF-' };
    }
    writeFileSync(path, buf);
    return { ok: true, bytes: buf.byteLength };
  } catch (e) {
    return { ok: false, bytes: 0, why: `FETCH_FAILED — ${(e as Error).name}` };
  }
}

function pdfText(path: string): string {
  try {
    return execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return '';
  }
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

async function main() {
  mkdirSync(join(ROOT, SCRATCH), { recursive: true });

  // The worst DISTINCT_TEXTS groups, spread across courts so the answer is not
  // one registry's habit mistaken for a corpus fact.
  const groups = await sql<{ neutral_citation: string; court: string; n: number; hashes: number }[]>`
    with g as (
      select neutral_citation, court, count(*)::int as n,
             count(distinct content_hash)::int as hashes,
             row_number() over (partition by court order by count(*) desc) as rk
        from judgments
       where neutral_citation is not null and neutral_citation <> ''
       group by 1,2
      having count(*) > 20 and count(distinct content_hash)::numeric / count(*) >= 0.9
    )
    select neutral_citation, court, n, hashes from g where rk = 1 order by n desc limit ${GROUPS}`;

  console.log(`testing ${groups.length} DISTINCT_TEXTS groups, one per court, ${DOCS_PER_GROUP} documents each\n`);

  const results: any[] = [];
  let seq = 0;

  for (const g of groups) {
    const docs = await sql<{ id: string; case_number: string | null; source_url: string | null }[]>`
      select id, case_number, source_url from judgments
       where neutral_citation = ${g.neutral_citation} and source_url is not null
       limit ${DOCS_PER_GROUP}`;

    const perDoc: any[] = [];
    for (const d of docs) {
      seq += 1;
      const path = join(ROOT, SCRATCH, `rca-${seq}.pdf`);
      const fetched = await fetchPdf(d.source_url!, path);
      if (!fetched.ok) {
        perDoc.push({ case_number: d.case_number, verdict: fetched.why, bytes: fetched.bytes });
        continue;
      }
      const text = pdfText(path);
      const sha = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
      if (text.length < MIN_TEXT_CHARS) {
        perDoc.push({
          case_number: d.case_number,
          verdict: 'NO_TEXT_LAYER',
          bytes: statSync(path).size,
          text_chars: text.length,
          sha256_16: sha,
        });
        continue;
      }
      const printed = [...new Set((text.match(NEUTRAL_RE) ?? []).map((s) => s.replace(/\s+/g, '')))];
      const stored = g.neutral_citation.replace(/\s+/g, '');
      const verdict = printed.includes(stored)
        ? 'DOCUMENT_PRINTED_VALUE'
        : printed.length === 0
          ? 'NOT_PRINTED_IN_DOCUMENT'
          : 'PRINTED_VALUE_DIFFERS';
      // A short excerpt is retained as evidence, per §7.5.
      const idx = text.search(/neutral\s+citation/i);
      perDoc.push({
        case_number: d.case_number,
        verdict,
        printed_citations: printed.slice(0, 3),
        bytes: statSync(path).size,
        text_chars: text.length,
        sha256_16: sha,
        fetched_at: new Date().toISOString(),
        excerpt: idx >= 0 ? text.slice(idx, idx + 90).replace(/\s+/g, ' ') : text.slice(0, 90).replace(/\s+/g, ' '),
      });
    }

    const verdicts = perDoc.map((d) => d.verdict);
    const groupVerdict = verdicts.every((v) => v === verdicts[0]) ? verdicts[0] : 'MIXED';
    results.push({ ...g, group_verdict: groupVerdict, documents: perDoc });
    console.log(`  ${String(g.n).padStart(5)} docs  ${groupVerdict.padEnd(24)} ${g.neutral_citation.padEnd(22)} ${g.court}`);
  }

  const tally: Record<string, number> = {};
  for (const r of results) tally[r.group_verdict] = (tally[r.group_verdict] ?? 0) + 1;

  console.log('\ngroup verdicts:');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

  const report = {
    artifact: 'NEW2_SHARED_NEUTRAL_RCA_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.5',
    generated_at: new Date().toISOString(),
    writes_to_corpus: 0,
    population: {
      shared_keys: 155387,
      judgments_involved: 361044,
      worst_group: 1257,
      structural_split: {
        COMMON_ORDER_SHARED_ORDER: { groups: 80224, judgments: 192939 },
        DISTINCT_TEXTS: { groups: 74377, judgments: 160153 },
        MIXED_PARTIAL_DUPLICATION: { groups: 778, judgments: 7931 },
        CROSS_COURT_COLLISION: { groups: 5, judgments: 12 },
        UNKNOWN_NO_HASH: { groups: 3, judgments: 9 },
      },
    },
    group_verdicts: tally,
    groups: results,
    caveats: [
      'ONE group per court, two documents per group. This tells apart "the court assigned it" from "we assigned it"; it does not estimate a rate.',
      'NOT_PRINTED_IN_DOCUMENT does not distinguish SOURCE_METADATA_WRONG from EXTRACTOR_WRONG. Both leave the document silent, and separating them needs the parquet row, which this script does not read.',
      'magic bytes are checked before any verdict — a soft 404 can arrive as HTTP 200 with Content-Type application/pdf.',
      'NO_TEXT_LAYER is not evidence of an absent citation. An empty extraction and a silent document read identically.',
    ],
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nwritten ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
