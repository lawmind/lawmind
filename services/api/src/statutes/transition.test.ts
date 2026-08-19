/**
 * The criminal-transition decision procedure.
 *
 * ---------------------------------------------------------------------------
 * THE CASE THAT MADE THIS NECESSARY
 * ---------------------------------------------------------------------------
 *
 * NEW1's `adv-5-no-date-so-no-regime`, captured 18 Aug 2026:
 *
 *     "My client is charged with cheating. What is the punishment and which
 *      section applies?"
 *
 * answered with IPC 417 and IPC 420, two punishment ranges, no hedge and no
 * question about the date. Whether the IPC applies at all depends on a fact
 * nobody asked for.
 *
 * The first assertion below is therefore the load-bearing one: **that exact
 * string must route criminal.** It hits none of the harness's own criminal
 * markers — no code name, no `bail`, no `FIR`, no `accused` — so a marker list
 * built for retrieval routing would have let it through silently.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AND IS NOT ASSERTED AGAINST A DATABASE
 * ---------------------------------------------------------------------------
 *
 * `raisesCriminalQuestion` is pure and is tested exhaustively without one.
 *
 * `assessTransition` reads `statutes`, so on the empty CI database it correctly
 * returns `unavailable` — and that is asserted as the CORRECT behaviour rather
 * than skipped, because refusing when the source rows are missing is the whole
 * design. The determinate/indeterminate paths are then driven through a stub
 * that supplies the three rows, so the date arithmetic is tested everywhere,
 * corpus or no corpus.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assessTransition,
  raisesCriminalQuestion,
  resetCommencementCache,
  transitionContext,
  type TransitionVerdict,
} from './transition.ts';

/** The three rows `assessTransition` reads, as Postgres returns them. */
const COMMENCEMENT_ROWS = [
  { short_title: 'The Bharatiya Nyaya Sanhita, 2023', enforcement_date: new Date('2024-07-01T00:00:00Z'), source_url: 'https://www.indiacode.nic.in/handle/123456789/20062' },
  { short_title: 'The Bharatiya Nagarik Suraksha Sanhita, 2023', enforcement_date: new Date('2024-07-01T00:00:00Z'), source_url: 'https://www.indiacode.nic.in/handle/123456789/20099' },
  { short_title: 'The Bharatiya Sakshya Adhiniyam, 2023', enforcement_date: new Date('2024-07-01T00:00:00Z'), source_url: 'https://www.indiacode.nic.in/handle/123456789/20063' },
];

/**
 * A tagged-template stub shaped like `postgres`. Returns whatever rows it is
 * given, which is all `commencementEvidence` needs.
 */
function stubSql(rows: unknown[]): never {
  const fn = (): Promise<unknown[]> => Promise.resolve(rows);
  return fn as never;
}

describe('raisesCriminalQuestion', () => {
  it('routes adv-5 criminal — the string that hits no code name at all', () => {
    assert.equal(
      raisesCriminalQuestion('My client is charged with cheating. What is the punishment and which section applies?'),
      true,
      'adv-5 must route criminal. It contains no code name, no bail, no FIR and no ' +
        '"accused" — a marker list built for retrieval routing lets it through, and ' +
        'that is exactly how it reached an advocate as a confident IPC answer.',
    );
  });

  for (const q of [
    'section 302 IPC punishment',
    'BNS 103 sentence',
    'anticipatory bail in an NDPS case',
    'is the FIR quashable',
    'my client is accused of criminal breach of trust',
    'what is the punishment for forgery',
    'dowry death investigation',
  ]) {
    it('criminal: ' + q, () => assert.equal(raisesCriminalQuestion(q), true));
  }

  /**
   * False positives cost one unnecessary question; false negatives cost a
   * confident answer under the wrong code. These stay non-criminal anyway so
   * the breadth does not silently swallow the whole product.
   */
  for (const q of [
    'specific performance of an agreement to sell',
    'what is the limitation period for a partition suit',
    'stamp duty on a lease deed in Maharashtra',
    'winding up petition under the Companies Act',
  ]) {
    it('not criminal: ' + q, () => assert.equal(raisesCriminalQuestion(q), false));
  }
});

