/**
 * `node --test scripts/lawmind-authority-check.test.mjs`
 *
 * A lint that has only ever been seen to PASS has not been shown to check
 * anything. These cases copy the active files into a throwaway tree, break one
 * thing each, and require the check to notice — and require it NOT to notice
 * stale words sitting in history, which it must never be tempted to rewrite.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CHECK = join(HERE, 'lawmind-authority-check.mjs');

const INPUTS = [
  'AGENTS.md', 'CLAUDE.md', 'BUILD_GUIDE.md', 'PRODUCT_BRIEF.md',
  '.ai/09-project.md', '.claude/commands/reanchor.md',
  '.claude/hooks/reanchor.sh', '.claude/hooks/session-start.sh', '.claude/hooks/lane-bus.sh', '.claude/hooks/lane-common.sh',
  'scripts/lane-send.mjs', 'scripts/lane-status.mjs', 'scripts/lane-inbox.mjs', 'scripts/resource-lease.mjs', 'scripts/lane-lease.mjs',
  'docs/CURRENT_STATE.md', 'docs/CURRENT_PLAN.md', 'docs/LANE_BUS.md', 'docs/LANE_PROTOCOL.md', 'docs/API_CONTRACTS.md',
  'docs/FOUNDER_QUEUE.md', 'docs/EXTERNAL_ACCOUNT_DELETION_WEB.md',
  'docs/product/CONTRACT_CHANGE_CONTROL.md', 'docs/product/WEBSITE_PRODUCT_SPEC_V1.md',
  'docs/product/WEBSITE_CLAIM_EVIDENCE_MATRIX.md', 'docs/product/STORE_RELEASE_CHECKLIST_V1.md',
  'docs/product/V1_CAPABILITY_REGISTRY_R16.json', 'docs/product/V1_CAPABILITY_REGISTRY_R17.json',
  'docs/roadmaps',
  // Added 18 Sep 2026 with the deployment-truth checks: the probes and the two
  // pipelines that call them.
  'services/harness/src/deployed-safety-cli.ts',
  'services/harness/src/deployed-judgment-safety-cli.ts',
  'scripts/ci-local.mjs', '.github/workflows/ci.yml',
];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'authority-'));
  for (const p of INPUTS) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(REPO, p), join(dir, p), { recursive: true });
  }
  return dir;
}
const run = (root) => spawnSync(process.execPath, [CHECK, '--root', root], { encoding: 'utf8' });

test('the real repository passes', () => {
  const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a faithful copy of the active files passes', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout);
});

test('fails when a bootstrap file says an old roadmap governs', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, 'AGENTS.md'), '\nMaster Roadmap v7.1 governs.\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no stale authority: AGENTS\.md/);
});

test('fails when the hook tells a session to bind a legacy lane', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, '.claude/hooks/lane-bus.sh');
  writeFileSync(p, readFileSync(p, 'utf8') + '\n#  echo LCC  > .agents/bus/.lane-x\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /bind a legacy lane/);
});

test('fails when the lane runtime goes back to legacy lanes', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'scripts/lane-send.mjs');
  writeFileSync(p, readFileSync(p, 'utf8').replace("const LANES = ['SHIP', 'DATA', 'RED'];", "const LANES = ['LCC', 'RCC'];"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /lane-send\.mjs LANES/);
});

test('fails when an authority file drifts from its manifest hash', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, 'docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md'), '\nunrecorded edit\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /manifest bytes\+sha256: docs\/roadmaps\/LAWMIND_SPRINT_PROMPTS_V5\.md/);
});

test('fails when the CURRENT_PLAN historical banner is removed', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'docs/CURRENT_PLAN.md');
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('NOT THE CURRENT TASK QUEUE', 'the single ordered queue'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /current banner present: docs\/CURRENT_PLAN\.md/);
});

test('does NOT fail on stale words in history', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'docs/ai/lcc-r99'), { recursive: true });
  writeFileSync(join(dir, 'docs/ai/lcc-r99/ROUND.md'), 'Master Roadmap v7.1 governs. TWO lanes only: LCC=server, RCC=client.\n');
  // History below the CURRENT_PLAN banner may say anything it said at the time.
  appendFileSync(join(dir, 'docs/CURRENT_PLAN.md'), '\n> **Master Roadmap v7.2 governs** (as of 1 Sep).\n');
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout);
});

/* ---------------------------------------------------------------------------
 * Deployment-provider and deployed-target drift (SHIP S4-T0.2, 18 Sep 2026)
 *
 * The first version of this lint passed 61/61 while three bootstrap files said
 * the API ran on a retired Railway production and both deployed probes defaulted
 * to its origin. Every case below breaks exactly one of those, and the last two
 * prove the rules still leave Railway HISTORY alone.
 * ------------------------------------------------------------------------- */

