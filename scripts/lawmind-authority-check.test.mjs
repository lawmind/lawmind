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
