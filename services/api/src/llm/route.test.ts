/**
 * The rules here are the ones whose breach is invisible. A cheap model on
 * sensitive data, or two case files in one context, both produce fluent output
 * that looks entirely correct — so every test below asserts a REFUSAL.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { llmFeatureEnum } from '@lawmind/db';

import {
  ALL_FEATURES,
  CLAUDE_HAIKU_4_5,
  DEEPSEEK_V4_FLASH,
  assertOneDocument,
  dpaCountersigned,
  routeCall,
} from './route.ts';

/* ------------------------------------------- the enum this file must track -- */

/**
 * THE DRIFT THIS CATCHES ALREADY HAPPENED. Migration `0044` added
 * `concordance` to `llm_feature` and `Feature` was never extended, while its
 * own comment claimed the two matched — for a day, a false statement about
 * production routing sat in the file that decides production routing. It broke
 * nothing, because the concordance pass writes `llm_calls` from
 * `services/ingest` without calling `routeCall`, and that is precisely why no
 * one noticed.
 *
 * TypeScript cannot see the database, so it cannot catch this on its own. The
 * assertion is deliberately two-directional: a feature in the enum and not in
 * the code is an unrouted feature, and one in the code and not in the enum is a
 * value that fails on INSERT.
 */
test('every llm_feature in the schema has a route, and vice versa', () => {
  assert.deepEqual(
    [...ALL_FEATURES].sort(),
    [...llmFeatureEnum.enumValues].sort(),
    'services/api/src/llm/route.ts and the llm_feature database enum disagree',
  );
});

test('every feature routes or refuses for an explicit reason — none falls through', () => {
  for (const f of ALL_FEATURES) {
    const r = routeCall('public', f);
    assert.ok(r.ok || r.reason.length > 0, `${f} produced neither a model nor a reason`);
  }
});

afterEach(() => {
  delete process.env['DPA_COUNTERSIGNED'];
  delete process.env['ANTHROPIC_DRAFTING_MODEL'];
});

/* ------------------------------------------------- OD-6 · the DPA refusal -- */

test('SENSITIVE TRAFFIC IS REFUSED with no DPA — and that is the shipped state', () => {
  const r = routeCall('sensitive', 'draft');
  assert.ok(!r.ok, 'sensitive traffic was routed without a DPA');
  assert.match(r.reason, /no countersigned DPA/);
  assert.match(r.reason, /no override/);
});

test('the refusal covers every sensitive feature, not just drafting', () => {
  // Drawn from ALL_FEATURES, not a hand-written list — a hardcoded list here
  // would have quietly stopped covering `concordance` the day it was added.
  for (const f of ALL_FEATURES) {
    assert.equal(routeCall('sensitive', f).ok, false, `${f} was routed without a DPA`);
  }
});

test('an unset or malformed DPA flag is FALSE — absence is never consent', () => {
  for (const bad of [undefined, '', 'false', 'TRUE', 'yes', '1']) {
    if (bad === undefined) delete process.env['DPA_COUNTERSIGNED'];
    else process.env['DPA_COUNTERSIGNED'] = bad;
    assert.equal(dpaCountersigned(), false, `${JSON.stringify(bad)} was read as a signed DPA`);
  }
});

test('once the DPA is signed, sensitive data routes to Claude AND is pseudonymised', () => {
  process.env['DPA_COUNTERSIGNED'] = 'true';
  const r = routeCall('sensitive', 'extract');
  assert.ok(r.ok);
  assert.equal(r.model, CLAUDE_HAIKU_4_5);
  assert.equal(r.pseudonymise, true, 'sensitive data was routed without pseudonymisation');
});

test('public data is NEVER pseudonymised — the flag is not decoration', () => {
  // llm_calls.pseudonymised is what an audit reads. Setting it on public
  // traffic would make the column meaningless.
  const r = routeCall('public', 'search');
  assert.ok(r.ok);
  assert.equal(r.pseudonymise, false);
});

/* ------------------------------------------------------ public-class routing -- */

test('search goes to the cheap model, because the question is already public', () => {
  const r = routeCall('public', 'search');
  assert.ok(r.ok);
  assert.equal(r.model, DEEPSEEK_V4_FLASH);
});

test('extract and OCR post-processing go to Haiku', () => {
  for (const f of ['extract', 'ocr_postprocess'] as const) {
    const r = routeCall('public', f);
    assert.ok(r.ok);
    assert.equal(r.model, CLAUDE_HAIKU_4_5);
  }
});

test('drafting REFUSES rather than guessing a model identifier', () => {
  // An invented model id fails at the first production call, which is the worst
  // place to discover a guess. CLAUDE.md forbids inventing a config key as much
  // as a section number.
  const r = routeCall('public', 'draft');
  assert.ok(!r.ok, 'drafting guessed a model identifier');
  assert.match(r.reason, /ANTHROPIC_DRAFTING_MODEL is not set/);
});

test('drafting works once the identifier is supplied from the vendor', () => {
  process.env['ANTHROPIC_DRAFTING_MODEL'] = 'anthropic/some-verified-id';
  for (const f of ['draft', 'briefing'] as const) {
    const r = routeCall('public', f);
    assert.ok(r.ok);
    assert.equal(r.model, 'anthropic/some-verified-id');
  }
});

test('difficulty never changes the route — only data class and feature do', () => {
  // The rule everyone gets backwards. A hard public question stays cheap.
  process.env['DPA_COUNTERSIGNED'] = 'true';
  const pub = routeCall('public', 'search');
  const sens = routeCall('sensitive', 'search');
  assert.ok(pub.ok);
  assert.ok(sens.ok);
  assert.equal(pub.model, DEEPSEEK_V4_FLASH);
  assert.equal(sens.model, CLAUDE_HAIKU_4_5);
});

/* ------------------------------------------- one document per call -- */

test('TWO DOCUMENTS IN ONE CALL THROWS', () => {
  // The breach is between two of the SAME advocate's clients, and the output
  // reads perfectly fluent. Nothing else would catch it.
  assert.throws(() => assertOneDocument(['doc-a', 'doc-b']), /One document per call/);
});

test('one document, or the same document repeated, is fine', () => {
  assert.doesNotThrow(() => assertOneDocument([]));
  assert.doesNotThrow(() => assertOneDocument(['doc-a']));
  assert.doesNotThrow(() => assertOneDocument(['doc-a', 'doc-a', 'doc-a']));
});

test('three documents throws and says how many', () => {
  assert.throws(() => assertOneDocument(['a', 'b', 'c']), /3 documents/);
});
