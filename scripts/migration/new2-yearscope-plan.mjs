/**
 * NEW2 — THE YEAR-SCOPE SCHEDULER. Work is DERIVED from `source - held`, never
 * typed by hand.
 *
 *   node scripts/migration/new2-yearscope-plan.mjs
 *   node scripts/migration/new2-yearscope-plan.mjs --max 8 --json
 *
 * Opens no database connection. Every input is a file on disk, so this runs
 * during the freeze — which is the point: the plan for the first post-cutover
 * run has to exist BEFORE the database is available, or it gets written in a
 * hurry the moment it is.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY A LIST OF NAMES WAS NEVER A SCHEDULER
 * ---------------------------------------------------------------------------
 * `start-ingest-fleet.ps1` carried a hand-written rescue block:
 *
 *     # -- year-scoped 2023 catch-up ---
 *     hc-boot-33_10-y2023  hc-boot-8_9-y2023   hc-boot-9_13-y2023
 *     hc-boot-3_22-y2023   hc-boot-10_8-y2023  hc-boot-27_1-y2023
 *     # -- year-scoped 2024, same orphan story, one scope ---
 *     hc-boot-14_25-y2024
 *
 * Six courts got a 2023 rescue. Exactly ONE got a 2024 one, and it was Manipur
 * — 18,745 documents — while Allahabad, Bombay and Telangana, the three largest
 * holdings in the corpus, held exactly ZERO 2024 documents against 264,889 /
 * 277,355 / 38,931 at source. Nothing recomputed that list. The hole was found
 * by a person reading a year histogram on 17 Aug 2026, three days after it
 * opened, and `new2-rung-plan.mjs` then measured SIXTEEN year-scoped bands with
 * real remaining work and no launcher line at all.
 *
 * The defect is not the seven missing names. It is that a name had to be typed.
 * **Every year rollover re-creates this hole** for whichever courts the
 * newest-first descent has not reached, and a hand list cannot roll over.
 *
 * ---------------------------------------------------------------------------
 * THE STARVATION MECHANISM, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------
 * `hc-load-cli.ts` sorts its scope newest-year-first (its own header explains
 * why: neutral citations live in 2023+). An unscoped `--from-year 2016` worker
 * on a 3.5M-document court is therefore still inside the newest year months
 * later, and every older year inside its range is served by nothing. Range
 * workers do not fix this — they reproduce it inside their own range. Only a
 * worker pinned to ONE year can guarantee that year gets read, which is what a
 * year scope is for and why its checkpoint is keyed `<court>-y<year>.json`.
 *
 * ---------------------------------------------------------------------------
 * WHICH YEARS GET A YEAR SCOPE — DERIVED FROM THE LAUNCHER, NOT ASSUMED
 * ---------------------------------------------------------------------------
 * The launcher runs three standing band shapes:
 *
 *     hc-boot-hist-$c   --from-year 1950 --to-year 2015
 *     hc-boot-mid-$c    --from-year 2016 --to-year 2022
 *     hc-boot-$c        --from-year 2016            (unbounded, newest-first)
 *
 * So every year above the highest `--to-year` in the launcher is covered by the
 * unscoped descent AND BY NOTHING ELSE. That ceiling is PARSED from
 * `start-ingest-fleet.ps1` rather than written here as `2022`, because a
 * constant copied out of another file is the same defect as a copied list of
 * court names: when the launcher's bands move, this must move with them. If it
 * cannot be parsed this tool REFUSES rather than guessing a boundary.
 *
 * `RECENT_FROM = currentYear - 1` splits that region in two, and it is a
 * derivation rather than a literal for the same reason:
 *
 *   BACKLOG  ceiling+1 .. currentYear-2   nothing is serving these. Today 2023-2024.
 *   RECENT   currentYear-1 ..             the descent is actively inside these.
 *
 * Next January 2025 becomes backlog on its own, with nobody noticing anything.
 *
 * ---------------------------------------------------------------------------
 * WHY `source - held` NEEDS TWO GUARDS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * `source` counts DOCUMENTS in the AWS Open Data parquet footers
 * (`HC_METADATA_SURVEY.json`, exact, 1,493 objects). `held` counts ROWS in
 * `judgments` (`new2-held-by-court-year.json`, exact `count(*)` from the heap,
 * never `reltuples`). **These are different units.** A document that yields no
 * judgment row still counts at source, so `remaining` never reaches zero even
 * on a fully-read court, and a scheduler that only checked `remaining > 0`
 * would re-launch finished scopes forever.
 *
 * Two guards, both heuristics, both stated as such:
 *
 *   --min-remaining  1000   a year-scoped worker is not free; below this the
 *                           slot is worth more somewhere else.
 *   --max-held-pct   0.97   at/above this the scope is treated as FINISHED.
 *                           Calibrated against the seven courts measured at
 *                           97.6-100% on 17 Aug 2026 with tens of documents
 *                           outstanding, not thousands (bus 0607).
 *
 * And the caveat that must travel with every number this prints: `remaining` is
 * THE SIZE OF THE FETCH, not the size of the authority gap. `DATASETS.md` puts
 * the judgment share well below 100%, so 1.78M remaining documents is a much
 * smaller number of reasoned decisions.
 *
 * ---------------------------------------------------------------------------
 * A COURT THAT DOES NOT JOIN IS REPORTED, NEVER DROPPED
 * ---------------------------------------------------------------------------
 * `perCourtPerYear` is keyed by court NAME and everything else by CODE. A name
 * that fails to join, or a held court with no survey entry at all — Supreme
 * Court of India is exactly this, 38,342 rows held against NO source count — is
 * collected and printed. Dropping it to `null` and sorting it last is the shape
 * of the bug this file exists to fix: a band with no number becomes invisible.
 */
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURVEY = join(ROOT, 'docs', 'HC_METADATA_SURVEY.json');
const HELD = join(ROOT, 'docs', 'ops', 'migration', 'new2-held-by-court-year.json');
const LAUNCHER = join(ROOT, 'scripts', 'start-ingest-fleet.ps1');
const CHECKPOINT_DIR = join(ROOT, 'services', 'ingest', '.checkpoints');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-yearscope-plan.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const MAX = arg('max') ? Number(arg('max')) : Infinity;
const MIN_REMAINING = Number(arg('min-remaining', '1000'));
const MAX_HELD_PCT = Number(arg('max-held-pct', '0.97'));
const JSON_ONLY = process.argv.includes('--json');

