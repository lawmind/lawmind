/**
 * NEW2 R24 PHASE B — a fresh citation-edge CANDIDATE population, from corrected truth.
 *
 * Candidate generation only. The session is opened READ ONLY at the server, so a
 * stray INSERT or UPDATE is an error rather than a promise: nothing here can
 * write an edge, an alias, or a canonical row even by accident.
 *
 * Nothing from R19-R22 is reused. Every candidate is derived from the corpus as
 * it stands AFTER the R24 Phase A corrections, and the resolution gate is the
 * production one (`canonicalKeyFor`, `judgment_citation_keys`) rather than a
 * second implementation of citation identity.
 *
 * Usage: pnpm exec tsx scripts/n2-r24-edges.mts
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { canonicalKeyFor } from '../services/api/src/citations/resolver.ts';
import { classifyCitationGraphOccurrence } from '../services/ingest/src/citations.ts';
import { sslFor } from './migration/new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r24');
const R21 = join(ROOT, 'docs/ai/new2-r21');
mkdirSync(OUT, { recursive: true });

const POPULATION_FILE = join(OUT, 'edge-candidate-population.jsonl');
const sha = (v: string): string => createHash('sha256').update(v).digest('hex');
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const writeJson = (name: string, value: unknown): void =>
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
const assert = (c: unknown, m: string): asserts c => {
  if (!c) throw new Error(m);
};

// ---------------------------------------------------------------------------
// 0. Phase B runs only on a committed, read-back Phase A.
// ---------------------------------------------------------------------------

const receiptRaw = readFileSync(join(OUT, 'receipt.json'), 'utf8');
const receiptHashRecord = readJson<{ sha256: string }>(join(OUT, 'receipt-hash.json'));
assert(sha(receiptRaw) === receiptHashRecord.sha256, 'R24 receipt bytes do not match the recorded hash');
const receipt = JSON.parse(receiptRaw) as {
  canonicalCorrection: string;
  postcommitReadback: { exact: number; expected: number; pass: boolean };
  transaction: { outcome: string; applied: number };
};
assert(receipt.canonicalCorrection === 'PASS', `CANONICAL_CORRECTION is ${receipt.canonicalCorrection}`);
assert(receipt.postcommitReadback.pass && receipt.postcommitReadback.exact === 539, 'POSTCOMMIT_READBACK is not 539/539');
assert(receipt.transaction.outcome === 'COMMITTED', 'Phase A did not commit');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const url = databaseUrl();
const sql = postgres(url, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 0,
  ssl: sslFor(url),
  // Every statement on this connection runs read-only. Not a convention: the
  // server refuses the write, so "no edge writer was called" is mechanical.
  connection: { default_transaction_read_only: 'on' },
});

// Prove the read-only session actually refuses a write before trusting it.
const proveReadOnly = async (): Promise<string> => {
  try {
    await sql.unsafe(`insert into judgment_citation_aliases (judgment_id, alias, alias_key, alias_reporter, corroborations, evidence)
                      values ('00000000-0000-0000-0000-000000000000','x','X','AIR',2,'x')`);
    return 'FAILED_SESSION_ACCEPTED_A_WRITE';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /read-only transaction/i.test(message) ? 'REFUSED_READ_ONLY_TRANSACTION' : `REFUSED_OTHER:${message.slice(0, 60)}`;
  }
};
const readOnlyProof = await proveReadOnly();
assert(readOnlyProof === 'REFUSED_READ_ONLY_TRANSACTION', `read-only session not proven: ${readOnlyProof}`);

// ---------------------------------------------------------------------------
// 1. Everything this round must leave alone, counted before it starts.
// ---------------------------------------------------------------------------

const edgeCensus = async (): Promise<Record<string, string>> => {
  const [totals] = (await sql.unsafe(
    `select count(*)::text as edges, coalesce(max(created_at)::text,'NONE') as newest,
            count(*) filter (where cited_judgment_id is null)::text as unresolved from judgment_citations`,
  )) as Array<Record<string, string>>;
  return totals!;
};
const aliasCensus = async (): Promise<Record<string, string>> => {
  const [row] = (await sql.unsafe(
    `select count(*)::text as aliases,
            coalesce(md5(string_agg(id::text||'|'||judgment_id::text||'|'||alias_key||'|'||
                          corroborations::text, E'\n' order by id)),'EMPTY') as hash
       from judgment_citation_aliases`,
  )) as Array<Record<string, string>>;
  return row!;
};

const edgesBefore = await edgeCensus();
const aliasesBefore = await aliasCensus();
const [frontier] = (await sql.unsafe(`select cursor_at::text, cursor_id::text, scanned::text from citation_key_frontier`)) as Array<Record<string, string>>;
const [judgmentFrontier] = (await sql.unsafe(
  `select created_at::text as created_at, id::text from judgments order by created_at desc, id desc limit 1`,
)) as Array<{ created_at: string; id: string }>;

// ---------------------------------------------------------------------------
// 2. The resolution index, as it stands now.
// ---------------------------------------------------------------------------

type KeyRow = { citation_key: string; judgment_id: string; source: string };
const keyRows = (await sql.unsafe(
  `select citation_key, judgment_id::text as judgment_id, source from judgment_citation_keys`,
)) as KeyRow[];
const holders = new Map<string, Map<string, Set<string>>>();
for (const row of keyRows) {
  let byJudgment = holders.get(row.citation_key);
  if (!byJudgment) holders.set(row.citation_key, (byJudgment = new Map()));
  let sources = byJudgment.get(row.judgment_id);
  if (!sources) byJudgment.set(row.judgment_id, (sources = new Set()));
  sources.add(row.source);
}

/**
 * The index does not reflect these judgments. Migration 0088's trigger says so,
 * and Phase A put 539 of them there itself. A key any of them claims cannot be
 * called UNIQUE — the answer is UNTESTABLE until the index is rebuilt, never a
 * confident pin from an index known to be behind.
 */
