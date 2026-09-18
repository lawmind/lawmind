/**
 * `pnpm --filter @lawmind/ingest paragraphs --apply` — paragraph-level evidence
 * coverage for the whole corpus, without embeddings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION THIS EXECUTES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder call, 13 Aug 2026: fund chunk-text coverage now; start embeddings only
 * once every court is held, every case and citation is in, and the corpus is
 * structured. **Data first, vectors second.**
 *
 * The gap this closes was NEW1's: 94.5% of successfully-retrieved queries came
 * back with an empty `operativeParagraph`, because only **40,161 of 600,073
 * judgments (6.7%)** had any passage stored at all. That is not an evidence bug;
 * it is a corpus that grew 7× under a table which only ever covered the Supreme
 * Court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOES NOT TOUCH `judgment_chunks`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That is the VECTOR table, and `retrieve.ts`'s dense query is
 * `ORDER BY c.embedding <=> $1 LIMIT n` over it with **no
 * `WHERE embedding IS NOT NULL`** — checked in the source, not assumed. Adding
 * ~550,000 embedding-less rows would grow it roughly 15× and invite the planner
 * to drop the HNSW index for a sequential scan. Paying for evidence display
 * with production search latency is not a trade worth making quietly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESUMABLE, AND SAFE UNDER A CONCURRENT INGEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Keyset pagination, `connect_timeout`, retry on transient transport failure —
 * the three things that killed four workers in this lane today, all present from
 * the start rather than added after the first crash. `--resume` skips judgments
 * that already have paragraphs, so an interrupted run costs only what is left.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { splitParagraphs, spansAreContiguous } from './paragraphs.ts';
import { installCrashGuard } from './crash-guard.ts';
import { isTransientDbOrNetworkError } from './db-transient.ts';
import { sslFor } from './db-ssl';

// Silent deaths cost three runs today; log the cause instead of vanishing.
installCrashGuard('paragraphs');
const APPLY = process.argv.includes('--apply');
const RESUME = process.argv.includes('--resume');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const PAGE = Number(arg('page', '300'));
const LIMIT = Number(arg('limit', '0'));
/** Ignore any stored cursor and walk from the epoch again. */
const RESTART_CURSOR = process.argv.includes('--restart-cursor');

/**
 * `--shard i/n` — the missing half of `--resume`.
 *
 * `--resume` makes ONE interrupted worker cheap to restart. It does nothing to
 * make TWO workers useful: both start at the same cursor and walk the same ids
 * in the same order, so every judgment is split and inserted N times and
 * `ON CONFLICT DO NOTHING` quietly swallows the duplicates. Six workers were
 * found running that way on 14 Aug 2026 — six full walks of a 1.47M-row table,
 * competing for TOAST reads with the harvest fleet's inserts on the same table,
 * to do one walk's worth of work.
 *
 * Shard on a hash of the id rather than an id range: ids are uuid v4, so a
 * range split is only as even as the random draw, while the hash is even by
 * construction and needs no coordination between workers. The double modulo is
 * not decoration — `hashtext` returns a signed int and `%` in Postgres keeps
 * the sign, so a plain `% n` would silently emit negative shard numbers that
 * match no worker and leave those judgments uncovered forever.
 *
 * Absent, it is exactly the previous behaviour: one worker, no filter.
 */
const SHARD = arg('shard', '');
let shardIndex = 0;
let shardCount = 1;
if (SHARD) {
  const m = /^(\d+)\/(\d+)$/.exec(SHARD);
  if (!m) {
    console.error(`--shard expects i/n (e.g. 0/4), got "${SHARD}"`);
    process.exit(2);
  }
  shardIndex = Number(m[1]);
  shardCount = Number(m[2]);
  if (shardCount < 1 || shardIndex >= shardCount) {
    console.error(`--shard ${SHARD} is out of range: need 0 <= i < n and n >= 1`);
    process.exit(2);
  }
}

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, {
  ssl: sslFor(dbUrl),
  max: 2,
  connect_timeout: 120,
  idle_timeout: 0,
});

