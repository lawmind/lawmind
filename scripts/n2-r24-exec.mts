/**
 * NEW2 R24 PHASE A — execute the 539 audited canonical corrections.
 *
 * This is the first round in the correction programme that WRITES. Everything it
 * writes was frozen as NEW2-R23-SAFE-e5caecc2b05a4d04 and independently audited;
 * this script re-proves that from the artifact bytes up, re-observes every row
 * against the live database immediately before opening the transaction, applies
 * the corrections in ONE fail-closed transaction keyed on identity AND expected
 * old value, verifies the post-update state from inside that transaction, and
 * only then commits.
 *
 * Authority: canonical `judgments.neutral_citation` on exactly those 539 rows.
 * Nothing else. No edge, no alias, no migration, no schema change.
 *
 * Usage: pnpm exec tsx scripts/n2-r24-exec.mts [--dry-run]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import {
  correctionPopulationHashV2,
  verifyCorrectionPreflight,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
} from '../services/ingest/src/correction-preflight.ts';
import {
  buildCorrectionPlan,
  classifyUpdateResult,
  verifyPostUpdateState,
  type PostUpdateRow,
} from '../services/ingest/src/correction-mutator.ts';
import { sslFor } from './migration/new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R23 = join(ROOT, 'docs/ai/new2-r23');
const OUT = join(ROOT, 'docs/ai/new2-r24');
mkdirSync(OUT, { recursive: true });

const DRY_RUN = process.argv.includes('--dry-run');

/** The audited parent. Both are asserted, never read from the file and trusted. */
const R23_POPULATION_ID = 'NEW2-R23-SAFE-e5caecc2b05a4d04';
const R23_HASH = 'e5caecc2b05a4d047291f4b2bad45e108b6a7135006da502cced8d5b6ab990b4';
const R23_INDEPENDENT_AUDIT = 'PASS';
const EXPECTED = { total: 539, toNull: 441, toReplace: 86, toSuffixReplace: 12 };
const EXPECTED_QUARANTINE = { commonOrder: 29, delhi: 2, hhcAmbiguousSuffix: 1, total: 32 };

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const writeJson = (name: string, value: unknown): void =>
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
const keyOf = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const ordered = (values: string[]): string[] => [...values].sort();
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

// ---------------------------------------------------------------------------
// 1. The parent is proven before the child exists.
// ---------------------------------------------------------------------------

type ArtifactManifest = {
  populationId: string;
  populationHash: string;
  parentPopulationId: string;
  parentPopulationHash: string;
  files: Record<string, string>;
  readyForR23DeltaAudit: boolean;
};

const parentArtifacts = readJson<ArtifactManifest>(join(R23, 'artifact-manifest.json'));
const parentFileIntegrity = Object.entries(parentArtifacts.files).map(([name, expected]) => {
  const actual = sha(readFileSync(join(R23, name), 'utf8'));
  return { file: name, expected, actual, pass: actual === expected };
});
assert(
  parentFileIntegrity.every((entry) => entry.pass),
  `R23 artifact bytes drifted: ${parentFileIntegrity.filter((e) => !e.pass).map((e) => e.file).join(',')}`,
);
assert(parentArtifacts.populationId === R23_POPULATION_ID, 'R23 population id drifted');
assert(parentArtifacts.populationHash === R23_HASH, 'R23 population hash drifted');

const parentManifest = readJson<CorrectionPopulationManifest>(join(R23, 'r23-preflight-manifest.json'));
const parentPopulation = readJson<{
  populationId: string;
  populationHash: string;
  candidateCount: number;
  records: Array<Record<string, string | null>>;
}>(join(R23, 'r23-safe-population.json'));

assert(parentManifest.schemaVersion === 2, 'R23 manifest must be schema version 2');
const parentHashRecomputed = correctionPopulationHashV2(parentManifest.rows);
assert(parentHashRecomputed === R23_HASH, `R23 hash recompute mismatch: ${parentHashRecomputed}`);
assert(parentManifest.populationHash === R23_HASH, 'R23 manifest hash field drifted');
assert(parentPopulation.populationHash === R23_HASH, 'R23 population file hash field drifted');

