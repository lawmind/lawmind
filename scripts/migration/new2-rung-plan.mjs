/**
 * NEW2 — which N scopes to run at a given rung of the scale ladder.
 *
 * The ladder is 3 canaries -> 8 -> 16 -> 24/32/38, and until now there was no
 * way to launch a rung at all: `start-ingest-fleet.ps1` launches the entire
 * historical fleet in one go, all bands, ~38 workers. "Measure at 8, then decide"
 * is not executable against an all-or-nothing launcher, so this emits the ordered
 * scope list and the launcher grows a `-Only` filter to consume it.
 *
 * Opens no database connection. Every input is a file on disk, which is what
 * makes it usable during the hold — the rung for the first post-cutover step has
 * to be decidable before the database is available, or the decision gets made in
 * a hurry the moment it is.
 *
 * ---------------------------------------------------------------------------
 * HOW THE ORDER IS DERIVED, AND WHERE IT IS A PROXY
 * ---------------------------------------------------------------------------
 * Band order is the agreed coverage priority, not a judgement made here:
 * 2016-2022 first (the 7.69M gap nobody had named), then remaining pre-2016,
 * then 2023-2024, then recent freshness.
 *
 * Within a band, scopes are ordered by SOURCE DOCUMENTS IN THAT BAND, read from
 * `docs/HC_METADATA_SURVEY.json` — parquet footers for 1,493 objects, so the
 * denominators are exact counts and not estimates.
 *
 * ---------------------------------------------------------------------------
 * CORRECTED 17 AUG 2026 — EVERY BAND IS NOW EXACT, AND THE OLD REASON FOR THE
 * UPPER BOUND WAS FACTUALLY WRONG ABOUT ITS OWN INPUT FILE
 * ---------------------------------------------------------------------------
 * This header used to say:
 *
 *   "2016-2022   last10Years   UPPER BOUND — the survey does not separate
 *    2016-2022 from 2023-2026, so this over-counts by the recent tail"
 *   "y2023/y2024 not separable  UNRANKED, placed last within band"
 *
 * **The survey does separate them.** `HC_METADATA_SURVEY.json` carries
 * `perCourtPerYear` — an exact per-court, per-year document count for the whole
 * 1950-2026 span — alongside the `perCourt` totals this file was reading. The
 * upper bound was never necessary; only `perCourt` had ever been opened.
 *
 * That was not a cosmetic imprecision. **`y2023`/`y2024` sorted LAST within
 * their band purely for want of a number**, and the three largest courts in the
 * corpus (Allahabad, Bombay, Telangana) hold exactly ZERO 2024 documents against
 * 264,889 / 277,355 / 38,931 at source. A ranking that cannot see a band cannot
 * prioritise it.
 *
 *   pre-2016    sum(perCourtPerYear[y] for y < 2016)      EXACT
 *   2016-2022   sum(... 2016 <= y <= 2022)                EXACT
 *   y2023       perCourtPerYear[2023]                     EXACT
 *   y2024       perCourtPerYear[2024]                     EXACT
 *   recent      sum(... y >= 2025)                        EXACT
 *
 * `perCourtPerYear` is keyed by court NAME and everything else here is keyed by
 * CODE, so the two are joined through `perCourt`. A court that fails to join is
 * reported, never silently dropped to `null` and sorted last — that is the exact
 * shape of the bug being fixed.
 *
 * NOTHING IS RANKED BY `MIN(date)`. A court whose earliest held judgment is 1951
 * can still be missing 97% of 1951-2015, and that mistake has been made in this
 * project before.
 *
 *   node scripts/migration/new2-rung-plan.mjs --workers 8
 *   node scripts/migration/new2-rung-plan.mjs --workers 16 --json
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURVEY = join(ROOT, 'docs', 'HC_METADATA_SURVEY.json');
const INVENTORY = join(ROOT, 'docs', 'ops', 'migration', 'new2-checkpoint-inventory.json');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-rung-plan.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WORKERS = Number(arg('workers', '8'));
const JSON_ONLY = process.argv.includes('--json');

for (const [label, path] of [
  ['survey', SURVEY],
  ['checkpoint inventory', INVENTORY],
]) {
  if (!existsSync(path)) {
    console.error(`missing ${label}: ${path}`);
    if (path === INVENTORY)
      console.error('run scripts/migration/new2-checkpoint-inventory.mjs first.');
    process.exit(2);
  }
}

const survey = JSON.parse(readFileSync(SURVEY, 'utf8'));
const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));

/** court code -> exact source counts from the parquet footers. */
const source = new Map();
for (const c of survey.perCourt ?? []) {
  source.set(c.code, { name: c.name, allYears: c.allYears, last10Years: c.last10Years });
}

