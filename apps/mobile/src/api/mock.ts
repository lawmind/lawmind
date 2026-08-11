import type {
  Alert,
  AlertSettings,
  ApiResponse,
  Briefing,
  CourtLookupResult,
  DocumentType,
  DraftDocument,
  HiddenResult,
  JudgmentDetail,
  Matter,
  MatterEvent,
  Profile,
  SearchFilters,
  SearchRequest,
  SearchResponse,
  SearchResult,
  Session,
  Statute,
  StatuteSection,
  User,
} from './contract';
import {
  MOCK_FACETS,
  MOCK_JUDGMENTS,
  MOCK_RESULTS,
  MOCK_SECTIONS,
  MOCK_STATUTES,
} from './fixtures';

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
  userId: 'usr_mock',
  fullName: 'Mock Advocate',
  preferredLanguage: 'en',
  barEnrolmentNumber: null,
  enrolmentStatus: 'unverified',
  subscriptionTier: 'none',
  termsAcceptedAt: null,
  termsVersion: null,
};

const MOCK_PROFILE: Profile = {
  ...MOCK_USER,
  email: 'mock@lawmind.test',
  phone: '9800000000',
  pushRegistered: false,
};

export const DEFAULT_FILTERS: SearchFilters = {
  courts: [],
  bench: [],
  date: 'any',
  subjects: [],
  caseType: undefined,
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
    } else if (filters.caseType && facet?.caseType !== filters.caseType) {
      /**
       * A judgment whose case number states no side is EXCLUDED, never guessed
       * into one. `facet.caseType` is `null` for those — 139 of 6,309 on the
       * real corpus — and `null !== 'criminal'`, so they fall out here and are
       * named back to the advocate in `hidden` like any other exclusion.
       */
      hiddenBy = facet?.caseType ? `case type "${filters.caseType}"` : 'no side stated in the case number';
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
    // A citationless judgment is still searchable by everything else it has.
    (r.neutralCitation?.toLowerCase().includes(q) ?? false)
  );
}

