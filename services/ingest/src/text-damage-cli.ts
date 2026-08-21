/**
 * NEW2 — RUN THE POSITIVE DAMAGE DETECTOR, AND EXPORT WHAT IT PROVES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO MODES, AND THEY ANSWER DIFFERENT QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   --sample N   uniform draws over `judgments.id`, to MEASURE a rate. Writes
 *                a summary and nothing else. This is how a percentage is
 *                allowed to be quoted.
 *   --export     an id-ordered walk over a range, to ENUMERATE the documents
 *                LCC's span verifier and NEW1's embed queue must refuse. Writes
 *                JSONL, one row per document, VERIFIED only unless --suspect.
 *
 * A sample can never produce the export and the export can never produce the
 * rate, because the export is deliberately run over the ranges that matter most
 * first — ahead of the GPU walk — and a walk chosen for where it is useful is
 * not a uniform draw. Keeping them in one file with one detector is what stops
 * the two disagreeing; keeping their OUTPUTS apart is what stops a biased walk
 * being quoted as a corpus figure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE JSONL IS APPENDED PER PAGE, NOT WRITTEN AT THE END
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A NEW1 benchmark lost 160 of 283 completed queries to a session teardown
 * because the artefact was written once, at the end. This appends every page and
 * records its cursor in a sidecar `.cursor` file, so a killed run has already
 * delivered everything it finished and `--resume` continues from the last
 * committed page rather than from the beginning.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WRITES NOTHING TO THE DATABASE — DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A stored verdict from a superseded detector is indistinguishable from a
 * current one, which is the argument `quality-state.ts` already makes and this
 * file inherits. Every exported row carries `detector` and `span`, so a consumer
 * can tell which version judged it, and a re-run under a new version produces a
 * new file rather than silently mutating 18.6 million rows.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/text-damage-cli.ts --sample 1500
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/text-damage-cli.ts --export --from 0x06 --to 0x30 --resume \
 *       --out ../../docs/ops/migration/new2-text-damage.jsonl
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { DAMAGE_SPAN, TEXT_DAMAGE_VERSION, damageVerdict, isVerifiedReason } from './text-damage.ts';
import { ENGLISH_RATE_FLOOR, englishRate } from './quality-state.ts';
import { MINED_MARKERS, SUSPECT_MARKER_RATE, textSignature } from './legacy-font.ts';
import {
  MAX_SINGLE_CHAR_RATIO,
  MIN_TOKENS_TO_JUDGE,
  MIN_WORD_LIKE_RATIO,
  corruptionSignals,
} from './text-corruption.ts';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : dflt;
};
const has = (name: string) => process.argv.includes(name);

const SAMPLE = argOf('--sample') === null ? 0 : Number(argOf('--sample'));
const EXPORT = has('--export');
const INCLUDE_SUSPECT = has('--suspect');
const PAGE = Number(argOf('--page', '500'));
const LIMIT = argOf('--limit') === null ? Infinity : Number(argOf('--limit'));
const OUT = argOf('--out', '../../docs/ops/migration/new2-text-damage.jsonl')!;
const SUMMARY = argOf('--summary', '../../docs/ops/migration/new2-text-damage-summary.json')!;

/**
 * A range is given as a HEX PREFIX fraction of the uuid space (`0x06`), not as a
 * full uuid, because that is how the two walks this has to line up with are
 * expressed: NEW1's manifest batch 00057 begins at 6.64% of the id space and
 * NEW2's classifier frontier sits at 21.7%. Naming the range in the same units
 * as the thing it is chasing is what stops an off-by-a-nibble.
 */
const pad = (hex: string | null, fill: string): string | null => {
  if (hex === null) return null;
  const h = hex.replace(/^0x/, '').padEnd(8, fill).slice(0, 8);
  return `${h}-0000-0000-0000-000000000000`;
};
const FROM = pad(argOf('--from'), '0') ?? '00000000-0000-0000-0000-000000000000';
const TO = pad(argOf('--to'), 'f') ?? 'ffffffff-ffff-ffff-ffff-ffffffffffff';

