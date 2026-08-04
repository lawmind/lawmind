import type {
  Alert,
  AlertSettings,
  ApiResponse,
  Briefing,
  CitationCheckDetail,
  CourtLookupResult,
  DocumentType,
  DraftDocument,
  HiddenResult,
  JudgmentDetail,
  Matter,
  MatterEvent,
  SearchFilters,
  SearchRequest,
  SearchResponse,
  SearchResult,
  Session,
  User,
} from './contract';
import { MOCK_FACETS, MOCK_JUDGMENTS, MOCK_RESULTS } from './fixtures';

/**
 * The mock server. RCC never waits on LCC.
 *
 * Fixtures live in `fixtures.ts` and are labelled there. No real citation
 * appears in either file.
 *
 * Latency is deliberate. A mock that answers in 0ms hides every loading state,
 * and "never a bare spinner on search" is a rule you can only honour if the
 * skeleton actually gets a chance to render.
 */

const LATENCY_MS = 450;

const delay = <T>(data: T, ms: number = LATENCY_MS): Promise<ApiResponse<T>> =>
  new Promise((resolve) => setTimeout(() => resolve({ ok: true, data }), ms));

const MOCK_USER: User = {
  id: 'usr_mock',
  fullName: 'Mock Advocate',
  preferredLanguage: 'en',
  barEnrolmentNumber: null,
  enrolmentStatus: 'pending',
  termsAcceptedAt: null,
  termsVersion: null,
};

export const DEFAULT_FILTERS: SearchFilters = {
  courts: [],
  bench: [],
  date: 'any',
  subjects: [],
  onlyVerified: false,
  excludeSetAsideOrDoubted: false,
};

/**
 * Filtering, mocked exactly as the server would do it — INCLUDING what it
 * removed and why.
 *
 * A filter never hides something silently. The excluded rows come back named,
 * so the results screen can offer the one-tap escape rather than quietly
 * showing a shorter list.
 */
function applyFilters(
  results: SearchResult[],
  filters: SearchFilters
): { kept: SearchResult[]; hidden: HiddenResult[] } {
  const kept: SearchResult[] = [];
  const hidden: HiddenResult[] = [];

  for (const r of results) {
    const facet = MOCK_FACETS[r.judgmentId];
    let hiddenBy: string | null = null;

    if (filters.courts.length && facet && !filters.courts.includes(facet.court)) {
      hiddenBy = 'court';
    } else if (filters.subjects.length && facet && !filters.subjects.includes(facet.subject)) {
      hiddenBy = 'subject';
    } else if (filters.date === 'last_10' && facet && facet.year < 2016) {
      hiddenBy = 'last 10 years';
    } else if (filters.date === 'since_2020' && facet && facet.year < 2020) {
      hiddenBy = 'since 2020';
    } else if (filters.onlyVerified && r.verificationState !== 'verified') {
      hiddenBy = '"only verified authorities"';
    } else if (
      filters.excludeSetAsideOrDoubted &&
      (r.overruledStatus === 'set_aside' ||
        r.overruledStatus === 'partly_set_aside' ||
        r.overruledStatus === 'doubted')
    ) {
      hiddenBy = '"good law only"';
    }

    if (hiddenBy) hidden.push({ result: r, hiddenBy });
    else kept.push(r);
  }

  return { kept, hidden };
}

/** Naive fixture match. Real ranking is hybrid sparse + dense retrieval, LCC's lane. */
function matches(r: SearchResult, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    r.caseTitle.toLowerCase().includes(q) ||
    r.holding.toLowerCase().includes(q) ||
    r.neutralCitation.toLowerCase().includes(q)
  );
}

