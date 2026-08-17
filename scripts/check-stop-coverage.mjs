/**
 * GUARD — every path that can start a database WRITER must cross a STOP check.
 *
 * NEW2, 16 Aug 2026. Written because I made this claim instead of checking it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * In bus 0550 I told every lane the pause switch was fleet-wide: *"supervise.mjs
 * checks it before restarting anything, so it stops every supervised worker,
 * LCC's paragraph and citation ones included."* Every word of that was true and
 * the conclusion was still wrong, because `scripts/enrich-worker.cmd` has its
 * own `:loop` and never went through `supervise.mjs` at all. LCC found it (bus
 * 0560), and found it the expensive way round: three launchers sit in the
 * Startup folder, so **a reboot during the write freeze would have started two
 * writers against Railway** — breaking a freeze that had already been broken
 * once and then verified fixed.
 *
 * The defect was not the missing check. It was that "fleet-wide" was an
 * assertion about a mechanism rather than an enumeration of entry points, and
 * nothing could tell the difference. This script is that enumeration, so the
 * claim is a test from now on.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS COVERED
 * ---------------------------------------------------------------------------
 * A launcher is covered if it EITHER checks the STOP file itself, OR delegates
 * to something that does. Both are legitimate:
 *
 *   worker-level    hc-load-cli.ts / hc-classify-cli.ts call `stopIfRequested`
 *                   at a batch or page boundary — the strongest form, because it
 *                   holds however the process was started
 *   launcher-level  supervise.mjs and enrich-worker.cmd check before starting
 *                   and before every restart
 *
 * A path that reaches a writer without crossing either is a HOLE and fails this
 * guard. That is exactly what `legal-object-stage1.cmd` and
 * `legal-object-stage2.cmd` do: they `call npx tsx ... enrich-cli.ts` directly.
 *
 *   node scripts/check-stop-coverage.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * STOP is referenced two ways and the first draft of this guard only knew one,
 * which made it report `supervise.mjs` as unprotected when it is the single most
 * protected thing in the tree. `.cmd` files spell the path literally; the JS and
 * PowerShell build it (`join(ROOT, …, '.checkpoints', 'STOP')`,
 * `$stopFile = Join-Path …`), so the literal substring never appears.
 */