describe('assessTransition', () => {
  it('a non-criminal question never reaches the database', async () => {
    resetCommencementCache();
    let called = false;
    const sql = ((): never => {
      called = true;
      return Promise.resolve([]) as never;
    }) as never;
    const v = await assessTransition(sql, { text: 'limitation period for a partition suit' });
    assert.equal(v.kind, 'not_criminal');
    assert.equal(called, false, 'a civil question must not pay for a statute read');
    assert.equal(transitionContext(v), null, 'nothing to say means nothing appended');
  });

  it('REFUSES rather than assuming a date when the statute rows are missing', async () => {
    resetCommencementCache();
    const v = await assessTransition(stubSql([]), { text: 'punishment for cheating' });
    assert.equal(v.kind, 'unavailable');
    const ctx = transitionContext(v)!;
    assert.match(ctx, /CANNOT BE ESTABLISHED/);
    assert.match(ctx, /Do not state which code governs/);
  });

  it('adv-5 with no date is INDETERMINATE and names the one missing fact', async () => {
    resetCommencementCache();
    const v = await assessTransition(stubSql(COMMENCEMENT_ROWS), {
      text: 'My client is charged with cheating. What is the punishment and which section applies?',
    });
    assert.equal(v.kind, 'indeterminate');
    assert.equal((v as Extract<TransitionVerdict, { kind: 'indeterminate' }>).mustAsk, 'offence_date');

    const ctx = transitionContext(v)!;
    /**
     * The fixture requires the refusal to mention "date" and "2024", and to name
     * no section. Asserted here on the CONTEXT rather than on model output,
     * because that is the half this repository controls — whether the model then
     * obeys is what `pnpm adversarial` measures.
     */
    assert.match(ctx, /date/i);
    assert.match(ctx, /2024/);
    assert.match(ctx, /ask when the offence is alleged to have occurred/i);
    assert.ok(!/\b(417|420|318)\b/.test(ctx), 'the context must not name a section — naming either one is the failure');
  });

  it('an offence the day BEFORE commencement is governed by the old codes', async () => {
    resetCommencementCache();
    const v = await assessTransition(stubSql(COMMENCEMENT_ROWS), {
      text: 'punishment for cheating',
      offenceDate: '2024-06-30',
    });
    assert.equal(v.kind, 'determinate');
    assert.equal((v as Extract<TransitionVerdict, { kind: 'determinate' }>).regime, 'pre_bns');
    assert.match(transitionContext(v)!, /Indian Penal Code, 1860/);
    assert.match(transitionContext(v)!, /Do not answer under BNS, BNSS or BSA/);
  });

  it('an offence ON the commencement date is governed by the NEW codes', async () => {
    resetCommencementCache();
    const v = await assessTransition(stubSql(COMMENCEMENT_ROWS), {
      text: 'punishment for cheating',
      offenceDate: '2024-07-01',
    });
    assert.equal((v as Extract<TransitionVerdict, { kind: 'determinate' }>).regime, 'post_bns');
    assert.match(transitionContext(v)!, /Do not answer under the IPC, CrPC or Evidence Act/);
  });

  /**
   * The boundary is the entire decision, so both sides of it are pinned. An
   * off-by-one here silently reverses the answer for every offence on 30 June or
   * 1 July 2024 and produces no error of any kind.
   */
  it('a malformed or partial date is treated as ABSENT, never parsed generously', async () => {
    resetCommencementCache();
    for (const bad of ['2024', '01/07/2024', 'last summer', '', '   ']) {
      const v = await assessTransition(stubSql(COMMENCEMENT_ROWS), {
        text: 'punishment for cheating',
        offenceDate: bad,
      });
      assert.equal(v.kind, 'indeterminate', JSON.stringify(bad) + ' must not be accepted as a date');
    }
  });

  it('rows that disagree on the commencement date produce a REFUSAL, not a pick', async () => {
    resetCommencementCache();
    const disagreeing = [
      COMMENCEMENT_ROWS[0]!,
      { ...COMMENCEMENT_ROWS[1]!, enforcement_date: new Date('2024-08-01T00:00:00Z') },
      COMMENCEMENT_ROWS[2]!,
    ];
    const v = await assessTransition(stubSql(disagreeing), {
      text: 'punishment for cheating',
      offenceDate: '2024-07-15',
    });
    assert.equal(v.kind, 'unavailable', 'three codes commencing on different days is a per-code question, not a per-date one');
  });
});
