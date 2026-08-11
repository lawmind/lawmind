import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ResultCard } from './ResultCard';
import { NO_CITATION_MARK } from '../citation/citationDisplay';
import type { SearchResult } from '../api/contract';
import { useOutbox } from '../state/outbox';

/**
 * ACTIONS ON A SEARCH RESULT, AND THE SAFETY STATE THEY MUST RESPECT.
 *
 * Until 11 Aug 2026 every action required opening the judgment first. The risk
 * in bringing them onto the card is that a list row is where an advocate acts
 * fastest and reads least, so each action has to carry the same guarantees the
 * detail screen gives — from the same helpers, not from a second copy of the
 * rules.
 *
 * `CITATION_HARNESS.md` §"The fourth concern" governs the split under test:
 * an UNCITABLE judgment is warned about but never blocked, while `set_aside`
 * is the one state where Lawmind refuses to let an authority be used.
 */

const setString = Clipboard.setStringAsync as jest.MockedFunction<
  typeof Clipboard.setStringAsync
>;

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const cited: SearchResult = {
  judgmentId: 'jdg_sc',
  citationCheckId: 'chk_1',
  caseTitle: 'Mock Appellant v. Union of India',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock Supreme Court',
  judgmentDate: '2026-01-01',
  holding: '',
  operativeParagraph: 'The considered view of this Court.',
  operativeParagraphNumber: 12,
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-11T00:00:00.000Z',
};

const uncitable: SearchResult = {
  ...cited,
  judgmentId: 'jdg_hc',
  caseTitle: 'Mock Petitioner v. State of Bihar',
  neutralCitation: null,
  reporterCitations: [],
  court: 'Patna High Court',
};

beforeEach(() => {
  setString.mockClear();
  useOutbox.setState({ pending: [] });
});

describe('copy — a verified citation', () => {
  it('copies the case name and the citation, from the shared helper', async () => {
    await render(<ResultCard result={cited} />);

    await fireEvent.press(screen.getByText('Copy citation'));

    expect(setString).toHaveBeenCalledWith(
      'Mock Appellant v. Union of India, MOCK 2026 EXAMPLE 1'
    );
  });

  it('confirms the copy happened rather than leaving the tap silent', async () => {
    await render(<ResultCard result={cited} />);

    await fireEvent.press(screen.getByText('Copy citation'));

    expect(screen.getByText('Copied')).toBeTruthy();
  });
});

describe('copy — a judgment with no citation', () => {
  /** THE REGRESSION. `${title}, ${null}` put "…, null" one paste from a filing. */
  it('never fabricates a citation and never emits the word null', async () => {
    await render(<ResultCard result={uncitable} />);

    await fireEvent.press(screen.getByText('Copy case name'));

    expect(setString).toHaveBeenCalledWith('Mock Petitioner v. State of Bihar');
    const copied = String(setString.mock.calls[0]?.[0]);
    expect(copied).not.toContain('null');
    expect(copied).not.toContain(NO_CITATION_MARK);
    expect(copied).not.toMatch(/\[|\]|n\.d\./i);
  });

  /** The label must promise only what the paste delivers. */
  it('says it will copy the case name, not the citation', async () => {
    await render(<ResultCard result={uncitable} />);

    expect(screen.getByText('Copy case name')).toBeTruthy();
    expect(screen.queryByText('Copy citation')).toBeNull();
  });

  it('warns on the card, because the action alone cannot carry it', async () => {
    await render(<ResultCard result={uncitable} />);

    expect(screen.getByText(NO_CITATION_MARK)).toBeTruthy();
  });
});

describe('copy — unverified and conflicting stay offered', () => {
  /**
   * `CITATION_HARNESS.md`: copy is offered in EVERY state, because refusing it
   * destroys the `citation_copies` record that is the only way to warn this
   * advocate later. What changes with state is the string, never the
   * permission — and an unverified citation is still a real citation.
   */
  it.each(['unverified', 'failed'] as const)(
    'still copies the citation on a %s row',
    async (verificationState) => {
      await render(
        <ResultCard result={{ ...cited, verificationState, verifiedBySource: 'none' }} />
      );

      await fireEvent.press(screen.getByText('Copy citation'));

      expect(setString).toHaveBeenCalledWith(
        'Mock Appellant v. Union of India, MOCK 2026 EXAMPLE 1'
      );
    }
  );

  it('copies from a set-aside row too — refusing it would destroy the warning record', async () => {
    await render(<ResultCard result={{ ...cited, overruledStatus: 'set_aside' }} />);

    await fireEvent.press(screen.getByText('Copy citation'));

    expect(setString).toHaveBeenCalledWith(
      'Mock Appellant v. Union of India, MOCK 2026 EXAMPLE 1'
    );
  });
});

describe('add to matter — the one refusal, and the one non-refusal', () => {
  it('is refused for set_aside, and says so instead of leaving a dead button', async () => {
    const onAddToMatter = jest.fn();
    await render(
      <ResultCard
        onAddToMatter={onAddToMatter}
        result={{ ...cited, overruledStatus: 'set_aside' }}
      />
    );

    await fireEvent.press(screen.getByText('Cannot be added to a matter'));

    expect(onAddToMatter).not.toHaveBeenCalled();
  });

  /**
   * THE HARNESS IS EXPLICIT THAT THIS IS NOT A SECOND REFUSAL. A set-aside
   * judgment is bad law; an uncitable one may be perfectly good law we cannot
   * yet pin-cite, and the advocate has legitimate uses for it.
   */
  it('stays ENABLED for an uncitable judgment — warn, not block', async () => {
    const onAddToMatter = jest.fn();
    await render(<ResultCard onAddToMatter={onAddToMatter} result={uncitable} />);

    await fireEvent.press(screen.getByText('Add to a matter'));

    expect(onAddToMatter).toHaveBeenCalled();
  });

  it.each(['unverified', 'failed'] as const)('stays enabled on a %s row too', async (verificationState) => {
    const onAddToMatter = jest.fn();
    await render(
      <ResultCard
        onAddToMatter={onAddToMatter}
        result={{ ...cited, verificationState, verifiedBySource: 'none' }}
      />
    );

    await fireEvent.press(screen.getByText('Add to a matter'));

    expect(onAddToMatter).toHaveBeenCalled();
  });

  /** No endpoint exists yet, so no surface passes the prop and no button is drawn. */
  it('is not drawn at all when the surface cannot perform it', async () => {
    await render(<ResultCard result={cited} />);

    expect(screen.queryByText('Add to a matter')).toBeNull();
    expect(screen.queryByText('Cannot be added to a matter')).toBeNull();
  });
});