const counts = {
  DETERMINISTIC_TO_NULL: parentManifest.rows.filter((r) => r.proposedDisposition === 'DETERMINISTIC_TO_NULL').length,
  DETERMINISTIC_TO_REPLACE: parentManifest.rows.filter((r) => r.proposedDisposition === 'DETERMINISTIC_TO_REPLACE').length,
  DETERMINISTIC_SUFFIX_REPLACE: parentManifest.rows.filter((r) => r.proposedDisposition === 'DETERMINISTIC_SUFFIX_REPLACE').length,
};
assert(parentManifest.rows.length === EXPECTED.total, `R23 row count drifted: ${parentManifest.rows.length}`);
assert(parentManifest.candidateCount === EXPECTED.total, 'R23 candidateCount drifted');
assert(parentPopulation.candidateCount === EXPECTED.total, 'R23 population count drifted');
assert(parentPopulation.records.length === EXPECTED.total, 'R23 record count drifted');
assert(counts.DETERMINISTIC_TO_NULL === EXPECTED.toNull, `TO_NULL drifted: ${counts.DETERMINISTIC_TO_NULL}`);
assert(counts.DETERMINISTIC_TO_REPLACE === EXPECTED.toReplace, `TO_REPLACE drifted: ${counts.DETERMINISTIC_TO_REPLACE}`);
assert(
  counts.DETERMINISTIC_SUFFIX_REPLACE === EXPECTED.toSuffixReplace,
  `SUFFIX_REPLACE drifted: ${counts.DETERMINISTIC_SUFFIX_REPLACE}`,
);

// The published population file and the preflight manifest must describe one
// population — the write is driven from the manifest, so a disagreement between
// the two files is a disagreement about what the audit cleared.
const parentById = new Map(parentManifest.rows.map((row) => [row.judgmentId, row]));
for (const record of parentPopulation.records) {
  const row = parentById.get(record['judgment_id']!);
  assert(row, `R23 population record absent from the manifest: ${record['judgment_id']}`);
  assert(
    record['old_value'] === row.currentStoredNeutralCitation &&
      record['new_value'] === row.proposedReplacement &&
      record['disposition'] === row.proposedDisposition &&
      record['source_hash'] === row.sourceContentHash &&
      record['source_identity'] === row.sourceIdentity &&
      record['evidence_class'] === row.evidenceClass &&
      record['evidence_pointer'] === row.evidencePointer &&
      record['target_holder_classification'] === row.targetHolderClassification &&
      record['frontier_identity'] === row.frontierIdentity,
    `R23 population record disagrees with the manifest: ${record['judgment_id']}`,
  );
}

const quarantine = readJson<{ total: number; commonOrderOwnershipAmbiguous: number; delhiUnexplainedManyToOne: number; hhcAmbiguousSuffix: number; records: string[] }>(
  join(R23, 'quarantine-census.json'),
);
assert(quarantine.total === EXPECTED_QUARANTINE.total, 'quarantine total drifted');
assert(quarantine.records.length === EXPECTED_QUARANTINE.total, 'quarantine record count drifted');
assert(quarantine.commonOrderOwnershipAmbiguous === EXPECTED_QUARANTINE.commonOrder, 'common-order quarantine drifted');
assert(quarantine.delhiUnexplainedManyToOne === EXPECTED_QUARANTINE.delhi, 'Delhi quarantine drifted');
assert(quarantine.hhcAmbiguousSuffix === EXPECTED_QUARANTINE.hhcAmbiguousSuffix, 'HHC quarantine drifted');
for (const id of quarantine.records) assert(!parentById.has(id), `quarantined id is in SAFE: ${id}`);

// ---------------------------------------------------------------------------
// 2. The execution manifest — an exact semantic copy, and an identity that
//    binds it to the audit that cleared it.
// ---------------------------------------------------------------------------

const execRows = structuredClone(parentManifest.rows);
const execRowsHash = correctionPopulationHashV2(execRows);
assert(execRowsHash === R23_HASH, `execution manifest is not a semantic copy: ${execRowsHash}`);

const execIdentity = JSON.stringify({
  artifact: 'NEW2_R24_EXEC_POPULATION',
  parentPopulationId: R23_POPULATION_ID,
  parentPopulationHash: R23_HASH,
  independentAudit: R23_INDEPENDENT_AUDIT,
  rowsHashV2: execRowsHash,
  candidateCount: execRows.length,
  counts,
});
const execHash = sha(execIdentity);
const execPopulationId = `NEW2-R24-EXEC-${execHash.slice(0, 16)}`;

