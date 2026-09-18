/**
 * `node --test scripts/check-alert-surface-truth.test.mjs`
 *
 * A guard that has only ever been seen to PASS has not been shown to check
 * anything — and this one has a specific reason to be suspicious of itself. Its
 * first draft read the screen's DOC COMMENT as copy and convicted the fixed
 * screen of all four defects the comment describes. So the cases below break one
 * thing each in a throwaway tree, and two of them prove the guard does NOT fire
 * on a comment about a defect.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const GUARD = 'scripts/check-alert-surface-truth.mjs';
const SCREEN = 'apps/mobile/src/screens/alerts/AlertSettingsScreen.tsx';
const REGISTRY = 'docs/product/V1_CAPABILITY_REGISTRY_R18.json';

const INPUTS = [
  GUARD,
  SCREEN,
  REGISTRY,
  'docs/CURRENT_STATE.md',
  'packages/db/src/schema.ts',
  'services/api/src/citations/fanout.ts',
  'apps/mobile/src/screens/today/TodayScreen.tsx',
];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'alert-truth-'));
  for (const p of INPUTS) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(REPO, p), join(dir, p));
  }
  return dir;
}
const run = (dir) => spawnSync(process.execPath, [join(dir, GUARD)], { encoding: 'utf8' });
const readIn = (dir, p) => readFileSync(join(dir, p), 'utf8');
const writeIn = (dir, p, t) => writeFileSync(join(dir, p), t);

test('the real repository passes', () => {
  const r = spawnSync(process.execPath, [join(REPO, GUARD)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a faithful copy of the inputs passes', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(run(dir).status, 0, run(dir).stdout);
});

test('fails when the screen names the evening briefing while the briefing is disabled', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeIn(
    dir,
    SCREEN,
    readIn(dir, SCREEN).replace(
      'we tell you inside the app',
      'everything arrives in the evening briefing',
    ),
  );
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /promises the evening briefing/);
});

test('fails when the screen says "Four things"', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeIn(dir, SCREEN, readIn(dir, SCREEN).replace('When an authority you', 'Four things. When an authority you'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /says "Four things"/);
});

test('fails when a disabled trigger goes back to being a switch', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeIn(
    dir,
    SCREEN,
    readIn(dir, SCREEN).replace(
      '<Text variant="eyebrow" style={styles.notBuiltTag}>',
      '<Switch disabled value onValueChange={undefined} />\n              <Text variant="eyebrow" style={styles.notBuiltTag}>',
    ),
  );
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /renders a disabled <Switch>/);
});

test('fails when the mandatory-alert promise comes back', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeIn(dir, SCREEN, readIn(dir, SCREEN).replace('or copied out of the app.', 'Cannot be turned off.'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /cannot be turned off/i);
});

test('fails when the screen asks for push while push delivery is not ENABLED', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeIn(
    dir,
    SCREEN,
    readIn(dir, SCREEN).replace('    if (r.ok) setSettings(r.data.settings);', '    void registerForPushNotifications();\n    if (r.ok) setSettings(r.data.settings);'),
  );
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /registerForPushNotifications\(\) while alerts\.push_delivery/);
});

test('fails when the registry has no alerts.* row for a reachable surface', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reg = JSON.parse(readIn(dir, REGISTRY));
  reg.capabilities = reg.capabilities.filter((c) => !c.id.startsWith('alerts.'));
  writeIn(dir, REGISTRY, JSON.stringify(reg, null, 2));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no alerts\.\* row/);
});

test('fails when an alert row is ENABLED without a producer', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reg = JSON.parse(readIn(dir, REGISTRY));
  const row = reg.capabilities.find((c) => c.id === 'alerts.saved_authority_moved');
  row.state = 'ENABLED_V1';
  row.platforms.ios = 'ENABLED_V1';
  row.alertKind = 'own_matter_judgment'; // no enum value, no writer
  writeIn(dir, REGISTRY, JSON.stringify(reg, null, 2));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /is not a value of the alert_kind enum/);
  assert.match(r.stdout, /nothing in .* writes 'own_matter_judgment'/);
});

test('fails when an alert row is ENABLED without named evidence', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reg = JSON.parse(readIn(dir, REGISTRY));
  const row = reg.capabilities.find((c) => c.id === 'alerts.saved_authority_moved');
  row.state = 'ENABLED_V1';
  row.platforms.android = 'ENABLED_V1';
  row.evidenceArtifact = '';
  writeIn(dir, REGISTRY, JSON.stringify(reg, null, 2));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ENABLED without a named evidence artifact/);
});

/* ── and the two that must NOT fire ─────────────────────────────────────── */

test('does NOT fail on a comment that quotes the removed copy', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeIn(
    dir,
    SCREEN,
    readIn(dir, SCREEN).replace(
      'export function AlertSettingsScreen',
      '/* Once said "Four things", named the evening briefing, and "Cannot be turned off".\n   It also called registerForPushNotifications(). All four removed. */\n// One more line comment naming the evening briefing.\nexport function AlertSettingsScreen',
    ),
  );
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout);
});

test('does NOT fail when a DISABLED row names an alertKind the enum does not hold', (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reg = JSON.parse(readIn(dir, REGISTRY));
  reg.capabilities.push({
    id: 'alerts.own_matter_judgment',
    alertKind: 'own_matter_judgment',
    state: 'DISABLED_NOT_READY',
    platforms: {
      ios: 'DISABLED_NOT_READY',
      android: 'DISABLED_NOT_READY',
      web: 'OUT_OF_SCOPE_CURRENT_FOUNDER',
    },
    evidenceArtifact: 'no producer; PD-5 trigger 3 awaits documents.upload_and_ocr',
    evidenceState: 'CODE_PATH_ONLY_NO_DELIVERY_OBSERVED',
    currentContractVersion: 'R17',
  });
  writeIn(dir, REGISTRY, JSON.stringify(reg, null, 2));
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout);
});
