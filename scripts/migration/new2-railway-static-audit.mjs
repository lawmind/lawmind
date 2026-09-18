/**
 * NEW2 — STATIC audit of every path that could still reach Railway.
 *
 * Opens NO socket and imports NO database driver, by construction. The whole
 * point is to answer "what would connect to Railway if it ran" WITHOUT running
 * it, during a hold whose first rule is that nothing of mine touches the source.
 * A check that had to connect in order to prove nothing connects is the same
 * category error as a verification script that can be pointed at production.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS NOT THE RUNTIME CHECK
 * ---------------------------------------------------------------------------
 * `verify-local-canary.mjs` already asks "is anything of mine holding a Railway
 * connection RIGHT NOW". That is a check on the world at one instant, and it
 * passes trivially while the fleet is at 0 workers — which is exactly when it
 * proves the least. This one asks the durable question instead: after cutover,
 * is there any REMAINING path in the tree by which a worker could arrive back at
 * Railway. Those are different questions and only the second survives a reboot.
 *
 * ---------------------------------------------------------------------------
 * THE FINDING THAT MATTERS, STATED UP FRONT
 * ---------------------------------------------------------------------------
 * Every ingest entry point launches with `--env-file=.env` and every database
 * client reads `process.env.DATABASE_URL`. There is no second mechanism: no
 * hardcoded connection string in executable code, and nothing falls back to
 * `RAILWAY_DATABASE_URL`. So the cutover is ONE LINE in `.env`, and this audit's
 * real job is to keep proving there is no second line — because the day someone
 * adds a fallback is the day a "local" fleet quietly writes to Railway again.
 *
 * ---------------------------------------------------------------------------
 * TWO MODES, DELIBERATELY
 * ---------------------------------------------------------------------------
 *   (default)    audits the CODE only. `DATABASE_URL` pointing at Railway is
 *                CORRECT today — LCC parked the rollback there on purpose — so
 *                failing on it now would make this red for the entire window it
 *                exists to police, and a permanently-red check gets ignored.
 *   --cutover    additionally requires `.env` `DATABASE_URL` to be loopback.
 *                This is the gate to run AFTER `LOCAL_DATABASE_CUTOVER_APPROVED`
 *                and before scaling past the canaries.
 *
 * No credential is ever printed. URLs are reported as host:port/database only,
 * because an audit artifact is a document that gets pasted into a bus message.
 *
 *   node scripts/migration/new2-railway-static-audit.mjs
 *   node scripts/migration/new2-railway-static-audit.mjs --cutover
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-railway-static-audit.json');
const CUTOVER_MODE = process.argv.includes('--cutover');

/** Railway hostnames and the env-var names that carry them. */
const RAILWAY_HOST = /\b[\w-]+\.(?:proxy\.rlwy\.net|up\.railway\.app)\b|\brailway\.internal\b/;
const RAILWAY_DB_HOST = /\b[\w-]+\.proxy\.rlwy\.net\b|\brailway\.internal\b/;

/**
 * COMMENTS ARE STRIPPED BEFORE ANYTHING IS MATCHED. Lifted deliberately from
 * `scripts/check-stop-coverage.mjs`, where skipping it produced false results in
 * BOTH directions on the first run. This tree is documentation-heavy by house
 * style and Railway hostnames appear in dozens of explanatory headers —
 * `db-host.ts`, `supervise.mjs` and `dump.mjs` all narrate a DNS failure by name.
 * Matching raw text here would report the codebase as riddled with Railway
 * connections when what it is actually riddled with is prose about one.
 */
/**
 * Every comment is BLANKED IN PLACE, never dropped, so line N of the stripped
 * text is still line N of the file. The first run of this audit deleted the
 * lines instead and reported `start-local-canary.ps1:34` for a match that is
 * actually on line 82 — a citation to the wrong line is worse than no citation,
 * because the reader looks, sees innocent code, and stops trusting the tool.
 * Block comments are replaced by their own newline count for the same reason.
 */
const blankBlock = (m) => m.replace(/[^\n]/g, ' ');

