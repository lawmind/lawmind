/**
 * NEW2 — ENUMERATE THE MODEL-CLASSIFICATION QUEUE, ROW BY ROW.
 *
 *   node --env-file=../../.env src/disposal-manifest-cli.ts \
 *     --out ../../docs/ops/migration/new2-model-classification-manifest.jsonl \
 *     --json ../../docs/ops/migration/new2-model-classification-manifest.json
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AND WHY IT IS NOT `disposal-residue-cli --manifest`
 * ---------------------------------------------------------------------------
 * `disposal-residue-cli` measures the screen and hands back a SAMPLE. Its own
 * closing caveat says the rest of the job is to "re-run the screen over the full
 * residue to enumerate it". That is this file, and the difference is not size:
 *
 *   - the residue CLI MINES its markers from a fresh labelled draw on every run,
 *     so two runs produce two screens and neither manifest can be reproduced;
 *   - this file LOADS the markers from the frozen measurement artifact and
 *     refuses to run without one. The screen is an INPUT here, not an output.
 *
 * So the manifest is a function of (corpus, artifact) and nothing else. Re-run
 * it against the same two and the same rows come out.
 *
 * ---------------------------------------------------------------------------
 * WHAT GOES IN THE MANIFEST, AND WHAT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------
 * ONLY the rows the frozen screen calls `uncertain`. The rows it CAN call are
 * not in here — paying a model to re-derive a verdict a two-marker margin
 * already reached is spending money to learn nothing. The screen's asymmetry is
 * carried into the summary rather than corrected here: it leans `decided`, so
 * what it hands over is the near-ties, which is the population a model is for.
 *
 * NOTHING IS WRITTEN TO `judgments`. `hc_document_class` stays NULL for every
 * row named here. LCC owns the model pass and owns the write.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from './db-host.ts';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is required');

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || !process.argv[i + 1] ? dflt : process.argv[i + 1]!;
};

const SCREEN_FILE = argOf('screen', '../../docs/ops/migration/new2-disposal-residue.json')!;
const OUT = argOf('out');
const JSON_OUT = argOf('json');
const BATCH = Number(argOf('batch', '2000'));
const LIMIT = Number(argOf('limit', '0'));
const SNIPPET_CHARS = Number(argOf('snippet', '700'));
const RESTART = process.argv.includes('--restart');

/* The three constants that define the screen are read from the artifact rather
 * than re-declared here, so a manifest can never be built under a margin that
 * differs from the one whose precision was measured. */
type Marker = { marker: string };
type Screen = {
  takenAt: string;
  margin: number;
  tailChars: number;
  minChars: number;
  markers: { procedural: Marker[]; decided: Marker[] };
  heldOut?: { worstPrecisionAtBalancedPrior?: number; confusionMatrix?: unknown };
};

const screenPath = join(process.cwd(), SCREEN_FILE);
if (!existsSync(screenPath)) {
  throw new Error(
    `no frozen screen at ${screenPath}. Run disposal-residue-cli --json first; this tool will not mine its own markers, because a manifest built under markers nobody recorded cannot be reproduced.`,
  );
}
const screen = JSON.parse(readFileSync(screenPath, 'utf8')) as Screen;
const PRO = screen.markers?.procedural ?? [];
const DEC = screen.markers?.decided ?? [];
const MARGIN = Number(screen.margin);
const TAIL_CHARS = Number(screen.tailChars);
const MIN_CHARS = Number(screen.minChars);
if (!PRO.length || !DEC.length || !Number.isFinite(MARGIN)) {
  throw new Error(`${SCREEN_FILE} carries no usable markers/margin`);
}

/* Compiled once. The residue CLI builds a RegExp per marker per document, which
 * is fine for 6,000 rows and is not fine for 760,000. */
const compile = (ms: Marker[]) =>
  ms.map((m) => ({ marker: m.marker, re: new RegExp(`(^|[^a-z])${m.marker}([^a-z]|$)`) }));
const proRe = compile(PRO);
const decRe = compile(DEC);

const hits = (t: string, ms: { marker: string; re: RegExp }[]): string[] => {
  const found: string[] = [];
  for (const m of ms) if (m.re.test(t)) found.push(m.marker);
  return found;
};

type Row = {
  id: string;
  court: string | null;
  source_url: string | null;
  judgment_date: string | Date | null;
  disposal_nature: string | null;
  case_type: string | null;
  hc_class_method: string | null;
  text_len: number | null;
  tail_text: string | null;
};

const sql = await openDb(url, 2, 10 * 60_000);

const CKPT = join(import.meta.dirname, '..', '.checkpoints', 'disposal-manifest.json');
type Checkpoint = { cursor: string; scanned: number; emitted: number; startedAt: string };
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
function loadCheckpoint(): Checkpoint {
  const fresh = () => ({
    cursor: ZERO_UUID,
    scanned: 0,
    emitted: 0,
    startedAt: new Date().toISOString(),
  });
  if (RESTART || !existsSync(CKPT)) return fresh();
  try {
    return JSON.parse(readFileSync(CKPT, 'utf8')) as Checkpoint;
  } catch {
    return fresh();
  }
}
const ckpt = loadCheckpoint();