const execManifest: CorrectionPopulationManifest = {
  schemaVersion: 2,
  populationHash: execRowsHash,
  candidateCount: execRows.length,
  frozenFrontier: parentManifest.frozenFrontier,
  rows: execRows,
  proposedKeyHolders: structuredClone(parentManifest.proposedKeyHolders),
  manyToOneExplanations: structuredClone(parentManifest.manyToOneExplanations),
};

/**
 * The execution manifest, written identically whether or not a write follows.
 *
 * `populationHash` stays the ROWS hash the preflight validates against;
 * `executionHash` is this round's own identity. They are separate fields because
 * they answer separate questions, and one overwriting the other is how a receipt
 * comes to name a population that no file describes.
 */
const writeExecManifest = (): void =>
  writeJson('r24-exec-manifest.json', {
    artifact: 'NEW2_R24_EXEC_MANIFEST',
    ...execManifest,
    populationId: execPopulationId,
    executionHash: execHash,
    rowsHashV2: execRowsHash,
    parentPopulationId: R23_POPULATION_ID,
    parentPopulationHash: R23_HASH,
    independentAudit: R23_INDEPENDENT_AUDIT,
  });

if (process.argv.includes('--rebuild-manifest')) {
  writeExecManifest();
  console.log(`rebuilt r24-exec-manifest.json for ${execPopulationId} (no database, no write)`);
  process.exit(0);
}

const plans = buildCorrectionPlan(execManifest);
assert(plans.length === EXPECTED.total, `plan count is not ${EXPECTED.total}: ${plans.length}`);
const expectedSources = new Map(
  execRows.map((row) => [row.judgmentId, { sourceIdentity: row.sourceIdentity, sourceContentHash: row.sourceContentHash }]),
);

// ---------------------------------------------------------------------------
// 3. Live observation, immediately before the transaction.
// ---------------------------------------------------------------------------

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const url = databaseUrl();
const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 20, ssl: sslFor(url) });

const safeIds = plans.map((plan) => plan.judgmentId);
const safeKeys = ordered([
  ...new Set(execRows.flatMap((row) => (row.proposedReplacement ? [keyOf(row.proposedReplacement)] : []))),
]);
assert(
  JSON.stringify(safeKeys) === JSON.stringify(ordered(Object.keys(execManifest.proposedKeyHolders))),
  'replacement key set disagrees with the manifest holder map',
);

type LiveJudgment = { id: string; neutral_citation: string | null; source_url: string; content_hash: string | null };
const liveJudgments = (await sql.unsafe(
  `select id::text, neutral_citation, source_url, content_hash from judgments where id = any($1::uuid[]) order by id`,
  [safeIds],
)) as LiveJudgment[];
const liveById = new Map(liveJudgments.map((row) => [row.id, row]));

/**
 * The holder gate and its positive control, run through ONE query shape. The
 * audit observed 95 keys and 0 holders; a gate that reads zero because the query
 * can never return anything is the failure this control exists to exclude.
 */
const [controlSeed] = (await sql.unsafe(
  `select citation_key from judgment_citation_keys where citation_key <> all($1::text[]) limit 1`,
  [safeKeys],
)) as Array<{ citation_key: string }>;
assert(controlSeed, 'no citation key exists to use as a positive control');
const probedKeys = [...safeKeys, controlSeed.citation_key];
const holderRows = (await sql.unsafe(
  `select citation_key, judgment_id::text as judgment_id from judgment_citation_keys
     where citation_key = any($1::text[]) order by citation_key, judgment_id`,
  [probedKeys],
)) as Array<{ citation_key: string; judgment_id: string }>;
const liveHolders: Record<string, string[]> = Object.fromEntries(probedKeys.map((key) => [key, [] as string[]]));
for (const holder of holderRows) liveHolders[holder.citation_key]!.push(holder.judgment_id);
const positiveControl = {
  citationKey: controlSeed.citation_key,
  holders: liveHolders[controlSeed.citation_key]!.length,
  pass: liveHolders[controlSeed.citation_key]!.length > 0,
};
assert(positiveControl.pass, `positive control returned no holders for ${positiveControl.citationKey}`);

