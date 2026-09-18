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
];

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
        if (r.supersedesFile && existsSync(rel(r.supersedesFile)) && r.webRowsChangedR17 !== undefined) {
          const prev = JSON.parse(read(r.supersedesFile));
          const drift = (r.capabilities ?? []).filter((c, i) => {
            const q = prev.capabilities?.[i];
            return !q || q.id !== c.id || q.platforms.ios !== c.platforms.ios || q.platforms.android !== c.platforms.android
              || q.state !== c.state || q.evidenceArtifact !== c.evidenceArtifact || q.evidenceState !== c.evidenceState;
          });
          check('current registry: iOS/Android rows inherited unchanged from the superseded snapshot', drift.length === 0,
            drift.map((c) => c.id).join(', '));
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

/* report ------------------------------------------------------------------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (!r.ok || argv.includes('--verbose')) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok || !r.detail ? '' : `\n         ${r.detail}`}`);
}
console.log(`\nauthority:check ${failed.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed.length}/${results.length} checks`);
process.exit(failed.length === 0 ? 0 : 1);
