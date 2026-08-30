import { fireEvent, render, screen } from '@testing-library/react-native';

import { BriefingScreen } from './BriefingScreen';
import { api } from '../../api/client';
import type { Briefing, BriefingAuthority } from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WEDGE FEATURE, TESTED FOR THE FIRST TIME — 11 August 2026.
 *
 * There were no tests on this screen at all, which is why what follows survived
 * for the life of the project: the `Briefing` type declared six fields that no
 * route has ever sent — `id`, `subject`, `whereItStands`, `pendingBeforeCourt`,
 * `checklist[].label` and `datesNotConfirmed` — and the mock fixture supplied
 * every one of them. Development looked right. Production would have rendered
 * a blank headline over three empty blocks.
 *
 * TWO OF THE SIX WERE SAFETY FAILURES:
 *
 *   1. `datesNotConfirmed` was a BOOLEAN over a three-state fact. `route.ts`
 *      is explicit — "Three states, never a boolean... the client must not
 *      render that as confirmed." Undeclared, it read `undefined`, which is
 *      falsy, so a listing we had actively failed to confirm rendered exactly
 *      like a confirmed one. An advocate misses a hearing that way.
 *   2. `authorities: SearchResult[]` was wrong in kind. The wire sends a union
 *      on `available` carrying `overruledStatus` and NO `verificationState`,
 *      and `citationRender` required both fields before it would draw either
 *      mark — so an authority that had been SET ASIDE drew nothing at all, on
 *      the one screen read standing outside the courtroom.
 *
 * Every fixture below is the shape `services/api/src/briefings/route.ts`
 * actually returns. That is the whole point of them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('../../api/client', () => ({
  api: { briefing: jest.fn(), markBriefingOpened: jest.fn(), addAuthorityToMatter: jest.fn() },
}));

jest.mock('../../state/offlineCache', () => ({
  readCache: jest.fn(() => Promise.resolve(null)),
  writeCache: jest.fn(() => Promise.resolve({ cachedAt: '2026-08-01T00:00:00.000Z' })),
  describeCacheAge: () => 'just now',
}));

const briefingCall = api.briefing as jest.MockedFunction<typeof api.briefing>;
const addAuthority = api.addAuthorityToMatter as jest.MockedFunction<
  typeof api.addAuthorityToMatter
>;

const authority = (over: Partial<Extract<BriefingAuthority, { available: true }>> = {}) =>
  ({
    judgmentId: 'jdg_1',
    available: true as const,
    caseTitle: 'Mock Authority v. Mock State',
    neutralCitation: 'MOCK 2019 EXAMPLE 12',
    /** Tier 1 by construction — a briefing authority IS a corpus row. */
    verificationState: 'verified' as const,
    verifiedBySource: 'corpus' as const,
    overruledStatus: 'none' as const,
    overruledByJudgmentId: null,
    overruledByTitle: null,
    overruledParas: null,
    overruledNote: null,
    addToMatterAllowed: true,
    ...over,
  }) satisfies BriefingAuthority;

const briefing = (over: Partial<Briefing> = {}): Briefing => ({
  briefingId: 'brf_1',
  matterId: 'mat_1',
  caseTitle: 'Mock Client v. Mock Opponent',
  court: 'Mock High Court',
  hearingDate: '2026-08-12',
  generatedAt: '2026-08-11T02:00:00.000Z',
  deliveredAt: null,
  openedAt: null,
  dateConfidence: {
    source: null,
    confirmedAt: null,
    notConfirmedAt: null,
    notConfirmedReason: null,
    state: 'never_checked',
  },
  blocks: {
    lastOrder: {
      present: true,
      eventId: 'evt_1',
      eventDate: '2026-07-19',
      orderText: 'Notice issued, returnable in four weeks.',
    },
    pendingApplications: {
      count: 1,
      items: [
        { eventId: 'evt_2', eventDate: '2026-07-02', description: 'Application for interim stay' },
      ],
    },
    authorities: [
      { judgmentId: 'jdg_1', addedAt: '2026-07-20T00:00:00.000Z', paragraphNumber: 14 },
    ],
    checklist: [
      { id: 'chk_1', text: 'Carry the certified copy', basis: 'No copy is recorded on the matter' },
    ],
  },
  authorities: [authority()],
  ...over,
});

const draw = async (over: Partial<Briefing> = {}) => {
  briefingCall.mockResolvedValue({ ok: true, data: { briefing: briefing(over) } });
  await render(<BriefingScreen briefingId="brf_1" onClose={() => {}} onOpenJudgment={() => {}} />);
};

