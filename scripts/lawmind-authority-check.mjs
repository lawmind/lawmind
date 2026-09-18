#!/usr/bin/env node
/**
 * `pnpm authority:check` — does the repo still point at the CURRENT authority?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * By 18 Sep 2026 the files every fresh agent reads first (CLAUDE.md, AGENTS.md,
 * the session hooks) were injecting a roadmap three versions old and a two-lane
 * topology that no longer existed. Nothing failed: prose drifts silently. SHIP
 * S4-T0.1 repaired it by hand. This check makes the next drift loud.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It never scans history. Old roadmaps, dated round reports (docs/ai/**), gate
 * receipts, bus messages and the CURRENT_PLAN journal legitimately say "v7.1
 * governs" or "LCC" — that is what was true THEN, and rewriting it is the one
 * thing this repo forbids. So the check reads an explicit list of ACTIVE files,
 * and for files that keep history under a current banner it reads only the
 * banner region (everything before the first `---` rule).
 *
 * READ-ONLY. Exit 0 = PASS, 1 = FAIL. `--root <dir>` checks another tree (tests).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const ROOT = rootArg === -1 ? join(dirname(fileURLToPath(import.meta.url)), '..') : resolve(argv[rootArg + 1]);

const ROADMAPS = 'docs/roadmaps';
const CANONICAL = {
  roadmap: `${ROADMAPS}/LAWMIND_MASTER_ROADMAP_V7_4.md`,
  prompts: `${ROADMAPS}/LAWMIND_SPRINT_PROMPTS_V5.md`,
  memo: `${ROADMAPS}/LAWMIND_V7_4_RECONCILIATION_MEMO.md`,
  manifest: `${ROADMAPS}/LAWMIND_V7_4_AUTHORITY_MANIFEST.json`,
  ledger: `${ROADMAPS}/LAWMIND_CURRENT_STATE_LEDGER_2026-09-18.md`,
  currentState: 'docs/CURRENT_STATE.md',
};
const ACTIVE_LANES = ['SHIP', 'DATA', 'RED'];
const LEGACY_LANES = ['LCC', 'RCC', 'NEW1', 'NEW2', 'NEW3', 'FIFTH'];

/** Files that are current in their ENTIRETY. Any stale claim anywhere fails. */
const FULLY_ACTIVE = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/hooks/reanchor.sh',
  '.claude/hooks/session-start.sh',
  '.claude/hooks/lane-bus.sh',
  '.claude/hooks/lane-common.sh',
  '.claude/commands/reanchor.md',
  '.ai/09-project.md',
  CANONICAL.currentState,
];

/**
 * Files that keep history below a current banner. Only the banner region is
 * checked, and the banner must be present — a banner that silently vanished is
 * how the history would start reading as current again.
 */
const BANNERED = {
  'docs/CURRENT_PLAN.md': 'NOT THE CURRENT TASK QUEUE',
  'BUILD_GUIDE.md': 'HISTORICAL BUILD PLAN',
  'PRODUCT_BRIEF.md': 'CURRENT_V1_SCOPE IS NARROWER',
  'docs/LANE_BUS.md': 'ACTIVE_LANES = SHIP DATA RED',
  'docs/LANE_PROTOCOL.md': 'CURRENT TOPOLOGY',
  'docs/product/CONTRACT_CHANGE_CONTROL.md': 'owner **SHIP**',
  'docs/product/WEBSITE_PRODUCT_SPEC_V1.md': 'HISTORICAL PROMOTIONAL-SITE SPEC',
  'docs/product/WEBSITE_CLAIM_EVIDENCE_MATRIX.md': 'HISTORICAL PROMOTIONAL-SITE SPEC',
  'docs/product/STORE_RELEASE_CHECKLIST_V1.md': 'CURRENT RELEASE STATE',
  'docs/EXTERNAL_ACCOUNT_DELETION_WEB.md': 'EXTERNAL_DELETE_AUTH_V1',
  'docs/API_CONTRACTS.md': 'SHIP owns both sides',
  'docs/FOUNDER_QUEUE.md': 'CURRENT STATUS — S4-T0.1',
};