const dirtyRows = (await sql.unsafe(`select judgment_id::text as id, reason from citation_key_dirty`)) as Array<{ id: string; reason: string }>;
const dirty = new Set(dirtyRows.map((row) => row.id));

/** Ownership nobody has settled. A candidate touching one of these is untestable, not a pin. */
const quarantine = new Set(readJson<{ records: string[] }>(join(ROOT, 'docs/ai/new2-r23/quarantine-census.json')).records);

/**
 * The two reproduced Meghalaya false pins, read BEFORE the pass rather than
 * after it, so "this is not in the candidate population" can be OBSERVED as the
 * rows go by instead of asserted at the end.
 */
const falsePinCases = readJson<{ cases: Array<{ sourceJudgmentId: string; newToken: string }> }>(
  join(R21, 'false-pin-reproduction.json'),
).cases;
const watchedIds = new Set(falsePinCases.map((item) => item.sourceJudgmentId));
const watchedOutcomes = new Map<string, string[]>(falsePinCases.map((item) => [item.sourceJudgmentId, []]));
const noteWatched = (id: string, outcome: string): void => {
  if (watchedIds.has(id)) watchedOutcomes.get(id)!.push(outcome);
};

type DistinctCitation = { normalised_citation: string; occurrences: number };
const distinct = (await sql.unsafe(
  `select normalised_citation, count(*)::int as occurrences
     from judgment_citations where cited_judgment_id is null group by 1`,
)) as DistinctCitation[];

type KeyVerdict = {
  key: string | null;
  state: 'UNIQUE' | 'AMBIGUOUS' | 'TARGET_NOT_HELD' | 'REFUSED' | 'UNTESTABLE_STALE_INDEX';
  holder: string | null;
  holderCount: number;
  resolutionPath: string;
  why: string | null;
};
const verdicts = new Map<string, KeyVerdict>();
const keyCensus: Record<string, { citations: number; occurrences: number }> = {};
const bump = (label: string, occurrences: number): void => {
  keyCensus[label] ??= { citations: 0, occurrences: 0 };
  keyCensus[label]!.citations += 1;
  keyCensus[label]!.occurrences += occurrences;
};

