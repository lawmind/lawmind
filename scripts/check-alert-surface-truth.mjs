#!/usr/bin/env node
/**
 * DOES THE PRODUCT PROMISE AN ALERT IT CANNOT DELIVER?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS GATE, AND WHY IT IS NOT THE OLD ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `check-pd5-alerts-readiness.mjs` (was `check-alert-coverage.mjs`) asks whether
 * all four PD-5 triggers can fire. Two cannot, because `monitoring.user_product`
 * and `documents.upload_and_ocr` are DISABLED in the capability registry by
 * decision. It failed CI every run, and the only ways to make it pass were to
 * build monitoring and uploads — outside current v1 — or to delete it. Both
 * wrong. It is now a FUTURE readiness gate.
 *
 * The question current v1 has to answer is the other one. On 18 Sep 2026 the
 * reachable Alert Settings screen said "Four things", named the "evening
 * briefing" as the delivery channel while `briefing.daily_loop` was
 * DISABLED_NOT_READY, rendered a mandatory-looking switch for a trigger whose
 * audience needs an exported draft, and asked for push permission for a channel
 * with no project id. Every one of those was a promise, and none was kept. The
 * capability registry had no alert row at all, so nothing measured it.
 *
 * Four rules, each one a defect that was actually shipped:
 *
 *   1  ENABLED NEEDS A PRODUCER. An alert capability may read ENABLED only if
 *      something writes that `alert_kind`.
 *   2  ENABLED NEEDS A USER-VISIBLE PATH. A producer with no surface is an alert
 *      nobody sees.
 *   3  A DISABLED TRIGGER IS NOT A CONTROL. A switch in the "off" position
 *      implies flipping it would work. Unavailable triggers render as
 *      statements.
 *   4  COPY MAY NOT NAME A DISABLED CHANNEL. No "evening briefing" while the
 *      briefing is disabled, no push promise while push delivery is, no
 *      monitoring promise while monitoring is.
 *
 * READ-ONLY. Static: no database, no network, no install. Exit 0 = PASS.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const problems = [];
const fail = (why) => problems.push(why);

/* ── the current capability registry, from the live pointer ─────────────── */
const currentState = read('docs/CURRENT_STATE.md');
const registryPath = /CAPABILITY_REGISTRY_FILE\s*=\s*(\S+)/.exec(currentState)?.[1];
if (!registryPath) fail('docs/CURRENT_STATE.md does not name CAPABILITY_REGISTRY_FILE');
const registry = registryPath ? JSON.parse(read(registryPath)) : { capabilities: [] };
const rowsById = new Map((registry.capabilities ?? []).map((c) => [c.id, c]));
const alertRows = (registry.capabilities ?? []).filter((c) => c.id.startsWith('alerts.'));
const isEnabled = (row) =>
  Object.values(row?.platforms ?? {}).some((v) => /^ENABLED/.test(String(v)));

/**
 * The enum is the set of alert kinds that can exist at all, and the producer is
 * whatever writes one. Both are read from source rather than listed here: a
 * guard that carries its own copy of the enum is a guard that goes stale the
 * way the surface did.
 */