for (const [label, path] of [
  ['survey', SURVEY],
  ['held snapshot', HELD],
  ['launcher', LAUNCHER],
]) {
  if (!existsSync(path)) {
    console.error(`missing ${label}: ${path}`);
    console.error('this tool refuses to plan work from a partial input.');
    process.exit(2);
  }
}

const survey = JSON.parse(readFileSync(SURVEY, 'utf8'));
const heldSnapshot = JSON.parse(readFileSync(HELD, 'utf8'));
const launcherSrc = readFileSync(LAUNCHER, 'utf8');

/**
 * The band ceiling, PARSED. The highest `--to-year` any standing launcher band
 * bounds itself with; every year above it is served by the unscoped newest-first
 * descent alone. Refusing here is deliberate — a wrong boundary silently plans
 * year scopes that duplicate a range worker, or omits ones nothing is serving.
 */
const toYears = [...launcherSrc.matchAll(/-ToYear\s+'(\d{4})'/g)].map((m) => Number(m[1]));
if (toYears.length === 0) {
  console.error(`no -ToYear found in ${LAUNCHER} — cannot derive the band ceiling.`);
  console.error('refusing to assume 2022. Fix the parse or the launcher, not this constant.');
  process.exit(2);
}
const BAND_CEILING = Math.max(...toYears);
const CURRENT_YEAR = new Date().getUTCFullYear();
const RECENT_FROM = CURRENT_YEAR - 1;
const BACKLOG_FROM = BAND_CEILING + 1;

/** court code -> court name, from the survey's own join table. */
const nameByCode = new Map();
const codeByName = new Map();
for (const c of survey.perCourt ?? []) {
  nameByCode.set(c.code, c.name);
  codeByName.set(c.name, c.code);
}