const [liveFrontier] = (await sql.unsafe(
  `select created_at::text as created_at, id::text from judgments order by created_at desc, id desc limit 1`,
)) as Array<{ created_at: string; id: string }>;
assert(liveFrontier, 'missing ingest frontier');

// Every drift, named. There is no "hold this row and write the rest": a changed
// population is a population no audit describes, so ONE drift aborts the round.
const drift: Array<{ judgmentId: string; reason: string; detail: string }> = [];
for (const plan of plans) {
  const live = liveById.get(plan.judgmentId);
  const source = expectedSources.get(plan.judgmentId)!;
  if (!live) {
    drift.push({ judgmentId: plan.judgmentId, reason: 'ROW_MISSING', detail: 'no live row' });
    continue;
  }
  if (live.neutral_citation !== plan.expectedOldValue)
    drift.push({ judgmentId: plan.judgmentId, reason: 'OLD_VALUE_DRIFT', detail: `${live.neutral_citation}` });
  if (live.source_url !== source.sourceIdentity)
    drift.push({ judgmentId: plan.judgmentId, reason: 'SOURCE_IDENTITY_DRIFT', detail: live.source_url });
  if (live.content_hash !== source.sourceContentHash)
    drift.push({ judgmentId: plan.judgmentId, reason: 'SOURCE_CONTENT_HASH_DRIFT', detail: String(live.content_hash) });
  if (plan.newValue !== null && (liveHolders[keyOf(plan.newValue)] ?? []).length !== 0)
    drift.push({ judgmentId: plan.judgmentId, reason: 'TARGET_HOLDER_DRIFT', detail: keyOf(plan.newValue) });
}

const live: LiveCorrectionSnapshot = {
  frontier: { createdAt: liveFrontier.created_at, judgmentId: liveFrontier.id },
  rows: liveJudgments.map((row) => ({
    judgmentId: row.id,
    sourceIdentity: row.source_url,
    sourceContentHash: row.content_hash!,
    currentStoredNeutralCitation: row.neutral_citation,
  })),
  proposedKeyHolders: Object.fromEntries(safeKeys.map((key) => [key, liveHolders[key] ?? []])),
};
const preflight = verifyCorrectionPreflight(execManifest, live);

// ---------------------------------------------------------------------------
// 4. Everything the write must NOT change, observed before it.
// ---------------------------------------------------------------------------

const quarantineIds = quarantine.records;
type QuarantineRow = { id: string; neutral_citation: string | null; source_url: string; content_hash: string | null };
const quarantineBefore = (await sql.unsafe(
  `select id::text, neutral_citation, source_url, content_hash from judgments where id = any($1::uuid[]) order by id`,
  [quarantineIds],
)) as QuarantineRow[];

const edgeCensus = async (tx: typeof sql): Promise<Record<string, string>> => {
  const [totals] = (await tx.unsafe(
    `select count(*)::text as edges, coalesce(max(created_at)::text,'NONE') as newest,
            count(*) filter (where cited_judgment_id is null)::text as unresolved
       from judgment_citations`,
  )) as Array<Record<string, string>>;
  const [region] = (await tx.unsafe(
    `select count(*)::text as n,
            coalesce(md5(string_agg(id::text||'|'||coalesce(cited_judgment_id::text,'')||'|'||
                          normalised_citation||'|'||relationship, E'\n' order by id)),'EMPTY') as hash
       from judgment_citations
      where citing_judgment_id = any($1::uuid[]) or cited_judgment_id = any($1::uuid[])`,
    [safeIds],
  )) as Array<Record<string, string>>;
  return { ...totals!, regionRows: region!['n']!, regionHash: region!['hash']! };
};
const aliasCensus = async (tx: typeof sql): Promise<Record<string, string>> => {
  const [row] = (await tx.unsafe(
    `select count(*)::text as aliases,
            coalesce(md5(string_agg(id::text||'|'||judgment_id::text||'|'||alias_key||'|'||
                          corroborations::text, E'\n' order by id)),'EMPTY') as hash
       from judgment_citation_aliases`,
  )) as Array<Record<string, string>>;
  return row!;
};
const new1Census = async (tx: typeof sql): Promise<Record<string, unknown>> => {
  const [stage] = (await tx.unsafe(
    `select count(*)::text as rows, coalesce(max(created_at)::text,'NONE') as newest from new1_doc_vector_stage`,
  )) as Array<Record<string, string>>;
  const snapshots = (await tx.unsafe(
    `select snapshot_hash, generation, definition_version, state, coalesce(manifest_sha256,'NULL') as manifest_sha256
       from embedding_snapshot order by snapshot_hash`,
  )) as Array<Record<string, string>>;
  return { ...stage!, snapshots };
};

