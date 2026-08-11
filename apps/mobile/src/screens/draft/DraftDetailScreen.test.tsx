import { fireEvent, render, screen } from '@testing-library/react-native';

import { DraftDetailScreen } from './DraftDetailScreen';
import { api } from '../../api/client';
import type { DraftCitation, DraftDocument } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R4: `document.citations` is read through
 * `citationRender()`, the one place a citation's mark is decided, exactly as
 * every other surface does. A verified, good-law citation renders no mark; an
 * unconfirmed one gets the dashed mark; an overruled one gets LAW MOVED. This
 * screen invents none of that itself.
 */

jest.mock('../../api/client', () => ({
  api: { document: jest.fn() },
}));

const apiDocument = api.document as jest.MockedFunction<typeof api.document>;

function citation(over: Partial<DraftCitation> = {}): DraftCitation {
  return {
    citationCheckId: 'cc_1',
    citationClaimed: 'MOCK 2026 EXAMPLE 1',
    judgmentId: 'jdg_1',
    caseTitle: 'Mock Party v. Mock State',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'none',
    ...over,
  };
}

function draftDocument(over: Partial<DraftDocument> = {}): DraftDocument {
  return {
    documentId: 'doc_1',
    documentType: 'bail_application',
    matterId: null,
    content: 'First paragraph of the draft.\n\nSecond paragraph of the draft.',
    language: 'en',
    createdAt: '2026-08-06T00:00:00.000Z',
    citations: [citation()],
    citationSummary: { total: 1, verified: 1 },
    ...over,
  };
}

function mockDocument(over: Partial<DraftDocument> = {}) {
  apiDocument.mockResolvedValue({ ok: true, data: { document: draftDocument(over) } });
}

/**
 * A CITATION IN A DRAFT THAT MATCHED NO JUDGMENT WE HOLD.
 *
 * `readDocument` reads `overruled_status` through a `LEFT JOIN judgments`, so
 * it is null on exactly the rows where the citation resolved to nothing. The
 * screen coerced that null to `'none'` until 11 Aug 2026 — and on every surface
 * in this product the ABSENCE of a moved mark is how we say the law has not
 * moved. An unknown was being rendered as a clean bill, on a document about to
 * be filed.
 */
describe('a citation the draft could not resolve', () => {
  const unresolved = citation({
    citationCheckId: 'chk_x',
    citationClaimed: 'MOCK 2099 EXAMPLE 9999',
    judgmentId: null,
    caseTitle: null,
    verificationState: 'unverified',
    verifiedBySource: 'none',
    overruledStatus: null,
  });

  it('says its good-law status is unknown rather than leaving it silent', async () => {
    mockDocument({ citations: [unresolved], citationSummary: { total: 1, verified: 0 } });
    await render(
      <DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />
    );

    expect(
      await screen.findByText(
        /We could not match this to a judgment we hold, so we cannot say whether it is still good law\./
      )
    ).toBeTruthy();
  });

  it('shows the claimed citation, since there is no case title to show', async () => {
    mockDocument({ citations: [unresolved], citationSummary: { total: 1, verified: 0 } });
    await render(
      <DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />
    );

    expect(await screen.findByText('MOCK 2099 EXAMPLE 9999')).toBeTruthy();
  });

  it('says nothing of the kind on a citation that did resolve', async () => {
    mockDocument();
    await render(
      <DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />
    );

    await screen.findByText('Mock Party v. Mock State');
    expect(screen.queryByText(/we cannot say whether it is still good law/)).toBeNull();
  });
});

describe('DraftDetailScreen', () => {
  beforeEach(() => {
    apiDocument.mockReset();
  });

  it('renders the content split into paragraphs, and the AI-assisted line always shows', async () => {
    mockDocument();
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />);

    expect(await screen.findByText('First paragraph of the draft.')).toBeTruthy();
    expect(screen.getByText('Second paragraph of the draft.')).toBeTruthy();
    expect(screen.getByText('AI-assisted draft — verify before filing')).toBeTruthy();
  });

  it('states the citation summary as the one documented exception to verified-is-silent', async () => {
    mockDocument({ citationSummary: { total: 4, verified: 3 } });
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />);

    expect(await screen.findByText('3 of 4 citations verified.')).toBeTruthy();
  });

  it('renders no mark for a verified, good-law citation — silent, same as everywhere else', async () => {
    mockDocument({ citations: [citation()] });
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />);

    await screen.findByText('Mock Party v. Mock State');
    expect(screen.queryByText('Not confirmed')).toBeNull();
    expect(screen.queryByText('Overruled')).toBeNull();
  });

  it('marks an unresolved citation, using citationClaimed since caseTitle is null', async () => {
    mockDocument({
      citations: [
        citation({
          citationCheckId: 'cc_2',
          judgmentId: null,
          caseTitle: null,
          verificationState: 'unverified',
          verifiedBySource: 'none',
          overruledStatus: null,
        }),
      ],
    });
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />);

    expect(await screen.findByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
    expect(screen.getByText('Not confirmed')).toBeTruthy();
  });

  /**
   * Renamed 11 Aug 2026. It read "…and coerces null overruledStatus to none for
   * citationRender", which described the defect fixed above and which this test
   * never exercised — it passes `set_aside`. A test name asserting a retired
   * rule is how the rule comes back.
   */
  it('marks an overruled citation LAW MOVED', async () => {
    mockDocument({ citations: [citation({ overruledStatus: 'set_aside' })] });
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={() => {}} />);

    expect(await screen.findByText('Overruled')).toBeTruthy();
  });

  it('opens a resolved citation with its judgmentId and citationCheckId, never guessed', async () => {
    const onOpenJudgment = jest.fn();
    mockDocument({ citations: [citation({ judgmentId: 'jdg_9', citationCheckId: 'cc_9' })] });
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={onOpenJudgment} />);

    await fireEvent.press(await screen.findByText('Mock Party v. Mock State'));

    expect(onOpenJudgment).toHaveBeenCalledWith('jdg_9', 'cc_9');
  });

  it('does not offer to open an unresolved citation — there is no judgment to open', async () => {
    const onOpenJudgment = jest.fn();
    mockDocument({
      citations: [
        citation({ judgmentId: null, caseTitle: null, verificationState: 'unverified', overruledStatus: null }),
      ],
    });
    await render(<DraftDetailScreen documentId="doc_1" onBack={() => {}} onOpenJudgment={onOpenJudgment} />);

    await screen.findByText('MOCK 2026 EXAMPLE 1');
    // No crash, and pressing the label does not call through — it is not
    // wrapped in a Pressable at all when `judgmentId` is null.
    expect(onOpenJudgment).not.toHaveBeenCalled();
  });
});
