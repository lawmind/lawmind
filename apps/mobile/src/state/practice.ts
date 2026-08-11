import { create } from 'zustand';

import { api } from '../api/client';
import type { BriefingListItem, Matter } from '../api/contract';
import {
  daysFromCivil,
  daysUntil,
  parseCivilDate,
  todayCivil,
  type CivilDate,
} from '../theme/hearingDate';
import { readCache, writeCache, type Cached } from './offlineCache';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRACTICE — the advocate's caseload, and the four screens that read it.
 *
 * Today, Matters, the daily cause list and adjournment capture are four views of
 * ONE set of facts: which matters exist and when each is next listed. They share
 * a store because they must agree. An adjournment recorded in a courtroom has to
 * move the date on Today, on the matter, and off this morning's cause list in
 * the same instant — a screen holding its own copy is a screen that shows
 * yesterday's date to somebody standing in front of a judge.
 *
 * LOCAL FIRST, ALWAYS. The cache is read before the network is asked, and a
 * failed refresh never empties what is on screen. Everything rendered from cache
 * carries its own age (`state/offlineCache.ts`), because an offline read is not
 * a live read and the product may not pretend otherwise.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MATTERS_KEY = 'matters';
const briefingsKey = (matterId: string) => `briefings.${matterId}`;

export type Freshness =
  /** Nothing read yet, from disk or network. */
  | { kind: 'unknown' }
  /** Straight from the server, this session. */
  | { kind: 'live' }
  /** From the device. The age is shown, never hidden. */
  | { kind: 'cached'; cachedAt: string };

type PracticeState = {
  matters: Matter[];
  freshness: Freshness;
  loading: boolean;
  /** Set when the last refresh failed AND we are showing cache. Never blanks the screen. */
  refreshError: string | null;

  /** Briefings keyed by matter, so a matter detail and Today read the same rows. */
  briefings: Record<string, Cached<BriefingListItem[]>>;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  loadBriefings: (matterId: string) => Promise<void>;
  /** Optimistic — the courtroom write lands locally first and syncs after. */
  setNextHearingDate: (matterId: string, iso: string | null) => Promise<void>;
};

export const usePractice = create<PracticeState>((set, get) => ({
  matters: [],
  freshness: { kind: 'unknown' },
  loading: false,
  refreshError: null,
  briefings: {},

  hydrate: async () => {
    const cached = await readCache<Matter[]>(MATTERS_KEY);
    if (cached) set({ matters: cached.value, freshness: { kind: 'cached', cachedAt: cached.cachedAt } });
    void get().refresh();
  },

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });

    const res = await api.matters();

    if (!res.ok) {
      /**
       * A FAILED REFRESH IS NOT AN EMPTY CASELOAD.
       *
       * The one place an advocate most needs this screen is the place with the
       * worst signal. Clearing the list on a network error would empty it in a
       * court basement, which is the opposite of what offline-first means.
       */
      set({ loading: false, refreshError: res.error.message });
      return;
    }

    const matters = res.data.matters;
    const entry = await writeCache(MATTERS_KEY, matters);
    set({ matters, loading: false, refreshError: null, freshness: { kind: 'live' } });
    void entry;
  },

  loadBriefings: async (matterId) => {
    const cached = await readCache<BriefingListItem[]>(briefingsKey(matterId));
    if (cached) set({ briefings: { ...get().briefings, [matterId]: cached } });

    const res = await api.matterBriefings(matterId);
    if (!res.ok) return;

    const entry = await writeCache(briefingsKey(matterId), res.data.briefings);
    set({ briefings: { ...get().briefings, [matterId]: entry } });
  },

  /**
   * THE HIGHEST-FREQUENCY WRITE IN THE PRODUCT, AND IT LANDS LOCALLY FIRST.
   *
   * `IMPLEMENTATION.md` §9d: "Offline first, not offline tolerant. The write
   * lands locally before anything else happens." An advocate in a courtroom with
   * no signal taps once and walks out; the sync is a footnote, and a screen that
   * waited on the network here would be a screen nobody uses twice.
   *
   * `null` CLEARS the date rather than meaning "unchanged" — the API contract
   * draws that distinction and so does this.
   */
  setNextHearingDate: async (matterId, iso) => {
    const optimistic = get().matters.map((m) =>
      m.matterId === matterId ? { ...m, nextHearingDate: iso } : m
    );
    set({ matters: optimistic });
    void writeCache(MATTERS_KEY, optimistic);

    const res = await api.updateMatter(matterId, { nextHearingDate: iso });
    if (res.ok) {
      const reconciled = get().matters.map((m) => (m.matterId === matterId ? res.data.matter : m));
      set({ matters: reconciled });
      void writeCache(MATTERS_KEY, reconciled);
    }
    // A failed write keeps the optimistic value. The advocate heard the date in
    // open court; our inability to reach a server does not unmake that fact, and
    // the refresh on next launch reconciles it.
  },
}));

