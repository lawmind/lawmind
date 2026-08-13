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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db-host.ts';
import { existingSourceUrls, upsertJudgments } from '../load.ts';
import type { JudgmentRecord } from '../sci.ts';
import { fetchPdfText, isNativeText } from '../text.ts';
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
  withTimeout,
} from './hc-metadata.ts';

/** A malformed embedded font can hang extraction forever (see `withTimeout`). Bound it, don't wait on it. */
const EXTRACT_TIMEOUT_MS = 90_000;

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

/**
 * Measured live (bus 0257/0261): a large court with several prior partial
 * generations behind it (Madras ~1.5M source documents, Kerala ~570K) can
 * spend 45+ minutes silently re-scanning batches that are 100% `already_held`
 * before reaching fresh material — every restart re-pays that scan from
 * offset 0. `existingSourceUrls` is not wrong to check; the loop is wrong to
 * forget where it already checked.
 *
 * A local per-court JSON checkpoint, not a DB migration: this ingest already
 * runs one dedicated worker per court on one machine, so there is no
 * cross-process coordination to get right, and a wrong or stale checkpoint
 * costs at most a little re-scanning — `source_url`'s unique index is still
 * the real safety net, this is purely a speed optimisation on top of it.
 * Skipped entirely for the general sweep (no `--court`), which has no single
 * court identity to key a checkpoint on and is not the courts this was
 * measured against.
 */
const CHECKPOINT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.checkpoints');
const CHECKPOINT_PATH = COURT ? join(CHECKPOINT_DIR, `${COURT}.json`) : null;

