/**
 * NEW2 — R9 §1. THE DELTA PLAN: scopes the upstream manifest says have work and
 * the launcher has no line for.
 *
 * ---------------------------------------------------------------------------
 * WHY A SECOND PLAN FILE AND NOT SIX MORE COURT CODES IN THE LAUNCHER
 * ---------------------------------------------------------------------------
 * `start-ingest-fleet.ps1` carries a standing list of 18 courts with a comment
 * naming seven more as ABSENT ON PURPOSE — "at >=99.99% of that window, a
 * missing worker here means COMPLETED, not forgotten."
 *
 * That was true when it was written and it is FALSE NOW: the fresh upstream
 * manifest shows `1_12`, `2_5`, `5_15`, `11_24`, `14_25` and `17_21` all grew
 * their 2026 partition since our last walk. "Completed" is only ever true for a
 * moment against a bucket that writes daily.
 *
 * The repo's own rule (`fleet-work-is-derived-not-typed`, and this launcher's own
 * header) is that the fix is NOT to type six more names — a typed list goes stale
 * the same way this one did. So the delta becomes a PLAN, derived from the
 * manifest each time, in the same JSON shape the launcher already consumes.
 *
 * Scopes already covered by a standing launcher block are EXCLUDED, and the
 * standing lists are PARSED OUT OF THE LAUNCHER rather than repeated here, for
 * the same reason: a copied list is the defect.
 *
 * Usage:
 *   node scripts/n2-upstream-manifest.mts   (fresh manifest)
 *   node scripts/n2-delta-scopes.mjs        (manifest -> scopes)
 *   node scripts/n2-delta-plan.mjs          (scopes -> launcher plan)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LAUNCHER = join(ROOT, 'scripts/start-ingest-fleet.ps1');
const DELTA_SCOPES = join(ROOT, 'docs/ai/new2-r9/delta-scopes.json');
const OUT = join(ROOT, 'docs/ops/migration/new2-delta-plan.json');

/** Every scope name the launcher's standing blocks can start, read from its source. */
function launcherStandingScopes() {
  const src = readFileSync(LAUNCHER, 'utf8');
  const scopes = new Set();
  // foreach ($c in @('a','b')) { Start-Worker "hc-boot-$c" ... }
  const re = /foreach\s*\(\$c\s+in\s+@\(([^)]*)\)\)\s*\{\s*\r?\n?\s*Start-Worker\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const courts = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const c of courts) scopes.add(m[2].replace('$c', c));
  }
  // Standalone Start-Worker 'name' lines.
  for (const s of src.matchAll(/^\s*Start-Worker\s+'([^']+)'/gm)) scopes.add(s[1]);
  return scopes;
}

const standing = launcherStandingScopes();
const delta = JSON.parse(readFileSync(DELTA_SCOPES, 'utf8'));

/**
 * Concurrency is set from bytes waiting, not from a remembered fleet width.
 * `postgres-deaths-are-console-signals-not-oom` retired the theory that width was
 * killing workers, but the delta here is ~20 MB of metadata — a scope with 5 KB
 * waiting does not need 32 sockets.
 */
function concurrencyFor(bytes) {
  if (bytes >= 1_000_000) return 24;
  if (bytes >= 100_000) return 16;
  return 8;
}

const workers = [];
const alreadyCovered = [];
for (const s of delta.scopes) {
  if (standing.has(s.scope)) {
    alreadyCovered.push(s.scope);
    continue;
  }
  workers.push({
    scope: s.scope,
    court: s.court,
    year: s.year ?? null,
    fromYear: s.year != null ? null : (s.fromYear ?? 2016),
    toYear: s.year != null ? null : (s.toYear ?? null),
    concurrency: concurrencyFor(s.bytes),
    tier: 0,
    bytesWaiting: s.bytes,
    objects: s.keys.length,
    reason: 'upstream object GROWN or NEW since our recorded cursor read',
  });
}

const out = {
  takenAt: new Date().toISOString(),
  source: 'docs/ai/new2-r9/delta-scopes.json',
  manifestTakenAt: delta.manifestTakenAt,
  note: 'Derived from a fresh upstream object manifest. Scopes the launcher already starts are excluded and listed under alreadyCovered.',
  alreadyCovered,
  workers,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log(`launcher standing scopes parsed: ${standing.size}`);
console.log(`delta scopes: ${delta.scopes.length} · already covered: ${alreadyCovered.length} · NEEDING A PLAN LINE: ${workers.length}`);
for (const w of workers) {
  console.log(`  ${w.scope.padEnd(24)} court=${w.court} year=${w.year ?? '-'} from=${w.fromYear ?? '-'} to=${w.toYear ?? '-'} conc=${w.concurrency} bytes=${w.bytesWaiting.toLocaleString()}`);
}
console.log(`written: ${OUT}`);
