/**
 * The data-trust fields NEW3's contract requires, asserted where they are
 * PRODUCED rather than through a live HTTP call.
 *
 * These are the fields that stop a client from making a claim the corpus cannot
 * support. Each test below names the false statement it prevents; a test that
 * only checked the key existed would pass against a field carrying a lie.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { graphCoverage } from './graph-coverage.ts';
import { disabledMonitoringFields, USER_MONITORING_PRODUCT } from '../court/monitoring-fields.ts';

describe('citation graph partiality — G-3', () => {
  it('declares partial, and cannot be flipped by moving a threshold', () => {
    const c = graphCoverage();
    /**
     * There is no coverage level at which this graph becomes a complete
     * statement about Indian citation practice. A boolean that COULD read false
     * would eventually read false because somebody moved a number, so the type
     * itself is `true`. Completing the graph means REMOVING this field
     * deliberately, not flipping it.
     */
    assert.equal(c.declaredPartial, true);
  });

  it('coverage is defined on RESOLVED EDGES, not on row presence', () => {
    const c = graphCoverage();
    /**
     * The banned claim: "every judgment has its citations mapped" is
     * arithmetically true of row presence — every judgment has at least one
     * `judgment_citations` row — and false in meaning, because 71.97% of those
     * rows are the blank sentinel meaning "we looked and found nothing".
     *
     * So the declared coverage must be a small share of the corpus. If this ever
     * approaches 1 without a deliberate change to the artifact, the denominator
     * has been swapped for a flattering one.
     */
    assert.ok(
      c.outgoingCoverageShare > 0,
      'coverage cannot be zero — 105,024 judgments have edges',
    );
    assert.ok(
      c.outgoingCoverageShare < 0.5,
      `declared coverage ${c.outgoingCoverageShare} — a majority share means the denominator changed`,
    );
    assert.ok(c.corpusDenominator > c.judgmentsWithAnyResolvedOutgoing);
  });

  it('says out loud that a missing edge is not a missing citation', () => {
    /**
     * The distinction an advocate must not get wrong, and the reason the
     * sentence lives on the server: three clients paraphrasing it will produce
     * three different claims, and one of them will be "this judgment cites
     * nothing".
     */
    const note = graphCoverage().note.toLowerCase();
    assert.ok(note.includes('partial'), 'the note must say the graph is partial');
    assert.ok(
      note.includes('absence of an edge is never absence of a citation'),
      'the note must refuse the inference an empty graph invites',
    );
  });
});

describe('monitoring fields — frozen shape, disabled capability', () => {
  it('publishes all six fields', () => {
    const m = disabledMonitoringFields();
    for (const key of [
      'monitoringPolicy',
      'lastObservedAt',
      'nextPlannedObservationAt',
      'observationSource',
      'lastObservationOutcome',
      'monitoringDegradedReason',
    ]) {
      assert.ok(key in m, `the frozen contract names ${key} and it is absent`);
    }
  });

  it('the outcome is never_attempted, not null', () => {
    /**
     * The field most likely to be misread. `null` invites "unknown, probably
     * fine"; `never_attempted` cannot be read as a result. Zero observations
     * exist and nothing in the tree writes one.
     */
    assert.equal(disabledMonitoringFields().lastObservationOutcome, 'never_attempted');
  });

  it('carries no date, no policy and no source while disabled', () => {
    const m = disabledMonitoringFields();
    /**
     * A date in `nextPlannedObservationAt` is a COMMITMENT. It may only ever be
     * populated from a real scheduler entry, never computed from a policy
     * string — that would be a promise derived from a description of a promise.
     */
    assert.equal(m.nextPlannedObservationAt, null);
    assert.equal(m.lastObservedAt, null);
    assert.equal(
      m.monitoringPolicy,
      null,
      'a policy nobody priced may not be shown to an advocate',
    );
    assert.equal(m.observationSource, null);
  });

  it('the product state is published beside the fields, not inferred from six nulls', () => {
    assert.equal(USER_MONITORING_PRODUCT, 'DISABLED_NOT_READY');
  });
});
