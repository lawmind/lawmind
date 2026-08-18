/**
 * NEW2 — PROMOTE THE LEGACY `pdf_missing` LEDGER ROWS BY EVIDENCE, NOT BY LABEL.
 *
 *   node scripts/migration/new2-ledger-absence-probe.mjs              # dry, samples 500
 *   node scripts/migration/new2-ledger-absence-probe.mjs --apply --limit 0
 *   node scripts/migration/new2-ledger-absence-probe.mjs --court 27_1 --apply
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------
 * `hc-load-cli.ts` collapsed every non-OK HTTP status into one bucket called
 * `pdf_missing`, and `ingest-ledger.ts` retried that bucket three times because
 * "one request cannot tell a transient hiccup from a genuine absence". The
 * status was available the whole time and was being discarded; the code now
 * splits `pdf_absent` (404/403/410, permanent on sight) from `pdf_unavailable`
 * (everything else, still retryable).
 *
 * That fixes the future. It leaves **63,122 rows already written under the old
 * label**, whose meaning changed underneath them. Two wrong ways to handle that:
 *
 *   - Mass-UPDATE them to `pdf_absent`. That condemns, on a guess, every row
 *     that was a 503 at the time. This is precisely the "do not prematurely make
 *     transient absence permanent" failure.
 *   - Leave them. Each then costs two more full GETs — body and all — before the
 *     database promotes them at three attempts, and only if a worker happens to
 *     re-read that parquet region. Bombay 2023/2024 sits outside every running
 *     band, so most would simply never be resolved.
 *
 * This tool takes the third way: **ask the bucket.** One HEAD per row — no body,
 * so it is far cheaper than the GET the ingest loop would pay — and the row is
 * relabelled by what the server actually says.
 *
 *   404 / 403 / 410  -> `pdf_absent`, permanent = true
 *   5xx / 429 / 408  -> `pdf_unavailable`, permanent untouched, still retryable
 *   2xx              -> LEFT ALONE. The object exists; the failure was ours, and
 *                       the ingest loop will succeed on it. Deleting the row
 *                       here would be claiming a success nothing has performed.
 *   network error    -> left alone. An unreachable host is evidence about the
 *                       network, not about the object.
 *
 * `attempts` is never incremented. A probe is not an ingest attempt, and
 * inflating the counter would promote rows through the database's threshold on
 * the strength of a request that never tried to fetch the document.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SAFE TO RUN WHILE THE FLEET IS LIVE
 * ---------------------------------------------------------------------------
 * Every write is a single-row UPDATE keyed by `source_url`, the table's primary
 * key, and `recordFailures` uses `ON CONFLICT DO UPDATE` on that same key — so a
 * worker touching the same URL mid-probe wins with fresher evidence rather than
 * deadlocking. The UPDATE also re-asserts `outcome = 'pdf_missing'` in its WHERE
 * clause, so a row a worker has already reclassified is never overwritten by a
 * probe result that is older than it looks.
 *
 * Honours the fleet STOP file at every page boundary, for the same reason every
 * other high-write background program here does: a freeze that some writers
 * observe and others do not is not a freeze.
 *
 * Dry by default. `--apply` is required to write anything.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STOP_FILE = join(ROOT, 'services', 'ingest', '.checkpoints', 'STOP');
const REPORT = join(ROOT, 'docs', 'ops', 'migration', 'new2-ledger-absence-probe.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes('--apply');
/** 0 means "every row". The default is a sample, so an unread invocation is cheap. */
const LIMIT = Number(arg('limit', '500'));
const COURT = arg('court', null);
const CONCURRENCY = Number(arg('concurrency', '8'));
const PAGE = Number(arg('page', '2000'));
const HEAD_TIMEOUT_MS = Number(arg('timeout-ms', '20000'));

/** Statuses that are a definite statement about the OBJECT. See header. */
const ABSENT = new Set([404, 403, 410]);

function stopIfRequested() {
  if (!existsSync(STOP_FILE)) return;
  console.log(`PAUSED by ${STOP_FILE} at a page boundary. Nothing is left half-written — every`);
  console.log('write is a single-row UPDATE. Delete the file and rerun to continue.');
  process.exit(0);
}
stopIfRequested();

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 30, connect_timeout: 30 });

const tally = { absent: 0, unavailable: 0, present: 0, networkError: 0 };
const byStatus = new Map();
const byCourt = new Map();
let probed = 0;
let promoted = 0;
let relabelled = 0;

async function probe(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) });
    return { status: res.status };
  } catch (e) {
    return { status: null, error: (e && e.name) || 'error' };
  }
}

