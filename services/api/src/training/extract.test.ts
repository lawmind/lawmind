/**
 * B1.5 and B2.3 are both ABSENCE assertions — "writes nothing without consent"
 * and "never touches client documents". An absence is what rots silently, so it
 * is tested against the SQL that actually runs rather than against a comment.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONSENT_PREDICATE,
  EXTRACTION_SQL,
  FORBIDDEN_SOURCES,
  PAIR_SCHEMA_VERSION,
  SIGNAL_WEIGHT,
} from './extract.ts';
import {
  TRAINING_CONSENT_VERSION,
  consentIsCurrent,
  hasConsent,
} from './consent.ts';

/* --------------------------------------------------------- consent itself -- */

test('an unset pair is NOT consent — never inferred from silence', () => {
  assert.equal(hasConsent({ training_consent_at: null, training_consent_version: null }), false);
});

test('a half-set pair is not consent either', () => {
  // A timestamp with no version cannot be shown back as "here is what you
  // agreed to", and a version with no timestamp is not a consent at all.
  assert.equal(
    hasConsent({ training_consent_at: '2026-08-09T00:00:00.000Z', training_consent_version: null }),
    false,
  );
  assert.equal(
    hasConsent({ training_consent_at: null, training_consent_version: 'training-v1' }),
    false,
  );
});

test('both set is consent', () => {
  assert.equal(
    hasConsent({
      training_consent_at: '2026-08-09T00:00:00.000Z',
      training_consent_version: 'training-v1',
    }),
    true,
  );
});

test('consent to an OLD notice is real consent, but not to the current one', () => {
  // Two separate questions on purpose. Collapsing them would let a notice
  // change silently re-authorise everyone, or silently revoke everyone.
  const old = {
    training_consent_at: '2026-08-09T00:00:00.000Z',
    training_consent_version: 'training-v0',
  };
  assert.equal(hasConsent(old), true);
  assert.equal(consentIsCurrent(old, 'training-v1'), false);
});

test('the current version is what the module says it is', () => {
  assert.equal(
    consentIsCurrent({
      training_consent_at: '2026-08-09T00:00:00.000Z',
      training_consent_version: TRAINING_CONSENT_VERSION,
    }),
    true,
  );
});

/* --------------------------------------------- B1.5 · the consent gate in SQL -- */

test('every branch of the extraction query carries the consent predicate', () => {
  // The gate must be in the SQL, not in application code: a filter applied
  // after the rows come back is one early return away from leaking, and the
  // leak looks exactly like a successful extraction.
  const selects = EXTRACTION_SQL.split(/UNION ALL/i);
  assert.ok(selects.length >= 2, 'the query shape changed — re-check this test');
  for (const [i, branch] of selects.entries()) {
    assert.ok(
      branch.includes('training_consent_at IS NOT NULL'),
      `branch ${i} can select rows from a user who never consented`,
    );
    assert.ok(
      branch.includes('training_consent_version IS NOT NULL'),
      `branch ${i} accepts a half-set consent pair`,
    );
  }
});

test('the consent predicate checks BOTH columns', () => {
  assert.match(CONSENT_PREDICATE, /training_consent_at IS NOT NULL/);
  assert.match(CONSENT_PREDICATE, /training_consent_version IS NOT NULL/);
});

test('every branch joins users — a branch that does not cannot be gated', () => {
  for (const branch of EXTRACTION_SQL.split(/UNION ALL/i)) {
    assert.match(branch, /JOIN users u ON u\.id =/, 'a branch has no user to check consent against');
  }
});

/* ------------------------------------ B2.3 · what may never be extracted -- */

test('the query touches NO client-document or matter-note table', () => {
  // The advocate cannot consent to this on their client's behalf — the data is
  // not theirs to give. DPDP breach regardless of consent wording.
  const sql = EXTRACTION_SQL.toLowerCase();
  for (const table of FORBIDDEN_SOURCES) {
    assert.ok(
      !new RegExp(`\\b(from|join)\\s+${table}\\b`).test(sql),
      `extraction reads ${table}, which is confidential third-party data`,
    );
  }
});

test('the annotation branch excludes deleted rows', () => {
  // A deleted annotation is a withdrawn signal. Training on it would learn from
  // a judgment the advocate explicitly took back off the matter.
  const save = EXTRACTION_SQL.split(/UNION ALL/i).find((b) => b.includes('judgment_annotations'))!;
  assert.match(save, /deleted_at IS NULL/);
});

test('the annotation branch selects NO note or quote text', () => {
  // An advocate's own note on a judgment is matter-note material — privileged,
  // and often about a specific client's facts. Only the FACT of the save is a
  // signal; the words they wrote are not ours.
  const save = EXTRACTION_SQL.split(/UNION ALL/i).find((b) => b.includes('judgment_annotations'))!;
  assert.ok(!/ja\.note|ja\.quote/.test(save), 'extraction reads an advocate note or quote');
});

test('the forbidden list actually names the dangerous tables', () => {
  // A test that reads an empty list would pass forever while proving nothing.
  assert.ok(FORBIDDEN_SOURCES.includes('documents'));
  assert.ok(FORBIDDEN_SOURCES.includes('matter_notes'));
  assert.ok(FORBIDDEN_SOURCES.length >= 4);
});

test('nothing is materialised — the extractor contains no write', () => {
  // The whole withdrawal design rests on this. A materialised pairs table would
  // need a deletion job, and the day that job silently fails is the day we are
  // processing data somebody withdrew.
  const sql = EXTRACTION_SQL.toLowerCase();
  for (const write of ['insert into', 'update ', 'delete from', 'create table']) {
    assert.ok(!sql.includes(write), `the extraction query performs a write: ${write}`);
  }
});

test('no party name or matter title is selected', () => {
  const sql = EXTRACTION_SQL.toLowerCase();
  for (const column of ['party', 'matter_title', 'client', 'note_text', 'body']) {
    assert.ok(!sql.includes(column), `extraction selects ${column}, which can identify a client`);
  }
});

/* --------------------------------------------------------------- the pairs -- */

test('signal strength ranks save above copy above search', () => {
  // Saving to a matter is a commitment; copying is a maybe; searching is a
  // guess. A trainer should weight, not guess.
  assert.ok(SIGNAL_WEIGHT.save > SIGNAL_WEIGHT.copy);
  assert.ok(SIGNAL_WEIGHT.copy > SIGNAL_WEIGHT.search);
});

test('the pair schema is versioned, so a bad run stays identifiable', () => {
  assert.match(PAIR_SCHEMA_VERSION, /^pairs-v\d+$/);
});

test('pairs are not coupled to any chat template', () => {
  // TRAINING_STRATEGY.md §1. A dataset built around one model's 2026 prompt
  // format is worth nothing the next time that format changes.
  const sql = EXTRACTION_SQL.toLowerCase();
  for (const token of ['<|im_start|>', 'system:', 'assistant:', '[inst]']) {
    assert.ok(!sql.includes(token), `the extractor bakes in a chat template: ${token}`);
  }
});
