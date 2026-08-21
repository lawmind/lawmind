/**
 * The rules are written before the first live observation exists, and tested
 * before it exists, precisely so that the day the kill switch flips nothing is
 * being decided under the pressure of real data.
 *
 * Two properties matter more than the rest and are asserted directly:
 *
 *   * no input can ever produce a claim that a hearing happened;
 *   * a changed next date never destroys the earlier one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  conflicts,
  latestKnownNextDate,
  nextDateChanges,
  project,
  type Observation,
} from './ecourts-derivation.ts';

const base: Observation = {
  id: 'o1',
  observationKind: 'case_status',
  source: 'ecourts',
  observedAt: '2026-02-19T10:00:00Z',
  sourceAssertedAt: null,
  court: 'Bombay High Court',
  cnr: 'MHAU010012342021',
  caseNumber: 'WP/1234/2021',
  listingDate: null,
  nextListingDate: null,
  disposalDate: null,
  caseStatus: null,
  bench: null,
  courtNumber: null,
  itemNumber: null,
  orderRef: null,
  payloadSha256: 'abc',
  extractionState: 'ok',
};

const at = (id: string, when: string, patch: Partial<Observation>): Observation => ({
  ...base,
  id,
  observedAt: when,
  ...patch,
});

describe('a cause-list appearance is LISTED_OBSERVED and never a hearing', () => {
  it('projects LISTED_OBSERVED and says in the row what it does not mean', () => {
    const p = project([at('o1', '2026-03-14T04:00:00Z', { listingDate: '2026-03-14', itemNumber: 12 })]);
    const listed = p.find((x) => x.kind === 'LISTED_OBSERVED');
    assert.ok(listed);
    assert.equal(listed.detail['listingDate'], '2026-03-14');
    assert.match(String(listed.detail['means']), /whether it was reached is unknown/);
  });

  it('NO input produces a projection claiming a hearing occurred', () => {
    const everything = project([
      at('o1', '2026-03-14T04:00:00Z', {
        listingDate: '2026-03-14',
        nextListingDate: '2026-04-02',
        disposalDate: '2026-03-14',
        caseStatus: 'Disposed',
        orderRef: 'ORD/2026/9981',
        itemNumber: 3,
      }),
    ]);
    for (const p of everything) {
      assert.ok(
        !/HEARING|HEARD|ATTENDED|ADJOURNED/i.test(p.kind),
        `projection kind ${p.kind} makes a claim about a courtroom`,
      );
    }
    // And every observable field still produced its own honest projection.
    assert.deepEqual(
      everything.map((p) => p.kind).sort(),
      [
        'DISPOSAL_OBSERVED',
        'LISTED_OBSERVED',
        'NEXT_DATE_OBSERVED',
        'ORDER_AVAILABILITY_CANDIDATE',
      ],
    );
  });
});

describe('a changed next date is two facts, and neither is destroyed', () => {
  const obs = [
    at('o1', '2026-02-19T10:00:00Z', { nextListingDate: '2026-03-02' }),
    at('o2', '2026-02-26T10:00:00Z', { nextListingDate: '2026-03-14' }),
  ];

  it('reports the change with BOTH observations as evidence', () => {
    const [change] = nextDateChanges(obs);
    assert.ok(change);
    assert.equal(change.kind, 'NEXT_DATE_CHANGED');
    assert.deepEqual(change.evidence, ['o1', 'o2']);
    assert.equal(change.detail['fromDate'], '2026-03-02');
    assert.equal(change.detail['toDate'], '2026-03-14');
  });

  it('refuses to characterise WHY it changed', () => {
    const [change] = nextDateChanges(obs);
    assert.match(String(change!.detail['means']), /re-listed or re-read is unknown/);
  });

  it('latest-known carries the history rather than replacing it', () => {
    const latest = latestKnownNextDate(obs);
    assert.equal(latest.nextListingDate, '2026-03-14');
    assert.equal(latest.changed, true);
    assert.deepEqual(
      latest.history.map((h) => h.date),
      ['2026-03-02', '2026-03-14'],
    );
  });

  it('an unchanged date is not reported as a change, and history has one entry', () => {
    const same = [
      at('o1', '2026-02-19T10:00:00Z', { nextListingDate: '2026-03-02' }),
      at('o2', '2026-02-26T10:00:00Z', { nextListingDate: '2026-03-02' }),
    ];
    assert.equal(nextDateChanges(same).length, 0);
    const latest = latestKnownNextDate(same);
    assert.equal(latest.changed, false);
    assert.equal(latest.history.length, 1);
  });
});

describe('the source’s own clock outranks ours when it gives one', () => {
  it('orders by sourceAssertedAt, so a stale page fetched late does not win', () => {
    const stale = at('stale', '2026-02-27T10:00:00Z', {
      sourceAssertedAt: '2026-02-18T00:00:00Z',
      nextListingDate: '2026-03-02',
    });
    const fresh = at('fresh', '2026-02-26T10:00:00Z', {
      sourceAssertedAt: '2026-02-25T00:00:00Z',
      nextListingDate: '2026-03-14',
    });
    const latest = latestKnownNextDate([stale, fresh]);
    assert.equal(latest.nextListingDate, '2026-03-14');
    assert.equal(latest.fromObservationId, 'fresh');
  });
});

describe('an order reference is a candidate, never a document', () => {
  it('projects ORDER_AVAILABILITY_CANDIDATE and denies the corpus link in the row', () => {
    const [p] = project([at('o1', '2026-03-14T04:00:00Z', { orderRef: 'ORD/2026/9981' })]);
    assert.equal(p!.kind, 'ORDER_AVAILABILITY_CANDIDATE');
    assert.match(String(p!.detail['means']), /NOT linked to a corpus judgment/);
  });
});

describe('failures are visible, and disagreement is not resolved by guessing', () => {
  it('a failed extraction says so and makes no claim about the case', () => {
    const [p] = project([
      at('o1', '2026-03-14T04:00:00Z', {
        extractionState: 'captcha_failed',
        listingDate: '2026-03-14',
      }),
    ]);
    assert.equal(p!.kind, 'EXTRACTION_UNUSABLE');
    // The listingDate on the same row is NOT projected — the extraction that
    // produced it failed, so it is not evidence.
    assert.equal(project([
      at('o1', '2026-03-14T04:00:00Z', {
        extractionState: 'captcha_failed',
        listingDate: '2026-03-14',
      }),
    ]).length, 1);
  });

  it('two readings at the same instant that disagree are reported as a conflict', () => {
    const c = conflicts([
      at('o1', '2026-02-26T10:00:00Z', {
        sourceAssertedAt: '2026-02-26T00:00:00Z',
        nextListingDate: '2026-03-02',
      }),
      at('o2', '2026-02-26T10:05:00Z', {
        sourceAssertedAt: '2026-02-26T00:00:00Z',
        nextListingDate: '2026-03-14',
      }),
    ]);
    assert.equal(c.length, 1);
    assert.equal(c[0]!.kind, 'CONFLICTING_OBSERVATIONS');
    assert.deepEqual(c[0]!.evidence.sort(), ['o1', 'o2']);
  });

  it('agreement at the same instant is not a conflict', () => {
    const c = conflicts([
      at('o1', '2026-02-26T10:00:00Z', {
        sourceAssertedAt: '2026-02-26T00:00:00Z',
        nextListingDate: '2026-03-02',
      }),
      at('o2', '2026-02-26T10:05:00Z', {
        sourceAssertedAt: '2026-02-26T00:00:00Z',
        nextListingDate: '2026-03-02',
      }),
    ]);
    assert.equal(c.length, 0);
  });
});
