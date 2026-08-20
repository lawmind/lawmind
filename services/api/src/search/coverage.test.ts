/**
 * The rules that make this contract safe are all rules about the WORST case, and
 * every one of them has a way of being got backwards: a covered year vouching
 * for a blackout year, an unmeasured cell reading as covered, an acquisition
 * state absorbing a retrieval one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type CoverageCell, summarise, UNKNOWN_COVERAGE } from './coverage.ts';

const cell = (over: Partial<CoverageCell>): CoverageCell => ({
  court: 'High Court of Bombay',
  year: 2008,
  state: 'COVERED',
  held: 100,
  sourceEstimate: 100,
  sourceProvenance: 'HC_METADATA_SURVEY perCourtPerYear',
  heldShare: 1,
  reachability: 'EMBEDDED',
  embedded: 100,
  ...over,
});

describe('summarise', () => {
  it('no cells is UNKNOWN — absence of a measurement is not good news', () => {
    assert.deepEqual(summarise([]), UNKNOWN_COVERAGE);
    assert.equal(summarise([]).state, 'UNKNOWN');
  });

  it('the WORST cell decides: one blackout year is not covered by twenty good ones', () => {
    const cells = [
      ...Array.from({ length: 20 }, (_, i) => cell({ year: 1990 + i })),
      cell({ year: 2008, state: 'KNOWN_GAP', held: 0, heldShare: 0 }),
    ];
    assert.equal(summarise(cells).state, 'KNOWN_GAP');
  });

  it('UNKNOWN outranks COVERED, so one unmeasured year cannot ride on the rest', () => {
    assert.equal(summarise([cell({}), cell({ year: 2009, state: 'UNKNOWN' })]).state, 'UNKNOWN');
  });

  it('SOURCE_HAS_ZERO does NOT outrank a gap that is ours', () => {
    const cells = [cell({ state: 'SOURCE_HAS_ZERO' }), cell({ year: 2009, state: 'PARTIAL' })];
    assert.equal(summarise(cells).state, 'PARTIAL');
  });

  it('SOURCE_HAS_ZERO still beats COVERED — it is a fact about the selection, not silence', () => {
    assert.equal(summarise([cell({}), cell({ year: 2009, state: 'SOURCE_HAS_ZERO' })]).state, 'SOURCE_HAS_ZERO');
  });

  it('reachability is summarised INDEPENDENTLY and never folded into state', () => {
    const r = summarise([cell({ reachability: 'LEXICAL_ONLY', embedded: 0 })]);
    assert.equal(r.state, 'COVERED', 'held in full');
    assert.equal(r.reachability, 'LEXICAL_ONLY', 'and unreachable by the dense arm at the same time');
  });

  it('one unreachable cell makes the selection unreachable', () => {
    const cells = [cell({}), cell({ year: 2009, reachability: 'LEXICAL_ONLY', embedded: 0 })];
    assert.equal(summarise(cells).reachability, 'LEXICAL_ONLY');
  });

  it('carries the source provenance through, because the denominator has a known defect', () => {
    const [c] = summarise([cell({ state: 'PARTIAL', held: 10, heldShare: 0.1 })]).cells;
    assert.match(c?.sourceProvenance ?? '', /HC_METADATA_SURVEY/);
    assert.equal(c?.heldShare, 0.1, 'held_share travels so a product policy can draw its own line');
  });

  it('invents no measurement date when the caller has none', () => {
    assert.equal(summarise([cell({})]).measuredAt, null);
    assert.equal(summarise([cell({})], '2026-08-20T00:00:00.000Z').measuredAt, '2026-08-20T00:00:00.000Z');
  });
});