beforeEach(() => {
  briefingCall.mockReset();
  addAuthority.mockReset();
  addAuthority.mockResolvedValue({
    ok: true,
    data: {
      authority: {
        authorityId: 'auth_1',
        judgmentId: 'jdg_1',
        caseTitle: 'Mock Authority v. Mock State',
        neutralCitation: 'MOCK 2019 EXAMPLE 12',
        reporterCitations: [],
        addedBy: 'usr_1',
        addedAt: '2026-08-11T00:00:00.000Z',
        removedAt: null,
        verificationState: 'verified',
        verifiedBySource: 'corpus',
        overruledStatus: 'none',
        overruledByJudgmentId: null,
        overruledByTitle: null,
        overruledParas: null,
        overruledNote: null,
      },
    },
  });
});

describe('the briefing renders what the endpoint sends', () => {
  it('heads with the case name — the field that replaced an invented "subject"', async () => {
    await draw();

    expect(await screen.findByText('Mock Client v. Mock Opponent')).toBeTruthy();
  });

  it('names the court, which the endpoint has always sent and nothing read', async () => {
    await draw();

    expect(await screen.findByText('Mock High Court')).toBeTruthy();
  });

  it('draws block 01 from the last order, not from a "whereItStands" string', async () => {
    await draw();

    expect(await screen.findByText('Notice issued, returnable in four weeks.')).toBeTruthy();
  });

  it('draws block 02 from the pending applications', async () => {
    await draw();

    expect(await screen.findByText('Application for interim stay')).toBeTruthy();
  });

  it('draws block 04 from checklist `text`, and states the basis for the item', async () => {
    await draw();

    expect(await screen.findByText('Carry the certified copy')).toBeTruthy();
    expect(screen.getByText('No copy is recorded on the matter')).toBeTruthy();
  });
});

/**
 * AN EMPTY BLOCK SAYS IT IS EMPTY, IN THE SERVER'S OWN WORDS.
 *
 * `assemble.ts`: "It never invents a block it has no data for. An empty block
 * says it is empty. 'No order has been recorded on this matter' is useful; a
 * fabricated summary is a liability, and an omitted block reads as 'nothing to
 * report' when it may mean 'we never looked'."
 */
describe('a block with nothing in it', () => {
  it('renders the note the server wrote for an absent order', async () => {
    await draw({
      blocks: {
        ...briefing().blocks!,
        lastOrder: { present: false, note: 'No order has been recorded on this matter.' },
      },
    });

    expect(await screen.findByText('No order has been recorded on this matter.')).toBeTruthy();
  });

  it('says so when the stored briefing could not be read at all', async () => {
    await draw({ blocks: null });

    expect(
      await screen.findByText('This briefing could not be read. Nothing has been lost.'),
    ).toBeTruthy();
  });
});

/**
 * THE LISTING'S OWN CONFIDENCE — THREE STATES, NEVER TWO.
 *
 * `never_checked` is the ordinary case for a date the advocate typed (PD-12,
 * manual entry is first-class) and must draw nothing: a caution on the ordinary
 * case teaches advocates to ignore cautions. `not_confirmed` is a check that
 * ran and failed, and it must always be said.
 */
describe('whether the hearing date is confirmed', () => {
  const NOT_CONFIRMED = /We could not confirm this listing against the cause list/;

  it('says nothing when nobody has checked — the ordinary manual-entry case', async () => {
    await draw();

    await screen.findByText('Mock Client v. Mock Opponent');
    expect(screen.queryByText(NOT_CONFIRMED)).toBeNull();
  });

  it('says nothing when the listing was confirmed', async () => {
    await draw({
      dateConfidence: {
        source: 'cause_list',
        confirmedAt: '2026-08-11T01:00:00.000Z',
        notConfirmedAt: null,
        notConfirmedReason: null,
        state: 'confirmed',
      },
    });

    await screen.findByText('Mock Client v. Mock Opponent');
    expect(screen.queryByText(NOT_CONFIRMED)).toBeNull();
  });

  /** The regression. A boolean that was never sent read `undefined` — falsy. */
  it('states it plainly when a check ran and could not confirm the date', async () => {
    await draw({
      dateConfidence: {
        source: 'cause_list',
        confirmedAt: null,
        notConfirmedAt: '2026-08-11T01:00:00.000Z',
        notConfirmedReason: 'The cause list for this court was not published.',
        state: 'not_confirmed',
      },
    });

    expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  });

  it('carries the server’s reason where it gave one, rather than a generic line', async () => {
    await draw({
      dateConfidence: {
        source: 'cause_list',
        confirmedAt: null,
        notConfirmedAt: '2026-08-11T01:00:00.000Z',
        notConfirmedReason: 'The cause list for this court was not published.',
        state: 'not_confirmed',
      },
    });

    expect(
      await screen.findByText(/The cause list for this court was not published\./),
    ).toBeTruthy();
  });
});

