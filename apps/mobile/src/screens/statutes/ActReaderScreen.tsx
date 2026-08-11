import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import type { Statute, StatuteSection } from '../../api/contract';
import { api } from '../../api/client';
import { useReadingStore } from '../../state/reading';
import { color, space } from '../../theme/tokens';

/**
 * BARE ACT READING VIEW — inventory row 106,
 * `renders/72-bare-acts@2x.png` panel 2.
 *
 * S1 task 4 asked whether this shares structure with the judgment reader. IT
 * DOES, and the render says so outright: "Identical treatment to the judgment
 * reader — 26px number gutter, current section in ink, neighbours at 50%,
 * Source Serif 4 at 17/1.72."
 *
 * What differs is parameters, not architecture:
 *   · gutter 26px, not 22 — section numbers reach three digits and carry letters
 *   · leading 1.72, not 1.68
 *   · NO CITATION UI AT ALL
 *
 * The two readers are NOT merged into one component, deliberately. A judgment
 * reader carries verification, overruled status and add-to-matter; a statute
 * reader carries none of them and must never grow them. Merging would create
 * one component with a prop that switches off the citation system — and the
 * first person to pass that prop wrongly ships a statute wearing a verification
 * mark, or a judgment without one.
 *
 * SECTION TEXT IS RENDERED VERBATIM. Government-published text is not
 * summarised, reformatted or re-wrapped here — `legalText()` is deliberately
 * NOT applied. Its curly quotes and en dashes are right for a judgment we are
 * typesetting; on a statute they would be an edit to the text of the law.
 */
export function ActReaderScreen({
  statuteId,
  onBack,
}: {
  statuteId: string;
  onBack: () => void;
}) {
  const [sections, setSections] = useState<StatuteSection[] | null>(null);
  const [statute, setStatute] = useState<Statute | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const textSize = useReadingStore((s) => s.textSize);

  useEffect(() => {
    let alive = true;
    void api.statutes().then((r) => {
      if (alive && r.ok) setStatute(r.data.statutes.find((s) => s.statuteId === statuteId) ?? null);
    });
    /** 600 covers BNSS at 531, so a whole Act arrives in one call. */
    void api.statuteSections(statuteId, 600).then((r) => {
      if (!alive) return;
      if (r.ok) setSections(r.data.sections);
      else setFailed(r.error.message);
    });
    return () => {
      alive = false;
    };
  }, [statuteId]);

  /**
   * ORDERED BY `orderIndex`, NEVER BY `sectionNumber`.
   *
   * Section numbers are text and carry letters — "63A" — so lexical ordering
   * puts s.10 before s.2. An advocate scrolling a code in the wrong order does
   * not conclude the app is broken; they conclude they misread the section.
   */
  const ordered = useMemo(
    () => [...(sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [sections]
  );

  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: { item: StatuteSection }[] }) => {
      const first = viewableItems[0]?.item;
      if (first) setCurrent(first.sectionId);
    }
  ).current;

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
          <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
        </Pressable>
        <Text variant="legal" style={styles.navTitle}>
          {statute?.shortTitle ?? 'Act'}
        </Text>
      </View>

      {failed ? (
        <View style={styles.list}>
          <Text variant="uiStrong">We could not load this Act</Text>
          <Text variant="ui" style={styles.currency}>
            {failed}
          </Text>
        </View>
      ) : sections === null ? (
        <View style={styles.list}>
          <SkeletonCard index={0} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={ordered}
          keyExtractor={(s) => s.sectionId}
          onViewableItemsChanged={onViewable}
          renderItem={({ item }) => {
            const dimmed = current !== null && item.sectionId !== current;
            return (
              <View style={styles.sectionRow}>
                {/* 26px gutter — three digits plus a letter, and the text edge stays true. */}
                <View style={styles.gutter}>
                  <Text opticalNudge variant="record" style={styles.anchor}>
                    {item.sectionNumber}
                  </Text>
                </View>
                <View style={styles.sectionBody}>
                  {/* A section with no marginal heading is ordinary in an older
                      Act. The line is omitted rather than left blank — an empty
                      strong row reads as a heading that failed to load. */}
                  {item.heading ? (
                    <Text variant="uiStrong" style={dimmed ? styles.dimmed : undefined}>
                      {item.heading}
                    </Text>
                  ) : null}
                  <Text
                    variant="legal"
                    style={[
                      { fontSize: textSize, lineHeight: textSize * 1.72 },
                      dimmed && styles.dimmed,
                    ]}
                  >
                    {item.sectionText}
                  </Text>
                  {item.footnote ? (
                    <Text variant="ui" style={styles.footnote}>
                      {item.footnote}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <Text variant="ui" style={styles.currency}>
              Published text, served as issued. We do not yet track whether this section has since
              been amended, substituted or repealed.
            </Text>
          }
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        />
      )}

      <Text variant="ui" style={styles.hint}>
        Section numbers are anchors — tap one to link it.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  navTitle: { flex: 1 },
  list: { paddingHorizontal: space.sm, paddingBottom: space.xxl },
  sectionRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  /** 26px, against the judgment reader's 22 — see the note at the top. */
  gutter: { width: 26, alignItems: 'flex-end' },
  anchor: { color: color.oxblood },
  sectionBody: { flex: 1, gap: space.xs },
  dimmed: { opacity: 0.5 },
  footnote: { color: color.inkFaint },
  currency: { color: color.inkMuted, paddingTop: space.sm },
  hint: {
    color: color.inkFaint,
    textAlign: 'center',
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
  },
});