for (const row of distinct) {
  const gate = canonicalKeyFor(row.normalised_citation);
  if (gate.refused) {
    verdicts.set(row.normalised_citation, { key: null, state: 'REFUSED', holder: null, holderCount: 0, resolutionPath: 'NONE', why: gate.why });
    bump(`REFUSED:${gate.why.replace(/\s*\(.*$/, '')}`, row.occurrences);
    continue;
  }
  const byJudgment = holders.get(gate.key);
  const holderIds = byJudgment ? [...byJudgment.keys()] : [];
  if (holderIds.some((id) => dirty.has(id))) {
    verdicts.set(row.normalised_citation, { key: gate.key, state: 'UNTESTABLE_STALE_INDEX', holder: null, holderCount: holderIds.length, resolutionPath: 'NONE', why: 'a claimant of this key is in citation_key_dirty' });
    bump('UNTESTABLE_STALE_INDEX', row.occurrences);
    continue;
  }
  if (holderIds.length === 0) {
    verdicts.set(row.normalised_citation, { key: gate.key, state: 'TARGET_NOT_HELD', holder: null, holderCount: 0, resolutionPath: 'NONE', why: 'no judgment in the corpus claims this key' });
    bump('TARGET_NOT_HELD', row.occurrences);
    continue;
  }
  if (holderIds.length > 1) {
    verdicts.set(row.normalised_citation, { key: gate.key, state: 'AMBIGUOUS', holder: null, holderCount: holderIds.length, resolutionPath: 'NONE', why: `${holderIds.length} judgments claim this key` });
    bump('AMBIGUOUS', row.occurrences);
    continue;
  }
  const holder = holderIds[0]!;
  verdicts.set(row.normalised_citation, {
    key: gate.key,
    state: 'UNIQUE',
    holder,
    holderCount: 1,
    resolutionPath: [...byJudgment!.get(holder)!].sort().join('+'),
    why: null,
  });
  bump('UNIQUE', row.occurrences);
}

// ---------------------------------------------------------------------------
// 3. Occurrence pass. Self-identity is excluded here — it needs no text.
// ---------------------------------------------------------------------------

type Pending = { id: string; citing: string; norm: string; raw: string; offset: number };
const occurrenceCensus: Record<string, number> = {};
const tick = (label: string): void => {
  occurrenceCensus[label] = (occurrenceCensus[label] ?? 0) + 1;
};

const pending: Pending[] = [];
let occurrencesSeen = 0;
for await (const rows of sql
  .unsafe(
    `select id::text, citing_judgment_id::text as citing, normalised_citation as norm,
            citation_text as raw, char_offset as "offset"
       from judgment_citations where cited_judgment_id is null`,
  )
  .cursor(100_000)) {
  for (const row of rows as unknown as Pending[]) {
    occurrencesSeen += 1;
    const verdict = verdicts.get(row.norm)!;
    if (verdict.state !== 'UNIQUE') {
      tick(verdict.state === 'REFUSED' ? `EXCLUDED_REFUSED` : `EXCLUDED_${verdict.state}`);
      noteWatched(row.citing, `EXCLUDED_${verdict.state}`);
      continue;
    }
    if (quarantine.has(row.citing) || quarantine.has(verdict.holder!)) {
      tick('UNTESTABLE_AMBIGUOUS_SOURCE_OWNERSHIP');
      noteWatched(row.citing, 'UNTESTABLE_AMBIGUOUS_SOURCE_OWNERSHIP');
      continue;
    }
    if (row.citing === verdict.holder) {
      tick('EXCLUDED_SELF_CITATION');
      noteWatched(row.citing, 'EXCLUDED_SELF_CITATION');
      continue;
    }
    pending.push(row);
  }
}
const guardInputs = pending.length;

// ---------------------------------------------------------------------------
// 4. The page-furniture guard, on real text. One window per occurrence.
// ---------------------------------------------------------------------------

if (existsSync(POPULATION_FILE)) rmSync(POPULATION_FILE);
pending.sort((a, b) => (a.citing < b.citing ? -1 : a.citing > b.citing ? 1 : a.id < b.id ? -1 : 1));

const CONTEXT_BEFORE = 80;
const CONTEXT_AFTER = 200;
const BATCH = 4_000;
type CourtRow = { id: string; court: string | null; text_quality: number | null; script_quality: string | null; content_hash: string | null; source_url: string | null };

const courtCache = new Map<string, CourtRow>();
const candidateHashes: string[] = [];
/**
 * The population file runs to about 1.7 GB, which is past what Node will hold in
 * one string. Both hashes are therefore folded as the rows are written: the
 * population hash over the sorted per-row hashes (order-independent identity),
 * and the file hash streamed byte by byte as each buffer is appended.
 */
