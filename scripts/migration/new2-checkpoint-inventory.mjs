/**
 * NEW2 — READ-ONLY inventory of every ingest checkpoint, for the Railway exit.
 *
 * Writes one JSON file and prints a summary. It opens NO database connection,
 * by construction: during the Railway exit hold the source must not be touched
 * at all, and an inventory that needed a query would be unrunnable exactly when
 * it is needed. Everything here comes from `.checkpoints/*.json` plus LCC's
 * `fleet-inventory.json`.
 *
 * WHY THIS EXISTS
 * The checkpoints are the only record of how far each scope got. They survived
 * the freeze and the broken-freeze incident intact (49 files, 0 unparseable),
 * and that is a fact worth being able to re-prove rather than remember. After
 * cutover the fleet resumes from these offsets against a DIFFERENT database, so
 * "what did each scope believe it had done, and when" is the thing that has to
 * be pinned before anything restarts.
 *
 * THE SCOPE NAMING, which is not guessable and is therefore cross-checked
 * A checkpoint filename encodes the year window, because one worker per court
 * was starving the historical bands:
 *
 *   21_11.json          --court 21_11 --from-year 2016            (recent, unbounded)
 *   3_22-to2022.json    --court 3_22  --from-year 2016 --to-year 2022
 *   10_8-to2015.json    --court 10_8  --from-year 1950 --to-year 2015
 *   8_9-y2023.json      --court 8_9   --year 2023
 *
 * That mapping is INFERRED from the filename, so it is verified against the
 * actual command lines LCC captured in `fleet-inventory.json` — the only record
 * of them, since the arguments lived nowhere but the process table. A scope
 * whose inferred window disagrees with its captured command line is reported as
 * a MISMATCH rather than silently trusted.
 *
 *   node scripts/migration/new2-checkpoint-inventory.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CKPT_DIR = join(ROOT, 'services', 'ingest', '.checkpoints');
const FLEET = join(ROOT, 'docs', 'ops', 'migration', 'fleet-inventory.json');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-checkpoint-inventory.json');

/** `metadata/parquet/year=2026/court=21_11/bench=cisnc/metadata.parquet` */
function parseSourceKey(key) {
  const year = key.match(/year=(\d{4})/)?.[1];
  const court = key.match(/court=([^/]+)/)?.[1];
  const bench = key.match(/bench=([^/]+)/)?.[1];
  return { year: year ? Number(year) : null, court: court ?? null, bench: bench ?? null };
}

/** Filename -> the year window the worker was launched with. */
function parseScope(fileName) {
  const stem = fileName.replace(/\.json$/, '');
  let m;
  if ((m = stem.match(/^(.+)-to2015$/))) return { court: m[1], band: 'pre-2016', fromYear: 1950, toYear: 2015 };
  if ((m = stem.match(/^(.+)-to2022$/))) return { court: m[1], band: '2016-2022', fromYear: 2016, toYear: 2022 };
  if ((m = stem.match(/^(.+)-y(\d{4})$/))) return { court: m[1], band: `y${m[2]}`, fromYear: null, toYear: null, year: Number(m[2]) };
  return { court: stem, band: 'recent (2016+, unbounded)', fromYear: 2016, toYear: null };
}

/** The captured command lines, keyed by court+window, so the inference can be checked. */
function loadCapturedScopes() {
  try {
    const fleet = JSON.parse(readFileSync(FLEET, 'utf8'));
    return (fleet.supervisors ?? []).map((s) => {
      const c = s.commandLine ?? '';
      return {
        label: s.label,
        court: c.match(/--court\s+(\S+)/)?.[1] ?? null,
        year: c.match(/--year\s+(\d{4})/)?.[1] ?? null,
        fromYear: c.match(/--from-year\s+(\d{4})/)?.[1] ?? null,
        toYear: c.match(/--to-year\s+(\d{4})/)?.[1] ?? null,
        concurrency: c.match(/--concurrency\s+(\d+)/)?.[1] ?? null,
        batch: c.match(/--batch\s+(\d+)/)?.[1] ?? null,
      };
    });
  } catch {
    return [];
  }
}

const captured = loadCapturedScopes();

function matchCaptured(scope) {
  return captured.find((c) => {
    if (c.court !== scope.court) return false;
    if (scope.year) return c.year === String(scope.year);
    if (scope.toYear) return c.toYear === String(scope.toYear);
    return !c.toYear && !c.year;
  });
}

