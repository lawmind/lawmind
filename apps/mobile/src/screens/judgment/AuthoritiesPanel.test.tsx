import { render, screen } from '@testing-library/react-native';

import type { AuthoritiesResponse, PointInTimeAuthority } from '../../api/contract';
import type { OverrulingJudgment } from '../../citation/standing';
import { AuthoritiesPanel } from './AuthoritiesPanel';

/**
 * The fixture is the real production row, measured 6 August 2026: Balwinder
 * Singh (Binda) v. NCB, delivered 2023-09-22, relying on Kanhaiyalal, which
 * Tofan Singh set aside on 2020-10-29.
 *
 * `standingWhenRelied` is left at the server's `moved_since` and
 * `statusChangedAt` at the back-fill timestamp — both wrong for this purpose.
 * The panel is expected to reach the opposite conclusion from the two dates.
 */
const authority = (over: Partial<PointInTimeAuthority> = {}): PointInTimeAuthority => ({
  judgmentId: 'jdg-kanhaiyalal',
  caseTitle: 'Kanhaiyalal v. Union of India',
  neutralCitation: '2008 INSC 25',
  judgmentDate: '2008-01-09',
  relationship: 'cites',
  standingWhenRelied: 'moved_since',
  daysAlreadyMoved: null,
  overruledStatus: 'set_aside',
  overruledByJudgmentId: 'jdg-tofan-singh',
  statusChangedAt: '2026-08-06 15:32:38.67999+00',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  asOf: '2026-08-06T19:15:12.741Z',
  ...over,
});

const response = (authorities: PointInTimeAuthority[]): AuthoritiesResponse => ({
  judgmentId: 'jdg-balwinder',
  caseTitle: 'Balwinder Singh (Binda) v. Narcotics Control Bureau',
  deliveredOn: '2023-09-22',
  asOf: '2026-08-06T19:15:12.741Z',
  counts: { goodLawThen: 0, alreadyMoved: 0, movedSince: 1, unknown: 0 },
  authorities,
  resolvedAuthorities: authorities.length,
});

const TOFAN_SINGH: OverrulingJudgment = {
  judgmentId: 'jdg-tofan-singh',
  caseTitle: 'Tofan Singh v. State of Tamil Nadu',
  neutralCitation: '2020 INSC 620',
  judgmentDate: '2020-10-29',
};

const resolved = { 'jdg-tofan-singh': TOFAN_SINGH };

const panel = (props: Partial<Parameters<typeof AuthoritiesPanel>[0]> = {}) => (
  <AuthoritiesPanel
    data={response([authority()])}
    error={null}
    onOpenJudgment={() => {}}
    overrulings={resolved}
    {...props}
  />
);

describe('AuthoritiesPanel', () => {
  it('states the sequence as two dated facts, against the server verdict', async () => {
    await render(panel());

    expect(screen.getByText('Relied on after it was set aside')).toBeTruthy();
    expect(
      screen.getByText(
        'Tofan Singh v. State of Tamil Nadu set this aside on 29 October 2020, 1,058 days before this judgment.'
      )
    ).toBeTruthy();
  });

  it('names the judgment that moved the law and never shows its id', async () => {
    await render(panel());

    expect(screen.queryByText(/jdg-tofan-singh/)).toBeNull();
    expect(screen.getByText('Read 2020 INSC 620')).toBeTruthy();
  });

  it('renders nothing at all for an authority that has never moved', async () => {
    await render(
      panel({
        data: response([
          authority({ overruledStatus: 'none', overruledByJudgmentId: null, standingWhenRelied: 'good_law_then' }),
        ]),
        overrulings: {},
      })
    );

    expect(screen.getByText('Kanhaiyalal v. Union of India')).toBeTruthy();
    // No tick, no chip, no "good law" line. Silent is the whole point.
    expect(screen.queryByText(/good law/i)).toBeNull();
    expect(screen.queryByText('Relied on after it was set aside')).toBeNull();
    expect(screen.queryByText('Set aside after this judgment relied on it')).toBeNull();
  });

  it('says it cannot date the move rather than guessing, while unresolved', async () => {
    await render(panel({ overrulings: {} }));

    expect(screen.getByText('We cannot date this against the judgment')).toBeTruthy();
    expect(screen.queryByText('Relied on after it was set aside')).toBeNull();
    // And it must not fall back to the server's field, which says moved_since.
    expect(screen.queryByText('Set aside after this judgment relied on it')).toBeNull();
  });

  it('states our limit rather than implying a gap in the bench reasoning', async () => {
    await render(panel({ data: response([]) }));

    expect(
      screen.getByText(
        'We could not match any of the authorities this judgment cites to a judgment we hold.'
      )
    ).toBeTruthy();
  });

  it('states the denominator, so a partial match cannot read as the whole judgment', async () => {
    await render(panel());

    expect(
      screen.getByText(
        '1 of the authorities cited here resolve to judgments we hold. A bench cites more than we can match.'
      )
    ).toBeTruthy();
  });

  it('keeps the judgment readable when the panel itself fails', async () => {
    await render(panel({ data: null, error: 'upstream timeout' }));

    expect(screen.getByText(/The rest of the judgment is unaffected/)).toBeTruthy();
    // Our sentence and the server's are never interpolated into one line.
    expect(screen.queryByText(/upstream timeout/)).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A SOUNDNESS RATING — the rendered surface, not just the module.
 *
 * `citation/standing.ts` enforces this on the derivation. This enforces it on
 * what an advocate actually reads, because a verdict could be added in the
 * component without touching the module at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/** Every string the panel actually puts on screen, in render order. */
function renderedText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(renderedText);
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children: unknown }).children);
  }
  return [];
}

describe('the panel never rates the judgment', () => {
  const EVALUATIVE =
    /\b(score|scored|rating|rated|grade|graded|rank|ranked|risk|risky|vulnerable|vulnerability|weak|weakened|weakness|unsound|unreliable|strength|confidence|reliability|percent)\b|%|\b\d+\s*\/\s*\d+\b/i;

  it('shows no verdict, no score and no ratio anywhere in its rendered text', async () => {
    await render(
      panel({
        data: response([
          authority(),
          authority({ judgmentId: 'b', caseTitle: 'Ram Singh v. Central Bureau of Narcotics', overruledStatus: 'none', overruledByJudgmentId: null }),
        ]),
      })
    );

    for (const line of renderedText(screen.toJSON())) {
      expect(line).not.toMatch(EVALUATIVE);
    }
  });

  it('counts the state that changes what an advocate does, and only that', async () => {
    await render(panel({ data: response([authority(), authority({ judgmentId: 'b' })]) }));

    // A count of what needs attention. Never a tally of what passed, and never
    // a total the eye can turn into a fraction of the judgment.
    expect(
      screen.getByText('2 authorities had already been set aside when this bench relied on them')
    ).toBeTruthy();
    expect(screen.queryByText(/2 of 2/)).toBeNull();
  });
});