const fileDigest = createHash('sha256');
let blockedFurniture = 0;
let unreadableSource = 0;
let allowed = 0;
let crossCourt = 0;
let unknownCourt = 0;
let buffer = '';

for (let start = 0; start < pending.length; start += BATCH) {
  const slice = pending.slice(start, start + BATCH);
  const ids = slice.map((row) => row.id);
  const windows = (await sql.unsafe(
    `select jc.id::text,
            substr(j.full_text, greatest(1, jc.char_offset - $2 + 1),
                   $2 + length(jc.citation_text) + $3) as win,
            greatest(1, jc.char_offset - $2 + 1) as win_from,
            j.court as citing_court, j.content_hash as citing_hash, j.source_url as citing_source,
            j.text_quality as citing_text_quality, j.script_quality as citing_script_quality
       from judgment_citations jc join judgments j on j.id = jc.citing_judgment_id
      where jc.id = any($1::uuid[])`,
    [ids, CONTEXT_BEFORE, CONTEXT_AFTER],
  )) as Array<{
    id: string; win: string | null; win_from: number;
    citing_court: string | null; citing_hash: string | null; citing_source: string | null;
    citing_text_quality: number | null; citing_script_quality: string | null;
  }>;
  const windowById = new Map(windows.map((row) => [row.id, row]));

  const targetIds = [...new Set(slice.map((row) => verdicts.get(row.norm)!.holder!))].filter((id) => !courtCache.has(id));
  if (targetIds.length > 0) {
    const targets = (await sql.unsafe(
      `select id::text, court, text_quality, script_quality, content_hash, source_url from judgments where id = any($1::uuid[])`,
      [targetIds],
    )) as CourtRow[];
    for (const row of targets) courtCache.set(row.id, row);
  }

  for (const row of slice) {
    const verdict = verdicts.get(row.norm)!;
    const win = windowById.get(row.id);
    if (!win || win.win === null) {
      // The source text cannot be read, so the guard cannot run. That is not a
      // reason to allow the edge — it is a reason to call it untestable.
      unreadableSource += 1;
      tick('UNTESTABLE_DAMAGED_SOURCE');
      noteWatched(row.citing, 'UNTESTABLE_DAMAGED_SOURCE');
      continue;
    }
    const localOffset = row.offset + 1 - Number(win.win_from);
    const disposition = classifyCitationGraphOccurrence(win.win, {
      raw: row.raw,
      normalised: row.norm,
      offset: localOffset,
    });
    if (disposition === 'COMMON_ORDER_PAGE_FURNITURE') {
      blockedFurniture += 1;
      tick('EXCLUDED_COMMON_ORDER_PAGE_FURNITURE');
      noteWatched(row.citing, 'EXCLUDED_COMMON_ORDER_PAGE_FURNITURE');
      continue;
    }
    const target = courtCache.get(verdict.holder!);
    const citingCourt = win.citing_court ?? 'UNKNOWN';
    const targetCourt = target?.court ?? 'UNKNOWN';
    if (citingCourt === 'UNKNOWN' || targetCourt === 'UNKNOWN') unknownCourt += 1;
    else if (citingCourt !== targetCourt) crossCourt += 1;

    // The window is what the guard actually read. It is kept as a hash, not as
    // text: an evidence pointer that cannot be checked is an assertion, and a
    // 1.5-million-row artifact carrying prose is not one anybody would check.
    const candidate = {
      occurrenceId: row.id,
      sourceJudgmentId: row.citing,
      targetJudgmentId: verdict.holder,
      rawToken: row.raw,
      canonicalKey: verdict.key,
      normalisedCitation: row.norm,
      sourceCharOffset: row.offset,
      sourceSpanChars: row.raw.length,
      sourceWindowSha256: sha(win.win).slice(0, 32),
      sourceArtifact: win.citing_source ?? 'UNKNOWN',
      sourceContentHash: win.citing_hash ?? 'UNKNOWN',
      targetArtifact: target?.source_url ?? 'UNKNOWN',
      targetContentHash: target?.content_hash ?? 'UNKNOWN',
      resolutionPath: verdict.resolutionPath,
      aliasUsed: verdict.resolutionPath.includes('alias'),
      graphDisposition: disposition,
      sourceCourt: citingCourt,
      targetCourt: targetCourt,
      crossCourt: citingCourt !== 'UNKNOWN' && targetCourt !== 'UNKNOWN' ? citingCourt !== targetCourt : 'UNKNOWN',
      sourceTextQuality: win.citing_text_quality ?? 'UNKNOWN',
      sourceScriptQuality: win.citing_script_quality ?? 'UNKNOWN',
      writerPath: 'NEW2_R24_CANDIDATE_GENERATOR_READ_ONLY',
      relationship: 'UNKNOWN',
    };
    allowed += 1;
    tick('EDGE_CANDIDATE');
    noteWatched(row.citing, 'ADMITTED_AS_EDGE_CANDIDATE');
    const line = JSON.stringify(candidate);
    candidateHashes.push(sha(line));
    buffer += `${line}\n`;
  }
  if (buffer.length > 4_000_000) {
    appendFileSync(POPULATION_FILE, buffer);
    fileDigest.update(buffer);
    buffer = '';
  }
  // Checkpointed, because a 1.5-million-row pass that only writes at the end is
  // a pass that loses everything to one teardown.
  if (start % 100_000 === 0) {
    writeJson('.edge-guard-progress.json', {
      artifact: 'NEW2_R24_EDGE_GUARD_PROGRESS',
      at: new Date().toISOString(),
      done: start,
      total: pending.length,
      allowed,
      blockedFurniture,
      unreadableSource,
    });
  }
}
if (buffer.length > 0) {
  appendFileSync(POPULATION_FILE, buffer);
  fileDigest.update(buffer);
}
process.stdout.write('\n');