const schema = read('packages/db/src/schema.ts');
const enumBlock = /pgEnum\('alert_kind',\s*\[([^\]]*)\]/.exec(schema)?.[1] ?? '';
const KINDS = [...enumBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (KINDS.length === 0) fail('could not read the alert_kind enum from packages/db/src/schema.ts');

const PRODUCERS = ['services/api/src/citations/fanout.ts'];
const producerText = PRODUCERS.map(read).join('\n');
const hasProducer = (kind) => producerText.includes(`'${kind}'`);

const CLIENT_SURFACES = [
  'apps/mobile/src/screens/today/TodayScreen.tsx',
  'apps/mobile/src/screens/alerts/AlertSettingsScreen.tsx',
];
const clientText = CLIENT_SURFACES.map(read).join('\n');
/**
 * COMMENTS ARE NOT COPY, and this guard learned that on its first run: it
 * convicted the screen of all four copy defects, because the doc comment
 * recording the fix QUOTES the removed words - "Four things", "the evening
 * briefing", "Cannot be turned off" - so the next reader knows what went wrong.
 * A guard that cannot tell a shipped string from a comment about a shipped
 * string forbids writing the comment, which is the opposite of what this
 * repository wants.
 *
 * So the copy rules read code and JSX text only. Block comments (including JSX
 * braces around one) and line comments are removed first - the same treatment
 * the authority lint gives its probe scan.
 */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .map((l) => l.replace(/\s+\/\/.*$/, ''))
    .join('\n');

const alertScreen = stripComments(
  read('apps/mobile/src/screens/alerts/AlertSettingsScreen.tsx'),
);

/* ── rules 1 and 2 · an ENABLED alert row needs a producer AND a surface ── */
for (const row of alertRows.filter(isEnabled)) {
  const kind = row.alertKind;
  if (!kind) {
    fail(`${row.id} is ENABLED but names no alertKind, so no producer can be checked`);
    continue;
  }
  if (!KINDS.includes(kind)) {
    fail(`${row.id} is ENABLED but '${kind}' is not a value of the alert_kind enum`);
  }
  if (!hasProducer(kind)) {
    fail(`${row.id} is ENABLED but nothing in ${PRODUCERS.join(', ')} writes '${kind}'`);
  }
  if (!row.evidenceArtifact || !row.evidenceState) {
    fail(`${row.id} is ENABLED without a named evidence artifact and evidence state`);
  }
  if (!/useAlerts|settings\.unavailable/.test(clientText)) {
    fail(`${row.id} is ENABLED but no client surface consumes alerts`);
  }
}

/* ── rule 3 · an unavailable trigger is never a control ─────────────────── */
if (/<Switch\s+disabled/.test(alertScreen)) {
  fail(
    'AlertSettingsScreen renders a disabled <Switch>. A switch stuck ON reads as ' +
      '"always working"; a trigger with no producer must render as a statement.',
  );
}
if (/Cannot be turned off/i.test(alertScreen)) {
  fail('AlertSettingsScreen still says an alert "cannot be turned off" — a mandatory promise');
}
if (!/settings\.unavailable/.test(alertScreen)) {
  fail('AlertSettingsScreen no longer reads settings.unavailable from the server');
}

/* ── rule 4 · copy may not name a channel that is disabled ──────────────── */
const disabledState = (id) => {
  const row = rowsById.get(id);
  if (!row || isEnabled(row)) return null;
  return row.state;
};
const CHANNELS = [
  { id: 'briefing.daily_loop', re: /evening briefing/i, what: 'the evening briefing' },
  { id: 'monitoring.user_product', re: /we will watch|we monitor your/i, what: 'monitoring' },
];
for (const ch of CHANNELS) {
  const state = disabledState(ch.id);
  if (state && ch.re.test(alertScreen)) {
    fail(`AlertSettingsScreen promises ${ch.what} while ${ch.id} = ${state}`);
  }
}
const pushRow = alertRows.find((r) => r.id === 'alerts.push_delivery');
if (!isEnabled(pushRow) && /registerForPushNotifications\(/.test(alertScreen)) {
  fail(
    'AlertSettingsScreen calls registerForPushNotifications() while alerts.push_delivery is not ' +
      'ENABLED — a permission prompt spent on a channel that cannot deliver',
  );
}
if (/\bFour things\b/.test(alertScreen)) {
  fail(`AlertSettingsScreen says "Four things" while alert_kind holds ${KINDS.length}`);
}

/* ── the registry and the surface must agree that alerts are a capability ── */
if (alertRows.length === 0) {
  fail(
    'the capability registry has no alerts.* row, yet AlertSettingsScreen and the Today alert ' +
      'cards are user-reachable. A reachable surface needs a row, and it may not hide inside ' +
      'monitoring.user_product — they are different capabilities.',
  );
}

/**
 * A DISABLED row is allowed to name a kind the enum does not hold yet - that is
 * what "not built" means, and `alerts.own_matter_judgment` would be exactly that
 * if anyone adds it. The ENABLED case is covered by rule 1 above, which is where
 * the check belongs.
 */

/* ── report ─────────────────────────────────────────────────────────────── */
console.log(
  `alert surface truth · ${registryPath} · ${alertRows.length} alerts.* row(s), ` +
    `${alertRows.filter(isEnabled).length} ENABLED · alert_kind [${KINDS.join(', ')}] · ` +
    `producer writes [${KINDS.filter(hasProducer).join(', ') || 'nothing'}]`,
);
for (const p of problems) console.log(`  FAIL ${p}`);
if (problems.length > 0) {
  console.log(
    '\nA promise the product cannot keep is worse than a missing feature: the advocate\n' +
      'finds out by missing something. Either deliver it, or stop saying it.',
  );
}
process.exit(problems.length === 0 ? 0 : 1);
