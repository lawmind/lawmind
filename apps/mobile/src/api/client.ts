import type {
  Alert,
  AlertSettings,
  Annotation,
  AnnotationDraft,
  ApiResponse,
  AuthoritiesResponse,
  Briefing,
  BriefingListItem,
  MatterBundleBriefing,
  CitationCheck,
  CitationCopy,
  CorpusCoverage,
  CounterArgumentsResponse,
  CourtLookupResult,
  CurrentTerms,
  DraftDocument,
  DraftListItem,
  EcourtsPath,
  JudgmentDetail,
  Matter,
  OverruledStatus,
  MatterAccess,
  MatterAuthority,
  MatterEvent,
  MeResponse,
  PrecedentGraph,
  Profile,
  ProfilePatch,
  SearchFilters,
  SearchResponse,
  Session,
  Statute,
  StatuteCoverage,
  StatuteSection,
  TrainingConsent,
  TreatmentResponse,
  VerificationState,
  VerifiedBySource,
} from './contract';

/**
 * THE REAL API.
 *
 * `POST /search` runs against all 38,341 Supreme Court judgments (1950–2026),
 * fully embedded at 616,197 chunks, and `GET /statutes` / `/statutes/sections`
 * against BNS, BNSS and BSA complete.
 *
 * STALE SINCE 11 AUG 2026 — left rather than silently corrected, same reason
 * `DraftDetailScreen.tsx` quotes its own wrong note. 40,980 High Court
 * documents landed and ARE reached by the lexical arm of `/search` (bus
 * 0061/0062: sparse reaches 79,322, dense reaches only the embedded 38,341).
 * None are embedded and LCC has since stopped short of embedding them —
 * duplicates undetected by retrieval, 0 citations extracted, judgment-vs-order
 * unrecorded (bus 0064) — so the corpus classification/dedup work happens
 * first. Do not assume `/search` is Supreme-Court-only, and do not assume the
 * 40,980 are "judgments": the measured judgment share of that portion is
 * 0.75%–18.64%, per `CoverageScreen.tsx`.
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

/**
 * `EXPO_PUBLIC_API_URL` is inlined at build time by Metro (the `EXPO_PUBLIC_`
 * prefix is what makes an env var reach client code at all — see
 * https://docs.expo.dev/guides/environment-variables/). Set it per channel in
 * `eas.json` build profiles, or in a local `.env` for `expo start`. The
 * fallback below is today's only known deployment and stays wrong until
 * FQ-HOSTING (docs/FOUNDER_QUEUE.md) lands a real one — it is a fallback, not
 * an endorsement.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api-production-1c0b4.up.railway.app';

/** Court corridors have terrible connectivity; a request that never returns is worse than one that fails. */
const TIMEOUT_MS = 15_000;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AUTH BRIDGE — a hole in this module that `state/session.ts` fills.
 *
 * The session store needs `api` to sign in and to refresh; every authenticated
 * call needs the session store's access token. Importing each from the other is
 * a cycle, and Metro resolves a cycle by handing one side `undefined` at module
 * init — which fails as a crash on the first call rather than at build time.
 *
 * So the direction of the import is one way (session → client) and the token
 * arrives through a registration instead. The client knows nothing about how
 * tokens are stored, and the store knows nothing about fetch.
 * ─────────────────────────────────────────────────────────────────────────────
 */
type AuthBridge = {
  accessToken: () => string | null;
  /** Rotates the refresh token. Resolves true when a new access token is in hand. */
  refresh: () => Promise<boolean>;
  /** The refresh itself was rejected: every session is now revoked server-side. */
  onSessionLost: () => void;
};

let bridge: AuthBridge | null = null;

export function registerAuthBridge(next: AuthBridge | null): void {
  bridge = next;
}

type RequestOptions = RequestInit & {
  /** Attach the access token, and refresh once on a 401. Default false. */
  auth?: boolean;
  /** Internal: this call IS the refresh, so it must never trigger another. */
  isRefresh?: boolean;
};

async function once<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const token = options?.auth ? bridge?.accessToken() : null;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
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

/** The server's own code for "this access token is spent". */
const AUTH_REQUIRED = 'AUTH_REQUIRED';
/**
 * The refresh token was already rotated. `SPRINT_5.md` and `SCHEMA_TRUTH.md#refresh_tokens`:
 * presenting a spent refresh token means it was replayed or the client is buggy,
 * and both are answered by revoking EVERY live token for that advocate.
 * **So this is never retried.** Retrying a rejected refresh is how a client turns
 * one revocation into a loop that burns the advocate's whole session on launch.
 */