const scopes = [];
for (const fileName of readdirSync(CKPT_DIR).sort()) {
  if (!fileName.endsWith('.json') || fileName.startsWith('.')) continue;
  const full = join(CKPT_DIR, fileName);
  const st = statSync(full);

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    scopes.push({ file: fileName, PARSE_FAILED: err.message, lastWrite: st.mtime.toISOString() });
    continue;
  }

  const scope = parseScope(fileName);
  const cap = matchCaptured(scope);
  const sources = Object.entries(parsed).map(([key, v]) => ({
    sourceFile: key,
    ...parseSourceKey(key),
    offset: v.offset,
    sizeBytes: v.size,
  }));
  sources.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  scopes.push({
    file: fileName,
    court: scope.court,
    yearBand: scope.band,
    window: { fromYear: scope.fromYear ?? null, toYear: scope.toYear ?? null, year: scope.year ?? null },
    capturedCommandLine: cap
      ? { label: cap.label, batch: cap.batch, concurrency: cap.concurrency }
      : null,
    /**
     * A scope with no captured command line is not necessarily wrong: it may be
     * a window that completed and whose supervisor had already exited before
     * LCC's snapshot at 19:25Z. Recorded, not judged.
     */
    windowAgreesWithCapture: cap
      ? String(cap.fromYear ?? '') === String(scope.fromYear ?? '') &&
        String(cap.toYear ?? '') === String(scope.toYear ?? '') &&
        String(cap.year ?? '') === String(scope.year ?? '')
      : null,
    lastWrite: st.mtime.toISOString(),
    sourceFileCount: sources.length,
    maxOffset: sources.reduce((m, s) => Math.max(m, s.offset ?? 0), 0),
    sources,
  });
}

const mismatches = scopes.filter((s) => s.windowAgreesWithCapture === false);
const uncaptured = scopes.filter((s) => s.capturedCommandLine === null);

const out = {
  tool: 'scripts/migration/new2-checkpoint-inventory.mjs',
  takenAt: new Date().toISOString(),
  purpose:
    'Read-only inventory of NEW2 ingest checkpoints during the Railway exit hold. No database connection is opened by this tool.',
  holdState: {
    stopFilePresent: readdirSync(CKPT_DIR).includes('STOP'),
    note: 'The fleet resumes from these offsets against the LOCAL database after cutover. Per LCC bus 0558 the 301,422 rows written during the broken freeze ARE captured by the replacement chunked dump, so NO checkpoint is to be rewound.',
  },
  totals: {
    scopes: scopes.length,
    sourceFiles: scopes.reduce((n, s) => n + s.sourceFileCount, 0),
    unparseable: scopes.filter((s) => s.PARSE_FAILED).length,
    scopesWithoutCapturedCommandLine: uncaptured.length,
    windowMismatches: mismatches.length,
  },
  scopes,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

console.log(`NEW2 CHECKPOINT INVENTORY — ${out.takenAt}`);
console.log(`  scopes ${out.totals.scopes} · source files ${out.totals.sourceFiles} · unparseable ${out.totals.unparseable}`);
console.log(`  STOP present: ${out.holdState.stopFilePresent}`);
console.log(`  window mismatches vs captured command lines: ${out.totals.windowMismatches}`);
console.log(`  scopes with no captured command line: ${out.totals.scopesWithoutCapturedCommandLine}`);
console.log('');
console.log('band'.padEnd(26), 'scopes'.padStart(6), 'srcFiles'.padStart(9), 'maxOffset'.padStart(10));
const byBand = new Map();
for (const s of scopes) {
  const b = byBand.get(s.yearBand) ?? { n: 0, files: 0, max: 0 };
  b.n++;
  b.files += s.sourceFileCount;
  b.max = Math.max(b.max, s.maxOffset);
  byBand.set(s.yearBand, b);
}
for (const [band, b] of [...byBand.entries()].sort()) {
  console.log(band.padEnd(26), String(b.n).padStart(6), String(b.files).padStart(9), String(b.max).padStart(10));
}
if (mismatches.length > 0) {
  console.log('\nMISMATCH — inferred window disagrees with the captured command line:');
  for (const m of mismatches) console.log(`  ${m.file}  inferred ${JSON.stringify(m.window)}`);
}
console.log(`\nwritten: ${OUT}`);
