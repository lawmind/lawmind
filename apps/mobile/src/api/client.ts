import type {
  ApiResponse,
  SearchFilters,
  SearchResponse,
  Statute,
  StatuteSection,
} from './contract';

/**
 * THE REAL API.
 *
 * `POST /search` runs against all 38,341 Supreme Court judgments (1950–2026),
 * and `GET /statutes` / `/statutes/sections` against BNS, BNSS and BSA complete.
 *
 * WHAT IS NOT HERE, AND WHY THE JUDGMENT DETAIL SCREEN IS STILL MOCKED:
 * `GET /judgments/:id` does not exist on production — it answers
 * `{"ok":false,"error":{"code":"NOT_FOUND","message":"no route for GET
 * /judgments/…"}}`. Search returns real judgment ids that nothing can yet open,
 * so the detail screen and the reading view stay on fixtures until that route
 * lands. Flagged for LCC rather than worked around.
 *
 * TWO THINGS ABOUT TODAY'S RESULTS THAT ARE NOT BUGS AND MUST NOT BE DESIGNED
 * AROUND:
 *   · `holding` is `""` on every row — it needs a summarisation model that is
 *     not wired. The card already treats an absent summary as ordinary.
 *   · retrieval is LEXICAL ONLY until embeddings land, so a paraphrased query
 *     underperforms exact legal terms. No ranking affordance is built against
 *     that behaviour, because the behaviour is about to change.
 */

const BASE_URL = 'https://api-production-1c0b4.up.railway.app';

/** Court corridors have terrible connectivity; a request that never returns is worse than one that fails. */
const TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
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

const get = <T>(path: string) => request<T>(path);

/**
 * SERVER FILTERS GO TO THE SERVER; RELIABILITY FILTERS STAY HERE.
 *
 * The contract accepts `court`, `dateFrom`, `dateTo` and `caseType` — facts
 * about the judgment, which the corpus can filter on. "Only verified
 * authorities" and "good law only" are questions about the three citation
 * fields, which come back on every row, so the client can apply them without a
 * round trip AND — this is the part that matters — can still name every row it
 * removed. A server-side reliability filter would return a shorter list with
 * nothing to name.
 */
function serverFilters(filters?: SearchFilters) {
  if (!filters) return undefined;
  const out: Record<string, string> = {};
  if (filters.caseType) out.caseType = filters.caseType;
  if (filters.date === 'last_10') out.dateFrom = `${new Date().getFullYear() - 10}-01-01`;
  if (filters.date === 'since_2020') out.dateFrom = '2020-01-01';
  return Object.keys(out).length ? out : undefined;
}

export const api = {
  /**
   * p95 is 453 ms server-side. The skeleton still renders, because a search
   * that lands in half a second still lands after the screen has been drawn —
   * and on a court-corridor connection it is a great deal longer than that.
   */
  search: (query: string, language: 'en' | 'hi', filters?: SearchFilters) =>
    request<SearchResponse>('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, language, filters: serverFilters(filters) }),
    }),

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