try {
  const courtFilter = COURT ? sql`AND court_code = ${COURT}` : sql``;
  const total = Number(
    (
      await sql`SELECT count(*)::bigint AS n FROM hc_ingest_ledger
                 WHERE outcome = 'pdf_missing' ${courtFilter}`
    )[0].n,
  );
  console.log(
    `${total.toLocaleString()} legacy pdf_missing row(s)${COURT ? ` in court ${COURT}` : ''} · ` +
      `probing ${LIMIT === 0 ? 'ALL' : Math.min(LIMIT, total).toLocaleString()} · ` +
      `${APPLY ? 'APPLY' : 'DRY (nothing will be written)'}`,
  );

  const budget = LIMIT === 0 ? total : Math.min(LIMIT, total);
  let offset = 0;
  while (probed < budget) {
    stopIfRequested();
    const want = Math.min(PAGE, budget - probed);
    /**
     * Ordered by `source_url` — the primary key — so paging is stable while the
     * fleet is writing. A bare LIMIT/OFFSET with no ORDER BY returns whatever
     * the heap hands back, which on this database means one court (bus 0197).
     *
     * OFFSET rather than a keyset cursor because rows leave the result set as
     * they are relabelled: under `--apply` the same OFFSET would skip work, so
     * the offset is advanced only by rows actually seen and the loop re-reads
     * from the top of what still matches on the next invocation.
     */
    const rows = await sql`
      SELECT source_url, court_code, year FROM hc_ingest_ledger
       WHERE outcome = 'pdf_missing' ${courtFilter}
       ORDER BY source_url
       LIMIT ${want} OFFSET ${APPLY ? 0 : offset}
    `;
    if (rows.length === 0) break;
    offset += rows.length;

    const absent = [];
    const unavailable = [];
    let i = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (i < rows.length) {
          const r = rows[i++];
          const { status, error } = await probe(r.source_url);
          probed++;
          const key = status === null ? `net:${error}` : String(status);
          byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
          const bucket = byCourt.get(r.court_code) ?? {
            absent: 0,
            unavailable: 0,
            present: 0,
            networkError: 0,
          };
          if (status === null) {
            tally.networkError++;
            bucket.networkError++;
          } else if (ABSENT.has(status)) {
            tally.absent++;
            bucket.absent++;
            absent.push(r.source_url);
          } else if (status >= 200 && status < 300) {
            tally.present++;
            bucket.present++;
          } else {
            tally.unavailable++;
            bucket.unavailable++;
            unavailable.push(r.source_url);
          }
          byCourt.set(r.court_code, bucket);
        }
      }),
    );

    if (APPLY) {
      if (absent.length > 0) {
        await sql`UPDATE hc_ingest_ledger
                     SET outcome = 'pdf_absent', permanent = true, last_attempted_at = now()
                   WHERE source_url = ANY(${absent}) AND outcome = 'pdf_missing'`;
        promoted += absent.length;
      }
      if (unavailable.length > 0) {
        await sql`UPDATE hc_ingest_ledger
                     SET outcome = 'pdf_unavailable', last_attempted_at = now()
                   WHERE source_url = ANY(${unavailable}) AND outcome = 'pdf_missing'`;
        relabelled += unavailable.length;
      }
      if (absent.length === 0 && unavailable.length === 0) {
        console.log('  page produced no relabelling — stopping so --apply cannot spin.');
        break;
      }
    }
    console.log(
      `  ${probed.toLocaleString()}/${budget.toLocaleString()} probed · ` +
        `absent ${tally.absent.toLocaleString()} · unavailable ${tally.unavailable} · ` +
        `present ${tally.present} · net-error ${tally.networkError}`,
    );
  }
} finally {
  await sql.end({ timeout: 10 });
}

const report = {
  tool: 'scripts/migration/new2-ledger-absence-probe.mjs',
  takenAt: new Date().toISOString(),
  applied: APPLY,
  court: COURT,
  probed,
  tally,
  byStatus: Object.fromEntries([...byStatus].sort((a, b) => b[1] - a[1])),
  byCourt: Object.fromEntries(byCourt),
  written: APPLY ? { promotedToPdfAbsent: promoted, relabelledPdfUnavailable: relabelled } : null,
  note:
    'HEAD only, no bodies fetched. `attempts` deliberately untouched: a probe is not an ingest ' +
    'attempt. A 2xx row is left alone rather than deleted — the object exists, but nothing here ' +
    'has ingested it, and `judgments.source_url` is the only record allowed to claim a success.',
};
writeFileSync(REPORT, `${JSON.stringify(report, null, 1)}\n`);
console.log('\nstatus histogram:');
for (const [k, v] of [...byStatus].sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(12)} ${v.toLocaleString()}`);
console.log(
  APPLY
    ? `\nwrote ${promoted.toLocaleString()} -> pdf_absent (permanent), ${relabelled.toLocaleString()} -> pdf_unavailable`
    : '\nDRY — nothing written. Rerun with --apply to promote the confirmed absences.',
);
console.log(`report: ${REPORT}`);
