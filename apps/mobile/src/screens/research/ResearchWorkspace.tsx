import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '../../components/Text';
import { JudgmentScreen } from '../judgment/JudgmentScreen';
import { PrecedentScreen } from '../precedent/PrecedentScreen';
import { SearchScreen, type OpenJudgmentTarget } from '../search/SearchScreen';
import { color, size, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL V1 — Master Roadmap v7.1 governs and places the advocate research
 * workstation in v1. NEW3 R14 still records every public advocate-web
 * capability as `DISABLED_NOT_READY`, so this remains a local Expo web surface
 * and authorises no public route, claim or deployment. Below
 * `size.researchTwoPane` it still renders exactly the phone screen, so the
 * mobile path is unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE DESKTOP RESEARCH WORKSPACE — PD-15, settled 11 Aug 2026 (`FQ-D9`),
 * history below kept as it was written.
 *
 * ── WHAT IT IS FOR, AND IT IS ONE THING ─────────────────────────────────────
 *
 * A phone cannot keep a result list and a judgment on screen at once. That is
 * not a shortcoming of the phone — a 390px screen is right to give the whole
 * width to whatever is being read. But it means research on a phone is a
 * sequence of round trips: open an authority, read it, come back, find your
 * place, open the next one. An advocate comparing four authorities does that
 * eight times and loses the thread.
 *
 * THE LIST SURVIVING THE READ IS THE ENTIRE POINT. Everything else here follows
 * from it. There is no dashboard, no widget grid, no second design system, and
 * nothing on this surface that does not already exist on the phone.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * It is not a redesign of anything. `SearchScreen`, `JudgmentScreen` and
 * `PrecedentScreen` are mounted here UNCHANGED, with the props they already
 * take. The only new seam is `SearchScreen`'s optional `onOpenJudgment`, and
 * without it that screen pushes a route exactly as it always has — PD-15:
 * mobile is not redesigned around desktop.
 *
 * ── REVERSIBLE BY CONSTRUCTION ──────────────────────────────────────────────
 *
 * Below `size.researchTwoPane` this component renders `<SearchScreen />` and
 * nothing else, which is byte-for-byte what the search tab did before. One
 * width comparison is the whole switch. Removing the workspace is deleting this
 * file and one import.
 *
 * ── NO BACKEND WORK, BY THE DECISION AND IN FACT ────────────────────────────
 *
 * Same `POST /search`, same `GET /judgments/:id`. This surface adds no endpoint,
 * no parameter and no field. PD-15 forbids a server change for the desktop
 * workspace alone and none was needed.
 *
 * ── THE CITATION RULES DO NOT BEND FOR A WIDER SCREEN ───────────────────────
 *
 * Every citation on both panes is drawn by the screens that already draw them,
 * from the same helpers, against the same database rows. Verified stays silent.
 * `overruled_status` is still read live at render — the reader re-fetches per
 * judgment, so a pane that has been open for an hour is not showing an hour-old
 * good-law answer. Amber still means only that the law has moved. More room to
 * draw is not permission to decorate.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ONE OPEN AUTHORITY IN THE RIGHT PANE.
 *
 * `treatment` is the same authority seen through its citation network, not a
 * different one — which is why it carries the same `judgmentId` and inherits
 * the title rather than re-fetching a heading the advocate is looking at.
 */
type Pane =
  | {
      kind: 'judgment';
      judgmentId: string;
      citationCheckId?: string | null;
      /** Known when the judgment was opened from a result row; absent from a citation link. */
      caseTitle?: string;
      neutralCitation?: string | null;
      /** PD-9 — the reading mode and the anchor, per open authority. */
      reading: boolean;
      openParagraph?: number;
    }
  | {
      kind: 'treatment';
      judgmentId: string;
      caseTitle?: string;
      neutralCitation?: string | null;
    };

export function ResearchWorkspace() {
  const { width } = useWindowDimensions();
  const twoPane = width >= size.researchTwoPane;

  /**
   * A STACK, NOT A SINGLE SLOT — this is what "multiple authorities" means in
   * practice. Reading an authority leads to the one it relied on, and to the
   * bench that doubted it; each of those opens IN THE PANE and can be stepped
   * back out of without touching the results, which have not moved.
   *
   * Held here rather than in the URL. The top entry is what an anchor would
   * address; the depth behind it is navigation history, and putting a whole
   * back-stack in a query string makes an unshareable link that looks
   * shareable.
   */
  const [stack, setStack] = useState<Pane[]>([]);
  const top = stack[stack.length - 1];

  const push = useCallback((pane: Pane) => setStack((s) => [...s, pane]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const openFromSearch = useCallback(
    (target: OpenJudgmentTarget) => {
      /*
        A NEW SEARCH RESULT REPLACES THE STACK RATHER THAN GROWING IT. The stack
        is a trail through ONE line of enquiry — this authority, then what it
        relied on. Picking a different result is starting a different line, and
        keeping the old trail behind it would build a back button that walks
        through judgments the advocate has already finished with.
      */
      setStack([
        {
          kind: 'judgment',
          judgmentId: target.judgmentId,
          citationCheckId: target.citationCheckId,
          caseTitle: target.caseTitle,
          neutralCitation: target.neutralCitation,
          reading: target.paragraphNumber !== undefined,
          openParagraph: target.paragraphNumber,
        },
      ]);
    },
    [],
  );

  /** Below the breakpoint this component IS the search screen. Nothing else runs. */
  if (!twoPane) return <SearchScreen />;

  return (
    <View style={styles.root}>
      <View style={styles.listPane}>
        <SearchScreen onOpenJudgment={openFromSearch} />
      </View>

      {/*
        A 1px rule, not a shadow and not a gap. Depth in this product comes from
        rules and spacing, as on a printed page — `DESIGN_SYSTEM` §Material.
      */}
      <View style={styles.divider} />

      <View style={styles.readerPane}>
        {top ? <PaneContent pane={top} depth={stack.length} onPop={pop} onPush={push} /> : <EmptyPane />}
      </View>
    </View>
  );
}

/**
 * The right pane before anything is opened.
 *
 * IT DOES NOT SELL THE FEATURE. An advocate who has just opened a research
 * workspace does not need to be told what research is; they need to know why
 * half their screen is empty, which is because they have not picked anything
 * yet. One line, muted, and no illustration.
 */
function EmptyPane() {
  return (
    <View style={styles.empty}>
      <Text variant="ui" style={styles.emptyText}>
        Open a judgment to read it here. The results stay where they are.
      </Text>
    </View>
  );
}

function PaneContent({
  pane,
  depth,
  onPop,
  onPush,
}: {
  pane: Pane;
  depth: number;
  onPop: () => void;
  onPush: (pane: Pane) => void;
}) {
  const router = useRouter();
  /**
   * Reading mode is pane-local rather than a route param, and that is a
   * DEPARTURE from `app/judgment/[id].tsx` worth stating: on the phone the mode
   * lives in the URL so a paragraph anchor is linkable (PD-9). Here the
   * shareable address of a paragraph is still the phone route — an advocate
   * sending "¶ 11 of this judgment" to a junior sends `/judgment/<id>?read=1&
   * para=11`, which opens correctly for the recipient at any width. What the
   * workspace holds is which pane is scrolled where, and that is not an anchor.
   */
  const [reading, setReading] = useState(pane.kind === 'judgment' ? pane.reading : false);
  const [openParagraph, setOpenParagraph] = useState<number | undefined>(
    pane.kind === 'judgment' ? pane.openParagraph : undefined,
  );

  /**
   * BACK MEANS "OUT OF THIS AUTHORITY", NEVER "OUT OF THE WORKSPACE". At depth
   * 1 there is nothing behind it in the pane, so the pane closes and the
   * results — which never moved — take the full attention again. Popping the
   * app's navigation stack from here would leave the search tab entirely, which
   * is the one thing this layout exists to stop.
   */
  const back = () => onPop();

  if (pane.kind === 'treatment') {
    return (
      <>
        <PaneTrail depth={depth} />
        <PrecedentScreen
          caseTitle={pane.caseTitle ?? ''}
          judgmentId={pane.judgmentId}
          neutralCitation={pane.neutralCitation ?? ''}
          onBack={back}
          onOpenJudgment={(id) => onPush({ kind: 'judgment', judgmentId: id, reading: false })}
        />
      </>
    );
  }

  return (
    <>
      <PaneTrail depth={depth} />
      <JudgmentScreen
        citationCheckId={pane.citationCheckId ?? undefined}
        judgmentId={pane.judgmentId}
        onBack={back}
        /*
          A citation inside the judgment opens IN THE PANE, on top of the one
          being read. This is the movement the whole layout is for: following an
          authority's own authorities without losing either the results or the
          judgment that sent you there.
        */
        onOpenJudgment={(id) => onPush({ kind: 'judgment', judgmentId: id, reading: false })}
        onOpenTreatment={() =>
          onPush({
            kind: 'treatment',
            judgmentId: pane.judgmentId,
            caseTitle: pane.caseTitle,
            neutralCitation: pane.neutralCitation,
          })
        }
        onSetReading={(next, paragraphNumber) => {
          setReading(next);
          setOpenParagraph(paragraphNumber);
          /*
            The anchor is still written to the URL so PD-9 holds at any width —
            a paragraph an advocate is looking at must remain something they can
            send. `setParams` rather than `push`: opening a paragraph is not a
            new place, it is where they already are.
          */
          router.setParams({
            open: pane.judgmentId,
            read: next ? '1' : undefined,
            para: paragraphNumber ? String(paragraphNumber) : undefined,
          });
        }}
        openParagraph={openParagraph}
        reading={reading}
      />
    </>
  );
}

/**
 * HOW DEEP THE PANE IS, AND NOTHING MORE.
 *
 * Not breadcrumbs: naming each authority in the trail would need their titles,
 * and a judgment opened from a citation link inside another does not carry one
 * until it has loaded. A trail that renders blanks while it fetches is worse
 * than a trail that states its depth honestly. Drawn only when there IS a
 * behind — at depth 1 it would be chrome describing nothing.
 */
function PaneTrail({ depth }: { depth: number }) {
  if (depth < 2) return null;
  return (
    <View style={styles.trail}>
      <Text variant="ui" style={styles.trailText}>
        {depth - 1} {depth - 1 === 1 ? 'authority' : 'authorities'} behind this one
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  /**
   * FIXED, NOT A FRACTION. A result card's measure was designed once, against
   * the phone, and does not read better for being stretched — and a list that
   * reflows while the window is dragged is a list an advocate loses their place
   * in, which is the failure this layout exists to prevent.
   */
  listPane: { width: size.researchListPane },
  divider: { width: 1, backgroundColor: color.rule },
  readerPane: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { color: color.inkFaint, textAlign: 'center' },
  trail: {
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
  },
  trailText: { color: color.inkFaint },
});

/** Named for the route that mounts it; the component name says what it is. */
export default ResearchWorkspace;
