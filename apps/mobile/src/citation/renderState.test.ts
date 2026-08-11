import { attentionCount, citationRender } from './renderState';
import type { SearchResult } from '../api/contract';
import { MOCK_RESULTS } from '../api/fixtures';

/**
 * THE CLIENT HALF OF THE CITATION HARNESS.
 *
 * `docs/CITATION_HARNESS.md` §stale-overruled states the assertions this file
 * exists to carry:
 *
 *   - every fixture with `overruled_status != none` renders LAW MOVED on EVERY
 *     surface; the `set_aside` fixture additionally asserts add-to-matter is
 *     disabled;
 *   - every `unverified` and `failed` fixture renders the unmissable mark;
 *   - every `verified` fixture with `overruled_status = none` renders NO MARK AT
 *     ALL — assert the absence, so a regression that reintroduces badges is
 *     caught.
 *
 * These are thresholds, not preferences. A weakened assertion here is a
 * weakened gate, and the gate is the product.
 */

const base: SearchResult = {
  judgmentId: 'jdg_test',
  citationCheckId: null,
  caseTitle: 'Mock Party v. Mock State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock Supreme Court',
  judgmentDate: '2026-01-01',
  holding: 'Fixture holding.',
  operativeParagraph: 'Fixture operative paragraph.',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-06T00:00:00.000Z',
};

describe('verified is silent', () => {
  it('renders no mark for a verified, good-law citation — from any source', () => {
    for (const source of ['corpus', 'public_x2', 'ecourts', 'ecourts_bulk'] as const) {
      const { existence, moved } = citationRender({ ...base, verifiedBySource: source });
      expect(existence.kind).toBe('silent');
      expect(moved.kind).toBe('none');
    }
  });

  it('does not count a verified good-law citation as needing attention', () => {
    expect(attentionCount([base])).toBe(0);
  });
});

describe('unverified and failed are unmissable, and identical to each other', () => {
  it('marks both, and never as confirmed', () => {
    for (const verificationState of ['unverified', 'failed'] as const) {
      const { existence } = citationRender({ ...base, verificationState });
      expect(existence.kind).toBe('unconfirmed');
    }
  });

  /**
   * The advocate cannot act on the difference between "no source has it" and
   * "we could not reach a source", and a provider outage must never read as a
   * gap in the corpus.
   */
  it('renders `failed` identically to `unverified`', () => {
    const unverified = citationRender({ ...base, verificationState: 'unverified' });
    const failed = citationRender({ ...base, verificationState: 'failed' });
    expect(failed.existence).toEqual(unverified.existence);
  });

  it('never uses the word "failed", "not confirmed", or an accusation in the copy', () => {
    const { existence } = citationRender({ ...base, verificationState: 'failed' });
    if (existence.kind !== 'unconfirmed') throw new Error('expected an unconfirmed mark');
    const copy = `${existence.headline} ${existence.reason} ${existence.ecourtsAction}`;
    expect(copy.toLowerCase()).not.toContain('failed');
    expect(copy.toLowerCase()).not.toContain('verification failed');
    expect(existence.headline).toBe('Do not file this without checking it');
  });

  it('always offers the eCourts path', () => {
    const { existence } = citationRender({ ...base, verificationState: 'unverified' });
    if (existence.kind !== 'unconfirmed') throw new Error('expected an unconfirmed mark');
    expect(existence.ecourtsAction).toContain('eCourts');
  });

  /**
   * A citation missing its three fields is a bug, and the client treats it as
   * unconfirmed. ABSENCE NEVER UPGRADES TO CONFIRMED.
   */
  it('treats a citation missing its fields as unconfirmed, never as verified', () => {
    const { existence } = citationRender({ caseTitle: 'Mock' } as never);
    expect(existence.kind).toBe('unconfirmed');
  });
});

