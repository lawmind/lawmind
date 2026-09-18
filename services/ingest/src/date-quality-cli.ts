/**
 * NEW2 — measure and export date quality. Same two modes, same discipline, and
 * the same refusal to write anything, as `text-damage-cli.ts`.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/date-quality-cli.ts --sample 3000
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/date-quality-cli.ts --export --resume \
 *       --out ../../docs/ops/migration/new2-date-quality.jsonl
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { DATE_QUALITY_VERSION, dateQuality } from './date-quality.ts';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');

const argOf = (n: string, d: string | null = null): string | null => {
  const i = process.argv.indexOf(n);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : d;
};
const has = (n: string) => process.argv.includes(n);

const SAMPLE = argOf('--sample') === null ? 0 : Number(argOf('--sample'));
const PAGE = Number(argOf('--page', '500'));
const LIMIT = argOf('--limit') === null ? Infinity : Number(argOf('--limit'));
const OUT = argOf('--out', '../../docs/ops/migration/new2-date-quality.jsonl')!;
const SUMMARY = argOf('--summary', '../../docs/ops/migration/new2-date-quality-summary.json')!;

/**
 * 6,000 characters, not the whole document.
 *
 * An Indian order prints its date in the cause title and again in the signature
 * block; the head reliably carries the first. Reading `full_text` in full for
 * 18.6M rows would be a different job with a different cost, and the span is
 * reported with every verdict so nobody has to guess which was used.
 */
const SPAN = Number(argOf('--span', '6000'));

type Row = {
  id: string;
  court: string | null;
  jd: string | null;
  source_url: string | null;
  head: string | null;
};

const sql = postgres(url, { max: 4, idle_timeout: 30, connect_timeout: 30 });
const COLS = sql`
  j.id, j.court, to_char(j.judgment_date, 'YYYY-MM-DD') AS jd, j.source_url,
  left(j.full_text, ${SPAN}) AS head`;

const judge = (r: Row) =>
  dateQuality({ judgmentDate: r.jd, sourceUrl: r.source_url, text: r.head });

async function runSample(n: number) {
  const points = Array.from({ length: n }, () => randomUUID());
  const rows = await sql<Row[]>`
    SELECT d.* FROM unnest(${points}::uuid[]) AS p(point)
    CROSS JOIN LATERAL (
      SELECT ${COLS} FROM judgments j
      WHERE j.id > p.point AND j.court <> 'Supreme Court of India'
      ORDER BY j.id LIMIT 1
    ) d`;

  const byState = new Map<string, number>();
  const byMethod = new Map<string, number>();
  const offByOneByCourt = new Map<string, number>();
  const deltaBuckets = new Map<string, number>();
  let withFilename = 0;
  let filenameAgrees = 0;
  for (const r of rows) {
    const v = judge(r);
    byState.set(v.state, (byState.get(v.state) ?? 0) + 1);
    byMethod.set(v.method, (byMethod.get(v.method) ?? 0) + 1);
    if (v.filenameDeltaDays !== null) {
      withFilename++;
      if (v.filenameDeltaDays === 0) filenameAgrees++;
      const a = Math.abs(v.filenameDeltaDays);
      const b =
        a === 0
          ? 'exact'
          : a === 1
            ? 'off_by_one_day'
            : a <= 90
              ? '2_to_90_days'
              : a <= 366
                ? 'under_a_year'
                : 'over_a_year';
      deltaBuckets.set(b, (deltaBuckets.get(b) ?? 0) + 1);
    }
    if (v.offByOneDay) {
      const c = r.court ?? '(null)';
      offByOneByCourt.set(c, (offByOneByCourt.get(c) ?? 0) + 1);
    }
  }

  const suspect = byState.get('DATE_SUSPECT') ?? 0;
  const summary = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    mode: 'uniform-sample',
    detector: DATE_QUALITY_VERSION,
    span: SPAN,
    drawn: rows.length,
    states: Object.fromEntries(byState),
    suspectRatePct: +((100 * suspect) / (rows.length || 1)).toFixed(2),
    methods: Object.fromEntries([...byMethod.entries()].sort((a, b) => b[1] - a[1])),
    filenameWitness: {
      present: withFilename,
      agrees: filenameAgrees,
      disagreeRatePct: +((100 * (withFilename - filenameAgrees)) / (withFilename || 1)).toFixed(2),
      buckets: Object.fromEntries([...deltaBuckets.entries()].sort((a, b) => b[1] - a[1])),
    },
    offByOneByCourt: Object.fromEntries([...offByOneByCourt.entries()].sort((a, b) => b[1] - a[1])),
    caveats: [
      'The S3 partition year is NOT used as a witness: it agrees with judgment_date 3,000/3,000, so it shares an origin with it and corroborates nothing.',
      'DATE_VERIFIED requires the DOCUMENT to print the stored date. A filename match alone is the publisher agreeing with itself.',
      'A document that prints no date is silent, not contradicting. Text-damaged documents therefore read DATE_UNKNOWN, not DATE_SUSPECT.',
      'Nothing is corrected. No date is re-derived from a witness.',
    ],
  };
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

async function runExport() {
  const cursorFile = `${OUT}.cursor`;
  let cursor = '00000000-0000-0000-0000-000000000000';
  if (has('--resume') && existsSync(cursorFile)) cursor = readFileSync(cursorFile, 'utf8').trim();
  else writeFileSync(OUT, '');

  let walked = 0;
  let written = 0;
  for (;;) {
    if (walked >= LIMIT) break;
    const page = await sql<Row[]>`
      SELECT ${COLS} FROM judgments j
      WHERE j.id > ${cursor}::uuid AND j.court <> 'Supreme Court of India'
      ORDER BY j.id LIMIT ${PAGE}`;
    if (page.length === 0) break;
    const lines: string[] = [];
    for (const r of page) {
      const v = judge(r);
      if (v.state !== 'DATE_SUSPECT') continue;
      lines.push(
        JSON.stringify({
          documentId: r.id,
          court: r.court,
          state: v.state,
          method: v.method,
          detector: DATE_QUALITY_VERSION,
          span: SPAN,
          storedDate: r.jd,
          witnesses: v.witnesses,
          filenameDeltaDays: v.filenameDeltaDays,
          offByOneDay: v.offByOneDay,
          sourceUrl: r.source_url,
        }),
      );
    }
    if (lines.length > 0) appendFileSync(OUT, lines.join('\n') + '\n');
    written += lines.length;
    walked += page.length;
    cursor = page[page.length - 1]!.id;
    writeFileSync(cursorFile, cursor);
    process.stdout.write(
      `\r  walked ${walked.toLocaleString()}  suspect ${written.toLocaleString()}`,
    );
    if (page.length < PAGE) break;
  }
  console.log(`\nwalked ${walked} · suspect ${written} · cursor ${cursor}`);
}

try {
  if (SAMPLE > 0) await runSample(SAMPLE);
  else if (has('--export')) await runExport();
  else console.error('usage: --sample <n> | --export [--resume] [--limit n]');
} finally {
  await sql.end();
}
