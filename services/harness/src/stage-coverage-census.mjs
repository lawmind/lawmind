/**
 * NEW1 — which Tier-A batches actually hold vectors, measured against the DATABASE.
 *
 * WHY THIS EXISTS
 * ---------------
 * The walk's own bookkeeping said it had reached batch 88. The database says 23
 * distinct batches completed. Batches 10 through 76 — 67 of them, roughly 670,000
 * documents — hold nothing at all: they are the batches a dead GPU sidecar "ate"
 * in about sixty seconds on 20 Aug, each printing START and END while embedding
 * nothing. The exit-status bug that let that happen is fixed. The HOLE it left was
 * not, because the walk is a range and a range never goes back.
 *
 * A batch number is therefore not evidence. The frontier is not `START_BATCH`, and
 * it is not `count(*)` either — a corpus-wide total looked perfectly healthy while
 * two thirds of the reached range was empty. The only honest question is asked per
 * batch, by identity: of the ids this file names, how many are in the stage table?
 *
 * OUTPUT
 * ------
 * `docs/ai/new1-tier-a/stage-coverage.json` — a row per batch file, plus a
 * `worklist` of the incomplete ones in manifest order. The runner consumes the
 * worklist; nobody has to remember which numbers were lost.
 *
 * Cost: one full read of the stage table's key column (~227k uuids) and one
 * streaming pass over the batch files. No GPU, no join, safe to run while the
 * walk is running.
 */
import postgres from 'postgres';
import { createReadStream, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

/**
 * SNAPSHOT IDENTITY, 28 Aug 2026 — the manifest directory is a PARAMETER now.
 *
 * A worklist only means anything against the manifest generation it was measured
 * over. `document-vectors/` was generated under definition `e76879ab6bbcd452`,
 * `document-vectors-v2/` under the deployed `5b5d02384b46c96c`. Censusing one
 * generation and walking the other mixes two populations and nothing in either
 * artifact would say so — so the input directory and the output file move
 * together, by environment, with the v1 defaults preserved.
 *
 * `INCLUDE_VALUE_BATCHES=0` drops `tier-a-value-batch-*` from the census. Those
 * files belong to the v1 generation and the runner already filters them out of
 * the worklist, so counting them into a v2 census only inflates its denominator.
 */
const MANIFEST_DIR = process.env.MANIFEST_DIR ?? 'document-vectors';
const DIR = new URL(`../../../docs/ai/embedding-manifests/${MANIFEST_DIR}/`, import.meta.url);
const VALUE_DIR = new URL('../../../docs/ai/new1-tier-a/', import.meta.url);
const INCLUDE_VALUE_BATCHES = (process.env.INCLUDE_VALUE_BATCHES ?? '1') === '1';
const OUT = new URL(
  `../../../docs/ai/new1-tier-a/${process.env.COVERAGE_OUT ?? 'stage-coverage.json'}`,
  import.meta.url,
);

/**
 * A batch is COMPLETE when every id it names is staged — but "every" is too
 * strict in practice: a document whose `full_text` is null is skipped forever by
 * design, and re-walking a batch for those costs a full GPU pass to insert zero
 * rows. The tolerance is expressed in ROWS, not a percentage, so a large batch
 * cannot hide a large absolute hole behind a small ratio.
 */
const COMPLETE_TOLERANCE = Number(process.env.COMPLETE_TOLERANCE ?? 25);

/**
 * The census NAMES the generation it measured. A worklist with no definition
 * hash in it cannot be checked against the walk that consumes it, and
 * `doc-vector-embed.mjs` refuses a definition it has not been reconciled with —
 * so the two must be comparable without reading a directory name and trusting it.
 */
const manifestIndex = JSON.parse(readFileSync(new URL('manifest-tier-a.json', DIR), 'utf8'));
const manifestDefinitionHash = manifestIndex.definitionHash ?? null;
const manifestHash = manifestIndex.manifestHash ?? null;
console.log(
  `manifest ${MANIFEST_DIR}  definition ${manifestDefinitionHash}  batches ${manifestIndex.batches}  rows ${manifestIndex.rowsEmitted}`,
);

const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {} });

