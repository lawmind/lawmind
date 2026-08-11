/**
 * Ingest High Court DOCUMENTS from the AWS Open Data bucket into `judgments`.
 *
 *   npx tsx src/harvest/hc-load-cli.ts --court 10_8 --year 2024          # DRY
 *   npx tsx src/harvest/hc-load-cli.ts --court 10_8 --year 2024 --apply
 *
 * **APPROVED by the founder 11 Aug 2026:** *"Yes — ingest High Court documents
 * as searchable text behind the coverage screen, no embeddings for now."*
 * Plan and per-step verification: `docs/HC_INGEST_PLAN.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE CITATION PASS WITH A LOADER ON THE END
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc-citations-cli.ts` already streams these exact PDFs at 41 documents/second
 * and throws the text away. Everything here that touches the network is that
 * pipeline, deliberately unchanged — rewriting a proven streaming path to add a
 * write would be inventing a second implementation of the working half.
 *
 * What is new is the mapping (`hc-load.ts`, pure and separately tested) and the
 * write, which goes through the existing `upsertJudgments`: unique on
 * `source_url`, batched at 100, and already carrying `stripUnstorable` for the
 * invalid-UTF-8 failure (SQLSTATE 22021) that once silently stopped an ingest
 * after 2022.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DRY BY DEFAULT, AND WHY THAT IS NOT CONVENIENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `CONTINUATION_PROMPT.md` §1: this lane published *"resolution will reach
 * 49.1%"* from a SELECT and delivered 40.4% from the write, because 16,790 rows
 * were self-citations a constraint refused. **Never quote a number that implies
 * a write until that exact write has been dry-run.** So `--apply` is required,
 * and the dry run walks the identical path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE MAY CALL THESE "JUDGMENTS"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured judgment share of this corpus is **0.75%–18.64%**. Every count this
 * prints says "documents". The coverage endpoint already refuses the word and a
 * test asserts no field is ever named `sourceJudgments`.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import postgres from 'postgres';

import { existingSourceUrls, upsertJudgments } from '../load.ts';
import type { JudgmentRecord } from '../sci.ts';
import { isNativeText } from '../text.ts';
import {
  type SkipReason,
  isTestFixture,
  toJudgmentRecord,
} from './hc-load.ts';
import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  rowCount,
  sampleRows,
} from './hc-metadata.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
function num(name: string, fallback: number): number {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
}

const APPLY = process.argv.includes('--apply');
const COURT = flag('--court');
const YEAR = flag('--year') ? Number(flag('--year')) : undefined;
/** `--from-year 2016` ingests the decade and stops, newest first. */
const FROM_YEAR = flag('--from-year') ? Number(flag('--from-year')) : undefined;
const LIMIT = num('--limit', 0);
const BATCH = num('--batch', 200);
const CONCURRENCY = num('--concurrency', 16);

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, { max: 3, ssl: 'require' });

type Tally = Record<string, number>;
const tally: Tally = {};
const bump = (k: string, n = 1) => (tally[k] = (tally[k] ?? 0) + n);

/**
 * Rows landing on 1 January are COUNTED, never dropped.
 *
 * Found while verifying the date rule: several 1950 partitions carry runs of
 * `Sun Jan 01 1950`, which reads as a placeholder for "date unknown" rather than
 * as a real sitting. **A corpus where thousands of documents claim 1 January
 * would corrupt ordering and every "as at" answer.** It is reported so the
 * number can be looked at before the full run, because silently dropping a
 * document is the one thing this codebase never does.
 */
const isJanFirst = (iso: string) => iso.slice(5) === '01-01';

