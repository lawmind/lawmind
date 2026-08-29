/**
 * NEW2 — R10 §1. THE COURT × MONTH PARITY MATRIX.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO PERCENTAGES, AND WHY REPORTING ONE OF THEM ALONE IS A LIE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   actually_held %      held / upstream unique records
 *   accounted_upstream % (held + terminal) / upstream unique records
 *
 * `SOURCE_UNAVAILABLE` closes ACCOUNTING, never completeness. A court whose
 * upstream metadata names 3,587 objects of which the publisher uploaded 109 is
 * 100% accounted and 3% held, and both numbers are true and mean different
 * things. Publishing only the first reads as a finished corpus; publishing only
 * the second reads as a broken pipeline. This file never emits one without the
 * other.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS AN UPSTREAM RECORD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A distinct `pdfUrlFor(partition, basename(pdf_link))` — the exact string that
 * lands in `judgments.source_url` and `hc_ingest_ledger.source_url`. It is the
 * only identity on which the two sides join, and reproducing ingest's own
 * construction is what makes this a set difference rather than a comparison of
 * two similar-looking numbers.
 *
 * The upstream-side dedup is reported ALONGSIDE it as `upstreamCases` — distinct
 * non-blank `cnr`, the publisher's own case identity, which collapses the plain
 * and mobile naming forms of the same case onto one row. It is NOT the
 * accounting denominator, because the ledger terminalises per OBJECT and mixing
 * the two denominators is how a 3% coverage figure gets published for a court
 * that is complete.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEDUP IS PER COURT, NOT PER COURT-MONTH — THE FIRST RUN GOT THIS WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The two parquet variants of a partition describe the same objects and do NOT
 * always agree on `decision_date`. Deduping inside a court-month therefore
 * counted one object once per month it was dated in, and the first run reported
 * `held 18,753,276` against a corpus holding 18,712,922 High Court rows — more
 * matches than there are rows to match. Arithmetically impossible, and the only
 * reason the defect was caught at all.
 *
 * So each object resolves to exactly ONE month before anything is counted: the
 * EARLIEST month any upstream row assigns it. Earliest rather than latest
 * because a later date on a republished row is a restatement, and a decision
 * cannot become newer than it was. `objectsWithConflictingMonths` publishes how
 * often the variants disagreed rather than smoothing it away.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TERMINAL MEANS PROVEN PER ARTIFACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **`permanent = true` IS NOT TERMINAL, AND READING IT THAT WAY WAS THIS FILE'S
 * OWN DEFECT.** `ingest-ledger.ts` sets `permanent` when a RETRYABLE failure
 * exhausts `MAX_ATTEMPTS = 3` — its header says so in as many words: "retrying is
 * pure waste". That is a statement about our download budget, not about whether
 * the publisher has the artifact. The first version of this file divided by it
 * anyway and reported `accounted_upstream 99.963%`.
 *
 * `n2-terminal-reverify.mts` measured the difference rather than arguing it.
 * Every sampled `no_text` object — 410 of 410, across four courts — came back a
 * live, real PDF with `%PDF` magic bytes, and `n2-no-text-diagnose.mts` found 48
 * of 48 to be IMAGE_ONLY: 316 KB to 1.6 MB of scan with a zero-character text
 * layer. The source supplied every one of them. Calling them terminal filed our
 * OCR backlog under the publisher's name.
 *
 * So the ledger splits by what an outcome CLAIMS, never by the flag:
 *
 *   sourceUnavailable  `pdf_absent` (404/403/410 — the object is not there) and
 *                      the metadata-defect outcomes `no_title`,
 *                      `no_decision_date`, `unparseable_date`, `no_pdf_link`,
 *                      `test_fixture_bench`, which are properties of the
 *                      publisher's own row. **These, and only these, close
 *                      accounting.**
 *   retryExhausted     `no_text`, `pdf_failed`, `pdf_timeout`, `pdf_unavailable`,
 *                      `pdf_missing`, whether or not `permanent` is set. The
 *                      artifact is there and we do not hold it. **Ours.**
 *
 * The residual — upstream − held − sourceUnavailable − retryExhausted — is
 * NEVER_ATTEMPTED, and that column is the one that says whether the fleet has
 * walked a court-month at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MEMORY, AND WHY THIS DOES NOT NEED HEAVY_BOX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 19M upstream URLs and 18.7M local URLs will not fit in a Node heap as strings.
 * Both sides reduce to a 64-bit hash in a `BigUint64Array` — 150 MB for the
 * local side — and partitions are folded court by court so only one court's
 * identity map is resident. The local read is ONE ordered sequential pass over
 * two columns, not 26 filtered scans, and it writes nothing.
 *
 * A 64-bit hash over ~19M items carries a birthday collision probability around
 * 1e-5. That is recorded in the artifact rather than assumed away, and the run
 * reports the observed distinct-hash count against the row count so a collision
 * would be visible as a shortfall.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-hc-parity-matrix.mts \
 *     [--upstream .tmp-new2/upstream] [--out docs/ai/new2-r10/parity-matrix.json]
 */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HC = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const UP = join(ROOT, arg('upstream', '.tmp-new2/upstream'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r10/parity-matrix.json'));
const GAPS_OUT = join(ROOT, arg('gaps', '.tmp-new2/parity-gaps.ndjson'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** FNV-1a 64 — enough to separate 19M strings, small enough to hold 19M of. */
function hash64(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h;
}

/** `2026-08` -> 24312. `null` / `unparsed` sort above every real month. */
function monthCode(label: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return 999_999;
  return Number(m[1]) * 12 + Number(m[2]);
}
function monthLabel(code: number): string {
  if (code === 999_999) return 'undated';
  const y = Math.floor((code - 1) / 12);
  const mo = code - y * 12;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

class HashSet {
  private buf: BigUint64Array;
  private n = 0;
  private sorted = false;
  constructor(capacity: number) {
    this.buf = new BigUint64Array(capacity);
  }
  add(h: bigint): void {
    if (this.n === this.buf.length) {
      const next = new BigUint64Array(Math.ceil(this.buf.length * 1.6));
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = h;
    this.sorted = false;
  }
  finish(): void {
    const view = this.buf.subarray(0, this.n);
    view.sort();
    let w = 0;
    for (let i = 0; i < view.length; i++) if (i === 0 || view[i] !== view[i - 1]) view[w++] = view[i]!;
    this.n = w;
    this.sorted = true;
  }
  has(h: bigint): boolean {
    if (!this.sorted) throw new Error('finish() before has()');
    let lo = 0;
    let hi = this.n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.buf[mid]!;
      if (v === h) return true;
      if (v < h) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  }
  get size(): number {
    return this.n;
  }
}

type Cell = {
  court: string;
  month: string;
  upstreamObjects: number;
  upstreamCases: number;
  upstreamRows: number;
  held: number;
  terminal: number;
  retryExhausted: number;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 30, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const [{ n: activeBefore }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM pg_stat_activity WHERE state = 'active'`;

  console.log('[parity] streaming judgments.source_url ...');
  const tHeld = Date.now();
  const held = new HashSet(20_000_000);
  let heldRows = 0;
  {
    const cursor = sql<{ u: string }[]>`
      SELECT source_url AS u FROM judgments
       WHERE source_url LIKE ${HC + '/data/pdf/%'}`.cursor(50_000);
    for await (const chunk of cursor) {
      for (const r of chunk) {
        held.add(hash64(r.u));
        heldRows++;
      }
      if (heldRows % 4_000_000 === 0) console.log(`[parity]   ${heldRows} held urls hashed`);
    }
  }
  held.finish();
  console.log(
    `[parity] held ${heldRows} rows -> ${held.size} distinct hashes in ${((Date.now() - tHeld) / 1000).toFixed(0)}s`,
  );

  console.log('[parity] streaming hc_ingest_ledger ...');
  /**
   * The outcomes that are a claim ABOUT THE SOURCE. Everything else is a claim
   * about us, whatever `permanent` says. Taken from `ingest-ledger.ts`'s own
   * classification, not invented here.
   */
  const SOURCE_UNAVAILABLE_OUTCOMES = new Set([
    'pdf_absent',
    'no_title',
    'no_decision_date',
    'unparseable_date',
    'no_pdf_link',
    'test_fixture_bench',
  ]);
  const terminal = new HashSet(1_000_000);
  const retryExhausted = new HashSet(200_000);
  let ledgerRows = 0;
  const ledgerCensus: Record<string, number> = {};
  {
    const cursor = sql<{ u: string; o: string; p: boolean }[]>`
      SELECT source_url AS u, outcome AS o, permanent AS p FROM hc_ingest_ledger`.cursor(50_000);
    for await (const chunk of cursor) {
      for (const r of chunk) {
        const key = `${r.o}/${r.p ? 'permanent' : 'open'}`;
        ledgerCensus[key] = (ledgerCensus[key] ?? 0) + 1;
        (SOURCE_UNAVAILABLE_OUTCOMES.has(r.o) ? terminal : retryExhausted).add(hash64(r.u));
        ledgerRows++;
      }
    }
  }
  terminal.finish();
  retryExhausted.finish();
  console.log(
    `[parity] ledger ${ledgerRows} rows -> sourceUnavailable ${terminal.size}, retryExhausted(ours) ${retryExhausted.size}`,
  );

  const progress = readFileSync(join(UP, 'progress.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((p) => !p['error'] && !p['skipped']);

  const byCourtPartitions = new Map<string, Record<string, unknown>[]>();
  for (const p of progress) {
    const c = p['courtCode'] as string;
    const list = byCourtPartitions.get(c) ?? [];
    list.push(p);
    byCourtPartitions.set(c, list);
  }
  console.log(`[parity] ${progress.length} partitions across ${byCourtPartitions.size} courts`);

  const cells = new Map<string, Cell>();
  const gapWriter: string[] = [];
  let gapsWritten = 0;
  let monthConflicts = 0;
  mkdirSync(dirname(GAPS_OUT), { recursive: true });
  writeFileSync(GAPS_OUT, '');

  let doneCourts = 0;
  for (const [court, parts] of byCourtPartitions) {
    /**
     * object hash -> earliest month code seen for it.
     *
     * **This is the only per-object structure that survives the partition loop,
     * and it was not always.** An earlier version also kept
     * `Map<hash, {url, bench, year, cnr}>` so the gap list could name its rows.
     * On Allahabad (2,298,496 objects) and Bombay (2,146,389) that is millions of
     * small objects with four string fields each, and the run died **silently**
     * after folding all 25 courts — no output, empty stderr, no artifact, the
     * process simply gone. A crash that leaves nothing behind reads exactly like
     * a job that is still working.
     *
     * The gap list is rebuilt by a SECOND pass over the same local gzip files
     * instead. Re-reading a few hundred MB from disk is cheap; holding 19M
     * objects is not.
     */
    const objMonth = new Map<bigint, number>();
    const casesByMonth = new Map<string, Set<string>>();
    const rowsByMonth = new Map<string, number>();

    for (const p of parts) {
      const year = p['year'] as number;
      const bench = p['bench'] as string;
      const fileName = (p['key'] as string).replace(/[^A-Za-z0-9=._-]/g, '_') + '.ndjson.gz';
      const rl = createInterface({
        input: createReadStream(join(UP, 'partitions', fileName)).pipe(createGunzip()),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line) continue;
        const r = JSON.parse(line) as { b: string | null; m: string; c: string | null };
        rowsByMonth.set(r.m, (rowsByMonth.get(r.m) ?? 0) + 1);
        if (r.c) {
          const s = casesByMonth.get(r.m) ?? new Set<string>();
          s.add(r.c);
          casesByMonth.set(r.m, s);
        }
        if (!r.b) continue;
        const url = `${HC}/data/pdf/year=${year}/court=${court}/bench=${bench}/${r.b}`;
        const h = hash64(url);
        const code = monthCode(r.m);
        const prev = objMonth.get(h);
        if (prev === undefined) {
          objMonth.set(h, code);
        } else if (prev !== code) {
          monthConflicts++;
          if (code < prev) objMonth.set(h, code);
        }
        void url;
      }
    }

    const cellFor = (month: string): Cell => {
      const ck = court + '\t' + month;
      let cell = cells.get(ck);
      if (!cell) {
        cell = {
          court,
          month,
          upstreamObjects: 0,
          upstreamCases: 0,
          upstreamRows: 0,
          held: 0,
          terminal: 0,
          retryExhausted: 0,
        };
        cells.set(ck, cell);
      }
      return cell;
    };
    for (const [m, n] of rowsByMonth) cellFor(m).upstreamRows = n;
    for (const [m, s] of casesByMonth) cellFor(m).upstreamCases = s.size;

    /** Objects belonging to nobody: not held, not source-unavailable, not ours-by-failure. */
    const unaccounted = new Set<bigint>();
    for (const [h, code] of objMonth) {
      const cell = cellFor(monthLabel(code));
      cell.upstreamObjects++;
      if (held.has(h)) cell.held++;
      else if (terminal.has(h)) cell.terminal++;
      else if (retryExhausted.has(h)) cell.retryExhausted++;
      else unaccounted.add(h);
    }

    /*
     * SECOND PASS, only when something is unaccounted, and only to NAME it.
     * A residual of one object should not cost a court's worth of memory during
     * the first pass, and on a healthy court this loop does not run at all.
     */
    if (unaccounted.size > 0 && gapsWritten < 500_000) {
      for (const p of parts) {
        const year = p['year'] as number;
        const bench = p['bench'] as string;
        const fileName = (p['key'] as string).replace(/[^A-Za-z0-9=._-]/g, '_') + '.ndjson.gz';
        const rl = createInterface({
          input: createReadStream(join(UP, 'partitions', fileName)).pipe(createGunzip()),
          crlfDelay: Infinity,
        });
        for await (const line of rl) {
          if (!line) continue;
          const r = JSON.parse(line) as { b: string | null; m: string; c: string | null };
          if (!r.b) continue;
          const url = `${HC}/data/pdf/year=${year}/court=${court}/bench=${bench}/${r.b}`;
          const h = hash64(url);
          if (!unaccounted.has(h)) continue;
          unaccounted.delete(h);
          gapWriter.push(
            JSON.stringify({ court, bench, year, month: monthLabel(objMonth.get(h)!), url, cnr: r.c }),
          );
          gapsWritten++;
          if (gapWriter.length > 20_000) {
            writeFileSync(GAPS_OUT, gapWriter.join('\n') + '\n', { flag: 'a' });
            gapWriter.length = 0;
          }
        }
        if (unaccounted.size === 0) break;
      }
    }

    doneCourts++;
    console.log(`[parity] ${court} (${doneCourts}/${byCourtPartitions.size}) — ${objMonth.size} distinct objects`);
  }
  if (gapWriter.length) writeFileSync(GAPS_OUT, gapWriter.join('\n') + '\n', { flag: 'a' });

  const courtNames = new Map<string, string>();
  {
    const rows = await sql<{ code: string | null; court: string }[]>`
      SELECT DISTINCT source_bench_code AS code, court FROM judgments
       WHERE source_bench_code IS NOT NULL`;
    for (const r of rows) if (r.code && !courtNames.has(r.code)) courtNames.set(r.code, r.court);
  }
  const [{ n: activeAfter }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM pg_stat_activity WHERE state = 'active'`;

  const all = [...cells.values()].sort((a, b) =>
    a.court === b.court ? a.month.localeCompare(b.month) : a.court.localeCompare(b.court),
  );

  const pct = (num: number, den: number) => (den === 0 ? null : Number(((num / den) * 100).toFixed(3)));
  const decorate = (c: Cell & { months?: number }) => ({
    ...c,
    neverAttempted: c.upstreamObjects - c.held - c.terminal - c.retryExhausted,
    actuallyHeldPct: pct(c.held, c.upstreamObjects),
    accountedUpstreamPct: pct(c.held + c.terminal, c.upstreamObjects),
  });

  const byCourt = new Map<string, Cell & { months: number }>();
  for (const c of all) {
    let agg = byCourt.get(c.court);
    if (!agg) {
      agg = { ...c, month: 'ALL', months: 0 };
      byCourt.set(c.court, agg);
    } else {
      agg.upstreamObjects += c.upstreamObjects;
      agg.upstreamCases += c.upstreamCases;
      agg.upstreamRows += c.upstreamRows;
      agg.held += c.held;
      agg.terminal += c.terminal;
      agg.retryExhausted += c.retryExhausted;
    }
    agg.months++;
  }

  const totals = all.reduce(
    (a, c) => ({
      upstreamObjects: a.upstreamObjects + c.upstreamObjects,
      upstreamCases: a.upstreamCases + c.upstreamCases,
      upstreamRows: a.upstreamRows + c.upstreamRows,
      held: a.held + c.held,
      terminal: a.terminal + c.terminal,
      retryExhausted: a.retryExhausted + c.retryExhausted,
    }),
    { upstreamObjects: 0, upstreamCases: 0, upstreamRows: 0, held: 0, terminal: 0, retryExhausted: 0 },
  );

  const artifact = {
    artifact: 'NEW2_HC_PARITY_MATRIX_R10',
    lane: 'NEW2',
    takenAt,
    method: {
      upstreamIdentity: 'distinct pdfUrlFor(partition, basename(pdf_link)) — the exact string ingest stores',
      upstreamDedup:
        'upstreamCases = distinct non-blank cnr, reported beside the object count and never used as the accounting denominator',
      objectMonth: 'each object resolves to the EARLIEST month any upstream row dates it; disagreements counted, not smoothed',
      terminal:
        'hc_ingest_ledger rows whose OUTCOME is a claim about the source — pdf_absent, no_title, no_decision_date, unparseable_date, no_pdf_link, test_fixture_bench. NOT permanent = true, which is a retry-budget flag: 410 of 410 sampled no_text objects marked permanent are live real PDFs.',
      retryExhausted:
        'no_text / pdf_failed / pdf_timeout / pdf_unavailable / pdf_missing, permanent or not — the artifact is upstream and we do not hold it. Ours, never folded into accounted_upstream.',
      neverAttempted: 'upstream − held − terminal − retryExhausted',
      ledgerCensus,
      fixturesExcluded: 'bench=testcase partitions are not walked and not counted',
      hashing:
        'both sides reduced to FNV-1a 64. Over ~19M items the birthday collision probability is ~1e-5; the distinct-hash count is published against the row count so a collision shows as a shortfall.',
      contention: `pg_stat_activity active: ${activeBefore} before, ${activeAfter} after`,
    },
    totals: {
      ...totals,
      neverAttempted: totals.upstreamObjects - totals.held - totals.terminal - totals.retryExhausted,
      actuallyHeldPct: pct(totals.held, totals.upstreamObjects),
      accountedUpstreamPct: pct(totals.held + totals.terminal, totals.upstreamObjects),
      localHeldRowsScanned: heldRows,
      localHeldDistinctHashes: held.size,
      ledgerRowsScanned: ledgerRows,
      upstreamPartitions: progress.length,
      objectsWithConflictingMonths: monthConflicts,
    },
    byCourt: [...byCourt.values()]
      .map((c) => ({ ...decorate(c), courtName: courtNames.get(c.court) ?? null, months: c.months }))
      .sort((a, b) => b.neverAttempted - a.neverAttempted),
    courtMonth: all.map((c) => decorate(c)),
    gapList: GAPS_OUT,
    gapsRecorded: gapsWritten,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1));
  console.log(
    `[parity] upstream ${totals.upstreamObjects} · held ${totals.held} · terminal ${totals.terminal} · retry-exhausted-ours ${totals.retryExhausted} · never-attempted ${artifact.totals.neverAttempted}`,
  );
  console.log(
    `[parity] actually_held ${artifact.totals.actuallyHeldPct}% · accounted_upstream ${artifact.totals.accountedUpstreamPct}%`,
  );
  console.log(`[parity] month conflicts ${monthConflicts}`);
  console.log(`[parity] wrote ${OUT} (${all.length} court-month cells) and ${gapsWritten} gap rows`);
} finally {
  await sql.end({ timeout: 15 });
}