describe('the actions did not displace the evidence', () => {
  it('still renders the operative paragraph and its anchor', async () => {
    const onOpenParagraph = jest.fn();
    await render(<ResultCard onOpenParagraph={onOpenParagraph} result={cited} />);

    expect(screen.getByText('Operative paragraph · 12')).toBeTruthy();
    expect(screen.getByText('The considered view of this Court.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Read paragraph 12 in full'));
    expect(onOpenParagraph).toHaveBeenCalledWith(12);
  });

  it('keeps the card silent for a verified, good-law, citable judgment', async () => {
    await render(<ResultCard result={cited} />);

    expect(screen.queryByText(NO_CITATION_MARK)).toBeNull();
    for (const mark of ['Do not file this without checking it', 'Overruled', 'Verified']) {
      expect(screen.queryByText(mark)).toBeNull();
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RECORD BEHIND THE COPY, which matters more than the paste.
 *
 * `SCHEMA_TRUTH.md#citation_copies`: an advocate who copies a citation into
 * their own document "has taken it out of the app entirely — they saw the
 * badge, they may file it, and without this record NO NOTIFICATION CAN EVER
 * REACH THEM." If that judgment is set aside next March, this row is the only
 * reason we can tell them.
 *
 * `surface` is the server's enum, not a free string: `copyRequest` validates
 * `['search','judgment_detail','briefing','draft','matter']` and rejects
 * anything else with a 400. The outbox never drops an entry, so a rejected copy
 * retries eight times and then sits queued forever — counted, and undeliverable.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the copy record that reaches the fan-out', () => {
  it('queues the copy against this judgment, from this surface', async () => {
    await render(<ResultCard result={cited} />);
    await fireEvent.press(screen.getByLabelText('Copy citation'));

    const queued = useOutbox.getState().pending;
    expect(queued).toHaveLength(1);
    expect(queued[0]?.judgmentId).toBe('jdg_sc');
    expect(queued[0]?.surface).toBe('search');
  });

  /**
   * The handle identifies the check behind THIS row on THIS search. Carried
   * when present, absent when the server could not guarantee row alignment —
   * never invented, because a guessed id points at another judgment's record.
   */
  it('carries the verification handle when the row has one', async () => {
    await render(<ResultCard result={cited} />);
    await fireEvent.press(screen.getByLabelText('Copy citation'));

    expect(useOutbox.getState().pending[0]?.citationCheckId).toBe('chk_1');
  });

  it('omits the handle rather than inventing one when the row has none', async () => {
    await render(<ResultCard result={{ ...cited, citationCheckId: null }} />);
    await fireEvent.press(screen.getByLabelText('Copy citation'));

    expect(useOutbox.getState().pending[0]?.citationCheckId).toBeUndefined();
  });

  /** Refusing the copy would destroy the only record that could warn them. */
  it('still queues a record for a judgment carrying no citation at all', async () => {
    await render(<ResultCard result={uncitable} />);
    await fireEvent.press(screen.getByLabelText('Copy case name'));

    expect(useOutbox.getState().pending).toHaveLength(1);
    expect(useOutbox.getState().pending[0]?.judgmentId).toBe('jdg_hc');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OPENING THE OPERATIVE PARAGRAPH.
 *
 * The card hands out the PRINTED number, which is what `?para=` means and what
 * an advocate cites. The reader converts it to an index at its own boundary —
 * the two must never be confused, and a card that passed an array position
 * would send the advocate to a different paragraph than the one they tapped.
 *
 * A row the server did not locate has no anchor to offer, and the evidence
 * block is not drawn at all rather than linking to a guessed position.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('opening the paragraph the evidence came from', () => {
  it('hands out the number the court printed, not the row position', async () => {
    const onOpenParagraph = jest.fn();
    await render(<ResultCard onOpenParagraph={onOpenParagraph} result={cited} />);

    await fireEvent.press(screen.getByLabelText('Read paragraph 12 in full'));

    expect(onOpenParagraph).toHaveBeenCalledWith(12);
  });

  it('offers no anchor when the server located no paragraph', async () => {
    const onOpenParagraph = jest.fn();
    await render(
      <ResultCard
        onOpenParagraph={onOpenParagraph}
        result={{ ...cited, operativeParagraphNumber: null }}
      />
    );

    expect(screen.queryByLabelText(/Read paragraph/)).toBeNull();
    expect(onOpenParagraph).not.toHaveBeenCalled();
  });

  /**
   * An unlocated passage must not quietly become a link to some other
   * paragraph — the whole row is withheld, evidence included, rather than
   * shown under an anchor it does not have.
   */
  it('never falls back to another paragraph number', async () => {
    await render(<ResultCard result={{ ...cited, operativeParagraphNumber: null }} />);

    expect(screen.queryByText(/Operative paragraph ·/)).toBeNull();
  });
});