const t0 = Date.now();
const staged = new Set();
for await (const row of sql`SELECT judgment_id FROM new1_doc_vector_stage`.cursor(50_000)) {
  for (const r of row) staged.add(r.judgment_id);
}
const stagedOnly = staged.size;

// A QUARANTINED id is accounted for, not missing.
//
// Without this the census reports the 34,370 rows moved out of the stage table as
// holes, every batch that held one drops out of `complete`, and the walk re-reads
// 885 files to embed nothing. "Missing" has to mean "no decision has been made
// about this document yet" — a document we deliberately refused has had one.
const quarantined = await sql`
  SELECT judgment_id FROM new1_doc_vector_stage_refused
`.catch(() => []);
for (const r of quarantined) staged.add(r.judgment_id);
console.log(
  `stage table: ${stagedOnly} ids, quarantine: ${quarantined.length} ids, accounted ${staged.size} in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);

const files = [
  ...(INCLUDE_VALUE_BATCHES ? readdirSync(VALUE_DIR) : [])
    .filter((f) => /^tier-a-value-batch-\d+\.jsonl$/.test(f))
    .sort()
    .map((f) => ({ name: f, path: new URL(f, VALUE_DIR), kind: 'value' })),
  ...readdirSync(DIR)
    .filter((f) => /^tier-a-batch-\d+\.jsonl$/.test(f))
    .sort()
    .map((f) => ({ name: f, path: new URL(f, DIR), kind: 'lcc' })),
];

const cells = [];
for (const f of files) {
  let rows = 0;
  let have = 0;
  const rl = createInterface({ input: createReadStream(f.path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows += 1;
    if (staged.has(JSON.parse(line).judgmentId)) have += 1;
  }
  const missing = rows - have;
  cells.push({
    file: f.name,
    kind: f.kind,
    rows,
    staged: have,
    missing,
    complete: missing <= COMPLETE_TOLERANCE,
  });
  if (cells.length % 100 === 0) console.log(`  scanned ${cells.length}/${files.length} files`);
}

const complete = cells.filter((c) => c.complete);
const partial = cells.filter((c) => !c.complete && c.staged > 0);
const untouched = cells.filter((c) => !c.complete && c.staged === 0);

// MANIFEST ORDER, not emptiest-first.
//
// Emptiest-first was the first instinct and it is wrong here. The value batches
// seeded a handful of staged ids into almost every LCC batch, so 862 files are
// "partial" by one or two rows and their `missing` counts differ by noise. Sorting
// on that produces a scattered order — 876, 824, 463, 781 — which no human can
// resume from and which reads as random if the walk is interrupted again.
// Numeric order closes the 10..76 hole on the way past it and stays legible.
const worklist = [...partial, ...untouched].sort((a, b) => a.file.localeCompare(b.file)).map((c) => c.file);

const summary = {
  kind: 'new1_stage_coverage_census',
  measuredAt: new Date().toISOString(),
  manifestDir: MANIFEST_DIR,
  definitionHash: manifestDefinitionHash,
  manifestHash,
  includeValueBatches: INCLUDE_VALUE_BATCHES,
  completeTolerance: COMPLETE_TOLERANCE,
  stageTableRows: stagedOnly,
  quarantinedRows: quarantined.length,
  accountedIds: staged.size,
  batchFiles: cells.length,
  manifestRows: cells.reduce((a, c) => a + c.rows, 0),
  stagedInManifest: cells.reduce((a, c) => a + c.staged, 0),
  missingTotal: cells.reduce((a, c) => a + c.missing, 0),
  filesComplete: complete.length,
  filesPartial: partial.length,
  filesUntouched: untouched.length,
  worklist,
  cells,
};
writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');

console.log(
  [
    '',
    `batch files          ${summary.batchFiles}`,
    `manifest rows        ${summary.manifestRows}`,
    `accounted in manifest ${summary.stagedInManifest}  (${((100 * summary.stagedInManifest) / summary.manifestRows).toFixed(2)}%)`,
    `missing              ${summary.missingTotal}`,
    `files complete       ${summary.filesComplete}`,
    `files partial        ${summary.filesPartial}`,
    `files untouched      ${summary.filesUntouched}`,
    `worklist head        ${worklist.slice(0, 5).join(' ')}`,
    '',
    `wrote ${OUT.pathname}`,
  ].join('\n'),
);

await sql.end();