/**
 * THE LAW MOVING, ON THE SCREEN READ OUTSIDE THE COURTROOM.
 *
 * `route.ts` re-reads `overruled_status` live on every request precisely so
 * this can be drawn — "a briefing is read standing outside court, the worst
 * possible moment to be shown law that moved after the sweep ran." It sends no
 * `verificationState`, and `citationRender` used to require both fields before
 * drawing either mark, so all of that live re-reading reached a screen that
 * showed none of it.
 */
describe('an authority whose law has moved', () => {
  it('marks a set-aside authority, which is the state that ends its use', async () => {
    await draw({ authorities: [authority({ overruledStatus: 'set_aside' })] });

    expect(await screen.findByText('Overruled')).toBeTruthy();
  });

  it('marks a partly set aside authority and names the paragraphs the server sent', async () => {
    await draw({
      authorities: [authority({ overruledStatus: 'partly_set_aside', overruledParas: [19, 20] })],
    });

    expect(await screen.findByText('Paras 19–20 set aside')).toBeTruthy();
  });

  it('marks a doubted authority, which still binds', async () => {
    await draw({ authorities: [authority({ overruledStatus: 'doubted' })] });

    expect(await screen.findByText('Doubted · referred')).toBeTruthy();
  });

  it('names the judgment that moved the law, which the server joins for us', async () => {
    await draw({
      authorities: [
        authority({
          overruledStatus: 'set_aside',
          precedentialEffect: 'set_aside',
          overruledByJudgmentId: 'jdg_9',
          overruledByTitle: 'Mock Later Bench v. Mock Union',
        }),
      ],
    });

    expect(await screen.findByText('Set aside in Mock Later Bench v. Mock Union')).toBeTruthy();
  });

  it('names overruling accurately and never calls it set-aside', async () => {
    await draw({
      authorities: [
        authority({
          overruledStatus: 'set_aside',
          precedentialEffect: 'overruled',
          overruledByTitle: 'Mock Constitutional Bench v. Mock Union',
        }),
      ],
    });

    expect(
      await screen.findByText('Overruled by Mock Constitutional Bench v. Mock Union'),
    ).toBeTruthy();
    expect(screen.queryByText(/Set aside in Mock Constitutional Bench/)).toBeNull();
  });

  it('uses neutral copy when the exact relationship is absent', async () => {
    await draw({
      authorities: [
        authority({
          overruledStatus: 'set_aside',
          overruledByTitle: 'Mock Later Bench v. Mock Union',
        }),
      ],
    });

    expect(await screen.findByText('Later judgment: Mock Later Bench v. Mock Union')).toBeTruthy();
    expect(screen.queryByText(/Set aside in Mock Later Bench/)).toBeNull();
  });

  it('draws no moved mark on an authority that is still good law', async () => {
    await draw();

    await screen.findByText('Mock Authority v. Mock State');
    expect(screen.queryByText('Overruled')).toBeNull();
    expect(screen.queryByText('Doubted · referred')).toBeNull();
  });
});

/**
 * VERIFIED IS SILENT — and it is silent again from 11 August 2026.
 *
 * The endpoint carried no `verificationState`, so `citationRender` fell to
 * UNCONFIRMED on every row: the briefing told an advocate not to file
 * authorities that came from their own verified matter. The client obeyed the
 * harness rather than defaulting the field away, reported the gap (bus 0038),
 * and LCC shipped `verificationState: 'verified'` / `verifiedBySource: 'corpus'`
 * the same day — Tier 1 by construction, because a briefing authority IS a
 * corpus row.
 *
 * Both directions are pinned here, because both have been wrong on this screen.
 */
describe('whether the authority exists', () => {
  it('says nothing on a verified authority', async () => {
    await draw();

    await screen.findByText('Mock Authority v. Mock State');
    expect(screen.queryByText('Do not file this without checking it')).toBeNull();
  });

  it('counts a verified, good-law authority as needing no attention', async () => {
    await draw();

    await screen.findByText('Mock Authority v. Mock State');
    expect(screen.queryByText(/need your attention/)).toBeNull();
  });

  it.each(['unverified', 'failed'] as const)(
    'marks %s unmissably, and identically — the advocate cannot act on the difference',
    async (verificationState) => {
      await draw({ authorities: [authority({ verificationState })] });

      expect(await screen.findByText('Do not file this without checking it')).toBeTruthy();
    },
  );

  /**
   * The two questions stay apart. An authority can be unconfirmed AND still
   * good law, or verified AND set aside; one mark never stands in for the
   * other.
   */
  it('draws both marks on an authority that is unconfirmed and set aside', async () => {
    await draw({
      authorities: [authority({ verificationState: 'unverified', overruledStatus: 'set_aside' })],
    });

    expect(await screen.findByText('Do not file this without checking it')).toBeTruthy();
    expect(screen.getByText('Overruled')).toBeTruthy();
  });
});

