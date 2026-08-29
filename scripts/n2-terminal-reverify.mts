/**
 * NEW2 — R10 §1. RE-VERIFY THE TERMINAL MARKS AGAINST THE LIVE BUCKET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: A TERMINAL MARK IS A CLAIM WITH AN EXPIRY DATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 225,025 objects are marked `permanent` in `hc_ingest_ledger`, and the parity
 * matrix uses exactly those to move `accounted_upstream` from 98.775% to
 * 99.963%. **That single column is doing all the work of the difference**, so if
 * the marks are wrong the headline is wrong, and it is wrong in the flattering
 * direction.
 *
 * They can go stale in the way that matters. Every one was written between 18
 * and 29 August against a bucket that WRITES DAILY (`aws-open-data-bucket-is-
 * static` is the standing correction). An object the publisher had not uploaded
 * on 18 August may be there today, and nothing re-asks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS PRESENT, AND WHY HEAD IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This bucket serves **soft 404s**: HTTP 200, `Content-Type: application/pdf`,
 * and a 129-byte HTML error page in the body (`soft-404-serves-200-as-pdf`). A
 * HEAD sees a 200 and a plausible content-type and cannot tell the difference.
 *
 * So every probe is a bounded GET and the verdict is the first bytes:
 *
 *   PRESENT   200 and the body starts `%PDF`
 *   SOFT_404  200 and it does not — the publisher uploaded an error page
 *   ABSENT    404 / 403
 *   ERROR     anything else, after the bounded retry — NOT a terminal state
 *
 * Only PRESENT reopens a terminal mark. SOFT_404 and ABSENT confirm it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLUSTERS ARE A DIAGNOSIS, NOT A SAMPLING UNIT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The sample is drawn PER COURT and PER OUTCOME, never corpus-wide, because a
 * corpus-wide sample of 225,025 marks that are 66% Bombay would report Bombay's
 * behaviour as everyone's. The founder's rule is that a failure clustering by
 * court, object, parser or source pattern is a defect to diagnose — which is
 * only possible if the measurement can see the cluster.
 *
 * `no_text` is sampled separately and reported separately, because it is NOT a
 * statement about the source at all: it says WE got no text out of a PDF we
 * successfully fetched. A `no_text` marked permanent is our extraction failure
 * recorded as the publisher's absence, and it is the one class here that cannot
 * honestly be terminal.
 *
 * Read-only against the database. Network. Writes one artifact.
 *
 * Usage:
 *   tsx scripts/n2-terminal-reverify.mts [--per-court 120] [--concurrency 8]
 *                                        [--out docs/ai/new2-r10/terminal-reverify.json]
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const PER_COURT = Number(arg('per-court', '120'));
const CONCURRENCY = Number(arg('concurrency', '8'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r10/terminal-reverify.json'));
const ROWS = join(ROOT, arg('rows', '.tmp-new2/terminal-reverify-rows.ndjson'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Verdict = 'PRESENT' | 'SOFT_404' | 'ABSENT' | 'ERROR';

/**
 * The bounded per-artifact retry policy, applied to ONE object.
 *
 * Three attempts with backoff, and a transport failure after all three is
 * ERROR — never ABSENT. "We could not reach it" and "it is not there" are
 * different findings and only the second may terminalise a record.
 */
