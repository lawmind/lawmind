import { alertNarrative, statusPhrase } from './alertNarrative';
import type { Alert } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A CITATOR ALERT IS ALLOWED TO SAY.
 *
 * An alert reports a CHANGE. `citations/fanout.ts` writes `fromStatus` and
 * `toStatus` into the payload for exactly that reason, and `alerts/route.ts`
 * adds `currentOverruledStatus` — "what the corpus says RIGHT NOW — may differ
 * from `toStatus` above."
 *
 * The client rendered only the current status until 11 Aug 2026, which dropped
 * the movement, dropped the affected paragraphs, and — the part that made this
 * a safety fix rather than a copy fix — rendered a current reading of `none` as
 * **"is now good law again"**, asserting that a court restored the authority.
 * `fanout.ts` says `none` cannot even be a `toStatus`, so that reading means
 * the CORPUS changed, which may be a data correction and not a judicial act.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'alr_1',
  kind: 'saved_authority_moved',
  severity: 'batched',
  judgmentId: 'jdg_1',
  matterId: null,
  fromStatus: 'none',
  toStatus: 'set_aside',
  judgmentTitle: 'Mock Authority v. Mock State',
  overruledParas: null,
  currentOverruledStatus: 'set_aside',
  createdAt: '2026-08-11T00:00:00.000Z',
  readAt: null,
  ...over,
});

describe('how the advocate is connected to the authority', () => {
  it('says "saved" for an authority saved to a matter', () => {
    expect(alertNarrative(alert()).headline).toBe(
      'Mock Authority v. Mock State — an authority you saved'
    );
  });

  it('says "filed" for one that reached a document', () => {
    expect(alertNarrative(alert({ kind: 'filed_citation_moved' })).headline).toBe(
      'Mock Authority v. Mock State — an authority you filed'
    );
  });
});

/**
 * THE MOVEMENT IS THE ALERT. Two authorities now `set_aside`, one from good law
 * and one already doubted, are different events for an advocate mid-brief — and
 * they read identically when only the current status is shown.
 */
describe('the change being reported', () => {
  it('states that it has moved since the advocate used it', () => {
    expect(alertNarrative(alert()).movement).toBe('It has been set aside since you used it.');
  });

  it('states the earlier state where the authority had already moved once', () => {
    expect(
      alertNarrative(alert({ fromStatus: 'doubted', toStatus: 'set_aside' })).movement
    ).toBe('It was already doubted when you used it, and has since been set aside.');
  });

  it('names the paragraphs on a partly set aside authority', () => {
    expect(
      alertNarrative(
        alert({
          toStatus: 'partly_set_aside',
          currentOverruledStatus: 'partly_set_aside',
          overruledParas: [19, 20],
        })
      ).movement
    ).toBe('It has been partly set aside — paras 19–20 since you used it.');
  });

  it('says the single paragraph in the singular', () => {
    expect(
      alertNarrative(
        alert({
          toStatus: 'partly_set_aside',
          currentOverruledStatus: 'partly_set_aside',
          overruledParas: [19],
        })
      ).movement
    ).toContain('para 19');
  });

  /**
   * Attaching an extent to a WHOLE set-aside would imply a limit that does not
   * exist — the more dangerous of the two directions.
   */
  it('never attaches an extent to a whole set aside', () => {
    expect(alertNarrative(alert({ overruledParas: [19, 20] })).movement).toBe(
      'It has been set aside since you used it.'
    );
  });
});

/**
 * THE CORPUS CAN MOVE AGAIN AFTER AN ALERT FIRES. Showing one reading and
 * dropping the other chooses for the advocate which one they may check.
 */
describe('when the record has changed since the alert', () => {
  it('says nothing extra while the two agree', () => {
    expect(alertNarrative(alert()).sinceThen).toBeUndefined();
  });

  it('states the newer reading without discarding what the alert was about', () => {
    const n = alertNarrative(alert({ toStatus: 'doubted', currentOverruledStatus: 'set_aside' }));

    expect(n.movement).toContain('doubted since you used it');
    expect(n.sinceThen).toBe('The record now shows it as set aside.');
  });

  /** The regression: this rendered as "is now good law again". */
  it('never claims a court restored the authority', () => {
    const n = alertNarrative(alert({ currentOverruledStatus: 'none' }));

    expect(n.sinceThen).toBe(
      'The record no longer shows it as moved. Check it before you rely on that.'
    );
    expect(`${n.headline} ${n.movement} ${n.sinceThen}`).not.toContain('good law again');
  });

  it('still reports the movement the alert fired for, even then', () => {
    expect(alertNarrative(alert({ currentOverruledStatus: 'none' })).movement).toBe(
      'It has been set aside since you used it.'
    );
  });
});

/**
 * THREE STATES ONLY. `none` is deliberately not expressible here.
 *
 * A first draft returned "good law" for it and `adversarial.test.ts` refused
 * the string — verified is SILENT, and a positive stamp is the one thing this
 * product does not print. That holds even in the past tense: "it was good law
 * when you used it" is still us vouching for the authority. `none` is carried
 * by sentence structure instead ("since you used it"), which reports what our
 * record showed without claiming the authority was sound.
 */
describe('statusPhrase', () => {
  it.each([
    ['set_aside', 'set aside'],
    ['partly_set_aside', 'partly set aside'],
    ['doubted', 'doubted'],
  ] as const)('renders %s as prose, never as an enum', (status, phrase) => {
    expect(statusPhrase(status)).toBe(phrase);
  });
});

describe('the product never stamps an authority good law', () => {
  it('reports the earlier state without vouching for it', () => {
    const n = alertNarrative(alert());

    expect(n.movement).toBe('It has been set aside since you used it.');
    expect(n.movement).not.toMatch(/good law/i);
  });

  it('says nothing positive even when the record has moved back', () => {
    const n = alertNarrative(alert({ currentOverruledStatus: 'none' }));

    expect(`${n.movement} ${n.sinceThen}`).not.toMatch(/good law/i);
  });
});