/** Current-tense claims that are stale anywhere in an active region. */
const STALE = [
  [/\bv7\.[0-3]\b[^\n]{0,40}\bgovern/i, 'claims a pre-v7.4 roadmap governs'],
  [/\bgovern(s|ing)\b[^\n]{0,40}\bv7\.[0-3]\b/i, 'claims a pre-v7.4 roadmap governs'],
  [/latest governing roadmap/i, 'names a latest governing roadmap other than v7.4'],
  [/LAWMIND_MASTER_ROADMAP_V7_[0-3]\.md[^\n]{0,30}\b(current|governs|authority)\b/i, 'points current authority at an old roadmap'],
  [/LAWMIND_SPRINT_PROMPTS_V[234]\.md[^\n]{0,30}\b(current|active|governs)\b/i, 'points current prompts at an old pack'],
  [/TWO lanes only|TWO LANES:|## Lanes — two/, 'asserts the two-lane topology'],
  [/\bLCC=server\b|\bRCC=client\b/, 'asserts LCC/RCC as current lanes'],
  [/echo (LCC|RCC|NEW[123]|FIFTH) +> *\.agents\/bus\/\.lane-/, 'tells a session to bind a legacy lane'],
  [/THE PLAN LIVES IN docs\/CURRENT_PLAN\.md/, 'makes CURRENT_PLAN.md the current queue'],
  [/CURRENT_PLAN\.md`?\*?\*? *→ *\*?\*?the single ordered queue/i, 'makes CURRENT_PLAN.md the current queue'],
  [/Five lanes exist/i, 'asserts the five-lane ring is current'],
  [/IN_SCOPE_V1_NOT_BUILT/, 'places advocate web in v1'],
  [/Desktop = research workstation/, 'places a desktop surface in scope'],
  // -- hosting-provider drift, added 18 Sep 2026 (SHIP S4-T0.2) -------------
  //
  // The first version of this lint caught a stale ROADMAP and a stale LANE
  // TOPOLOGY and missed a stale DEPLOYMENT: CLAUDE.md, AGENTS.md and
  // PRODUCT_BRIEF.md all still said the API and Postgres ran on Railway months
  // after that production service was retired, and SHIP S4-R0 is supposed to
  // compare hosting providers without the bootstrap having already answered.
  //
  // These fire only in ACTIVE regions, like every other rule here. Railway
  // history -- DEPLOYMENT.md, the migration records, docs/ai/** rounds, the
  // bus -- is untouched and must stay that way. A current file may still SAY
  // Railway, as long as it says it in the past tense: `RAILWAY_PRODUCTION =
  // HISTORICAL / RETIRED` is the sentence these rules are written to allow.
  [/\bHono(\s+API)?\s+on\s+Railway\b/i, 'names Railway as the current API host'],
  [/\bRailway\s+Postgres\b/i, 'names Railway as the current database host'],
  [/\bRailway\s+cron\b/i, 'names Railway as the current scheduler host'],
  [/current production[^\n]{0,30}\bRailway\b/i, 'claims a current Railway production'],
  [/\bRailway\b[^\n]{0,30}current production/i, 'claims a current Railway production'],
  [/\b(PRODUCTION|PERSISTENT_BETA)\s*=\s*(?!NONE)\S*(railway|digitalocean)/i,
    'names a live deployment on a retired or destroyed provider'],
];

/**
 * Deployed probes, and the pipelines that call them. A probe that DEFAULTS to a
 * target measures whichever host its constant names, not the deployment -- and
 * until 18 Sep 2026 both probe CLIs defaulted to a retired Railway production
 * origin, so an unconfigured run produced a confident verdict about a dead host.
 * With `PRODUCTION = NONE` there is no correct default at all.
 *
 * The rule is about ACTIVE DEFAULTS, not mentions: `probe-target.ts` names the
 * retired origin on purpose, in a denylist, and every file here may describe the
 * defect in a comment. So comments are stripped before the search and only
 * executable code is scanned.
 */
const PROBE_ENTRY_POINTS = [
  'services/harness/src/deployed-safety-cli.ts',
  'services/harness/src/deployed-judgment-safety-cli.ts',
  'scripts/ci-local.mjs',
];
const RETIRED_ORIGINS = ['api-production-1c0b4.up.railway.app'];

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const rel = (p) => join(ROOT, p);
const read = (p) => readFileSync(rel(p), 'utf8');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/* 1-4 · canonical authority files exist, with no second authoritative copy -- */
for (const [role, p] of Object.entries(CANONICAL)) check(`exists: ${role} (${p})`, existsSync(rel(p)));
const dupes = existsSync(rel('docs'))
  ? readdirSync(rel('docs')).filter((f) => /^LAWMIND_(MASTER_ROADMAP_V7_4|SPRINT_PROMPTS_V5|V7_4_|CURRENT_STATE_LEDGER)/.test(f))
  : [];
check('no duplicate authority copy outside docs/roadmaps/', dupes.length === 0, dupes.join(', '));

/* 9 · manifest entries match the committed canonical bytes ------------------ */
if (existsSync(rel(CANONICAL.manifest))) {
  let m = null;
  try {
    m = JSON.parse(read(CANONICAL.manifest));
  } catch (e) {
    check('manifest parses as JSON', false, String(e));
  }
  if (m) {
    const entries = Object.entries(m.files ?? {});
    check('manifest lists the roadmap, prompts, memo and dated ledger',
      [CANONICAL.roadmap, CANONICAL.prompts, CANONICAL.memo, CANONICAL.ledger].every((p) => m.files?.[p]));
    for (const [p, want] of entries) {
      if (!p.startsWith(`${ROADMAPS}/`)) {
        check(`manifest path is canonical: ${p}`, false, `must live under ${ROADMAPS}/`);
        continue;
      }
      if (!existsSync(rel(p))) {
        check(`manifest entry exists: ${p}`, false);
        continue;
      }
      const buf = readFileSync(rel(p));
      check(`manifest bytes+sha256: ${p}`, buf.length === want.bytes && sha256(buf) === want.sha256,
        `have ${buf.length} ${sha256(buf).slice(0, 12)}…, manifest ${want.bytes} ${String(want.sha256).slice(0, 12)}…`);
    }
  }
}

/* 5-6 · active bootstrap claims nothing stale ------------------------------ */
/**
 * The banner region: from the top to the first `---` rule AFTER the marker when
 * the marker sits in the first 200 lines (FOUNDER_QUEUE keeps a short intro
 * above its status block), otherwise to the first `---` rule.
 */
const bannerRegion = (text, marker) => {
  const at = text.indexOf(marker);
  const nearTop = at !== -1 && text.slice(0, at).split('\n').length <= 200;
  const from = nearTop ? at : 0;
  const rule = /^---\s*$/m;
  const rest = text.slice(from);
  const i = rest.search(rule);
  if (i === -1) return text.split('\n').slice(0, 60).join('\n');
  return text.slice(0, from + i);
};
const scan = (label, text) => {
  const hits = [];
  for (const [re, why] of STALE) {
    const m = re.exec(text);
    if (m) hits.push(`${why}: "${m[0].slice(0, 60)}"`);
  }
  check(`no stale authority: ${label}`, hits.length === 0, hits.join(' | '));
};
for (const p of FULLY_ACTIVE) {
  if (!existsSync(rel(p))) {
    check(`exists: ${p}`, false);
    continue;
  }
  scan(p, read(p));
}
for (const [p, marker] of Object.entries(BANNERED)) {
  if (!existsSync(rel(p))) {
    check(`exists: ${p}`, false);
    continue;
  }
  const head = bannerRegion(read(p), marker);
  check(`current banner present: ${p}`, head.includes(marker), `missing "${marker}" before the first --- rule`);
  scan(`${p} (banner region)`, head);
}
for (const p of ['CLAUDE.md', 'AGENTS.md', '.claude/hooks/session-start.sh']) {
  if (existsSync(rel(p))) check(`read order starts from CURRENT_STATE.md: ${p}`, read(p).includes('docs/CURRENT_STATE.md'));
}

/* 7 · lane runtime accepts SHIP/DATA/RED and nothing legacy ----------------- */
const arrayOf = (p, name) => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(read(p));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};
const sameSet = (a, b) => a && a.length === b.length && b.every((x) => a.includes(x));
if (existsSync(rel('.claude/hooks/lane-common.sh'))) {
  const m = /^LANE_NAMES='([^']*)'/m.exec(read('.claude/hooks/lane-common.sh'));
  check('lane-common.sh LANE_NAMES = SHIP DATA RED', m && sameSet(m[1].split(/\s+/), ACTIVE_LANES), m?.[1] ?? 'not found');
}
for (const p of ['scripts/lane-send.mjs', 'scripts/lane-status.mjs', 'scripts/resource-lease.mjs', 'scripts/lane-lease.mjs']) {
  if (!existsSync(rel(p))) continue;
  const lanes = arrayOf(p, 'LANES');
  check(`${p} LANES = SHIP DATA RED`, sameSet(lanes, ACTIVE_LANES), JSON.stringify(lanes));
}
if (existsSync(rel('scripts/lane-inbox.mjs'))) {
  const a = arrayOf('scripts/lane-inbox.mjs', 'ACTIVE_LANES');
  const l = arrayOf('scripts/lane-inbox.mjs', 'LEGACY_LANES');
  check('lane-inbox.mjs reads active AND legacy cursors', sameSet(a, ACTIVE_LANES) && LEGACY_LANES.every((x) => l?.includes(x)));
}