/* Appended as it goes, never assembled and written at the end. A 147k-row
 * manifest produced in one write at the close of a long walk is a manifest a
 * teardown deletes — the failure that cost 160 of 283 benchmark queries. */
const outPath = OUT ? join(process.cwd(), OUT) : null;
if (outPath) mkdirSync(dirname(outPath), { recursive: true });
const stream = outPath
  ? createWriteStream(outPath, { flags: ckpt.cursor === ZERO_UUID ? 'w' : 'a' })
  : null;

const counts = { scanned: 0, uncertain: 0, decidedCall: 0, proceduralCall: 0, tooShort: 0 };
const byDisposal = new Map<string, { n: number; uncertain: number }>();
const byCourtYear = new Map<string, number>();
const started = Date.now();

console.log(
  `disposal manifest — frozen screen ${SCREEN_FILE} (${screen.takenAt}) · margin ${MARGIN} · ` +
    `tail ${TAIL_CHARS} · ${PRO.length} procedural / ${DEC.length} decided markers`,
);
console.log(
  `resuming from id > ${ckpt.cursor}${outPath ? ` · appending to ${OUT}` : ' · DRY RUN, no file'}\n`,
);

try {
  for (;;) {
    if (LIMIT > 0 && counts.scanned >= LIMIT) break;
    const want = LIMIT > 0 ? Math.min(BATCH, LIMIT - counts.scanned) : BATCH;

    /* `right(full_text, N)` runs in Postgres on purpose: the screen only ever
     * reads the tail, and shipping whole judgments to Node to discard 96% of
     * each one is the difference between a four-minute walk and an hour. */
    const rows = (await sql`
      SELECT id,
             court,
             source_url,
             judgment_date,
             disposal_nature,
             case_type::text AS case_type,
             hc_class_method,
             length(full_text) AS text_len,
             right(full_text, ${TAIL_CHARS}) AS tail_text
        FROM judgments
       WHERE id > ${ckpt.cursor}::uuid
         AND hc_class_method IS NOT NULL
         AND hc_document_class IS NULL
         AND disposal_nature IS NOT NULL
         AND full_text IS NOT NULL
       ORDER BY id
       LIMIT ${want}`) as unknown as Row[];

    if (rows.length === 0) break;

    for (const r of rows) {
      counts.scanned++;
      const len = Number(r.text_len ?? 0);
      if (len < MIN_CHARS) {
        /* Below the length the screen was measured at. Counted, not silently
         * dropped: these are residue too, they are simply not rows this
         * instrument can say anything about. */
        counts.tooShort++;
        continue;
      }
      const t = (r.tail_text ?? '').toLowerCase();
      const p = hits(t, proRe);
      const d = hits(t, decRe);
      const disposal = r.disposal_nature ?? '(null)';
      const bucket = byDisposal.get(disposal) ?? { n: 0, uncertain: 0 };
      bucket.n++;
      byDisposal.set(disposal, bucket);

      if (p.length - d.length >= MARGIN) {
        counts.proceduralCall++;
        continue;
      }
      if (d.length - p.length >= MARGIN) {
        counts.decidedCall++;
        continue;
      }

      counts.uncertain++;
      bucket.uncertain++;

      const courtCode = /\/court=([^/]+)\//.exec(r.source_url ?? '')?.[1] ?? null;
      const sourceYear = /\/year=(\d{4})\//.exec(r.source_url ?? '')?.[1] ?? null;
      const cy = `${courtCode ?? 'unknown'} ${sourceYear ?? 'unknown'}`;
      byCourtYear.set(cy, (byCourtYear.get(cy) ?? 0) + 1);

      if (stream) {
        stream.write(
          `${JSON.stringify({
            judgment_id: r.id,
            court: r.court,
            court_code: courtCode,
            source_year: sourceYear,
            judgment_date: r.judgment_date
              ? new Date(r.judgment_date).toISOString().slice(0, 10)
              : null,
            disposal_nature: r.disposal_nature,
            case_type: r.case_type,
            /* The CURRENT deterministic state, both halves of it. A method with
             * a NULL class is "a rule looked and refused", which is a different
             * row from "nothing has ever looked" — and only the first belongs in
             * a queue somebody pays a model to adjudicate. */
            current_state: { hc_document_class: null, hc_class_method: r.hc_class_method },
            text_length: len,
            screen: {
              call: 'uncertain',
              margin: MARGIN,
              decided_markers: d,
              procedural_markers: p,
            },
            reason: `The frozen two-marker text screen reaches no verdict: decided and procedural evidence in the closing ${TAIL_CHARS} characters differ by fewer than ${MARGIN} markers. The disposal string is a registry bookkeeping value and does not answer whether a substantive final decision was taken.`,
            tail_snippet: (r.tail_text ?? '').slice(-SNIPPET_CHARS),
          })}\n`,
        );
      }
    }

    ckpt.cursor = rows[rows.length - 1]!.id;
    ckpt.scanned += rows.length;
    ckpt.emitted = counts.uncertain;
    mkdirSync(dirname(CKPT), { recursive: true });
    writeFileSync(CKPT, JSON.stringify(ckpt, null, 1));

    const secs = (Date.now() - started) / 1000;
    console.log(
      `[${counts.scanned.toLocaleString()}] uncertain=${counts.uncertain.toLocaleString()} ` +
        `decided=${counts.decidedCall.toLocaleString()} procedural=${counts.proceduralCall.toLocaleString()} ` +
        `${(counts.scanned / Math.max(secs, 1)).toFixed(0)} rows/s · cursor ${ckpt.cursor.slice(0, 8)}`,
    );

    if (rows.length < want) break;
  }

  await new Promise<void>((resolve) => {
    if (stream) stream.end(resolve);
    else resolve();
  });
  const elapsed = (Date.now() - started) / 1000;

  console.log('');
  console.log('RESULTS');
  console.log(`RESIDUE SCANNED    ${counts.scanned.toLocaleString()}`);
  console.log(`UNCERTAIN EMITTED  ${counts.uncertain.toLocaleString()}   <- the model queue`);
  console.log(`screen called decided     ${counts.decidedCall.toLocaleString()}`);
  console.log(`screen called procedural  ${counts.proceduralCall.toLocaleString()}`);
  console.log(
    `below ${MIN_CHARS} chars, screen not applicable   ${counts.tooShort.toLocaleString()}`,
  );
  console.log(`elapsed ${elapsed.toFixed(0)}s · watermark ${ckpt.cursor}`);

  const disposals = [...byDisposal.entries()]
    .map(([disposal, v]) => ({ disposal, ...v, uncertainShare: v.n === 0 ? 0 : v.uncertain / v.n }))
    .sort((a, b) => b.uncertain - a.uncertain);
  console.log('\ntop disposal families by uncertain rows:');
  for (const d of disposals.slice(0, 15)) {
    console.log(
      `  ${d.disposal.slice(0, 34).padEnd(34)} ${String(d.uncertain).padStart(8)} / ${String(d.n).padStart(8)}  ${(100 * d.uncertainShare).toFixed(1)}%`,
    );
  }

  if (JSON_OUT) {
    writeFileSync(
      join(process.cwd(), JSON_OUT),
      JSON.stringify(
        {
          tool: 'disposal-manifest-cli',
          takenAt: new Date().toISOString(),
          forLane: 'LCC',
          wroteToJudgments: false,
          manifest: OUT,
          purpose:
            'Every row in the DISPOSED/CLOSED residue that the FROZEN deterministic screen cannot call either way. This is the population where model adjudication buys something; the rows the screen can call are excluded on purpose.',
          selector: `hc_class_method IS NOT NULL AND hc_document_class IS NULL AND disposal_nature IS NOT NULL AND full_text IS NOT NULL AND length(full_text) >= ${MIN_CHARS}`,
          frozenScreen: {
            file: SCREEN_FILE,
            takenAt: screen.takenAt,
            margin: MARGIN,
            tailChars: TAIL_CHARS,
            minChars: MIN_CHARS,
            proceduralMarkers: PRO.length,
            decidedMarkers: DEC.length,
            heldOutWorstPrecisionAtBalancedPrior:
              screen.heldOut?.worstPrecisionAtBalancedPrior ?? null,
            confusionMatrix: screen.heldOut?.confusionMatrix ?? null,
          },
          counts,
          elapsedSeconds: Number(elapsed.toFixed(1)),
          watermark: ckpt.cursor,
          byDisposal: disposals,
          byCourtYear: [...byCourtYear.entries()]
            .map(([cell, uncertain]) => ({ cell, uncertain }))
            .sort((a, b) => b.uncertain - a.uncertain)
            .slice(0, 200),
          caveats: [
            'NOTHING is written to judgments. hc_document_class stays NULL for every id in the manifest. LCC owns the model pass and owns the write.',
            'The screen is FROZEN, loaded from the artifact named in frozenScreen. It is not re-mined here. A manifest built under different markers is a different manifest and must say so.',
            'The held-out precision in frozenScreen is measured at a 50/50 TEST prior against REGISTRY labels, not human ground truth. It does not transfer to this population and must not be used to auto-promote a model verdict to `decided`.',
            'The screen leans `decided`, so the rows it excluded as decided-looking are an UPPER bound on substantive content, and the uncertain population here is the near-ties rather than the whole of the doubt.',
            'Rows below the measured minimum length are counted in counts.tooShort and are NOT in the manifest. They are residue the instrument cannot speak about, which is different from residue it judged.',
            'The walk is primary-key order over a table the fleet is still writing to. Rows ingested after the watermark are not in this manifest — and because judgments.id is a random uuid, an extension pass must key on created_at, not on this cursor. Measured 20 Aug: 740,993 of 740,993 rows created after a full id-order pass began sorted BELOW its final watermark.',
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
