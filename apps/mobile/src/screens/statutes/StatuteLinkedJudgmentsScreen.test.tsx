import { render, screen } from '@testing-library/react-native';

import { StatuteLinkedJudgmentsScreen } from './StatuteLinkedJudgmentsScreen';
import { api } from '../../api/client';
import type {
  StatuteLinkedJudgment,
  StatuteLinkedJudgmentsResponse,
} from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HELD STATUTE SURFACE — what it says in each state, and what it may never
 * say in any of them.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R16 `R16-RCC-08`. This screen has no route, so these are the ONLY place
 * it renders. That is the point: NEW3 can acceptance-test the surface here
 * while an advocate cannot reach it at all.
 *
 * The fixtures are the responses OBSERVED against the local API at HEAD
 * `c7151dff` on 1 September 2026. `CONFIRMED_ZERO` is the real answer for
 * CrPC s.482 on the default tier — zero links, 42,697 references over 40,134
 * judgments withheld — which is the answer for every input in the corpus today.
 */

jest.mock('../../api/client', () => ({ api: { statuteLinkedJudgments: jest.fn() } }));

const linked = api.statuteLinkedJudgments as jest.MockedFunction<
  typeof api.statuteLinkedJudgments
>;

const BASE: StatuteLinkedJudgmentsResponse = {
  act: {
    statuteId: '0019baad-090a-4777-a62a-f2a12339664e',
    shortTitle: 'The Code of Criminal Procedure, 1973',
    hindiTitle: null,
    actNumber: '2',
    actYear: 1974,
    enactmentDate: '1974-01-25',
    enforcementDate: '1974-04-01',
    sourceUrl: 'https://example.invalid/crpc',
    heldSectionCount: 484,
    repealRecorded: null,
  },
  section: {
    sectionId: 'sec-482',
    sectionNumber: '482',
    heading: 'Saving of inherent powers of High Court',
    sourceUrl: 'https://example.invalid/crpc/482',
  },
  scope: 'section',
  correspondence: { available: false, reason: 'held' },
  evidence: 'resolver_confirmed',
  relationship: 'cites_statute_reference',
  semantics:
    'Judgments whose text carries a structurally extracted reference to this section of this ' +
    'Act. It is not a finding that the section applied, was interpreted, or was decided under.',
  ordering: 'occurrences_desc_then_judgment_id',
  links: [],
  page: { limit: 20, offset: 0, returned: 0, hasMore: false },
  withheld: { byResolutionState: {}, chronologyRefusedOnThisPage: 0 },
  coverage: {
    note:
      'A judgment is reachable here only where the extractor recorded a statute reference AND ' +
      'the Act was named beside the section. Coverage is partial and is not complete.',
  },
  asOf: '2026-09-01T12:00:00.000Z',
};

const CONFIRMED_ZERO: StatuteLinkedJudgmentsResponse = {
  ...BASE,
  withheld: {
    byResolutionState: { unclassified: { references: 42697, judgments: 40134 } },
    chronologyRefusedOnThisPage: 0,
  },
};

/**
 * One row as the route actually returns it — observed on the
 * `structural_unreviewed` tier for CrPC s.482, including both Act spellings the
 * court used and the `resolutionState: null` that means the resolver has said
 * nothing at all.
 */
const UNREVIEWED_ROW: StatuteLinkedJudgment = {
  judgmentId: '615f3b41-60ad-4586-8559-bc0656606035',
  caseTitle: 'NEEHARIKA INFRASTRUCTURE PVT. LTD. versus STATE OF MAHARASHTRA',
  neutralCitation: null,
  court: 'Supreme Court of India',
  judgmentDate: '2021-04-13',
  caseNumber: null,
  caseType: null,
  overruledStatus: 'none',
  overruledStatusStored: 'none',
  precedentialEffect: 'none',
  canAddToMatter: true,
  unappliedTreatment: null,
  treatmentAttribution: 'UNKNOWN',
  link: {
    actNamedInJudgment: ['Code of Criminal Procedure, 1973', 'Criminal Procedure Code'],
    sectionNumbers: ['482'],
    occurrences: 73,
    firstOffset: 3063,
    resolutionState: null,
    resolutionReason: [],
    resolvedAt: null,
    evidence: 'structural_unreviewed',
  },
};

