import type { ApiResponse, Statute, StatuteSection } from './contract';

/**
 * THE REAL API. Statutes only, for now.
 *
 * `GET /statutes` and `GET /statutes/sections` are live with all three criminal
 * codes complete — BNS 358 sections, BNSS 531, BSA 170, in force 2024-07-01,
 * real statutory text from indiacode.
 *
 * JUDGMENT SEARCH STAYS ON MOCKS. `POST /search` is live too, but the judgment
 * corpus is still loading, so it returns thin results and some queries return
 * nothing. That is the corpus filling, not a bug — and not something to design
 * around. Building a UI against a half-loaded corpus teaches the wrong lessons
 * about empty states.
 */

const BASE_URL = 'https://api-production-1c0b4.up.railway.app';

/** Court corridors have terrible connectivity; a request that never returns is worse than one that fails. */
const TIMEOUT_MS = 15_000;

async function get<T>(path: string): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    /**
     * The envelope is the same on success and failure — `{ ok, data }` or
     * `{ ok, error }` — so it is parsed rather than inferred from the status
     * code. A 400 carrying a real error code is more useful to the caller than
     * "request failed".
     */
    const body = (await response.json()) as ApiResponse<T>;
    return body;
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    return {
      ok: false,
      error: {
        code: aborted ? 'timeout' : 'network',
        message: aborted
          ? 'The request took too long. You may be offline.'
          : 'We could not reach Lawmind. You may be offline.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  statutes: () => get<{ statutes: Statute[] }>('/statutes'),

  /**
   * `limit` caps at 600 — enough for BNSS at 531, so a whole Act arrives in one
   * call and the reader never paginates mid-code.
   *
   * `actId` is a UUID on the live API. It is never constructed client-side:
   * the index hands it to the reader, so there is no place a wrong id can be
   * invented.
   */
  statuteSections: (actId: string, limit = 600) =>
    get<{ sections: StatuteSection[]; total: number }>(
      `/statutes/sections?actId=${encodeURIComponent(actId)}&limit=${Math.min(limit, 600)}`
    ),
};
