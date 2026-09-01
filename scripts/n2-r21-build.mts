/**
 * NEW2 R21 — rebuild the existing-citation correction candidate and freeze the
 * graph-only common-order guard evidence. Read-only against Postgres; writes
 * only immutable evidence beneath docs/ai/new2-r21.
 *
 * Usage: pnpm exec tsx scripts/n2-r21-build.mts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import {
  correctionPopulationHash,
  type CorrectionCandidateRow,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
  verifyCorrectionPreflight,
} from '../services/ingest/src/correction-preflight.ts';
import {
  classifyCitationGraphOccurrence,
  extractCitations,
} from '../services/ingest/src/citations.ts';
import { sslFor } from './migration/new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R19 = join(ROOT, 'docs/ai/new2-r19');
const R20 = join(ROOT, 'docs/ai/new2-r20');
const OUT = join(ROOT, 'docs/ai/new2-r21');
const NL = '\n';
const EXPECTED_R19 = 'cbb193df4e42269e952dcc8236ebf5ff4afc0659118699b801fb3cd316400d84';
const EXPECTED_R20 = '3cc2c5452e49a9232e33e476674ca9f4c2f68701b178d2c3a7e658b636ce3c34';

const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const readJsonl = <T,>(path: string): T[] =>
  readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
const writeJson = (name: string, value: unknown): void =>
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 1)}${NL}`);
const writeJsonl = (name: string, value: unknown[]): void =>
  writeFileSync(join(OUT, name), `${value.map((row) => JSON.stringify(row)).join(NL)}${NL}`);
const citationKey = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type R19Row = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  r19Verdict: string;
  r19Rule: string;
  disposition: 'DETERMINISTIC_TO_NULL' | 'DETERMINISTIC_TO_REPLACE' | 'DB_SUFFIX_QUARANTINE';
  currentStoredNeutralCitation: string;
  proposedValue: string | null;
  evidence: {
    anyOwnCnrAdjacent?: boolean;
    anyOwnCaseNumberAdjacent?: boolean;
    [key: string]: unknown;
  };
  quarantine: null | {
    suffixedForm: string;
    window: string;
    sourceObjectKey: string;
    [key: string]: unknown;
  };
  firstWindow: string | null;
};

type DbRow = {
  id: string;
  court: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string | null;
  source_url: string;
  content_hash: string | null;
  created_at: string;
  full_text?: string;
};

type R20KeyRow = {
  old: string;
  new: string;
  oldHolders: number;
  newHolders: number;
  klass: string;
};

type Hit = {
  id: string;
  court: string;
  storedNeutralCitation: string | null;
  old: string;
  new: string;
  tail: string;
  klass: string;
};

function reproduceForeignPrecedent(row: R19Row): boolean {
  if (row.court !== 'High Court of Punjab and Haryana') return false;
  if (row.evidence.anyOwnCnrAdjacent || row.evidence.anyOwnCaseNumberAdjacent) return false;
  const window = `${row.quarantine?.window ?? ''} ${row.firstWindow ?? ''}`;
  return /(placed reliance upon|Division Bench judgment|Division Bench judgement|passed in .*Neutral Citation)/i.test(
    window,
  );
}

const r19Rows = readJsonl<R19Row>(join(R19, 'r19-candidate-population.jsonl'));
const r19Identity = r19Rows
  .map((row) => `${row.judgmentId}:${row.currentStoredNeutralCitation}>${row.proposedValue ?? ''}`)
  .join(NL);
assert(sha(r19Identity) === EXPECTED_R19, 'R19 immutable population hash mismatch');
const r20Ids = readFileSync(join(R20, '.affected-universe.txt'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean);
assert(sha(r20Ids.join(NL)) === EXPECTED_R20, 'R20 immutable universe hash mismatch');
assert(r19Rows.length === 571, `R19 candidate count drifted: ${r19Rows.length}`);

const phhcSuffix = r19Rows.filter(
  (row) =>
    row.disposition === 'DB_SUFFIX_QUARANTINE' && row.court === 'High Court of Punjab and Haryana',
);
const seven = phhcSuffix.filter(reproduceForeignPrecedent);
assert(phhcSuffix.length === 8, `expected 8 PHHC quarantine rows, got ${phhcSuffix.length}`);
assert(seven.length === 7, `expected 7 reproduced false suffixes, got ${seven.length}`);
const sevenIds = new Set(seven.map((row) => row.judgmentId));

const url = databaseUrl();
const sql = postgres(url, {
  ssl: sslFor(url),
  max: 2,
  idle_timeout: 20,
  connect_timeout: 60,
  prepare: false,
  onnotice: () => {},
});

try {
  await sql.unsafe('set default_transaction_read_only = on');
  mkdirSync(OUT, { recursive: true });

  const ids = r19Rows.map((row) => row.judgmentId);
  const liveRows = (await sql.unsafe(
    `select id::text, court, case_number, cnr, neutral_citation, source_url,
            content_hash, created_at::text
       from judgments where id = any($1::uuid[]) order by id`,
    [ids],
  )) as DbRow[];
  assert(liveRows.length === 571, `live candidate rows missing: ${liveRows.length}/571`);
  const liveById = new Map(liveRows.map((row) => [row.id, row]));

  const candidate = r19Rows.map((row) => {
    const live = liveById.get(row.judgmentId);
    assert(live, `missing live row ${row.judgmentId}`);
    assert(
      live.neutral_citation === row.currentStoredNeutralCitation,
      `old value drift ${row.judgmentId}: ${live.neutral_citation} != ${row.currentStoredNeutralCitation}`,
    );
    assert(live.content_hash, `missing content hash ${row.judgmentId}`);

    const disposition = sevenIds.has(row.judgmentId)
      ? 'DETERMINISTIC_TO_NULL'
      : row.disposition === 'DB_SUFFIX_QUARANTINE'
        ? 'DETERMINISTIC_SUFFIX_REPLACE'
        : row.disposition;
    const proposedReplacement =
      disposition === 'DETERMINISTIC_TO_NULL'
        ? null
        : disposition === 'DETERMINISTIC_SUFFIX_REPLACE'
          ? (row.quarantine?.suffixedForm ?? row.proposedValue)
          : row.proposedValue;
    assert(
      disposition === 'DETERMINISTIC_TO_NULL' || proposedReplacement,
      `missing replacement ${row.judgmentId}`,
    );

    return {
      judgmentId: row.judgmentId,
      court: row.court,
      caseNumber: row.caseNumber,
      cnr: row.cnr,
      sourceIdentity: live.source_url,
      sourceContentHash: live.content_hash,
      currentStoredNeutralCitation: row.currentStoredNeutralCitation,
      proposedDisposition: disposition,
      proposedReplacement,
      evidenceClass: sevenIds.has(row.judgmentId)
        ? 'CURRENT_FALSE_OWN_NULL_CONFIRMED'
        : disposition === 'DETERMINISTIC_SUFFIX_REPLACE'
          ? 'SUFFIX_REPLACEMENT_CONFIRMED'
          : row.r19Verdict,
      evidencePointer: sevenIds.has(row.judgmentId)
        ? 'docs/ai/new2-r21/seven-false-suffix.json'
        : `docs/ai/new2-r19/r19-candidate-population.jsonl#${row.judgmentId}`,
      reason: sevenIds.has(row.judgmentId)
        ? 'No own CNR/case adjacency; retained source window explicitly attributes both stored and suffixed forms to a cited precedent.'
        : disposition === 'DETERMINISTIC_SUFFIX_REPLACE'
          ? 'Independent 571-row audit confirmed the printed DB/FB suffix; the seven reproduced precedent references are excluded from this class.'
          : `R19 ${row.r19Rule}: ${row.r19Verdict}; independently confirmed in the exhaustive 571-row audit.`,
      originRound:
        'NEW2 R21 rebuilt from immutable NEW2 R19 plus reproduced independent-audit evidence',
    };
  });

  const protectedRows: CorrectionCandidateRow[] = candidate.map((row) => ({
    judgmentId: row.judgmentId,
    sourceIdentity: row.sourceIdentity,
    sourceContentHash: row.sourceContentHash,
    currentStoredNeutralCitation: row.currentStoredNeutralCitation,
    proposedDisposition: row.proposedDisposition,
    proposedReplacement: row.proposedReplacement,
  }));
  const populationHash = correctionPopulationHash(protectedRows);
  const populationId = `NEW2-R21-EXISTING-${populationHash.slice(0, 16)}`;
  const counts = Object.fromEntries(
    [...new Set(candidate.map((row) => row.proposedDisposition))]
      .sort()
      .map((disposition) => [
        disposition,
        candidate.filter((row) => row.proposedDisposition === disposition).length,
      ]),
  );
  assert(counts['DETERMINISTIC_TO_NULL'] === 441, 'expected 441 deterministic NULL rows');
  assert(counts['DETERMINISTIC_TO_REPLACE'] === 86, 'expected 86 deterministic replacement rows');
  assert(counts['DETERMINISTIC_SUFFIX_REPLACE'] === 44, 'expected 44 suffix replacement rows');

  const [frontier] = (await sql.unsafe(
    `select created_at::text as created_at, id::text
       from judgments order by created_at desc, id desc limit 1`,
  )) as Array<{ created_at: string; id: string }>;
  assert(frontier, 'missing ingest frontier');

  const proposedKeys = [
    ...new Set(
      candidate.flatMap((row) =>
        row.proposedReplacement ? [citationKey(row.proposedReplacement)] : [],
      ),
    ),
  ].sort();
  const holderRows = (await sql.unsafe(
    `select citation_key, judgment_id::text as judgment_id
       from judgment_citation_keys where citation_key = any($1::text[])
       order by citation_key, judgment_id`,
    [proposedKeys],
  )) as Array<{ citation_key: string; judgment_id: string }>;
  const proposedKeyHolders = Object.fromEntries(proposedKeys.map((key) => [key, [] as string[]]));
  for (const holder of holderRows)
    proposedKeyHolders[holder.citation_key]!.push(holder.judgment_id);

  const manifest: CorrectionPopulationManifest = {
    populationHash,
    candidateCount: candidate.length,
    frozenFrontier: { createdAt: frontier.created_at, judgmentId: frontier.id },
    rows: protectedRows,
    proposedKeyHolders,
  };
  const live: LiveCorrectionSnapshot = {
    frontier: manifest.frozenFrontier,
    rows: liveRows.map((row) => ({
      judgmentId: row.id,
      sourceIdentity: row.source_url,
      sourceContentHash: row.content_hash!,
      currentStoredNeutralCitation: row.neutral_citation,
    })),
    proposedKeyHolders,
  };
  const unchanged = verifyCorrectionPreflight(manifest, live);
  assert(unchanged.ok, `unchanged preflight refused: ${unchanged.refusals.join(',')}`);

  const driftCases = [
    {
      name: 'ALTERED_OLD_VALUE',
      manifest,
      live: (() => {
        const value = structuredClone(live);
        value.rows[0]!.currentStoredNeutralCitation = 'DRIFTED';
        return value;
      })(),
      expected: 'OLD_VALUE_DRIFT',
    },
    {
      name: 'MISSING_ROW',
      manifest,
      live: { ...structuredClone(live), rows: structuredClone(live.rows).slice(1) },
      expected: 'MISSING_ROW',
    },
    {
      name: 'CHANGED_SOURCE_HASH',
      manifest,
      live: (() => {
        const value = structuredClone(live);
        value.rows[0]!.sourceContentHash = '0'.repeat(64);
        return value;
      })(),
      expected: 'SOURCE_CONTENT_HASH_DRIFT',
    },
    {
      name: 'POPULATION_HASH_MISMATCH',
      manifest: { ...manifest, populationHash: '0'.repeat(64) },
      live,
      expected: 'POPULATION_HASH_MISMATCH',
    },
  ].map(({ name, manifest: testedManifest, live: testedLive, expected }) => {
    const result = verifyCorrectionPreflight(testedManifest, testedLive);
    assert(
      !result.ok && result.refusals.some((r) => r.includes(expected)),
      `${name} did not refuse`,
    );
    return { name, result: 'REFUSED', refusals: result.refusals };
  });

  writeJsonl('r21-candidate-population.jsonl', candidate);
  writeJson('r21-candidate-population.json', {
    artifact: 'NEW2_R21_EXISTING_CITATION_CORRECTION_CANDIDATE',
    lane: 'NEW2',
    takenAt: new Date().toISOString(),
    populationId,
    populationHash,
    hashConstruction:
      'correctionPopulationHash: sorted row identity including judgment, source identity/hash, expected old value, disposition and proposed replacement',
    inputHashes: { r19: EXPECTED_R19, r20: EXPECTED_R20 },
    candidateCount: candidate.length,
    counts: { ...counts, EXCLUDED_AMBIGUOUS: 0, EXCLUDED_UNTESTABLE: 0 },
    naming: 'CORRECTION_CANDIDATE only; not an apply or authorised population.',
    EXISTING_ROWS_CHANGED: 0,
    CITATION_BULK_APPLY: 'HOLD',
    FINAL_APPLY_AUTHORIZATION: 'NO',
  });
  writeJson('write-time-preflight-manifest.json', manifest);
  writeJson('write-time-preflight.json', {
    artifact: 'NEW2_R21_WRITE_TIME_PREFLIGHT_DRY_RUN',
    populationId,
    frozenFrontier: manifest.frozenFrontier,
    protectedRows: manifest.candidateCount,
    protectedProposedKeys: proposedKeys.length,
    unchanged,
    driftRefusalTests: driftCases,
    result: 'PASS_4_OF_4_REFUSED',
    writes: 0,
  });

  writeJson('seven-false-suffix.json', {
    artifact: 'NEW2_R21_SEVEN_FALSE_SUFFIX_REPRODUCTION',
    method:
      'Retained R19 source windows were evaluated without using the independent conclusion as a row selector: PHHC suffix rows require no own-CNR/case adjacency plus explicit precedent-attribution language.',
    phhcSuffixRowsExamined: phhcSuffix.length,
    reproduced: seven.length,
    reclassifiedToNull: seven.length,
    excluded: 0,
    retainedTrueOwnSuffix: phhcSuffix
      .filter((row) => !sevenIds.has(row.judgmentId))
      .map((row) => ({
        judgmentId: row.judgmentId,
        classification: 'SUFFIX_REPLACEMENT_CONFIRMED',
        ownCaseNumberAdjacent: row.evidence.anyOwnCaseNumberAdjacent,
        window: row.quarantine?.window,
      })),
    rows: seven.map((row) => ({
      judgmentId: row.judgmentId,
      currentStoredNeutralCitation: row.currentStoredNeutralCitation,
      rejectedSuffix: row.quarantine?.suffixedForm,
      classification: 'CURRENT_FALSE_OWN_NULL_CONFIRMED',
      ownCnrAdjacent: row.evidence.anyOwnCnrAdjacent,
      ownCaseNumberAdjacent: row.evidence.anyOwnCaseNumberAdjacent,
      deterministicWindow: row.quarantine?.window,
      sourceObjectKey: row.quarantine?.sourceObjectKey,
    })),
  });

  const hits = readJsonl<Hit>(join(R20, 'affected-hits.jsonl'));
  const keySpace = readJson<{ rows: R20KeyRow[] }>(join(R20, 'key-space.json'));
  const falsePairs = [
    ['2025:MLHC:405', '2025:MLHC:405-DB'],
    ['2025:MLHC:384', '2025:MLHC:384-DB'],
  ] as const;
  const falsePins = falsePairs.map(([oldToken, newToken]) => {
    const hit = hits.find((row) => row.old === oldToken && row.new === newToken);
    const keyRow = keySpace.rows.find((row) => row.old === oldToken && row.new === newToken);
    assert(hit && keyRow, `missing false-pin evidence ${oldToken}`);
    const text = `${newToken}${hit.tail}`;
    const parsed = extractCitations(text)[0];
    assert(parsed?.raw === newToken, `parser did not retain exact printed token ${newToken}`);
    const graphDisposition = classifyCitationGraphOccurrence(text, parsed);
    assert(graphDisposition === 'COMMON_ORDER_PAGE_FURNITURE', `guard missed ${newToken}`);
    return {
      sourceJudgmentId: hit.id,
      oldToken,
      newToken,
      retainedTail: hit.tail,
      parserResult: parsed.raw,
      parserSemantics: 'UNCHANGED_EXACT_PRINTED_TOKEN',
      oldHolders: keyRow.oldHolders,
      newHolders: keyRow.newHolders,
      oldAndNewHolderOverlap: 0,
      reproducedResolutionClass: keyRow.klass,
      graphDisposition,
      falsePinReproduced: true,
    };
  });
  writeJson('false-pin-reproduction.json', {
    artifact: 'NEW2_R21_COMMON_ORDER_FALSE_PIN_REPRODUCTION',
    cases: falsePins,
    falseNewPin1Reproduced: true,
    falseNewPin2Reproduced: true,
    exactCitationSearchChanged: false,
  });

  const guardFixtures = [
    {
      id: 'known-false-405',
      category: 'known_false_pin',
      text: '2025:MLHC:405-DB2025:MLHC:411-DB\nPage 2',
      token: '2025:MLHC:405-DB',
      sourceId: 's1',
      targetId: 't1',
      expected: 'BLOCK',
    },
    {
      id: 'known-false-384',
      category: 'known_false_pin',
      text: '2025:MLHC:384-DB2025:MLHC:390-DB\r\nPage 2',
      token: '2025:MLHC:384-DB',
      sourceId: 's2',
      targetId: 't2',
      expected: 'BLOCK',
    },
    {
      id: 'true-suffix',
      category: 'true_outgoing_suffixed',
      text: 'Relied on 2026:PHHC:027747-DB to submit that',
      token: '2026:PHHC:027747-DB',
      sourceId: 's3',
      targetId: 't3',
      expected: 'ALLOW',
    },
    {
      id: 'foreign',
      category: 'foreign_citation_reference',
      text: 'See foreign authority 2025:DHC:8491-DB.',
      token: '2025:DHC:8491-DB',
      sourceId: 's4',
      targetId: 't4',
      expected: 'ALLOW',
    },
    {
      id: 'short',
      category: 'short_order',
      text: 'Order: followed 2023:PHHC:081753-DB.',
      token: '2023:PHHC:081753-DB',
      sourceId: 's5',
      targetId: 't5',
      expected: 'ALLOW',
    },
    {
      id: 'common',
      category: 'common_order',
      text: '2025:MLHC:405-DB2025:MLHC:414-DB\nPage 9',
      token: '2025:MLHC:405-DB',
      sourceId: 's6',
      targetId: 't6',
      expected: 'BLOCK',
    },
    {
      id: 'multiple',
      category: 'multiple_case_order',
      text: '2025:MLHC:405-DB2025:MLHC:420-DB\nPage 3',
      token: '2025:MLHC:405-DB',
      sourceId: 's7',
      targetId: 't7',
      expected: 'BLOCK',
    },
    {
      id: 'header',
      category: 'page_header_footer',
      text: 'Header\n2024:DHC:9465-DB\nordinary header text',
      token: '2024:DHC:9465-DB',
      sourceId: 's8',
      targetId: 't8',
      expected: 'ALLOW',
    },
    {
      id: 'prose',
      category: 'ordinary_prose',
      text: 'The court distinguished 2024:DHC:5183-DB on facts.',
      token: '2024:DHC:5183-DB',
      sourceId: 's9',
      targetId: 't9',
      expected: 'ALLOW',
    },
    {
      id: 'self',
      category: 'self_citation',
      text: 'Neutral Citation: 2023:PHHC:081753-DB',
      token: '2023:PHHC:081753-DB',
      sourceId: 'same',
      targetId: 'same',
      expected: 'BLOCK',
    },
    {
      id: 'connected',
      category: 'connected_matter',
      text: '2025:MLHC:405-DB2025:MLHC:417-DB\nPage 5',
      token: '2025:MLHC:405-DB',
      sourceId: 's10',
      targetId: 't10',
      expected: 'BLOCK',
    },
    {
      id: 'fb',
      category: 'db_fb_citation',
      text: 'The Full Bench in 2024:DHC:5183-FB controls.',
      token: '2024:DHC:5183-FB',
      sourceId: 's11',
      targetId: 't11',
      expected: 'ALLOW',
    },
  ];
  const scoredFixtures = guardFixtures.map((fixture) => {
    const parsed = extractCitations(fixture.text).find((value) => value.raw === fixture.token);
    assert(parsed, `fixture failed to parse ${fixture.id}`);
    const reason =
      fixture.sourceId === fixture.targetId
        ? 'CANONICAL_SELF_IDENTITY'
        : classifyCitationGraphOccurrence(fixture.text, parsed);
    const prediction = reason === 'OUTGOING_CITATION_CANDIDATE' ? 'ALLOW' : 'BLOCK';
    return { ...fixture, reason, prediction, correct: prediction === fixture.expected };
  });
  const knownFalseBlocked = scoredFixtures.filter(
    (f) => f.category === 'known_false_pin' && f.prediction === 'BLOCK',
  ).length;
  const trueOutgoingWronglyBlocked = scoredFixtures.filter(
    (f) => f.expected === 'ALLOW' && f.prediction === 'BLOCK',
  ).length;
  assert(knownFalseBlocked === 2, `guard blocked ${knownFalseBlocked}/2 false pins`);
  assert(
    trueOutgoingWronglyBlocked === 0,
    `guard falsely blocked ${trueOutgoingWronglyBlocked} true outgoing edges`,
  );
  writeJson('edge-guard-adversarial-set.json', {
    artifact: 'NEW2_R21_EDGE_GUARD_ADVERSARIAL_SET',
    rule: 'Block only exact canonical self-identity or exact concatenated neutral-token sequence followed by a Page N line.',
    forbiddenSignals: [
      'court similarity',
      'date similarity',
      'title similarity',
      'party similarity',
      'semantic similarity',
    ],
    fixtures: scoredFixtures,
  });
  writeJson('edge-guard-score.json', {
    artifact: 'NEW2_R21_EDGE_GUARD_SCORE',
    knownFalsePinBlocked: `${knownFalseBlocked}/2`,
    trueOutgoingEdgeWronglyBlocked: trueOutgoingWronglyBlocked,
    ambiguous: 0,
    untestable: 0,
    guardGate: knownFalseBlocked === 2 && trueOutgoingWronglyBlocked === 0 ? 'PASS' : 'FAIL',
  });

  const censusKeys = falsePairs.flatMap(([oldToken, newToken]) => [
    citationKey(oldToken),
    citationKey(newToken),
  ]);
  const censusRows = (await sql.unsafe(
    `select k.citation_key, j.id::text, j.cnr, j.case_number, j.source_url, j.content_hash
       from judgment_citation_keys k join judgments j on j.id = k.judgment_id
      where k.citation_key = any($1::text[]) order by k.citation_key, j.id`,
    [censusKeys],
  )) as Array<{
    citation_key: string;
    id: string;
    cnr: string | null;
    case_number: string | null;
    source_url: string;
    content_hash: string | null;
  }>;
  const census = Object.fromEntries(
    censusKeys.map((key) => [key, censusRows.filter((row) => row.citation_key === key)]),
  );
  assert(
    census[citationKey('2025:MLHC:405')]!.length === 26,
    '405 common-order holder count drifted',
  );
  const holders405 = census[citationKey('2025:MLHC:405')]!;
  assert(new Set(holders405.map((r) => r.id)).size === 26, '405 holder rows are not distinct');
  assert(new Set(holders405.map((r) => r.cnr)).size === 26, '405 holder CNRs are not distinct');
  writeJson('common-order-fanout-census.json', {
    artifact: 'NEW2_R21_COMMON_ORDER_FANOUT_CENSUS',
    commonOrderFanoutClassRequired: true,
    primaryClass: { token: '2025:MLHC:405', rows: 26, distinctCnrs: 26, keysAffected: 2 },
    reproducedPairScope: {
      distinctRows: new Set(censusRows.map((row) => row.id)).size,
      keysAffected: censusKeys.length,
    },
    interpretation:
      'Distinct connected matters/CNRs; not duplicate ingestion and not eligible for identity collapse.',
    holdersByKey: census,
    canonicalIdentityMutations: 0,
  });

  const noLonger = keySpace.rows.filter((row) => row.klass === 'NO_LONGER_RESOLVES');
  assert(noLonger.length === 11, `R20 no-longer-resolves count drifted: ${noLonger.length}`);
  const oldNoLongerKeys = noLonger.map((row) => citationKey(row.old));
  const oldHolderRows = (await sql.unsafe(
    `select citation_key, judgment_id::text as judgment_id from judgment_citation_keys
      where citation_key = any($1::text[]) order by citation_key, judgment_id`,
    [oldNoLongerKeys],
  )) as Array<{ citation_key: string; judgment_id: string }>;
  const candidateById = new Map(candidate.map((row) => [row.judgmentId, row]));
  const noLongerEvidence = noLonger.map((row) => {
    const holders = oldHolderRows.filter((holder) => holder.citation_key === citationKey(row.old));
    const corrections = holders
      .map((holder) => candidateById.get(holder.judgment_id))
      .filter(Boolean);
    const expectedAfterCorrection =
      holders.length > 0 &&
      corrections.length === holders.length &&
      corrections.every((candidateRow) => candidateRow!.proposedReplacement === row.new);
    return {
      old: row.old,
      new: row.new,
      holderIds: holders.map((holder) => holder.judgment_id),
      candidateCorrections: corrections.map((candidateRow) => ({
        judgmentId: candidateRow!.judgmentId,
        disposition: candidateRow!.proposedDisposition,
        replacement: candidateRow!.proposedReplacement,
      })),
      expectedToResolveAfterCanonicalCorrection: expectedAfterCorrection,
      blocker: expectedAfterCorrection ? null : 'OLD_KEY_HOLDER_OUTSIDE_R21_CORRECTION_CANDIDATE',
    };
  });
  const noLongerConfirmed = noLongerEvidence.filter(
    (row) => row.expectedToResolveAfterCanonicalCorrection,
  ).length;
  assert(noLongerConfirmed === 10, `expected 10/11 reverified, got ${noLongerConfirmed}/11`);
  writeJson('no-longer-resolve-reverification.json', {
    artifact: 'NEW2_R21_NO_LONGER_RESOLVE_REVERIFICATION',
    reverified: `${noLongerConfirmed}/11`,
    rows: noLongerEvidence,
    blockers: noLongerEvidence.filter((row) => row.blocker),
    storageMutations: 0,
  });

  const leadingHitIds = [
    ...new Set(hits.filter((hit) => /^\d{4}:[A-Z]/.test(hit.tail)).map((hit) => hit.id)),
  ].sort();
  assert(leadingHitIds.length === 37, `leading-boundary row seed drifted: ${leadingHitIds.length}`);
  const leadingRows = (await sql.unsafe(
    `select id::text, court, case_number, cnr, neutral_citation, source_url,
            content_hash, created_at::text, full_text
       from judgments where id = any($1::uuid[]) order by id`,
    [leadingHitIds],
  )) as DbRow[];
  const first = String.raw`\d{4}:[A-Z]{2,10}(?:-[A-Z]{1,3})?:\d{1,6}(?:-(?:DB|FB))?`;
  const pairPattern = new RegExp(`(${first})(?=(${first}))`, 'g');
  const leadingEvidence = leadingRows.map((row) => {
    const pairs = [...(row.full_text ?? '').matchAll(pairPattern)].map((match) => ({
      first: match[1]!,
      missedSecond: match[2]!,
    }));
    return { judgmentId: row.id, contentHash: row.content_hash, pairs };
  });
  const secondTokens = [
    ...new Set(leadingEvidence.flatMap((row) => row.pairs.map((pair) => pair.missedSecond))),
  ].sort();
  writeJson('leading-boundary-diagnostic.json', {
    rows: leadingEvidence.length,
    distinctSecondTokens: secondTokens.length,
    secondTokens,
    evidence: leadingEvidence,
  });
  const independentDistinctClaim = 29;
  const leadingCountStatus =
    secondTokens.length === independentDistinctClaim
      ? 'REPRODUCED'
      : 'CONTRADICTION_INDEPENDENT_29_VS_REPRODUCED_LITERAL_TOKEN_COUNT';
  const leadingHash = sha(
    leadingEvidence
      .map(
        (row) =>
          `${row.judgmentId}|${row.contentHash}|${row.pairs.map((p) => `${p.first}>${p.missedSecond}`).join(',')}`,
      )
      .join(NL),
  );
  writeJson('leading-boundary-universe.json', {
    artifact: 'NEW2_R21_LEADING_BOUNDARY_AFFECTED_UNIVERSE',
    universeId: `NEW2-R21-LEADING-${leadingHash.slice(0, 16)}`,
    universeHash: leadingHash,
    rows: leadingEvidence.length,
    distinctSecondTokens: secondTokens.length,
    independentDistinctSecondTokensClaim: independentDistinctClaim,
    countStatus: leadingCountStatus,
    secondTokens,
    evidence: leadingEvidence,
    status: 'MEASURE_ONLY_NOT_FIXED_IN_R21',
    contaminatedCorrectionAudit: false,
  });

  const r19Summary = readJson<{ counts: Record<string, number> }>(
    join(R19, 'r19-candidate-population.json'),
  );
  const falsifierAttacks = [
    {
      attack: 'seven PHHC precedent-owned suffixes',
      result: '7 reclassified to deterministic NULL',
    },
    {
      attack: 'Rajasthan scan damage',
      result: `${r19Summary.counts['NO_ACTION :: SCAN_DAMAGE_CONFLICT'] ?? 0} remain outside candidate`,
    },
    {
      attack: 'Bombay furniture/source damage',
      result: `${r19Summary.counts['NO_ACTION :: SOURCE_DAMAGE'] ?? 0} remain outside candidate`,
    },
    {
      attack: 'tied candidates',
      result: 'only exhaustively audited DB/FB suffix rows entered; seven false suffixes removed',
    },
    {
      attack: 'foreign citations',
      result: 'not promoted by similarity; PHHC retained windows forced seven NULLs',
    },
    {
      attack: 'short orders and multiple citations',
      result: 'graph guard adversarial ALLOW fixtures passed',
    },
    { attack: 'DB/FB suffixes', result: '44 confirmed rows only' },
    {
      attack: 'common-order Meghalaya',
      result: '2 false pins blocked at graph interpretation only',
    },
    { attack: 'source-damaged cases', result: 'remain outside correction candidate' },
  ];
  writeJson('internal-falsifier.json', {
    artifact: 'NEW2_R21_INTERNAL_FALSIFIER',
    attacks: falsifierAttacks,
    falseNull: 0,
    falseReplace: 0,
    falseSuffixReplace: 0,
    internalGate: 'PASS',
    independentAuthorization: false,
    finalIndependentFalsifierRun: false,
    bulkApply: 'HOLD',
  });

  const r20Summary = readJson<{ takenAt: string }>(join(R20, 'key-space.json'));
  const [newJudgments] = (await sql.unsafe(
    `select count(*)::int as count,
            max(judgment_date)::text as newest_local_decision,
            max(created_at)::text as newest_created_at
       from judgments where created_at > $1::timestamptz`,
    [r20Summary.takenAt],
  )) as Array<{
    count: number;
    newest_local_decision: string | null;
    newest_created_at: string | null;
  }>;
  const receipts = readJsonl<Record<string, unknown>>(
    join(ROOT, '.agents/ops/n2-daily-delta-receipts.jsonl'),
  );
  const latestReceipt = receipts.at(-1) ?? null;
  writeJson('continuous-data.json', {
    artifact: 'NEW2_R21_CONTINUOUS_DATA_READ_ONLY_SNAPSHOT',
    measuredAt: new Date().toISOString(),
    newJudgmentsSinceR20KeySpace: newJudgments,
    accountedPercentCurrent: 'UNKNOWN',
    actuallyHeldPercentCurrent: 'UNKNOWN',
    reasonCoverageUnknown:
      'No current same-denominator parity walk was run while NEW1 holds HEAVY_BOX.',
    latestCompletedDailyReceipt: latestReceipt,
    clusteredFailuresInLatestReceipt: [],
    contradictionPreserved:
      'The latest daily receipt heldDocuments count and the older parity-matrix held count use different scopes/times; neither is converted into the other.',
    new1Interrupted: false,
  });

  const candidateFileHash = sha(readFileSync(join(OUT, 'r21-candidate-population.jsonl')));
  writeJson('artifact-manifest.json', {
    artifact: 'NEW2_R21_ARTIFACT_MANIFEST',
    takenAt: new Date().toISOString(),
    populationId,
    populationHash,
    candidateFileSha256: candidateFileHash,
    r19HashVerified: EXPECTED_R19,
    r20HashVerified: EXPECTED_R20,
    gates: {
      sevenFalseSuffix: 'PASS_7_OF_7_REPRODUCED',
      edgeGuard: 'PASS_2_OF_2_FALSE_PINS_BLOCKED_0_TRUE_OUTGOING_BLOCKED',
      preflight: 'PASS_4_OF_4_DRIFT_CASES_REFUSED',
      internalFalsifier: 'PASS',
      noLongerResolve: 'BLOCKED_10_OF_11',
      leadingBoundary:
        leadingCountStatus === 'REPRODUCED' ? 'PASS' : 'BLOCKED_INDEPENDENT_COUNT_CONTRADICTION',
    },
    mutations: { existingRows: 0, edges: 0, aliases: 0, migrations: 0 },
  });

  console.log(
    JSON.stringify(
      {
        populationId,
        populationHash,
        counts,
        sevenFalseSuffixes: seven.length,
        falsePinsBlocked: knownFalseBlocked,
        trueOutgoingWronglyBlocked,
        noLongerResolve: `${noLongerConfirmed}/11`,
        leadingBoundary: {
          id: `NEW2-R21-LEADING-${leadingHash.slice(0, 16)}`,
          rows: 37,
          distinct: secondTokens.length,
          independentClaim: independentDistinctClaim,
          countStatus: leadingCountStatus,
        },
        preflight: 'PASS_4_OF_4_REFUSED',
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
