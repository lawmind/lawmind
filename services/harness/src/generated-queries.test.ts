/**
 * The GENERATED/GOLD boundary, asserted rather than trusted.
 *
 * Founder direction, NEW1, 14 Aug 2026: *"For each generated query: mark it
 * GENERATED, not GOLD. Only validated corpus relationships or audited
 * judgments can become gold labels."*
 *
 * TypeScript enforces half of that — `GeneratedItem.provenance` is a
 * single-member literal and the gold fixtures have no such field, so the two
 * shapes cannot be assigned to each other. The half TypeScript CANNOT enforce
 * is a JSON file: a fixture written by hand, or by a future CLI that forgot,
 * carries no types at all. That is what the fixture sweep below covers, and it
 * is the case that would actually happen.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  PROMPT_VERSION,
  VARIANTS_PER_QUERY,
  isCorpusCheckable,
  parseStringArray,
  promptFor,
  readCache,
  toItems,
  writeCache,
} from './generated-queries.ts';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

test('no gold fixture contains a GENERATED marker', () => {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'expected fixtures to exist — a vacuous sweep proves nothing');
  for (const f of files) {
    const raw = readFileSync(`${FIXTURE_DIR}${f}`, 'utf8');
    assert.equal(
      raw.includes('GENERATED'),
      false,
      `${f} contains a GENERATED marker. Model output has reached a gold fixture — this is the ` +
        'one thing the generated-query path must never do.',
    );
  }
});

test('gold ids are inherited from the source query, never invented', () => {
  const items = toItems(
    'query_expansion',
    ['rephrased one', 'rephrased two'],
    { id: 'civil-abc', goldJudgmentIds: ['jud-1', 'jud-2'] },
    'deepseek/deepseek-v4-flash',
    () => '2026-08-14T00:00:00.000Z',
  );
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.equal(it.provenance, 'GENERATED');
    assert.equal(it.sourceQueryId, 'civil-abc');
    assert.deepEqual([...it.inheritedGoldJudgmentIds], ['jud-1', 'jud-2']);
    // Not yet checked against the corpus. `null` is UNKNOWN and must not
    // start life as `true` — that would be a claim made before the check.
    assert.equal(it.corpusValidated, null);
    assert.equal(it.promptVersion, PROMPT_VERSION);
  }
});

test('duplicate variants collapse, case- and whitespace-insensitively', () => {
  const items = toItems(
    'query_expansion',
    ['Same Text', 'same   text', 'different'],
    { id: 'q', goldJudgmentIds: ['g'] },
    'm',
  );
  assert.equal(items.length, 2, 'a duplicate adds a benchmark row and no information');
});

test('no prompt asks the model which authority is correct', () => {
  // The concordance evaluation measured 10.8% fabrication on exactly that
  // question. This asserts the shape of the ask, not the model's behaviour.
  const forbidden = [
    /which case/i,
    /which authority/i,
    /most relevant/i,
    /is this citation real/i,
    /find the case/i,
    /judgment id/i,
  ];
  const kinds = [
    'query_expansion',
    'terminology_synonym',
    'citation_phrasing',
    'case_name_variation',
    'adversarial',
    'difficulty_label',
  ] as const;
  for (const k of kinds) {
    const p = promptFor(k, 'SOME INPUT');
    for (const re of forbidden) {
      assert.equal(re.test(p), false, `prompt for ${k} asks a truth question: ${re}`);
    }
    assert.ok(p.includes('SOME INPUT'), `prompt for ${k} dropped its input`);
    assert.ok(
      p.includes(String(VARIANTS_PER_QUERY)),
      `prompt for ${k} does not state how many variants it wants`,
    );
  }
});

test('the parser refuses anything that is not a clean JSON string array', () => {
  assert.deepEqual(parseStringArray('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parseStringArray('```json\n["a"]\n```'), ['a']);
  // A lenient parser would "recover" a list here. Recovering is inventing.
  assert.deepEqual(parseStringArray('Sure! Here are some: 1. alpha 2. beta'), []);
  assert.deepEqual(parseStringArray('{"variants":["a"]}'), []);
  assert.deepEqual(parseStringArray('[1, 2, 3]'), []);
  assert.deepEqual(parseStringArray('["", "  ", "real"]'), ['real']);
  assert.deepEqual(parseStringArray('not json at all'), []);
});

test('the cache round-trips, and the prompt version is part of the key', () => {
  const input = `unit-test-input-${Date.now()}`;
  const model = 'test-model';
  assert.equal(readCache('query_expansion', input, model), null, 'cold cache must miss');
  writeCache('query_expansion', input, model, '["a"]');
  assert.equal(readCache('query_expansion', input, model), '["a"]');
  // A different KIND on the same input is a different question and must not
  // collide, or an adversarial prompt would be served an expansion's answer.
  assert.equal(readCache('adversarial', input, model), null);
  // A different MODEL likewise — two models' answers are not interchangeable.
  assert.equal(readCache('query_expansion', input, 'other-model'), null);
});

test('only the two kinds that make a corpus claim are corpus-checkable', () => {
  assert.equal(isCorpusCheckable('citation_phrasing'), true);
  assert.equal(isCorpusCheckable('case_name_variation'), true);
  // These make no claim the corpus can settle, so they must stay UNKNOWN
  // rather than be handed a tick that means nothing.
  assert.equal(isCorpusCheckable('query_expansion'), false);
  assert.equal(isCorpusCheckable('adversarial'), false);
  assert.equal(isCorpusCheckable('difficulty_label'), false);
  assert.equal(isCorpusCheckable('terminology_synonym'), false);
});