beforeEach(() => linked.mockReset());

const mount = () =>
  render(
    <StatuteLinkedJudgmentsScreen
      statuteId="0019baad-090a-4777-a62a-f2a12339664e"
      section={{ sectionNumber: '482' }}
    />,
  );

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE THE WHOLE CORPUS IS IN TODAY.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the confirmed tier is empty, and the screen says which empty it is', () => {
  it('names the references it holds and declines to vouch for', async () => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();

    expect(await screen.findByText('No confirmed linked judgments')).toBeTruthy();
    // The numbers ARE the difference between withholding and dropping.
    expect(screen.getByText(/42,697 references/)).toBeTruthy();
    expect(screen.getByText(/40,134 judgments/)).toBeTruthy();
  });

  /**
   * THE ONE SENTENCE THAT ENDS A CONSULTATION WITH THE WRONG ADVICE. An
   * advocate told no judgment cites s.482 stops looking; 40,134 do.
   */
  it('never says no judgment cites the provision', async () => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();

    expect(screen.queryByText(/no judgments? cite/i)).toBeNull();
    expect(screen.queryByText(/no cases/i)).toBeNull();
    expect(screen.queryByText(/nothing found/i)).toBeNull();
  });

  /** Zero links with NOTHING withheld is a different sentence, and says so. */
  it('distinguishes holding nothing from holding-and-not-vouching', async () => {
    linked.mockResolvedValue({ ok: true, data: BASE });
    await mount();

    expect(await screen.findByText('We hold no reference to this provision')).toBeTruthy();
    expect(screen.queryByText('No confirmed linked judgments')).toBeNull();
  });
});

describe('the refusals are about us, never about the law', () => {
  /** The answer every environment gives today: the route is held. */
  it('a held route reads as our release state', async () => {
    linked.mockResolvedValue({
      ok: false,
      error: { code: 'CAPABILITY_DISABLED', message: 'not available' },
    });
    await mount();

    expect(await screen.findByText('This is not part of the current release')).toBeTruthy();
    expect(screen.getByText(/nothing here says anything about what the courts have said/i)).toBeTruthy();
  });

  /** An outage must not read as a corpus gap. */
  it('a failure to reach the server is not an answer of no', async () => {
    linked.mockResolvedValue({ ok: false, error: { code: 'TIMEOUT', message: 'timed out' } });
    await mount();

    expect(await screen.findByText('We could not check')).toBeTruthy();
    expect(screen.getByText(/not a statement that no judgment cites/i)).toBeTruthy();
  });

  /** "We do not hold it" is not "it does not exist". */
  it('a missing section is stated as our gap', async () => {
    linked.mockResolvedValue({
      ok: false,
      error: { code: 'SECTION_NOT_FOUND', message: 'We do not hold that section of this Act.' },
    });
    await mount();

    expect(await screen.findByText('We do not hold that provision')).toBeTruthy();
    expect(screen.getByText(/only that it is not in what we hold/i)).toBeTruthy();
  });
});

describe('the claim on the screen is the claim the route makes', () => {
  it("renders the server's own semantics sentence", async () => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();

    expect(await screen.findByText(BASE.semantics)).toBeTruthy();
  });

  /**
   * THE FOUR HEADINGS THE ROUTE REFUSES, as affirmative claims. Each is a legal
   * conclusion; the data is a citation fact.
   */
  it.each([
    /cases applying this/i,
    /cases interpreting this/i,
    /cases governed by this/i,
    /decided under this section/i,
  ])('claims %s nowhere', async (banned) => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();
    await screen.findByText('No confirmed linked judgments');

    expect(screen.queryByText(banned)).toBeNull();
  });

  /** Predecessor/successor identity is never offered — a wrong one is a wrong charge. */
  it('offers no BNSS equivalent', async () => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();
    await screen.findByText('No confirmed linked judgments');

    expect(screen.queryByText(/BNSS|equivalent|corresponding section/i)).toBeNull();
  });

  /**
   * `repealRecorded` IS `null`, NEVER `false`. `statutes` has no repeal column,
   * so "in force" is a claim about the law nothing in the database supports.
   */
  it('never renders the Act as in force', async () => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();
    await screen.findByText('No confirmed linked judgments');

    expect(screen.queryByText(/in force|not repealed|still applies/i)).toBeNull();
  });
});