const TRANSIENT =
  /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_ENDED|socket|getaddrinfo/i;
async function withRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const m =
        err instanceof Error
          ? `${err.message} ${(err as { code?: string }).code ?? ''}`
          : String(err);
      /** See `./db-transient.ts` — a restarting Postgres matches no word in this regex. */
      if (attempt >= 8 || (!isTransientDbOrNetworkError(err) && !TRANSIENT.test(m))) throw err;
      const wait = Math.min(30_000, 1000 * 2 ** attempt);
      console.log(`\n    db ${what} failed (${m.trim()}) — retry in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

console.log('PARAGRAPH EVIDENCE COVERAGE');
console.log('='.repeat(74));
console.log(
  `${APPLY ? 'APPLY' : 'DRY RUN'} · ${RESUME ? 'resume' : 'full walk'} · page ${PAGE}` +
    `${shardCount > 1 ? ` · shard ${shardIndex}/${shardCount}` : ' · unsharded'}`,
);

/**
 * ARRIVAL-ORDER PAGINATION, and a uuid watermark was silently losing rows.
 *
 * `judgments.id` is uuid **v4** — random, not monotonic — so a cursor that has
 * advanced to `c000…` will never see a judgment harvested afterwards whose id
 * happens to sort below it. With the fleet inserting ~170,000 rows an hour, a
 * long-running shard was permanently skipping a large share of everything that
 * landed while it walked. `schema.ts` already recorded the intent ("`created_at`
 * is monotonic and safe to page by", migration 0050, bus 0461); the query was
 * never repointed, and `judgments_created_at_idx` only finished building —
 * `indisvalid = true` — at 22:57 UTC on 14 Aug (LCC, bus 0487) after four hours
 * stuck in `waiting for old snapshots` behind this very fleet's transactions.
 *
 * **The tuple is not decoration.** `created_at` defaults to `now()`, which is
 * TRANSACTION time, so every row written by one `upsertJudgments` batch shares a
 * timestamp exactly. Measured on the live corpus rather than assumed: **the
 * largest group of rows sharing a single `created_at` is 100** — exactly that
 * batch size. A plain `created_at > cursor` would therefore skip up to 100 rows
 * at every page boundary, and `>=` would loop on them forever. `(created_at, id)`
 * breaks the tie on a column that is unique.
 *
 * Verified against the planner before switching, because a comment claiming an
 * index is the exact thing that has already been wrong twice in this repo:
 * `Parallel Index Scan using judgments_created_at_idx`, `Index Cond: created_at
 * >= …`, `Incremental Sort … Presorted Key: created_at`.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CURSOR IS PERSISTED, BECAUSE THE ASCENDING WALK MADE A RESTART EXPENSIVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 measured this rather than suspecting it (bus 0505), and left the four
 * shards DOWN rather than start them under a supervisor that would re-pay it:
 *
 *   oldest 10,000 judgments by `created_at` with NO paragraphs        0
 *   oldest 100,000 judgments by `created_at` with NO paragraphs       1
 *   judgments that already HAVE paragraphs                    4,409,248
 *   scan cost                                    ~99s per 100,000 rows
 *
 * **The undone rows are all at the NEW end and the cursor starts at the OLD
 * end.** A cold start therefore walks ~4.4M finished rows before its first page
 * — roughly **72 minutes per shard**, and `supervise.mjs` restarts a dead worker
 * up to 40 times. NEW2's smoke test printed the banner and produced no page in
 * seven minutes, which is exactly this and not a hang.
 *
 * The uuid-v4 watermark never showed it because a random cursor scans in random
 * order, so undone rows were uniformly distributed and the first page came back
 * at once. The ascending walk is still the RIGHT fix — a new arrival always
 * sorts ahead of the cursor, which is the completeness property the v4 watermark
 * could not have — it just needs the dead prefix walked ONCE, ever.
 *
 * **THE TRADE, STATED PLAINLY.** A persisted cursor never goes back. A judgment
 * that was passed over below the cursor — spans that failed
 * `spansAreContiguous`, or a row whose text arrived later — is not revisited by
 * a resumed run, where the old walk-from-epoch behaviour would have swept it up
 * eventually. That is a real loss of a real (if accidental) property, and the
 * answer is `--restart-cursor`, which walks from the epoch again and costs the
 * 72 minutes deliberately. A periodic full sweep is the intended use.
 *
 * Written only under `--apply`: a dry run stores nothing, so its cursor would
 * tell a later apply that work was done which never was. Written only AFTER the
 * page's rows are inserted, so a crash mid-page re-does that page — safe,
 * because the insert is `ON CONFLICT DO NOTHING`.
 */
const CHECKPOINT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.checkpoints');
const CHECKPOINT_FILE = join(CHECKPOINT_DIR, `paragraphs-${shardIndex}_${shardCount}.json`);

type Checkpoint = {
  cursorAt: string;
  cursorId: string;
  scanned: number;
  written: number;
  updatedAt: string;
};

function loadCheckpoint(): Checkpoint | null {
  if (!existsSync(CHECKPOINT_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8')) as Partial<Checkpoint>;
    if (typeof raw.cursorAt !== 'string' || typeof raw.cursorId !== 'string') return null;
    /* A malformed or truncated checkpoint must not be half-believed. Walking
     * from the epoch is slow; resuming from a corrupt position silently skips
     * everything before it, and that is the failure nobody would notice. */
    if (Number.isNaN(Date.parse(raw.cursorAt))) return null;
    return {
      cursorAt: raw.cursorAt,
      cursorId: raw.cursorId,
      scanned: Number(raw.scanned ?? 0),
      written: Number(raw.written ?? 0),
      updatedAt: String(raw.updatedAt ?? ''),
    };
  } catch {
    return null;
  }
}

function saveCheckpoint(at: string, id: string, scannedSoFar: number, writtenSoFar: number): void {
  if (!APPLY) return;
  try {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
    writeFileSync(
      CHECKPOINT_FILE,
      JSON.stringify(
        {
          cursorAt: at,
          cursorId: id,
          scanned: scannedSoFar,
          written: writtenSoFar,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } catch (err) {
    /* A checkpoint that cannot be written is a slow restart, not a wrong
     * result. Say so once and keep going rather than kill a working pass. */
    console.log(
      `\n    checkpoint write failed (${err instanceof Error ? err.message : String(err)}) — continuing`,
    );
  }
}

let cursorAt = '1970-01-01T00:00:00.000Z';
let cursorId = '00000000-0000-0000-0000-000000000000';
const resumedFrom = RESTART_CURSOR ? null : loadCheckpoint();
if (resumedFrom) {
  cursorAt = resumedFrom.cursorAt;
  cursorId = resumedFrom.cursorId;
  console.log(
    `resuming from checkpoint ${CHECKPOINT_FILE}\n  cursor ${cursorAt} · ${resumedFrom.scanned.toLocaleString()} scanned in earlier runs (updated ${resumedFrom.updatedAt})`,
  );
} else if (RESTART_CURSOR) {
  console.log('--restart-cursor: walking from the epoch, ignoring any stored cursor');
} else {
  console.log(
    `no checkpoint at ${CHECKPOINT_FILE} — first run for this shard, walking from the epoch`,
  );
}

let scanned = 0;
let written = 0;
let paragraphs = 0;
let numbered = 0;
let lostText = 0;
const started = Date.now();

for (;;) {
  if (LIMIT > 0 && scanned >= LIMIT) break;

  const page = await withRetry(
    'select',
    () =>
      sql<{ id: string; fullText: string; createdAt: Date }[]>`
      SELECT id, full_text AS "fullText", created_at AS "createdAt" FROM judgments
      WHERE (created_at, id) > (${cursorAt}::timestamptz, ${cursorId}::uuid)
        AND full_text IS NOT NULL AND length(full_text) > 100
        ${RESUME ? sql`AND NOT EXISTS (SELECT 1 FROM judgment_paragraphs p WHERE p.judgment_id = judgments.id)` : sql``}
        ${shardCount > 1 ? sql`AND ((hashtext(id::text) % ${shardCount}) + ${shardCount}) % ${shardCount} = ${shardIndex}` : sql``}
      ORDER BY created_at, id LIMIT ${PAGE}`,
  );
  if (page.length === 0) break;
  const last = page[page.length - 1]!;
  /* Advanced here for the next query, but NOT persisted until this page's rows
   * are actually in the database — see the checkpoint note above. */
  cursorAt = last.createdAt.toISOString();
  cursorId = last.id;

  const rows: {
    judgment_id: string;
    paragraph_index: number;
    paragraph_number: number | null;
    char_offset: number;
    char_length: number;
    paragraph_text: string;
    source_text_hash: string;
  }[] = [];

  for (const j of page) {
    scanned++;
    const paras = splitParagraphs(j.fullText);
    if (paras.length === 0) continue;

    /**
     * THE ONE INVARIANT WORTH FAILING OVER. If the spans do not reconstruct the
     * source exactly, this judgment's evidence would point at text that is not
     * where we say it is. Skip it and count it, rather than store a span nobody
     * can trust — a wrong offset is worse than an absent one, because the
     * product would render it as a quotation.
     */
    if (!spansAreContiguous(paras, j.fullText)) {
      lostText++;
      continue;
    }

    const hash = sha256(j.fullText);
    for (const p of paras) {
      paragraphs++;
      if (p.number !== null) numbered++;
      rows.push({
        judgment_id: j.id,
        paragraph_index: p.index,
        paragraph_number: p.number,
        char_offset: p.charOffset,
        char_length: p.charLength,
        paragraph_text: p.text,
        source_text_hash: hash,
      });
    }
    written++;
  }

  if (APPLY && rows.length > 0) {
    // Chunked, because a few thousand rows exceeds the bind-parameter limit.
    for (let i = 0; i < rows.length; i += 1000) {
      const slice = rows.slice(i, i + 1000);
      await withRetry(
        'insert',
        () =>
          sql`INSERT INTO judgment_paragraphs ${sql(slice)}
            ON CONFLICT (judgment_id, paragraph_index) DO NOTHING`,
      );
    }
  }

  saveCheckpoint(
    cursorAt,
    cursorId,
    scanned + (resumedFrom?.scanned ?? 0),
    written + (resumedFrom?.written ?? 0),
  );

  const rate = scanned / Math.max(1, (Date.now() - started) / 1000);
  process.stdout.write(
    `\r  scanned ${scanned.toLocaleString()} · ${paragraphs.toLocaleString()} paragraphs ` +
      `(${numbered.toLocaleString()} court-numbered) · ${rate.toFixed(1)}/s`,
  );
  if (page.length < PAGE) break;
}

console.log('');
console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`judgments scanned        ${scanned.toLocaleString()}`);
console.log(
  `judgments with evidence  ${written.toLocaleString()}${APPLY ? ' (written)' : ' (dry run)'}`,
);
console.log(`paragraphs               ${paragraphs.toLocaleString()}`);
console.log(
  `  carrying a court number ${numbered.toLocaleString()}` +
    `${paragraphs > 0 ? ` = ${((100 * numbered) / paragraphs).toFixed(1)}%` : ''}` +
    ` — the rest are cause titles, coram lines and unnumbered preambles`,
);
console.log(
  `REFUSED (spans lost text) ${lostText}  <-- stored nothing rather than a span nobody can trust`,
);
console.log(`mean paragraphs/judgment ${written > 0 ? (paragraphs / written).toFixed(1) : '0'}`);
console.log(`wall clock               ${((Date.now() - started) / 1000).toFixed(0)}s`);

await sql.end();