export const mockApi = {
  /* auth */
  requestOtp: (_phone: string) => delay({ sent: true }),
  verifyOtp: (_token: string): Promise<ApiResponse<Session>> =>
    delay({
      accessToken: 'mock',
      refreshToken: 'mock',
      user: { authId: 'auth_mock', email: 'mock@lawmind.test', profileComplete: true, profile: MOCK_PROFILE },
    }),
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
      /**
       * NULL UNTIL AUTH LANDS IN S5. The key is always present; the value is
       * not yet recordable against a user. The client must not read this as a
       * failure — mocking it as null now is what makes that true before the
       * real API can prove it.
       */
      searchId: null,
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

  /* statutes — additions, nothing existing moved */

  statutes: (): Promise<ApiResponse<{ statutes: Statute[] }>> =>
    delay({ statutes: MOCK_STATUTES }),

  /**
   * `?actId=` reads an act in order, `?sectionNumber=` jumps to one,
   * `?q=` searches across the codes. `limit` caps at 600 — enough for BNSS at
   * 531 sections, so a whole act comes back in one call and the reader never
   * paginates mid-Act.
   *
   * ORDERED BY `orderIndex`, NEVER BY `sectionNumber`. Section numbers are text
   * and carry letters, so lexical sorting puts s.10 before s.2 — and an
   * advocate scrolling a code in the wrong order will not assume the app is
   * wrong, they will assume they misread the section.
   */
  statuteSections: (params: {
    actId?: string;
    sectionNumber?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ sections: StatuteSection[]; total: number }>> => {
    const limit = Math.min(params.limit ?? 600, 600);
    let sections = MOCK_SECTIONS.filter((s) => !params.actId || s.statuteId === params.actId);
    if (params.sectionNumber) {
      sections = sections.filter((s) => s.sectionNumber === params.sectionNumber);
    }
    if (params.q) {
      const q = params.q.toLowerCase();
      // `heading` is nullable on the wire — a section with no marginal heading
      // is ordinary in an older Act, and searching one must not throw.
      sections = sections.filter(
        (s) => (s.heading ?? '').toLowerCase().includes(q) || s.sectionText.toLowerCase().includes(q)
      );
    }
    const ordered = [...sections].sort((a, b) => a.orderIndex - b.orderIndex);
    return delay(
      { sections: ordered.slice(params.offset ?? 0, (params.offset ?? 0) + limit), total: ordered.length },
      260
    );
  },

  /* matters */
  matters: (): Promise<ApiResponse<Matter[]>> => delay([]),
  matterEvents: (_matterId: string): Promise<ApiResponse<MatterEvent[]>> => delay([]),

  /* briefings */
  /**
   * REBUILT 11 AUG 2026 TO MATCH `GET /briefings/:id`.
   *
   * The fixture that stood here is the reason the invented `Briefing` type
   * survived: it supplied `subject`, `whereItStands`, `pendingBeforeCourt`,
   * `checklist[].label` and `datesNotConfirmed` — six fields no route sends —
   * so every screen reading them looked correct in development and rendered
   * blank against production. A fixture that is easier than the wire is not a
   * fixture, it is a second implementation of the server that always agrees
   * with the client.
   *
   * `never_checked` is the deliberate default: it is the ordinary state for a
   * date the advocate typed, and it is the one that must NOT draw a caution.
   */
  briefing: (id: string): Promise<ApiResponse<Briefing>> =>
    delay({
      briefingId: id,
      matterId: 'mtr_mock',
      caseTitle: 'Mock Appellant v. Mock State',
      court: 'Mock High Court',
      hearingDate: '2026-08-02',
      generatedAt: new Date().toISOString(),
      deliveredAt: null,
      openedAt: null,
      dateConfidence: {
        source: null,
        confirmedAt: null,
        notConfirmedAt: null,
        notConfirmedReason: null,
        state: 'never_checked',
      },
      blocks: {
        lastOrder: {
          present: true,
          eventId: 'evt_mock_1',
          eventDate: '2026-07-19',
          orderText: 'Fixture order text, as the court recorded it.',
        },
        pendingApplications: {
          count: 1,
          items: [
            {
              eventId: 'evt_mock_2',
              eventDate: '2026-07-02',
              description: 'Fixture interim application',
            },
          ],
        },
        authorities: MOCK_RESULTS.slice(0, 3).map((r) => ({
          judgmentId: r.judgmentId,
          addedAt: '2026-07-20T00:00:00.000Z',
          paragraphNumber: null,
        })),
        checklist: [
          { id: 'chk_1', text: 'Fixture checklist item', basis: 'Fixture basis for the item' },
        ],
      },
      /**
       * `verified` / `corpus` BY CONSTRUCTION — a briefing authority is a
       * corpus row, so it resolves to itself. The fixture carried neither
       * until LCC shipped the fields on 11 Aug 2026 (bus 0038), which is
       * exactly what made the unconfirmed mark visible in development.
       */
      authorities: MOCK_RESULTS.slice(0, 3).map((r) => ({
        judgmentId: r.judgmentId,
        available: true as const,
        caseTitle: r.caseTitle,
        neutralCitation: r.neutralCitation,
        verificationState: 'verified' as const,
        verifiedBySource: 'corpus' as const,
        overruledStatus: r.overruledStatus,
        overruledByJudgmentId: r.overruledByJudgmentId ?? null,
        overruledByTitle: null,
        overruledParas: r.overruledParas ?? null,
        overruledNote: r.overruledNote ?? null,
        addToMatterAllowed: r.overruledStatus !== 'set_aside',
      })),
    }),

  /* drafting */
  documentTypes: (): Promise<ApiResponse<DocumentType[]>> => delay([]),
  document: (documentId: string): Promise<ApiResponse<DraftDocument>> =>
    delay({
      documentId,
      documentType: 'mock',
      matterId: null,
      content: 'Fixture paragraph one.\n\nFixture paragraph two.',
      language: 'en',
      createdAt: '2026-08-06T00:00:00.000Z',
      citations: MOCK_RESULTS.slice(0, 3).map((r) => ({
        citationCheckId: r.judgmentId,
        /**
         * The server never sends a null `citation_claimed` — it coalesces
         * (`judgments/route.ts`: `neutral_citation ?? reporter_citations[0] ??
         * case_title`) because the audit record must identify the row somehow.
         * The mock coalesces identically, so a citationless fixture exercises
         * the same shape the live API produces rather than an easier one.
         */
        citationClaimed: r.neutralCitation ?? r.reporterCitations[0] ?? r.caseTitle,
        judgmentId: r.judgmentId,
        caseTitle: r.caseTitle,
        verificationState: r.verificationState,
        verifiedBySource: r.verifiedBySource,
        overruledStatus: r.overruledStatus,
      })),
      citationSummary: { total: 3, verified: 3 },
    }),

  /*
    Court adapter — OD-1 is open, so the manual path is the only path.

    THE TWO EXTRA FIELDS ARE MOCKED because the real endpoint always sends them
    and a mock that does not is how a screen gets built against a payload that
    does not exist. That is the fixture drift this sweep keeps finding: the
    briefing, the search facets, the court-and-year string, all of them looked
    right in development and misbehaved on the wire.
  */
  courtLookup: (_cnr: string): Promise<ApiResponse<CourtLookupResult>> =>
    delay({
      available: false,
      reason: 'no_adapter_implemented',
      manualEntry: {
        expected: true,
        message:
          'Enter the next date from your file. Dates given in open court are the ' +
          'normal source and are treated exactly the same as one we looked up.',
      },
    }),

  /* alerts */
  alerts: (): Promise<ApiResponse<{ alerts: Alert[]; unreadCount: number }>> =>
    delay({ alerts: [], unreadCount: 0 }),
  alertSettings: (): Promise<ApiResponse<AlertSettings>> =>
    delay({ savedAuthorityMoved: true, ownMatterJudgment: true, unknownListing: true, unavailable: [] }),
};
