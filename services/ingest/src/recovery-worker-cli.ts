/**
 * NEW2 — WORK THE RECOVERY QUEUE.
 *
 * Claims a document, renders and OCRs its pages through
 * `scripts/new2-ocr-recover.py`, adjudicates the digits, and writes the result
 * BESIDE the original extraction. Never over it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ENGINE IS A CHILD PROCESS AND THAT IS THE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PDF rendering and OCR are Python (`pymupdf` + `rapidocr-onnxruntime`, both
 * already settled by OD-7 and already installed). The queue, the retries, the
 * transient-error policy and the digit adjudication are TypeScript, where the
 * rest of this service's writers already live.
 *
 * One long-lived child, fed line by line, rather than one process per document:
 * `RapidOCR()` loads its models on construction and paying that per document
 * would dominate a 3.7 s page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A FAILURE IS NEVER `UNRECOVERABLE`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A fetch that 404s, a soft 404 serving HTML as a PDF, a render that throws —
 * these are `FAILED`, which is retryable. `UNRECOVERABLE` means OCR RAN and the
 * output is still not text, and the probe found 0 of 20 in that state.
 *
 * The distinction is load-bearing: `TEXT_UNRECOVERABLE` applied to this
 * population would foreclose 1.6M documents on evidence that says the opposite,
 * and it is exactly the kind of label nobody ever re-tests.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/recovery-worker-cli.ts --limit 5            # dry run: no writes
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/recovery-worker-cli.ts --confirm --limit 63
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db-host.ts';
import { withTransientRetry } from './db-transient.ts';
import { digitTrust } from './ocr-digit-trust.ts';

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};

const CONFIRM = process.argv.includes('--confirm');
const LIMIT = Number(argOf('limit', '10'));
const DPI = argOf('dpi', '200')!;
const MAX_PAGES = argOf('max-pages', '40')!;
const PYTHON = argOf('python', 'python')!;
const SCRIPT = argOf('script', '../../scripts/new2-ocr-recover.py')!;
const JSON_OUT = argOf('json', '../../docs/ops/new2/recovery-worker.json')!;

/**
 * The floor a recovery must clear to be called RECOVERED.
 *
 * Taken from the probe rather than chosen: the twenty recovered suspects
 * measured median English rate 46.3 and control density 0, while every
 * unrecovered glyph dump measured control density ~0.70. The gap is enormous, so
 * the threshold does not need to be clever — it needs to be a threshold that
 * exists, and to be stated where a later reader can re-derive it.
 */
const RECOVERED_MIN_ENGLISH_RATE = 12;
const RECOVERED_MAX_CONTROL_DENSITY = 0.02;

type QueueRow = {
  judgment_id: string;
  reason: string;
  priority: number;
  source_url: string | null;
  case_number: string | null;
  judgment_date: string | null;
  court: string | null;
};

type OcrOut = {
  judgmentId: string;
  sourceUrl?: string;
  engine?: string;
  dpi?: number;
  pageCount?: number;
  pagesRead?: number;
  truncated?: boolean;
  text?: string;
  score?: { chars: number; controlDensity: number; englishRate: number };
  seconds?: number;
  error?: string;
};

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL unset');
  process.exit(2);
}
const sql = await openDb(url, 2, 10 * 60_000);

/**
 * Claim work.
 *
 * `FOR UPDATE SKIP LOCKED` in a CTE, so two workers on one queue take disjoint
 * sets rather than racing on the same row. Under `--confirm` the claim also
 * flips the state, which is what makes the claim real rather than advisory.
 */
const claimed = CONFIRM
  ? await sql<QueueRow[]>`
      WITH picked AS (
        SELECT q.judgment_id
          FROM judgment_recovery_queue q
         WHERE q.state = 'QUEUED'
         ORDER BY q.priority, q.queued_at
         LIMIT ${LIMIT}
           FOR UPDATE SKIP LOCKED
      ), held AS (
        UPDATE judgment_recovery_queue q
           SET state = 'RUNNING', started_at = now(), attempts = q.attempts + 1
          FROM picked p
         WHERE q.judgment_id = p.judgment_id
        RETURNING q.judgment_id, q.reason, q.priority
      )
      SELECT h.judgment_id, h.reason, h.priority,
             j.source_url, j.case_number, j.judgment_date::text, j.court
        FROM held h JOIN judgments j ON j.id = h.judgment_id
       ORDER BY h.priority`
  : await sql<QueueRow[]>`
      SELECT q.judgment_id, q.reason, q.priority,
             j.source_url, j.case_number, j.judgment_date::text, j.court
        FROM judgment_recovery_queue q
        JOIN judgments j ON j.id = q.judgment_id
       WHERE q.state = 'QUEUED'
       ORDER BY q.priority, q.queued_at
       LIMIT ${LIMIT}`;

console.log(
  `${CONFIRM ? 'WORKING' : 'DRY RUN'} — ${claimed.length} document(s), ` +
    `dpi ${DPI}, up to ${MAX_PAGES} pages each`,
);
if (claimed.length === 0) {
  console.log('queue is empty — run recovery-queue-cli.ts first');
  await sql.end({ timeout: 5 });
  process.exit(0);
}

/* A row with no source_url can never be fetched. FAILED with the reason stated,
 * rather than handed to a child process that will fail more expensively. */
const fetchable = claimed.filter((r) => r.source_url);
const unfetchable = claimed.filter((r) => !r.source_url);
for (const r of unfetchable) {
  console.log(`  ${r.judgment_id} — no source_url, cannot fetch`);
  if (CONFIRM) {
    await sql`
      UPDATE judgment_recovery_queue
         SET state = 'FAILED', last_error = 'no source_url', finished_at = now()
       WHERE judgment_id = ${r.judgment_id}`;
  }
}

