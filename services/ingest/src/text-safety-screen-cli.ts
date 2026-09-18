/**
 * LCC — WRITE THE POSITIVE TEXT-DAMAGE VERDICT THE CONTRACT ALREADY REFUSES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS WHEN `script-quality-cli.ts` ALREADY WALKS THE SAME ROWS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2's screen fires on ONE damage mode: Kruti-Dev-family Hindi rendered as
 * ASCII, caught by mined markers. It counts a second mode and deliberately does
 * not write it — the counter is literally called
 * `zeroDevanagariBelowThreshold`. That second mode is the larger one.
 *
 * NEW1 then measured what the unwritten verdict costs (bus 0936): **50,108 of
 * 542,980 staged vectors — 9.23% — are over text nobody can read.** Punjab and
 * Haryana 56.0%, Karnataka 49.7%. `text_quality` scores those rows at a median
 * of 1.000, so `axis_b_text` admits every one, and the GPU has already spent the
 * time. Scaled across the remaining manifest that is roughly 815,000 documents
 * and ~0.9 GPU-days still to come.
 *
 * So the gap was never a missing RULE. `axis_b_text` is an allow-list —
 * `script_quality IS NULL OR IN ('clean','mixed_script_ok')` — and it has
 * refused every damage verdict since 0056. The gap is that 99.7% of the corpus
 * has no verdict at all. **This is the writer.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE DEFINITION OF THE FLOOR, IMPORTED, NEVER REIMPLEMENTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The verdict comes from NEW2's `quality-state.ts` — `textVerdict()` — with no
 * local threshold of any kind. NEW1 reused the same 12-per-thousand floor for
 * its measurement, so the number in the bus message, the number in NEW2's audit
 * and the number this CLI writes are the same screen or they are a bug.
 *
 * A second copy of `ENGLISH_RATE_FLOOR` in this file would be the `bail_order`
 * mistake again: a private judgement about eligibility that agrees with the
 * contract on the day it is written and silently diverges afterwards.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WRITES ONLY WHERE NOBODY HAS RULED, WHICH IS WHAT MAKES TWO WRITERS SAFE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every page is filtered to `script_quality IS NULL`. A stored verdict was made
 * with evidence a text scan does not have — a second extraction, or the PDF's
 * own font dictionary — and outranks this pass permanently. So NEW2's CLI and
 * this one can run concurrently over the same corpus and cannot contend for a
 * row: the first to rule owns it, and neither ever overwrites the other.
 *
 * The values written are NEW2's own vocabulary from migration 0056, not new
 * synonyms, and the method string is whatever `textVerdict` reports, so a row
 * written here is indistinguishable from one written there and groups with it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO WRITE — the whole discipline of the thing
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `UNKNOWN` is never written. A pure-ASCII English judgment and a Hindi judgment
 * whose Devanagari the extractor deleted are the same bytes to every check
 * available at scan time, so this pass can prove damage and can never prove
 * health. Leaving the column NULL keeps those documents ELIGIBLE, which is
 * correct: absence of evidence is not evidence of damage, and 18.6M rows have
 * never been looked at.
 *
 * `clean` is therefore never written either. Only a screen holding the PDF's own
 * fonts may say that, and this one holds text.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUARANTINE, NEVER DELETE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing is deleted and no vector is touched. A document repaired by OCR walks
 * straight back into the corpus when its `script_quality` is cleared, and every
 * row written is listed in the JSONL artefact with the two rates that decided
 * it, so a reversal needs no re-derivation.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/text-safety-screen-cli.ts --staged [--limit 100000] [--confirm]
 *
 *   --staged        screen only documents NEW1 has already staged vectors for.
 *                   The GPU-protecting pass, and the one to run first.
 *   --courts a,b    partition codes as they appear in source_url.
 *   --confirm       write. Dry by default: this makes documents ineligible.
 *   --restart       drop the checkpoint and walk from the beginning.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { openDb } from './db-host.ts';
import { pageAll, type ScreenRow } from './script-quality-page.ts';
import { QUALITY_STATE_VERSION, textVerdict, type TextQualityState } from './quality-state.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};

const CONFIRM = process.argv.includes('--confirm');
const RESTART = process.argv.includes('--restart');
const STAGED = process.argv.includes('--staged');
const LIMIT = Number(argOf('limit', '0'));
const BATCH = Number(argOf('batch', '2000'));
const COURTS = (argOf('courts') ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);
const JSON_OUT = argOf('json', '../../docs/ai/lcc-text-safety/screen-summary.json')!;
const JSONL_OUT = argOf('jsonl', '../../docs/ai/lcc-text-safety/screen-written.jsonl')!;

const SCOPE = STAGED ? 'staged' : COURTS.length ? `courts-${COURTS.join('-')}` : 'all';
const CKPT = join(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  '.checkpoints',
  `text-safety-screen-${SCOPE}.json`,
);

/**
 * The state → stored value map, and the two states deliberately absent.
 *
 * `UNKNOWN` and `KNOWN_GOOD` are not here. Their absence from a lookup is a
 * refusal the type system can see; mapped-and-then-filtered is one a reader has
 * to find. Same reasoning `propagate-treatment.ts` uses for `overruled_in_part`.
 */
