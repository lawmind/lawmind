/**
 * The corpus-activation gate, at the level where its DECISIONS live.
 *
 * These functions decide whether a restored generation may become the one
 * advocates search. They take plain records rather than a database on purpose:
 * the property under test is the RULE, and a rule tested only through a live
 * restore is a rule nobody can exercise the failing branches of. The collectors
 * that produce those records (`readStatistics`, `runSearchSmoke`) are exercised
 * by `lcc-corpus-activation-proof.mjs` against two real generations.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  activationDecision,
  smokeVerdict,
  statisticsVerdict,
  type SmokeProbe,
  type TableStatistics,
} from './activation.ts';

const analysed = (table: string, bytes: number): TableStatistics => ({
  table,
  hasRows: bytes > 0,
  sizeBytes: bytes,
  plannerRowEstimate: 1_000,
  lastAnalyze: '2026-09-02 12:00:00+00',
  lastAutoanalyze: null,
  statisticRows: 12,
});

const probe = (name: string, over: Partial<SmokeProbe> = {}): SmokeProbe => ({
  name,
  query: 'q',
  ms: 40,
  results: 3,
  degraded: [],
  outcome: 'matched',
  error: null,
  ...over,
});

describe('optimizer statistics readiness', () => {
  it('a populated, analysed table is ready', () => {
    const v = statisticsVerdict([analysed('judgments', 1_000)]);
    assert.equal(v.ready, true);
    assert.deepEqual(v.unanalyzed, []);
  });

  it('a populated table with NO pg_statistic row is the failure this gate exists for', () => {
    const v = statisticsVerdict([
      {
        table: 'judgments',
        hasRows: true,
        sizeBytes: 151_000_000_000,
        plannerRowEstimate: 0,
        lastAnalyze: null,
        lastAutoanalyze: null,
        statisticRows: 0,
      },
    ]);
    assert.equal(v.ready, false);
    assert.deepEqual(v.unanalyzed, ['judgments']);
  });

  it('AUTOVACUUM counts — "never manually ANALYZEd" is not "no statistics"', () => {
    /**
     * The distinction the round brief insists on. A table autovacuum analysed
     * has `last_analyze = null` and a full set of `pg_statistic` rows, and the
     * planner is perfectly well served by it. Reading the timestamp instead of
     * the statistics would refuse a healthy corpus and send an operator to run a
     * corpus-wide ANALYZE it does not need.
     */
    const v = statisticsVerdict([
      {
        table: 'judgments',
        hasRows: true,
        sizeBytes: 151_000_000_000,
        plannerRowEstimate: 9_000_000,
        lastAnalyze: null,
        lastAutoanalyze: '2026-08-30 03:11:00+00',
        statisticRows: 38,
      },
    ]);
    assert.equal(v.ready, true, 'autoanalyzed is analyzed');
    assert.deepEqual(v.unanalyzed, []);
  });

  it('an EMPTY table is ready and is reported, not failed', () => {
    /* PostgreSQL writes no pg_statistic row for a relation with no rows. A plan
     * over zero rows built from zero statistics is a correct plan, and failing
     * here would make every bounded test release refuse activation for ever. */
    const v = statisticsVerdict([
      {
        table: 'judgment_chunks',
        hasRows: false,
        sizeBytes: 0,
        plannerRowEstimate: 0,
        lastAnalyze: null,
        lastAutoanalyze: null,
        statisticRows: 0,
      },
    ]);
    assert.equal(v.ready, true);
    assert.deepEqual(v.empty, ['judgment_chunks']);
    assert.deepEqual(v.unanalyzed, []);
  });

  it('an empty table with non-zero ON-DISK SIZE is still empty', () => {
    /**
     * The regression `lcc-corpus-activation-proof.mjs` caught before this gate
     * could ever run for real.
     *
     * `pg_table_size` counts the TOAST table, the free space map and the
     * visibility map, so a relation created seconds ago with nothing in it is
     * already several kilobytes. Deciding "populated" from that reported five
     * genuinely empty tables as populated-and-unanalysed and REFUSED a correct
     * generation — the gate failing closed on its own instrument.
     *
     * `hasRows` is an `EXISTS` probe and is the only field the verdict reads.
     */
    const v = statisticsVerdict([
      {
        table: 'judgment_chunks',
        hasRows: false,
        sizeBytes: 24_576,
        plannerRowEstimate: 0,
        lastAnalyze: '2026-09-02 12:00:00+00',
        lastAutoanalyze: null,
        statisticRows: 0,
      },
    ]);
    assert.equal(v.ready, true, 'TOAST and FSM overhead is not data');
    assert.deepEqual(v.empty, ['judgment_chunks']);
    assert.deepEqual(v.unanalyzed, []);
  });

  it('a search-critical table missing from the generation is refused', () => {
    const v = statisticsVerdict([
      {
        table: 'lexeme_document_frequency',
        hasRows: null,
        sizeBytes: null,
        plannerRowEstimate: null,
        lastAnalyze: null,
        lastAutoanalyze: null,
        statisticRows: 0,
      },
    ]);
    assert.equal(v.ready, false);
    assert.deepEqual(v.absent, ['lexeme_document_frequency']);
    assert.deepEqual(v.unanalyzed, [], 'absent is a different fact from unanalysed');
  });
});

