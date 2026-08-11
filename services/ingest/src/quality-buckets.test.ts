import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyQuality } from './quality-buckets.ts';
import type { QualityInput } from './quality-buckets.ts';

const good: QualityInput = {
  contentHash: 'hash-1',
  cnr: 'BRHC010440502024',
  textQuality: 0.98,
  hasCitationExtraction: true,
  isExactDuplicate: false,
};

test('A: identity complete, undamaged, extraction run, not a duplicate', () => {
  assert.equal(classifyQuality(good).bucket, 'A');
});

test('D: no content_hash, regardless of everything else', () => {
  assert.equal(classifyQuality({ ...good, contentHash: null }).bucket, 'D');
});

test('D: text_quality never computed (null), even with content_hash present', () => {
  assert.equal(classifyQuality({ ...good, textQuality: null }).bucket, 'D');
});

test('C: text_quality below the 0.90 floor', () => {
  const r = classifyQuality({ ...good, textQuality: 0.85 });
  assert.equal(r.bucket, 'C');
  assert.match(r.reasons[0]!, /below 0.90/);
});

test('C wins over D-adjacent conditions once text_quality is present but low — exact boundary at 0.90', () => {
  assert.equal(classifyQuality({ ...good, textQuality: 0.9 }).bucket, 'A');
  assert.equal(classifyQuality({ ...good, textQuality: 0.899 }).bucket, 'C');
});

test('B: undamaged text but missing cnr', () => {
  assert.equal(classifyQuality({ ...good, cnr: null }).bucket, 'B');
});

test('B: undamaged text but a member of an exact-duplicate group', () => {
  assert.equal(classifyQuality({ ...good, isExactDuplicate: true }).bucket, 'B');
});

test('B: undamaged text but citation extraction has not run', () => {
  assert.equal(classifyQuality({ ...good, hasCitationExtraction: false }).bucket, 'B');
});

test('negative control: high text_quality alone does not force A when identity is incomplete', () => {
  const r = classifyQuality({ ...good, cnr: undefined, textQuality: 0.999 });
  assert.notEqual(r.bucket, 'A');
});

// Found by running quality-report-cli.ts against production: 78,934 rows
// carried "cnr present" as a reported "reason contributing to a non-A
// bucket", because a satisfied condition was being pushed into the same
// `reasons` array as a degrading one. The bucket assignment itself was
// unaffected (only a missing cnr degrades), but the report's own reasons
// breakdown was wrong. This asserts the fix stays fixed.
test('A rows report no reasons at all — nothing satisfied should ever appear as a reason', () => {
  assert.deepEqual(classifyQuality(good).reasons, []);
});

test('a present cnr never appears as a reason string, even on a degraded row', () => {
  const r = classifyQuality({ ...good, isExactDuplicate: true });
  assert.equal(r.bucket, 'B');
  assert.ok(!r.reasons.some((reason) => reason.includes('cnr present')));
});