/** code -> year -> exact source documents. */
const sourceByCourtYear = new Map();
const unjoinedSurveyNames = [];
for (const [courtName, years] of Object.entries(survey.perCourtPerYear ?? {})) {
  const code = codeByName.get(courtName);
  if (!code) {
    unjoinedSurveyNames.push(courtName);
    continue;
  }
  const m = new Map();
  for (const [y, n] of Object.entries(years)) m.set(Number(y), Number(n));
  sourceByCourtYear.set(code, m);
}

const heldByCourtYear = heldSnapshot.heldByCourtCodeByYear ?? {};
const heldFor = (code, year) => Number(heldByCourtYear[code]?.[String(year)] ?? 0);

/**
 * Held courts with no source denominator at all. NOT a rounding error: Supreme
 * Court of India sits here with 38,342 rows and no survey coverage, and it is
 * the court that binds every other one. A target without a denominator is a
 * wish, so it is reported rather than scheduled.
 */
const heldWithNoSource = [];
for (const code of Object.keys(heldByCourtYear)) {
  if (!sourceByCourtYear.has(code)) {
    const total = Object.values(heldByCourtYear[code]).reduce((a, b) => a + Number(b), 0);
    heldWithNoSource.push({ court: code, heldDocuments: total });
  }
}
for (const n of heldSnapshot.courtNamesWithNoSurveyCode ?? []) {
  if (!heldWithNoSource.some((h) => h.court === n)) heldWithNoSource.push({ court: n, heldDocuments: null });
}

/** Which scopes have EVER run — a checkpoint file on disk is the only evidence. */
const checkpointFiles = new Set(
  existsSync(CHECKPOINT_DIR) ? readdirSync(CHECKPOINT_DIR).filter((f) => f.endsWith('.json')) : [],
);
const ranBefore = {
  year: (court, year) => checkpointFiles.has(`${court}-y${year}.json`),
  mid: (court) => checkpointFiles.has(`${court}-to${BAND_CEILING}.json`),
  hist: (court) => checkpointFiles.has(`${court}-to${BAND_CEILING - 7}.json`),
};

/**
 * The band a candidate belongs to, and its rank. Order is the founder's stated
 * acquisition priority (17 Aug 2026 addendum), not a judgement made here:
 *
 *   0  backlog year, never ran, NOTHING held     the completely absent scopes
 *   1  backlog year, never ran, some held
 *   2  backlog year, ran before and still short
 *   3  2016-2022, the largest single gap in the corpus
 *   4  pre-2016
 *   5  recent — the descent is already inside these
 */
const TIER = {
  0: 'backlog year · never ran · zero held',
  1: 'backlog year · never ran',
  2: 'backlog year · ran before, still short',
  3: `${BAND_CEILING - 6}-${BAND_CEILING} band`,
  4: `pre-${BAND_CEILING - 6}`,
  5: `recent (${RECENT_FROM}+)`,
};
const HIST_FROM = 1950;
const MID_FROM = BAND_CEILING - 6;

const candidates = [];
const finished = [];
const belowThreshold = [];

function push(entry) {
  if (entry.sourceDocuments <= 0) return;
  const pct = entry.heldDocuments / entry.sourceDocuments;
  if (pct >= MAX_HELD_PCT) {
    finished.push({ ...entry, heldPct: pct });
    return;
  }
  if (entry.remainingDocuments < MIN_REMAINING) {
    belowThreshold.push({ ...entry, heldPct: pct });
    return;
  }
  candidates.push({ ...entry, heldPct: pct });
}

