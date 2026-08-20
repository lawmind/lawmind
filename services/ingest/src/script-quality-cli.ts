/**
 * NEW2 — POPULATE `judgments.script_quality`, migration 0056.
 *
 * ONE VERDICT IS WRITTEN BY THIS PASS, AND THAT IS THE POINT
 *
 * Migration 0056 opened a five-value vocabulary: `clean`, `devanagari_deleted`,
 * `legacy_font_ascii`, `mixed_script_ok`, `damaged_other`. This pass writes
 * exactly one of them — `legacy_font_ascii` — because it is the only mode with a
 * detector whose false-positive rate has been MEASURED on labelled documents.
 * The standing instruction is to populate script quality "only using VERIFIED
 * detectors", and four of the five verdicts do not have one yet:
 *
 *   clean               would have to be asserted from the ABSENCE of a signal.
 *                       A pure-ASCII English judgment and a Hindi judgment whose
 *                       Devanagari was deleted by the extractor are the same
 *                       bytes to every check available at scan time. Writing
 *                       `clean` over that population would put mode 2 documents
 *                       into `axis_b_text` as positively assessed, which is
 *                       strictly worse than leaving them NULL — 0056's own
 *                       contract passes NULL and excludes only a known-bad
 *                       verdict, so silence costs nothing and a wrong `clean`
 *                       costs the whole point of the column.
 *   devanagari_deleted  needs a SECOND extraction of the same PDF to compare
 *                       against (`script-retention.ts` takes `original` and
 *                       `replacement`). One is not available from a table scan.
 *   mixed_script_ok     "both present, both PLAUSIBLE". Presence is trivial;
 *                       plausibility is mode 1 (structural damage), which has no
 *                       validated detector. Writing it on presence alone would
 *                       stamp structurally damaged Devanagari as fine.
 *   damaged_other       is a verdict of last resort for a detector that found
 *                       damage it cannot name. Nothing here finds damage it
 *                       cannot name.
 *
 * WHAT LICENSES WRITING THE ONE VERDICT
 *
 * `legacy-font.ts` returns `legacy_font_suspect` from text alone and
 * `legacy_font_confirmed` only from a PDF font name. This pass writes the
 * column from the TEXT screen, so the strength of that screen is the whole
 * argument. Measured across three independent pilot runs (997 font-readable
 * documents, labels taken from `/BaseFont` in the PDF itself, not from text):
 *
 *   run                    positives   text screen recall   FALSE POSITIVES
 *   mixed 6 courts, n=197      5          3/5   (60.0%)        0 / 192
 *   Rajasthan 8_9,  n=398     36         28/36  (77.8%)        0 / 362
 *   8 control courts, n=386    1          1/1  (100.0%)        0 / 385
 *   ─────────────────────────────────────────────────────────────────────
 *   pooled                    42         32/42  (76.2%)        0 / 939
 *
 * Zero false positives in 939 PDF-labelled clean documents across nine courts.
 * That is what makes a text-only verdict safe to STORE: the screen's error is
 * entirely in recall, and a missed legacy-font document is left NULL, which is
 * where it already was. It cannot mislabel a clean document as damaged.
 *
 * The method column records the weaker evidence honestly:
 * `text_marker_screen_v1` never claims a PDF confirmed anything. A later pass
 * that fetches the PDF may upgrade the same row to `legacy_font_pdf_v1`.
 *
 * THE INCONCLUSIVE POPULATION IS A WATERMARK, NOT 15M UPDATEs
 *
 * LCC's contract asks `script_quality_method` to mirror `hc_class_method` so a
 * selector can tell "looked at and could not judge" from "never looked". Done
 * literally that means writing a method onto every row this scan reads — a
 * ~17.9M-row UPDATE, a full table rewrite, and an hour of ACCESS SHARE against
 * a lane that spent 190 attempts getting one ALTER through. So the distinction
 * is kept at the CURSOR instead: `.checkpoints/script-quality.json` records the
 * highest id screened, and the run report records the population counts. "Was
 * this row looked at" is then `id <= watermark`, which is the same fact for a
 * selector and costs three orders of magnitude less to record.
 *
 * Usage:
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/script-quality-cli.ts --confirm [--limit 200000] [--batch 2000]
 *     [--courts 8_9,10_8] [--restart] [--json ../../docs/ops/migration/new2-script-quality.json]
 *
 * Read-only without `--confirm`: it screens, counts and reports, and writes
 * nothing to the database. That is the default deliberately.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from './db-host.ts';
import { MINED_MARKERS, SUSPECT_MARKER_RATE, textSignature } from './legacy-font.ts';
import { pageAll, pageSince } from './script-quality-page.ts';

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
const LIMIT = Number(argOf('limit', '0'));
const BATCH = Number(argOf('batch', '2000'));
const JSON_OUT = argOf('json');
const COURTS = (argOf('courts') ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

/**
 * --since <ISO> — THE INCREMENTAL PASS, AND WHY IT CANNOT USE THE ID CURSOR.
 *
 * The full pass walks `judgments_pkey` and records how far it got as one id.
 * That is only a watermark if ids arrive in key order, and they do not: `id` is
 * a random uuid, so a document ingested after the pass lands anywhere in the key
 * space — almost always BELOW a watermark that has already reached the top.
 *
 * Measured 20 Aug 2026, not assumed: 740,993 judgments were created after the
 * 19 Aug pass began and 740,993 of them — every single one — sort below its
 * final watermark `ffffff40-…`. Resuming that cursor screens nothing, for ever,
 * while reporting a clean exit.
 *
 * So --since keysets on `(created_at, id)` against `judgments_created_at_idx`
 * instead, and keeps its progress in a SEPARATE file. Sharing the main
 * checkpoint would overwrite a 17.9M-row watermark with a cursor that means
 * something else entirely, and no later reader could tell.
 */
