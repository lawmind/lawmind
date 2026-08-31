import { render, screen } from '@testing-library/react-native';

import type { AuthoritiesResponse, PointInTimeAuthority } from '../../api/contract';
import { AuthoritiesPanel } from './AuthoritiesPanel';

/**
 * The fixture is the real production row, measured 7 August 2026: Balwinder
 * Singh (Binda) v. NCB, delivered 2023-09-22, relying on Kanhaiyalal, which
 * Tofan Singh set aside on 2020-10-29.
 *
 * `statusRecordedAt` is the back-fill write timestamp, three years adrift of
 * the legal date, and is left in on purpose — if it ever reaches the screen
 * these tests are what notice.
 */
const authority = (over: Partial<PointInTimeAuthority> = {}): PointInTimeAuthority => ({
  judgmentId: 'jdg-kanhaiyalal',
  caseTitle: 'Kanhaiyalal v. Union of India',
  neutralCitation: '2008 INSC 25',
  judgmentDate: '2008-01-09',
  relationship: 'cites',
  standingWhenRelied: 'already_moved',
  daysAlreadyMoved: 1058,
  overruledStatus: 'set_aside',
  overruledByJudgmentId: 'jdg-tofan-singh',
  overruledOn: '2020-10-29',
  overruledByCaseTitle: 'Tofan Singh v. State of Tamil Nadu',
  statusRecordedAt: '2026-08-06 15:32:38.67999+00',
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
  counts: { goodLawThen: 12, alreadyMoved: 1, overruledHere: 0, movedSince: 0, unknown: 0 },
  authorities,
  resolvedAuthorities: authorities.length,
});

const panel = (props: Partial<Parameters<typeof AuthoritiesPanel>[0]> = {}) => (
  <AuthoritiesPanel
    data={response([authority()])}
    error={null}
    onOpenJudgment={() => {}}
    {...props}
  />
);