/* 8 · current state names an existing current registry ---------------------- */
if (existsSync(rel(CANONICAL.currentState))) {
  const cs = read(CANONICAL.currentState);
  const reg = /CURRENT_CAPABILITY_REGISTRY\s*=\s*(\S+)/.exec(cs)?.[1];
  check('CURRENT_STATE.md names CURRENT_CAPABILITY_REGISTRY', Boolean(reg));
  check('CURRENT_STATE.md points at the canonical roadmap and prompts',
    cs.includes('roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md') && cs.includes('roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md'));
  if (reg) {
    check(`current registry exists: ${reg}`, existsSync(rel(reg)));
    if (existsSync(rel(reg))) {
      let r = null;
      try {
        r = JSON.parse(read(reg));
      } catch (e) {
        check('current registry parses', false, String(e));
      }
      if (r) {
        const webState = r.platformStatus?.web?.state;
        check('current registry: advocate web is not in v1 scope', webState && webState !== 'IN_SCOPE_V1_NOT_BUILT', webState);
        const bad = (r.capabilities ?? []).filter((c) => c.platforms?.web === 'DISABLED_NOT_READY' || /^ENABLED/.test(c.platforms?.web ?? ''));
        check('current registry: no web row reads DISABLED_NOT_READY or ENABLED', bad.length === 0, bad.map((c) => c.id).join(', '));
        if (r.supersedesFile && existsSync(rel(r.supersedesFile))) {
          /**
           * INHERITANCE, AND THE ONE THING A ROW MAY DO INSTEAD OF INHERITING.
           *
           * Until R18 this compared index for index and was guarded by
           * `webRowsChangedR17 !== undefined`, so the first registry that ADDED
           * a row would have skipped the check entirely rather than failed it —
           * a guard that switches itself off on the change it should scrutinise.
           *
           * Now: every row the superseded snapshot HAD must be inherited
           * unchanged on its id, both mobile platform cells, its state and its
           * evidence pair. Every row that is NEW must be genuinely new, i.e. its
           * id must not appear in the previous snapshot under a different shape.
           * A new row therefore cannot be used to smuggle a state change past
           * the drift test by appending a second copy of an existing id.
           */
          const prev = JSON.parse(read(r.supersedesFile));
          const prevById = new Map((prev.capabilities ?? []).map((c) => [c.id, c]));
          const drift = (r.capabilities ?? []).filter((c) => {
            const q = prevById.get(c.id);
            if (!q) return false;
            return q.platforms.ios !== c.platforms.ios || q.platforms.android !== c.platforms.android
              || q.state !== c.state || q.evidenceArtifact !== c.evidenceArtifact || q.evidenceState !== c.evidenceState;
          });
          check('current registry: iOS/Android rows inherited unchanged from the superseded snapshot', drift.length === 0,
            drift.map((c) => c.id).join(', '));
          const ids = (r.capabilities ?? []).map((c) => c.id);
          check('current registry: no duplicate capability id', new Set(ids).size === ids.length);
          const removed = [...prevById.keys()].filter((id) => !ids.includes(id));
          check('current registry: no row silently dropped from the superseded snapshot', removed.length === 0,
            removed.join(', '));
        }
      }
    }
  }
}

