import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MatterScreen } from './MatterScreen';
import { api } from '../../api/client';
import type { MatterAccess } from '../../api/contract';
import { flush } from '../../analytics/track';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A SHAREE MAY BE OFFERED — PD-3, and a field the server has always sent.
 *
 * `GET /matters/:id` returns `access: 'owner' | 'shared'` at the top level, and
 * `GET /matters` returns it per row. The client declared neither until
 * 11 August 2026, so the workspace drew every owner-only action for a sharee
 * too.
 *
 * The server states it rather than letting a client infer it, and says why: a
 * sharee's bundle comes back with `documents: []` and private notes nulled,
 * which is indistinguishable from a matter that simply has neither — "an
 * absence and a permission boundary look identical otherwise, and one of those
 * is a bug report waiting to happen."
 *
 * THE COST OF GETTING THIS WRONG IS NOT A DEAD BUTTON. Every write checks
 * ownership directly and answers a permission failure with 404 — "no matter
 * with that id". So a sharee who tapped "Add event" in a courtroom was told
 * their colleague's matter did not exist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const bundle = (access: MatterAccess | undefined) => ({
  matter: {
    matterId: 'mat_1',
    caseTitle: 'Mock Client v. Mock Opponent',
    cnrNumber: null,
    court: 'Mock High Court',
    caseType: 'civil',
    parties: {},
    nextHearingDate: null,
    clientName: null,
    clientPhone: null,
    notes: null,
  },
  ...(access ? { access } : {}),
  events: [],
  documents: [],
  briefings: [],
});

jest.mock('../../api/client', () => ({
  api: { matter: jest.fn(), matterAuthorities: jest.fn(), premiumPreview: jest.fn() },
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) => selector({ matters: [] }),
}));

const matter = api.matter as jest.MockedFunction<typeof api.matter>;
const matterAuthorities = api.matterAuthorities as jest.MockedFunction<
  typeof api.matterAuthorities
>;
const premiumPreview = api.premiumPreview as jest.MockedFunction<typeof api.premiumPreview>;

const draw = async (access: MatterAccess | undefined, onOpenPremiumPlans = jest.fn()) => {
  matter.mockResolvedValue({ ok: true, data: bundle(access) } as never);
  await render(
    <MatterScreen
      matterId="mat_1"
      onBack={() => {}}
      onOpenBriefing={() => {}}
      onOpenCounterArguments={() => {}}
      onOpenJudgment={() => {}}
      onOpenPremiumPlans={onOpenPremiumPlans}
      onManage={() => {}}
      onRecordAdjournment={() => {}}
      onSendClientUpdate={() => {}}
      onShare={() => {}}
    />,
  );
  return { onOpenPremiumPlans };
};

const OWNER_ONLY = ['Add event', 'Record the next date', 'Send update to client'];

/**
 * HELD IN V1 FOR EVERYONE, OWNER INCLUDED — R12 §7 and §8, enforced in
 * `state/capabilities.ts`.
 *
 *   · "Who can see this matter" is firm/team administration. A single-user v1
 *     account has nobody to share with, and the workspace concept stays
 *     invisible; the endpoints exist and no screen reaches them.
 *   · "What will be said against you" is generation-adjacent, and
 *     `search.semantic.counterarguments` is DISABLED server-side. Every
 *     response observed this round had `safeForGeneration: false`.
 *
 * Both were reachable before this round. Their absence is the change under
 * test, not an oversight.
 */
const HELD_IN_V1 = ['Who can see this matter', 'What will be said against you'];

beforeEach(() => {
  matter.mockReset();
  matterAuthorities.mockReset();
  matterAuthorities.mockResolvedValue({
    ok: true,
    data: { authorities: [], asOf: '2026-08-11T00:00:00.000Z' },
  });
  premiumPreview.mockReset();
  premiumPreview.mockResolvedValue({
    ok: false,
    error: { code: 'NOT_ENABLED', message: 'premium preview is disabled' },
  });
  flush();
});

describe('the advocate who owns the matter', () => {
  it.each(OWNER_ONLY)('is offered "%s"', async (label) => {
    await draw('owner');

    expect(await screen.findByText(label)).toBeTruthy();
  });
});