// ---------------------------------------------------------------------------
// 5. The falsifier. The fixture set AND the two real Meghalaya documents.
// ---------------------------------------------------------------------------

type Fixture = { id: string; category: string; text: string; token: string; sourceId: string; targetId: string; expected: 'ALLOW' | 'BLOCK'; reason: string };
const fixtures = readJson<{ fixtures: Fixture[] }>(join(R21, 'edge-guard-adversarial-set.json')).fixtures;
const fixtureResults = fixtures.map((fixture) => {
  const offset = fixture.text.indexOf(fixture.token);
  const selfIdentity = fixture.sourceId === fixture.targetId;
  const disposition = selfIdentity
    ? 'CANONICAL_SELF_IDENTITY'
    : classifyCitationGraphOccurrence(fixture.text, { raw: fixture.token, normalised: fixture.token, offset });
  const prediction = disposition === 'OUTGOING_CITATION_CANDIDATE' ? 'ALLOW' : 'BLOCK';
  return { ...fixture, offset, disposition, prediction, correct: prediction === fixture.expected };
});

const liveFalsePins: Array<Record<string, unknown>> = [];
for (const item of falsePinCases) {
  const [row] = (await sql.unsafe(`select full_text from judgments where id = $1::uuid`, [item.sourceJudgmentId])) as Array<{ full_text: string | null }>;
  const text = row?.full_text ?? '';
  const offset = text.indexOf(item.newToken);
  const disposition = offset < 0 ? 'TOKEN_NOT_FOUND' : classifyCitationGraphOccurrence(text, { raw: item.newToken, normalised: item.newToken, offset });
  const outcomes = watchedOutcomes.get(item.sourceJudgmentId) ?? [];
  liveFalsePins.push({
    sourceJudgmentId: item.sourceJudgmentId,
    token: item.newToken,
    tokenFound: offset >= 0,
    offset,
    disposition,
    blocked: disposition === 'COMMON_ORDER_PAGE_FURNITURE',
    // OBSERVED, not asserted: every stored occurrence this judgment produced,
    // and what the pass did with it.
    storedOccurrenceOutcomes: outcomes,
    admittedOccurrences: outcomes.filter((outcome) => outcome === 'ADMITTED_AS_EDGE_CANDIDATE').length,
    inCandidatePopulation: outcomes.includes('ADMITTED_AS_EDGE_CANDIDATE'),
  });
}
const meghalayaBlocked = liveFalsePins.filter((row) => row['blocked'] === true).length;

const wronglyBlocked = fixtureResults.filter((row) => row.expected === 'ALLOW' && row.prediction === 'BLOCK');
const falsePinsSurviving = fixtureResults.filter((row) => row.expected === 'BLOCK' && row.prediction === 'ALLOW');

