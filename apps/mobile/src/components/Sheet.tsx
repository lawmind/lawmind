import { type ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Glass } from './Glass';
import { color, radius, shadow, space } from '../theme/tokens';

/**
 * Bottom sheet. 12px radius, TOP CORNERS ONLY — one of the two exceptions to
 * the 2px rule, alongside genuinely circular elements.
 *
 * The sheet is chrome, so it takes glass at `sheetBlur`. What sits underneath
 * it is content and stays opaque: a sheet blurs its own background
 * proportionally to the drag, and the judgment beneath never becomes
 * translucent itself.
 *
 * Shadow is permitted here — a modal sheet is one of the three genuinely
 * floating cases.
 */
export function Sheet({
  visible,
  onDismiss,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessible={false} onTouchEnd={onDismiss} style={styles.backdropTap} />
        <Glass edge="topLeft" sheet style={styles.sheet}>
          <View style={styles.grabberRow}>
            <View style={styles.grabber} />
          </View>
          {children}
        </Glass>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: space.lg,
    shadowColor: shadow.modalSheet.color,
    shadowOffset: { width: shadow.modalSheet.offset[0], height: shadow.modalSheet.offset[1] },
    shadowRadius: shadow.modalSheet.radius,
    shadowOpacity: 1,
  },
  grabberRow: { alignItems: 'center', paddingVertical: space.xs },
  grabber: { width: 36, height: 4, borderRadius: radius.circle, backgroundColor: color.rule },
});
