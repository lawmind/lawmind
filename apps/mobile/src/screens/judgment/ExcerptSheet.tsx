import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { color, family, space } from '../../theme/tokens';
import { EXCERPT_TOO_LONG_COPY, excerptOf, QUOTE_MAX } from './excerpt';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CHOOSE THE EXACT PASSAGE. RCC R28, B1 — for paragraphs over 4,000 characters.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R24 froze `EXACT_USER_SELECTED_EXCERPT`: a paragraph the server will not
 * take whole is saved as a contiguous run the advocate selects with the phone's
 * own handles. Nothing is preselected — a default "first 4,000" would be the
 * product choosing the advocate's evidence for them.
 *
 * WHY AN EDITABLE TextInput THAT CANNOT BE EDITED. React Native's Android
 * `editable={false}` is `EditText.setEnabled(false)` (`ReactTextInputManager`),
 * and a disabled view takes no touches, so no selection handles. `<Text
 * selectable>` has handles but reports no offsets. So the input stays enabled,
 * shows no keyboard, and is CONTROLLED: any change (a paste from the context
 * menu) is reverted to the source on the next render and clears the selection.
 *
 * THE QUOTE NEVER COMES FROM THE INPUT. Only the offsets do, and the excerpt is
 * `source.slice(start, end)` — so even a change the revert has not yet caught
 * cannot put a typed word into a matter file.
 *
 * ONE SELECTION, BOTH DESTINATIONS. The bare save and "Save to matter" read the
 * same excerpt; the matter picker is handed that string, never the paragraph.
 */
export function ExcerptSheet({
  visible,
  source,
  primary,
  onDismiss,
  onSave,
  onSaveToMatter,
}: {
  visible: boolean;
  /** The paragraph text, exactly as the reader holds it. The evidence authority. */
  source: string;
  /** Which destination the advocate came from — that button leads. */
  primary: 'bare' | 'matter';
  onDismiss: () => void;
  onSave: (excerpt: string) => void;
  onSaveToMatter: (excerpt: string) => void;
}) {
  const { height } = useWindowDimensions();
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  // A new paragraph, or a reopened sheet, starts with nothing chosen.
  useEffect(() => {
    setSelection(null);
  }, [source, visible]);

  const length = selection ? selection.end - selection.start : 0;
  const result = selection ? excerptOf(source, selection.start, selection.end) : null;
  const excerpt = result?.ok ? result.excerpt : null;
  const tooLong = result?.ok === false && result.reason === 'too_long';

  const save = () => {
    if (excerpt !== null) onSave(excerpt);
  };
  const toMatter = () => {
    if (excerpt !== null) onSaveToMatter(excerpt);
  };

  const buttons = [
    <Button
      disabled={excerpt === null}
      key="bare"
      label="Save passage"
      onPress={save}
      variant={primary === 'bare' ? 'primary' : 'secondary'}
    />,
    <Button
      disabled={excerpt === null}
      key="matter"
      label="Save to matter"
      onPress={toMatter}
      variant={primary === 'matter' ? 'primary' : 'secondary'}
    />,
  ];

  return (
    <Sheet dragToDismiss={false} onDismiss={onDismiss} visible={visible}>
      <View style={styles.body}>
        <Text variant="eyebrow">This paragraph is too long to save whole</Text>
        <Text variant="ui">Select the exact passage you want to save.</Text>
        <TextInput
          accessibilityHint="Use the selection handles to choose the passage."
          accessibilityLabel="Paragraph text"
          caretHidden
          contextMenuHidden={false}
          multiline
          onChange={() => setSelection(null)}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          scrollEnabled
          showSoftInputOnFocus={false}
          style={[
            styles.source,
            DEVANAGARI.test(source) && { fontFamily: family.devanagariSerif },
            { maxHeight: height * 0.5 },
          ]}
          testID="excerpt-source"
          value={source}
        />
        <View accessibilityLiveRegion="polite" style={styles.countRow}>
          <Text testID="excerpt-count" variant="record" style={styles.count}>
            {`${length} / ${QUOTE_MAX}`}
          </Text>
          {tooLong ? (
            <Text variant="ui" style={styles.warning}>
              {EXCERPT_TOO_LONG_COPY}
            </Text>
          ) : null}
        </View>
        {primary === 'bare' ? buttons : [...buttons].reverse()}
      </View>
    </Sheet>
  );
}

/** A Hindi judgment needs a Devanagari face here too, or glyphs go missing. */
const DEVANAGARI = /[ऀ-ॿ]/;

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.sm, paddingTop: space.xs, gap: space.xs },
  source: {
    fontFamily: family.serif,
    fontSize: 16,
    lineHeight: 16 * 1.6,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.card,
    padding: space.xs,
    textAlignVertical: 'top',
  },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  count: { color: color.inkMuted },
  warning: { color: color.ink, flexShrink: 1, textAlign: 'right' },
});