// ---------------------------------------------------------------------------
// 6. Nothing was written. Counted again, on the same read-only session.
// ---------------------------------------------------------------------------

const edgesAfter = await edgeCensus();
const aliasesAfter = await aliasCensus();
await sql.end({ timeout: 5 });

const edgesChanged = edgesBefore['edges'] !== edgesAfter['edges'] || edgesBefore['unresolved'] !== edgesAfter['unresolved'] || edgesBefore['newest'] !== edgesAfter['newest'];
const aliasesChanged = aliasesBefore['aliases'] !== aliasesAfter['aliases'] || aliasesBefore['hash'] !== aliasesAfter['hash'];

// ---------------------------------------------------------------------------
// 7. Freeze.
// ---------------------------------------------------------------------------

candidateHashes.sort();
const populationHash = sha(candidateHashes.join('\n'));
const populationId = `NEW2-R24-EDGE-CANDIDATE-${populationHash.slice(0, 16)}`;
const populationBytes = existsSync(POPULATION_FILE) ? statSync(POPULATION_FILE).size : 0;
const populationFileHash = allowed > 0 ? fileDigest.digest('hex') : 'EMPTY';

const untestable =
  (occurrenceCensus['UNTESTABLE_STALE_INDEX'] ?? 0) +
  (occurrenceCensus['EXCLUDED_UNTESTABLE_STALE_INDEX'] ?? 0) +
  (occurrenceCensus['UNTESTABLE_AMBIGUOUS_SOURCE_OWNERSHIP'] ?? 0) +
  (occurrenceCensus['UNTESTABLE_DAMAGED_SOURCE'] ?? 0);

const watchedAdmitted = liveFalsePins.filter((row) => row['inCandidatePopulation'] === true).length;
const ready =
  falsePinsSurviving.length === 0 &&
  wronglyBlocked.length === 0 &&
  meghalayaBlocked === liveFalsePins.length &&
  watchedAdmitted === 0 &&
  !edgesChanged &&
  !aliasesChanged;

writeJson('edge-candidate-population.json', {
  artifact: 'NEW2_R24_EDGE_CANDIDATE_POPULATION',
  populationId,
  populationHash,
  derivedFrom: {
    canonicalCorrection: 'NEW2-R24 PHASE A, COMMITTED',
    reusedPriorPopulation: false,
    priorPopulationsConsidered: ['R19', 'R20', 'R21', 'R22'],
    note: 'Generated from the corpus as it stands after the 539 corrections. No R19-R22 edge-apply population was read.',
  },
  generatedAt: new Date().toISOString(),
  session: { mode: 'READ_ONLY', proof: readOnlyProof },
  frontier: { citationKeyFrontier: frontier, judgmentFrontier },
  resolutionIndex: {
    keyRows: keyRows.length,
    distinctKeys: holders.size,
    dirtyJudgments: dirty.size,
    dirtyReasons: [...new Set(dirtyRows.map((row) => row.reason))].sort(),
    quarantinedJudgments: quarantine.size,
  },
  keyLevelCensus: keyCensus,
  occurrenceCensus,
  occurrencesExamined: occurrencesSeen,
  guardInputs,
  candidates: allowed,
  populationFile: {
    path: 'docs/ai/new2-r24/edge-candidate-population.jsonl',
    committed: false,
    reason: 'row-level artifact, gitignored per the repository convention; identified by sha256 and line count',
    lines: allowed,
    bytes: populationBytes,
    sha256: populationFileHash,
  },
  evidenceFields: [
    'occurrenceId', 'sourceJudgmentId', 'targetJudgmentId', 'rawToken', 'canonicalKey', 'normalisedCitation',
    'sourceCharOffset', 'sourceSpanChars', 'sourceWindowSha256', 'sourceArtifact', 'sourceContentHash',
    'targetArtifact', 'targetContentHash', 'resolutionPath', 'aliasUsed', 'graphDisposition',
    'sourceCourt', 'targetCourt', 'crossCourt', 'sourceTextQuality', 'sourceScriptQuality', 'writerPath', 'relationship',
  ],
  unknownsPreserved: {
    relationship: 'UNKNOWN on every candidate — a treatment is a legal reading, not a string match',
    courtUnknownOnEitherSide: unknownCourt,
    crossCourtCandidates: crossCourt,
  },
  mutation: { edges: 0, aliases: 0, canonicalRows: 0, migrations: 0, network: false },
});

