import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OFFLINE CACHE — and the reason it stamps every entry with a time.
 *
 * Court buildings have terrible connectivity; that is a stated hard constraint,
 * not an edge case. Matters, briefings and today's listings have to open with
 * the radio off.
 *
 * BUT AN OFFLINE READ IS NOT A LIVE READ, AND THE PRODUCT MAY NEVER PRETEND IT
 * IS. `docs/CITATION_HARNESS.md`: "`overruled_status` is read live at render, on
 * every surface. Offline surfaces render the status they last read WITH ITS
 * AS-OF DATE SHOWN; they never present a stale status as current." A briefing
 * served from this cache therefore carries `cachedAt`, and every surface that
 * renders one is obliged to say so.
 *
 * That is why this is a cache with a timestamp rather than a react-query
 * persister: the timestamp is not a housekeeping detail here, it is a thing the
 * advocate has to be shown. A cache that hides its own age would let an
 * overruled authority render without the LAW MOVED mark, which the harness
 * grades as severely as a hallucination.
 *
 * WHAT IS NOT CACHED HERE: nothing derived from a model, and no search answer.
 * When the AI is unavailable the app says so plainly — that is a screen, not a
 * cache policy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** 30 days — `SPRINT_3.md` LCC task 5, "cache 30 days; a briefing must open with the network off". */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Cached<T> = {
  value: T;
  /** ISO instant this was last read FROM THE SERVER. Never the time it was read from disk. */
  cachedAt: string;
};

const prefix = (key: string) => `lawmind.cache.${key}.v1`;

export async function writeCache<T>(key: string, value: T): Promise<Cached<T>> {
  const entry: Cached<T> = { value, cachedAt: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(prefix(key), JSON.stringify(entry));
  } catch {
    // A failed write costs one offline open. Taking the app down costs a hearing.
  }
  return entry;
}

export async function readCache<T>(key: string, now = Date.now()): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(prefix(key));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Cached<T>;
    const age = now - new Date(entry.cachedAt).getTime();

    /**
     * AN EXPIRED ENTRY IS DROPPED, NOT SHOWN WITH A LOUDER WARNING.
     *
     * Thirty days is already generous for a hearing briefing; beyond it the
     * court record has almost certainly moved, and an as-of line does not make
     * a two-month-old listing safe to plan a morning around.
     */
    if (!Number.isFinite(age) || age > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(prefix(key));
  } catch {
    // Nothing to do; the entry expires on its own.
  }
}

/**
 * How old a cached read is, said the way an advocate would say it.
 *
 * DELIBERATELY NOT A TIME OF DAY. "Read at 21:14" invites the reader to work out
 * whether that was tonight or last Tuesday. "Read 3 days ago" answers the
 * question they actually have, which is *should I trust this*.
 */
export function describeCacheAge(cachedAt: string, now = Date.now()): string {
  const then = new Date(cachedAt).getTime();
  if (!Number.isFinite(then)) return 'read earlier';

  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return 'read just now';
  if (minutes < 60) return `read ${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `read ${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `read ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The cache key for a judgment's full text.
 *
 * A judgment is cached so it can be REREAD offline — the reading position is
 * worthless without the document it points into. What is cached is the text,
 * the paragraphs and the case metadata, none of which change. The one field
 * that does change is `overruled_status`, and the surface serving a cached copy
 * is obliged to render it with its as-of date rather than as current.
 */
export const judgmentCacheKey = (judgmentId: string) => `judgment.${judgmentId}`;