function stripComments(src, path) {
  if (/\.cmd$/i.test(path)) {
    return src.split(/\r?\n/).map((l) => (/^\s*(REM\b|::)/i.test(l) ? '' : l)).join('\n');
  }
  if (/\.ps1$/i.test(path)) {
    return src
      .replace(/<#[\s\S]*?#>/g, blankBlock)
      .split(/\r?\n/)
      .map((l) => (/^\s*#/.test(l) ? '' : l))
      .join('\n');
  }
  if (/\.(m?js|ts|tsx)$/i.test(path)) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, blankBlock)
      .split(/\r?\n/)
      .map((l) => (/^\s*(\/\/|\*)/.test(l) ? '' : l))
      .join('\n');
  }
  return src;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.expo', 'coverage', '__pycache__', '.agents']);
const CODE_EXT = /\.(m?js|ts|tsx|cmd|ps1)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const rel = (p) => relative(ROOT, p).split(sep).join('/');
/** Documentation and migration artifacts are evidence, not live paths. */
const isDoc = (r) => r.startsWith('docs/');
const isTest = (r) => /\.(test|spec)\.[cm]?tsx?$/.test(r) || /\.live\.test\./.test(r);
/** The migration tooling is ALLOWED to name Railway — moving off it is its job. */
const isMigrationTool = (r) => r.startsWith('scripts/migration/');
/**
 * This file is excluded from its own scan, and that exclusion is PRINTED rather
 * than hidden. A detector necessarily contains every pattern it detects, so its
 * first run flagged its own `DATABASE_PUBLIC_URL` regex as a live connection
 * source. Silently skipping it would be the same dishonesty as a test that
 * excludes the case it fails.
 */
const SELF = 'scripts/migration/new2-railway-static-audit.mjs';

const findings = [];
const add = (severity, kind, file, line, detail) => findings.push({ severity, kind, file, line, detail });

for (const path of files) {
  const r = rel(path);
  if (isDoc(r) || r === SELF) continue;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (!RAILWAY_HOST.test(raw) && !/DATABASE_PUBLIC_URL|RAILWAY_DATABASE_URL|postgres(?:ql)?:\/\//.test(raw)) continue;

  const code = stripComments(raw, path);
  const lines = code.split(/\r?\n/);
  /**
   * DOES THIS FILE BUILD A DATABASE CLIENT AT ALL?
   *
   * Added the moment this audit produced its first false positive on somebody
   * else's work. `services/harness/src/post-migration.test.ts` landed while this
   * was being written and contains `hayabusa.proxy.rlwy.net` as a literal — in a
   * test whose entire purpose is asserting that the host is REFUSED. Flagging it
   * as a live path to Railway would have been the exact inversion the guard
   * exists to prevent, and it is the same lesson as this file's own
   * self-exclusion: a thing that checks for X necessarily contains X.
   *
   * A hostname is a live path only if something can connect with it. No client
   * construction in the file means the string is a fixture, so it is recorded at
   * INFO and named as a fixture rather than dropped — the audit still shows it,
   * it just stops calling it a defect.
   */
  const constructsClient = /\bpostgres\s*\(|new\s+(?:pg\.)?Client\b|createPool|\.connect\s*\(|Npgsql|psql\b/.test(code);
  lines.forEach((text, i) => {
    const line = i + 1;
    const trimmed = text.trim();
    if (!trimmed) return;

    // 1. a literal connection string in executable code — the worst case,
    //    because it survives every .env change anyone makes.
    const literal = trimmed.match(/postgres(?:ql)?:\/\/[^\s"'`)]+/);
    if (literal && !/\$\{|\*\*\*|<pw>|process\.env/.test(literal[0])) {
      /**
       * A RESERVED HOST IS NOT A LIVE PATH.
       *
       * The question this rule asks is "does a connection string in executable
       * code survive an .env cutover and reach a real database". RFC 2606 and
       * RFC 6761 reserve `example.com/.net/.org` and the `.example`, `.invalid`,
       * `.test` and `.localhost` TLDs precisely so that they resolve to nothing,
       * anywhere, ever. A string naming one of them cannot reach a database and
       * therefore cannot be the second path this audit exists to find.
       *
       * Added 18 Sep 2026 (SHIP S4-T0.3) after the two HIGH findings that were
       * failing repository CI turned out to be
       * `postgres://u:p@corpus.internal.example.net:5432/lawmind_corpus` and its
       * user-pool sibling, in `scripts/lcc-deploy-dry-run.mjs` — a dry-run
       * PACKAGE BUILDER whose whole purpose is to write a config it never
       * connects with. Downgraded to INFO rather than exempted: the line is
       * still reported, so a reserved host that later becomes a real one is
       * still visible in the output.
       *
       * It does NOT loosen the rule that matters. A literal `rlwy.net`,
       * `railway.app` or any other resolvable host in executable code is still
       * HIGH, and `railway-db-host-literal` below is untouched.
       */
      const reserved =
        /@[^/\s]*\.(?:example\.(?:com|net|org)|example|invalid|test|localhost)(?::\d+)?\b/i.test(
          literal[0],
        );
      add(
        !constructsClient || reserved
          ? 'INFO'
          : isTest(r) || isMigrationTool(r)
            ? 'MEDIUM'
            : 'HIGH',
        'hardcoded-connection-string',
        r,
        line,
        reserved
          ? 'literal postgres:// URL naming an RFC 2606 / RFC 6761 RESERVED host — it resolves nowhere, so it is not a path to anything'
          : constructsClient
            ? 'literal postgres:// URL in executable code — survives any .env cutover'
            : 'string fixture — the file builds no database client, so nothing can connect with it',
      );
    }

    // 2. a Railway DB hostname in executable code.
    const dbHost = trimmed.match(RAILWAY_DB_HOST);
    if (dbHost) {
      const fixture = !constructsClient;
      add(
        fixture || isMigrationTool(r) ? 'INFO' : 'HIGH',
        'railway-db-host-literal',
        r,
        line,
        fixture
          ? `${dbHost[0]} — string fixture, no database client in this file`
          : isMigrationTool(r)
            ? `${dbHost[0]} — migration tooling, expected to name the source it is leaving`
            : `${dbHost[0]} in executable code`,
      );
    }

    // 3. DATABASE_PUBLIC_URL. `start-local-canary.ps1` and this audit refuse on
    //    it; anything that READS it is a path around that refusal.
    if (/DATABASE_PUBLIC_URL/.test(trimmed)) {
      const reads = /process\.env\[?['"]?DATABASE_PUBLIC_URL|\$env:DATABASE_PUBLIC_URL|%DATABASE_PUBLIC_URL%/.test(trimmed);
      /**
       * The refusal is looked for in a THREE-LINE WINDOW, not on the matching
       * line. `start-local-canary.ps1` reads the variable in an `if (…)` and
       * refuses on the line after — judging one line at a time reported the
       * repo's strictest guard as its worst hole.
       */
      const window = lines.slice(Math.max(0, i - 1), i + 3).join('\n');
      const refuses = /REFUS|Remove\(|throw|exit 1|delete |unset/i.test(window);
      add(
        reads && !refuses ? 'HIGH' : 'INFO',
        'database-public-url',
        r,
        line,
        reads && !refuses ? 'reads DATABASE_PUBLIC_URL as a connection source' : 'names it in a refusal/guard',
      );
    }

    // 4. anything that would FALL BACK to the parked rollback URL.
    if (/RAILWAY_DATABASE_URL/.test(trimmed) && !isMigrationTool(r)) {
      add('HIGH', 'rollback-url-fallback', r, line, 'reads RAILWAY_DATABASE_URL outside the migration tooling');
    }

    // 5. Railway HTTP endpoints. NOT a database path — a different service, and
    //    LCC has stopped api/cron/recheck (bus 0565). Reported so the roll-up is
    //    honest about what still points at a dead host, never as a DB finding.
    const http = trimmed.match(/https?:\/\/[\w-]+\.up\.railway\.app[^\s"'`)]*/);
    if (http) add('INFO', 'railway-http-endpoint', r, line, `${http[0]} — HTTP API base URL, not a database path`);
  });
}

// -- .env: what each URL actually resolves to, credentials never printed ------
function hostOf(value) {
  try {
    const u = new URL(value);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(unparseable)';
  }
}
function classify(value) {
  const h = hostOf(value);
  if (RAILWAY_DB_HOST.test(h)) return 'RAILWAY';
  if (/^(127\.0\.0\.1|localhost|\[::1\])\b/.test(h)) return 'LOOPBACK';
  return 'OTHER';
}

const envPath = join(ROOT, '.env');
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const envVars = [];
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (!m || !/URL$/.test(m[1])) continue;
  envVars.push({ name: m[1], host: hostOf(m[2].trim()), points: classify(m[2].trim()) });
}
const activeUrl = envVars.find((v) => v.name === 'DATABASE_URL') ?? null;

/**
 * EVERY CONNECTION-SOURCE VARIABLE, DISCOVERED FROM THE CODE RATHER THAN LISTED.
 *
 * This section exists because the audit's own headline was wrong. It said "the
 * cutover is one line in `.env`" on the strength of `.env` holding exactly one
 * live `DATABASE_URL` — but `.env` cannot show a variable that is supplied from
 * outside it. Grepping the tree finds THREE connection sources, and two of them
 * appear in no `.env` file at all:
 *
 *   DATABASE_URL         in .env, read by every writer            (the one line)
 *   CORPUS_DATABASE_URL  read by the harness, exported by hand    (invisible here)
 *   ADMIN_DATABASE_URL   read by ci-local to build a scratch DB   (invisible here)
 *
 * `ci-local.mjs` CREATES AND DROPS A DATABASE on whatever server
 * `ADMIN_DATABASE_URL` names. If that is still the Railway server after cutover,
 * a routine local CI run is a live write to the thing we just left. Neither of
 * these is a code defect and neither can be fixed by editing `.env` — which is
 * exactly why they have to be named, rather than covered by a claim about `.env`
 * that is true and incomplete at the same time.
 */
/**
 * TWO PATTERNS, BECAUSE ONE OF THEM HAS A BLIND SPOT THAT NEW1 FOUND (bus 0573).
 *
 * The first pass only matched a name TEXTUALLY ADJACENT to `process.env`, so it
 * missed `POST_MIGRATION_DATABASE_URL` entirely —
 * `services/harness/src/post-migration-cli.ts:1105` reads it through a loop:
 *
 *   for (const name of ['POST_MIGRATION_DATABASE_URL', 'LOCAL_DATABASE_URL', …])
 *
 * The name never appears next to `process.env`, so an adjacency rule cannot see
 * it. That is not one missing variable; it is EVERY indirect lookup, and the
 * whole value of this section is that its list comes from the code rather than
 * from anyone's memory. A discovery pass with a blind spot is a memory with
 * extra steps.
 *
 * So a bare `'…DATABASE_URL'` string literal counts too, and HOW each name was
 * found is recorded. Literal-only discovery is deliberately weaker evidence — a
 * name can appear in an error message without being read anywhere (`ci-local.mjs`
 * prints one) — so it is reported as such rather than silently promoted.
 */
const DISCOVERED = new Map();
const seen = (name, via) => {
  const cur = DISCOVERED.get(name);
  if (!cur) DISCOVERED.set(name, new Set([via]));
  else cur.add(via);
};
for (const path of files) {
  const r = rel(path);
  if (isDoc(r) || r === SELF) continue;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  const code = stripComments(raw, path);
  for (const m of code.matchAll(/(?:process\.env\[?['"]?|\$env:|%)([A-Z_0-9]*DATABASE_URL)/g)) {
    seen(m[1], 'env-access');
  }
  for (const m of code.matchAll(/['"`]([A-Z_0-9]*DATABASE_URL)['"`]/g)) {
    seen(m[1], 'string-literal');
  }
}
const connectionSources = [...DISCOVERED.keys()].sort().map((name) => {
  const inEnvFile = envVars.find((v) => v.name === name) ?? null;
  const inProcess = process.env[name];
  const via = [...DISCOVERED.get(name)].sort();
  return {
    name,
    discoveredVia: via,
    /** Named in a string but never read next to `process.env` — an indirect read, or just prose in an error. */
    indirectOnly: !via.includes('env-access'),
    inEnvFile: inEnvFile ? inEnvFile.points : 'ABSENT',
    envFileHost: inEnvFile?.host ?? null,
    inProcessEnv: inProcess ? classify(inProcess) : 'unset',
    processHost: inProcess ? hostOf(inProcess) : null,
    note:
      inEnvFile || inProcess
        ? null
        : 'supplied per-invocation — .env cannot show it, and repointing .env does not repoint it',
  };
});

// -- entry points: launcher -> env file -> the var its CLI reads --------------
/**
 * Resolved from the launchers rather than assumed, because "everything uses
 * .env" is exactly the kind of mechanism-claim that cost this lane a broken
 * freeze. A launcher naming a DIFFERENT env file is the interesting case.
 */
const WRITERS = ['hc-load-cli.ts', 'hc-classify-cli.ts', 'enrich-cli.ts', 'citations-cli.ts', 'paragraphs-cli.ts'];
const entryPoints = [];
for (const f of readdirSync(join(ROOT, 'scripts'))) {
  if (!/\.(cmd|ps1)$/i.test(f)) continue;
  const p = join(ROOT, 'scripts', f);
  const code = stripComments(readFileSync(p, 'utf8'), p);
  const writers = WRITERS.filter((w) => code.includes(w));
  if (writers.length === 0) continue;
  const envFiles = [...new Set([...code.matchAll(/--env-file=(\S+)/g)].map((m) => m[1].replace(/['"]/g, '')))];
  /** Per-child injection is the canary's pattern: it never reads .env DATABASE_URL at all. */
  const injectsPerChild = /LOCAL_DATABASE_URL/.test(code) && /DATABASE_URL/.test(code);
  entryPoints.push({
    launcher: `scripts/${f}`,
    writers,
    envFiles,
    dbUrlSource: injectsPerChild ? 'LOCAL_DATABASE_URL injected per child process' : 'DATABASE_URL from env file',
    wouldReach: injectsPerChild ? 'LOCAL' : (activeUrl?.points ?? 'UNKNOWN'),
  });
}

const high = findings.filter((f) => f.severity === 'HIGH');
const medium = findings.filter((f) => f.severity === 'MEDIUM');

/**
 * The cutover assertion is separate from the code findings on purpose: today it
 * SHOULD be Railway, and only `--cutover` turns that into a failure.
 */
const cutoverBlocked =
  CUTOVER_MODE && activeUrl?.points !== 'LOOPBACK'
    ? `DATABASE_URL still points at ${activeUrl?.points ?? 'nothing'} (${activeUrl?.host ?? 'unset'})`
    : null;

const out = {
  tool: 'scripts/migration/new2-railway-static-audit.mjs',
  takenAt: new Date().toISOString(),
  mode: CUTOVER_MODE ? 'cutover-gate' : 'code-audit',
  purpose:
    'Static audit of every path that could still reach Railway. Opens no socket and imports no database driver.',
  filesScanned: files.length,
  selfExcluded: SELF,
  env: {
    urlVars: envVars,
    activeDatabaseUrl: activeUrl,
    note: 'DATABASE_URL pointing at Railway is CORRECT until LOCAL_DATABASE_CUTOVER_APPROVED — LCC parked the rollback there deliberately. Only --cutover treats it as a failure.',
  },
  connectionSources,
  entryPoints,
  totals: {
    HIGH: high.length,
    MEDIUM: medium.length,
    INFO: findings.filter((f) => f.severity === 'INFO').length,
  },
  cutoverBlocked,
  findings,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

console.log(`NEW2 RAILWAY STATIC AUDIT — ${out.takenAt}  [${out.mode}]`);
console.log(`  files scanned ${files.length} · HIGH ${high.length} · MEDIUM ${medium.length} · INFO ${out.totals.INFO}`);
console.log(`  self-excluded (a detector contains every pattern it detects): ${SELF}`);
console.log('\n  .env URL variables (credentials never read into output):');
for (const v of envVars) console.log(`    ${v.points.padEnd(9)} ${v.name.padEnd(22)} ${v.host}`);

console.log('\n  connection-source variables, discovered from the code (not a fixed list):');
for (const c of connectionSources) {
  console.log(
    `    ${c.name.padEnd(28)} .env=${c.inEnvFile.padEnd(9)} process=${c.inProcessEnv.padEnd(7)} via=${c.discoveredVia.join('+').padEnd(26)}${c.note ? `  ${c.note}` : ''}`,
  );
}

console.log('\n  entry points that launch a database writer:');
for (const e of entryPoints) {
  console.log(`    ${e.wouldReach.padEnd(8)} ${e.launcher.padEnd(38)} ${e.dbUrlSource}`);
}

if (high.length > 0) {
  console.log('\n  HIGH — a live path to Railway that survives an .env change:');
  for (const f of high) console.log(`    ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
}
if (medium.length > 0) {
  console.log('\n  MEDIUM:');
  for (const f of medium) console.log(`    ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
}

console.log('');
if (high.length > 0) {
  console.log(`FAIL — ${high.length} HIGH finding(s). A second path to Railway exists in code.`);
  process.exit(1);
}
if (cutoverBlocked) {
  console.log(`FAIL — ${cutoverBlocked}`);
  console.log('The fleet must not scale past the canaries until DATABASE_URL is the local database.');
  process.exit(1);
}
console.log(
  CUTOVER_MODE
    ? 'PASS — no code path to Railway, and DATABASE_URL is the local database.'
    : 'PASS — no hardcoded connection survives an .env change; DATABASE_URL is the single fleet-wide switch.',
);
/**
 * Printed on every PASS, because the headline is true and incomplete at the same
 * time and the incomplete half is the one that bites. Flipping `.env` moves the
 * whole ingest fleet and moves NEITHER of these.
 */
const external = connectionSources.filter((c) => c.inEnvFile === 'ABSENT');
if (external.length > 0) {
  console.log(
    `  BUT ${external.length} connection source(s) are supplied from outside .env and are NOT covered by that switch:`,
  );
  for (const c of external) console.log(`    ${c.name}`);
  console.log('    ADMIN_DATABASE_URL is the sharp one: ci-local.mjs CREATES AND DROPS a scratch');
  console.log('    database on whatever server it names, so a routine CI run after cutover would');
  console.log('    be a live write to the system we just left.');
}
console.log(`written: ${OUT}`);
process.exit(0);