type Row = {
  id: string;
  court: string | null;
  source_url: string | null;
  script_quality: string | null;
  text_quality: number | null;
  text_len: number | null;
  head: string | null;
};

/** One place where a row becomes a verdict, so sample and export cannot drift. */
function judge(r: Row) {
  const head = r.head ?? '';
  const sig = corruptionSignals(head);
  const judgeable = sig !== null && sig.tokens >= MIN_TOKENS_TO_JUDGE;
  const marker = textSignature(head, MINED_MARKERS);
  return damageVerdict({
    text: head,
    textLength: r.text_len,
    storedScriptQuality: r.script_quality,
    /* The three screens are computed HERE and passed in, so the pure module
     * never has to know what a Devanagari block or a marker list is. */
    englishDensityLow: marker.zeroDevanagari && head.length >= 1000 && englishRate(head) < ENGLISH_RATE_FLOOR,
    tokenShapeAnomaly:
      judgeable && (sig!.singleCharRatio > MAX_SINGLE_CHAR_RATIO || sig!.wordLikeRatio < MIN_WORD_LIKE_RATIO),
    legacyFontMarkers: marker.zeroDevanagari && marker.markerRate >= SUSPECT_MARKER_RATE,
  });
}

const sql = postgres(url, { max: 4, idle_timeout: 30, connect_timeout: 30 });

const SELECT_COLS = sql`
  j.id, j.court, j.source_url, j.script_quality, j.text_quality,
  length(j.full_text) AS text_len, left(j.full_text, ${DAMAGE_SPAN}) AS head`;

async function runSample(n: number) {
  const points = Array.from({ length: n }, () => randomUUID());
  const rows = await sql<Row[]>`
    SELECT d.* FROM unnest(${points}::uuid[]) AS p(point)
    CROSS JOIN LATERAL (
      SELECT ${SELECT_COLS} FROM judgments j
      WHERE j.id > p.point AND j.court <> 'Supreme Court of India'
      ORDER BY j.id LIMIT 1
    ) d`;

  const byVerdict = new Map<string, number>();
  const byReason = new Map<string, number>();
  const byCourt = new Map<string, { drawn: number; verified: number }>();
  let tqScored = 0;
  let tqAboveFloor = 0;
  for (const r of rows) {
    const v = judge(r);
    byVerdict.set(v.verdict, (byVerdict.get(v.verdict) ?? 0) + 1);
    for (const reason of v.reasons) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    const c = byCourt.get(r.court ?? '(null)') ?? { drawn: 0, verified: 0 };
    c.drawn++;
    if (v.verdict === 'TEXT_UNSAFE_VERIFIED') {
      c.verified++;
      if (r.text_quality !== null) {
        tqScored++;
        if (Number(r.text_quality) >= 0.85) tqAboveFloor++;
      }
    }
    byCourt.set(r.court ?? '(null)', c);
  }

  const verified = byVerdict.get('TEXT_UNSAFE_VERIFIED') ?? 0;
  const summary = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    mode: 'uniform-sample',
    detector: TEXT_DAMAGE_VERSION,
    span: DAMAGE_SPAN,
    drawn: rows.length,
    verdicts: Object.fromEntries(byVerdict),
    verifiedRatePct: +((100 * verified) / (rows.length || 1)).toFixed(2),
    reasons: Object.fromEntries([...byReason.entries()].sort((a, b) => b[1] - a[1])),
    /* Stated on every run, because it is the reason this detector exists and it
     * is the claim most likely to be doubted. */
    textQualityOverVerifiedDamage: {
      scored: tqScored,
      atOrAboveEligibilityFloor: tqAboveFloor,
      note: 'judgments.text_quality admits these; it is not a damage signal.',
    },
    byCourt: Object.fromEntries(
      [...byCourt.entries()]
        .filter(([, v]) => v.drawn >= 20)
        .map(([k, v]) => [k, { ...v, pct: +((100 * v.verified) / v.drawn).toFixed(1) }])
        .sort((a, b) => (b[1] as { pct: number }).pct - (a[1] as { pct: number }).pct),
    ),
    caveats: [
      'Draws are uniform over judgments.id, which is uuid v4. A future non-uniform id scheme silently breaks this sampler and nothing here would notice.',
      'Every rate is over the first ' + DAMAGE_SPAN + ' characters. A document damaged only after that span reads as UNKNOWN.',
      'UNKNOWN is not clean. No detector here looks for evidence that an extraction was faithful.',
    ],
  };
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