const REFRESH_INVALID = 'REFRESH_INVALID';

async function request<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  const first = await once<T>(path, options);

  const retryable =
    options?.auth === true &&
    options.isRefresh !== true &&
    first.ok === false &&
    first.error.code === AUTH_REQUIRED &&
    bridge !== null;

  if (!retryable) return first;

  // A 15-minute access token expiring mid-session is the ORDINARY case, not an
  // error worth showing anyone. Refresh once, replay once, and never loop.
  const refreshed = await bridge!.refresh();
  if (!refreshed) return first;

  return once<T>(path, options);
}

const get = <T>(path: string, options?: RequestOptions) => request<T>(path, options);

const send = <T>(path: string, body: unknown, options?: RequestOptions) =>
  request<T>(path, {
    method: 'POST',
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
    body: JSON.stringify(body),
  });

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
  const out: Record<string, string | string[]> = {};
  if (filters.caseType) out.caseType = filters.caseType;
  if (filters.date === 'last_10') out.dateFrom = `${new Date().getFullYear() - 10}-01-01`;
  if (filters.date === 'since_2020') out.dateFrom = '2020-01-01';
  // Category codes, expanded to court names server-side — bus 0046.
  if (filters.courts.length > 0) out.courts = filters.courts;
  return Object.keys(out).length ? out : undefined;
}

