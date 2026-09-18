import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  ALL_FEATURE_FAMILIES,
  allowedAcross,
  assertFeatureAllowed,
  featurePolicy,
  LeakageError,
  splitByFamily,
  cautionsAcross,
  type EvalRow,
} from './gold-contract.ts';

const row = (over: Partial<EvalRow> = {}): EvalRow => ({
  queryId: 'q1',
  queryType: 'proposition',
  query: 'a passage',
  goldAuthorityId: 'auth-1',
  goldProvenanceType: 'citation_edge',
  queryConstruction: 'redacted_passage',
  goldEvidence: {},
  caseFamily: 'auth-1',
  ...over,
});

test('citation-edge gold prohibits the inbound-citation feature and nothing else', () => {
  const policy = featurePolicy(row());
  assert.deepEqual(
    policy.prohibited.map((p) => p.family),
    ['inbound_citation_graph'],
  );
  assert.ok(policy.allowed.includes('dense_similarity'));
  assert.ok(policy.allowed.includes('sparse_lexical'));
  assert.equal(policy.allowed.length, ALL_FEATURE_FAMILIES.length - 1);
});

test('this is the exact experiment that produced the +21.5pt illusion', () => {
  // 278 of 278 gold were inbound-cited and the reranker read inbound citations.
  // The contract has to make that impossible to run, not merely inadvisable.
  assert.throws(
    () => assertFeatureAllowed(row(), 'inbound_citation_graph'),
    (e: unknown) => e instanceof LeakageError && /reads the answer key/.test((e as Error).message),
  );
});

test('a query that IS the authority identifier bans the matching route, not the others', () => {
  const citation = row({
    goldProvenanceType: 'own_citation_string',
    queryConstruction: 'own_identifier',
  });
  assert.throws(() => assertFeatureAllowed(citation, 'exact_citation_match'), LeakageError);
  // The title route is a DIFFERENT question on this row and stays measurable.
  assert.doesNotThrow(() => assertFeatureAllowed(citation, 'title_match'));
  assert.doesNotThrow(() => assertFeatureAllowed(citation, 'dense_similarity'));

  const title = row({ goldProvenanceType: 'own_case_title', queryConstruction: 'own_identifier' });
  assert.throws(() => assertFeatureAllowed(title, 'title_match'), LeakageError);
  assert.doesNotThrow(() => assertFeatureAllowed(title, 'exact_citation_match'));
});

test('provenance and query construction compose — a raw passage leaks through a second door', () => {
  const redacted = featurePolicy(row({ queryConstruction: 'redacted_passage' }));
  const raw = featurePolicy(row({ queryConstruction: 'raw_passage' }));
  assert.equal(redacted.prohibited.length, 1);
  assert.deepEqual(raw.prohibited.map((p) => p.family).sort(), [
    'exact_citation_match',
    'inbound_citation_graph',
    'title_match',
  ]);
});

test('legal-object gold bans matching the object back, which is the P9 circularity', () => {
  const r = row({ goldProvenanceType: 'legal_object_claim' });
  assert.throws(() => assertFeatureAllowed(r, 'verified_legal_object_match'), LeakageError);
  assert.doesNotThrow(() => assertFeatureAllowed(r, 'dense_similarity'));
});

test('canonical-status gold bans reading the status back', () => {
  const r = row({ goldProvenanceType: 'canonical_status' });
  assert.throws(() => assertFeatureAllowed(r, 'treatment_and_currentness'), LeakageError);
});

test('human-adjudicated gold bans nothing', () => {
  const r = row({ goldProvenanceType: 'human_adjudicated', queryConstruction: 'independent' });
  assert.deepEqual(featurePolicy(r).prohibited, []);
  for (const f of ALL_FEATURE_FAMILIES) assert.doesNotThrow(() => assertFeatureAllowed(r, f));
});

test('one row bans a family for the whole run — allowedAcross is the intersection', () => {
  const mixed = [
    row({ queryId: 'a' }),
    row({
      queryId: 'b',
      goldProvenanceType: 'own_case_title',
      queryConstruction: 'own_identifier',
    }),
  ];
  const allowed = allowedAcross(mixed);
  assert.ok(!allowed.includes('inbound_citation_graph'));
  assert.ok(!allowed.includes('title_match'));
  assert.ok(allowed.includes('dense_similarity'));
});

test('splitting keeps every row of one authority on the same side', () => {
  // Three query types over the same authority are three views of one thing.
  const rows: EvalRow[] = [];
  for (let i = 0; i < 60; i += 1) {
    for (const t of ['proposition', 'exact_citation', 'case_title']) {
      rows.push(
        row({
          queryId: `${t}-${i}`,
          queryType: t,
          goldAuthorityId: `auth-${i}`,
          caseFamily: `auth-${i}`,
        }),
      );
    }
  }
  const { train, test: held } = splitByFamily(rows, 0.3);
  assert.equal(train.length + held.length, rows.length);
  const trainFamilies = new Set(train.map((r) => r.caseFamily));
  for (const r of held)
    assert.ok(!trainFamilies.has(r.caseFamily), `${r.caseFamily} straddles the split`);
  // A holdout that is empty or everything is a split that measures nothing.
  assert.ok(held.length > 0 && train.length > 0);
});