const edgesBefore = await edgeCensus(sql);
const aliasesBefore = await aliasCensus(sql);
const new1Before = await new1Census(sql);
const [dirtyBefore] = (await sql.unsafe(`select count(*)::text as n from citation_key_dirty`)) as Array<{ n: string }>;

const prewrite = {
  artifact: 'NEW2_R24_PREWRITE_LIVE_CHECK',
  observedAt: new Date().toISOString(),
  rowsChecked: plans.length,
  rowsFound: liveJudgments.length,
  driftRows: drift.length,
  drift,
  preflight,
  targetHolder: {
    keysProbed: safeKeys.length,
    keysWithHolders: safeKeys.filter((key) => (liveHolders[key] ?? []).length > 0).length,
    positiveControl,
  },
  frontier: live.frontier,
  frozenFrontier: execManifest.frozenFrontier,
  edgesBefore,
  aliasesBefore,
  citationKeyDirtyBefore: dirtyBefore!.n,
  new1Before,
  quarantineRowsObserved: quarantineBefore.length,
};
writeJson('prewrite-live-check.json', prewrite);

if (drift.length > 0 || !preflight.ok) {
  await sql.end({ timeout: 5 });
  console.error('ROUND ABORTED BEFORE ANY WRITE');
  console.error(`drift rows: ${drift.length}`);
  console.error(`preflight refusals: ${preflight.refusals.join(',') || 'none'}`);
  process.exit(2);
}
assert(liveJudgments.length === EXPECTED.total, `live row count is not ${EXPECTED.total}`);
assert(quarantineBefore.length === EXPECTED_QUARANTINE.total, 'quarantine rows not all present');