async function loadCheckpoint(): Promise<Record<string, number>> {
  if (!CHECKPOINT_PATH) return {};
  try {
    return JSON.parse(await readFile(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveCheckpoint(checkpoint: Record<string, number>): Promise<void> {
  if (!CHECKPOINT_PATH) return;
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint), 'utf8');
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
// `openDb` (LCC, bus 0170) resolves the proxy hostname via public DNS and
// hands the driver an address directly — the actual fix for the
// `getaddrinfo ENOTFOUND` deaths this session had (bus 0159/0165/0170): the
// OS resolver on this machine is the thing that intermittently fails, and
// `connect_timeout` alone cannot help because a stalled lookup never reaches
// the stage that timeout governs. Bundles connect_timeout: 120 and
// idle_timeout: 0 already.
const sql = await openDb(url, 3);

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
  const checkpoint = await loadCheckpoint();

  for (const file of files) {
    let total = 0;
    try {
      total = await rowCount(file.key);
    } catch {
      bump('metadata_unreadable');
      continue;
    }
    if (total === 0) continue;

    const resumeFrom = checkpoint[file.key] ?? 0;
    if (resumeFrom >= total) continue;

    for (let offset = resumeFrom; offset < total; offset += BATCH) {
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
      const rawCandidates = rows
        .map((r) => {
          const link = (r['pdf_link'] as string | undefined) ?? null;
          return link ? { row: r, url: pdfUrlFor(file.p, link) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      // Found live: `upsertBatch` batches up to 100 rows into ONE `INSERT …
      // ON CONFLICT (source_url) DO UPDATE`, and Postgres refuses outright if
      // the same conflict key appears twice in one statement — "ON CONFLICT
      // DO UPDATE command cannot affect row a second time", not a retryable
      // error, crashed the whole process. The metadata source itself carries
      // duplicate rows within a single parquet file (same `pdf_link`), which
      // `existingSourceUrls` cannot catch — it only knows what a PREVIOUS
      // batch already wrote. First occurrence wins, matching this codebase's
      // "one sighting per document" rule for citations.
      const seenUrls = new Set<string>();
      const candidates = rawCandidates.filter((c) => {
        if (seenUrls.has(c.url)) return false;
        seenUrls.add(c.url);
        return true;
      });
      bump('duplicate_in_batch', rawCandidates.length - candidates.length);
      if (candidates.length === 0) {
        checkpoint[file.key] = offset + want;
        await saveCheckpoint(checkpoint);
        continue;
      }

      const already = await existingSourceUrls(
        sql,
        candidates.map((c) => c.url),
      );
      const todo = candidates.filter((c) => !already.has(c.url));
      bump('already_held', candidates.length - todo.length);
      if (todo.length === 0) {
        checkpoint[file.key] = offset + want;
        await saveCheckpoint(checkpoint);
        continue;
      }

      const records = await mapConcurrent(todo, CONCURRENCY, async (c) => {
        let text = '';
        let pages = 1;
        let method: string | null = null;
        // Aborts the fetch at the same deadline `withTimeout` gives up at, so a
        // stalled socket is actually closed rather than merely abandoned — this
        // run touches 15.77M documents over days, and a leaked connection per
        // timeout would eventually starve the pool. Parsing itself cannot be
        // aborted (unpdf/pdfjs takes no signal), so `withTimeout` still races it.
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
        try {
          // The WHOLE per-document operation is bounded, not just parsing.
          // A stalled fetch (no bytes, no error, no CPU — a dead socket the
          // OS never reports as closed) hangs identically to the font-repair
          // loop that motivated `withTimeout` in the first place: zero CPU,
          // one worker permanently short, `Promise.all` in `mapConcurrent`
          // never resolves. Observed directly restarting this run — CPU time
          // flat across a 5s sample while "stuck" mid-batch.
          //
          // `fetchPdfText` (`../text.ts`) replaces the inline `unpdf` calls
          // this line used to make — it is the SAME extraction plus the
          // measured `pdftotext` fallback for the font-corruption pattern
          // found on 37.0% of Bombay High Court documents (`CURRENT_PLAN.md`
          // Q1.20/Q1.27), and already carries `stripUnstorable` internally
          // via `normaliseWhitespace`, so that call is no longer needed here.
          const extracted = await withTimeout(
            () => fetchPdfText(c.url, controller.signal),
            EXTRACT_TIMEOUT_MS,
            c.url,
          );
          text = extracted.text;
          pages = extracted.pages;
          method = extracted.method;
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('timeout after')) {
            return { skip: 'pdf_timeout' as const };
          }
          // `fetchPdfText` throws `GET <url> → <status>` on a non-OK response —
          // a 4xx/5xx is the same "not there" this CLI has always tallied
          // separately from a genuine parse failure.
          const missing = error instanceof Error && /→ \d{3}$/.test(error.message);
          return missing ? { skip: 'pdf_missing' as const } : { skip: 'pdf_failed' as const };
        } finally {
          clearTimeout(abortTimer);
        }
        const out = toJudgmentRecord(c.row, file.p, text, c.url, isNativeText(text.length, pages), method);
        if (!out.ok) return { skip: out.reason };
        return { record: out.record };
      });

      const batch: JudgmentRecord[] = [];
      for (const r of records) {
        seen++;
        if ('skip' in r) {
          bump(r.skip as SkipReason | 'pdf_missing' | 'pdf_failed' | 'pdf_timeout');
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

      // Dry runs never advance the checkpoint: nothing was actually written,
      // so a later `--apply` run must still see and process this offset.
      if (APPLY) {
        checkpoint[file.key] = offset + want;
        await saveCheckpoint(checkpoint);
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

/**
 * A DNS blip on the shared Railway proxy hostname crashes the whole process
 * with an UNCAUGHT `ENOTFOUND` (or a handful of related transient network
 * codes) rather than a catchable rejection inside `main()`'s own try/catch —
 * postgres.js throws it straight from query construction. Found live: five
 * workers crashed within the same few minutes on
 * `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net`, and the hostname resolved
 * fine moments later — a transient consumer-router DNS hiccup, not a broken
 * environment. `main()` is resumable by construction (`source_url` skip), so
 * retrying the WHOLE run costs only a fast re-check of already-held rows,
 * not lost work.
 */
const TRANSIENT_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  // undici's connect-timeout to S3, found live: `listMetadataKeys()`'s bare
  // `fetch()` throws `TypeError: fetch failed` with the real code one level
  // down in `.cause` — undici always wraps this way, so checking only the
  // top-level `.code` (as the DNS fix originally did) misses it entirely.
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

function isTransientNetworkError(error: unknown): boolean {
  const err = error as (NodeJS.ErrnoException & { cause?: unknown }) | undefined;
  if (err?.code && TRANSIENT_CODES.has(err.code)) return true;
  const cause = err?.cause as NodeJS.ErrnoException | undefined;
  return cause?.code !== undefined && TRANSIENT_CODES.has(cause.code);
}

const MAX_TRANSIENT_RETRIES = 5;
try {
  for (let attempt = 1; ; attempt++) {
    try {
      await main();
      break;
    } catch (error) {
      if (!isTransientNetworkError(error) || attempt >= MAX_TRANSIENT_RETRIES) throw error;
      const delayMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      const code = (error as NodeJS.ErrnoException).code;
      console.error(
        `transient network error (${code}), attempt ${attempt}/${MAX_TRANSIENT_RETRIES} — retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
} finally {
  await sql.end();
}
