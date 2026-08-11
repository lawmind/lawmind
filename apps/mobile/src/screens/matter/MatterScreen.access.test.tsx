import { render, screen } from '@testing-library/react-native';

import { MatterScreen } from './MatterScreen';
import { api } from '../../api/client';
import type { MatterAccess } from '../../api/contract';

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
  api: { matter: jest.fn(), matterAuthorities: jest.fn() },
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) => selector({ matters: [] }),
}));

const matter = api.matter as jest.MockedFunction<typeof api.matter>;
const matterAuthorities = api.matterAuthorities as jest.MockedFunction<
  typeof api.matterAuthorities
>;

const draw = async (access: MatterAccess | undefined) => {
  matter.mockResolvedValue({ ok: true, data: bundle(access) } as never);
  await render(
    <MatterScreen
      matterId="mat_1"
      onBack={() => {}}
      onOpenBriefing={() => {}}
      onOpenCounterArguments={() => {}}
      onOpenJudgment={() => {}}
      onRecordAdjournment={() => {}}
      onSendClientUpdate={() => {}}
      onShare={() => {}}
    />
  );
};

const OWNER_ONLY = [
  'Add event',
  'Record the next date',
  'Send update to client',
  'Who can see this matter',
];

beforeEach(() => {
  matter.mockReset();
  matterAuthorities.mockReset();
  matterAuthorities.mockResolvedValue({
    ok: true,
    data: { authorities: [], asOf: '2026-08-11T00:00:00.000Z' },
  });
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
        /This matter was shared with you\. You can read the file and its shared notes; only the advocate who owns it can add to it\./
      )
    ).toBeTruthy();
  });

  /**
   * `POST /arguments/counter` performs no write and checks no ownership. A
   * sharee researching the other side's likely authorities is doing the thing
   * the share was for, so this one is deliberately NOT gated.
   */
  it('may still research what will be said against them', async () => {
    await draw('shared');

    expect(await screen.findByText('What will be said against you')).toBeTruthy();
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