describe('the request never asks for the unreviewed tier', () => {
  /**
   * THE ROUND'S BINDING RULE. `structural_unreviewed` is 905,853 extractor pins
   * nobody has reviewed, and it is for tests and diagnostics only. A product
   * surface that asked for it would be showing them as linked judgments.
   */
  it('sends no evidence parameter, so the server default decides the tier', async () => {
    linked.mockResolvedValue({ ok: true, data: CONFIRMED_ZERO });
    await mount();
    await screen.findByText('No confirmed linked judgments');

    expect(linked).toHaveBeenCalledWith(
      '0019baad-090a-4777-a62a-f2a12339664e',
      expect.objectContaining({ section: { sectionNumber: '482' } }),
    );
    const [, options] = linked.mock.calls[0]!;
    expect(options?.evidence).toBeUndefined();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROW GOES THROUGH THE ONE CITATION HELPER, and this file's first draft
 * did not — `citation/adversarial.test.ts` caught it interpolating the raw
 * `neutralCitation`, which is the defect that once put the word "null" in front
 * of an advocate. These assert the behaviour, not just the absence of the
 * pattern the scan looks for.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the citation slot is the helper, never the raw field', () => {
  const citationless = {
    ...BASE,
    links: [{ ...UNREVIEWED_ROW, neutralCitation: null }],
    page: { limit: 20, offset: 0, returned: 1, hasMore: false },
  };

  it('a row with no neutral citation renders the mark, not an empty slot', async () => {
    linked.mockResolvedValue({ ok: true, data: citationless });
    await mount();

    expect(await screen.findByText('No citation on file')).toBeTruthy();
    expect(screen.queryByText(/null|undefined/)).toBeNull();
  });

  /**
   * LAW MOVED RENDERS ON EVERY SURFACE. The stale-overruled threshold is zero,
   * and `overruledStatus` here is the DERIVED banner the route computes through
   * the same policy layer `/search` uses.
   */
  it('a set-aside authority carries its mark here too', async () => {
    linked.mockResolvedValue({
      ok: true,
      data: {
        ...BASE,
        links: [{ ...UNREVIEWED_ROW, overruledStatus: 'set_aside', canAddToMatter: false }],
        page: { limit: 20, offset: 0, returned: 1, hasMore: false },
      },
    });
    await mount();
    await screen.findByText('Extractor match, not checked.');

    /*
      THE WORDING IS THE HELPER'S, NOT THIS TEST'S. `movedMark` labels a stored
      `set_aside` "Overruled" — the chip says what a later court DID, and the
      column name is not the copy. Asserting a guessed phrase here would have
      passed only by accident, and asserting the helper's own label is what
      makes this a test of the surface rather than of my memory.
    */
    expect(screen.getByText('Overruled')).toBeTruthy();
  });
});

describe('an unreviewed row that arrives anyway is labelled, not promoted', () => {
  /**
   * The route's aggregation rule makes a MIXED row inherit the weaker label, so
   * a `resolver_confirmed` REQUEST can carry a `structural_unreviewed` ROW. The
   * row's own label decides how it may be described.
   */
  it('says on the row itself that it was not checked', async () => {
    linked.mockResolvedValue({
      ok: true,
      data: {
        ...BASE,
        links: [UNREVIEWED_ROW],
        page: { limit: 20, offset: 0, returned: 1, hasMore: false },
      },
    });
    await mount();

    expect(await screen.findByText('Extractor match, not checked.')).toBeTruthy();
    expect(screen.getByText(/1 of these are extractor matches/)).toBeTruthy();
    // Both spellings the court used are kept — the row stays auditable.
    expect(
      screen.getByText(/Named as Code of Criminal Procedure, 1973, Criminal Procedure Code/),
    ).toBeTruthy();
    // The ordering is stated, because a list without the sentence reads as a ranking.
    expect(screen.getByText(/not a ranking by relevance or by authority/i)).toBeTruthy();
  });
});