const byId = new Map(fetchable.map((r) => [r.judgment_id, r]));

const child = spawn(PYTHON, [SCRIPT, '--dpi', DPI, '--max-pages', MAX_PAGES], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const tally = {
  attempted: fetchable.length,
  recovered: 0,
  unrecoverable: 0,
  failed: unfetchable.length,
  digitTrust: { CROSSCHECKED: 0, SUSPECT: 0, UNVERIFIED: 0 } as Record<string, number>,
  seconds: 0,
  pages: 0,
};
const detail: unknown[] = [];

const done = (async () => {
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let out: OcrOut;
    try {
      out = JSON.parse(line) as OcrOut;
    } catch {
      console.error(`  unparseable engine output: ${line.slice(0, 160)}`);
      continue;
    }
    const row = byId.get(out.judgmentId);
    if (!row) continue;

    if (out.error) {
      tally.failed += 1;
      console.log(`  FAILED   ${out.judgmentId}  ${out.error}`);
      detail.push({ judgmentId: out.judgmentId, state: 'FAILED', error: out.error });
      if (CONFIRM) {
        await withTransientRetry('fail', async () => {
          await sql`
            UPDATE judgment_recovery_queue
               SET state = 'FAILED', last_error = ${out.error!}, finished_at = now()
             WHERE judgment_id = ${out.judgmentId}`;
        });
      }
      continue;
    }

    const s = out.score ?? { chars: 0, controlDensity: 1, englishRate: 0 };
    const recovered =
      s.englishRate >= RECOVERED_MIN_ENGLISH_RATE &&
      s.controlDensity <= RECOVERED_MAX_CONTROL_DENSITY;

    const verdict = digitTrust({
      text: out.text ?? '',
      caseNumber: row.case_number,
      judgmentDate: row.judgment_date,
    });
    tally.digitTrust[verdict.trust] = (tally.digitTrust[verdict.trust] ?? 0) + 1;
    tally.seconds += out.seconds ?? 0;
    tally.pages += out.pagesRead ?? 0;
    if (recovered) tally.recovered += 1;
    else tally.unrecoverable += 1;

    console.log(
      `  ${recovered ? 'RECOVERED' : 'UNRECOVER'} ${out.judgmentId}  ` +
        `${out.pagesRead}/${out.pageCount}p  eng ${s.englishRate}  ctrl ${s.controlDensity}  ` +
        `digits ${verdict.trust}  ${out.seconds}s`,
    );
    detail.push({
      judgmentId: out.judgmentId,
      reason: row.reason,
      court: row.court,
      state: recovered ? 'RECOVERED' : 'UNRECOVERABLE',
      score: s,
      pagesRead: out.pagesRead,
      pageCount: out.pageCount,
      truncated: out.truncated,
      digitTrust: verdict.trust,
      witnesses: verdict.witnesses,
      damagedNumbers: verdict.damagedNumbers,
      seconds: out.seconds,
    });

    if (!CONFIRM) continue;

    await withTransientRetry('write recovery', async () => {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO judgment_text_recovery
            (judgment_id, method, engine_version, source_url, page_from, page_to,
             pages_read, recovered_text, char_count, control_density, english_rate,
             digit_trust, digit_evidence)
          VALUES (${out.judgmentId}, 'OCR_RENDERED_PAGE', ${out.engine ?? 'unknown'},
                  ${out.sourceUrl ?? null}, 1, ${out.pagesRead ?? null},
                  ${out.pagesRead ?? null}, ${out.text ?? null}, ${s.chars},
                  ${s.controlDensity}, ${s.englishRate}, ${verdict.trust},
                  ${sql.json({
                    version: verdict.version,
                    witnesses: verdict.witnesses,
                    damagedNumbers: verdict.damagedNumbers,
                    truncated: out.truncated ?? false,
                    pageCount: out.pageCount ?? null,
                  })})`;
        await tx`
          UPDATE judgment_recovery_queue
             SET state = ${recovered ? 'RECOVERED' : 'UNRECOVERABLE'},
                 finished_at = now(), last_error = NULL
           WHERE judgment_id = ${out.judgmentId}`;
      });
    });
  }
})();

for (const r of fetchable) {
  child.stdin.write(
    JSON.stringify({ judgmentId: r.judgment_id, sourceUrl: r.source_url }) + '\n',
  );
}
child.stdin.end();
await done;
await new Promise<void>((resolve) => child.on('close', () => resolve()));

console.log(
  `\n${CONFIRM ? 'WROTE' : 'WOULD WRITE'} — ${tally.attempted} attempted\n` +
    `  recovered      ${tally.recovered}\n` +
    `  unrecoverable  ${tally.unrecoverable}\n` +
    `  failed         ${tally.failed}\n` +
    `  digit trust    CROSSCHECKED ${tally.digitTrust['CROSSCHECKED'] ?? 0} · ` +
    `SUSPECT ${tally.digitTrust['SUSPECT'] ?? 0} · UNVERIFIED ${tally.digitTrust['UNVERIFIED'] ?? 0}\n` +
    `  cost           ${tally.pages} pages, ${tally.seconds.toFixed(0)}s ` +
    `(${tally.pages ? (tally.seconds / tally.pages).toFixed(1) : '-'}s/page, LOCAL_CONTENDED)`,
);

mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(
  JSON_OUT,
  JSON.stringify(
    { kind: 'new2_recovery_worker', confirmed: CONFIRM, at: new Date().toISOString(), tally, detail },
    null,
    1,
  ),
);

await sql.end({ timeout: 5 });
