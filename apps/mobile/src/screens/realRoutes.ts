import type { Href } from 'expo-router';

/**
 * Inventory rows that stopped being shells.
 *
 * The manifest is GENERATED from `design/screens/SCREENS.md` and must not be
 * hand-edited, so "which of these is real yet" lives here instead. `/s/<slug>`
 * redirects through this map, which keeps the directory honest: every row in
 * the inventory stays reachable by its own slug, and a row that became real
 * takes you to the real thing rather than to a shell describing it.
 *
 * SEVERAL ROWS COLLAPSE ONTO ONE SCREEN, deliberately. Rows 15, 16, 17, 86 and
 * 87 are search with results, search loading, search empty, filters open and
 * filters applied — five drawings of one screen in five states, not five
 * screens. Building them as five would be five places for the same bug.
 *
 * The judgment rows point at fixture ids chosen to land on the state the row is
 * about: row 19 opens a `set_aside` authority, row 22 an unconfirmed one. When
 * the corpus is live these become real ids and this map shrinks to the slugs
 * that still need one.
 */
export const REAL_ROUTES: Record<string, Href> = {
  /* Search — one screen, five drawn states */
  'search-query-input': '/(tabs)/search',
  'search-results-mixed-list': '/(tabs)/search',
  'search-loading': '/(tabs)/search',
  'search-no-results': '/(tabs)/search',
  'search-filters-expanded': '/(tabs)/search',
  'filtered-results': '/(tabs)/search',

  /* Judgment — one screen, the states come from the row */
  'judgment-detail': '/judgment/jdg_mock_1',
  'judgment-detail-no-badge': '/judgment/jdg_mock_1',
  'judgment-set-aside': '/judgment/jdg_mock_6',
  'judgment-partly-set-aside': '/judgment/jdg_mock_5',
  'judgment-doubted': '/judgment/jdg_mock_7',
  'unverified-citation-detail': '/judgment/jdg_mock_3',
  /** `?read=1` is the reading view. `?para=` is the anchor — PD-9 item 1. */
  'judgment-reading-view': '/judgment/jdg_mock_2?read=1',
  'judgment-reading-sheet': '/judgment/jdg_mock_2?read=1',
  'judgment-in-text-search': '/judgment/jdg_mock_2?read=1',

  /* Statutes — a reader with no citation UI, because a statute has no citation */
  'bare-acts-index': '/acts',
  'bare-acts-reading-bns': '/acts/act_bns',
};