for (const [court, years] of sourceByCourtYear) {
  const courtName = nameByCode.get(court) ?? null;

  /** One scope per YEAR above the launcher's band ceiling. */
  for (const [year, src] of years) {
    if (year <= BAND_CEILING) continue;
    const held = heldFor(court, year);
    const ran = ranBefore.year(court, year);
    const isRecent = year >= RECENT_FROM;
    const tier = isRecent ? 5 : ran ? 2 : held === 0 ? 0 : 1;
    push({
      scope: `hc-boot-${court}-y${year}`,
      court,
      courtName,
      band: `y${year}`,
      year,
      fromYear: null,
      toYear: null,
      concurrency: 32,
      tier,
      tierLabel: TIER[tier],
      ranBefore: ran,
      sourceDocuments: src,
      heldDocuments: held,
      remainingDocuments: Math.max(0, src - held),
      heldExceedsSource: held > src,
    });
  }

  /** One scope per COURT for each bounded band. Ranges, not years, by design:
   *  these bands are closed and never gain new documents, so a range worker
   *  cannot be starved by a rollover the way the open top of the corpus is. */
  for (const [band, from, to, tier, conc] of [
    ['mid', MID_FROM, BAND_CEILING, 3, 16],
    ['hist', HIST_FROM, MID_FROM - 1, 4, 16],
  ]) {
    let src = 0;
    let held = 0;
    for (const [year, n] of years) {
      if (year < from || year > to) continue;
      src += n;
      held += heldFor(court, year);
    }
    push({
      scope: `hc-boot-${band}-${court}`,
      court,
      courtName,
      band: `${from}-${to}`,
      year: null,
      fromYear: from,
      toYear: to,
      concurrency: conc,
      tier,
      tierLabel: TIER[tier],
      ranBefore: band === 'mid' ? ranBefore.mid(court) : ranBefore.hist(court),
      sourceDocuments: src,
      heldDocuments: held,
      remainingDocuments: Math.max(0, src - held),
      heldExceedsSource: held > src,
    });
  }
}

candidates.sort((a, b) => {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.remainingDocuments !== b.remainingDocuments)
    return b.remainingDocuments - a.remainingDocuments;
  return a.scope.localeCompare(b.scope);
});

const selected = Number.isFinite(MAX) ? candidates.slice(0, MAX) : candidates;

/**
 * The launcher argument list, emitted here so no human transcribes an
 * `HcArgs` line. `--year` for a year scope, `--from-year/--to-year` for a band,
 * exactly as `HcArgs` builds them — the checkpoint path depends on these and a
 * mismatch silently orphans stored progress.
 */
const workers = selected.map((r) => ({
  scope: r.scope,
  court: r.court,
  year: r.year,
  fromYear: r.fromYear,
  toYear: r.toYear,
  concurrency: r.concurrency,
  remainingDocuments: r.remainingDocuments,
  tier: r.tier,
}));

const out = {
  tool: 'scripts/migration/new2-yearscope-plan.mjs',
  takenAt: new Date().toISOString(),
  derivedFrom: {
    source: 'docs/HC_METADATA_SURVEY.json perCourtPerYear (exact parquet footers, DOCUMENTS)',
    sourceGeneratedAt: survey.generatedAt ?? null,
    held: 'docs/ops/migration/new2-held-by-court-year.json (exact count(*), JUDGMENT ROWS)',
    heldTakenAt: heldSnapshot.takenAt ?? null,
    bandCeiling: BAND_CEILING,
    bandCeilingSource: `parsed -ToYear from scripts/start-ingest-fleet.ps1 (max of ${toYears.join(', ')})`,
    backlogYears: `${BACKLOG_FROM}..${RECENT_FROM - 1}`,
    recentFrom: RECENT_FROM,
    currentYear: CURRENT_YEAR,
  },
  thresholds: { minRemaining: MIN_REMAINING, maxHeldPct: MAX_HELD_PCT },
  caveat:
    'remaining = source DOCUMENTS minus held JUDGMENT ROWS. Different units: it is the size of the FETCH, not the size of the authority gap, and it does not reach zero on a fully-read court — which is what maxHeldPct exists for. Source snapshot predates the held snapshot, so every remaining is a floor.',
  tierOrder: TIER,
  candidateCount: candidates.length,
  selectedCount: selected.length,
  onlyArgument: selected.map((r) => r.scope).join(','),
  workers,
  candidates,
  /**
   * THE DROPPED SCOPES ARE LISTED, NOT COUNTED.
   *
   * Because this plan now DRIVES the launcher, a scope missing from it is a
   * worker that stops being started. Three scopes the old hand-written block
   * launched every boot — `hc-boot-8_9-y2023`, `hc-boot-3_22-y2023`,
   * `hc-boot-10_8-y2023` — are absent from the first generated plan, and that
   * is correct: they are at or above `maxHeldPct`. But "correct" has to be
   * CHECKABLE. A count told you three vanished; it did not tell you which, or
   * why, and the next person would have had to rediscover it the way the y2024
   * hole was rediscovered. Every exclusion carries its own numbers here.
   */
  excludedFinished: finished.sort((a, b) => b.remainingDocuments - a.remainingDocuments),
  excludedBelowMinRemaining: belowThreshold.sort(
    (a, b) => b.remainingDocuments - a.remainingDocuments,
  ),
  finishedAtOrAboveMaxHeldPct: finished.length,
  belowMinRemaining: belowThreshold.length,
  unjoinedSurveyNames,
  heldWithNoSource,
};
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

