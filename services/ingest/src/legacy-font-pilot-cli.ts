/**
 * NEW2 — LEGACY_FONT_SUSPECT, measured on real documents before it is believed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS RUN PRODUCES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `legacy-font.ts` can read a PDF's font dictionary and can score text against a
 * marker list. It ships with **no marker list**, deliberately — the list has to
 * come from documents this corpus actually holds, and this is the tool that
 * derives it:
 *
 *   1. Draw a bounded sample of LONG, PURE-ASCII judgments from courts that
 *      publish in Hindi. These are the documents every existing quality signal
 *      scores as perfect and which may be garbled Hindi.
 *   2. Fetch each PDF and read its `/BaseFont` entries. That is the LABEL, and
 *      it is evidence rather than inference.
 *   3. Mine the ASCII tokens that separate PDF-labelled positives from
 *      PDF-labelled negatives (`mineMarkers`).
 *   4. Report the marker list, its separation, and the false-positive rate the
 *      resulting text-only screen would have on the labelled negatives.
 *
 * Step 4 is the point. A text screen that has never been scored against
 * documents known to be clean is a way to mislabel a bilingual court's English
 * judgments at scale, and the standing direction names that failure explicitly:
 * **do not assume every ASCII judgment from Chhattisgarh is broken Hindi.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED, AND IT STAYS BOUNDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Eight ingest scopes are writing and NEW1 owns the GPU. This fetches `--limit`
 * PDFs (default 300) at a concurrency of 4, writes NOTHING to the database, and
 * touches no OCR. It is a measurement, and it is sized so that running it is
 * never a scheduling decision anyone else has to be consulted about.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/legacy-font-pilot-cli.ts [--limit 300] [--courts 22_18,17_21] \
 *     [--json ../../docs/ops/migration/new2-legacy-font-pilot.json]
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';
import { classifyLegacyFont, mineMarkers, pdfFontEvidence, textSignature } from './legacy-font.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const LIMIT = Number(argOf('limit', '300'));
const JSON_OUT = argOf('json');
const CONCURRENCY = 4;

/**
 * Courts whose registries publish judgments in Hindi as well as English.
 *
 * A candidate list, not a claim about any document. The pilot's whole job is to
 * find out which of these actually carry legacy fonts, and a court that turns
 * out to carry none is a useful result rather than a wasted one. Overridable
 * with `--courts` so the next run can follow the evidence instead of this list.
 */
const DEFAULT_COURTS = ['22_18', '17_21', '18_6', '8_9', '10_8', '19_16'];
const COURTS = (argOf('courts') ?? DEFAULT_COURTS.join(','))
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

/**
 * Long enough to hold reasoning, and pure ASCII.
 *
 * Both bounds matter. Short documents are `reference_stub` territory and say
 * nothing about extraction. Text containing Devanagari is not the failure mode
 * under study — that document extracted its script correctly, whatever else may
 * be wrong with it.
 */
const MIN_CHARS = 2000;

type Row = { id: string; court: string; source_url: string; full_text: string };