/**
 * AN AUTHORITY THE SERVER COULD NOT READ IS SHOWN, NEVER DROPPED.
 *
 * `route.ts`: "an authority that vanishes from a briefing is indistinguishable
 * from one that was never cited, which is the silent-drop failure wearing
 * different clothes." The server takes care not to drop it; a client that
 * filtered the arm out would reintroduce the failure one layer up.
 */
describe('an authority that could not be read', () => {
  it('renders the row with the server’s own note', async () => {
    await draw({
      authorities: [
        {
          judgmentId: 'jdg_gone',
          available: false,
          note: 'This authority could not be read from the corpus just now. It has not been removed from your briefing.',
        },
      ],
    });

    expect(await screen.findByText('This authority could not be read just now')).toBeTruthy();
    expect(screen.getByText(/It has not been removed from your briefing\./)).toBeTruthy();
  });

  it('counts toward what needs attention before going in', async () => {
    await draw({
      authorities: [{ judgmentId: 'jdg_gone', available: false, note: 'Mock note.' }],
    });

    expect(await screen.findByText(/1 need your attention/)).toBeTruthy();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAVING A HIGHLIGHTED AUTHORITY INTO THE BRIEFING'S OWN MATTER.
 *
 * A briefing's authorities come from `judgment_annotations` — the advocate's
 * own highlights (`briefings/assemble.ts`) — NOT from `matter_authorities`. So
 * they are not already saved, and the moment an advocate standing outside court
 * decides one of them matters is exactly here. `addToMatterAllowed` is sent on
 * every available row precisely so this action can exist.
 *
 * NO PICKER: a briefing belongs to one matter. `JudgmentScreen` needs its
 * picker for the opposite reason — a judgment opened from search belongs to
 * none.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('saving an authority from the briefing', () => {
  it('saves into the briefing’s own matter, without asking which', async () => {
    await draw();

    await fireEvent.press(await screen.findByText('Save to this matter'));

    expect(addAuthority).toHaveBeenCalledWith({ matterId: 'mat_1', judgmentId: 'jdg_1' });
  });

  it('keeps save available when OD-14 says an overruled authority remains addable', async () => {
    await draw({
      authorities: [
        authority({
          overruledStatus: 'set_aside',
          precedentialEffect: 'overruled',
          addToMatterAllowed: true,
          canAddToMatter: true,
        }),
      ],
    });

    expect(await screen.findByText('Save to this matter')).toBeTruthy();
    expect(screen.queryByText(/cannot be added to the matter/)).toBeNull();
  });

  it('says so once it has saved, and stops offering the action', async () => {
    await draw();

    await fireEvent.press(await screen.findByText('Save to this matter'));

    expect(await screen.findByText('Saved to this matter')).toBeTruthy();
    expect(screen.queryByText('Save to this matter')).toBeNull();
  });

  it('shows the server’s refusal verbatim — it names the replacement', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: {
        code: 'AUTHORITY_SET_ASIDE',
        message:
          'Mock Authority v. Mock State has been set aside and cannot be added. Cite Mock Later Bench v. Mock Union instead.',
      },
    });

    await draw();
    await fireEvent.press(await screen.findByText('Save to this matter'));

    expect(await screen.findByText(/Cite Mock Later Bench v. Mock Union instead\./)).toBeTruthy();
  });

  /**
   * THE SAME REFUSAL AT BOTH ENDS. The server decides it and answers 409 if
   * asked anyway; the client refuses it too, because a replayed request or a
   * stale build bypasses the client one. Offering a button that cannot succeed
   * is its own small lie.
   */
  it('offers nothing on a set-aside authority, and says why', async () => {
    await draw({
      authorities: [authority({ overruledStatus: 'set_aside', addToMatterAllowed: false })],
    });

    expect(
      await screen.findByText(
        'This authority has been set aside, so it cannot be added to the matter.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Save to this matter')).toBeNull();
  });

  /** There is no judgment row behind the unavailable arm, so nothing to save. */
  it('offers nothing on an authority that could not be read', async () => {
    await draw({
      authorities: [{ judgmentId: 'jdg_gone', available: false, note: 'Mock note.' }],
    });

    await screen.findByText('This authority could not be read just now');
    expect(screen.queryByText('Save to this matter')).toBeNull();
  });
});
