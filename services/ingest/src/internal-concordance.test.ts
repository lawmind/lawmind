import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyMatch,
  detectCrossTargetCollisions,
  MATCH_MIN_JACCARD,
  NEAR_TIE_RATIO,
  PROMOTION_MIN_DISTINGUISHING_TOKENS,
  PROMOTION_MIN_JACCARD,
  rankCandidatesReportingLag,
  reporterOf,
  type PoolJudgment,
  type PromotionCandidate,
  type ScoredCandidate,
} from './internal-concordance.ts';

/* ------------------------------------------------- rankCandidatesReportingLag -- */

test('rankCandidatesReportingLag: accepts the citation year and the year before, never after', () => {
  const pool: PoolJudgment[] = [
    { id: 'same-year', caseTitle: 'Kharak Singh v. State of U.P.', judgmentDate: '2020-03-01' },
    { id: 'year-before', caseTitle: 'Kharak Singh v. State of U.P.', judgmentDate: '2019-03-01' },
    { id: 'year-after', caseTitle: 'Kharak Singh v. State of U.P.', judgmentDate: '2021-03-01' },
    { id: 'two-years-before', caseTitle: 'Kharak Singh v. State of U.P.', judgmentDate: '2018-03-01' },
  ];
  const out = rankCandidatesReportingLag('Kharak Singh v. State of U.P.', 2020, pool);
  const ids = out.map((c) => c.judgmentId).sort();
  assert.deepEqual(ids, ['same-year', 'year-before']);
});

test('rankCandidatesReportingLag: empty name yields no candidates', () => {
  const pool: PoolJudgment[] = [{ id: 'a', caseTitle: 'State of Bihar v. Anr', judgmentDate: '2020-01-01' }];
  assert.deepEqual(rankCandidatesReportingLag('', 2020, pool), []);
});

test('rankCandidatesReportingLag: filters below MATCH_MIN_JACCARD', () => {
  const pool: PoolJudgment[] = [
    { id: 'unrelated', caseTitle: 'Completely Different Parties Entirely', judgmentDate: '2020-01-01' },
  ];
  const out = rankCandidatesReportingLag('Kharak Singh v. State of U.P.', 2020, pool);
  assert.equal(out.length, 0);
});

test('rankCandidatesReportingLag: sorted highest jaccard first', () => {
  const pool: PoolJudgment[] = [
    { id: 'partial', caseTitle: 'Kharak Singh v. Someone Else Entirely', judgmentDate: '2020-01-01' },
    { id: 'exact', caseTitle: 'Kharak Singh v. State of U.P.', judgmentDate: '2020-01-01' },
  ];
  const out = rankCandidatesReportingLag('Kharak Singh v. State of U.P.', 2020, pool);
  assert.equal(out[0]!.judgmentId, 'exact');
  assert.ok(out[0]!.jaccard >= (out[1]?.jaccard ?? 0));
});

test('rankCandidatesReportingLag: distinguishingTokens counts real intersection, not just the ratio', () => {
  const pool: PoolJudgment[] = [
    { id: 'a', caseTitle: 'Ramesh Kumar Gupta v. State of Madhya Pradesh', judgmentDate: '2020-01-01' },
  ];
  const out = rankCandidatesReportingLag('Ramesh Kumar Gupta v. State of Madhya Pradesh', 2020, pool);
  assert.equal(out.length, 1);
  // RAMESH, KUMAR, GUPTA, MADHYA, PRADESH all survive stopword removal (STATE/OF are stopped).
  assert.ok(out[0]!.distinguishingTokens >= 4, `expected >=4 got ${out[0]!.distinguishingTokens}`);
});

/* --------------------------------------------------------------- classifyMatch -- */

const cand = (over: Partial<ScoredCandidate>): ScoredCandidate => ({
  judgmentId: 'j1',
  caseTitle: 'Some Party v. Another Party',
  judgmentDate: '2020-01-01',
  jaccard: 0.5,
  distinguishingTokens: 5,
  ...over,
});

test('classifyMatch: no candidates -> no_candidate', () => {
  assert.deepEqual(classifyMatch([]), { kind: 'no_candidate' });
});

test('classifyMatch: a single strong candidate -> safe', () => {
  const v = classifyMatch([cand({ jaccard: 0.6, distinguishingTokens: 5 })]);
  assert.equal(v.kind, 'safe');
});

