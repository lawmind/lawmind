import { create } from 'zustand';

import { runAttempt } from '../api/attempt';
import { api } from '../api/client';
import type { BriefingListItem, Matter, MatterStatus } from '../api/contract';
import {
  daysFromCivil,
  daysUntil,
  formatLong,
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
  /**
   * The date AND the purpose it was given for. Returns whether the purpose
   * actually reached the server, because the two halves have different
   * guarantees and the screen may not claim the weaker one is the stronger.
   */
  recordAdjournment: (
    matterId: string,
    iso: string,
    purpose: string,
    /**
     * R16. The EVENT half only — the date is a column on `matters` and a PATCH,
     * which does not create a second object on replay. Optional so the store
     * keeps working for any caller that has no attempt of its own.
     */
    attemptKey?: string,
  ) => Promise<{ purposeRecorded: boolean }>;
  /**
   * EDIT THE CONTRACTED FIELDS OF A MATTER — NEW3 R16 `R16-RCC-02`, D-2.
   *
   * NOT OPTIMISTIC, and that is the difference from `setNextHearingDate`
   * above. A hearing date is heard in open court and is true whether or not we
   * reach a server, so it lands locally first. A corrected case title is a
   * correction TO OUR RECORD and has no existence outside it — showing it as
   * applied while the write failed would leave an advocate believing they had
   * fixed a title that is still wrong, and they would find out by reading it in
   * a filing.
   *
   * Returns the server's own message on failure so the screen can render it
   * verbatim rather than inventing a generic line.
   */
  editMatter: (
    matterId: string,
    patch: MatterPatch,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

/**
 * EXACTLY WHAT `PATCH /matters/:id` ACCEPTS, AND NOTHING ELSE.
 *
 * Read off `patchMatterBody` in `services/api/src/matters/route.ts` and its
 * UPDATE statement on 1 September 2026, not off the design pack: **the founder
 * design's D-2 lists `caseType` and `parties` as patchable and they are
 * not** — the zod body has no such keys and the SQL writes no such columns, so
 * offering either would be an edit that silently does nothing. They are set at
 * creation and are identity for now; changing that is a CCR.
 *
 * `nextHearingDate: null` CLEARS the date and `undefined` leaves it alone.
 * The server draws that distinction explicitly and so does this type.
 */
export type MatterPatch = {
  caseTitle?: string;
  cnrNumber?: string | null;
  court?: string;
  clientName?: string;
  ourSide?: Matter['ourSide'];
  nextHearingDate?: string | null;
  status?: MatterStatus;
};

/**
 * THE COURT RECORD SENTENCE — NEW3 R15 §6 P3.
 *
 * `orderText`, not `notes`. A purpose given in open court is what the court
 * said, and `orderText` is the half that travels with a share
 * (`services/api/src/matters/route.ts`: "the court record. Always visible to a
 * share"); `notes` is the advocate's own thinking and defaults to private, so
 * putting the purpose there would hide from a co-counsel the one fact the
 * hearing produced.
 */
export function adjournmentOrderText(iso: string, purpose: string): string {
  const date = parseCivilDate(iso);
  const on = date ? formatLong(date) : iso;
  const trimmed = purpose.trim();
  // "Same purpose" is a real answer and reads as a fragment inside a sentence;
  // every other option is a noun that does not.
  const forWhat = /^same purpose$/i.test(trimmed) ? 'the same purpose' : trimmed.toLowerCase();
  return trimmed ? `Adjourned to ${on} for ${forWhat}.` : `Adjourned to ${on}.`;
}

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

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * THE PURPOSE IS A SECOND WRITE, AND IT IS NOT LOCAL-FIRST. Both halves of
   * that sentence are load-bearing.
   *
   * The purpose row on `AdjournmentScreen` was a FALSE AFFORDANCE: it was
   * rendered, it was selectable, the selection was held in component state, and
   * `save()` sent only the date. An advocate selected "Evidence", saw the ink
   * stamp and "the next hearing date is saved on this matter", and had recorded
   * nothing — the same class of harm as an unconfirmed OCR date, and the reason
   * this is a P0 rather than a missing feature.
   *
   * THE DATE IS A COLUMN; THE PURPOSE IS AN EVENT. `next_hearing_date` lives on
   * `matters` and can be held optimistically because the store already owns the
   * matter row. A purpose is a line in the timeline — `POST /matters/:id/events`
   * — and this store holds no local timeline to write it into. Inventing one so
   * the screen could claim success offline would be exactly the fake local
   * persistence the round forbids: the advocate would be told the court record
   * carries something it does not.
   *
   * SO THE ANSWER IS RETURNED RATHER THAN SWALLOWED. `purposeRecorded` is what
   * the screen renders its second line from. The DATE is still saved either way
   * and still says so; only the purpose sentence waits on the server, and when
   * the server is not there the screen says the purpose was not recorded
   * instead of implying it was.
   *
   * NOT AWAITED BY THE CALLER'S FIRST PAINT. `save()` shows the stamp
   * immediately and this resolves underneath it, which is what keeps the
   * one-tap-plus-save budget on a Redmi in a corridor.
   * ─────────────────────────────────────────────────────────────────────────
   */
  recordAdjournment: async (matterId, iso, purpose, attemptKey) => {
    await get().setNextHearingDate(matterId, iso);

    /*
      THE KEY PROTECTS THE PURPOSE, NOT THE DATE, AND THE DISTINCTION STANDS.
      R16 does not merge the two halves into one atomic guarantee and nothing
      here pretends it does: `next_hearing_date` is a column written
      optimistically and reconciled on next launch; the purpose is an append to
      the matter timeline, and an append is the thing a retry duplicates.
    */
    const event = {
      eventDate: iso,
      eventType: 'hearing',
      orderText: adjournmentOrderText(iso, purpose),
      // `notes` and `noteVisibility` are deliberately absent. PD-4 puts the
      // default in the COLUMN, and sending nothing is how this client lets the
      // column decide.
    };
    const res = attemptKey
      ? await runAttempt(attemptKey, (key) => api.addMatterEvent(matterId, event, key))
      : await api.addMatterEvent(matterId, event);

    return { purposeRecorded: res.ok };
  },

  editMatter: async (matterId, patch) => {
    const res = await api.updateMatter(matterId, patch);
    if (!res.ok) return { ok: false, message: res.error.message };

    /*
      THE SERVER'S ROW REPLACES OURS WHOLESALE rather than being merged into it.
      `shapeMatter()` returns every column, so a merge could only ever
      reintroduce a stale field — and `status` in particular must come from
      the row that was actually written, because it decides what the morning
      shows.
    */
    const reconciled = get().matters.map((m) => (m.matterId === matterId ? res.data.matter : m));
    set({ matters: reconciled });
    void writeCache(MATTERS_KEY, reconciled);
    return { ok: true };
  },
}));

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AN UNLOADED STORE IS NOT AN EMPTY CASELOAD. RCC R29 / R30.
 *
 * `matters` is `[]` both before anything was read and after a live read found
 * none. Only the second may be shown as "none". A screen reached by deep link
 * gets no tab to hydrate the store for it, so it asks here, and states absence
 * only once a live read has completed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type CaseloadView = 'list' | 'empty' | 'resolving' | 'unavailable';

