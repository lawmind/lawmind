/**
 * NEW2 — ARE THE PERMANENT `pdf_failed` ROWS RECOVERABLE? ASK THE BYTES.
 *
 *   node scripts/migration/new2-ledger-failed-probe.mjs               # dry, samples 300
 *   node scripts/migration/new2-ledger-failed-probe.mjs --court 27_1 --limit 2000
 *   node scripts/migration/new2-ledger-failed-probe.mjs --apply --limit 0
 *
 * THE QUESTION
 *
 * `ingest-ledger.ts` promotes a row to `permanent` once `attempts` reaches
 * `MAX_ATTEMPTS = 3`, and `permanentlyFailedUrls()` then excludes it from every
 * future scope, at every width, forever. That is a strong sentence, and the
 * ledger cannot tell on its own whether it was deserved. This asks the source.
 *
 * WHAT THIS FILE GOT WRONG FIRST, BECAUSE THE CORRECTION IS THE WHOLE VALUE
 *
 * The first version probed with `HEAD` and reasoned from a histogram. The
 * histogram was real: 99.5% of the 14,402 permanent `pdf_failed` rows were
 * condemned inside the single hour 2026-08-18 18:00, and 97% were Bombay. That
 * looks exactly like a source having a bad hour while a three-attempt budget ran
 * out inside it. The HEAD probe then returned **200 for 14,402 of 14,402**, and
 * the conclusion drawn was "the permanence was wrong". All 14,402 were cleared.
 *
 * It was not wrong. Fetched in FULL, those objects are:
 *
 *   HTTP 200 · Content-Type: application/pdf · 124 bytes
 *   "<!DOCTYPE html><html><body><center><strong>Welcome User Search Page not
 *    Found here</strong></center></body></html>"
 *
 * A **soft 404**. The upstream stored its own error page under the PDF key and
 * serves it with a PDF content type and a 200. Status, content type and object
 * existence all say "document present"; only the bytes say otherwise. A real one
 * begins `%PDF-` and runs to tens of kilobytes — a known-good Bombay judgment
 * sampled alongside these was 34,899 bytes.
 *
 * The cost of the mistake was measurable: the fleet re-fetched 14,402 error
 * pages and re-condemned them within the hour, and Bombay's permanent
 * `pdf_failed` went 14,004 -> 38,876. The clustering was never evidence of an
 * outage; it was evidence that the worker had reached a contiguous run of dead
 * keys. And this file's own caveat block had already said "a HEAD 200 says the
 * object exists, not that it parses" — the caveat was right, the code did not
 * act on it, and a caveat nobody codes against is decoration.
 *
 * THE VERDICTS, NOW TAKEN FROM THE BODY
 *
 *   real PDF    200, starts `%PDF-`, at least MIN_PDF_BYTES. The document is
 *               there and the permanence was wrong. Cleared to retryable.
 *   hard 404    404/403/410. Genuinely absent -> `pdf_absent`.
 *   SOFT 404    200 whose body is not a PDF. Also genuinely absent, and the more
 *               dangerous of the two because nothing short of reading it says so.
 *               -> `pdf_absent`.
 *   unknown     anything else, any network error, or a `%PDF-` under the size
 *               floor. Left permanent, untouched. A probe that could not tell has
 *               learned nothing, and "could not tell" must never become "fine".
 *
 * `pdf_absent` is the right home for both 404 shapes: it is the population that
 * provider recovery (Indian Kanoon) exists for, and it is NOT a retry queue.
 *
 * This GETs the body, so it costs real bandwidth — bounded by `--limit`, which
 * defaults to 300, and `--concurrency`. It still does not ingest: nothing is
 * parsed, stored, or written to `judgments`.
 *
 * Dry by default. `--apply` is required to write, and every UPDATE re-asserts
 * `outcome = 'pdf_failed' AND permanent = true` in its own WHERE clause so a row
 * a live worker has already moved is never overwritten by this pass.
 */
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-ledger-failed-probe.json');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : (process.argv[i + 1] ?? d);
};
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(arg('limit', '300'));
const COURT = arg('court', null);
const CONCURRENCY = Number(arg('concurrency', '8'));

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