test('fails when a bootstrap file names Railway as the current API host', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, 'AGENTS.md'), '\nStack: Expo, Hono API on Railway, Drizzle.\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /names Railway as the current API host/);
});

test('fails when a bootstrap file names Railway Postgres or Railway cron', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, 'CLAUDE.md'), '\nRailway Postgres + pgvector. Railway cron.\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /current database host|current scheduler host/);
});

test('fails when CURRENT_STATE claims a live deployment on a retired provider', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'docs/CURRENT_STATE.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('PRODUCTION               = NONE', 'PRODUCTION               = railway-api-production'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no live deployment is claimed on a retired provider|retired or destroyed provider/);
});

test('fails when CURRENT_STATE stops naming the deployment state at all', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'docs/CURRENT_STATE.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('CURRENT_HOSTING_PROVIDER = NOT_YET_SELECTED', ''));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /states CURRENT_HOSTING_PROVIDER/);
});

test('fails when CURRENT_STATE stops separating the two R17 revision domains', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'docs/CURRENT_STATE.md');
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('API_CONTRACT_REVISION', 'CONTRACT_REV'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /separates the two R17 revision domains/);
});

test('fails when a deployed probe reintroduces a default target', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'services/harness/src/deployed-safety-cli.ts');
  writeFileSync(p, readFileSync(p, 'utf8') + "\nconst DEFAULT_BASE_URL = 'https://example.invalid';\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no default deployment target/);
});

test('fails when a deployed probe falls back from PROBE_BASE_URL', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'scripts/ci-local.mjs');
  writeFileSync(p, readFileSync(p, 'utf8') + "\nconst b = process.env['PROBE_BASE_URL'] ?? 'https://example.invalid';\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no default deployment target/);
});

test('fails when the retired production origin returns to active probe code', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'services/harness/src/deployed-judgment-safety-cli.ts');
  writeFileSync(p, readFileSync(p, 'utf8') + "\nconst target = 'https://api-production-1c0b4.up.railway.app';\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no retired production origin in active code/);
});

test('does NOT fail when a probe names the retired origin in a comment', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'services/harness/src/deployed-safety-cli.ts');
  writeFileSync(p, readFileSync(p, 'utf8') + "\n// it used to default to api-production-1c0b4.up.railway.app, which is retired\n");
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout);
});

test('does NOT fail on Railway deployment history', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'docs/ai/lcc-r98'), { recursive: true });
  writeFileSync(
    join(dir, 'docs/ai/lcc-r98/ROUND.md'),
    'Hono API on Railway. Railway Postgres + pgvector. Railway cron fires at 04:00 IST.\n',
  );
  writeFileSync(join(dir, 'DEPLOYMENT.md'), 'Railway Postgres. Railway cron. Hono API on Railway.\n');
  // And a current file may say it in the past tense.
  appendFileSync(join(dir, 'docs/CURRENT_STATE.md'), '\nRAILWAY_PRODUCTION = HISTORICAL / RETIRED\n');
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout);
});