async function runExport() {
  const cursorFile = `${OUT}.cursor`;
  let cursor = FROM;
  if (has('--resume') && existsSync(cursorFile)) {
    cursor = readFileSync(cursorFile, 'utf8').trim();
    console.log(`resuming from ${cursor}`);
  } else {
    writeFileSync(OUT, '');
  }

  let walked = 0;
  let written = 0;
  const byReason = new Map<string, number>();
  for (;;) {
    if (walked >= LIMIT) break;
    const page = await sql<Row[]>`
      SELECT ${SELECT_COLS} FROM judgments j
      WHERE j.id > ${cursor}::uuid AND j.id <= ${TO}::uuid
        AND j.court <> 'Supreme Court of India'
      ORDER BY j.id LIMIT ${PAGE}`;
    if (page.length === 0) break;

    const lines: string[] = [];
    for (const r of page) {
      const v = judge(r);
      const emit = v.verdict === 'TEXT_UNSAFE_VERIFIED' || (INCLUDE_SUSPECT && v.verdict === 'TEXT_DAMAGE_SUSPECT');
      if (!emit) continue;
      for (const reason of v.reasons) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      lines.push(
        JSON.stringify({
          documentId: r.id,
          court: r.court,
          verdict: v.verdict,
          reasons: v.reasons,
          verifiedReasons: v.reasons.filter(isVerifiedReason),
          detector: v.detector,
          span: v.evidence.span,
          textLength: v.evidence.textLength,
          evidence: {
            controlDensity: +v.evidence.controlDensity.toFixed(4),
            longestControlRun: v.evidence.longestControlRun,
            longLetterRunShare: +v.evidence.longLetterRunShare.toFixed(4),
            puaDensity: +v.evidence.puaDensity.toFixed(4),
            replacementDensity: +v.evidence.replacementDensity.toFixed(4),
            truncatedShare: v.evidence.truncatedShare,
          },
          /* The PDF is the primary source. Carried so a consumer can check the
           * verdict against the file rather than against our word for it. */
          sourceUrl: r.source_url,
          storedTextQuality: r.text_quality,
          storedScriptQuality: r.script_quality,
        }),
      );
    }
    if (lines.length > 0) appendFileSync(OUT, lines.join('\n') + '\n');
    written += lines.length;
    walked += page.length;
    cursor = page[page.length - 1]!.id;
    /* Cursor AFTER the append, never before: a crash between the two must
     * re-do a page, never skip one. */
    writeFileSync(cursorFile, cursor);
    process.stdout.write(`\r  walked ${walked.toLocaleString()}  emitted ${written.toLocaleString()}`);
    if (page.length < PAGE) break;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    mode: 'range-export',
    detector: TEXT_DAMAGE_VERSION,
    span: DAMAGE_SPAN,
    range: { from: FROM, to: TO },
    lastCursor: cursor,
    walked,
    emitted: written,
    includedSuspect: INCLUDE_SUSPECT,
    reasons: Object.fromEntries([...byReason.entries()].sort((a, b) => b[1] - a[1])),
    out: OUT,
    caveats: [
      'This is a CHOSEN range, not a sample. Its emitted/walked ratio is not a corpus rate — use --sample for that.',
      'Rows are emitted only where a detector fired. Absence from this file is UNKNOWN, never clean.',
    ],
  };
  writeFileSync(SUMMARY.replace(/\.json$/, '-export.json'), JSON.stringify(summary, null, 2));
  console.log('\n' + JSON.stringify(summary, null, 2));
}

try {
  if (SAMPLE > 0) await runSample(SAMPLE);
  else if (EXPORT) await runExport();
  else console.error('usage: --sample <n> | --export [--from 0xNN] [--to 0xNN] [--resume] [--suspect] [--limit n]');
} finally {
  await sql.end();
}