const VALUE_FOR: Readonly<Partial<Record<TextQualityState, string>>> = {
  /* No Devanagari at all AND English function-word density below the measured
   * floor. Not a document in either script this corpus holds, whatever it is.
   *
   * `damaged_other` rather than a new value, and the precision is not lost: the
   * method written alongside it is `english_density_screen_v1`, so this finding
   * groups separately from every other `damaged_other` in any query. A new
   * vocabulary value needed an ALTER TABLE on an 18.7M-row table that four live
   * writers never let go quiet, and the (value, method) pair already says
   * everything the value would have. */
  OCR_CANDIDATE: 'damaged_other',
  /* The mined-marker screen: Kruti-Dev-family Hindi rendered as ASCII. NEW2's
   * value, unchanged, so the two writers' rows group together. */
  LEGACY_FONT_SUSPECT: 'legacy_font_ascii',
  /* Empty extraction. Positive evidence in the plainest possible form. */
  NO_EXTRACTABLE_TEXT: 'damaged_other',
  /* A stored verdict said so. Unreachable here — every page filters to NULL —
   * and present so that a future caller that drops the filter is still right. */
  KNOWN_DEFECT: 'damaged_other',
};

type Checkpoint = {
  scope: string;
  cursor: string;
  screened: number;
  /** Damage verdicts the screen REACHED. Counted in a dry run too — a dry run
   *  whose headline is 0 tells the operator the opposite of what it measured. */
  candidates: number;
  /** Rows actually UPDATEd. Only ever advanced under `--confirm`. */
  written: number;
  byState: Record<string, number>;
  byCourt: Record<string, { screened: number; written: number }>;
  startedAt: string;
  updatedAt: string;
};

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function fresh(): Checkpoint {
  return {
    scope: SCOPE,
    cursor: ZERO_UUID,
    screened: 0,
    candidates: 0,
    written: 0,
    byState: {},
    byCourt: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadCheckpoint(): Checkpoint {
  if (RESTART || !existsSync(CKPT)) return fresh();
  try {
    const c = JSON.parse(readFileSync(CKPT, 'utf8')) as Checkpoint;
    /* A checkpoint from a different scope would resume a walk over rows this
     * invocation was never asked to touch. Refuse rather than silently reuse. */
    if (c.scope !== SCOPE) {
      console.error(
        `checkpoint at ${CKPT} is for scope "${c.scope}" and this run is "${SCOPE}" — ` +
          'pass --restart if that is intended',
      );
      process.exit(2);
    }
    return c;
  } catch {
    return fresh();
  }
}

function saveCheckpoint(c: Checkpoint): void {
  mkdirSync(dirname(CKPT), { recursive: true });
  c.updatedAt = new Date().toISOString();
  writeFileSync(CKPT, JSON.stringify(c, null, 1));
}

/**
 * The staged page: NEW1's already-embedded documents, keyset on the SAME
 * `judgments.id` order so one checkpoint format serves both scopes.
 *
 * Joined rather than filtered by an id list. 542,980 staged rows will not fit
 * in a parameter and the join is one index probe per page.
 */
function pageStaged(sql: Awaited<ReturnType<typeof openDb>>, cursor: string, limit: number) {
  return sql<ScreenRow[]>`
    SELECT j.id, j.court, j.source_url, j.full_text
      FROM judgments j
      JOIN new1_doc_vector_stage s ON s.judgment_id = j.id
     WHERE j.id > ${cursor}::uuid
       AND j.script_quality IS NULL
     ORDER BY j.id
     LIMIT ${limit}`;
}

const sql = await openDb(url, 2, 10 * 60_000);
const ckpt = loadCheckpoint();
const started = Date.now();
/**
 * Rows screened by THIS invocation, which is not `ckpt.screened`.
 *
 * On the first resume the readout printed `823453/s`, because the checkpoint's
 * 7.6M carried over while the clock restarted. A rate that large is obviously
 * wrong and therefore harmless; a rate that is merely 40% too high after a
 * restart is the kind that makes a stall unreadable, which is the failure this
 * lane keeps hitting.
 */
let screenedThisRun = 0;

mkdirSync(dirname(join(process.cwd(), JSONL_OUT)), { recursive: true });

console.log(
  `text-safety screen · scope=${SCOPE} · ${CONFIRM ? 'WRITING' : 'DRY RUN'} · ` +
    `resume from ${ckpt.cursor} (${ckpt.screened.toLocaleString()} screened so far)`,
);

for (;;) {
  const want = LIMIT > 0 ? Math.min(BATCH, LIMIT - ckpt.screened) : BATCH;
  if (want <= 0) break;

  const rows = STAGED
    ? await pageStaged(sql, ckpt.cursor, want)
    : /* The whole-corpus pass filters to NULL in JS rather than in the page,
       * because `pageAll` is shared with NEW2's CLI and must not grow a
       * predicate one of its two callers does not want. */
      await pageAll({ sql, cursor: ckpt.cursor, courts: COURTS, limit: want });

  if (rows.length === 0) break;

  const verdicts: { id: string; value: string; method: string }[] = [];
  const jsonl: string[] = [];

  for (const r of rows) {
    const code = /\/court=([^/]+)\//.exec(r.source_url ?? '')?.[1] ?? r.court ?? 'unknown';
    const c = ckpt.byCourt[code] ?? { screened: 0, written: 0 };

    const v = textVerdict({
      text: r.full_text,
      /* Both are null by construction of the page. Passed explicitly so the
       * call reads the same as every other caller of this function. */
      storedScriptQuality: null,
      storedScriptMethod: null,
    });

    ckpt.byState[v.state] = (ckpt.byState[v.state] ?? 0) + 1;
    c.screened += 1;

    const value = VALUE_FOR[v.state];
    if (value) {
      verdicts.push({ id: r.id, value, method: v.method });
      c.written += 1;
      jsonl.push(
        JSON.stringify({
          id: r.id,
          court: code,
          state: v.state,
          value,
          method: v.method,
          englishRate: Number(v.englishRate.toFixed(3)),
          markerRate: Number(v.markerRate.toFixed(5)),
          textChars: (r.full_text ?? '').length,
        }),
      );
    }
    ckpt.byCourt[code] = c;
  }

  if (CONFIRM && verdicts.length > 0) {
    /**
     * One statement per batch from an unnested array. Row-at-a-time UPDATEs
     * against `judgments` are what produced this repo's 45-minute lock holders.
     *
     * RETRIED, because it died once and the death was not a defect. At
     * 22:31 the box was running a GPU walk, two classifiers and this screen at
     * once, and a batch UPDATE hit the 10-minute `statement_timeout`:
     *
     *     PostgresError 57014: canceling statement due to statement timeout
     *
     * The process then exited on the unhandled rejection, ~7.6M rows in. The
     * checkpoint made that cost nothing but the restart — but a resumable job
     * that needs a human to resume it is only half resumable, and nobody was
     * watching. Three attempts with a widening pause, and only for a timeout:
     * anything else still throws, because a job that swallows every error is
     * how a silent no-op runs all night.
     */
    for (let attempt = 1; ; attempt += 1) {
      try {
        await sql`
          UPDATE judgments AS j
             SET script_quality = v.value,
                 script_quality_method = v.method,
                 script_quality_at = now()
            FROM (
              SELECT unnest(${verdicts.map((v) => v.id)}::uuid[]) AS id,
                     unnest(${verdicts.map((v) => v.value)}::text[]) AS value,
                     unnest(${verdicts.map((v) => v.method)}::text[]) AS method
            ) AS v
           WHERE j.id = v.id
             -- Belt and braces against a concurrent writer between page and write.
             AND j.script_quality IS NULL`;
        break;
      } catch (err) {
        const timedOut = (err as { code?: string })?.code === '57014';
        if (!timedOut || attempt >= 3) throw err;
        const pause = attempt * 30_000;
        console.log(
          `  batch UPDATE timed out (attempt ${attempt}/3) — the box is busy, ` +
            `retrying in ${pause / 1000}s`,
        );
        await new Promise((r) => setTimeout(r, pause));
      }
    }
    ckpt.written += verdicts.length;
  }
  ckpt.candidates += verdicts.length;

  if (jsonl.length > 0) appendFileSync(JSONL_OUT, jsonl.join('\n') + '\n');

  ckpt.cursor = rows[rows.length - 1]!.id;
  ckpt.screened += rows.length;
  screenedThisRun += rows.length;
  saveCheckpoint(ckpt);

  const secs = (Date.now() - started) / 1000;
  console.log(
    `  ${ckpt.screened.toLocaleString()} screened · ${ckpt.candidates.toLocaleString()} ` +
      `${CONFIRM ? 'written' : 'would write'} · ${(screenedThisRun / Math.max(1, secs)).toFixed(0)}/s`,
  );
}

const elapsed = (Date.now() - started) / 1000;
const courtRows = Object.entries(ckpt.byCourt)
  .map(([court, v]) => ({
    court,
    screened: v.screened,
    written: v.written,
    rate: v.screened === 0 ? 0 : Number(((100 * v.written) / v.screened).toFixed(2)),
  }))
  .sort((a, b) => b.written - a.written);

const summary = {
  scope: SCOPE,
  confirmed: CONFIRM,
  qualityStateVersion: QUALITY_STATE_VERSION,
  screened: ckpt.screened,
  candidates: ckpt.candidates,
  written: ckpt.written,
  candidateRate:
    ckpt.screened === 0 ? 0 : Number(((100 * ckpt.candidates) / ckpt.screened).toFixed(2)),
  byState: ckpt.byState,
  byCourt: courtRows.slice(0, 40),
  elapsedSeconds: Number(elapsed.toFixed(1)),
  finishedAt: new Date().toISOString(),
};

mkdirSync(dirname(join(process.cwd(), JSON_OUT)), { recursive: true });
writeFileSync(JSON_OUT, JSON.stringify(summary, null, 1));

console.log('');
console.log(`RESULTS  scope=${SCOPE}  ${CONFIRM ? 'WRITTEN' : 'DRY RUN — nothing written'}`);
console.log(`  screened            ${ckpt.screened.toLocaleString()}`);
console.log(
  `  damage verdicts     ${ckpt.candidates.toLocaleString()} (${summary.candidateRate}%)` +
    `  ·  rows updated ${ckpt.written.toLocaleString()}`,
);
for (const [state, n] of Object.entries(ckpt.byState).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${state.padEnd(22)} ${n.toLocaleString()}`);
}
console.log(`  worst courts`);
for (const r of courtRows.slice(0, 8)) {
  console.log(
    `    ${r.court.padEnd(10)} ${String(r.written).padStart(8)} / ${String(r.screened).padStart(8)}  ${r.rate}%`,
  );
}
console.log(`  summary             ${JSON_OUT}`);
console.log(`  per-row evidence    ${JSONL_OUT}`);

await sql.end();