async function main(): Promise<void> {
  console.log(`HIGH COURT DOCUMENT INGEST${APPLY ? '' : ' — DRY RUN'}`);
  console.log('='.repeat(74));

  const keys = await listMetadataKeys();
  const files = keys
    .map((k) => ({ ...k, p: parsePartitions(k.key) }))
    .filter((x): x is typeof x & { p: NonNullable<typeof x.p> } => x.p !== null)
    .filter((x) => (COURT ? x.p.courtCode === COURT : true))
    .filter((x) => (YEAR ? x.p.year === YEAR : true))
    .filter((x) => (FROM_YEAR ? x.p.year >= FROM_YEAR : true))
    .filter((x) => !isTestFixture(x.p))
    /**
     * **NEWEST FIRST, and this is not cosmetic.**
     *
     * The first run of this CLI went 1950 → 1951 → 1952, because that is the
     * order the bucket lists partitions in. Two things are wrong with that:
     * an advocate needs recent law far more than 1950s law, and **any
     * interruption of a multi-week ingest would leave us holding the least
     * useful half.** Descending, an interruption leaves the most useful half.
     *
     * It also front-loads the years that carry a **neutral citation** (2023+),
     * which are the only High Court documents that are citable rather than
     * merely searchable — `CURRENT_PLAN.md` §Q2.
     */
    .sort((a, b) => b.p.year - a.p.year);

  console.log(
    `${files.length} metadata files in scope` +
      `${COURT ? ` · court=${COURT}` : ''}${YEAR ? ` · year=${YEAR}` : ''}`,
  );
  if (files.length === 0) return;

  const started = Date.now();
  let seen = 0;
  let mapped = 0;
  let written = 0;
  const samples: JudgmentRecord[] = [];

  for (const file of files) {
    let total = 0;
    try {
      total = await rowCount(file.key);
    } catch {
      bump('metadata_unreadable');
      continue;
    }
    if (total === 0) continue;

    for (let offset = 0; offset < total; offset += BATCH) {
      if (LIMIT > 0 && seen >= LIMIT) break;
      const want = Math.min(BATCH, total - offset);
      let rows: Record<string, unknown>[];
      try {
        rows = await sampleRows(file.key, offset, offset + want);
      } catch {
        bump('metadata_batch_unreadable');
        break;
      }

      // Resumability lives in the database: source_url is uniquely indexed, so a
      // killed run is restarted with the same command and skips what it has.
      const candidates = rows
        .map((r) => {
          const link = (r['pdf_link'] as string | undefined) ?? null;
          return link ? { row: r, url: pdfUrlFor(file.p, link) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (candidates.length === 0) continue;

      const already = await existingSourceUrls(
        sql,
        candidates.map((c) => c.url),
      );
      const todo = candidates.filter((c) => !already.has(c.url));
      bump('already_held', candidates.length - todo.length);
      if (todo.length === 0) continue;

      const records = await mapConcurrent(todo, CONCURRENCY, async (c) => {
        let text = '';
        let pages = 1;
        try {
          const res = await fetch(c.url);
          if (!res.ok) return { skip: 'pdf_missing' as const };
          const bytes = new Uint8Array(await res.arrayBuffer());
          const pdf = await getDocumentProxy(bytes);
          const extracted = await extractText(pdf, { mergePages: true });
          text = extracted.text;
          pages = extracted.totalPages || 1;
        } catch {
          return { skip: 'pdf_failed' as const };
        }
        const out = toJudgmentRecord(c.row, file.p, text, c.url, isNativeText(text.length, pages));
        if (!out.ok) return { skip: out.reason };
        return { record: out.record };
      });

      const batch: JudgmentRecord[] = [];
      for (const r of records) {
        seen++;
        if ('skip' in r) {
          bump(r.skip as SkipReason | 'pdf_missing' | 'pdf_failed');
          continue;
        }
        mapped++;
        if (isJanFirst(r.record.judgmentDate)) bump('date_is_1_january');
        if (samples.length < 5) samples.push(r.record);
        batch.push(r.record);
      }

      if (APPLY && batch.length > 0) {
        const res = await upsertJudgments(sql, batch);
        written += res.inserted + res.updated;
      }

      const secs = (Date.now() - started) / 1000;
      console.log(
        `[${seen.toLocaleString()}] mapped=${mapped.toLocaleString()} ` +
          `written=${written.toLocaleString()} ` +
          `${(seen / Math.max(secs, 1)).toFixed(1)} docs/s · ${file.p.courtCode}/${file.p.year}`,
      );
    }
    if (LIMIT > 0 && seen >= LIMIT) break;
  }

  console.log('');
  console.log(`DOCUMENTS SEEN    ${seen.toLocaleString()}`);
  console.log(`MAPPED            ${mapped.toLocaleString()}`);
  console.log(`WRITTEN           ${written.toLocaleString()}`);
  console.log('');
  console.log('outcomes, and every skipped document is counted rather than dropped:');
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(8)}  ${k}`);
  }

  // S5 of the plan: READ five mapped records by eye before trusting the mapping.
  if (samples.length > 0) {
    console.log('');
    console.log('five mapped records — READ THESE, do not skim them:');
    for (const r of samples) {
      console.log(`  ${r.judgmentDate}  ${r.court}  [${r.caseType ?? 'no side'}]`);
      console.log(`    title  ${r.caseTitle.slice(0, 88)}`);
      console.log(`    number ${r.caseNumber ?? '—'}   neutral ${r.neutralCitation ?? '—'}`);
      console.log(`    text   ${r.fullText.replace(/\s+/g, ' ').slice(0, 88)}…`);
    }
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing written. Re-run with --apply.');
    console.log('These are DOCUMENTS. Measured judgment share is 0.75%–18.64%.');
  }
}

try {
  await main();
} finally {
  await sql.end();
}