if (JSON_ONLY) {
  console.log(out.onlyArgument);
  process.exit(0);
}

const n = (x) => x.toLocaleString();
console.log(
  `NEW2 YEAR-SCOPE PLAN — ${selected.length} of ${candidates.length} candidate scopes\n`,
);
console.log(
  `  band ceiling ${BAND_CEILING} (parsed from the launcher) · backlog ${BACKLOG_FROM}-${RECENT_FROM - 1} · recent ${RECENT_FROM}+`,
);
console.log(
  `  source ${survey.generatedAt ?? '?'} · held ${heldSnapshot.takenAt ?? '?'} · min remaining ${n(MIN_REMAINING)} · finished at >=${(MAX_HELD_PCT * 100).toFixed(0)}% held\n`,
);
console.log(
  '  #'.padEnd(4),
  'scope'.padEnd(24),
  'band'.padEnd(11),
  'remaining'.padStart(11),
  'held%'.padStart(7),
  '  tier',
);
selected.forEach((r, i) => {
  console.log(
    `  ${String(i + 1).padEnd(2)}`,
    r.scope.padEnd(24),
    r.band.padEnd(11),
    n(r.remainingDocuments).padStart(11),
    `${(r.heldPct * 100).toFixed(1)}%`.padStart(7),
    `  ${r.tierLabel}`,
  );
});

console.log(
  `\n  remaining counts DOCUMENTS at source minus JUDGMENT ROWS held — the fetch, not the authority gap.`,
);
console.log(
  `  ${finished.length} scope(s) at >=${(MAX_HELD_PCT * 100).toFixed(0)}% held treated as FINISHED · ${belowThreshold.length} below ${n(MIN_REMAINING)} remaining.`,
);

/**
 * DROPPED BUT PREVIOUSLY RUNNING — the one class that can silently lose work.
 *
 * This plan drives the launcher, so an excluded scope is a worker that stops
 * being started. A scope with a checkpoint on disk has real stored progress, so
 * excluding it is a decision, not a non-event, and it gets printed with the
 * numbers that caused it. Three scopes from the old hand-written block land here
 * on the first run and all three are genuinely finished — but that had to be
 * READ, not assumed.
 */
const droppedWithProgress = [...finished, ...belowThreshold].filter((r) => r.ranBefore);
if (droppedWithProgress.length > 0) {
  console.log(
    `\n  DROPPED BUT RAN BEFORE — ${droppedWithProgress.length} scope(s) with stored progress that this plan does NOT schedule:`,
  );
  for (const r of droppedWithProgress.sort((a, b) => b.remainingDocuments - a.remainingDocuments)) {
    console.log(
      `    ${r.scope.padEnd(24)} ${n(r.remainingDocuments).padStart(9)} remaining of ${n(r.sourceDocuments).padStart(9)}  ${(r.heldPct * 100).toFixed(1)}% held  ${r.heldPct >= MAX_HELD_PCT ? 'FINISHED' : `below ${n(MIN_REMAINING)}`}`,
    );
  }
  console.log('    Check these before a boot: they are the only way this plan can lose work.');
}

if (unjoinedSurveyNames.length > 0) {
  console.log(`\n  UNJOINED — survey court name with no code: ${unjoinedSurveyNames.join(', ')}`);
}
if (heldWithNoSource.length > 0) {
  console.log(`\n  HELD WITH NO SOURCE DENOMINATOR — cannot be scheduled, must not be forgotten:`);
  for (const h of heldWithNoSource) {
    console.log(`    ${String(h.court).padEnd(28)} ${h.heldDocuments == null ? 'held unknown' : `${n(h.heldDocuments)} rows held`}`);
  }
}

console.log(`\n  the launcher reads this file directly. To run only this plan's scopes:`);
console.log(`    powershell -File scripts\\start-ingest-fleet.ps1 -Only "<names>"`);
console.log(`\n  written: ${OUT}`);