/**
 * THIS PROBE USED TO SEND `HEAD` AND IT WAS THE WRONG INSTRUMENT.
 *
 * A HEAD returning 200 establishes that an OBJECT exists at the key. It does not
 * establish that the object is a DOCUMENT, and this source makes that difference
 * load-bearing. Fetched in full, the condemned Bombay objects return:
 *
 *   HTTP 200 · Content-Type: application/pdf · 124 bytes
 *   "<!DOCTYPE html><html><body><center><strong>Welcome User Search Page not
 *    Found here</strong></center></body></html>"
 *
 * A **soft 404**: the upstream stored its own error page under the PDF key and
 * serves it with a PDF content type. Every signal short of reading the bytes
 * says the document is there. A real one starts `%PDF-` and is tens of kilobytes.
 *
 * The first version of this file probed with HEAD, saw 14,402 of 14,402 return
 * 200, and concluded the permanence was wrong. It was not wrong. Those rows were
 * correctly condemned, clearing them sent the fleet to re-fetch 14,402 error
 * pages, and they were re-condemned within the hour. The tool's own caveat block
 * already said "a HEAD 200 says the object exists, not that it parses" — the
 * caveat was right and the code did not act on it.
 *
 * So the probe now GETs and inspects. `%PDF-` magic and a floor on size, because
 * those are the two things the soft 404 cannot fake.
 *
 * A timeout is still NOT a verdict: it returns `unknown` and changes nothing.
 */
const PDF_MAGIC = '%PDF-';
/**
 * The observed stubs are 124-259 bytes. 1,024 is comfortably above them and far
 * below any real judgment (a known-good Bombay PDF sampled beside them: 34,899
 * bytes). Anything between is reported as `unknown` rather than judged.
 */