async function probe(url: string): Promise<{ verdict: Verdict; status: number | null; bytes: number; head: string }> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-reverify/1.0', Range: 'bytes=0-4095' } });
      lastStatus = res.status;
      if (res.status === 404 || res.status === 403) return { verdict: 'ABSENT', status: res.status, bytes: 0, head: '' };
      if (!res.ok && res.status !== 206) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const magic = buf.subarray(0, 5).toString('latin1');
      return {
        verdict: magic.startsWith('%PDF') ? 'PRESENT' : 'SOFT_404',
        status: res.status,
        bytes: Number(res.headers.get('content-range')?.split('/')[1] ?? buf.length),
        head: buf.subarray(0, 100).toString('utf8').replace(/\s+/g, ' ').trim(),
      };
    } catch {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  return { verdict: 'ERROR', status: lastStatus, bytes: 0, head: '' };
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  mkdirSync(dirname(ROWS), { recursive: true });
  writeFileSync(ROWS, '');

  /**
   * The population, so every sample rate is stated against its own stratum
   * rather than against a corpus total.
   */
  const strata = await sql<{ court_code: string; outcome: string; permanent: boolean; n: string }[]>`
    SELECT court_code, outcome, permanent, count(*)::text AS n
      FROM hc_ingest_ledger
     GROUP BY 1, 2, 3
     ORDER BY count(*) DESC`;

  const results: Record<string, unknown>[] = [];
  for (const s of strata) {
    /*
     * `ORDER BY md5(source_url)` rather than a bare LIMIT.
     * `limit-after-filter-is-not-a-sample`: a court-clustered slab returned in
     * heap order understated a rate by 2.8x here once. The hash order is stable,
     * reproducible, and uncorrelated with insertion.
     */
    const rows = await sql<{ source_url: string; attempts: number; last_attempted_at: string }[]>`
      SELECT source_url, attempts, last_attempted_at
        FROM hc_ingest_ledger
       WHERE court_code = ${s.court_code} AND outcome = ${s.outcome} AND permanent = ${s.permanent}
       ORDER BY md5(source_url)
       LIMIT ${PER_COURT}`;

    const probes = await pool(rows, CONCURRENCY, async (r) => ({ row: r, probe: await probe(r.source_url) }));
    const tally: Record<Verdict, number> = { PRESENT: 0, SOFT_404: 0, ABSENT: 0, ERROR: 0 };
    let buf = '';
    for (const p of probes) {
      tally[p.probe.verdict]++;
      buf +=
        JSON.stringify({
          court: s.court_code,
          outcome: s.outcome,
          permanent: s.permanent,
          url: p.row.source_url,
          attempts: p.row.attempts,
          lastAttemptedAt: p.row.last_attempted_at,
          verdict: p.probe.verdict,
          status: p.probe.status,
          bytes: p.probe.bytes,
          head: p.probe.head.slice(0, 120),
        }) + '\n';
    }
    appendFileSync(ROWS, buf);

    const reopened = tally.PRESENT;
    results.push({
      court: s.court_code,
      outcome: s.outcome,
      permanent: s.permanent,
      population: Number(s.n),
      sampled: probes.length,
      ...tally,
      /** The share of the sample that is a live, real PDF today. */
      presentRate: probes.length ? Number((tally.PRESENT / probes.length).toFixed(4)) : null,
      /** What the sample implies for the stratum, stated as an estimate, never as a count of rows. */
      impliedStillRecoverable: probes.length ? Math.round((tally.PRESENT / probes.length) * Number(s.n)) : null,
      verdict:
        s.outcome === 'no_text'
          ? 'NOT_A_SOURCE_CLAIM — no_text says our extraction produced nothing from a PDF we fetched; it can never prove the artifact unavailable'
          : reopened === 0
            ? 'TERMINAL_CONFIRMED'
            : 'TERMINAL_STALE — the publisher has since uploaded objects this stratum calls permanently absent',
    });
    console.log(
      `[reverify] ${s.court_code} ${s.outcome} perm=${s.permanent} pop=${s.n} sampled=${probes.length} ` +
        `PRESENT=${tally.PRESENT} SOFT_404=${tally.SOFT_404} ABSENT=${tally.ABSENT} ERROR=${tally.ERROR}`,
    );
  }

  const permanentStrata = results.filter((r) => r['permanent'] === true);
  const stale = permanentStrata.filter((r) => (r['PRESENT'] as number) > 0);
  const noTextPermanent = permanentStrata.filter((r) => r['outcome'] === 'no_text');

  const artifact = {
    artifact: 'NEW2_TERMINAL_REVERIFY_R10',
    lane: 'NEW2',
    takenAt,
    method: {
      probe: 'bounded GET of the first 4 KB, three attempts with backoff; the verdict is the magic bytes, not the status',
      whyNotHead:
        'this bucket serves soft 404s — 200 with Content-Type application/pdf and an HTML error page in the body. A HEAD cannot see it.',
      sampling: `per court AND per outcome, ORDER BY md5(source_url), up to ${PER_COURT} each — never a corpus-wide draw, because 66% of the permanent marks are one court`,
      errorIsNotAbsent: 'a transport failure after three attempts is ERROR and may never terminalise a record',
    },
    populationTotals: {
      ledgerRows: strata.reduce((a, s) => a + Number(s.n), 0),
      permanent: strata.filter((s) => s.permanent).reduce((a, s) => a + Number(s.n), 0),
      open: strata.filter((s) => !s.permanent).reduce((a, s) => a + Number(s.n), 0),
    },
    headline: {
      permanentStrataSampled: permanentStrata.length,
      permanentStrataWithLiveObjects: stale.length,
      noTextMarkedPermanent: noTextPermanent.reduce((a, r) => a + (r['population'] as number), 0),
      note:
        'a no_text row marked permanent is our extraction verdict recorded as the source being unavailable. It is counted here as accounting we should not be claiming, whatever the probe says.',
    },
    strata: results,
    rows: ROWS,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1));
  console.log(`[reverify] wrote ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