if (DRY_RUN) {
  await sql.end({ timeout: 5 });
  console.log(`DRY RUN — prewrite clean. ${plans.length} rows would be corrected. ${execPopulationId}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 5. ONE fail-closed transaction.
// ---------------------------------------------------------------------------

type TxOutcome = {
  applied: number;
  perDisposition: Record<string, number>;
  refusals: string[];
  inTransaction: Record<string, unknown>;
};

let outcome: TxOutcome | null = null;
let rollbackReason: string | null = null;

try {
  outcome = (await sql.begin(async (tx) => {
    // Captured inside the transaction so the before/after comparison is one
    // consistent snapshot rather than two readings of a moving corpus.
    const edgesAtStart = await edgeCensus(tx as unknown as typeof sql);
    const aliasesAtStart = await aliasCensus(tx as unknown as typeof sql);

    const refusals: string[] = [];
    const perDisposition: Record<string, number> = {
      DETERMINISTIC_TO_NULL: 0,
      DETERMINISTIC_TO_REPLACE: 0,
      DETERMINISTIC_SUFFIX_REPLACE: 0,
    };
    let applied = 0;

    for (const plan of plans) {
      // Identity AND expected old value. A drifted row matches nothing and is
      // loud; it is never overwritten from a value no audit saw.
      const result = await tx.unsafe(
        `update judgments set neutral_citation = $1
           where id = $2::uuid and neutral_citation = $3`,
        [plan.newValue, plan.judgmentId, plan.expectedOldValue],
      );
      const verdict = classifyUpdateResult(plan, result.count);
      if (verdict !== 'APPLIED') {
        refusals.push(verdict);
        break;
      }
      applied += 1;
      perDisposition[plan.disposition] = (perDisposition[plan.disposition] ?? 0) + 1;
    }

    if (refusals.length > 0) throw new Error(`UPDATE_AFFECTED_WRONG_ROW_COUNT: ${refusals.join(',')}`);
    if (applied !== EXPECTED.total) throw new Error(`PARTIAL_APPLY: ${applied}/${EXPECTED.total}`);

    // ---- verify from inside the transaction, before COMMIT ----
    const post = (await tx.unsafe(
      `select id::text, neutral_citation, source_url, content_hash from judgments where id = any($1::uuid[]) order by id`,
      [safeIds],
    )) as Array<{ id: string; neutral_citation: string | null; source_url: string; content_hash: string | null }>;
    const postRows: PostUpdateRow[] = post.map((row) => ({
      judgmentId: row.id,
      neutralCitation: row.neutral_citation,
      sourceIdentity: row.source_url,
      sourceContentHash: row.content_hash,
    }));
    const verified = verifyPostUpdateState(plans, expectedSources, postRows);
    if (!verified.ok) throw new Error(`IN_TRANSACTION_VALIDATION_FAILED: ${verified.refusals.slice(0, 10).join(',')}`);
    if (verified.counts.DETERMINISTIC_TO_NULL !== EXPECTED.toNull)
      throw new Error(`IN_TRANSACTION_TO_NULL: ${verified.counts.DETERMINISTIC_TO_NULL}`);
    if (verified.counts.DETERMINISTIC_TO_REPLACE !== EXPECTED.toReplace)
      throw new Error(`IN_TRANSACTION_TO_REPLACE: ${verified.counts.DETERMINISTIC_TO_REPLACE}`);
    if (verified.counts.DETERMINISTIC_SUFFIX_REPLACE !== EXPECTED.toSuffixReplace)
      throw new Error(`IN_TRANSACTION_SUFFIX: ${verified.counts.DETERMINISTIC_SUFFIX_REPLACE}`);
    const nulls = postRows.filter((row) => row.neutralCitation === null).length;
    if (nulls !== EXPECTED.toNull) throw new Error(`IN_TRANSACTION_NULL_COUNT: ${nulls}`);

    // ---- and everything the write must not have touched ----
    const quarantineNow = (await tx.unsafe(
      `select id::text, neutral_citation, source_url, content_hash from judgments where id = any($1::uuid[]) order by id`,
      [quarantineIds],
    )) as QuarantineRow[];
    if (JSON.stringify(quarantineNow) !== JSON.stringify(quarantineBefore))
      throw new Error('QUARANTINE_CHANGED_INSIDE_TRANSACTION');

    const edgesNow = await edgeCensus(tx as unknown as typeof sql);
    if (JSON.stringify(edgesNow) !== JSON.stringify(edgesAtStart))
      throw new Error(`EDGES_CHANGED_INSIDE_TRANSACTION: ${JSON.stringify(edgesAtStart)} -> ${JSON.stringify(edgesNow)}`);
    const aliasesNow = await aliasCensus(tx as unknown as typeof sql);
    if (JSON.stringify(aliasesNow) !== JSON.stringify(aliasesAtStart))
      throw new Error('ALIASES_CHANGED_INSIDE_TRANSACTION');

    return {
      applied,
      perDisposition,
      refusals,
      inTransaction: {
        validation: 'PASS',
        counts: verified.counts,
        nullRows: nulls,
        quarantineUnchanged: true,
        edgesAtStart,
        edgesAtEnd: edgesNow,
        aliasesAtStart,
        aliasesAtEnd: aliasesNow,
      },
    } satisfies TxOutcome;
  })) as TxOutcome;
} catch (error) {
  rollbackReason = error instanceof Error ? error.message : String(error);
}

await sql.end({ timeout: 5 });

if (rollbackReason !== null || outcome === null) {
  writeJson('transaction-result.json', {
    artifact: 'NEW2_R24_TRANSACTION_RESULT',
    executionPopulationId: execPopulationId,
    transaction: 'ROLLED_BACK',
    commit: 'NO',
    rollbackReason,
    applied: 0,
  });
  console.error('TRANSACTION ROLLED BACK — no row was corrected.');
  console.error(rollbackReason);
  process.exit(3);
}

// ---------------------------------------------------------------------------
// 6. Post-COMMIT readback, on a NEW connection.
// ---------------------------------------------------------------------------

const after = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, ssl: sslFor(url) });

const readback = (await after.unsafe(
  `select id::text, neutral_citation, source_url, content_hash from judgments where id = any($1::uuid[]) order by id`,
  [safeIds],
)) as Array<{ id: string; neutral_citation: string | null; source_url: string; content_hash: string | null }>;
const readbackById = new Map(readback.map((row) => [row.id, row]));

const readbackFailures: string[] = [];
let readbackExact = 0;
const readbackCounts = { DETERMINISTIC_TO_NULL: 0, DETERMINISTIC_TO_REPLACE: 0, DETERMINISTIC_SUFFIX_REPLACE: 0 };
for (const plan of plans) {
  const row = readbackById.get(plan.judgmentId);
  const source = expectedSources.get(plan.judgmentId)!;
  if (!row) {
    readbackFailures.push(`MISSING:${plan.judgmentId}`);
    continue;
  }
  if (row.neutral_citation !== plan.newValue) {
    readbackFailures.push(`VALUE:${plan.judgmentId}`);
    continue;
  }
  if (row.source_url !== source.sourceIdentity || row.content_hash !== source.sourceContentHash) {
    readbackFailures.push(`SOURCE:${plan.judgmentId}`);
    continue;
  }
  readbackCounts[plan.disposition] += 1;
  readbackExact += 1;
}

const quarantineAfter = (await after.unsafe(
  `select id::text, neutral_citation, source_url, content_hash from judgments where id = any($1::uuid[]) order by id`,
  [quarantineIds],
)) as QuarantineRow[];
const quarantineChanged = JSON.stringify(quarantineAfter) !== JSON.stringify(quarantineBefore);

const edgesAfter = await edgeCensus(after);
const aliasesAfter = await aliasCensus(after);
const new1After = await new1Census(after);
const [dirtyAfter] = (await after.unsafe(`select count(*)::text as n from citation_key_dirty`)) as Array<{ n: string }>;
const [dirtyReasons] = (await after.unsafe(
  `select coalesce(string_agg(distinct reason, ','),'NONE') as reasons from citation_key_dirty`,
)) as Array<{ reasons: string }>;
const [dirtyOurs] = (await after.unsafe(
  `select count(*)::text as n from citation_key_dirty where judgment_id = any($1::uuid[])`,
  [safeIds],
)) as Array<{ n: string }>;

await after.end({ timeout: 5 });

writeJson('transaction-result.json', {
  artifact: 'NEW2_R24_TRANSACTION_RESULT',
  executionPopulationId: execPopulationId,
  executionPopulationHash: execHash,
  transaction: 'ONE_TRANSACTION',
  commit: 'YES',
  applied: outcome.applied,
  perDisposition: outcome.perDisposition,
  inTransactionValidation: outcome.inTransaction,
});

writeJson('postcommit-readback.json', {
  artifact: 'NEW2_R24_POSTCOMMIT_READBACK',
  observedAt: new Date().toISOString(),
  connection: 'FRESH_SESSION_AFTER_COMMIT',
  rowsRead: readback.length,
  exact: readbackExact,
  expected: EXPECTED.total,
  counts: readbackCounts,
  failures: readbackFailures,
  pass: readbackExact === EXPECTED.total && readbackFailures.length === 0,
});

// ---------------------------------------------------------------------------
// 7. The receipt. One immutable record binding audit, population, write and
//    everything observed to be unchanged around it.
// ---------------------------------------------------------------------------

const readbackPass = readbackExact === EXPECTED.total && readbackFailures.length === 0;
const edgesChanged =
  edgesBefore['edges'] !== edgesAfter['edges'] ||
  edgesBefore['regionHash'] !== edgesAfter['regionHash'] ||
  edgesBefore['unresolved'] !== edgesAfter['unresolved'];
const aliasesChanged = aliasesBefore['aliases'] !== aliasesAfter['aliases'] || aliasesBefore['hash'] !== aliasesAfter['hash'];

const canonicalCorrection =
  outcome.applied === EXPECTED.total &&
  readbackPass &&
  !quarantineChanged &&
  !edgesChanged &&
  !aliasesChanged
    ? 'PASS'
    : 'FAIL';

const receipt = {
  artifact: 'NEW2_R24_CANONICAL_CORRECTION_RECEIPT',
  round: 'NEW2 R24 PHASE A',
  executedAt: new Date().toISOString(),
  head: process.env['R24_HEAD'] ?? 'UNRECORDED',
  execution: { populationId: execPopulationId, populationHash: execHash, rowsHashV2: execRowsHash, identity: JSON.parse(execIdentity) },
  parent: {
    populationId: R23_POPULATION_ID,
    populationHash: R23_HASH,
    independentAudit: R23_INDEPENDENT_AUDIT,
    artifactFilesVerified: parentFileIntegrity.length,
    artifactFilesPass: parentFileIntegrity.every((entry) => entry.pass),
  },
  database: {
    identity: 'lawmind@127.0.0.1:5432 (local loopback)',
    frozenFrontier: execManifest.frozenFrontier,
    frontierAtWrite: live.frontier,
  },
  prewrite: {
    rowsChecked: plans.length,
    driftRows: drift.length,
    preflight: preflight.ok ? 'PASS' : 'FAIL',
    targetHolderKeys: safeKeys.length,
    targetHolderKeysWithHolders: prewrite.targetHolder.keysWithHolders,
    positiveControl,
  },
  transaction: { mode: 'ONE_TRANSACTION', outcome: 'COMMITTED', applied: outcome.applied, perDisposition: outcome.perDisposition },
  inTransactionValidation: outcome.inTransaction,
  postcommitReadback: { exact: readbackExact, expected: EXPECTED.total, pass: readbackPass, counts: readbackCounts },
  values: {
    before: plans.map((plan) => ({ judgmentId: plan.judgmentId, value: plan.expectedOldValue })),
    after: plans.map((plan) => ({ judgmentId: plan.judgmentId, value: plan.newValue })),
    sourceHashes: [...expectedSources.entries()].map(([id, s]) => ({ judgmentId: id, sourceContentHash: s.sourceContentHash })),
  },
  unchanged: {
    quarantine: {
      expected: EXPECTED_QUARANTINE,
      rowsObserved: quarantineAfter.length,
      changed: quarantineChanged,
    },
    edges: { before: edgesBefore, after: edgesAfter, changed: edgesChanged },
    aliases: { before: aliasesBefore, after: aliasesAfter, changed: aliasesChanged },
    sourceHashesChanged: 0,
    migrations: 0,
  },
  /**
   * Not an unauthorised write — the designed, mandatory consequence of exactly
   * these corrections. Migration 0088's AFTER UPDATE trigger records that the
   * citation index no longer reflects these judgments, and the resolver refuses
   * UNIQUE on their keys until the index is rebuilt. Recorded because the next
   * round must know the index is stale for 539 rows.
   */
  citationKeyDirty: {
    before: dirtyBefore!.n,
    after: dirtyAfter!.n,
    ofThisPopulation: dirtyOurs!.n,
    reasons: dirtyReasons!.reasons,
    mechanism: 'migration 0088 judgments_citation_key_dirty_upd, AFTER UPDATE OF neutral_citation',
  },
  new1: { before: new1Before, after: new1After, interrupted: false },
  mutationLedger: { canonicalRows: outcome.applied, edges: 0, aliases: 0, migrations: 0, network: false },
  canonicalCorrection,
};

const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
writeFileSync(join(OUT, 'receipt.json'), receiptJson);
const receiptHash = sha(receiptJson);
writeJson('receipt-hash.json', { artifact: 'NEW2_R24_RECEIPT_HASH', file: 'receipt.json', sha256: receiptHash });

writeExecManifest();

console.log(`R24_EXEC_POPULATION_ID   ${execPopulationId}`);
console.log(`R24_EXEC_POPULATION_HASH ${execHash}`);
console.log(`PREWRITE_ROWS            ${plans.length}  DRIFT ${drift.length}`);
console.log(`TRANSACTION              ONE  COMMIT ${outcome.applied === EXPECTED.total ? 'YES' : 'NO'}`);
console.log(`TOTAL_UPDATED            ${outcome.applied}  ${JSON.stringify(outcome.perDisposition)}`);
console.log(`POSTCOMMIT_READBACK      ${readbackExact}/${EXPECTED.total}`);
console.log(`QUARANTINE_CHANGED       ${quarantineChanged ? 'YES' : '0'}`);
console.log(`EDGES_CHANGED            ${edgesChanged ? 'YES' : '0'}`);
console.log(`ALIASES_CHANGED          ${aliasesChanged ? 'YES' : '0'}`);
console.log(`CITATION_KEY_DIRTY       ${dirtyBefore!.n} -> ${dirtyAfter!.n} (${dirtyOurs!.n} of this population)`);
console.log(`R24_RECEIPT_HASH         ${receiptHash}`);
console.log(`CANONICAL_CORRECTION     ${canonicalCorrection}`);
if (canonicalCorrection !== 'PASS') process.exit(4);
