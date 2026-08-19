import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyCorruption } from './text-corruption.ts';
import {
  MIN_CHAR_RETENTION,
  MIN_SCRIPT_RETENTION,
  checkScriptRetention,
  devanagariTokens,
} from './script-retention.ts';

/**
 * Devanagari is written as escapes, never as literal bytes in a source file.
 * `docs/DEVANAGARI_EXTRACTION_DEFECTS.md` §0 records a whole measurement thrown
 * away because literal Devanagari was mangled crossing a shell boundary, and the
 * broken filter then "found" corruption in documents containing no Devanagari at
 * all. A test whose fixtures can be silently transcoded proves nothing.
 */
const HINDI = 'न्यायालय'; // नयायालय
const HINDI2 = 'याचिका'; // याचिका

describe('devanagariTokens', () => {
  it('counts tokens carrying the script, not characters', () => {
    assert.equal(devanagariTokens(`In the ${HINDI} of ${HINDI2} today`), 2);
  });

  it('is zero for text with no Devanagari at all', () => {
    assert.equal(devanagariTokens('IN THE HIGH COURT OF JUDICATURE AT BOMBAY'), 0);
  });

  it('does not count an empty string as a token', () => {
    assert.equal(devanagariTokens('   '), 0);
  });
});

describe('checkScriptRetention', () => {
  it('REFUSES the measured poppler failure — Devanagari in, none out', () => {
    const original = `${HINDI} ${HINDI2} ${HINDI} ${HINDI2} ${HINDI} order of the court`;
    const replacement = 'order of the court and rather more text besides to be safe';
    const verdict = checkScriptRetention(original, replacement);
    assert.equal(verdict.accept, false);
    assert.equal(verdict.reason, 'DEVANAGARI_SCRIPT_LOSS');
    assert.equal(verdict.replacementDevanagariTokens, 0);
  });

  it('REFUSES script loss even when the replacement is LONGER — the guard "never shorter" misses', () => {
    /**
     * This is document 04ceaa01 in CX1's sample, in miniature: Allahabad 2026,
     * 2,252 chars with 8 Devanagari tokens replaced by 2,314 chars with none.
     * Longer, structurally clean, and missing its Hindi — it passes every guard
     * that existed before this module.
     */
    const original = `${HINDI} ${HINDI2} ${HINDI} ${HINDI2} ${HINDI} ${HINDI2} short`;
    const replacement = `an appreciably longer english only rendering of the same order ${'x'.repeat(200)}`;
    assert.ok(replacement.length > original.length, 'fixture must be longer to be the real case');
    const verdict = checkScriptRetention(original, replacement);
    assert.equal(verdict.accept, false);
    assert.equal(verdict.reason, 'DEVANAGARI_SCRIPT_LOSS');
    assert.ok(verdict.charRetention > 1);
  });

  it('and text-corruption alone would have ACCEPTED that replacement', () => {
    /**
     * The two guards are shown failing on the same input in one test, because
     * "the other check would have caught it" is the assumption that leaves a
     * hole open. `classifyCorruption` is asked directly and must say clean.
     */
    const replacement = `${'The State of Maharashtra filed an appeal before this Court. '.repeat(4)}`;
    const verdict = classifyCorruption(replacement);
    assert.ok(verdict, 'fixture must be long enough to classify');
    assert.equal(verdict.corrupt, false, 'ASCII-only poppler output scores CLEAN');
  });

  it('refuses degradation short of total loss', () => {
    const original = Array.from({ length: 10 }, () => HINDI).join(' ');
    const replacement = `${HINDI} ${HINDI2} english filler to keep the character count up`;
    const verdict = checkScriptRetention(original, replacement);
    assert.equal(verdict.accept, false);
    assert.equal(verdict.reason, 'DEVANAGARI_SCRIPT_DEGRADED');
    assert.ok((verdict.scriptRetention ?? 1) < MIN_SCRIPT_RETENTION);
  });

  it('accepts a replacement that keeps the script and the length', () => {
    const original = `${HINDI} ${HINDI2} ${HINDI} ${HINDI2} ${HINDI} the order of the court`;
    const verdict = checkScriptRetention(original, original);
    assert.equal(verdict.accept, true);
    assert.equal(verdict.reason, 'OK');
    assert.equal(verdict.scriptRetention, 1);
  });

  it('accepts an English-only document — there is no script to lose', () => {
    const original = 'IN THE HIGH COURT OF JUDICATURE AT BOMBAY, appeal dismissed';
    const verdict = checkScriptRetention(original, `${original} with more text`);
    assert.equal(verdict.accept, true);
    assert.equal(verdict.scriptRetention, null, 'no ratio is claimed where there is no denominator');
  });

  it('still refuses total loss below the ratio floor — a floor is not an excuse', () => {
    /**
     * Two Devanagari tokens is under MIN_ORIGINAL_TOKENS_TO_JUDGE, so no
     * retention RATIO is reported. Losing both is still losing both.
     */
    const original = `${HINDI} ${HINDI2} an otherwise english judgment of some length`;
    const verdict = checkScriptRetention(original, 'an otherwise english judgment of some length');
    assert.equal(verdict.accept, false);
    assert.equal(verdict.reason, 'DEVANAGARI_SCRIPT_LOSS');
    assert.equal(verdict.scriptRetention, null);
  });

  it('catches the character loss that Punjab and Haryana showed, script aside', () => {
    /** poppler returns 54% less text there — `reextract-cli.ts` header. */
    const original = 'x'.repeat(1000);
    const verdict = checkScriptRetention(original, 'x'.repeat(460));
    assert.equal(verdict.accept, false);
    assert.equal(verdict.reason, 'CHARACTER_LOSS');
    assert.ok(verdict.charRetention < MIN_CHAR_RETENTION);
  });

  it('does not divide by an empty original', () => {
    const verdict = checkScriptRetention('', 'anything at all');
    assert.equal(verdict.accept, true);
    assert.equal(Number.isFinite(verdict.charRetention), true);
  });
});