describe('search smoke readiness', () => {
  it('a generation that answers is ready', () => {
    const v = smokeVerdict([probe('exact citation'), probe('CNR')]);
    assert.equal(v.ready, true);
    assert.deepEqual(v.failed, []);
  });

  it('a REFUSAL is a pass — the search path working on a query it declines to rank', () => {
    const v = smokeVerdict([
      probe('filtered lexical', {
        results: 0,
        outcome: 'unbounded',
        degraded: ['sparse_unbounded'],
      }),
      probe('exact citation'),
    ]);
    assert.equal(v.ready, true, 'an honest refusal must not block a release');
  });

  it('a probe that THREW is disqualifying', () => {
    const v = smokeVerdict([
      probe('CNR', {
        error: 'relation "lexeme_document_frequency" does not exist',
        outcome: 'threw',
        results: 0,
      }),
      probe('exact citation'),
    ]);
    assert.equal(v.ready, false);
    assert.deepEqual(v.failed, ['CNR']);
  });

  it('every class answering zero is refused, however clean the checksums were', () => {
    const v = smokeVerdict([probe('exact citation', { results: 0 }), probe('CNR', { results: 0 })]);
    assert.equal(v.ready, false);
    assert.equal(v.allEmpty, true);
  });

  it('a smoke that never ran is not a pass', () => {
    const v = smokeVerdict([]);
    assert.equal(v.ready, false);
  });

  it('SLOWNESS is reported and does not refuse — no threshold is invented here', () => {
    /* V7.2's Gate S1 is a 3-second p95 over the fixed suite in STAGING. A restore
     * rehearsal on a laptop may not quietly become a second, stricter gate. */
    const v = smokeVerdict([probe('normal research query', { ms: 14_000 })]);
    assert.equal(v.ready, true);
    assert.equal(v.slowestMs, 14_000);
  });
});

describe('the activation gate', () => {
  const ready = {
    restoreVerified: true,
    statistics: statisticsVerdict([analysed('judgments', 10)]),
    smoke: smokeVerdict([probe('exact citation')]),
  };

  it('activates only when integrity, statistics and smoke all pass', () => {
    const d = activationDecision(ready);
    assert.equal(d.verdict, 'ACTIVATE');
    assert.equal(d.activate, true);
    assert.deepEqual(d.reasons, []);
  });

  it('REFUSES a generation with no statistics, even with a verified restore', () => {
    const d = activationDecision({
      ...ready,
      statistics: statisticsVerdict([
        {
          table: 'judgments',
          hasRows: true,
          sizeBytes: 151_000_000_000,
          plannerRowEstimate: 0,
          lastAnalyze: null,
          lastAutoanalyze: null,
          statisticRows: 0,
        },
      ]),
    });
    assert.equal(d.verdict, 'REFUSE');
    assert.match(d.reasons.join(' '), /no optimizer statistics/);
    assert.match(d.reasons.join(' '), /judgments/);
  });

  it('REFUSES a generation whose search smoke failed, even with perfect statistics', () => {
    const d = activationDecision({
      ...ready,
      smoke: smokeVerdict([probe('CNR', { error: 'boom', outcome: 'threw', results: 0 })]),
    });
    assert.equal(d.verdict, 'REFUSE');
    assert.match(d.reasons.join(' '), /search smoke threw on: CNR/);
  });

  it('integrity is still a prerequisite and is named FIRST', () => {
    /* Analysing a generation whose rows are wrong does not make it servable, so
     * the reason an operator should act on first is printed first. */
    const d = activationDecision({
      restoreVerified: false,
      statistics: statisticsVerdict([
        {
          table: 'judgments',
          hasRows: true,
          sizeBytes: 8_192,
          plannerRowEstimate: 10,
          lastAnalyze: null,
          lastAutoanalyze: null,
          statisticRows: 0,
        },
      ]),
      smoke: smokeVerdict([probe('CNR', { error: 'boom', outcome: 'threw', results: 0 })]),
    });
    assert.equal(d.verdict, 'REFUSE');
    assert.match(d.reasons[0]!, /restore did not verify/);
    assert.equal(
      d.reasons.length,
      3,
      'every reason, not the first — fixing one at a time is a bad day',
    );
  });
});
