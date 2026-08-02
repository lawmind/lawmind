import type {
  Alert,
  AlertSettings,
  ApiResponse,
  Briefing,
  CourtLookupResult,
  DocumentType,
  DraftDocument,
  Matter,
  MatterEvent,
  SearchRequest,
  SearchResponse,
  Session,
  User,
} from './contract';

/**
 * The mock server. RCC never waits on LCC.
 *
 * Every fixture below is INVENTED DATA IN A DEVELOPMENT FILE and is labelled as
 * such on screen — `MOCK` in the neutral citation, a fake CNR. It exists so a
 * shell can be laid out against realistic shapes, not so anyone can mistake it
 * for a judgment. No real citation appears here: a plausible-looking fake
 * citation sitting in a repo is exactly the artefact this product exists to
 * prevent, and the first person to copy one out of a screenshot would be
 * copying a hallucination we typed ourselves.
 *
 * Latency is deliberate. A mock that answers in 0ms hides every loading state,
 * and "never a bare spinner on search" is a rule you can only honour if the
 * skeleton actually gets a chance to render.
 */

const LATENCY_MS = 450;

const delay = <T>(data: T): Promise<ApiResponse<T>> =>
  new Promise((resolve) => setTimeout(() => resolve({ ok: true, data }), LATENCY_MS));

const MOCK_USER: User = {
  id: 'usr_mock',
  fullName: 'Mock Advocate',
  preferredLanguage: 'en',
  barEnrolmentNumber: null,
  enrolmentStatus: 'pending',
  termsAcceptedAt: null,
  termsVersion: null,
};

/**
 * Three fields on every row, always. The mixed list is deliberate: a verified
 * authority, an unverified one, and one that is BOTH verified AND set aside —
 * the case a single-enum model cannot express and the one most likely to be got
 * wrong downstream.
 *
 * What renders from these is derived at render time in S2. Nothing in S0 draws
 * a citation, and no badge is built for the verified row: verified is silent.
 */
const MOCK_RESULTS: SearchResponse['results'] = [
  {
    judgmentId: 'jdg_mock_1',
    caseTitle: 'Mock Petitioner v. Mock State',
    neutralCitation: 'MOCK 2026 EXAMPLE 1',
    reporterCitations: ['MOCK (2026) 1 EX 1'],
    court: 'Mock High Court',
    judgmentDate: '2026-02-11',
    holding: 'Placeholder holding. Fixture text, not law.',
    operativeParagraph: 'Placeholder operative paragraph. Fixture text, not law.',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'none',
  },
  {
    judgmentId: 'jdg_mock_2',
    caseTitle: 'Mock Applicant v. Mock Respondent',
    neutralCitation: 'MOCK 2026 EXAMPLE 2',
    reporterCitations: [],
    court: 'Mock District Court',
    judgmentDate: '2026-01-04',
    holding: 'Placeholder holding. Fixture text, not law.',
    operativeParagraph: 'Placeholder operative paragraph. Fixture text, not law.',
    verificationState: 'unverified',
    verifiedBySource: 'none',
    overruledStatus: 'none',
  },
  {
    judgmentId: 'jdg_mock_3',
    caseTitle: 'Mock Appellant v. Mock Union',
    neutralCitation: 'MOCK 2025 EXAMPLE 3',
    reporterCitations: ['MOCK (2025) 4 EX 88'],
    court: 'Mock High Court',
    judgmentDate: '2025-09-30',
    holding: 'Placeholder holding. Fixture text, not law.',
    operativeParagraph: 'Placeholder operative paragraph. Fixture text, not law.',
    // Verified AND set aside. Different questions, different sources.
    verificationState: 'verified',
    verifiedBySource: 'public_x2',
    overruledStatus: 'set_aside',
    overruledByJudgmentId: 'jdg_mock_4',
    overruledParas: [14, 15],
    overruledNote: 'Fixture. Set aside in a later mock appeal.',
  },
];

export const mockApi = {
  /* auth */
  requestOtp: (_phone: string) => delay({ sent: true }),
  verifyOtp: (_token: string): Promise<ApiResponse<Session>> =>
    delay({ accessToken: 'mock', refreshToken: 'mock', user: MOCK_USER }),
  me: (): Promise<ApiResponse<User>> => delay(MOCK_USER),
  acceptTerms: (version: string) =>
    delay({ termsAcceptedAt: new Date().toISOString(), termsVersion: version }),

  /* search */
  search: (_request: SearchRequest): Promise<ApiResponse<SearchResponse>> =>
    delay({
      results: MOCK_RESULTS,
      // Never empty by omission. This one is the point of the fixture.
      unverifiedReferences: [
        { citationClaimed: 'MOCK 2024 EXAMPLE 9', reason: 'No tier confirmed this reference.' },
      ],
      searchId: 'srch_mock',
    }),

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
      authorities: MOCK_RESULTS,
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
      citations: MOCK_RESULTS,
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