test('classifyMatch: runner-up within NEAR_TIE_RATIO of the winner -> ambiguous', () => {
  const top = cand({ judgmentId: 'top', jaccard: 0.6 });
  const runnerUp = cand({ judgmentId: 'runner', jaccard: 0.6 * NEAR_TIE_RATIO + 0.001 });
  const v = classifyMatch([top, runnerUp]);
  assert.equal(v.kind, 'ambiguous');
});

test('classifyMatch: runner-up comfortably below the ratio -> not ambiguous', () => {
  const top = cand({ judgmentId: 'top', jaccard: 0.6, distinguishingTokens: 5 });
  const runnerUp = cand({ judgmentId: 'runner', jaccard: 0.3 });
  const v = classifyMatch([top, runnerUp]);
  assert.notEqual(v.kind, 'ambiguous');
});

test('classifyMatch: jaccard below PROMOTION_MIN_JACCARD but above MATCH_MIN_JACCARD -> thin', () => {
  assert.ok(PROMOTION_MIN_JACCARD > MATCH_MIN_JACCARD);
  const v = classifyMatch([cand({ jaccard: 0.4, distinguishingTokens: 5 })]);
  assert.equal(v.kind, 'thin');
});

test('classifyMatch: distinguishingTokens at or below the floor -> thin, even with a high jaccard', () => {
  const v = classifyMatch([cand({ jaccard: 0.9, distinguishingTokens: PROMOTION_MIN_DISTINGUISHING_TOKENS })]);
  assert.equal(v.kind, 'thin');
});

test('classifyMatch: exactly at PROMOTION_MIN_JACCARD with enough tokens -> safe', () => {
  const v = classifyMatch([cand({ jaccard: PROMOTION_MIN_JACCARD, distinguishingTokens: 4 })]);
  assert.equal(v.kind, 'safe');
});

/* ------------------------------------------------- detectCrossTargetCollisions -- */

const promo = (over: Partial<PromotionCandidate>): PromotionCandidate => ({
  citationKey: 'K1',
  citationText: '(2020) 3 SCC 216',
  aliasReporter: 'SCC',
  targetJudgmentId: 'j1',
  targetCaseTitle: 'Arjun Panditrao Khotkar v. Kailash Kushanrao Gorantyal',
  jaccard: 0.6,
  corroborations: 3,
  evidence: 'evidence text',
  ...over,
});

test('detectCrossTargetCollisions: one target, one citation key -> safe', () => {
  const { safe, collided } = detectCrossTargetCollisions([promo({})]);
  assert.equal(safe.length, 1);
  assert.equal(collided.length, 0);
});

test('detectCrossTargetCollisions: same judgment claimed by two different citation keys -> both withheld', () => {
  // The exact §3a failure: a referral order and the main judgment, same case name, different citations.
  const referral = promo({ citationKey: 'K-REFERRAL', citationText: '(2020) 3 SCC 216' });
  const main = promo({ citationKey: 'K-MAIN', citationText: '(2020) 7 SCC 1' });
  const { safe, collided } = detectCrossTargetCollisions([referral, main]);
  assert.equal(safe.length, 0);
  assert.equal(collided.length, 2);
});

test('detectCrossTargetCollisions: two DIFFERENT targets are unaffected by each other', () => {
  const a = promo({ citationKey: 'K-A', targetJudgmentId: 'j1' });
  const b = promo({ citationKey: 'K-B', targetJudgmentId: 'j2' });
  const { safe, collided } = detectCrossTargetCollisions([a, b]);
  assert.equal(safe.length, 2);
  assert.equal(collided.length, 0);
});

test('detectCrossTargetCollisions: repeated sightings of the SAME citation key are not a collision', () => {
  // Corroboration, not collision -- multiple HC documents printing the same citation.
  const a = promo({ citationKey: 'K1', targetJudgmentId: 'j1' });
  const b = promo({ citationKey: 'K1', targetJudgmentId: 'j1' });
  const { safe, collided } = detectCrossTargetCollisions([a, b]);
  assert.equal(safe.length, 2);
  assert.equal(collided.length, 0);
});

/* --------------------------------------------------------------------- reporterOf -- */

test('reporterOf: AIR citation', () => {
  assert.equal(reporterOf('AIR 1973 SC 1461'), 'AIR');
});

test('reporterOf: SCC citation', () => {
  assert.equal(reporterOf('(2019) 4 SCC 221'), 'SCC');
});

test('reporterOf: neither -> null', () => {
  assert.equal(reporterOf('[1970] 2 SCR 355'), null);
});

test('reporterOf: AIR checked before SCC when both somehow present', () => {
  assert.equal(reporterOf('AIR 1973 SC 1461 : (1973) 4 SCC 225'), 'AIR');
});
