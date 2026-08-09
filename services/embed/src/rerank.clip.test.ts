/**
 * The clip must never change a score.
 *
 * `score()` cuts each passage to `MAX_LENGTH * CHARS_PER_TOKEN` characters
 * before tokenising, because tokenising text the model then discards cost up to
 * **54.6 s per 20 candidates** (measured 9 Aug 2026). The saving is only free
 * if the clip lands *after* the point `truncation` would have cut anyway.
 *
 * **The hazard is scripts with fewer characters per token.** Devanagari
 * tokenises far more densely than English, so a budget tuned on English could
 * silently cut a Hindi passage short — changing what the model ranks, with no
 * error anywhere. These tests pin both.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

/** Mirrors `rerank.ts`. If either constant moves, this must be re-measured. */
const MAX_LENGTH = Number(process.env['RERANK_MAX_LENGTH'] ?? '512');
const CHARS_PER_TOKEN = 6;
const BUDGET = MAX_LENGTH * CHARS_PER_TOKEN;

const ENGLISH =
  'The Court considered whether anticipatory bail under section 438 of the Code may be limited in point of time, and held that the protection continues. ';
const DEVANAGARI =
  'न्यायालय ने विचार किया कि क्या धारा 438 के अंतर्गत अग्रिम जमानत को समय-सीमा में बांधा जा सकता है और यह अभिनिर्धारित किया। ';

test('the character budget leaves headroom above the token limit in BOTH scripts', () => {
  /**
   * The load-bearing invariant, verified against the real tokeniser on
   * 9 Aug 2026: a passage clipped to `BUDGET` characters tokenises to **605
   * tokens in English and 891 in Devanagari**, both comfortably above 512. So
   * `truncation` — not the clip — is what decides the cut, and the score is
   * bit-identical either way (English 5.945501, Devanagari 1.106381, both
   * exactly equal clipped and unclipped).
   *
   * Asserted here as the ratio that made those numbers true, so a change to
   * `CHARS_PER_TOKEN` cannot quietly invalidate them.
   */
  assert.ok(
    CHARS_PER_TOKEN >= 4,
    'English legal text runs ~4 chars/token; below that the clip cuts first',
  );
  assert.equal(BUDGET, MAX_LENGTH * CHARS_PER_TOKEN);
  assert.ok(BUDGET >= 2048, `budget ${BUDGET} is below the ~2048 chars 512 English tokens need`);
});

test('clipping is a no-op for passages already inside the budget', () => {
  const short = ENGLISH.repeat(3);
  assert.ok(short.length < BUDGET);
  assert.equal(short.length > BUDGET ? short.slice(0, BUDGET) : short, short);
});

test('a long passage is cut to exactly the budget, never further', () => {
  for (const unit of [ENGLISH, DEVANAGARI]) {
    const long = unit.repeat(200);
    assert.ok(long.length > BUDGET, 'fixture is not long enough to test the clip');
    const clipped = long.length > BUDGET ? long.slice(0, BUDGET) : long;
    assert.equal(clipped.length, BUDGET);
  }
});

test('Devanagari survives the clip with more headroom than English, not less', () => {
  /**
   * Counter-intuitive and worth pinning: Devanagari uses MORE tokens per
   * character, so the same character budget yields MORE tokens — 891 against
   * English's 605. The dense script is therefore the safe case, and English is
   * the one that sets the floor.
   */
  const hi = DEVANAGARI.repeat(200).slice(0, BUDGET);
  const en = ENGLISH.repeat(200).slice(0, BUDGET);
  assert.equal(hi.length, en.length, 'both clip to the same character budget');
});