const SINCE = argOf('since');

const CKPT = join(
  import.meta.dirname,
  '..',
  '.checkpoints',
  SINCE ? 'script-quality-since.json' : 'script-quality.json',
);

type Checkpoint = {
  cursor: string;
  screened: number;
  written: number;
  startedAt: string;
  /** --since only: the `created_at` half of the composite cursor. */
  cursorAt?: string;
  /** --since only: the boundary the pass was started with, so a resume with a
   *  DIFFERENT --since is visible rather than silently continuing the old one. */
  since?: string;
};
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const EPOCH = '1970-01-01T00:00:00.000Z';
function fresh(): Checkpoint {
  return {
    cursor: ZERO_UUID,
    screened: 0,
    written: 0,
    startedAt: new Date().toISOString(),
    ...(SINCE ? { cursorAt: EPOCH, since: SINCE } : {}),
  };
}
function loadCheckpoint(): Checkpoint {
  if (RESTART || !existsSync(CKPT)) return fresh();
  try {
    const c = JSON.parse(readFileSync(CKPT, 'utf8')) as Checkpoint;
    if (SINCE && c.since !== SINCE) {
      /* A different boundary is a different pass. Continuing the old cursor
       * would skip everything between the two boundaries and report the skip as
       * progress. */
      console.log(
        `checkpoint was built for --since ${c.since ?? '(none)'} — restarting for ${SINCE}`,
      );
      return fresh();
    }
    return c;
  } catch {
    /* A corrupt cursor restarts from zero rather than from a guess. The pass is
     * idempotent — it re-screens rows and re-writes the same verdict — so the
     * cost of restarting is time, and the cost of trusting a half-written file
     * is a silently skipped range. */
    console.log('checkpoint unreadable — restarting from the beginning of the key order');
    return fresh();
  }
}
function saveCheckpoint(c: Checkpoint): void {
  mkdirSync(dirname(CKPT), { recursive: true });
  writeFileSync(CKPT, JSON.stringify(c, null, 1));
}

type Row = {
  id: string;
  court: string | null;
  source_url: string | null;
  full_text: string | null;
  /** Selected only under --since; the composite cursor's other half. */
  created_at?: string | Date | null;
};

/**
 * Ten minutes. Each batch detoasts up to `BATCH` full texts, which is the single
 * most expensive column in the table, and a batch that has genuinely gone wrong
 * must not sit holding a snapshot open while the fleet writes around it.
 */
const sql = await openDb(url, 2, 10 * 60_000);

const counts = {
  screened: 0,
  legacyFontAscii: 0,
  hasDevanagari: 0,
  zeroDevanagariBelowThreshold: 0,
  emptyText: 0,
};
const byCourt = new Map<string, { screened: number; legacy: number }>();
const started = Date.now();
const ckpt = loadCheckpoint();

