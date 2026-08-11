import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "OPEN RECENT WORK" IN THE COMMAND PALETTE — WHAT IT ACTUALLY MEANS HERE.
 *
 * The V2.2 prompt pack (`9_GLOBAL_COMMAND_CENTER.md`) lists "Open recent
 * work" as a command and, in the same breath, its own binding correction:
 * "Never invent or imply unsupported: ... activity numbers." There is no
 * backend "recent activity" endpoint, and inventing one client-side would be
 * exactly the fabrication the rule forbids.
 *
 * What IS real without any backend field: what THIS DEVICE actually opened.
 * Recording it here is not a claim about the advocate's activity anywhere
 * else — a second device, the web, a colleague's — only about this one, and
 * the palette must not be read as more than that.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RecentKind = 'matter' | 'judgment' | 'draft';

export type RecentItem = {
  kind: RecentKind;
  id: string;
  title: string;
  openedAt: string;
};

const KEY = 'lawmind.recentItems.v1';
/** Enough to fill the palette without becoming a second history screen. */
const MAX = 10;

type RecentItemsState = {
  items: RecentItem[];
  hydrate: () => Promise<void>;
  record: (item: Omit<RecentItem, 'openedAt'>) => void;
};

export const useRecentItems = create<RecentItemsState>((set, get) => ({
  items: [],

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ items: JSON.parse(raw) as RecentItem[] });
    } catch {
      // No history is a worse day than a wrong one; a broken cache is not a crash.
    }
  },

  /**
   * MOVES A REOPENED ITEM TO THE FRONT rather than duplicating it — "recent"
   * means recency, not a tally, and a tally is exactly the "activity number"
   * the truthful-UI rule forbids inventing.
   */
  record: (item) => {
    const next: RecentItem[] = [
      { ...item, openedAt: new Date().toISOString() },
      ...get().items.filter((existing) => !(existing.kind === item.kind && existing.id === item.id)),
    ].slice(0, MAX);
    set({ items: next });
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  },
}));