export function caseloadView(p: {
  matters: readonly unknown[];
  freshness: Freshness;
  loading: boolean;
  refreshError: string | null;
}): CaseloadView {
  if (p.matters.length > 0) return 'list';
  if (p.freshness.kind === 'live') return 'empty';
  if (p.loading) return 'resolving';
  if (p.refreshError !== null) return 'unavailable';
  return 'resolving';
}

/**
 * Never read: `hydrate()` (cache, then network). Read but not live:
 * `refresh()`, which no-ops while one is in flight and never empties a list.
 */
export function ensureLive(): void {
  const p = usePractice.getState();
  if (p.freshness.kind === 'unknown') void p.hydrate();
  else if (p.freshness.kind !== 'live') void p.refresh();
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MATTER'S STATE, READ IN ONE PLACE.
 *
 * `status` is `notNull` in the schema and sent on every row, but a matter
 * rehydrated from a cache written by an older build carries none. Absent is
 * ACTIVE — the conservative reading, because the alternative is a matter
 * silently vanishing from an advocate's morning after an app update.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function matterStatus(matter: Matter): MatterStatus {
  return matter.status ?? 'active';
}

/**
 * IS THIS MATTER PART OF THE WORKING CALENDAR?
 *
 * D-2's user job, in its own words: *"This matter is disposed and I do not want
 * it on my list every morning."* Disposal and archiving are the two ways an
 * advocate says a matter is finished with, and both take it off the surfaces
 * that answer "what is coming" — Today, the cause list, the briefing sweep and
 * the Matters list's own dated sections.
 *
 * WHAT IT DOES NOT TOUCH, deliberately:
 *
 *   · The matter itself, its timeline, its saved authorities and its shares.
 *     Archiving is not deletion and nothing on this path may read as it.
 *   · CITATOR ALERTS. An authority saved inside an archived matter can still be
 *     set aside, and the advocate who filed on it still needs to know. Alerts
 *     are a different subsystem (`state/alerts.ts`) reading a different set of
 *     rows, and this predicate is deliberately not applied to them — NEW3 R16
 *     records `CITATOR_ALERT_REGRESSION = NO` and it stays no.
 */
export function isInCaseload(matter: Matter): boolean {
  return matterStatus(matter) === 'active';
}

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
    // A disposed or archived matter is not what is coming. See `isInCaseload`.
    if (!isInCaseload(matter)) continue;
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
    /*
      AND ESPECIALLY HERE. "The recorded date has passed — record the next one"
      is a prompt to act, and a disposed matter's last hearing date has passed
      by definition. Without this, disposing a matter would MOVE it from the
      listed section into a nagging one rather than off the list.
    */
    if (!isInCaseload(matter)) continue;
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