/* 10 · historical evidence is intact: no tracked bus message missing --------- */
const busDir = rel('.agents/bus');
if (existsSync(busDir) && existsSync(rel('.git'))) {
  // Only meaningful in a real checkout; a --root fixture has no git index.
  const { execFileSync } = await import('node:child_process');
  try {
    const tracked = execFileSync('git', ['ls-files', '.agents/bus'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter((f) => /\/\d{4}--[^/]+\.md$/.test(f));
    const missing = tracked.filter((f) => !existsSync(rel(f)));
    check(`historical bus messages all present (${tracked.length} tracked)`, missing.length === 0, missing.slice(0, 5).join(', '));
  } catch (e) {
    check('historical bus messages all present', false, `git ls-files failed: ${e.message}`);
  }
}

/* 10b - the registry's contract metadata must agree with the contract ledger --
 *
 * R17 shipped carrying contractRevision "R16" and currentContractVersion "R16" on
 * all 30 rows while the ledger said R17, and nothing noticed for the whole life of
 * that snapshot. The ledger owns contract identity; the registry quotes it. A quote
 * that drifts from its source is exactly the class of defect this lint exists for.
 */
const LEDGER = 'docs/product/CONTRACT_CHANGE_LEDGER.json';
if (existsSync(rel(LEDGER)) && existsSync(rel(CANONICAL.currentState))) {
  const csText = read(CANONICAL.currentState);
  const regPath = /CAPABILITY_REGISTRY_FILE\s*=\s*(\S+)/.exec(csText)?.[1];
  let ledger = null;
  try {
    ledger = JSON.parse(read(LEDGER));
  } catch (e) {
    check('contract ledger parses as JSON', false, String(e));
  }
  if (ledger && regPath && existsSync(rel(regPath))) {
    const reg = JSON.parse(read(regPath));
    check('registry contractRevision matches the ledger currentVersion',
      reg.contractRevision === ledger.currentVersion, `registry ${reg.contractRevision} vs ledger ${ledger.currentVersion}`);
    check('registry contractArtifact matches the ledger currentVersionArtifact',
      reg.contractArtifact === ledger.currentVersionArtifact,
      `registry ${reg.contractArtifact} vs ledger ${ledger.currentVersionArtifact}`);
    const stale = (reg.capabilities ?? []).filter((c) => c.currentContractVersion !== ledger.currentVersion);
    check('every capability row names the CURRENT contract revision', stale.length === 0,
      `${stale.length} row(s) not at ${ledger.currentVersion}: ${stale.slice(0, 4).map((c) => c.id).join(', ')}`);
    check('ledger capabilityRegistryArtifact is the registry CURRENT_STATE names',
      ledger.capabilityRegistryArtifact === regPath, `${ledger.capabilityRegistryArtifact} vs ${regPath}`);
  }
}

/* 11 - deployment truth: no probe invents a target, CURRENT_STATE says so --- */
/** Strips block comments and whole-line/trailing `//` and `#` comments. */
const codeOnly = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|#|\*)/.test(l))
    .map((l) => l.replace(/\s+\/\/.*$/, '').replace(/\s+#.*$/, ''))
    .join('\n');

for (const p of PROBE_ENTRY_POINTS) {
  if (!existsSync(rel(p))) {
    check(`exists: ${p}`, false);
    continue;
  }
  const code = codeOnly(read(p));
  check(
    `no default deployment target: ${p}`,
    !/DEFAULT_BASE_URL/.test(code) && !/PROBE_BASE_URL'\]\s*\?\?/.test(code),
    'a deployed probe may not default or fall back to a target',
  );
  const live = RETIRED_ORIGINS.filter((h) => code.includes(h));
  check(`no retired production origin in active code: ${p}`, live.length === 0, live.join(', '));
}
if (existsSync(rel('.github/workflows/ci.yml'))) {
  const wf = read('.github/workflows/ci.yml');
  check(
    'CI does not hard-code a deployment target',
    RETIRED_ORIGINS.every((h) => !codeOnly(wf).includes(h)) && /PROBE_BASE_URL/.test(wf),
    'the deployed probe must be gated on a configured PROBE_BASE_URL',
  );
}
if (existsSync(rel(CANONICAL.currentState))) {
  const cs = read(CANONICAL.currentState);
  /** The first `KEY = value` line for a key, by line scan rather than a
   *  constructed RegExp: an escape inside a template literal is an identity
   *  escape, so a pattern built that way silently loses its character classes
   *  and every lookup returns null while reading as though it works. */
  const value = (k) =>
    cs
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith(k) && l.slice(k.length).trimStart().startsWith('='))
      .map((l) => l.slice(l.indexOf('=') + 1).trim().split(' ')[0])[0];
  for (const k of ['PRODUCTION', 'PERSISTENT_BETA', 'CURRENT_HOSTING_PROVIDER']) {
    check(`CURRENT_STATE.md states ${k}`, Boolean(value(k)), 'the live pointer must name the deployment state');
  }
  const prod = value('PRODUCTION');
  const beta = value('PERSISTENT_BETA');
  check(
    'CURRENT_STATE.md: no live deployment is claimed on a retired provider',
    ![prod, beta].some((v) => v && /railway|digitalocean/i.test(v)),
    `${prod} / ${beta}`,
  );
  check(
    'CURRENT_STATE.md separates the two R17 revision domains',
    /CAPABILITY_REGISTRY_REVISION/.test(cs) &&
      /API_CONTRACT_REVISION/.test(cs) &&
      /independent revision domains/i.test(cs),
    'a bare "R17" cannot say which domain it means',
  );
}

/* report ------------------------------------------------------------------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (!r.ok || argv.includes('--verbose')) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok || !r.detail ? '' : `\n         ${r.detail}`}`);
}
console.log(`\nauthority:check ${failed.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed.length}/${results.length} checks`);
process.exit(failed.length === 0 ? 0 : 1);
