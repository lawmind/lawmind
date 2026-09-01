import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import { JudgmentScreen } from '../judgment/JudgmentScreen';
import { MatterScreen } from './MatterScreen';
import { MattersScreen } from './MattersScreen';
import { usePractice } from '../../state/practice';
import { color, size, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL V1 — Master Roadmap v7.1 governs and restores the advocate research
 * workstation to v1 scope. NEW3 R14 still records public advocate web as
 * `DISABLED_NOT_READY`; this is the local Expo web shell only. See the matching
 * boundary at the top of `ResearchWorkspace.tsx`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE DESKTOP MATTER WORKSPACE — same pattern as `ResearchWorkspace.tsx`,
 * applied to the matter list. PD-15's reasoning carries over unchanged: a
 * phone gives a matter the whole screen because a 390px screen is right to;
 * a 1440px one wastes most of itself doing the same thing.
 *
 * REVERSIBLE BY CONSTRUCTION, identically. Below `size.researchTwoPane` this
 * renders `<MattersScreen />` and nothing else — byte-for-byte the tab's
 * previous behaviour. One width comparison is the whole switch.
 *
 * NOT A REDESIGN. `MattersScreen` and `MatterScreen` are mounted here
 * UNCHANGED, with the props they already take. The only new seam is
 * `MattersScreen`'s optional `onOpenMatter`, mirroring `SearchScreen`'s
 * `onOpenJudgment` — without it the list pushes a route exactly as before.
 *
 * ── A SAVED AUTHORITY OPENS IN THE PANE, 1 September 2026 ───────────────────
 *
 * NEW3 R16 `R16-RCC-07`, founder design fpass 29: matter identity, timeline
 * and saved authorities must stay COHERENT on desktop, and the round is told
 * explicitly not to "fall back to mobile-style full routes where the founder
 * design supplies a current-v1 workspace interaction".
 *
 * Tapping a saved authority used to push `/judgment/[id]`, which leaves the
 * workspace entirely — the matter, its timeline and the list all go, and coming
 * back re-fetches every one of them. That is the exact movement this layout
 * exists to remove, and it is worse here than in research: the question an
 * advocate opens a matter to answer is "what am I relying on in this case", and
 * the answer is only legible while the case is still on screen.
 *
 * SO THE DETAIL PANE NOW HOLDS A SHALLOW STACK — the matter, then the
 * authorities read from it — and a trail above it keeps the matter NAMED the
 * whole time. Backing out returns to the matter.
 *
 * WHAT STILL PUSHES A ROUTE, and deliberately: adjournment, client update,
 * sharing, briefing and counter-arguments. Each is a task with its own screen
 * and its own completion, not a thing to read beside the matter — and three of
 * the five are capability-held anyway. This surface is the list-plus-detail
 * pairing plus the authorities it opens, not a second navigation system.
 *
 * NO BACKEND WORK. Same `GET /matters`, same `GET /matters/:id`, same
 * `GET /judgments/:id`. No endpoint, parameter or field added, and no
 * capability opened: every web row stays `DISABLED_NOT_READY`.
 */
/**
 * The authorities opened from the matter in the detail pane, innermost last.
 *
 * A SHALLOW STACK, NOT A ROUTER. One authority can lead to another it relied
 * on — the reader offers that — so the depth is not fixed at one; but the
 * MATTER is always the floor and is never popped, because it is the thing this
 * pane is about.
 */
type AuthorityPane = { judgmentId: string; reading: boolean; openParagraph?: number };

export function MatterWorkspace() {
  const { width } = useWindowDimensions();
  const twoPane = width >= size.researchTwoPane;
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(null);
  const [authorities, setAuthorities] = useState<AuthorityPane[]>([]);
  const openAuthority = authorities[authorities.length - 1];

  const popAuthority = useCallback(() => setAuthorities((a) => a.slice(0, -1)), []);

  /**
   * THE MATTER'S NAME, FOR THE TRAIL ABOVE AN OPEN AUTHORITY.
   *
   * Read from the store the list pane already populated rather than fetched —
   * this is the same row `MattersScreen` is drawing a metre to the left, and a
   * second request for it would be a second answer that can disagree with the
   * first. Undefined until the caseload has loaded, and the trail says "the
   * matter" rather than guessing a title in that window.
   */
  const matterTitle = usePractice((st) =>
    st.matters.find((m) => m.matterId === selected)?.caseTitle,
  );

  /**
   * PICKING A DIFFERENT MATTER CLEARS THE AUTHORITIES OPENED FROM THE LAST ONE.
   *
   * They belong to the matter they were opened from — leaving one on screen
   * beneath a different matter's identity would be the workspace asserting a
   * relationship between a case and an authority that nobody saved to it, which
   * on this product's terms is the whole failure it exists to prevent.
   */
  const selectMatter = useCallback((matterId: string) => {
    setSelected(matterId);
    setAuthorities([]);
  }, []);

  /** Escape backs out of one authority. The same affordance research has, and the same rule: never past the floor. */
  useEffect(() => {
    if (Platform.OS !== 'web' || authorities.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') popAuthority();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authorities.length, popAuthority]);

  if (!twoPane) return <MattersScreen />;

  return (
    <View style={styles.root}>
      <View style={styles.listPane}>
        <MattersScreen onOpenMatter={selectMatter} />
      </View>

      <View style={styles.divider} />

      <View style={styles.detailPane}>
        {selected && openAuthority ? (
          /*
            AN AUTHORITY SAVED TO THIS MATTER, READ WITHOUT LEAVING IT.

            The matter stays NAMED above the reader — identity is the thing this
            pane must not lose, and a judgment filling the pane with no statement
            of which case it was saved to is a judgment an advocate has to
            remember the context of.

            `JudgmentScreen` is mounted UNCHANGED, with the props it already
            takes. Every citation rule it enforces travels with it: verified is
            silent, `overruledStatus` is read live at render on each fetch, and
            amber still means only that the law has moved. More room to draw is
            not permission to decorate.
          */
          <>
            <AuthorityTrail
              depth={authorities.length}
              matterTitle={matterTitle}
              onBack={popAuthority}
            />
            <JudgmentScreen
              judgmentId={openAuthority.judgmentId}
              onBack={popAuthority}
              onOpenJudgment={(id) =>
                setAuthorities((a) => [...a, { judgmentId: id, reading: false }])
              }
              /*
                THE TREATMENT NETWORK IS A FULL ROUTE FROM HERE, and that is the
                one place this pane accepts the mobile fallback. `PrecedentScreen`
                needs a case title and citation the matter pane does not hold for
                an authority opened by id alone, and passing empty strings would
                print a blank heading over a real judgment's treatment history.
                Research's pane carries them from the result row it opened; this
                one has no such row.
              */
              onOpenTreatment={() =>
                router.push({
                  pathname: '/precedent/[id]',
                  params: { id: openAuthority.judgmentId },
                } as never)
              }
              onSetReading={(next, paragraphNumber) =>
                setAuthorities((a) =>
                  a.map((pane, i) =>
                    i === a.length - 1
                      ? { ...pane, reading: next, openParagraph: paragraphNumber }
                      : pane,
                  ),
                )
              }
              openParagraph={openAuthority.openParagraph}
              reading={openAuthority.reading}
            />
          </>
        ) : selected ? (
          <MatterScreen
            matterId={selected}
            onBack={() => setSelected(null)}
            onOpenBriefing={(briefingId) =>
              router.push({ pathname: '/briefing/[id]', params: { id: briefingId } })
            }
            onOpenCounterArguments={() =>
              router.push({ pathname: '/counter-arguments', params: { matterId: selected } } as never)
            }
            /*
              IN THE PANE, NOT A ROUTE — `R16-RCC-07`. This pushed
              `/judgment/[id]` and took the whole workspace with it: the matter,
              its timeline and the list all went, and returning re-fetched every
              one of them.
            */
            onOpenJudgment={(judgmentId) =>
              setAuthorities([{ judgmentId, reading: false }])
            }
            onManage={() =>
              router.push({ pathname: '/matter/manage', params: { id: selected } } as never)
            }
            onRecordAdjournment={() =>
              router.push({ pathname: '/adjournment/[id]', params: { id: selected } })
            }
            onSendClientUpdate={() =>
              router.push({ pathname: '/client-update/[id]', params: { id: selected } })
            }
            onShare={() =>
              router.push({ pathname: '/matter-sharing/[id]', params: { id: selected } } as never)
            }
          />
        ) : (
          <EmptyPane />
        )}
      </View>
    </View>
  );
}

/**
 * WHICH MATTER THIS AUTHORITY IS BEING READ FROM, AND THE WAY BACK.
 *
 * The identity line is the whole reason the authority opens here rather than on
 * its own route: a judgment filling the pane with no statement of the case it
 * was saved to is a judgment whose context the advocate has to hold in their
 * head. It names the matter it belongs to and nothing else — not a breadcrumb
 * chain, because an authority opened from a citation inside another does not
 * carry a title until it has loaded, and a trail that renders blanks while it
 * fetches is worse than one that states its depth honestly.
 */
function AuthorityTrail({
  depth,
  matterTitle,
  onBack,
}: {
  depth: number;
  /** Undefined until the caseload has loaded. Never substituted with a guess. */
  matterTitle: string | undefined;
  onBack: () => void;
}) {
  return (
    <View style={styles.trail}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.trailBack}>
        <Text variant="ui" style={styles.trailBackLabel}>
          {depth > 1 ? '‹ Back to the authority that cited this' : '‹ Back to the matter'}
        </Text>
      </Pressable>
      <Text variant="ui" style={styles.trailText}>
        {matterTitle === undefined ? 'Saved to this matter' : `Saved to ${matterTitle}`}
        {depth > 1
          ? ` · ${depth - 1} ${depth - 1 === 1 ? 'authority' : 'authorities'} behind this one`
          : ''}
      </Text>
    </View>
  );
}

/** The right pane before a matter is selected — states what's missing, sells nothing. */
function EmptyPane() {
  return (
    <View style={styles.empty}>
      <Text variant="ui" style={styles.emptyText}>
        Open a matter to see its timeline here. The list stays where it is.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  listPane: { width: size.researchListPane },
  divider: { width: 1, backgroundColor: color.rule },
  detailPane: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { color: color.inkFaint, textAlign: 'center' },
  trail: {
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
    paddingBottom: space.xs,
    gap: 2,
  },
  trailBack: { minHeight: 44, justifyContent: 'center' },
  trailBackLabel: { color: color.oxblood },
  trailText: { color: color.inkFaint },
});

export default MatterWorkspace;