writeJson('edge-falsifier.json', {
  artifact: 'NEW2_R24_EDGE_INTERNAL_FALSIFIER',
  populationId,
  candidateEdges: allowed,
  excludedSelfCitation: occurrenceCensus['EXCLUDED_SELF_CITATION'] ?? 0,
  excludedCommonOrderPageFurniture: blockedFurniture,
  excludedTargetNotHeld: occurrenceCensus['EXCLUDED_TARGET_NOT_HELD'] ?? 0,
  excludedRefused: occurrenceCensus['EXCLUDED_REFUSED'] ?? 0,
  ambiguous: occurrenceCensus['EXCLUDED_AMBIGUOUS'] ?? 0,
  untestable,
  untestableBreakdown: {
    staleIndex: occurrenceCensus['EXCLUDED_UNTESTABLE_STALE_INDEX'] ?? 0,
    ambiguousSourceOwnership: occurrenceCensus['UNTESTABLE_AMBIGUOUS_SOURCE_OWNERSHIP'] ?? 0,
    damagedSource: unreadableSource,
  },
  knownFalsePins: {
    meghalayaClasses: liveFalsePins.length,
    blocked: meghalayaBlocked,
    cases: liveFalsePins,
    survivingInPopulation: liveFalsePins.length - meghalayaBlocked,
    admittedIntoCandidatePopulation: watchedAdmitted,
  },
  adversarialFixtures: {
    total: fixtureResults.length,
    correct: fixtureResults.filter((row) => row.correct).length,
    trueEdgesWronglyRejected: wronglyBlocked.length,
    falsePinsSurviving: falsePinsSurviving.length,
    results: fixtureResults.map((entry) => ({
      id: entry.id,
      category: entry.category,
      token: entry.token,
      offset: entry.offset,
      expected: entry.expected,
      disposition: entry.disposition,
      prediction: entry.prediction,
      correct: entry.correct,
    })),
  },
  forbiddenSignals: ['court similarity', 'date similarity', 'title similarity', 'party similarity', 'semantic similarity'],
  readyForIndependentAudit: ready ? 'YES' : 'NO',
});

writeJson('zero-mutation-proof.json', {
  artifact: 'NEW2_R24_ZERO_EDGE_MUTATION_PROOF',
  session: { mode: 'READ_ONLY', proof: readOnlyProof },
  edges: { before: edgesBefore, after: edgesAfter, changed: edgesChanged },
  aliases: { before: aliasesBefore, after: aliasesAfter, changed: aliasesChanged },
  edgesChangedByR24: edgesChanged ? 'NON_ZERO' : 0,
  aliasesChangedByR24: aliasesChanged ? 'NON_ZERO' : 0,
  citationBulkApply: 'HOLD',
});

console.log(`EDGE_CANDIDATE_POPULATION_ID  ${populationId}`);
console.log(`EDGE_CANDIDATE_HASH           ${populationHash}`);
console.log(`OCCURRENCES_EXAMINED          ${occurrencesSeen}`);
console.log(`EDGE_CANDIDATES               ${allowed}`);
console.log(`EXCLUDED_SELF                 ${occurrenceCensus['EXCLUDED_SELF_CITATION'] ?? 0}`);
console.log(`EXCLUDED_FURNITURE            ${blockedFurniture}`);
console.log(`EDGE_AMBIGUOUS                ${occurrenceCensus['EXCLUDED_AMBIGUOUS'] ?? 0}`);
console.log(`EDGE_UNTESTABLE               ${untestable}`);
console.log(`KNOWN_FALSE_PINS              ${liveFalsePins.length - meghalayaBlocked}`);
console.log(`TRUE_EDGES_WRONGLY_REJECTED   ${wronglyBlocked.length}`);
console.log(`EDGES_CHANGED_BY_R24          ${edgesChanged ? 'NON_ZERO' : 0}`);
console.log(`ALIASES_CHANGED_BY_R24        ${aliasesChanged ? 'NON_ZERO' : 0}`);
console.log(`READY_FOR_INDEPENDENT_AUDIT   ${ready ? 'YES' : 'NO'}`);