export const api = {
  /* ------------------------------------------------------------------ auth */

  /**
   * MAGIC LINK BY EMAIL. The response is `{ sent: true }` whatever the address —
   * an endpoint that answered differently for a known and an unknown email is an
   * account-enumeration oracle, and this one deliberately does not.
   */
  requestMagicLink: (email: string) => send<{ sent: true }>('/auth/magic-link', { email }),

  /**
   * PROVES AN EMAIL. IT DOES NOT CREATE AN ADVOCATE.
   *
   * The session comes back complete, but `user` here is the identity — the
   * profile may still be absent. Read `GET /me` before assuming a name exists.
   */
  verifyMagicLink: (token: string) => send<Session>('/auth/verify', { token }),

  /** Rotates. The old token is revoked by the server as this returns. */
  refreshSession: (refreshToken: string) =>
    send<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { refreshToken },
      { isRefresh: true }
    ),

  signOut: () => send<{ ok: true }>('/auth/logout', {}, { auth: true }),

  me: () => get<MeResponse>('/me', { auth: true }),

  /**
   * `expoPushToken` is passed through EXACTLY as given, including an explicit
   * `null`. Do not normalise it away — omitted and null are different
   * instructions to the server (`API_CONTRACTS.md` §Auth).
   */
  /**
   * `PATCH /me` also wraps under `user`, plus a sibling `created` flag —
   * `patchMe()` in `services/api/src/auth/account.ts` returns
   * `{ user: <profile fields>, created: boolean }`, not `{ profile }`.
   */
  updateProfile: (patch: ProfilePatch) =>
    request<{ user: Profile; created: boolean }>('/me', {
      method: 'PATCH',
      auth: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  currentTerms: () => get<CurrentTerms>('/terms/current'),

  /**
   * `held` is derived live at query time server-side — never cached there, so
   * this is never cached here either. Public route, no auth.
   */
  corpusCoverage: () => get<CorpusCoverage>('/corpus/coverage'),

  /**
   * PD-8 — consent, recorded with its VERSION and never inferred from any other
   * action. The version is sent back so the server can reject consent to text
   * that is no longer current.
   */
  acceptTerms: (version: string) =>
    send<{ termsAcceptedAt: string; termsVersion: string }>(
      '/me/accept-terms',
      { version },
      { auth: true }
    ),

  /**
   * DPDP Act 2023 s. 6 — separate from `acceptTerms`/PD-8 above. `granted`,
   * `grantedAt`, `version`, `currentVersion` and `isCurrent` all come back on
   * every call, so a client never has to infer state from a bare boolean.
   */
  trainingConsent: () => get<TrainingConsent>('/me/training-consent', { auth: true }),

  /** `version` is `currentVersion` off a prior read, echoed back — never a client constant, so a stale build cannot record agreement to a notice it never displayed. */
  grantTrainingConsent: (version: string) =>
    send<TrainingConsent>('/me/training-consent', { version }, { auth: true }),

  /** s. 6(4)–(6): withdrawal must be as easy as granting. Idempotent — succeeds even where nothing was granted. */
  withdrawTrainingConsent: () =>
    request<TrainingConsent>('/me/training-consent', { method: 'DELETE', auth: true }),

  /* --------------------------------------------------------------- matters */

  matters: () => get<{ matters: Matter[] }>('/matters', { auth: true }),

  /**
   * THE BUNDLE'S BRIEFINGS ARE NOT THE DETAIL ROUTE'S BRIEFINGS, and this said
   * they were until 11 Aug 2026. `GET /matters/:id` sends `briefingId` with the
   * date facts FLAT; `GET /briefings/:id` sends `dateConfidence` as an object,
   * plus blocks and authorities. Typing the bundle as `Briefing[]` promised the
   * matter screen a subject and an id that have never been on that wire.
   */
  matter: (matterId: string) =>
    get<{
      matter: Matter;
      /**
       * TOP-LEVEL ON THE BUNDLE, and it decides what the workspace may OFFER.
       * A sharee reads the matter and can write nothing to it, so a client
       * that did not read this drew four buttons that answer 404.
       */
      access: MatterAccess;
      events: MatterEvent[];
      documents: {
        documentId: string;
        documentType: string;
        language: 'en' | 'hi';
        createdAt: string;
      }[];
      briefings: MatterBundleBriefing[];
    }>(`/matters/${encodeURIComponent(matterId)}`, { auth: true }),

  /**
   * THE AUTHORITIES SAVED TO A MATTER. Live 11 Aug 2026.
   *
   * `POST` is IDEMPOTENT by design — `200` when the judgment is already saved,
   * `201` when it is new or brought back after removal — so a double tap in a
   * court corridor cannot create a duplicate.
   *
   * IT REFUSES `set_aside` WITH `409 AUTHORITY_SET_ASIDE`, server-side and
   * unconditionally, and the message names the judgment that replaced it. The
   * client refuses it too, from `citationRender().moved.blocksAddToMatter` —
   * that is not a duplicated rule but the same rule enforced at both ends,
   * because a replayed request or a stale build bypasses the client one.
   */
  matterAuthorities: (matterId: string) =>
    get<{ authorities: MatterAuthority[]; asOf: string }>(
      `/matters/${encodeURIComponent(matterId)}/authorities`,
      { auth: true }
    ),

  /**
   * NAMED ARGUMENTS, DELIBERATELY. `matterId` and `judgmentId` are both plain
   * strings, so positionally TypeScript cannot tell them apart — and swapping
   * them saves the wrong judgment into the wrong matter with no error anywhere.
   * This was written positionally first and swapped on the first call site
   * within a minute; an object makes that mistake unrepresentable.
   */
  addAuthorityToMatter: (args: {
    matterId: string;
    judgmentId: string;
    citationCheckId?: string | undefined;
  }) =>
    send<{ authority: MatterAuthority }>(
      `/matters/${encodeURIComponent(args.matterId)}/authorities`,
      {
        judgmentId: args.judgmentId,
        ...(args.citationCheckId ? { citationCheckId: args.citationCheckId } : {}),
      },
      { auth: true }
    ),

  removeAuthorityFromMatter: (matterId: string, authorityId: string) =>
    request<{ removedAt: string }>(
      `/matters/${encodeURIComponent(matterId)}/authorities/${encodeURIComponent(authorityId)}`,
      { method: 'DELETE', auth: true }
    ),

  createMatter: (matter: Omit<Matter, 'matterId'>) =>
    send<{ matter: Matter }>('/matters', matter, { auth: true }),

  /**
   * `nextHearingDate: null` CLEARS IT. Omitting the key leaves it alone. The
   * adjournment path depends on the difference, so the patch is passed through
   * verbatim rather than being cleaned up on the way out.
   */
  updateMatter: (matterId: string, patch: Partial<Omit<Matter, 'matterId'>>) =>
    request<{ matter: Matter }>(`/matters/${encodeURIComponent(matterId)}`, {
      method: 'PATCH',
      auth: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  /**
   * PD-4 — a note is private in the DATABASE COLUMN. This never sends a
   * visibility it was not given: a default supplied here would be a default in
   * application code, which is the exact failure the column default prevents.
   */
  addMatterEvent: (
    matterId: string,
    event: {
      eventDate: string;
      eventType: string;
      orderText?: string;
      notes?: string;
      noteVisibility?: 'private' | 'shared';
    }
  ) => send<{ event: MatterEvent }>(`/matters/${encodeURIComponent(matterId)}/events`, event, { auth: true }),

  /**
   * PD-4 — FLIP ONE NOTE'S VISIBILITY. This is a PATCH on an existing event and
   * never a new one: creating a second event to change a visibility would put a
   * duplicate entry in the matter timeline, and the timeline is the one
   * authoritative record of what the court did.
   */
  setNoteVisibility: (matterId: string, eventId: string, noteVisibility: 'private' | 'shared') =>
    request<{ event: MatterEvent }>(
      `/matters/${encodeURIComponent(matterId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        auth: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noteVisibility }),
      }
    ),

  /* ------------------------------------------------- matter sharing · PD-3 */

  /**
   * Field is `shareId`, not `id` — matches `shape()` in
   * `services/api/src/matters/shares.ts`, confirmed against the live source
   * 8 Aug 2026 rather than assumed. Revoked shares are RETURNED, not
   * filtered out — "who had sight of this matter, and when" is the point.
   */
  matterShares: (matterId: string) =>
    get<{
      shares: {
        shareId: string;
        invitedIdentifier: string;
        invitedUserId: string | null;
        grantedBy: string;
        grantedAt: string;
        revokedAt: string | null;
      }[];
      asOf: string;
    }>(`/matters/${encodeURIComponent(matterId)}/shares`, { auth: true }),

  /**
   * `identifier` is an enrolment number OR a phone number, EXACTLY AS TYPED.
   * There is no chamber-wide endpoint and there must not be one: a chamber of
   * two to five is a list of names, and chamber-wide default sharing is a
   * conflicts hazard — two advocates in one chamber can be on opposing sides of
   * related matters.
   *
   * `created: false` means the invite already existed and is live — the
   * server answers idempotently rather than a 409, so a retrying client
   * does not look broken.
   */
  inviteToMatter: (matterId: string, identifier: string) =>
    send<{
      share: {
        shareId: string;
        invitedIdentifier: string;
        invitedUserId: string | null;
        grantedBy: string;
        grantedAt: string;
        revokedAt: string | null;
      };
      created: boolean;
    }>(`/matters/${encodeURIComponent(matterId)}/shares`, { identifier }, { auth: true }),

  /** Revoke sets `revoked_at`. It NEVER deletes the row — who had sight of a matter, and when, is what a conflicts challenge asks later. */
  revokeMatterShare: (matterId: string, shareId: string) =>
    request<{ revokedAt: string }>(
      `/matters/${encodeURIComponent(matterId)}/shares/${encodeURIComponent(shareId)}`,
      { method: 'DELETE', auth: true }
    ),

  /* ------------------------------------------------------------- briefings */

  briefing: (briefingId: string) =>
    get<{ briefing: Briefing }>(`/briefings/${encodeURIComponent(briefingId)}`, { auth: true }),

  /**
   * THE INDEX, NOT THE BRIEFING. `route.ts` omits authorities deliberately:
   * "this is an index, and re-reading every authority of every past briefing to
   * render a list of dates would be a lot of work to produce something nobody
   * reads." It also sends no `matterId` and no subject.
   */
  matterBriefings: (matterId: string) =>
    get<{ briefings: BriefingListItem[] }>(`/matters/${encodeURIComponent(matterId)}/briefings`, {
      auth: true,
    }),

  /**
   * ACTIVATION IS MEASURED ON THIS CALL — "two briefings opened in week one".
   * `generated`, `delivered` and `opened` are three different facts in three
   * columns (`SCHEMA_TRUTH.md#briefings`); collapsing any two makes the metric
   * meaningless, so this fires on the open and nowhere else.
   *
   * `markBriefingOpened` in `route.ts` returns `openedAt` alongside `ok` — the
   * first-open timestamp, `coalesce`d so a re-open never overwrites it. The
   * type declared only `{ ok: true }` until the Task 7 sweep; nothing reads
   * `openedAt` today, but an undeclared field is exactly the shape the sweep
   * exists to catch before a caller needs it and finds it missing.
   */
  markBriefingOpened: (briefingId: string) =>
    send<{ ok: true; openedAt: string }>(
      `/briefings/${encodeURIComponent(briefingId)}/opened`,
      {},
      { auth: true }
    ),

  /* ---------------------------------------------------------------- drafting */

  /** R4, 11 Aug 2026 — the Drafts list. Newest first, no `content` on any row. */
  documents: () => get<{ documents: DraftListItem[] }>('/documents', { auth: true }),

  /**
   * First client caller of this route. `document.citations` is a flat
   * `DraftCitation[]`, not `SearchResult[]` — see the type-level note on
   * `DraftDocument` for why an earlier version of this file assumed wrong.
   */
  document: (documentId: string) =>
    get<{ document: DraftDocument }>(`/documents/${encodeURIComponent(documentId)}`, {
      auth: true,
    }),

  /* ------------------------------------------------------------------ court */

  /**
   * `available: false` IS A NORMAL 200 AND MUST NOT RENDER AS A FAILURE (PD-12).
   * Next dates are given orally in open court, so an advocate typing one is
   * doing the ordinary thing — the manual form is the first-class path, not a
   * fallback the product apologises for.
   */
  /**
   * ONE SHAPE, IN `contract.ts`. It was declared inline here and differently
   * there — and the inline one typed `manualEntry.expected` as `string` against
   * a server that sends the boolean `true`.
   */
  courtLookup: (cnrNumber: string) =>
    send<CourtLookupResult>('/court/lookup', { cnrNumber }, { auth: true }),

  /* ------------------------------------------------------- alerts · PD-5, PD-6 */

  /**
   * `since` is a timestamp the caller supplies (the last time it looked),
   * matching the saved-searches feed's own time-based idiom rather than a
   * cursor — an alerts feed is read forward from where the advocate last
   * looked, not paged through. `unreadCount` is for in-app ordering only;
   * PD-6 — never a badge on the app icon or tab bar.
   */
  alerts: (since?: string) =>
    get<{ alerts: Alert[]; unreadCount: number }>(
      since ? `/alerts?since=${encodeURIComponent(since)}` : '/alerts',
      { auth: true }
    ),

  markAlertRead: (alertId: string) =>
    send<{ ok: true }>(`/alerts/${encodeURIComponent(alertId)}/read`, {}, { auth: true }),

  alertSettings: () => get<{ settings: AlertSettings }>('/me/alert-settings', { auth: true }),

  /**
   * `.strict()` server-side — sending `filedCitationMoved` (trigger 2) is a
   * `400`. That key does not exist on `AlertSettings` for the same reason:
   * an advocate who filed a document citing law that has since moved does
   * not get to opt out of being told.
   */
  updateAlertSettings: (patch: Partial<AlertSettings>) =>
    request<{ settings: AlertSettings }>('/me/alert-settings', {
      method: 'PATCH',
      auth: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),

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
   * PD-9 item 3 — highlight and save a passage. Shape verified against
   * `services/api/src/judgments/annotations.ts`, 8 Aug 2026: `quote` is
   * required (the paragraph's text), not the abbreviated line in
   * `API_CONTRACTS.md`. Private to the user; shared only via `matterId`
   * per the matter's own sharing rules.
   */
  annotations: (judgmentId: string) =>
    get<{ annotations: Annotation[] }>(`/judgments/${encodeURIComponent(judgmentId)}/annotations`, {
      auth: true,
    }),

  /**
   * `matterId` set + the judgment `set_aside` returns `409
   * AUTHORITY_SET_ASIDE` — the one refusal in this product, and it is about
   * USING the passage as an authority, not about saving it. Retry without
   * `matterId` to save the passage on its own.
   */
  createAnnotation: (judgmentId: string, draft: AnnotationDraft) =>
    send<{ annotation: Annotation }>(`/judgments/${encodeURIComponent(judgmentId)}/annotations`, draft, {
      auth: true,
    }),

  /** Soft delete — `deleted_at`, scoped to the owner server-side. */
  deleteAnnotation: (annotationId: string) =>
    request<{ deleted: true }>(`/annotations/${encodeURIComponent(annotationId)}`, {
      method: 'DELETE',
      auth: true,
    }),

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
    request<EcourtsPath>('/verify/ecourts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText }),
    }),

  /**
   * `{ cached: true }` UNTIL 11 AUG 2026 — five of the six fields dropped, and
   * one of them is `overruledStatus`, read live from the judgments row at the
   * moment of confirmation.
   *
   * `handleConfirm` is explicit about why it sends it: "A judgment can be
   * verified and overruled at once — confirming that it EXISTS says nothing
   * about whether it is still good law." The two questions are the ones this
   * product refuses to collapse, and a response that answers both while the
   * client declares only the first is how they get collapsed by accident.
   */
  verifyConfirm: (citationText: string, judgmentId: string) =>
    request<{
      cached: true;
      citationCheckId: string | null;
      verificationState: VerificationState;
      verifiedBySource: VerifiedBySource;
      overruledStatus: OverruledStatus;
      confirmedAt: string | null;
      asOf: string;
    }>('/verify/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText, judgmentId }),
    }),

  /**
   * `coverage` HAS ALWAYS BEEN ON THIS RESPONSE and was undeclared until
   * 11 Aug 2026, so the acts index showed a list with no statement of what was
   * missing from it. See `StatuteCoverage` for the three fields that must not
   * be read naively.
   */
  statutes: () => get<{ statutes: Statute[]; coverage: StatuteCoverage; asOf: string }>('/statutes'),

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