/* ---------------------------------------------------------------- selectors */

export type ListedMatter = { matter: Matter; date: CivilDate; daysAway: number };

/**
 * Matters with a next date, soonest first, dates in the past excluded.
 *
 * A PAST DATE IS NOT AN UPCOMING HEARING. It means an adjournment was never
 * recorded, and showing it among the coming week's listings buries the one thing
 * to do about it under things that have not happened yet.
 */
export function upcoming(matters: Matter[], today: CivilDate = todayCivil()): ListedMatter[] {
  const out: ListedMatter[] = [];
  for (const matter of matters) {
    if (!matter.nextHearingDate) continue;
    const date = parseCivilDate(matter.nextHearingDate);
    if (!date) continue;
    const daysAway = daysFromCivil(date) - daysFromCivil(today);
    if (daysAway < 0) continue;
    out.push({ matter, date, daysAway });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/** Matters whose recorded date has passed — they need an adjournment, and Today says so. */
export function overdue(matters: Matter[], today: CivilDate = todayCivil()): ListedMatter[] {
  const out: ListedMatter[] = [];
  for (const matter of matters) {
    if (!matter.nextHearingDate) continue;
    const date = parseCivilDate(matter.nextHearingDate);
    if (!date) continue;
    const daysAway = daysFromCivil(date) - daysFromCivil(today);
    if (daysAway >= 0) continue;
    out.push({ matter, date, daysAway });
  }
  return out.sort((a, b) => b.daysAway - a.daysAway);
}

/** Listed today. The cause list's whole population. */
export function listedToday(matters: Matter[], today: CivilDate = todayCivil()): ListedMatter[] {
  return upcoming(matters, today).filter((m) => m.daysAway === 0);
}

/**
 * The next seven days, excluding today — "ALSO THIS WEEK" on Today.
 * `renders/31-today@2x.png`.
 */
export function alsoThisWeek(matters: Matter[], today: CivilDate = todayCivil()): ListedMatter[] {
  return upcoming(matters, today).filter((m) => m.daysAway >= 1 && m.daysAway <= 7);
}

/**
 * The briefing Today leads with: tomorrow's.
 *
 * THE WEDGE IS A 24-HOUR BRIEFING, so this deliberately does not fall back to
 * "the next one whenever it is". A briefing for a hearing three weeks out is not
 * the thing an advocate opens tonight, and putting it in the same slot would
 * teach them the slot means nothing.
 */
export function tomorrowsBriefing(
  matters: Matter[],
  briefings: Record<string, Cached<BriefingListItem[]>>,
  today: CivilDate = todayCivil()
): { briefing: BriefingListItem; matter: Matter; cachedAt: string } | null {
  for (const { matter, daysAway } of upcoming(matters, today)) {
    if (daysAway !== 1) continue;
    const entry = briefings[matter.matterId];
    if (!entry) continue;
    /**
     * NO `matterId` COMPARISON, and its absence is the fix rather than a
     * relaxation. `GET /matters/:id/briefings` does not send `matterId` — it
     * is an index scoped to one matter and has no reason to repeat it — so
     * `b.matterId === matter.matterId` compared `undefined` to a real id and
     * was FALSE on every row.
     *
     * The effect was that Today never found tomorrow's briefing at all: the
     * wedge feature's own card could not appear on the home screen, and it
     * looked like there was simply nothing to show. The rows are already
     * keyed by matter in this store, so the check was redundant even when it
     * was harmless.
     */
    const match = entry.value.find((b) => daysUntil(b.hearingDate, today) === 1);
    if (match) return { briefing: match, matter, cachedAt: entry.cachedAt };
  }
  return null;
}
