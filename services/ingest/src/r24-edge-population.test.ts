/**
 * NEW2 R24 edge-candidate gate. Artifact-only: no database, no network.
 *
 * The row-level population is 1.8 GB and gitignored, so what git can check is
 * the manifest over the aggregates. That is the point of the manifest — these
 * tests fail if any committed R24 artifact's bytes move, if the round claims a
 * mutation it was not authorised to make, or if the falsifier's verdict and its
 * own counts stop agreeing.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const R24 = join(ROOT, 'docs/ai/new2-r24');

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(R24, name), 'utf8')) as T;

const manifest = readJson<{
  files: Record<string, string>;
  edgeCandidates: number;
  edgeCandidatePopulationId: string;
  edgeCandidateRowFile: { lines: number; sha256: string; bytes: number; committed: boolean };
  mutationLedger: {
    canonicalRows: number;
    edges: number;
    aliases: number;
    migrations: number;
    network: boolean;
  };
  edgesChangedByR24: number | string;
  aliasesChangedByR24: number | string;
  edgePopulationReadyForIndependentAudit: string;
  citationBulkApply: string;
}>('artifact-manifest.json');

const population = readJson<{
  populationId: string;
  candidates: number;
  occurrencesExamined: number;
  guardInputs: number;
  occurrenceCensus: Record<string, number>;
  session: { mode: string; proof: string };
  derivedFrom: { reusedPriorPopulation: boolean };
  mutation: {
    edges: number;
    aliases: number;
    canonicalRows: number;
    migrations: number;
    network: boolean;
  };
  populationFile: { lines: number; sha256: string };
}>('edge-candidate-population.json');

const falsifier = readJson<{
  candidateEdges: number;
  excludedSelfCitation: number;
  excludedCommonOrderPageFurniture: number;
  ambiguous: number;
  untestable: number;
  knownFalsePins: {
    meghalayaClasses: number;
    blocked: number;
    survivingInPopulation: number;
    admittedIntoCandidatePopulation: number;
  };
  adversarialFixtures: {
    total: number;
    correct: number;
    trueEdgesWronglyRejected: number;
    falsePinsSurviving: number;
  };
  readyForIndependentAudit: string;
}>('edge-falsifier.json');

const zero = readJson<{
  session: { proof: string };
  edges: { before: Record<string, string>; after: Record<string, string>; changed: boolean };
  aliases: { before: Record<string, string>; after: Record<string, string>; changed: boolean };
  edgesChangedByR24: number | string;
  aliasesChangedByR24: number | string;
  citationBulkApply: string;
}>('zero-mutation-proof.json');

test('every committed R24 artifact still hashes to the manifest', () => {
  for (const [name, expected] of Object.entries(manifest.files)) {
    assert.equal(sha(readFileSync(join(R24, name), 'utf8')), expected, name);
  }
  assert.equal(Object.keys(manifest.files).length, 11);
});

test('R24 claims exactly the mutation authority it was given', () => {
  assert.deepEqual(manifest.mutationLedger, {
    canonicalRows: 539,
    edges: 0,
    aliases: 0,
    migrations: 0,
    network: false,
  });
  assert.deepEqual(population.mutation, {
    edges: 0,
    aliases: 0,
    canonicalRows: 0,
    migrations: 0,
    network: false,
  });
  assert.equal(manifest.edgesChangedByR24, 0);
  assert.equal(manifest.aliasesChangedByR24, 0);
  assert.equal(manifest.citationBulkApply, 'HOLD');
  assert.equal(zero.citationBulkApply, 'HOLD');
});

test('the zero-mutation proof compares two readings, and the session refused a write', () => {
  assert.equal(zero.session.proof, 'REFUSED_READ_ONLY_TRANSACTION');
  assert.equal(population.session.mode, 'READ_ONLY');
  assert.deepEqual(zero.edges.after, zero.edges.before);
  assert.deepEqual(zero.aliases.after, zero.aliases.before);
  assert.equal(zero.edges.changed, false);
  assert.equal(zero.aliases.changed, false);
});

test('the population is fresh, not a reused apply set', () => {
  assert.equal(population.derivedFrom.reusedPriorPopulation, false);
  assert.equal(population.populationId, manifest.edgeCandidatePopulationId);
  assert.equal(population.candidates, manifest.edgeCandidates);
  assert.equal(population.populationFile.lines, manifest.edgeCandidateRowFile.lines);
  assert.equal(population.populationFile.sha256, manifest.edgeCandidateRowFile.sha256);
  assert.equal(manifest.edgeCandidateRowFile.committed, false);
});

test('the occurrence census accounts for every occurrence examined', () => {
  const summed = Object.values(population.occurrenceCensus).reduce((a, b) => a + b, 0);
  assert.equal(summed, population.occurrencesExamined);
  assert.equal(population.occurrenceCensus['EDGE_CANDIDATE'], population.candidates);
  const reachedGuard =
    (population.occurrenceCensus['EDGE_CANDIDATE'] ?? 0) +
    (population.occurrenceCensus['EXCLUDED_COMMON_ORDER_PAGE_FURNITURE'] ?? 0) +
    (population.occurrenceCensus['UNTESTABLE_DAMAGED_SOURCE'] ?? 0);
  assert.equal(reachedGuard, population.guardInputs);
});

test('the falsifier agrees with the population it describes, and both false pins stayed out', () => {
  assert.equal(falsifier.candidateEdges, population.candidates);
  assert.equal(
    falsifier.excludedSelfCitation,
    population.occurrenceCensus['EXCLUDED_SELF_CITATION'],
  );
  assert.equal(falsifier.ambiguous, population.occurrenceCensus['EXCLUDED_AMBIGUOUS']);
  assert.equal(falsifier.knownFalsePins.meghalayaClasses, 2);
  assert.equal(falsifier.knownFalsePins.blocked, 2);
  assert.equal(falsifier.knownFalsePins.survivingInPopulation, 0);
  assert.equal(falsifier.knownFalsePins.admittedIntoCandidatePopulation, 0);
});

test('every adversarial fixture lands, and no true outgoing edge was rejected', () => {
  assert.equal(falsifier.adversarialFixtures.correct, falsifier.adversarialFixtures.total);
  assert.equal(falsifier.adversarialFixtures.trueEdgesWronglyRejected, 0);
  assert.equal(falsifier.adversarialFixtures.falsePinsSurviving, 0);
  assert.equal(falsifier.readyForIndependentAudit, 'YES');
  assert.equal(manifest.edgePopulationReadyForIndependentAudit, 'YES');
});

test('a guard that excluded nothing is recorded as unreachable, not as unnecessary', () => {
  const reach = readJson<{
    answer: string;
    meghalayaOccurrencesImmediatelyFollowedByAnotherNeutralToken: string;
    storedOccurrencesCarryingADbOrFbSuffix: string;
    probes: Array<{ furniture: number; sampled: number }>;
  }>('furniture-guard-reach.json');
  assert.equal(falsifier.excludedCommonOrderPageFurniture, 0);
  assert.equal(reach.answer, 'UNREACHABLE_AT_CURRENT_STORED_OFFSETS');
  // The population is not simply free of the shape — suffixed tokens are stored in bulk.
  assert.ok(Number(reach.storedOccurrencesCarryingADbOrFbSuffix) > 100_000);
  // And no stored offset sits inside a stamp, which is why the guard never fires.
  assert.equal(reach.meghalayaOccurrencesImmediatelyFollowedByAnotherNeutralToken, '0');
  for (const probe of reach.probes) assert.equal(probe.furniture, 0);
});
