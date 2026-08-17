/**
 * GUARD — the Drizzle journal, the migration files and git must agree.
 *
 * LCC, 17 Aug 2026. Written because `ci:local` was green while NINE migrations
 * were invisible to it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `ci:local` already runs `migrate` twice against a scratch database — once to
 * prove migrations apply to an empty database, once to prove a re-run is a
 * no-op. Both passed every day while the journal ended at `0046` and
 * `0030`, `0033` and `0047`–`0053` existed only as files on this machine.
 *
 * They passed BECAUSE of the gap, not in spite of it. Drizzle's migrator reads
 * `meta/_journal.json` and nothing else — a `.sql` file with no journal entry is
 * not a pending migration, it is a file the migrator has never heard of. So the
 * scratch database was built correctly from a 45-entry journal, agreed with
 * itself, and went green, while the database everything actually runs against
 * had 52 migrations applied by hand. Seven of those files were not even tracked
 * by git, so a fresh clone could not have applied them had it wanted to.
 *
 * That is the failure this guard is shaped against: **a migration is only real
 * when the journal, the file and git all know about it.** Any one of the three
 * missing is silent, and stays silent until someone restores from the repo and
 * gets a schema that is quietly a week behind.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CHECKS, AND WHY EACH ONE IS HERE RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------
 *   1  file -> journal      the drift that actually happened, nine times
 *   2  journal -> file      the mirror image; the migrator THROWS on this one,
 *                           but it throws at deploy time, which is the wrong
 *                           time to find out
 *   3  numeric prefixes     unique and contiguous from 0000. A hole means a file
 *                           was deleted or never committed, and the journal
 *                           cannot see the difference between that and a number
 *                           nobody used
 *   4  journal order        entries in numeric order. Drizzle applies them in
 *                           ARRAY order, so an appended `0030` runs after `0046`
 *                           on a fresh database — and produces a schema no
 *                           existing database has
 *   5  `when` increasing    the migrator's skip test is `lastApplied.created_at
 *                           < migration.when`, reading only the single newest
 *                           row. A non-increasing `when` is therefore not a
 *                           cosmetic ordering problem: it makes a migration
 *                           unapplicable FOREVER, with no error
 *   6  `idx` contiguous     unused by the runtime migrator, used by
 *                           `drizzle-kit generate`. Cheap to keep honest
 *   7  git-tracked          the one that would have caught the seven untracked
 *                           files. `git status` shows them under `??` amongst
 *                           hundreds of other lines, and nobody reads that far
 *
 * It opens no socket and touches no database, so it is safe in CI and during a
 * write freeze.
 *
 *   node scripts/check-migration-journal.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRIZZLE_DIR = join(ROOT, 'packages', 'db', 'drizzle');
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json');

/** Repo-relative, forward slashes — the form `git ls-files` speaks. */
const REL_DRIZZLE = 'packages/db/drizzle';

const failures = [];
const fail = (check, detail) => failures.push(`${check}: ${detail}`);

/** `0047_hc_ingest_ledger` -> 47. Anything else is not a migration tag. */
function numberOf(tag) {
  const m = /^(\d{4})_/.exec(tag);
  return m ? Number(m[1]) : null;
}

const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
const entries = journal.entries ?? [];

const files = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''))
  .sort();

const journalTags = new Set(entries.map((e) => e.tag));
const fileTags = new Set(files);

// 1 — every file is journalled. The nine.
for (const tag of files) {
  if (!journalTags.has(tag))
    fail(
      'file not in journal',
      `${tag}.sql exists but no journal entry — the migrator will never apply it`,
    );
}

// 2 — every journal entry has a file.
for (const tag of journalTags) {
  if (!fileTags.has(tag))
    fail(
      'journal entry has no file',
      `${tag} is journalled but ${tag}.sql is missing — migrate throws at run time`,
    );
}

// 3 — numeric prefixes unique and contiguous from 0000.
const numbers = files.map(numberOf);
for (const [i, n] of numbers.entries()) {
  if (n === null)
    fail('unparseable migration name', `${files[i]}.sql does not start with a four-digit prefix`);
}
const seen = new Map();
for (const [i, n] of numbers.entries()) {
  if (n === null) continue;
  if (seen.has(n))
    fail(
      'duplicate migration number',
      `${String(n).padStart(4, '0')} used by both ${seen.get(n)} and ${files[i]}`,
    );
  else seen.set(n, files[i]);
}
const present = [...seen.keys()].sort((a, b) => a - b);
for (let n = 0; n <= (present.at(-1) ?? -1); n += 1) {
  if (!seen.has(n))
    fail(
      'gap in migration numbers',
      `${String(n).padStart(4, '0')} is missing — a deleted or uncommitted migration looks exactly like this`,
    );
}

// 4/5/6 — order, `when`, `idx`.
let previousNumber = -1;
let previousWhen = -1;
for (const [position, entry] of entries.entries()) {
  const n = numberOf(entry.tag);
  if (n !== null && n <= previousNumber) {
    fail(
      'journal out of numeric order',
      `${entry.tag} sits at position ${position}, after ${String(previousNumber).padStart(4, '0')} — drizzle applies ARRAY order, so a fresh database would run these in a sequence no existing database ran`,
    );
  }
  if (n !== null) previousNumber = n;

  if (!(entry.when > previousWhen)) {
    fail(
      'journal `when` not increasing',
      `${entry.tag} has when=${entry.when}, not greater than the preceding ${previousWhen} — the migrator's high-water skip test would never apply it`,
    );
  }
  previousWhen = entry.when;

  if (entry.idx !== position) {
    fail(
      'journal idx not contiguous',
      `${entry.tag} carries idx=${entry.idx} at position ${position}`,
    );
  }
}

// 7 — git knows about every file, and about the journal.
// `git ls-files` lists only TRACKED paths, so a file absent from this output is
// either untracked or ignored. Both are the same defect from a clone's side.
let tracked;
try {
  tracked = new Set(
    execFileSync('git', ['ls-files', '--', REL_DRIZZLE], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
} catch (error) {
  // Not a git checkout (a release tarball, a container build). Absence of git is
  // not evidence of drift, and reporting it as such would make the guard cry
  // wolf everywhere it cannot see.
  console.log(
    `migration journal: git unavailable, skipping the tracked-files check (${error.message.split('\n')[0]})`,
  );
  tracked = null;
}
if (tracked) {
  for (const tag of files) {
    if (!tracked.has(`${REL_DRIZZLE}/${tag}.sql`)) {
      fail(
        'migration file not tracked by git',
        `${tag}.sql — a fresh clone does not receive it, so its schema silently diverges`,
      );
    }
  }
  if (!tracked.has(`${REL_DRIZZLE}/meta/_journal.json`)) {
    fail(
      'journal not tracked by git',
      '_journal.json — without it a clone has no migration list at all',
    );
  }
}

if (failures.length > 0) {
  console.error(`migration journal: ${failures.length} problem(s)\n`);
  for (const line of failures) console.error(`  ${line}`);
  console.error('\nFix by adding the missing journal entry (in numeric position, with a `when`');
  console.error('between its neighbours) and `git add`ing the file. Never renumber an applied');
  console.error(
    'migration and never edit its SQL — both are forward-only. DEPLOYMENT.md §Migrations.',
  );
  process.exit(1);
}

console.log(`migration journal: OK — ${files.length} migrations, journalled, ordered and tracked`);