async function mapConcurrent<T, R>(
  items: readonly T[],
  n: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

const sql = await openDb(url, 2, 10 * 60_000);

try {
  /**
   * `court = ANY(...)` on the code embedded in `source_url`, because `court` is
   * the printed NAME and the fleet works in codes. Matching the URL keeps this
   * commensurable with every coverage figure this lane publishes, which are all
   * keyed on the partition in the same string.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * WHAT THIS QUERY DELIBERATELY DOES NOT DO, AND WHY
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The first version was `… AND length(full_text) >= 2000 AND full_text !~
   * '[ऀ-ॿ]' ORDER BY random() LIMIT 200`, which reads as an obviously bounded
   * sample and is not one. It was cancelled by a ten-minute statement timeout,
   * and the reason is in the two predicates rather than in the LIMIT:
   *
   *   `ORDER BY random()` must produce EVERY matching row before it can order
   *   them, so the LIMIT bounds the output and not the work.
   *
   *   `length(full_text)` and a regex over `full_text` must DETOAST the text of
   *   every row they are evaluated on — the single most expensive column in the
   *   table, on 15.6M rows, while eight scopes are writing.
   *
   * Together they read the whole corpus's text to return 200 rows.
   *
   * The replacement takes its randomness from a random PRIMARY KEY START rather
   * than from sorting: `id > <random uuid>` lands at an arbitrary point in the
   * key order and the scan stops as soon as LIMIT rows match. The remaining
   * filters — length, Devanagari — are applied in JS afterwards, on the few
   * hundred rows actually fetched, where they cost nothing.
   *
   * This trades a uniform random sample for a random contiguous run in key
   * order, and that is a real difference worth stating: `id` is a UUID and
   * carries no time or court ordering, so a run of it is not a run of one
   * court or one year — but it is a cluster, and the report says so rather than
   * calling this a random draw.
   */
  const patterns = COURTS.map((c) => `%/court=${c}/%`);
  /**
   * A FULL-WIDTH random uuid, not a random first nibble.
   *
   * This was `${Math.floor(Math.random() * 16).toString(16)}0000000-…`, which
   * offers exactly SIXTEEN possible start points across the whole key space. Two
   * runs of the pilot had a 1-in-16 chance of scanning the identical rows, so
   * "run it again on more documents" was not independent evidence — it was
   * partly the same evidence counted twice, which is the one thing a
   * precision/recall estimate must not do. The comment above already said the
   * start should land "at an arbitrary point in the key order"; the code did not.
   */
  const randomStart = randomUUID();
  const rows = (
    (await sql`
    SELECT id, court, source_url, full_text
    FROM judgments
    WHERE id > ${randomStart}::uuid
      AND source_url LIKE ANY(${patterns}::text[])
      AND source_url LIKE '%.pdf'
    ORDER BY id
    LIMIT ${LIMIT * 4}`) as unknown as Row[]
  )
    .filter((r) => r.full_text.length >= MIN_CHARS && !/[ऀ-ॿ]/u.test(r.full_text))
    .slice(0, LIMIT);

  console.log(
    `sampled ${rows.length} long pure-ASCII documents across ${COURTS.length} court(s)\n`,
  );
  if (rows.length === 0) {
    console.log('nothing matched — no conclusion is available and none is reported.');
    process.exit(0);
  }

  let fetched = 0;
  let failed = 0;
  const labelled = await mapConcurrent(rows, CONCURRENCY, async (r) => {
    try {
      /* 20s, because an unbounded fetch inside a bounded pilot is how a bounded
       * pilot stops being one. A slow PDF is a skipped label, not a stall. */
      const res = await fetch(r.source_url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        failed++;
        return { row: r, pdf: null, status: res.status };
      }
      fetched++;
      return { row: r, pdf: pdfFontEvidence(new Uint8Array(await res.arrayBuffer())), status: 200 };
    } catch {
      failed++;
      return { row: r, pdf: null, status: 0 };
    }
  });

  const readable = labelled.filter((l) => l.pdf && l.pdf.fontCount > 0);
  const positives = readable.filter((l) => l.pdf!.legacyFonts.length > 0);
  const negatives = readable.filter((l) => l.pdf!.legacyFonts.length === 0);

  console.log(`fetched ${fetched}  failed ${failed}  font-readable ${readable.length}`);
  console.log(`PDF-LABELLED  legacy ${positives.length}   clean ${negatives.length}\n`);

  const fontTally = new Map<string, number>();
  for (const l of readable)
    for (const f of l.pdf!.fonts) fontTally.set(f, (fontTally.get(f) ?? 0) + 1);
  console.log('  ── font names seen, most common first ──');
  for (const [f, n] of [...fontTally].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`     ${String(n).padStart(5)}  ${f}`);
  }

  /**
   * No positives is a RESULT, and it is reported as one rather than worked
   * around. Mining markers from an empty positive set would return whatever is
   * common in the negatives, and that list would then convict every clean
   * English judgment in the corpus.
   */
  if (positives.length === 0) {
    console.log(
      '\nNO legacy-font document in this sample. No marker list is derivable and none is emitted.\n' +
        'That is a finding about these courts, not a clean bill for the corpus: widen --courts, ' +
        'or the failure mode may live in a band this sample did not reach.',
    );
  }

  const mined =
    positives.length > 0
      ? mineMarkers(
          positives.map((l) => l.row.full_text),
          negatives.map((l) => l.row.full_text),
        )
      : [];

  if (mined.length > 0) {
    console.log('\n  ── mined markers (document frequency, positives vs negatives) ──');
    for (const m of mined.slice(0, 25)) {
      console.log(
        `     ${m.marker.padEnd(8)} pos ${(100 * m.positiveShare).toFixed(0).padStart(3)}%  ` +
          `neg ${(100 * m.negativeShare).toFixed(1).padStart(5)}%  lift ${m.lift.toFixed(0)}`,
      );
    }
  }

  /**
   * THE NUMBER THAT DECIDES WHETHER THIS SHIPS: how often the text-only screen
   * would convict a document the PDF says is clean. Scored on the labelled
   * negatives, which is the only population where a false positive is
   * identifiable at all.
   */
  const markerList = mined.map((m) => m.marker);
  const screen = (t: string) => classifyLegacyFont({ text: textSignature(t, markerList) }).verdict;
  const falsePositives =
    markerList.length > 0 ? negatives.filter((l) => screen(l.row.full_text) !== 'clean') : [];
  const truePositives =
    markerList.length > 0 ? positives.filter((l) => screen(l.row.full_text) !== 'clean') : [];

  if (markerList.length > 0) {
    console.log(
      `\n  TEXT-ONLY SCREEN on PDF-labelled documents:\n` +
        `     recall    ${truePositives.length}/${positives.length}` +
        ` (${((100 * truePositives.length) / Math.max(1, positives.length)).toFixed(1)}%)\n` +
        `     FALSE POS ${falsePositives.length}/${negatives.length}` +
        ` (${((100 * falsePositives.length) / Math.max(1, negatives.length)).toFixed(1)}%)`,
    );
  }

  const report = {
    tool: 'legacy-font-pilot-cli',
    takenAt: new Date().toISOString(),
    courts: COURTS,
    sample: {
      requested: LIMIT,
      drawn: rows.length,
      minChars: MIN_CHARS,
      fetched,
      failed,
      fontReadable: readable.length,
    },
    labels: { legacy: positives.length, clean: negatives.length },
    fontsSeen: [...fontTally]
      .sort((a, b) => b[1] - a[1])
      .map(([font, n]) => ({ font, documents: n })),
    minedMarkers: mined,
    textOnlyScreen:
      markerList.length > 0
        ? {
            recall: truePositives.length / Math.max(1, positives.length),
            falsePositiveRate: falsePositives.length / Math.max(1, negatives.length),
            truePositives: truePositives.length,
            falsePositives: falsePositives.length,
          }
        : null,
    caveats: [
      'Labels come from /BaseFont in the PDF. A file whose fonts sit in a compressed object stream reads as zero fonts and is EXCLUDED from both classes, never counted as clean.',
      'The sample is drawn from long pure-ASCII documents in named courts. It is not a corpus rate and must not be quoted as one.',
      'NOT a uniform random draw: the sample is a contiguous run of the primary key from a random start. id is a UUID and carries no court or date ordering, so the run is not one court or one year, but neighbouring rows are correlated by insertion and the spread is narrower than a true random sample.',
      'A text-only SUSPECT is never a confirmation. Only a PDF font name confirms.',
    ],
    examples: positives.slice(0, 5).map((l) => ({
      id: l.row.id,
      court: l.row.court,
      sourceUrl: l.row.source_url,
      legacyFonts: l.pdf!.legacyFonts,
      textHead: l.row.full_text.slice(0, 200),
    })),
  };

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\n  wrote ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