/**
 * Which band a calendar year belongs to. The single definition — the ranking,
 * the absent-scope scan and the totals all read it, so they cannot drift apart.
 */
function bandOfYear(year) {
  if (year < 2016) return 'pre-2016';
  if (year <= 2022) return '2016-2022';
  if (year === 2023) return 'y2023';
  if (year === 2024) return 'y2024';
  return 'recent (2016+, unbounded)';
}

/**
 * court code -> band -> EXACT source documents, summed from `perCourtPerYear`.
 *
 * Joined name -> code through `perCourt`. A name present in `perCourtPerYear`
 * with no matching `perCourt` entry is collected into `unjoinedCourtNames` and
 * REPORTED — silently dropping it would reproduce the failure this replaces,
 * where a band with no number sorted last and became invisible.
 */
const unjoinedCourtNames = [];
const bandSourceByCourt = new Map();
{
  const codeByName = new Map();
  for (const [code, s] of source) codeByName.set(s.name, code);
  for (const [courtName, years] of Object.entries(survey.perCourtPerYear ?? {})) {
    const code = codeByName.get(courtName);
    if (!code) {
      unjoinedCourtNames.push(courtName);
      continue;
    }
    const bands = bandSourceByCourt.get(code) ?? new Map();
    for (const [yearText, n] of Object.entries(years)) {
      const band = bandOfYear(Number(yearText));
      bands.set(band, (bands.get(band) ?? 0) + Number(n));
    }
    bandSourceByCourt.set(code, bands);
  }
}
const bandSourceFor = (court, band) => bandSourceByCourt.get(court)?.get(band) ?? null;

/** The agreed coverage order. Lower sorts first. */
const BAND_RANK = {
  '2016-2022': 0,
  'pre-2016': 1,
  y2023: 2,
  y2024: 2,
  'recent (2016+, unbounded)': 3,
};

/**
 * The scope name `supervise.mjs` was launched with. Reconstructed from the
 * checkpoint filename exactly as `start-ingest-fleet.ps1` builds it, so `-Only`
 * matches. A name that does not round-trip is a scope that would silently never
 * start, which is worse than one that errors.
 */
function scopeName(court, band) {
  if (band === '2016-2022') return `hc-boot-mid-${court}`;
  if (band === 'pre-2016') return `hc-boot-hist-${court}`;
  if (band === 'y2023') return `hc-boot-${court}-y2023`;
  if (band === 'y2024') return `hc-boot-${court}-y2024`;
  return `hc-boot-${court}`;
}

/**
 * WHICH SCOPE NAMES CAN `start-ingest-fleet.ps1` ACTUALLY START?
 *
 * Parsed from the launcher rather than assumed, because a plan that emits a name
 * the launcher does not know produces FEWER workers than the rung claims — and
 * the scale decision would then attribute a rung's throughput to a worker count
 * that never existed. That corrupts every comparison after it, silently.
 *
 * The `foreach` lists are expanded by MATCH OFFSET. The first version of this
 * used `indexOf` on the matched text, and the two `hc-boot-hist-$c` loops are
 * byte-identical, so the second one re-read the first one's court list and
 * reported `2_5` and `5_15` as unstartable when they are right there on line 209.
 */