const STOP_PATTERN = /checkpoints[\\/]STOP|STOP_FILE|stopIfRequested|['"]STOP['"]|\$stopFile/;

/**
 * COMMENTS ARE STRIPPED BEFORE ANYTHING IS MATCHED, and skipping that produced
 * false results in BOTH directions on the first run: `legal-object-stage1.cmd`
 * read as "delegates to enrich-worker.cmd" because a REM line mentions it, and
 * `start-ingest-fleet.ps1` read as launching `paragraphs-cli.ts` because a
 * comment block explains why it deliberately does NOT. This file is
 * documentation-heavy by house style, so prose mentions outnumber real calls;
 * a guard that cannot tell them apart is measuring the wrong text.
 */
function stripComments(src, path) {
  if (/\.cmd$/i.test(path)) {
    return src
      .split(/\r?\n/)
      .filter((l) => !/^\s*(REM\b|::)/i.test(l))
      .join('\n');
  }
  if (/\.ps1$/i.test(path)) {
    return src
      .replace(/<#[\s\S]*?#>/g, '')
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
  }
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/**
 * The CLIs that WRITE to the database. A read-only tool may ignore the freeze —
 * the point of the pause is quiescing writers, and treating a reporting script
 * as a writer would make this guard cry wolf.
 */
const WRITERS = [
  'hc-load-cli.ts',
  'hc-classify-cli.ts',
  'enrich-cli.ts',
  'citations-cli.ts',
  'paragraphs-cli.ts',
];

/** Things that are themselves known to enforce STOP, so delegating to one is coverage. */
const ENFORCERS = ['supervise.mjs', 'enrich-worker.cmd'];

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
/** Source with comments removed — the only text this guard is allowed to match against. */
const code = (p) => stripComments(read(p), p);

// -- 1. which writers enforce STOP in their own code -------------------------
const workerLevel = new Map();
for (const w of WRITERS) {
  const candidates = [
    join(ROOT, 'services', 'ingest', 'src', w),
    join(ROOT, 'services', 'ingest', 'src', 'harvest', w),
  ];
  const path = candidates.find(existsSync);
  const src = path ? code(path) : '';
  workerLevel.set(w, {
    found: Boolean(path),
    enforces: STOP_PATTERN.test(src) || /stopIfRequested/.test(src),
  });
}

// -- 2. which enforcers actually enforce -------------------------------------
const enforcerOk = new Map();
for (const e of ENFORCERS) {
  const p = existsSync(join(ROOT, 'scripts', e)) ? join(ROOT, 'scripts', e) : null;
  enforcerOk.set(e, p ? STOP_PATTERN.test(code(p)) : false);
}

// -- 3. every launcher, including the installed Startup copies ---------------
const launchers = [];
for (const f of readdirSync(join(ROOT, 'scripts'))) {
  if (/\.(cmd|ps1)$/i.test(f) && !ENFORCERS.includes(f)) {
    launchers.push({ label: `scripts/${f}`, path: join(ROOT, 'scripts', f), installed: false });
  }
}
/**
 * The Startup copies are checked SEPARATELY and not assumed identical to the
 * repo file. They are separate files that are copied by hand, and a repo fix
 * that was never installed is precisely the failure mode `lawmind-ingest.cmd`
 * already had once.
 */
const startupDir = join(process.env['APPDATA'] ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
if (existsSync(startupDir)) {
  for (const f of readdirSync(startupDir)) {
    if (/^Lawmind.*\.cmd$/i.test(f)) {
      launchers.push({ label: `STARTUP/${f}`, path: join(startupDir, f), installed: true });
    }
  }
}

const rows = [];
for (const l of launchers) {
  const src = code(l.path);
  const writersHit = WRITERS.filter((w) => src.includes(w));
  const delegatesTo = ENFORCERS.filter((e) => src.includes(e));
  const chains = [...new Set([...launchers.filter((o) => src.includes(o.label.split('/').pop())).map((o) => o.label)])];

  const checksItself = STOP_PATTERN.test(src);
  const delegatesToEnforcer = delegatesTo.some((e) => enforcerOk.get(e));
  /** Every writer it names enforces STOP in its own code. */
  const allWritersSelfEnforce =
    writersHit.length > 0 && writersHit.every((w) => workerLevel.get(w)?.enforces);
  /** It launches no writer directly and hands off to another launcher that is itself judged. */
  const indirect = writersHit.length === 0 && (delegatesTo.length > 0 || chains.length > 0);

  const covered = checksItself || delegatesToEnforcer || allWritersSelfEnforce || indirect;
  rows.push({
    label: l.label,
    installed: l.installed,
    writers: writersHit,
    via: checksItself
      ? 'checks STOP itself'
      : delegatesToEnforcer
        ? `delegates to ${delegatesTo.filter((e) => enforcerOk.get(e)).join(', ')}`
        : allWritersSelfEnforce
          ? 'writers enforce STOP themselves'
          : indirect
            ? `hands off to ${[...delegatesTo, ...chains].join(', ') || 'another launcher'}`
            : 'NOTHING',
    covered,
  });
}

console.log('STOP COVERAGE — every path to a database writer must cross a STOP check\n');
console.log('  writer-level enforcement (strongest — holds however the process is started):');
for (const [w, v] of workerLevel) {
  console.log(`    ${v.enforces ? 'YES ' : 'no  '} ${w}${v.found ? '' : '   (NOT FOUND)'}`);
}
console.log('\n  enforcers:');
for (const [e, ok] of enforcerOk) console.log(`    ${ok ? 'YES ' : 'NO  '} ${e}`);

console.log('\n  launchers:');
const holes = [];
for (const r of rows.sort((a, b) => Number(a.covered) - Number(b.covered))) {
  const mark = r.covered ? 'OK  ' : 'HOLE';
  if (!r.covered) holes.push(r);
  console.log(`    ${mark} ${r.label.padEnd(46)} ${r.via}${r.writers.length ? `  [${r.writers.join(' ')}]` : ''}`);
}

console.log('');
if (holes.length === 0) {
  console.log('PASS — no launcher reaches a writer without crossing a STOP check.');
  process.exit(0);
}
console.log(`FAIL — ${holes.length} launcher(s) can start a writer during a freeze:`);
for (const h of holes) {
  console.log(`  ${h.label}  ->  ${h.writers.join(', ')}`);
}
console.log('\nFix by adding a STOP check to the launcher, or `stopIfRequested` to the writer.');
console.log('The writer-level fix is better: it holds however the process was started.');
process.exit(1);
