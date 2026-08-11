import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable as RNPressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FilePlus, FolderOpen, Search as SearchIcon } from 'lucide-react-native';

import { Text } from './Text';
import { useCommandPalette } from '../state/commandPalette';
import { usePractice } from '../state/practice';
import { useRecentItems, type RecentKind } from '../state/recentItems';
import { haptics } from '../theme/haptics';
import { color, family, glass, radius, shadow, space, type as typeScale } from '../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COMMAND PALETTE — goldfinal.zip, V2.2 `9_GLOBAL_COMMAND_CENTER.md`.
 *
 * DETERMINISTIC NAVIGATION ONLY, on purpose. V2.2's own binding correction:
 * "Separate deterministic navigation from contextual intelligence... Only
 * expose contextual commands where backend capability actually exists." This
 * app has no synthesis endpoint ("find support for this proposition") and no
 * per-context citation graph exposed to a global palette yet, so those
 * commands are not here — a palette entry that cannot do what it says is
 * worse than a shorter palette.
 *
 * WHAT IS HERE IS ALL REAL: static navigation to routes that exist, matter
 * titles matched against `usePractice()`'s already-loaded list (no network
 * call to build a palette), and "recent" items this DEVICE actually opened
 * (`state/recentItems.ts` — never a fabricated activity feed).
 *
 * A FOCUSED LAYER, NOT A NEW SCREEN. The current screen stays mounted
 * underneath; this is a `Modal` over it, dismissed by Escape, a backdrop tap,
 * or picking a destination.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Row =
  | { kind: 'action'; key: string; label: string; hint?: string; onSelect: () => void }
  | { kind: 'matter'; key: string; label: string; onSelect: () => void }
  | { kind: 'recent'; key: string; label: string; recentKind: RecentKind; onSelect: () => void };

const RECENT_LABEL: Record<RecentKind, string> = {
  matter: 'Matter',
  judgment: 'Judgment',
  draft: 'Draft',
};

export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const router = useRouter();
  const matters = usePractice((s) => s.matters);
  const recentItems = useRecentItems((s) => s.items);
  const hydrateRecent = useRecentItems((s) => s.hydrate);

  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    void hydrateRecent();
  }, [hydrateRecent]);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const go = (fn: () => void) => {
    haptics.shift();
    setOpen(false);
    fn();
  };

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();

    const allActions: Row[] = [
      {
        kind: 'action',
        key: 'search',
        label: 'Search law',
        onSelect: () => go(() => router.push('/search')),
      },
      {
        kind: 'action',
        key: 'new-matter',
        label: 'New matter',
        onSelect: () => go(() => router.push('/matter/new' as never)),
      },
      {
        kind: 'action',
        key: 'drafts',
        label: 'Open drafts',
        onSelect: () => go(() => router.push('/drafts')),
      },
      {
        kind: 'action',
        key: 'matters',
        label: 'Open matters',
        onSelect: () => go(() => router.push('/matters')),
      },
    ];
    const actions = allActions.filter((a) => !q || a.label.toLowerCase().includes(q));

    const matterRows: Row[] = q
      ? matters
          .filter((m) => m.caseTitle.toLowerCase().includes(q))
          .slice(0, 6)
          .map((m) => ({
            kind: 'matter' as const,
            key: `matter-${m.matterId}`,
            label: m.caseTitle,
            onSelect: () =>
              go(() => router.push({ pathname: '/matter/[id]', params: { id: m.matterId } })),
          }))
      : [];

    const recentRows: Row[] = recentItems
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .slice(0, q ? 6 : 5)
      .map((r) => ({
        kind: 'recent' as const,
        key: `recent-${r.kind}-${r.id}`,
        label: r.title,
        recentKind: r.kind,
        onSelect: () =>
          go(() => {
            if (r.kind === 'matter') {
              router.push({ pathname: '/matter/[id]', params: { id: r.id } });
            } else if (r.kind === 'judgment') {
              router.push({ pathname: '/judgment/[id]', params: { id: r.id } });
            } else {
              router.push({ pathname: '/document/[id]', params: { id: r.id } } as never);
            }
          }),
      }));

    return [...actions, ...matterRows, ...recentRows];
  }, [query, matters, recentItems, router]);

  /** Escape closes on web/desktop, where the palette is keyboard-first. */
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible>
      <View style={styles.backdrop}>
        <RNPressable
          accessibilityLabel="Close command palette"
          onPress={() => setOpen(false)}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.card}>
          <TextInput
            autoFocus
            onChangeText={setQuery}
            placeholder="Search law, matters, drafts…"
            placeholderTextColor={color.inkFaint}
            ref={inputRef}
            style={styles.input}
            value={query}
          />
          <View style={styles.rule} />
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {rows.length === 0 ? (
              <Text style={styles.empty} variant="ui">
                Nothing matches “{query}”.
              </Text>
            ) : (
              rows.map((row) => <ResultRow key={row.key} row={row} />)
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ResultRow({ row }: { row: Row }) {
  const Icon = row.kind === 'action' ? (row.key === 'new-matter' ? FilePlus : SearchIcon) : FolderOpen;
  return (
    <RNPressable onPress={row.onSelect} style={styles.row}>
      <Icon color={color.inkFaint} size={16} strokeWidth={1.5} />
      <Text style={styles.rowLabel} variant="ui">
        {row.label}
      </Text>
      {row.kind === 'recent' ? (
        <Text style={styles.rowHint} variant="eyebrow">
          {RECENT_LABEL[row.recentKind]}
        </Text>
      ) : null}
    </RNPressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: glass.scrim,
    alignItems: 'center',
    /** A touch closer to the top than dead-centre — the eye lands there faster. */
    paddingTop: 120,
    paddingHorizontal: space.md,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: color.card,
    borderRadius: radius.max,
    borderWidth: 1,
    borderColor: color.rule,
    shadowColor: shadow.modalSheet.color,
    shadowOffset: { width: shadow.modalSheet.offset[0], height: shadow.modalSheet.offset[1] },
    shadowRadius: shadow.modalSheet.radius,
    shadowOpacity: 1,
    overflow: 'hidden',
  },
  input: {
    fontFamily: family.ui,
    fontSize: typeScale.body.fontSize,
    color: color.ink,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 52,
  },
  rule: { height: 1, backgroundColor: color.rule },
  list: { maxHeight: 360 },
  empty: { color: color.inkFaint, padding: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    minHeight: 44,
  },
  rowLabel: { flex: 1, color: color.ink },
  rowHint: { color: color.inkFaint },
});