function launcherScopeNames() {
  const path = join(ROOT, 'scripts', 'start-ingest-fleet.ps1');
  const src = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const names = new Set();
  for (const m of src.matchAll(/Start-Worker\s+'([^']+)'/g)) names.add(m[1]);
  const loops = [...src.matchAll(/foreach\s*\(\$c\s+in\s+@\(([\s\S]*?)\)\)/g)];
  for (const m of src.matchAll(/Start-Worker\s+"([^"]+)"/g)) {
    const at = m.index ?? 0;
    const loop = loops.filter((l) => (l.index ?? 0) < at).pop();
    if (!loop) continue;
    for (const q of loop[1].match(/'([^']+)'/g) ?? []) {
      names.add(m[1].replace('$c', q.replace(/'/g, '')));
    }
  }
  /**
   * SINCE 17 AUG 2026 NOT EVERY STARTABLE NAME IS WRITTEN IN THE LAUNCHER.
   *
   * The year-scoped block is generated: the launcher reads
   * `new2-yearscope-plan.json` and starts every worker whose tier is inside its
   * `-PlanTiers` default. Those names exist in no `Start-Worker` line, so a
   * scanner that only reads the source concludes nineteen live, ranked scopes
   * are unstartable and files them as ORPHANED — the loudest class this tool
   * has, and it would be wrong about all nineteen.
   *
   * The tier default is PARSED from the launcher's `param()` block rather than
   * assumed, for the same reason the launcher parses its own band ceiling: a
   * constant copied between two files is a constant that drifts. If the default
   * cannot be read, NO plan names are added — under-reporting startability
   * costs a rung slot, over-reporting corrupts the throughput attribution.
   */
  const tierDefault = src.match(/\[string\]\$PlanTiers\s*=\s*'([\d,\s]*)'/)?.[1];
  const PLAN = join(ROOT, 'docs', 'ops', 'migration', 'new2-yearscope-plan.json');
  if (tierDefault != null && existsSync(PLAN)) {
    const tiers = new Set(
      tierDefault
        .split(',')
        .map((t) => Number(t.trim()))
        .filter((t) => Number.isFinite(t)),
    );
    const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
    for (const w of plan.workers ?? []) if (tiers.has(Number(w.tier))) names.add(w.scope);
  }
  return names;
}
const launcherNames = launcherScopeNames();

/**
 * Checkpoints exist for workers that are NOT this lane's harvest fleet — LCC's
 * `paragraphs` shard among them. Ranking one into a harvest rung would launch
 * the wrong CLI against the wrong table under NEW2's worker budget.
 */
const NOT_HARVEST = /paragraph|citation|classify|enrich/i;

const rows = [];
for (const s of inventory.scopes ?? []) {
  if (s.PARSE_FAILED) continue;
  if (NOT_HARVEST.test(s.file) || NOT_HARVEST.test(s.court ?? '')) continue;
  const src = source.get(s.court);
  const band = s.yearBand;
  /** Exact for every band since 17 Aug 2026 — see the header's correction. */
  const bandSource = bandSourceFor(s.court, band);
  const exact = bandSource != null;
  const name = scopeName(s.court, band);
  rows.push({
    scope: name,
    startableByLauncher: launcherNames.has(name),
    checkpointFile: s.file,
    court: s.court,
    courtName: src?.name ?? null,
    band,
    bandRank: BAND_RANK[band] ?? 9,
    bandSourceDocuments: bandSource,
    bandSourceIsExact: bandSource == null ? null : exact,
    /** A stored offset means this scope RESUMES rather than cold-starts. */
    resumesFrom: s.maxOffset ?? 0,
    sourceFileCount: s.sourceFileCount ?? 0,
  });
}

/**
 * A scope the launcher cannot start is EXCLUDED from the rung and REPORTED, not
 * quietly ranked. Silently including it would hand `-Only` a name that gets
 * ignored, so the rung would run short and the metrics would credit the shortfall
 * to the wrong worker count.
 */
const startable = rows.filter((r) => r.startableByLauncher);

/**
 * NOT EVERY UNSTARTABLE SCOPE IS A DEFECT, and collapsing the two classes would
 * bury the one that is.
 *
 * DELIBERATE — the launcher documents seven courts it omits from the 2016+ band
 * because they are at >=99.99% of it. A missing worker there means COMPLETED.
 * The list is read from the launcher's own comment, so it cannot drift out of
 * step with the code it describes.
 *
 * ORPHANED — a scope with real stored progress that NO launcher can restart. It
 * exists only because a human typed a command once, and a reboot loses it. The
 * y2023 backlog workers are exactly this: six were hand-started (bus 0371) and
 * only two of them were ever written into the launcher.
 */
const deliberate = new Set(
  (
    readFileSync(join(ROOT, 'scripts', 'start-ingest-fleet.ps1'), 'utf8').match(
      /ABSENT ON PURPOSE[\s\S]{0,400}?(?=\n\s*foreach|\n\s*#\s*--)/,
    )?.[0] ?? ''
  ).match(/\b\d+_\d+\b/g) ?? [],
);
/**
 * A THIRD REASON A SCOPE IS NOT STARTABLE, AND IT IS GOOD NEWS.
 *
 * `ORPHANED` means "real stored progress that a reboot loses" — the loudest
 * verdict this file has, and it used to be the default for anything the launcher
 * did not name. Since the year-scoped block became generated that is no longer
 * safe: `new2-yearscope-plan.mjs` deliberately EXCLUDES a scope once it is at or
 * above 97% held, so three scopes with large stored offsets — 3_22-y2023 at
 * 149,388, 10_8-y2023 at 135,913, 8_9-y2023 at 63,646 — stopped being launched
 * on 17 Aug 2026 and were immediately reported here as data about to be lost.
 *
 * They hold 158, 27 and 14 remaining documents. That is COMPLETION, not loss.
 * Reading the exclusion reason out of the plan is what separates the two; the
 * offset alone cannot, because a finished scope has the largest offset of all.
 */
const yearscopeExclusion = new Map();
{
  const p = join(ROOT, 'docs', 'ops', 'migration', 'new2-yearscope-plan.json');
  if (existsSync(p)) {
    const plan = JSON.parse(readFileSync(p, 'utf8'));
    for (const r of plan.excludedFinished ?? [])
      yearscopeExclusion.set(
        r.scope,
        `COMPLETE — year-scope plan excludes it at ${(r.heldPct * 100).toFixed(1)}% held, ${r.remainingDocuments.toLocaleString()} documents remaining`,
      );
    for (const r of plan.excludedBelowMinRemaining ?? [])
      yearscopeExclusion.set(
        r.scope,
        `BELOW THRESHOLD — year-scope plan excludes it at ${r.remainingDocuments.toLocaleString()} documents remaining`,
      );
  }
}
const unstartable = rows
  .filter((r) => !r.startableByLauncher)
  .map((r) => ({
    ...r,
    reason:
      yearscopeExclusion.get(r.scope) ??
      (deliberate.has(r.court) && r.band.startsWith('recent')
        ? 'DELIBERATE — launcher documents this court as >=99.99% complete for the 2016+ window'
        : 'ORPHANED — real stored progress, no launcher can restart it, a reboot loses it'),
  }));
const orphaned = unstartable.filter((r) => r.reason.startsWith('ORPHANED'));

/**
 * ABSENT — a band with real source documents and NO CHECKPOINT AT ALL.
 *
 * This is a third class, and it was invisible to every earlier version of this
 * file, because the loop above iterates the checkpoint inventory: it can only
 * ever see scopes that have already run at least once. A scope that never
 * started leaves nothing to iterate.
 *
 * That blindness is not hypothetical. On 17 Aug 2026 Allahabad, Bombay and
 * Telangana — the first, second and ninth largest holdings in the corpus — held
 * exactly ZERO documents dated 2024 against 264,889 / 277,355 / 38,931 at
 * source, and no `y2024` checkpoint existed for any of them. The launcher has a
 * hand-written `y2023` rescue block for six courts and a `y2024` one for exactly
 * one court (Manipur, 18,745 documents). Nothing recomputed that list, so the
 * hole was reported by a human reading a year histogram.
 *
 * ORPHANED is "ran, and no launcher can restart it". ABSENT is "never ran, and
 * nothing would ever have told you". They need different fixes and are counted
 * separately for that reason.
 *
 * Only the YEAR-SCOPED bands are scanned. `pre-2016`, `2016-2022` and `recent`
 * each have a standing per-court launcher loop, so an absence there is a
 * deliberate omission the launcher already documents; `y2023`/`y2024` are
 * hand-listed and are the only bands where absence means nobody noticed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS NEEDS HELD COUNTS, AND WHY THE FIRST VERSION WAS USELESS WITHOUT THEM
 * ---------------------------------------------------------------------------
 * "No year-scoped checkpoint" is NOT the same as "not ingested". The unscoped
 * `hc-boot-$c` worker covers 2016 onward, so a court can be at 100% for 2023 and
 * 2024 with no `y2023`/`y2024` checkpoint ever existing.
 *
 * The first version of this scan ignored that and reported **43** absent bands,
 * including Rajasthan, Kerala and Delhi — which are at 100.0%, 100.0% and 99.6%.
 * A tool that tells you to start 43 workers for work already finished is worse
 * than no tool: it burns the rung budget and its next throughput reading is
 * attributed to a worker count that did nothing.
 *
 * So a band is only ABSENT when it has **measured remaining documents**, read
 * from `new2-held-by-court-year.json` — an exact `count(*)` snapshot on disk,
 * NOT a database connection, so this file still runs during a freeze. When that
 * snapshot is missing the scan still runs but every row is marked
 * `heldUnknown`, and the header says so rather than implying a gap that has not
 * been measured.
 */
const HELD = join(ROOT, 'docs', 'ops', 'migration', 'new2-held-by-court-year.json');
const heldSnapshot = existsSync(HELD) ? JSON.parse(readFileSync(HELD, 'utf8')) : null;
const heldFor = (court, year) =>
  heldSnapshot ? Number(heldSnapshot.heldByCourtCodeByYear?.[court]?.[String(year)] ?? 0) : null;

/** Below this many remaining documents a scope is not worth a worker slot. */
const ABSENT_MIN_REMAINING = 1000;

const seenScopes = new Set(rows.map((r) => `${r.court}|${r.band}`));
const absent = [];
for (const [court, bands] of bandSourceByCourt) {
  for (const [band, year] of [
    ['y2023', 2023],
    ['y2024', 2024],
  ]) {
    const src = bands.get(band) ?? 0;
    if (src <= 0) continue;
    if (seenScopes.has(`${court}|${band}`)) continue;
    const held = heldFor(court, year);
    const remaining = held == null ? null : src - held;
    if (remaining != null && remaining < ABSENT_MIN_REMAINING) continue;
    const name = scopeName(court, band);
    /**
     * TWO TOOLS MUST NOT DISAGREE ABOUT WHETHER TO START A WORKER.
     *
     * `ABSENT_MIN_REMAINING` alone passed `hc-boot-36_29-y2023` — 1,075 documents
     * remaining — while the year-scope plan excludes it at 98.4% held. This file
     * then printed it as a gap with `NO launcher line`, which reads as a defect
     * in the launcher rather than a threshold this project deliberately set. The
     * scheduler owns that call; deferring to its recorded decision is what keeps
     * the two from drifting into contradicting each other in print.
     */
    if (yearscopeExclusion.has(name)) continue;
    absent.push({
      scope: name,
      court,
      courtName: source.get(court)?.name ?? null,
      band,
      bandRank: BAND_RANK[band] ?? 9,
      bandSourceDocuments: src,
      bandSourceIsExact: true,
      heldDocuments: held,
      remainingDocuments: remaining,
      heldUnknown: held == null,
      startableByLauncher: launcherNames.has(name),
      resumesFrom: 0,
      reason: launcherNames.has(name)
        ? 'ABSENT — launcher can start it but it has never run'
        : 'ABSENT — never ran AND no launcher can start it; add a Start-Worker line',
    });
  }
}
absent.sort(
  (a, b) =>
    (b.remainingDocuments ?? b.bandSourceDocuments) -
    (a.remainingDocuments ?? a.bandSourceDocuments),
);

startable.sort((a, b) => {
  if (a.bandRank !== b.bandRank) return a.bandRank - b.bandRank;
  /** Unranked scopes go last WITHIN their band, never silently first. */
  if ((a.bandSourceDocuments == null) !== (b.bandSourceDocuments == null))
    return a.bandSourceDocuments == null ? 1 : -1;
  if (a.bandSourceDocuments !== b.bandSourceDocuments)
    return (b.bandSourceDocuments ?? 0) - (a.bandSourceDocuments ?? 0);
  return a.scope.localeCompare(b.scope);
});

const selected = startable.slice(0, WORKERS);

const out = {
  tool: 'scripts/migration/new2-rung-plan.mjs',
  takenAt: new Date().toISOString(),
  rung: WORKERS,
  scopesAvailable: startable.length,
  bandOrder: ['2016-2022', 'pre-2016', 'y2023/y2024', 'recent'],
  caveat:
    'Band source is EXACT for every band, summed per-year from HC_METADATA_SURVEY.json perCourtPerYear (corrected 17 Aug 2026 — the previous UPPER BOUND was unnecessary). "recent" counts 2025+ only, so it does not double-count the 2016-2022 and y2023/y2024 scopes that cover the rest of the unscoped worker range. Source counts DOCUMENTS, not JUDGMENTS. Never derived from MIN(date).',
  onlyArgument: selected.map((r) => r.scope).join(','),
  selected,
  remaining: startable.slice(WORKERS),
  unstartableByLauncher: unstartable,
  orphanedCount: orphaned.length,
  absentScopes: absent,
  absentCount: absent.length,
  unjoinedCourtNames,
};
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

if (JSON_ONLY) {
  console.log(out.onlyArgument);
  process.exit(0);
}

console.log(`NEW2 RUNG PLAN — ${WORKERS} workers of ${startable.length} startable scopes`);
console.log(`  band order: ${out.bandOrder.join(' -> ')}   (never MIN(date))\n`);
console.log(
  '  #'.padEnd(4),
  'scope'.padEnd(24),
  'band'.padEnd(26),
  'band source'.padStart(12),
  'resumes from'.padStart(13),
);
selected.forEach((r, i) => {
  const src =
    r.bandSourceDocuments == null
      ? 'unranked'
      : `${r.bandSourceDocuments.toLocaleString()}${r.bandSourceIsExact ? '' : '~'}`;
  console.log(
    `  ${String(i + 1).padEnd(2)}`,
    r.scope.padEnd(24),
    r.band.padEnd(26),
    src.padStart(12),
    String(r.resumesFrom).padStart(13),
  );
});
console.log('\n  band source is an EXACT per-year sum. It counts DOCUMENTS, not judgments.');

if (unjoinedCourtNames.length > 0) {
  console.log(
    `\n  UNJOINED — ${unjoinedCourtNames.length} court name(s) in perCourtPerYear have no perCourt code:`,
  );
  for (const n of unjoinedCourtNames) console.log(`    ${n}`);
  console.log('    Their bands are unranked. Fix the join before trusting the order.');
}

if (absent.length > 0) {
  const basis = heldSnapshot
    ? `remaining measured against ${heldSnapshot.takenAt} held snapshot`
    : 'HELD SNAPSHOT MISSING — these are source counts, NOT measured gaps';
  console.log(
    `\n  ABSENT — ${absent.length} year-scoped band(s) that never ran and still have work (${basis}):`,
  );
  for (const r of absent) {
    const rem =
      r.remainingDocuments == null
        ? 'held unknown'
        : `${r.remainingDocuments.toLocaleString()} remaining`;
    const cov =
      r.remainingDocuments == null
        ? ''
        : ` (${((100 * (r.heldDocuments ?? 0)) / r.bandSourceDocuments).toFixed(1)}% held)`;
    console.log(
      `    ${r.scope.padEnd(24)} ${r.band.padEnd(6)} ${rem.padStart(20)}${cov.padEnd(14)} ${r.startableByLauncher ? 'launcher HAS it' : 'NO launcher line'}`,
    );
  }
  console.log(
    `    ORPHANED = ran, cannot restart. ABSENT = never ran, nothing would have said so.`,
  );
  console.log(
    `    Bands under ${ABSENT_MIN_REMAINING.toLocaleString()} remaining are omitted — a year-scoped worker is not free.`,
  );
}

if (orphaned.length > 0) {
  console.log(
    `\n  ORPHANED — ${orphaned.length} scope(s) hold real progress that NO launcher can restart:`,
  );
  for (const r of orphaned.sort((a, b) => b.resumesFrom - a.resumesFrom)) {
    console.log(
      `    ${r.scope.padEnd(24)} ${r.band.padEnd(12)} resumes from ${String(r.resumesFrom).padStart(8)}`,
    );
  }
  console.log('    These survive only in a shell history. Add them to start-ingest-fleet.ps1.');
}
console.log('\n  launch exactly these:');
console.log(`    powershell -File scripts\\start-ingest-fleet.ps1 -Only "${out.onlyArgument}"`);
console.log(`\n  written: ${OUT}`);