const MIN_PDF_BYTES = 1024;

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 404 || res.status === 403 || res.status === 410) {
      return { verdict: 'absent', status: res.status };
    }
    if (res.status !== 200) return { verdict: 'unknown', status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.subarray(0, 5).toString('latin1');
    if (head === PDF_MAGIC && buf.length >= MIN_PDF_BYTES) {
      return { verdict: 'present', status: '200 pdf', bytes: buf.length };
    }
    if (head !== PDF_MAGIC) {
      /* 200 with a body that is not a PDF. The document does not exist at source;
       * the server is lying about it. That is `pdf_absent`, not `pdf_failed` —
       * a different fact, a different recovery route, and it must not sit in a
       * retry queue forever. */
      return { verdict: 'soft404', status: `200 not-pdf ${buf.length}b`, bytes: buf.length };
    }
    return { verdict: 'unknown', status: `200 pdf-too-small ${buf.length}b`, bytes: buf.length };
  } catch (e) {
    return { verdict: 'unknown', status: `network:${e?.name ?? 'error'}` };
  }
}

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 30 });
try {
  const courtFilter = COURT ? sql`AND court_code = ${COURT}` : sql``;
  const [{ total }] = await sql`
    SELECT count(*)::int AS total
      FROM hc_ingest_ledger
     WHERE outcome = 'pdf_failed' AND permanent = true ${courtFilter}`;
  console.log(
    `${total.toLocaleString()} permanent pdf_failed row(s)${COURT ? ` in court ${COURT}` : ''} · ` +
      `${APPLY ? 'APPLY' : 'DRY RUN'} · ${LIMIT === 0 ? 'all' : LIMIT.toLocaleString()} to probe`,
  );

  /* `ORDER BY md5(source_url)` is a stable pseudo-random draw that does not sort
   * the table by a volatile key and does not correlate with insertion order, so
   * a sample is not one court-year's worth of neighbours. */
  const rows = await sql`
    SELECT source_url, court_code, year, attempts, last_attempted_at
      FROM hc_ingest_ledger
     WHERE outcome = 'pdf_failed' AND permanent = true ${courtFilter}
     ORDER BY md5(source_url)
     ${LIMIT === 0 ? sql`` : sql`LIMIT ${LIMIT}`}`;

  const counts = { present: 0, absent: 0, soft404: 0, unknown: 0 };
  const statuses = new Map();
  const byCourt = new Map();
  const present = [];
  const absent = [];
  /* Kept apart from `absent` in memory even though both end as `pdf_absent`, so
   * the REPORT can say how many were an honest 404 and how many were a 200 with
   * an error page in it. Those are the same recovery decision and very different
   * facts about the source. */
  const soft404 = [];
  let i = 0;
  let done = 0;
  const started = Date.now();

  async function worker() {
    for (;;) {
      const r = rows[i++];
      if (!r) return;
      const p = await probe(r.source_url);
      counts[p.verdict]++;
      statuses.set(String(p.status), (statuses.get(String(p.status)) ?? 0) + 1);
      const c = byCourt.get(r.court_code) ?? {
        probed: 0,
        present: 0,
        absent: 0,
        soft404: 0,
        unknown: 0,
      };
      c.probed++;
      c[p.verdict]++;
      byCourt.set(r.court_code, c);
      if (p.verdict === 'present') present.push(r.source_url);
      if (p.verdict === 'absent') absent.push(r.source_url);
      if (p.verdict === 'soft404') soft404.push(r.source_url);
      done++;
      if (done % 200 === 0) {
        const secs = (Date.now() - started) / 1000;
        console.log(
          `  [${done.toLocaleString()}/${rows.length.toLocaleString()}] pdf ${counts.present} · 404 ${counts.absent} · soft404 ${counts.soft404} · unknown ${counts.unknown} · ${(done / Math.max(secs, 1)).toFixed(1)}/s`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  let clearedPermanent = 0;
  let reclassifiedAbsent = 0;
  if (APPLY) {
    for (let k = 0; k < present.length; k += 500) {
      const slice = present.slice(k, k + 500);
      /* attempts reset to 1, not 3 and not 0. Leaving it at 3 would re-condemn
       * every one of these on its very next failure, which is the same trap one
       * hour later. Zero is not available: the table carries
       * `CHECK (attempts > 0)` — a ledger row exists BECAUSE an attempt was made,
       * so "zero attempts" is not a state this table can represent, and the
       * constraint is right to say so. One records the attempt that happened and
       * restores the remaining budget. */
      /* `RETURNING 1` and `res.length`, NOT `res.count`. The first apply run
       * reported `cleared permanent 0` and `reclassified absent 0` while the
       * database moved 39,003 rows from `pdf_failed` to `pdf_absent` — verified
       * by counting the table before and after. `res.count` came back unset on
       * these statements, so the report said nothing had happened while
       * everything had. A write that under-reports itself is worse than one that
       * fails: it invites the operator to run it again. `res.length` over
       * returned rows cannot be unset. */
      const res = await sql`
        UPDATE hc_ingest_ledger
           SET permanent = false, attempts = 1, last_attempted_at = now()
         WHERE source_url = ANY(${slice})
           AND outcome = 'pdf_failed' AND permanent = true
       RETURNING 1`;
      clearedPermanent += res.length;
    }
    /* Both an honest 404 and a soft 404 mean the same thing to a scheduler: the
     * document is not at this source and no retry recovers it. They are written
     * to the same outcome and counted separately in the report, because they are
     * very different facts ABOUT the source. */
    for (const list of [absent, soft404]) {
      for (let k = 0; k < list.length; k += 500) {
        const slice = list.slice(k, k + 500);
        const res = await sql`
          UPDATE hc_ingest_ledger
             SET outcome = 'pdf_absent', permanent = true, last_attempted_at = now()
           WHERE source_url = ANY(${slice})
             AND outcome = 'pdf_failed' AND permanent = true
         RETURNING 1`;
        reclassifiedAbsent += res.length;
      }
    }
  }

  const pct = (x) => `${((100 * x) / Math.max(1, rows.length)).toFixed(1)}%`;
  console.log('');
  console.log('RESULTS');
  console.log(`PROBED            ${rows.length.toLocaleString()}`);
  console.log(
    `real PDF (200, %PDF-)     ${counts.present.toLocaleString()}  ${pct(counts.present)}  the permanence was wrong`,
  );
  console.log(
    `hard 404/403/410          ${counts.absent.toLocaleString()}  ${pct(counts.absent)}  provider recovery, not retry`,
  );
  console.log(
    `SOFT 404 (200, not a PDF) ${counts.soft404.toLocaleString()}  ${pct(counts.soft404)}  the server lies; also provider recovery`,
  );
  console.log(
    `unknown                   ${counts.unknown.toLocaleString()}  ${pct(counts.unknown)}  left permanent, nothing learned`,
  );
  if (APPLY) {
    console.log(`cleared permanent ${clearedPermanent.toLocaleString()}`);
    console.log(`reclassified absent ${reclassifiedAbsent.toLocaleString()}`);
  } else {
    console.log('nothing written — pass --apply');
  }
  console.log('');
  console.log('statuses seen:');
  for (const [k, v] of [...statuses].sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(22)} ${v}`);

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        tool: 'scripts/migration/new2-ledger-failed-probe.mjs',
        takenAt: new Date().toISOString(),
        applied: APPLY,
        courtFilter: COURT,
        populationTotal: total,
        probed: rows.length,
        counts,
        statuses: Object.fromEntries(statuses),
        byCourt: [...byCourt.entries()]
          .map(([court, v]) => ({ court, ...v }))
          .sort((a, b) => b.probed - a.probed),
        clearedPermanent,
        reclassifiedAbsent,
        caveats: [
          'A HEAD 200 says the object exists, not that it parses. A row cleared here re-enters the fetch queue and can fail again for a different reason; that is correct, because it will then be judged on its own evidence rather than on an outage.',
          'unknown NEVER changes a row. A probe that could not reach the object has learned nothing, and recording "could not tell" as "fine" is the failure this file exists to undo.',
          'The sample is ordered by md5(source_url), which is stable and uncorrelated with insertion order, but it is not stratified by court. With 97% of the population in one court, a sample rate is mostly a statement about Bombay.',
          'This does not change MAX_ATTEMPTS. Three attempts with no time spacing will condemn the next outage the same way; the durable fix is spacing attempts in time, which is a change to ingest-ledger.ts and is not made here.',
        ],
      },
      null,
      1,
    ),
  );
  console.log(`\njson: ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