test('the split is deterministic — two runs of the same gold are comparable', () => {
  const rows = [
    row({ caseFamily: 'x' }),
    row({ queryId: 'q2', caseFamily: 'y' }),
    row({ queryId: 'q3', caseFamily: 'z' }),
  ];
  const a = splitByFamily(rows, 0.5).test.map((r) => r.caseFamily);
  const b = splitByFamily(rows, 0.5).test.map((r) => r.caseFamily);
  assert.deepEqual(a, b);
});

test('own_text_span prohibits sparse and CAUTIONS dense — the uncited-gold shape', () => {
  const r = row({ goldProvenanceType: 'legal_object_claim', queryConstruction: 'own_text_span' });
  const policy = featurePolicy(r);
  assert.deepEqual(policy.prohibited.map((p) => p.family).sort(), [
    'sparse_lexical',
    'verified_legal_object_match',
  ]);
  assert.deepEqual(
    policy.cautioned.map((c) => c.family),
    ['dense_similarity'],
  );
  // A caution never throws. Throwing would discard the only gold that can
  // measure an authority nobody has cited.
  assert.doesNotThrow(() => assertFeatureAllowed(r, 'dense_similarity'));
  assert.throws(() => assertFeatureAllowed(r, 'sparse_lexical'), LeakageError);
});

test('a prohibition outranks a caution on the same family', () => {
  // raw_passage cautions dense; if a provenance ever prohibits it too, the family
  // must appear once, as prohibited.
  const r = row({ queryConstruction: 'raw_passage' });
  const policy = featurePolicy(r);
  const both = policy.cautioned.filter((c) => policy.prohibited.some((p) => p.family === c.family));
  assert.deepEqual(both, []);
});

test('cautionsAcross collects every caution in a set so a report cannot omit one', () => {
  const rows = [
    row({ queryId: 'a' }),
    row({
      queryId: 'b',
      goldProvenanceType: 'legal_object_claim',
      queryConstruction: 'own_text_span',
    }),
  ];
  assert.deepEqual(
    cautionsAcross(rows).map((c) => c.family),
    ['dense_similarity'],
  );
});

// ── adverse-edge guard (LCC bus 0912) ────────────────────────────────────────
// The gold we have does not leak through `treatment_and_currentness` because
// every edge in it is a plain `cites`. These tests exist because that is a fact
// about the GOLD, and the next gold — an adverse-authority benchmark, which P6
// requires — makes the same feature circular.

test('a plain cites edge still allows treatment_and_currentness', () => {
  const policy = featurePolicy(row({ goldEvidence: { relationship: 'cites' } }));
  assert.ok(policy.allowed.includes('treatment_and_currentness'));
  assert.deepEqual(
    policy.prohibited.map((p) => p.family),
    ['inbound_citation_graph'],
  );
});

test('an adverse edge prohibits treatment_and_currentness even on citation_edge provenance', () => {
  for (const rel of ['overruled', 'set_aside', 'doubted', 'distinguished', 'reversed']) {
    const policy = featurePolicy(row({ goldEvidence: { relationship: rel } }));
    assert.ok(
      policy.prohibited.some((p) => p.family === 'treatment_and_currentness'),
      `${rel} must ban treatment_and_currentness`,
    );
    assert.ok(!policy.allowed.includes('treatment_and_currentness'), `${rel} must not allow it`);
  }
});

test('the adverse-edge ban is case-insensitive and reads either spelling', () => {
  for (const evidence of [{ relationship: 'OVERRULED' }, { edgeRelationship: 'Set_Aside' }]) {
    const policy = featurePolicy(row({ goldEvidence: evidence }));
    assert.ok(policy.prohibited.some((p) => p.family === 'treatment_and_currentness'));
  }
});

test('an ABSENT relationship does not ban — unknown is not adverse', () => {
  // The opposite default would make every gold that omits the field lose a
  // legitimate feature, which is a silent quality loss rather than a safety win.
  assert.ok(featurePolicy(row({ goldEvidence: {} })).allowed.includes('treatment_and_currentness'));
  assert.ok(
    featurePolicy(row({ goldEvidence: { relationship: 42 } })).allowed.includes(
      'treatment_and_currentness',
    ),
  );
});

test('assertFeatureAllowed THROWS on an adverse edge, and the message names the edge', () => {
  const r = row({ goldEvidence: { relationship: 'overruled' } });
  assert.throws(
    () => assertFeatureAllowed(r, 'treatment_and_currentness'),
    (e: unknown) => e instanceof LeakageError && /overruled/.test((e as LeakageError).why),
  );
  // and it must not have become a blanket ban on the row
  assert.doesNotThrow(() => assertFeatureAllowed(r, 'dense_similarity'));
});

test('one adverse row bans the family for the whole run', () => {
  const rows = [
    row({ queryId: 'q1', goldEvidence: { relationship: 'cites' } }),
    row({ queryId: 'q2', caseFamily: 'auth-2', goldEvidence: { relationship: 'overruled' } }),
  ];
  assert.ok(!allowedAcross(rows).includes('treatment_and_currentness'));
});