export const mockApi = {
  /* auth */
  requestOtp: (_phone: string) => delay({ sent: true }),
  verifyOtp: (_token: string): Promise<ApiResponse<Session>> =>
    delay({ accessToken: 'mock', refreshToken: 'mock', user: MOCK_USER }),
  me: (): Promise<ApiResponse<User>> => delay(MOCK_USER),
  acceptTerms: (version: string) =>
    delay({ termsAcceptedAt: new Date().toISOString(), termsVersion: version }),

  /* search */
  search: (
    request: SearchRequest & { filters?: SearchFilters }
  ): Promise<ApiResponse<SearchResponse>> => {
    const filters = (request.filters as SearchFilters | undefined) ?? DEFAULT_FILTERS;
    const found = MOCK_RESULTS.filter((r) => matches(r, request.query));
    const { kept, hidden } = applyFilters(found, filters);
    return delay({
      results: kept,
      /**
       * NEVER EMPTY BY OMISSION. Anything the model referenced that no tier
       * confirmed appears here and is shown. Silent-drop rate is tracked with a
       * zero threshold — a citation the advocate never sees is worse than one
       * marked unconfirmed, because they cannot correct what they were not
       * shown.
       */
      unverifiedReferences: request.query.trim()
        ? [
            {
              citationClaimed: 'MOCK 2024 EXAMPLE 9',
              reason: 'No tier confirmed this reference.',
            },
          ]
        : [],
      searchId: 'srch_mock',
      hidden,
    });
  },

  judgment: (id: string): Promise<ApiResponse<JudgmentDetail>> => {
    const judgment = MOCK_JUDGMENTS[id];
    if (!judgment)
      return Promise.resolve({
        ok: false,
        error: { code: 'not_found', message: `No judgment ${id} in the fixture corpus.` },
      });
    return delay(judgment, 260);
  },

  /**
   * NEVER BYPASS THE eCOURTS CAPTCHA. The server pre-fills the search; the
   * advocate solves the CAPTCHA; the confirmed result caches permanently.
   */
  ecourtsRoute: (citationText: string) =>
    delay({
      ecourtsUrl: 'https://services.ecourts.gov.in/',
      prefilledQuery: citationText,
    }),

  /** Tier 3 — the advocate confirmed it themselves. Cached permanently. */
  confirmVerified: (judgmentId: string) => delay({ judgmentId, cached: true }),

  /**
   * What each tier found. Shape flagged for LCC in `contract.ts`.
   *
   * The outcomes are deliberately mixed: one source that found a REFERENCE but
   * not the judgment, two that found nothing, and eCourts needing the advocate.
   * That combination is what the detail screen exists to explain — "two
   * secondary sources describe it, nobody can open it" is a different situation
   * from "nobody has heard of it", and only one of them is worth an advocate's
   * minute.
   */
  citationCheck: (judgmentId: string): Promise<ApiResponse<CitationCheckDetail>> =>
    delay(
      {
        judgmentId,
        whatWeFound:
          'A reference to this judgment appears in two secondary sources, both describing a quashing where the complaint named eleven relatives without particulars. We could not open the judgment itself.',
        sources: [
          {
            source: 'Our reported corpus',
            outcome: 'found',
            detail: 'Found as a citation inside two other judgments. Not present as a judgment.',
            checkedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
          },
          {
            source: 'Mock High Court judgment portal',
            outcome: 'not_found',
            detail: 'No result for this case number.',
            checkedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
          },
          {
            source: 'Reporter index',
            outcome: 'not_found',
            detail: 'Citation number does not resolve. May be a reporting error in the source.',
            checkedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
          },
          {
            source: 'eCourts services',
            outcome: 'needs_you',
            detail: 'Requires a captcha we cannot complete for you.',
            checkedAt: new Date().toISOString(),
          },
        ],
        ecourtsUrl: 'https://services.ecourts.gov.in/',
        prefilledQuery: 'MOCK 2024 EXAMPLE 9424',
      },
      260
    ),

  /* matters */
  matters: (): Promise<ApiResponse<Matter[]>> => delay([]),
  matterEvents: (_matterId: string): Promise<ApiResponse<MatterEvent[]>> => delay([]),

  /* briefings */
  briefing: (id: string): Promise<ApiResponse<Briefing>> =>
    delay({
      id,
      matterId: 'mtr_mock',
      hearingDate: '2026-08-02',
      subject: 'Fixture briefing',
      whereItStands: 'Fixture text.',
      pendingBeforeCourt: 'Fixture text.',
      authorities: MOCK_RESULTS.slice(0, 3),
      checklist: [{ id: 'chk_1', label: 'Fixture checklist item', done: false }],
      datesNotConfirmed: false,
      generatedAt: new Date().toISOString(),
    }),

  /* drafting */
  documentTypes: (): Promise<ApiResponse<DocumentType[]>> => delay([]),
  document: (documentId: string): Promise<ApiResponse<DraftDocument>> =>
    delay({
      documentId,
      documentType: 'mock',
      language: 'en',
      paragraphs: [{ index: 0, text: 'Fixture paragraph.' }],
      citations: MOCK_RESULTS.slice(0, 3),
      unverifiedReferences: [],
    }),

  /* court adapter — OD-1 is open, so the manual path is the only path */
  courtLookup: (_cnr: string): Promise<ApiResponse<CourtLookupResult>> =>
    delay({ available: false }),

  /* alerts */
  alerts: (): Promise<ApiResponse<{ alerts: Alert[]; unreadCount: number }>> =>
    delay({ alerts: [], unreadCount: 0 }),
  alertSettings: (): Promise<ApiResponse<AlertSettings>> =>
    delay({ savedAuthorityMoved: true, ownMatterJudgment: true, unknownListing: true }),
};
