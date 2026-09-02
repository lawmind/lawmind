import { liveSavedAuthorities, mergeSavedAuthorities } from './savedAuthorities';
import type { MatterAuthority, MatterAuthorityUnavailable } from '../../api/contract';

/**
 * THE MERGE THAT MAKES ONE SAVED-AUTHORITY HISTORY OUT OF R17'S TWO ARRAYS.
 *
 * The screen test proves what renders; this proves the ordering, the identity
 * rule and the recovery, which are the parts that must hold whatever the screen
 * later looks like.
 */

const available = (over: Partial<MatterAuthority> = {}): MatterAuthority => ({
  authorityId: 'auth_1',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Appellant v. Union of India',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
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
  ...over,
});

const unavailable = (
  over: Partial<MatterAuthorityUnavailable> = {},
): MatterAuthorityUnavailable => ({
  authorityId: 'auth_2',
  judgmentId: 'jdg_2',
  addedBy: 'usr_1',
  addedAt: '2026-08-12T00:00:00.000Z',
  removedAt: null,
  availability: 'corpus_unavailable',
  ...over,
});

describe('merging the two R17 arrays', () => {
  it('keeps both, newest saved first, across the two arrays', () => {
    const rows = mergeSavedAuthorities(
      [available({ authorityId: 'a', addedAt: '2026-08-10T00:00:00.000Z' })],
      [
        unavailable({ authorityId: 'b', addedAt: '2026-08-12T00:00:00.000Z' }),
        unavailable({ authorityId: 'c', addedAt: '2026-08-01T00:00:00.000Z' }),
      ],
    );

    expect(rows.map((r) => r.authorityId)).toEqual(['b', 'a', 'c']);
    expect(rows.map((r) => r.kind)).toEqual(['unavailable', 'available', 'unavailable']);
  });

  it('orders two rows saved in the same millisecond deterministically', () => {
    const at = '2026-08-11T00:00:00.000Z';
    const one = mergeSavedAuthorities(
      [available({ authorityId: 'zz', addedAt: at })],
      [unavailable({ authorityId: 'aa', addedAt: at })],
    );
    const other = mergeSavedAuthorities(
      [available({ authorityId: 'zz', addedAt: at })],
      [unavailable({ authorityId: 'aa', addedAt: at })],
    );

    expect(one.map((r) => r.authorityId)).toEqual(['aa', 'zz']);
    expect(other.map((r) => r.authorityId)).toEqual(one.map((r) => r.authorityId));
  });

  it('an empty unavailable array is exactly an available-only list', () => {
    expect(mergeSavedAuthorities([available()], [])).toEqual(
      mergeSavedAuthorities([available()], undefined),
    );
  });

  it('never renders the same saved row twice, and the resolved read wins', () => {
    const rows = mergeSavedAuthorities(
      [available({ authorityId: 'auth_1' })],
      [unavailable({ authorityId: 'auth_1' })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('available');
  });

  it('recovers a target that returns, with no duplicate and no user write', () => {
    const saved = { authorityId: 'auth_1', judgmentId: 'jdg_1', addedAt: '2026-08-11T00:00:00.000Z' };

    const gone = mergeSavedAuthorities([], [unavailable(saved)]);
    expect(gone.map((r) => r.kind)).toEqual(['unavailable']);

    const back = mergeSavedAuthorities([available(saved)], []);
    expect(back.map((r) => r.kind)).toEqual(['available']);
    expect(back).toHaveLength(1);
    // Identity is untouched by the round trip — the row is the same user record.
    expect(back[0]?.authorityId).toBe(gone[0]?.authorityId);
    expect(back[0]?.addedAt).toBe(gone[0]?.addedAt);
  });
});

describe('rows the matter draws', () => {
  it('drops removed rows by the same rule in both states', () => {
    const rows = mergeSavedAuthorities(
      [
        available({ authorityId: 'a' }),
        available({ authorityId: 'b', removedAt: '2026-08-13T00:00:00.000Z' }),
      ],
      [
        unavailable({ authorityId: 'c' }),
        unavailable({ authorityId: 'd', removedAt: '2026-08-13T00:00:00.000Z' }),
      ],
    );

    expect(liveSavedAuthorities(rows).map((r) => r.authorityId).sort()).toEqual(['a', 'c']);
  });
});