describe('an advocate the matter was shared with', () => {
  it.each(OWNER_ONLY)('is not offered "%s", which would answer 404', async (label) => {
    await draw('shared');

    await screen.findByText('Mock Client v. Mock Opponent');
    expect(screen.queryByText(label)).toBeNull();
  });

  /**
   * SAID, NOT SILENTLY ABSENT. A sharee who finds fewer buttons than expected
   * should know why — otherwise the file reads as broken rather than shared,
   * and PD-3's whole point is that a share is a deliberate, legible grant.
   */
  it('is told why, rather than left with a shorter screen', async () => {
    await draw('shared');

    expect(
      await screen.findByText(
        /This matter was shared with you\. You can read the file and its shared notes; only the advocate who owns it can add to it\./,
      ),
    ).toBeTruthy();
  });

});

describe('surfaces this build holds back', () => {
  it.each(HELD_IN_V1)('does not offer "%s" to the owner', async (label) => {
    await draw('owner');

    await screen.findByText('Mock Client v. Mock Opponent');
    expect(screen.queryByText(label)).toBeNull();
  });

  it.each(HELD_IN_V1)('does not offer "%s" to a sharee either', async (label) => {
    await draw('shared');

    await screen.findByText('Mock Client v. Mock Opponent');
    expect(screen.queryByText(label)).toBeNull();
  });

  /**
   * ABSENT, NOT DISABLED. A greyed control an advocate can see is a promise,
   * and this round makes none about drafting, briefings or court monitoring.
   */
  it('shows no disabled teaser in place of a held surface', async () => {
    await draw('owner');

    await screen.findByText('Mock Client v. Mock Opponent');
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/upgrade to/i)).toBeNull();
  });
});

/**
 * A bundle written to disk before `access` was declared has none. The reader is
 * the person who cached it, so the fallback is `owner`: a wrong guess that way
 * removes buttons from an owner, whereas the other way round a stale cache
 * would reintroduce the exact defect this fixes.
 */
describe('a cached bundle from before the field existed', () => {
  it('assumes the reader is the owner rather than silently locking them out', async () => {
    await draw(undefined);

    expect(await screen.findByText('Add event')).toBeTruthy();
  });
});

describe('the OFF-by-default premium preview', () => {
  it('does not draw a placeholder or error when the server capability is off', async () => {
    await draw('owner');
    await screen.findByText('Mock Client v. Mock Opponent');

    expect(screen.queryByText('Matter intelligence preview')).toBeNull();
    expect(screen.queryByText(/premium preview is disabled/i)).toBeNull();
  });

  it('draws the server preview for an owner and emits the approved local event contract', async () => {
    premiumPreview.mockResolvedValue({
      ok: true,
      data: {
        matterId: 'mat_1',
        costClass: 'cheap',
        authorityCount: 6,
        eventCount: 4,
        adverseAuthorities: 1,
        nextHearingDate: '2026-09-03',
        unresolvedFilings: 2,
        stanceNotComputed: true,
        notComputed: ['whether each authority helps or hurts — requires generation'],
        asOf: '2026-08-25T00:00:00.000Z',
      },
    });

    const { onOpenPremiumPlans } = await draw('owner');
    expect(await screen.findByText('Matter intelligence preview')).toBeTruthy();
    expect(premiumPreview).toHaveBeenCalledWith('mat_1');
    expect(flush()).toEqual([
      expect.objectContaining({
        name: 'premium_preview_seen',
        context: 'hearing_prep_value',
        costClass: 'cheap',
      }),
    ]);

    await fireEvent.press(screen.getByText('View Pro plans'));
    expect(onOpenPremiumPlans).toHaveBeenCalledTimes(1);
    expect(flush()).toEqual([
      expect.objectContaining({ name: 'premium_preview_opened' }),
      expect.objectContaining({ name: 'premium_intent_signalled' }),
    ]);
  });

  it('never requests an owner-only preview for a shared matter', async () => {
    await draw('shared');
    await screen.findByText('Mock Client v. Mock Opponent');

    await waitFor(() => expect(premiumPreview).not.toHaveBeenCalled());
  });
});