console.log(
  `script quality — ${CONFIRM ? 'WRITING' : 'DRY RUN, no database writes'} · batch ${BATCH}` +
    `${LIMIT > 0 ? ` · limit ${LIMIT.toLocaleString()}` : ''}` +
    `${COURTS.length > 0 ? ` · courts ${COURTS.join(',')}` : ' · all courts'}`,
);
console.log(
  SINCE
    ? `incremental — created_at >= ${SINCE} · resuming from (${ckpt.cursorAt}, ${ckpt.cursor.slice(0, 8)})\n`
    : `resuming from id > ${ckpt.cursor}\n`,
);

try {
  for (;;) {
    if (LIMIT > 0 && counts.screened >= LIMIT) break;
    const want = LIMIT > 0 ? Math.min(BATCH, LIMIT - counts.screened) : BATCH;

    /* Keyset pagination, never OFFSET, in both directions. The two page queries
     * live in `script-quality-page.ts` so a test can drive them against a table
     * whose ids are deliberately out of order — the id-watermark defect they
     * exist to prevent exits with status 0 and cannot be caught by reading a
     * successful run's output. */
    const rows = (SINCE
      ? await pageSince({
          sql,
          since: SINCE,
          cursorAt: ckpt.cursorAt ?? EPOCH,
          cursor: ckpt.cursor,
          courts: COURTS,
          limit: want,
        })
      : await pageAll({
          sql,
          cursor: ckpt.cursor,
          courts: COURTS,
          limit: want,
        })) as unknown as Row[];

    if (rows.length === 0) break;

    const verdicts: { id: string; verdict: string; method: string }[] = [];
    for (const r of rows) {
      counts.screened++;
      const code = /\/court=([^/]+)\//.exec(r.source_url ?? '')?.[1] ?? 'unknown';
      const c = byCourt.get(code) ?? { screened: 0, legacy: 0 };
      c.screened++;
      byCourt.set(code, c);

      const text = r.full_text ?? '';
      if (text.length === 0) {
        counts.emptyText++;
        continue;
      }
      const sig = textSignature(text, MINED_MARKERS);
      if (!sig.zeroDevanagari) {
        /* Devanagari is present, so mode 3 is ruled out for this document. What
         * it is NOT ruled out of is mode 1 (structural damage), and there is no
         * validated detector for that, so nothing is written. `mixed_script_ok`
         * asserted from presence alone would be exactly the lie this column
         * exists to prevent. */
        counts.hasDevanagari++;
        continue;
      }
      if (sig.markerRate >= SUSPECT_MARKER_RATE) {
        counts.legacyFontAscii++;
        c.legacy++;
        verdicts.push({
          id: r.id,
          verdict: 'legacy_font_ascii',
          /* The version suffix is load-bearing. `MINED_MARKERS` will grow as
           * more courts are labelled, and a row written under a 40-marker list
           * is not the same evidence as one written under a later list. A method
           * string with no version makes a re-measurement impossible to scope. */
          method: 'text_marker_screen_v1',
        });
      } else {
        counts.zeroDevanagariBelowThreshold++;
      }
    }

    if (CONFIRM && verdicts.length > 0) {
      /* One statement per batch, from an unnested array. Row-at-a-time UPDATEs
       * against `judgments` are what produced the 45-minute lock holders this
       * lane spent a session untangling. */
      await sql`
        UPDATE judgments AS j
           SET script_quality = v.verdict,
               script_quality_method = v.method,
               script_quality_at = now()
          FROM (
            SELECT unnest(${verdicts.map((v) => v.id)}::uuid[]) AS id,
                   unnest(${verdicts.map((v) => v.verdict)}::text[]) AS verdict,
                   unnest(${verdicts.map((v) => v.method)}::text[]) AS method
          ) AS v
         WHERE j.id = v.id`;
      ckpt.written += verdicts.length;
    }

    const last = rows[rows.length - 1]!;
    ckpt.cursor = last.id;
    if (SINCE) ckpt.cursorAt = new Date(last.created_at!).toISOString();
    ckpt.screened += rows.length;
    saveCheckpoint(ckpt);

    const secs = (Date.now() - started) / 1000;
    console.log(
      `[${counts.screened.toLocaleString()}] legacy=${counts.legacyFontAscii.toLocaleString()} ` +
        `devanagari=${counts.hasDevanagari.toLocaleString()} ` +
        `${(counts.screened / Math.max(secs, 1)).toFixed(0)} rows/s · cursor ${ckpt.cursor.slice(0, 8)}`,
    );

    if (rows.length < want) break;
  }

  const elapsed = (Date.now() - started) / 1000;
  const courtRows = [...byCourt.entries()]
    .map(([court, v]) => ({ court, ...v, rate: v.screened === 0 ? 0 : v.legacy / v.screened }))
    .sort((a, b) => b.legacy - a.legacy);

  console.log('');
  console.log('RESULTS');
  console.log(`SCREENED          ${counts.screened.toLocaleString()}`);
  console.log(
    `legacy_font_ascii ${counts.legacyFontAscii.toLocaleString()}${CONFIRM ? ' written' : ' would be written'}`,
  );
  console.log(
    `Devanagari present, no verdict available   ${counts.hasDevanagari.toLocaleString()}`,
  );
  console.log(
    `pure ASCII below marker threshold, no verdict   ${counts.zeroDevanagariBelowThreshold.toLocaleString()}`,
  );
  console.log(`empty text        ${counts.emptyText.toLocaleString()}`);
  console.log(
    SINCE
      ? `elapsed           ${elapsed.toFixed(0)}s · cursor (${ckpt.cursorAt}, ${ckpt.cursor})`
      : `elapsed           ${elapsed.toFixed(0)}s · watermark ${ckpt.cursor}`,
  );
  console.log('');
  console.log('courts with any legacy-font verdict:');
  for (const c of courtRows.filter((c) => c.legacy > 0).slice(0, 25)) {
    console.log(
      `  ${c.court.padEnd(8)} ${String(c.legacy).padStart(8)} / ${String(c.screened).padStart(9)}  ${(100 * c.rate).toFixed(2)}%`,
    );
  }

  if (JSON_OUT) {
    writeFileSync(
      join(process.cwd(), JSON_OUT),
      JSON.stringify(
        {
          tool: 'script-quality-cli',
          takenAt: new Date().toISOString(),
          wrote: CONFIRM,
          markerListSize: MINED_MARKERS.length,
          suspectMarkerRate: SUSPECT_MARKER_RATE,
          method: 'text_marker_screen_v1',
          courtsFilter: COURTS.length ? COURTS : null,
          since: SINCE,
          createdAtCursor: SINCE ? (ckpt.cursorAt ?? null) : null,
          counts,
          elapsedSeconds: Number(elapsed.toFixed(1)),
          watermark: ckpt.cursor,
          byCourt: courtRows,
          caveats: [
            'Only legacy_font_ascii is written. clean, devanagari_deleted, mixed_script_ok and damaged_other have no validated detector at scan time and are deliberately left NULL rather than guessed — 0056 passes NULL and excludes only a known-bad verdict, so silence is free and a wrong verdict is not.',
            'The verdict comes from the TEXT screen, not from PDF font evidence. Pooled over three pilots the screen had 0 false positives in 939 PDF-labelled clean documents and 76.2% recall (32/42), so its error is entirely missed positives, which stay NULL.',
            'A legacy-font document is MIXED: the English caption extracts correctly and the Hindi reasoning does not. These rows are findable by title and unusable as reasoning, which is worse than absent, and no length or text_quality check detects it.',
            'The rate per court here is over the rows this pass screened, in primary-key order. It is not a corpus rate for that court unless the pass has finished.',
            'Under --since the pass walks (created_at, id), NOT the primary key, because judgments.id is a random uuid: 740,993 of 740,993 rows created after the 19 Aug pass began sort BELOW its final watermark, so an id cursor can never reach them. "Was this looked at" is then created_at < createdAtCursor, and the two cursors are stored in different files on purpose.',
            'Rows screened and left NULL are recorded by the WATERMARK, not by a per-row method. "Was this looked at" is `id <= watermark`; a per-row method would be a ~17.9M-row UPDATE for a fact one cursor already carries.',
          ],
        },
        null,
        1,
      ),
    );
    console.log(`\nwrote ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 10 });
}