describe('AuthoritiesPanel', () => {
  it('states the sequence as one sentence, with the bench that moved it', async () => {
    await render(panel());

    expect(screen.getByText('Relied on after it was set aside')).toBeTruthy();
    expect(
      screen.getByText(
        'Tofan Singh v. State of Tamil Nadu set this aside on 29 October 2020, 1,058 days before this judgment.'
      )
    ).toBeTruthy();
  });

  it('never shows an id, and never the back-fill timestamp', async () => {
    await render(panel());

    expect(screen.queryByText(/jdg-tofan-singh/)).toBeNull();
    expect(screen.queryByText(/2026-08-06/)).toBeNull();
    expect(screen.getByText('Read the judgment that set it aside')).toBeTruthy();
  });

  /**
   * THE CASE THAT MUST NOT READ AS AN ACCUSATION. Tofan Singh reciting the
   * authority it overruled is not a bench relying on dead law, and an advocate
   * opening a landmark must not meet a caution block saying it was.
   */
  it('renders overruled_here as a plain line, with no caution copy', async () => {
    await render(
      panel({
        data: response([
          authority({ standingWhenRelied: 'overruled_here', daysAlreadyMoved: null }),
        ]),
      })
    );

    expect(screen.getByText('This is the judgment that set it aside')).toBeTruthy();
    expect(screen.getByText('It was good law until this judgment.')).toBeTruthy();
    expect(screen.queryByText('Relied on after it was set aside')).toBeNull();
    // And it is not counted in the headline, which is only for the state that
    // changes what an advocate does.
    expect(screen.queryByText(/had already been set aside/)).toBeNull();
  });

  it('renders nothing at all for an authority that has never moved', async () => {
    await render(
      panel({
        data: response([
          authority({
            standingWhenRelied: 'good_law_then',
            overruledStatus: 'none',
            overruledByJudgmentId: null,
            overruledOn: null,
            overruledByCaseTitle: null,
            daysAlreadyMoved: null,
          }),
        ]),
      })
    );

    expect(screen.getByText('Kanhaiyalal v. Union of India')).toBeTruthy();
    // No tick, no chip, no "good law" line. Silent is the whole point.
    expect(screen.queryByText(/good law/i)).toBeNull();
    expect(screen.queryByText('Relied on after it was set aside')).toBeNull();
  });

  it('says it cannot date the move rather than accusing a bench with nothing behind it', async () => {
    await render(panel({ data: response([authority({ overruledByCaseTitle: null })]) }));

    expect(screen.getByText('We cannot date this against the judgment')).toBeTruthy();
    expect(screen.queryByText('Relied on after it was set aside')).toBeNull();
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

/** Every string the panel actually puts on screen, in render order. */
function renderedText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(renderedText);
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children: unknown }).children);
  }
  return [];
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A SOUNDNESS RATING — the rendered surface, not just the module.
 *
 * `citation/standing.ts` enforces this on the derivation. This enforces it on
 * what an advocate actually reads, because a verdict could be added in the
 * component without touching the module at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the panel never rates the judgment', () => {
  const EVALUATIVE =
    /\b(score|scored|rating|rated|grade|graded|rank|ranked|risk|risky|vulnerable|vulnerability|weak|weakened|weakness|unsound|unreliable|strength|confidence|reliability|percent)\b|%|\b\d+\s*\/\s*\d+\b/i;

  it('shows no verdict, no score and no ratio anywhere in its rendered text', async () => {
    await render(
      panel({
        data: response([
          authority(),
          authority({ judgmentId: 'b', standingWhenRelied: 'overruled_here' }),
          authority({
            judgmentId: 'c',
            caseTitle: 'Ram Singh v. Central Bureau of Narcotics',
            standingWhenRelied: 'good_law_then',
            overruledStatus: 'none',
          }),
        ]),
      })
    );

    for (const line of renderedText(screen.toJSON())) {
      expect(line).not.toMatch(EVALUATIVE);
    }
  });

  it('counts the state that changes what an advocate does, and only that', async () => {
    await render(
      panel({ data: response([authority(), authority({ judgmentId: 'b' })]) })
    );

    // A count of what needs attention. Never a tally of what passed, and never
    // a total the eye can turn into a fraction of the judgment.
    expect(
      screen.getByText('2 authorities had already been set aside when this bench relied on them')
    ).toBeTruthy();
    expect(screen.queryByText(/2 of 2/)).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE ROW PER AUTHORITY, NOT ONE PER MENTION.
 *
 * Reproduced on a physical Galaxy S24, 31 Aug 2026, opening Kesavananda
 * Bharati (`2e3d517c`, 2,878,447 characters). `judgment_citations` holds one
 * row per citation OCCURRENCE, so that judgment's 47 rows cover 44 distinct
 * authorities — and React logged "Encountered two children with the same key"
 * for exactly the 3 repeated ids. React's documented response to a duplicate
 * key is that children "may be duplicated and/or omitted", and an omitted row
 * here is an authority the advocate never learns the bench relied on.
 *
 * The duplicate rows differed only in `char_offset` and in how the citation was
 * typed — "(1965) 1 S.C.R. 933" against "(1965) 1 S. C. R. 933" — so nothing
 * this panel renders was lost by collapsing them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('AuthoritiesPanel — the same authority cited twice', () => {
  it('renders one row per authority, whatever the bench did', async () => {
    await render(panel({ data: response([authority(), authority()]) }));

    expect(screen.getAllByText('Kanhaiyalal v. Union of India')).toHaveLength(1);
  });

  /**
   * The count is the half an advocate cannot check. Two mentions of one
   * set-aside authority must never read as two set-aside authorities.
   */
  it('counts the authority once, not once per mention', async () => {
    await render(panel({ data: response([authority(), authority()]) }));

    expect(
      screen.getByText(
        'One authority had already been set aside when this bench relied on it'
      )
    ).toBeTruthy();
    expect(
      screen.queryByText('2 authorities had already been set aside when this bench relied on them')
    ).toBeNull();
  });

  /** Distinct authorities are still distinct — the dedup keys on identity, not on shape. */
  it('keeps two genuinely different authorities apart', async () => {
    await render(
      panel({
        data: response([authority(), authority({ judgmentId: 'b', caseTitle: 'Another v. Other' })]),
      })
    );

    expect(screen.getByText('Kanhaiyalal v. Union of India')).toBeTruthy();
    expect(screen.getByText('Another v. Other')).toBeTruthy();
  });
});
