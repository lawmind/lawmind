/**
 * Apply only FIFTH's signed R10 UNIQUE decision population.
 *
 * The source is the immutable decide-only JSONL, pinned by SHA-256, resolver
 * version and exact UNIQUE count. The resolver is not called here. Every batch
 * updates only still-null pointers and checkpoints after the database write, so
 * a killed run is resumable and never overwrites a concurrent resolution.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

import { readKeyFreshness } from '../services/api/src/citations/key-freshness.ts';
import { resolveBatch, RESOLVER_VERSION } from '../services/api/src/citations/resolver.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
};
const SIGNATURE_PATH = join(ROOT, arg('signature', 'docs/ai/new2-r10/citation-apply-signature.json'));
const RISK_PATH = join(ROOT, arg('risk-replay', 'docs/ai/new2-r8/resolver-risk-replay.json'));
const STATE_PATH = join(ROOT, arg('state', '.tmp-new2/citation-signed-apply.state.json'));
const APPLY_JOURNAL = join(ROOT, arg('apply-journal', '.tmp-new2/citation-signed-apply.jsonl'));
const SUMMARY_PATH = join(ROOT, arg('summary', 'docs/ai/new2-r10/citation-signed-apply.json'));
const PREFLIGHT_STATE_PATH = join(ROOT, arg('preflight-state', '.tmp-new2/citation-signed-preflight.state.json'));
const PREFLIGHT_SUMMARY_PATH = join(ROOT, arg('preflight-summary', 'docs/ai/new2-r10/citation-signed-preflight.json'));
const BATCH = Number(arg('batch', '5000'));
const VERIFY_ONLY = process.argv.includes('--verify-only');
const PREFLIGHT_ONLY = process.argv.includes('--preflight-only');
if (!Number.isInteger(BATCH) || BATCH < 1 || BATCH > 20_000) throw new Error('--batch must be 1..20000');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Signature = {
  signature: string;
  resolverVersion: string;
  verifiedPopulation: { state: string; count: number; unresolvedPopulation: number };
  falsePinCount: number;
  materialRecallMissCount: number;
  signedDecisionJournal: { path: string; sha256: string; decidedRows: number; sweepStartedAt: string };
};
type Decision = {
  edgeId: string;
  raw: string;
  state: string;
  candidates: string[];
  version: string;
};
type PreflightState = {
  startedAt: string;
  journalSha256: string;
  resolverVersion: string;
  signedPopulation: number;
  frontierAt: string;
  linesRead: number;
  uniqueChecked: number;
  mismatches: number;
  examples: Array<{ edgeId: string; raw: string; signedTarget: string; currentState: string; currentTargets: string[] }>;
};
type ApplyState = {
  startedAt: string;
  journalSha256: string;
  resolverVersion: string;
  signedPopulation: number;
  linesRead: number;
  uniqueSeen: number;
  applied: number;
  alreadySame: number;
  conflicts: number;
  missingRows: number;
  errors: number;
  batches: number;
  resolvedRowsBefore: number;
  distinctEdgesBefore: number;
};

async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const signature = JSON.parse(readFileSync(SIGNATURE_PATH, 'utf8')) as Signature;
if (
  signature.signature !== 'PASS' ||
  signature.resolverVersion !== RESOLVER_VERSION ||
  signature.verifiedPopulation.state !== 'UNIQUE' ||
  signature.falsePinCount !== 0 ||
  signature.materialRecallMissCount !== 0
) {
  throw new Error('FIFTH signature does not authorize this exact resolver/population');
}
const DECISIONS = join(ROOT, signature.signedDecisionJournal.path);
if (!existsSync(DECISIONS)) throw new Error(`signed decision journal absent: ${DECISIONS}`);
const observedHash = await fileSha256(DECISIONS);
if (observedHash !== signature.signedDecisionJournal.sha256) {
  throw new Error(`signed journal SHA mismatch: ${observedHash}`);
}

const expansion = JSON.parse(
  readFileSync(join(ROOT, 'docs/ai/new2-r10/citation-expansion.json'), 'utf8'),
) as { resolverVersion?: string; states?: Record<string, number> };
if (
  expansion.resolverVersion !== signature.resolverVersion ||
  expansion.states?.['UNIQUE'] !== signature.verifiedPopulation.count
) {
  throw new Error('decide-only summary does not match FIFTH signed population');
}

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 30, connect_timeout: 60, onnotice: () => {} });
try {
  const freshness = await readKeyFreshness(sql);
  const risk = JSON.parse(readFileSync(RISK_PATH, 'utf8')) as {
    mode?: string;
    false_unique_rate?: number;
    totals?: { records?: number };
    notes?: { frontier_at?: string };
  };
  const gateRefusals: string[] = [];
  if (freshness.state !== 'CURRENT') gateRefusals.push(`key freshness ${freshness.state}`);
  if (risk.mode !== 'WRITE') gateRefusals.push(`risk replay mode ${String(risk.mode)}`);
  if (!risk.totals?.records) gateRefusals.push('risk replay covered zero records');
  if (risk.false_unique_rate !== 0) gateRefusals.push(`risk replay false unique ${String(risk.false_unique_rate)}`);
  if (gateRefusals.length) throw new Error(`apply gate refused: ${gateRefusals.join('; ')}`);
  if (VERIFY_ONLY) {
    console.log(JSON.stringify({
      verified: true,
      signature: signature.signature,
      resolverVersion: signature.resolverVersion,
      signedPopulation: signature.verifiedPopulation.count,
      journalSha256: observedHash,
      keyFreshness: freshness.state,
      riskReplayMode: risk.mode,
      riskReplayRecords: risk.totals?.records,
      riskReplayFalseUniqueRate: risk.false_unique_rate,
    }));
    await sql.end({ timeout: 15 });
    process.exit(0);
  }

  if (PREFLIGHT_ONLY) {
    if (!freshness.frontierAt) throw new Error('preflight requires a concrete key-index frontier');
    mkdirSync(dirname(PREFLIGHT_STATE_PATH), { recursive: true });
    let preflight: PreflightState;
    if (existsSync(PREFLIGHT_STATE_PATH)) {
      preflight = JSON.parse(readFileSync(PREFLIGHT_STATE_PATH, 'utf8')) as PreflightState;
      if (
        preflight.journalSha256 !== observedHash ||
        preflight.resolverVersion !== signature.resolverVersion ||
        preflight.signedPopulation !== signature.verifiedPopulation.count ||
        preflight.frontierAt !== freshness.frontierAt
      ) throw new Error('preflight state belongs to a different journal, resolver, population, or frontier');
    } else {
      preflight = {
        startedAt: new Date().toISOString(),
        journalSha256: observedHash,
        resolverVersion: signature.resolverVersion,
        signedPopulation: signature.verifiedPopulation.count,
        frontierAt: freshness.frontierAt,
        linesRead: 0,
        uniqueChecked: 0,
        mismatches: 0,
        examples: [],
      };
      writeFileSync(PREFLIGHT_STATE_PATH, JSON.stringify(preflight, null, 1));
    }
    let lineNumber = 0;
    let checkpointLine = preflight.linesRead;
    let decisions: Decision[] = [];
    const started = Date.now();
    const check = async (throughLine: number): Promise<void> => {
      if (decisions.length) {
        const current = await resolveBatch(sql, decisions.map((decision) => decision.raw), freshness);
        current.forEach((result, index) => {
          const decision = decisions[index]!;
          const currentTargets = result.candidates.map((candidate) => candidate.judgmentId);
          const exact = result.state === 'UNIQUE' && currentTargets.length === 1 &&
            currentTargets[0] === decision.candidates[0] && result.version === signature.resolverVersion;
          if (!exact) {
            preflight.mismatches++;
            if (preflight.examples.length < 25) preflight.examples.push({
              edgeId: decision.edgeId,
              raw: decision.raw,
              signedTarget: decision.candidates[0]!,
              currentState: result.state,
              currentTargets,
            });
          }
        });
        preflight.uniqueChecked += decisions.length;
        decisions = [];
      }
      preflight.linesRead = throughLine;
      checkpointLine = throughLine;
      writeFileSync(PREFLIGHT_STATE_PATH, JSON.stringify(preflight, null, 1));
      if (preflight.uniqueChecked % 100_000 < Math.min(BATCH, 2000)) {
        const seconds = (Date.now() - started) / 1000;
        console.log(`[signed-preflight] ${preflight.uniqueChecked}/${preflight.signedPopulation} · ` +
          `${preflight.mismatches} mismatches · ${Math.round(preflight.uniqueChecked / Math.max(seconds, 0.001))} rows/sec`);
      }
    };
    const lines = createInterface({ input: createReadStream(DECISIONS), crlfDelay: Infinity });
    for await (const line of lines) {
      lineNumber++;
      if (lineNumber <= preflight.linesRead || !line) continue;
      const decision = JSON.parse(line) as Decision;
      if (decision.state === 'UNIQUE') decisions.push(decision);
      if (decisions.length >= Math.min(BATCH, 2000)) await check(lineNumber);
    }
    if (decisions.length || checkpointLine < lineNumber) await check(lineNumber);
    if (preflight.uniqueChecked !== signature.verifiedPopulation.count) {
      throw new Error(`preflight population mismatch: ${preflight.uniqueChecked}`);
    }
    const summary = {
      artifact: 'NEW2_CITATION_SIGNED_PREFLIGHT_R10',
      completedAt: new Date().toISOString(),
      resolverVersion: signature.resolverVersion,
      signedPopulation: signature.verifiedPopulation.count,
      journalSha256: observedHash,
      frontierAt: freshness.frontierAt,
      uniqueChecked: preflight.uniqueChecked,
      mismatches: preflight.mismatches,
      examples: preflight.examples,
      state: preflight.mismatches === 0 ? 'EXACT' : 'REFUSED',
    };
    mkdirSync(dirname(PREFLIGHT_SUMMARY_PATH), { recursive: true });
    writeFileSync(PREFLIGHT_SUMMARY_PATH, `${JSON.stringify(summary, null, 1)}\n`);
    console.log(JSON.stringify(summary));
    await sql.end({ timeout: 15 });
    process.exit(preflight.mismatches === 0 ? 0 : 6);
  }

  const preflight = existsSync(PREFLIGHT_SUMMARY_PATH)
    ? JSON.parse(readFileSync(PREFLIGHT_SUMMARY_PATH, 'utf8')) as {
        state?: string;
        resolverVersion?: string;
        signedPopulation?: number;
        journalSha256?: string;
        frontierAt?: string;
        mismatches?: number;
      }
    : null;
  if (
    preflight?.state !== 'EXACT' ||
    preflight.resolverVersion !== signature.resolverVersion ||
    preflight.signedPopulation !== signature.verifiedPopulation.count ||
    preflight.journalSha256 !== observedHash ||
    preflight.frontierAt !== freshness.frontierAt ||
    preflight.mismatches !== 0
  ) throw new Error('signed population has not passed exact current-frontier preflight');

  const metrics = async () => {
    const [row] = await sql<{ resolved: string; edges: string }[]>`
      SELECT count(*)::text AS resolved,
             count(DISTINCT (citing_judgment_id,cited_judgment_id))::text AS edges
        FROM judgment_citations WHERE cited_judgment_id IS NOT NULL`;
    return { resolved: Number(row?.resolved ?? 0), edges: Number(row?.edges ?? 0) };
  };

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  mkdirSync(dirname(APPLY_JOURNAL), { recursive: true });
  let state: ApplyState;
  if (existsSync(STATE_PATH)) {
    state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as ApplyState;
    if (
      state.journalSha256 !== observedHash ||
      state.resolverVersion !== signature.resolverVersion ||
      state.signedPopulation !== signature.verifiedPopulation.count
    ) throw new Error('apply state belongs to a different signed population');
  } else {
    const before = await metrics();
    state = {
      startedAt: new Date().toISOString(),
      journalSha256: observedHash,
      resolverVersion: signature.resolverVersion,
      signedPopulation: signature.verifiedPopulation.count,
      linesRead: 0,
      uniqueSeen: 0,
      applied: 0,
      alreadySame: 0,
      conflicts: 0,
      missingRows: 0,
      errors: 0,
      batches: 0,
      resolvedRowsBefore: before.resolved,
      distinctEdgesBefore: before.edges,
    };
    writeFileSync(APPLY_JOURNAL, '');
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
  }

  let lineNumber = 0;
  let checkpointLine = state.linesRead;
  let pins: Array<{ id: string; cited: string }> = [];
  const runStarted = Date.now();
  let appliedThisRun = 0;

  const flush = async (throughLine: number): Promise<void> => {
    if (pins.length === 0) {
      state.linesRead = throughLine;
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
      return;
    }
    const ids = pins.map((pin) => pin.id);
    const cited = pins.map((pin) => pin.cited);
    try {
      const [before] = await sql<{ found: string; same: string; conflicts: string }[]>`
        WITH v AS (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cited}::uuid[]) AS cited)
        SELECT count(jc.id)::text AS found,
               count(*) FILTER (WHERE jc.cited_judgment_id=v.cited)::text AS same,
               count(*) FILTER (WHERE jc.cited_judgment_id IS NOT NULL AND jc.cited_judgment_id<>v.cited)::text AS conflicts
          FROM v LEFT JOIN judgment_citations jc ON jc.id=v.id`;
      const result = await sql`
        UPDATE judgment_citations jc SET cited_judgment_id=v.cited
          FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cited}::uuid[]) AS cited) v
         WHERE jc.id=v.id AND jc.cited_judgment_id IS NULL`;
      const found = Number(before?.found ?? 0);
      const same = Number(before?.same ?? 0);
      const conflicts = Number(before?.conflicts ?? 0);
      const missing = pins.length - found;
      state.uniqueSeen += pins.length;
      state.applied += result.count;
      state.alreadySame += same;
      state.conflicts += conflicts;
      state.missingRows += missing;
      state.batches++;
      state.linesRead = throughLine;
      appliedThisRun += result.count;
      appendFileSync(APPLY_JOURNAL, `${JSON.stringify({
        batch: state.batches,
        throughLine,
        rows: pins.length,
        applied: result.count,
        alreadySame: same,
        conflicts,
        missing,
        at: new Date().toISOString(),
      })}\n`);
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
      if (state.uniqueSeen % 100_000 < BATCH) {
        const seconds = (Date.now() - runStarted) / 1000;
        console.log(`[signed-apply] ${state.uniqueSeen}/${state.signedPopulation} signed rows · ` +
          `${state.applied} applied · ${Math.round(appliedThisRun / Math.max(seconds, 0.001))} rows/sec`);
      }
      pins = [];
      checkpointLine = throughLine;
    } catch (error) {
      state.errors++;
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
      appendFileSync(APPLY_JOURNAL, `${JSON.stringify({ throughLine, error: String(error), at: new Date().toISOString() })}\n`);
      throw error;
    }
  };

  const lines = createInterface({ input: createReadStream(DECISIONS), crlfDelay: Infinity });
  for await (const line of lines) {
    lineNumber++;
    if (lineNumber <= state.linesRead || !line) continue;
    const decision = JSON.parse(line) as Decision;
    if (decision.version !== signature.resolverVersion) {
      throw new Error(`resolver version drift at journal line ${lineNumber}`);
    }
    if (decision.state === 'UNIQUE') {
      if (decision.candidates.length !== 1) throw new Error(`non-singleton UNIQUE at line ${lineNumber}`);
      pins.push({ id: decision.edgeId, cited: decision.candidates[0]! });
    }
    if (pins.length >= BATCH) await flush(lineNumber);
  }
  if (pins.length) await flush(lineNumber);
  else if (checkpointLine < lineNumber) await flush(lineNumber);

  if (state.uniqueSeen !== signature.verifiedPopulation.count) {
    throw new Error(`signed population mismatch: saw ${state.uniqueSeen}, expected ${signature.verifiedPopulation.count}`);
  }
  const after = await metrics();
  const elapsedSeconds = (Date.now() - runStarted) / 1000;
  const summary = {
    artifact: 'NEW2_CITATION_SIGNED_APPLY_R10',
    completedAt: new Date().toISOString(),
    signature: {
      source: 'docs/ai/new2-r10/citation-apply-signature.json',
      resolverVersion: signature.resolverVersion,
      population: signature.verifiedPopulation.count,
      decisionJournalSha256: observedHash,
    },
    gate: {
      citationApplySignature: 'PASS',
      keyFreshness: freshness.state,
      riskReplayMode: risk.mode,
      riskReplayRecords: risk.totals?.records,
      riskReplayFalseUniqueRate: risk.false_unique_rate,
      riskReplayFrontierAt: risk.notes?.frontier_at ?? null,
    },
    apply: {
      signedRowsSeen: state.uniqueSeen,
      applied: state.applied,
      alreadySame: state.alreadySame,
      conflicts: state.conflicts,
      missingRows: state.missingRows,
      errors: state.errors,
      rowsPerSecondThisRun: Math.round(appliedThisRun / Math.max(elapsedSeconds, 0.001)),
      durableState: '.tmp-new2/citation-signed-apply.state.json',
      durableBatchJournal: '.tmp-new2/citation-signed-apply.jsonl',
    },
    graph: {
      resolvedRowsBefore: state.resolvedRowsBefore,
      resolvedRowsAfter: after.resolved,
      referencesResolvedGrowth: after.resolved - state.resolvedRowsBefore,
      distinctEdgesBefore: state.distinctEdgesBefore,
      distinctEdgesAfter: after.edges,
      distinctEdgeGrowth: after.edges - state.distinctEdgesBefore,
      ambiguousRemaining: expansion.states?.['AMBIGUOUS'] ?? null,
      noCandidateRemaining: expansion.states?.['TARGET_NOT_HELD'] ?? null,
      refusedRemaining: expansion.states?.['REFUSED'] ?? null,
    },
  };
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 1)}\n`);
  console.log(JSON.stringify(summary));
  if (state.conflicts || state.missingRows || state.errors) process.exitCode = 5;
} finally {
  await sql.end({ timeout: 15 });
}
