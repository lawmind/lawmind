import type {
  ApiResponse,
  AuthoritiesResponse,
  CitationCheck,
  CitationCopy,
  CounterArgumentsResponse,
  JudgmentDetail,
  PrecedentGraph,
  SearchFilters,
  SearchResponse,
  Statute,
  StatuteSection,
  TreatmentResponse,
} from './contract';

/**
 * THE REAL API.
 *
 * `POST /search` runs against all 38,341 Supreme Court judgments (1950–2026),
 * fully embedded at 616,197 chunks, and `GET /statutes` / `/statutes/sections`
 * against BNS, BNSS and BSA complete.
 *
 * `GET /judgments/:id` NOW EXISTS and the detail screen is off fixtures.
 * Probed 6 August 2026: 200, with `paragraphs[]`, `numberedShare` and `asOf`.
 *
 * THREE THINGS ABOUT TODAY'S RESPONSES THAT ARE NOT BUGS AND MUST NOT BE
 * DESIGNED AROUND:
 *   · `holding` is `""` on every row — it needs a summarisation model that is
 *     not wired. The card already treats an absent summary as ordinary.
 *   · `operativeParagraph` is now non-empty on every search result, but it is
 *     ~2,600 characters of verbatim OCR carrying page furniture — running
 *     headers, marginal letters, hyphenated line breaks. It is source text, not
 *     a pull quote, and any surface that frames it as one is framing OCR
 *     wreckage as the court's own words.
 *   · `GET /judgments/:id` carries NO `operativeParagraph`, `holding`,
 *     `reliedOn`, `holdingParagraphNumber` or `operativeParagraphNumber`, all
 *     of which `docs/API_CONTRACTS.md` implies and the detail screen rendered
 *     from fixtures. Flagged for LCC. "Relied on" is served instead from
 *     `/judgments/:id/authorities`, which answers the same question and more.
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

  /**
   * How later courts treated this authority. Ranked list, the default view.
   *
   * `limit` is passed so `truncated` and `total` come back meaningful — asking
   * for everything and getting a silent subset is the failure this endpoint's
   * paging exists to prevent.
   */
  treatment: (judgmentId: string, limit = 50, cursor?: string) =>
    get<TreatmentResponse>(
      `/judgments/${encodeURIComponent(judgmentId)}/treatment?limit=${limit}` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
    ),

  /**
   * The citation network, on demand.
   *
   * Depth 1 and 40 nodes by default: the graph is the secondary view and a
   * phone renders it at 60fps or not at all. `truncated` comes back with it and
   * is always shown — see `PrecedentGraph` in the contract for why that is a
   * correctness field rather than a performance one.
   */
  precedentGraph: (judgmentId: string, depth: 1 | 2 = 1, limit = 40) =>
    get<PrecedentGraph>(
      `/judgments/${encodeURIComponent(judgmentId)}/graph?depth=${depth}&limit=${limit}`
    ),

  judgment: (judgmentId: string) =>
    get<JudgmentDetail>(`/judgments/${encodeURIComponent(judgmentId)}`),

  /**
   * WHAT THIS JUDGMENT RELIED ON, AND WHETHER THAT LAW WAS STANDING AT THE TIME.
   *
   * Not in `docs/API_CONTRACTS.md` — live, 200, transcribed from the response
   * and flagged. This is the only source for "Relied on": the detail payload
   * carries no `reliedOn`, and this answers the same question with two dates
   * behind each row.
   *
   * The response's own `counts` and `standingWhenRelied` are deliberately NOT
   * used — see the measurement at the top of `citation/standing.ts`.
   */
  authorities: (judgmentId: string) =>
    get<AuthoritiesResponse>(`/judgments/${encodeURIComponent(judgmentId)}/authorities`),

  /**
   * S1 RETURNS AUTHORITIES ONLY. `arguments` is absent from the response, not
   * empty — generation waits for S2. `excluded` and `unverifiedReferences` are
   * present and are rendered, because a reference removed without a visible
   * state is a silent drop and that is measured at a zero threshold.
   */
  counterArguments: (position: string, language: 'en' | 'hi' = 'en', matterId?: string) =>
    request<CounterArgumentsResponse>('/arguments/counter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position, language, ...(matterId ? { matterId } : {}) }),
    }),

  /**
   * WHERE WE LOOKED — one row per tier, each with a result and a timestamp.
   *
   * The handle comes off the search result or the counter-argument authority.
   * It is never constructed here: a guessed id points the advocate at another
   * judgment's verification record, which is worse than having none.
   */
  citationCheck: (citationCheckId: string) =>
    get<CitationCheck>(`/citations/${encodeURIComponent(citationCheckId)}`),

  /**
   * EVERY "COPY CITATION" TAP.
   *
   * An advocate who copies a citation into their own document is otherwise
   * invisible to the fan-out — they saw a verified result, they may file it, and
   * no alert could reach them when that authority moves.
   *
   * FIRED WITHOUT BLOCKING THE COPY. The clipboard write happens regardless of
   * whether this request lands; a failed analytics write must never cost the
   * advocate the thing they asked for. `clientKey` makes the retry idempotent.
   */
  recordCitationCopy: (copy: CitationCopy) =>
    request<{ ok: true }>('/citations/copies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(copy),
    }),

  /**
   * NEVER BYPASS THE CAPTCHA. This returns the eCourts URL with the search
   * pre-filled; the advocate solves the captcha themselves. Their confirmation
   * is Tier 3 and caches permanently, so nobody in their chamber does it twice.
   */
  verifyEcourts: (citationText: string) =>
    request<{ ecourtsUrl: string; prefilledQuery: string }>('/verify/ecourts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText }),
    }),

  verifyConfirm: (citationText: string, judgmentId: string) =>
    request<{ cached: true }>('/verify/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText, judgmentId }),
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