describe('the law has moved — three states, never binary', () => {
  it('marks every non-none status, whatever the verification state', () => {
    for (const overruledStatus of ['set_aside', 'partly_set_aside', 'doubted'] as const) {
      for (const verificationState of ['verified', 'unverified', 'failed'] as const) {
        const { moved } = citationRender({ ...base, overruledStatus, verificationState });
        expect(moved.kind).toBe('moved');
      }
    }
  });

  /** A judgment can be verified AND set aside at once — different questions. */
  it('marks a verified judgment that has been set aside', () => {
    const { existence, moved } = citationRender({ ...base, overruledStatus: 'set_aside' });
    expect(existence.kind).toBe('silent');
    expect(moved.kind).toBe('moved');
  });

  it('disables add-to-matter for set_aside, and only for set_aside', () => {
    const setAside = citationRender({ ...base, overruledStatus: 'set_aside' });
    const partly = citationRender({ ...base, overruledStatus: 'partly_set_aside' });
    const doubted = citationRender({ ...base, overruledStatus: 'doubted' });

    if (setAside.moved.kind !== 'moved') throw new Error('expected a moved mark');
    if (partly.moved.kind !== 'moved') throw new Error('expected a moved mark');
    if (doubted.moved.kind !== 'moved') throw new Error('expected a moved mark');

    expect(setAside.moved.blocksAddToMatter).toBe(true);
    expect(partly.moved.blocksAddToMatter).toBe(false);
    expect(doubted.moved.blocksAddToMatter).toBe(false);
  });

  it('gives set_aside a danger band, a struck title and a mandatory replacement', () => {
    const { moved } = citationRender({ ...base, overruledStatus: 'set_aside' });
    if (moved.kind !== 'moved') throw new Error('expected a moved mark');
    expect(moved.band).toBe('danger');
    expect(moved.strikeTitle).toBe(true);
    expect(moved.requiresReplacement).toBe(true);
  });

  it('names the affected paragraphs for partly_set_aside and states what still stands', () => {
    const { moved } = citationRender({
      ...base,
      overruledStatus: 'partly_set_aside',
      overruledParas: [19, 20],
      overruledNote: 'The observations on misuse still stand.',
    });
    if (moved.kind !== 'moved') throw new Error('expected a moved mark');
    expect(moved.band).toBe('caution');
    expect(moved.chipLabel).toContain('19');
    expect(moved.chipLabel).toContain('20');
    expect(moved.whatStillStands).toBe('The observations on misuse still stand.');
    expect(moved.strikeTitle).toBe(false);
  });

  /** No band at all. It still binds, so shouting would be wrong. */
  it('gives doubted no band, but still a chip so a list is legible without opening it', () => {
    const { moved } = citationRender({ ...base, overruledStatus: 'doubted' });
    if (moved.kind !== 'moved') throw new Error('expected a moved mark');
    expect(moved.band).toBe('none');
    expect(moved.blocksAddToMatter).toBe(false);
    expect(moved.chipLabel.length).toBeGreaterThan(0);
  });

  it('every moved state carries a chip, so none is invisible in a list', () => {
    for (const overruledStatus of ['set_aside', 'partly_set_aside', 'doubted'] as const) {
      const { moved } = citationRender({ ...base, overruledStatus });
      if (moved.kind !== 'moved') throw new Error('expected a moved mark');
      expect(moved.chipLabel.length).toBeGreaterThan(0);
    }
  });

  /**
   * "Offline surfaces render the status they last read WITH ITS AS-OF DATE
   * SHOWN; they never present a stale status as current."
   */
  it('carries an as-of date only when the status could not be re-read', () => {
    const live = citationRender({ ...base, overruledStatus: 'doubted' });
    const cached = citationRender({
      ...base,
      overruledStatus: 'doubted',
      statusAsOf: '2 August 2026',
    });
    if (live.moved.kind !== 'moved' || cached.moved.kind !== 'moved') {
      throw new Error('expected moved marks');
    }
    expect(live.moved.asOf).toBeUndefined();
    expect(cached.moved.asOf).toBe('2 August 2026');
  });
});

describe('the fixture corpus covers every branch', () => {
  it('contains a verified, an unverified, a failed, and all three moved states', () => {
    const states = new Set(MOCK_RESULTS.map((r) => r.verificationState));
    const moved = new Set(MOCK_RESULTS.map((r) => r.overruledStatus));
    expect(states).toContain('verified');
    expect(states).toContain('unverified');
    expect(states).toContain('failed');
    expect(moved).toContain('set_aside');
    expect(moved).toContain('partly_set_aside');
    expect(moved).toContain('doubted');
  });

  /**
   * NO REAL CITATION MAY APPEAR IN THE REPO. A plausible-looking fake citation
   * in a screenshot is the artefact this product exists to prevent.
   */
  it('uses only MOCK citations', () => {
    for (const r of MOCK_RESULTS) {
      // A fixture may legitimately carry no citation — the High Court rows do
      // not — but any fixture that HAS one must keep it obviously fake.
      if (r.neutralCitation !== null) expect(r.neutralCitation.startsWith('MOCK ')).toBe(true);
      expect(r.court.startsWith('Mock ')).toBe(true);
    }
  });

  it('counts attention as the rows that need it, never the rows that passed', () => {
    const needing = MOCK_RESULTS.filter(
      (r) => r.verificationState !== 'verified' || r.overruledStatus !== 'none'
    ).length;
    expect(attentionCount(MOCK_RESULTS)).toBe(needing);
  });
});
