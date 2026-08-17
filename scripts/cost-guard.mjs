#!/usr/bin/env node
/**
 * Repository-wide approval and policy gate. Provider-specific runtime guards,
 * such as packages/storage/src/spend.ts, remain the pre-network enforcers.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPROVAL_DIR = join(ROOT, 'docs', 'cost-approvals');
const PUBLIC_KEY_PATH = join(APPROVAL_DIR, 'founder-cost-approval-public-key.pem');
const LEDGER_PATH = join(ROOT, 'docs', 'cost-spend-ledger.jsonl');
const LOCK_PATH = join(ROOT, 'docs', '.cost-spend-ledger.lock');
const APPROVAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const KINDS = new Set(['one-time', 'monthly']);
const BILLING_MODELS = new Set(['fixed', 'usage-based']);
const EVENT_TYPES = new Set(['AUTHORIZATION', 'ACTUAL', 'CLOSE']);
const APPROVAL_REQUIRED_CATEGORIES = new Set([
  'cloud-compute',
  'database-vendor',
  'vector-vendor',
  'full-corpus-embedding',
  'provider-account',
  'automatic-scale-up',
]);

const args = process.argv.slice(2);
const get = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? '' : (args[index + 1] ?? '');
};
const has = (name) => args.includes(`--${name}`);
const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values) => money(values.reduce((total, value) => total + value, 0));
const fail = (message, code = 2) => {
  console.error(message);
  process.exit(code);
};

const parseAmount = (raw, label = '--amount-usd') => {
  if (!raw || /^(unknown|unbounded|unlimited)$/i.test(raw)) {
    fail('UNKNOWN / UNBOUNDED cost is forbidden');
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    fail(`${label} must be a finite non-negative number`);
  }
  return money(amount);
};

const canonicalize = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON forbids non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`canonical JSON forbids ${typeof value}`);
};

const verifySignedApproval = (artifact, publicKey) => {
  if (!artifact || typeof artifact !== 'object' || !artifact.payload || !artifact.signature) {
    return false;
  }
  try {
    const signature = Buffer.from(artifact.signature, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== artifact.signature)
      return false;
    return verify(null, Buffer.from(canonicalize(artifact.payload)), publicKey, signature);
  } catch {
    return false;
  }
};

const readLedger = (path = LEDGER_PATH) => {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        const record = JSON.parse(line);
        return record.eventType ? record : { ...record, eventType: 'AUTHORIZATION' };
      } catch {
        throw new Error(`invalid JSON in ${path} line ${index + 1}`);
      }
    });
};

const sameOwner = (event, authorization) =>
  event.owner === authorization.owner &&
  event.taskId === authorization.taskId &&
  normalize(event.provider) === normalize(authorization.provider);

const ledgerState = (records) => {
  const authorizations = new Map();
  const closes = new Map();
  const actuals = [];
  for (const [index, record] of records.entries()) {
    const eventType = record.eventType ?? 'AUTHORIZATION';
    if (!EVENT_TYPES.has(eventType))
      throw new Error(`unknown eventType at ledger event ${index + 1}`);
    if (eventType === 'AUTHORIZATION') {
      if (!record.entryId)
        throw new Error(`authorization missing entryId at ledger event ${index + 1}`);
      if (authorizations.has(record.entryId))
        throw new Error(`duplicate authorization ${record.entryId}`);
      if (!Number.isFinite(record.amountUsd) || record.amountUsd < 0) {
        throw new Error(`invalid authorization amount at ledger event ${index + 1}`);
      }
      authorizations.set(record.entryId, record);
      continue;
    }
    const authorization = authorizations.get(record.authorizationId);
    if (!authorization) throw new Error(`${eventType} references unknown authorization`);
    if (!sameOwner(record, authorization)) {
      throw new Error(`${eventType} identity does not match authorization owner/task/provider`);
    }
    if (eventType === 'CLOSE') {
      if (closes.has(record.authorizationId)) throw new Error('CLOSE follows an existing CLOSE');
      if (authorization.kind !== 'monthly' && authorization.billingModel !== 'usage-based') {
        throw new Error('CLOSE requires a monthly or usage-based authorization');
      }
      if (!record.reason?.trim()) throw new Error('CLOSE requires a reason');
      closes.set(record.authorizationId, record);
    } else {
      if (!Number.isFinite(record.actualUsd) || record.actualUsd < 0) {
        throw new Error('ACTUAL requires a finite non-negative actualUsd');
      }
      actuals.push(record);
    }
  }
  const authorizationList = [...authorizations.values()];
  const activeRecurring = authorizationList.filter(
    (record) => record.kind === 'monthly' && !closes.has(record.entryId),
  );
  const activeUsageBased = authorizationList.filter(
    (record) => record.billingModel === 'usage-based' && !closes.has(record.entryId),
  );
  return {
    authorizations: authorizationList,
    actuals,
    closes: [...closes.values()],
    activeRecurring,
    activeUsageBased,
    historicalAuthorizedTotalUsd: sum(authorizationList.map((record) => record.amountUsd)),
    historicalActualMeasuredUsd: sum(actuals.map((record) => record.actualUsd)),
  };
};

const calculateCumulative = (records, proposal, now) => {
  const state = ledgerState(records);
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const proposedOneTime = proposal.kind === 'one-time' ? proposal.amountUsd : 0;
  const proposedMonthly = proposal.kind === 'monthly' ? proposal.amountUsd : 0;
  const sameTask = (record) => record.taskId === proposal.taskId;
  const sameProvider = (record) => normalize(record.provider) === proposal.provider;
  const sameDay = (record) => record.recordedAt?.slice(0, 10) === day;
  const sameMonth = (record) => record.recordedAt?.slice(0, 7) === month;
  const oneTime = state.authorizations.filter((record) => record.kind === 'one-time');
  return {
    taskOneTimeUsd: money(sum(oneTime.filter(sameTask).map((r) => r.amountUsd)) + proposedOneTime),
    providerDayOneTimeUsd: money(
      sum(oneTime.filter((r) => sameProvider(r) && sameDay(r)).map((r) => r.amountUsd)) +
        proposedOneTime,
    ),
    providerMonthOneTimeUsd: money(
      sum(oneTime.filter((r) => sameProvider(r) && sameMonth(r)).map((r) => r.amountUsd)) +
        proposedOneTime,
    ),
    projectDayOneTimeUsd: money(
      sum(oneTime.filter(sameDay).map((r) => r.amountUsd)) + proposedOneTime,
    ),
    projectMonthOneTimeUsd: money(
      sum(oneTime.filter(sameMonth).map((r) => r.amountUsd)) + proposedOneTime,
    ),
    taskActiveMonthlyUsd: money(
      sum(state.activeRecurring.filter(sameTask).map((r) => r.amountUsd)) + proposedMonthly,
    ),
    providerActiveMonthlyUsd: money(
      sum(state.activeRecurring.filter(sameProvider).map((r) => r.amountUsd)) + proposedMonthly,
    ),
    projectActiveMonthlyUsd: money(
      sum(state.activeRecurring.map((r) => r.amountUsd)) + proposedMonthly,
    ),
    projectHistoricalAuthorizedTotalUsd: money(
      state.historicalAuthorizedTotalUsd + proposal.amountUsd,
    ),
    projectHistoricalActualMeasuredUsd: state.historicalActualMeasuredUsd,
  };
};

const approvalReasons = (proposal, cumulative) => {
  const reasons = [];
  if (APPROVAL_REQUIRED_CATEGORIES.has(proposal.category)) {
    reasons.push(`category:${proposal.category}`);
  }
  // Zero-dollar unrestricted work cannot consume or cross a monetary budget.
  if (proposal.amountUsd === 0) return reasons;
  if (proposal.kind === 'one-time') {
    if (proposal.amountUsd > 10) reasons.push('single one-time spend exceeds $10');
    if (cumulative.taskOneTimeUsd > 10) reasons.push('task cumulative exceeds $10');
    if (cumulative.providerDayOneTimeUsd > 10) reasons.push('provider UTC-day exceeds $10');
    if (cumulative.providerMonthOneTimeUsd > 10) reasons.push('provider UTC-month exceeds $10');
    if (cumulative.projectDayOneTimeUsd > 10) reasons.push('project UTC-day exceeds $10');
    if (cumulative.projectMonthOneTimeUsd > 10) reasons.push('project UTC-month exceeds $10');
  } else {
    if (proposal.amountUsd > 5) reasons.push('single monthly commitment exceeds $5');
    if (cumulative.taskActiveMonthlyUsd > 5) reasons.push('task active monthly exceeds $5');
    if (cumulative.providerActiveMonthlyUsd > 5) reasons.push('provider active monthly exceeds $5');
    if (cumulative.projectActiveMonthlyUsd > 5) reasons.push('project active monthly exceeds $5');
  }
  return [...new Set(reasons)];
};

const approvalErrors = (payload, approvalId, proposal, records, now) => {
  const errors = [];
  if (payload.version !== 1) errors.push('version must be 1');
  if (!payload.nonce || typeof payload.nonce !== 'string') errors.push('nonce is required');
  if (payload.approvalId !== approvalId) errors.push('approvalId mismatch');
  if (payload.founderApproved !== true) errors.push('founderApproved must be true');
  if (payload.kind !== proposal.kind) errors.push('kind mismatch');
  if (normalize(payload.provider) !== proposal.provider) errors.push('provider mismatch');
  if (payload.purpose !== proposal.purpose) errors.push('purpose mismatch');
  if (payload.taskId != null && payload.taskId !== proposal.taskId) errors.push('taskId mismatch');
  const maximum = Number(payload.maximumAmountUsd);
  if (!Number.isFinite(maximum) || maximum < 0)
    errors.push('maximumAmountUsd must be finite and non-negative');
  const maximumUses = Number(payload.maximumUses);
  if (!Number.isInteger(maximumUses) || maximumUses < 1)
    errors.push('maximumUses must be a positive integer');
  const expiry = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now.getTime())
    errors.push('approval is expired or has invalid expiresAt');
  const state = ledgerState(records);
  const uses = state.authorizations.filter((record) => record.approvalId === approvalId);
  if (Number.isInteger(maximumUses) && uses.length + 1 > maximumUses) {
    errors.push('approval maximumUses would be exceeded');
  }
  if (
    Number.isFinite(maximum) &&
    sum(uses.map((r) => r.amountUsd)) + proposal.amountUsd > maximum
  ) {
    errors.push('approval cumulative maximumAmountUsd would be exceeded');
  }
  const period = payload.projectBudgetPeriod;
  if (period !== undefined) {
    const startsAt = Date.parse(period?.startsAt);
    const endsAt = Date.parse(period?.endsAt);
    const periodMaximum = Number(period?.maximumAmountUsd);
    if (
      !period?.id ||
      !Number.isFinite(startsAt) ||
      !Number.isFinite(endsAt) ||
      startsAt >= endsAt
    ) {
      errors.push('projectBudgetPeriod has invalid id or bounds');
    } else if (now.getTime() < startsAt || now.getTime() >= endsAt) {
      errors.push('outside founder projectBudgetPeriod');
    }
    if (!Number.isFinite(periodMaximum) || periodMaximum < 0) {
      errors.push('projectBudgetPeriod maximumAmountUsd must be finite and non-negative');
    } else {
      const used = state.authorizations.filter((record) => {
        const at = Date.parse(record.recordedAt);
        return Number.isFinite(at) && at >= startsAt && at < endsAt;
      });
      if (sum(used.map((r) => r.amountUsd)) + proposal.amountUsd > periodMaximum) {
        errors.push('founder projectBudgetPeriod maximumAmountUsd would be exceeded');
      }
    }
  }
  return errors;
};

const loadApproval = (approvalId, proposal, records, now) => {
  if (!APPROVAL_ID.test(approvalId)) fail('--approval-id has an invalid format', 4);
  const path = join(APPROVAL_DIR, `${approvalId}.json`);
  if (!existsSync(path)) fail(`founder approval artifact does not exist: ${path}`, 4);
  if (!existsSync(PUBLIC_KEY_PATH)) {
    fail('founder approval public key is not installed; see docs/cost-approvals/README.md', 4);
  }
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`founder approval artifact is not valid JSON: ${approvalId}`, 4);
  }
  if (!verifySignedApproval(artifact, readFileSync(PUBLIC_KEY_PATH))) {
    fail('founder approval rejected: unsigned, malformed, or signature invalid', 4);
  }
  const errors = approvalErrors(artifact.payload, approvalId, proposal, records, now);
  if (errors.length) fail(`founder approval rejected: ${errors.join('; ')}`, 4);
  return artifact.payload;
};

const lockIdentity = () => ({
  version: 1,
  pid: process.pid,
  createdAt: new Date().toISOString(),
  hostname: hostname(),
  processIdentity: `${process.execPath}|${process.argv[1] ?? ''}`,
  token: randomUUID(),
});
const validLock = (lock) =>
  lock?.version === 1 &&
  Number.isInteger(lock.pid) &&
  lock.pid > 0 &&
  Number.isFinite(Date.parse(lock.createdAt)) &&
  typeof lock.hostname === 'string' &&
  lock.hostname.length > 0 &&
  typeof lock.processIdentity === 'string' &&
  lock.processIdentity.length > 0 &&
  typeof lock.token === 'string' &&
  lock.token.length > 0;
const processStatus = (pid) => {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    return error?.code === 'ESRCH' ? 'dead' : 'unknown';
  }
};
const createLock = (path, identity) => {
  const handle = openSync(path, 'wx');
  try {
    writeFileSync(handle, `${JSON.stringify(identity)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
};

const acquireLock = (path = LOCK_PATH) => {
  mkdirSync(dirname(path), { recursive: true });
  const identity = lockIdentity();
  try {
    createLock(path, identity);
    return { identity, recovered: false };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  let observedText;
  let observed;
  try {
    observedText = readFileSync(path, 'utf8');
    observed = JSON.parse(observedText);
  } catch {
    throw new Error('cost ledger lock is malformed or unreadable; refusing recovery');
  }
  if (!validLock(observed))
    throw new Error('cost ledger lock metadata is invalid; refusing recovery');
  if (observed.hostname !== hostname())
    throw new Error('cost ledger lock belongs to another host; owner state is unknown');
  const status = processStatus(observed.pid);
  if (status === 'alive') throw new Error(`cost ledger is locked by live pid ${observed.pid}`);
  if (status !== 'dead') throw new Error('cost ledger lock owner state is unknown');

  const quarantine = `${path}.stale-${process.pid}-${randomUUID()}`;
  try {
    renameSync(path, quarantine);
  } catch {
    throw new Error('cost ledger lock changed during stale recovery; refusing');
  }
  try {
    if (readFileSync(quarantine, 'utf8') !== observedText) {
      if (!existsSync(path)) renameSync(quarantine, path);
      throw new Error('cost ledger lock changed during stale recovery; refusing');
    }
    createLock(path, identity);
  } catch (error) {
    if (existsSync(quarantine) && !existsSync(path)) renameSync(quarantine, path);
    throw error;
  } finally {
    if (existsSync(quarantine) && existsSync(path)) unlinkSync(quarantine);
  }
  return { identity, recovered: true };
};

const releaseLock = (lease, path = LOCK_PATH) => {
  if (!existsSync(path)) return false;
  try {
    const current = JSON.parse(readFileSync(path, 'utf8'));
    if (current.token !== lease.identity.token) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
};

const authorizationEntry = (proposal, approvalId, reasons, now) => ({
  eventType: 'AUTHORIZATION',
  entryId: `cost-${now.toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID()}`,
  ...proposal,
  approvalId: approvalId || null,
  approvalReasons: reasons,
  recordedAt: now.toISOString(),
});
const reconciliationEntry = (eventType, authorization, amount, reason, now) => ({
  eventType,
  entryId: `cost-${now.toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID()}`,
  authorizationId: authorization.entryId,
  provider: authorization.provider,
  owner: authorization.owner,
  taskId: authorization.taskId,
  ...(eventType === 'ACTUAL' ? { actualUsd: amount } : { reason }),
  recordedAt: now.toISOString(),
});

const baseTestAuthorization = (overrides = {}) => ({
  eventType: 'AUTHORIZATION',
  entryId: randomUUID(),
  amountUsd: 1.99,
  kind: 'one-time',
  billingModel: 'fixed',
  provider: 'provider-a',
  purpose: 'fragmentation test',
  owner: 'CX1',
  taskId: 'task-a',
  category: 'other',
  recordedAt: '2026-08-16T11:00:00Z',
  approvalId: null,
  ...overrides,
});
const runLockRace = (path) =>
  new Promise((resolve, reject) => {
    const results = [];
    for (let index = 0; index < 2; index += 1) {
      const child = spawn(
        process.execPath,
        [fileURLToPath(import.meta.url), '--internal-lock-test-worker', path],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        results.push({ code, output });
        if (results.length === 2) resolve(results);
      });
    }
  });

const runSelfTest = async () => {
  const checks = {};
  const check = (name, condition) => {
    checks[name] = Boolean(condition);
  };
  const now = new Date('2026-08-16T12:00:00Z');
  const proposal = {
    amountUsd: 1.99,
    kind: 'one-time',
    billingModel: 'fixed',
    provider: 'provider-a',
    purpose: 'fragmentation test',
    owner: 'CX1',
    taskId: 'task-a',
    category: 'other',
  };
  const repeated = (count, amountUsd, overrides = {}) =>
    Array.from({ length: count }, () => baseTestAuthorization({ amountUsd, ...overrides }));
  check(
    'six_x_1_99_fragmentation',
    approvalReasons(proposal, calculateCumulative(repeated(5, 1.99), proposal, now)).length > 0,
  );
  const p075 = { ...proposal, amountUsd: 0.75 };
  check(
    'twenty_x_0_75_fragmentation',
    approvalReasons(p075, calculateCumulative(repeated(19, 0.75), p075, now)).length > 0,
  );
  const monthly = { ...proposal, amountUsd: 4, kind: 'monthly', provider: 'provider-b' };
  const openFour = baseTestAuthorization({ amountUsd: 4, kind: 'monthly' });
  check(
    'several_4_recurring',
    approvalReasons(monthly, calculateCumulative([openFour], monthly, now)).includes(
      'project active monthly exceeds $5',
    ),
  );
  const zero = { ...proposal, amountUsd: 0 };
  const historical = repeated(6, 2, { recordedAt: '2025-01-01T00:00:00Z' });
  check(
    'zero_after_historical_over_10',
    approvalReasons(zero, calculateCumulative(historical, zero, now)).length === 0,
  );
  check(
    'zero_restricted_still_requires_approval',
    approvalReasons(
      { ...zero, category: 'cloud-compute' },
      calculateCumulative(historical, zero, now),
    ).length === 1,
  );

  const close = reconciliationEntry('CLOSE', openFour, null, 'task complete', now);
  const closedState = ledgerState([openFour, close]);
  check('monthly_open_counts', ledgerState([openFour]).activeRecurring.length === 1);
  check('close_removes_active', closedState.activeRecurring.length === 0);
  check('close_preserves_history', closedState.historicalAuthorizedTotalUsd === 4);
  let doubleCloseRefused = false;
  let unknownCloseRefused = false;
  let unrelatedCloseRefused = false;
  try {
    ledgerState([openFour, close, { ...close, entryId: randomUUID() }]);
  } catch {
    doubleCloseRefused = true;
  }
  try {
    ledgerState([{ ...close, authorizationId: 'missing' }]);
  } catch {
    unknownCloseRefused = true;
  }
  try {
    ledgerState([openFour, { ...close, owner: 'another-agent' }]);
  } catch {
    unrelatedCloseRefused = true;
  }
  check('double_close_refused', doubleCloseRefused);
  check('unknown_close_refused', unknownCloseRefused);
  check('unrelated_owner_close_refused', unrelatedCloseRefused);

  const usage = baseTestAuthorization({ amountUsd: 5, billingModel: 'usage-based' });
  const actual = reconciliationEntry('ACTUAL', usage, 2.31, '', now);
  const usageClose = reconciliationEntry('CLOSE', usage, null, 'task complete', now);
  const usageState = ledgerState([usage, actual, usageClose]);
  check('usage_actual_reconciles', usageState.historicalActualMeasuredUsd === 2.31);
  check('usage_close_preserves_authorization', usageState.historicalAuthorizedTotalUsd === 5);
  check(
    'actual_after_close_remains_reconcilable',
    ledgerState([usage, usageClose, { ...actual, entryId: randomUUID() }])
      .historicalActualMeasuredUsd === 2.31,
  );

  // TEST-ONLY ephemeral key material exists only in this process memory.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const payload = {
    approvalId: 'TEST-APPROVAL-001',
    maximumAmountUsd: 12,
    maximumUses: 2,
    kind: 'one-time',
    provider: 'provider-a',
    purpose: 'fragmentation test',
    taskId: 'task-a',
    expiresAt: '2026-08-17T00:00:00Z',
    founderApproved: true,
    nonce: 'TEST-ONLY-NONCE',
    version: 1,
  };
  const artifact = {
    payload,
    signature: sign(null, Buffer.from(canonicalize(payload)), privateKey).toString('base64'),
  };
  check('approval_signature_valid', verifySignedApproval(artifact, publicKey));
  check('approval_unsigned_refused', !verifySignedApproval({ payload }, publicKey));
  check(
    'approval_signature_tampered',
    !verifySignedApproval(
      { ...artifact, payload: { ...payload, maximumAmountUsd: 99 } },
      publicKey,
    ),
  );
  check(
    'approval_expired',
    approvalErrors(
      { ...payload, expiresAt: '2026-08-16T11:59:59Z' },
      payload.approvalId,
      proposal,
      [],
      now,
    ).some((error) => error.includes('expired')),
  );
  const usedApproval = baseTestAuthorization({ amountUsd: 6, approvalId: payload.approvalId });
  check(
    'approval_maximum_uses_exhausted',
    approvalErrors(
      { ...payload, maximumUses: 1 },
      payload.approvalId,
      proposal,
      [usedApproval],
      now,
    ).some((error) => error.includes('maximumUses')),
  );
  check(
    'approval_cumulative_maximum',
    approvalErrors(
      payload,
      payload.approvalId,
      { ...proposal, amountUsd: 7 },
      [usedApproval],
      now,
    ).some((error) => error.includes('cumulative maximumAmountUsd')),
  );

  const temp = mkdtempSync(join(tmpdir(), 'lawmind-cost-guard-test-'));
  try {
    const deadPath = join(temp, 'dead.lock');
    writeFileSync(deadPath, JSON.stringify({ ...lockIdentity(), pid: 2147483647 }));
    const recovered = acquireLock(deadPath);
    check('stale_dead_lock_recovered', recovered.recovered && releaseLock(recovered, deadPath));
    const livePath = join(temp, 'live.lock');
    writeFileSync(livePath, JSON.stringify(lockIdentity()));
    let liveRefused = false;
    try {
      acquireLock(livePath);
    } catch (error) {
      liveRefused = /live pid/.test(error.message);
    }
    check('live_lock_refused', liveRefused && existsSync(livePath));
    const malformedPath = join(temp, 'malformed.lock');
    writeFileSync(malformedPath, '{not json');
    let malformedRefused = false;
    try {
      acquireLock(malformedPath);
    } catch (error) {
      malformedRefused = /malformed/.test(error.message);
    }
    check('malformed_lock_refused', malformedRefused && existsSync(malformedPath));
    const raceResults = await runLockRace(join(temp, 'race.lock'));
    check(
      'concurrent_ledger_attempts',
      raceResults.filter((result) => result.output.includes('ACQUIRED')).length === 1 &&
        raceResults.filter((result) => result.output.includes('REFUSED')).length === 1,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  const passed = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ checks, passed }, null, 2));
  process.exit(passed ? 0 : 1);
};

if (has('internal-lock-test-worker')) {
  const path = get('internal-lock-test-worker');
  try {
    const lease = acquireLock(path);
    console.log('ACQUIRED');
    await delay(750);
    releaseLock(lease, path);
    process.exit(0);
  } catch (error) {
    console.log(`REFUSED: ${error.message}`);
    process.exit(5);
  }
}
if (has('self-test')) await runSelfTest();

const eventType = (get('event') || 'authorization').trim().toUpperCase();
if (!EVENT_TYPES.has(eventType)) fail('--event must be authorization, actual, or close');
if (has('approve')) fail('--approve was removed; reference a signed --approval-id artifact', 4);
const record = has('record');
const now = new Date();
const owner = get('owner').trim();
const provider = normalize(get('provider'));
const taskId = get('task-id').trim();
if (!owner) fail('--owner is required');
if (!provider) fail('--provider is required');
if (!taskId) fail('--task-id is required');

const evaluateAuthorization = (records, proposal, approvalId) => {
  const cumulative = calculateCumulative(records, proposal, now);
  const reasons = approvalReasons(proposal, cumulative);
  if (reasons.length) {
    if (!approvalId) fail(`founder approval required: ${reasons.join('; ')}`, 4);
    loadApproval(approvalId, proposal, records, now);
  }
  return { cumulative, reasons };
};

const prepare = (records) => {
  if (eventType === 'AUTHORIZATION') {
    const amountUsd = parseAmount(get('amount-usd'));
    const kind = get('kind') || 'one-time';
    const billingModel = get('billing-model') || 'fixed';
    const purpose = get('purpose').trim();
    const category = normalize(get('category') || 'other');
    const approvalId = get('approval-id').trim();
    if (!KINDS.has(kind)) fail('--kind must be one-time or monthly');
    if (!BILLING_MODELS.has(billingModel)) fail('--billing-model must be fixed or usage-based');
    if (!purpose) fail('--purpose is required');
    const capRaw = get('cap-usd').trim();
    const shutdown = get('shutdown').trim();
    let capUsd = null;
    if ((kind === 'monthly' || billingModel === 'usage-based') && amountUsd > 0) {
      if (!capRaw || /unknown|unbounded|unlimited/i.test(capRaw)) {
        fail('monthly or usage-based spend requires a finite --cap-usd');
      }
      capUsd = Number(capRaw);
      if (!Number.isFinite(capUsd) || capUsd < amountUsd) {
        fail('--cap-usd must be finite and at least --amount-usd');
      }
      if (!shutdown) fail('monthly or usage-based spend requires --shutdown');
    }
    const hardLimitRaw = get('hard-provider-limit-usd').trim();
    const hardLimitSource = get('hard-provider-limit-source').trim();
    let hardProviderLimitUsd = null;
    if (hardLimitRaw) {
      hardProviderLimitUsd = parseAmount(hardLimitRaw, '--hard-provider-limit-usd');
      if (!hardLimitSource) fail('--hard-provider-limit-source is required with a hard limit');
    } else if (hardLimitSource) {
      fail('--hard-provider-limit-usd is required with a hard limit source');
    }
    const proposal = {
      amountUsd,
      kind,
      billingModel,
      provider,
      purpose,
      owner,
      taskId,
      category,
      capUsd,
      shutdown: shutdown || null,
      hardProviderLimitUsd,
      hardProviderLimitSource: hardLimitSource || null,
    };
    const evaluation = evaluateAuthorization(records, proposal, approvalId);
    return {
      proposal,
      evaluation,
      approvalId: approvalId || null,
      entry: authorizationEntry(proposal, approvalId, evaluation.reasons, now),
    };
  }
  const authorizationId = get('authorization-id').trim();
  if (!authorizationId) fail('--authorization-id is required');
  const state = ledgerState(records);
  const authorization = state.authorizations.find((item) => item.entryId === authorizationId);
  if (!authorization) fail(`${eventType} references unknown authorization`, 6);
  if (!sameOwner({ owner, provider, taskId }, authorization)) {
    fail(`${eventType} identity does not match authorization owner/task/provider`, 6);
  }
  let entry;
  if (eventType === 'ACTUAL') {
    entry = reconciliationEntry(
      'ACTUAL',
      authorization,
      parseAmount(get('actual-usd'), '--actual-usd'),
      '',
      now,
    );
  } else {
    const reason = get('reason').trim();
    if (!reason) fail('CLOSE requires --reason');
    entry = reconciliationEntry('CLOSE', authorization, null, reason, now);
  }
  try {
    ledgerState([...records, entry]);
  } catch (error) {
    fail(error.message, 6);
  }
  return { proposal: null, evaluation: null, approvalId: null, entry };
};

let records;
try {
  records = readLedger();
  ledgerState(records);
} catch (error) {
  fail(error.message, 6);
}
let prepared = prepare(records);
let entry = null;
let recoveredStaleLock = false;
if (record) {
  let lease;
  try {
    lease = acquireLock();
    recoveredStaleLock = lease.recovered;
  } catch (error) {
    fail(error.message, 5);
  }
  try {
    records = readLedger();
    ledgerState(records);
    prepared = prepare(records);
    entry = prepared.entry;
    appendFileSync(LEDGER_PATH, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
  } catch (error) {
    fail(error.message, 6);
  } finally {
    releaseLock(lease);
  }
}
const stateAfter = ledgerState(entry ? [...records, entry] : records);
console.log(
  JSON.stringify(
    {
      allowed: true,
      eventType,
      spendAuthorized: record && eventType === 'AUTHORIZATION',
      eventRecorded: record,
      recordRequiredBeforeAction: !record,
      proposal: prepared.proposal,
      approvalRequired: prepared.evaluation?.reasons.length > 0,
      approvalId: prepared.approvalId,
      approvalReasons: prepared.evaluation?.reasons ?? [],
      cumulativeAfterProposal: prepared.evaluation?.cumulative ?? null,
      reporting: {
        historicalAuthorizedTotalUsd: stateAfter.historicalAuthorizedTotalUsd,
        historicalActualMeasuredUsd: stateAfter.historicalActualMeasuredUsd,
        activeRecurringCount: stateAfter.activeRecurring.length,
        activeUsageBasedCount: stateAfter.activeUsageBased.length,
      },
      recoveredStaleLock,
      ledger: 'docs/cost-spend-ledger.jsonl',
      entry,
    },
    null,
    2,
  ),
);
