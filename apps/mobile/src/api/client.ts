import { Platform } from 'react-native';

import { IDEMPOTENCY_HEADER } from './attempt';
import { corpusSafeError } from './corpusAbsence';

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
  ClientPlatform,
  CorpusCoverage,
  CorpusFreshness,
  CorpusFreshnessObject,
  CounterArgumentsResponse,
  CourtLookupResult,
  CurrentTerms,
  DataRequest,
  DataRequestKind,
  DraftDocument,
  DraftListItem,
  EcourtsPath,
  JudgmentDetail,
  Matter,
  OverruledStatus,
  MatterAccess,
  MatterAuthoritiesResponse,
  AddAuthorityResponse,
  MatterAuthority,
  MatterEvent,
  MeResponse,
  PrecedentGraph,
  Profile,
  ProfilePatch,
  PremiumPreview,
  ReleaseCapabilities,
  SearchFilters,
  SearchResponse,
  Session,
  Statute,
  StatuteCoverage,
  StatuteLinkedEvidence,
  StatuteLinkedJudgmentsResponse,
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
 * `eas.json` build profiles (`env`), or in a local `.env` for `expo start`.
 *
 * FAIL CLOSED, NOT SILENTLY WRONG. Until 22 Aug 2026 a missing var fell back to
 * `api-production-1c0b4.up.railway.app` — 0 active deployments since 11 Aug —
 * in EVERY channel including a real EAS `preview`/`production` build. That is
 * the audit's #1 ship-brick risk: a build that compiles clean, installs clean,
 * and then fails every request forever with nothing in the code saying why.
 *
 * `__DEV__` is Metro's own dev-vs-bundled flag, true only under `expo start` —
 * never true in an EAS build, simulator or store binary. Dev alone gets a
 * local default (`docs/CURRENT_PLAN.md`'s LOCAL-FIRST posture: the API's own
 * default port, `services/api/src/env.ts`). Every other bundle throws at
 * import time rather than silently pointing at a URL nobody chose — the crash
 * is the honest behaviour; `app.config.ts` also fails the EAS build itself
 * before that binary can even be produced. FQ-HOSTING (docs/FOUNDER_QUEUE.md)
 * still owns the actual channel URLs — this only refuses to guess one.
 */
/**
 * THE THREE ENVIRONMENTS, NAMED. `development` | `staging` | `production`.
 *
 * Declared rather than inferred. `__DEV__` alone answered "is this a Metro dev
 * bundle", which is not the same question as "which backend is this build
 * for" — a staging binary and a production binary are both `__DEV__ === false`
 * and must not share a default. `EXPO_PUBLIC_APP_ENV` is set per profile in
 * `eas.json`; absent, a dev bundle is `development` and anything else is
 * treated as `production`, because the conservative direction is the strict one.
 */
export type AppEnvironment = 'development' | 'staging' | 'production';

export function resolveAppEnvironment(
  declared: string | undefined,
  isDev: boolean,
): AppEnvironment {
  if (declared === 'development' || declared === 'staging' || declared === 'production') {
    return declared;
  }
  return isDev ? 'development' : 'production';
}

/**
 * THE ONE URL THAT MAY NEVER COME BACK. `api-production-1c0b4.up.railway.app`
 * had 0 active deployments from 11 August 2026 and was the silent fallback
 * until 22 August. Naming it here means a stale `.env`, a copied EAS secret or
 * a resurrected shell profile fails LOUDLY instead of producing a build that
 * compiles clean, installs clean, and then fails every request forever.
 *
 * NOT A DEPLOY DECISION. Nothing here asks for that service to be revived —
 * the point is that no build may point at it by default, whether it is alive
 * or dead.
 */
export const RETIRED_API_HOSTS = ['api-production-1c0b4.up.railway.app'] as const;

/**
 * `EXPO_PUBLIC_API_URL` is inlined at build time by Metro (the `EXPO_PUBLIC_`
 * prefix is what makes an env var reach client code at all — see
 * https://docs.expo.dev/guides/environment-variables/). Set it per channel in
 * `eas.json` build profiles (`env`), or in a local `.env` for `expo start`.
 *
 * FAIL CLOSED, NOT SILENTLY WRONG — and fail closed in all three environments,
 * which is what R12 §2 asked for and what this function did only half of.
 *
 *   · `development` — an explicit URL wins; absent, the API's own default port
 *     (`services/api/src/env.ts`) is used, because LOCAL-FIRST is the posture
 *     in `docs/CURRENT_PLAN.md` and a developer running `expo start` against
 *     their own backend should not need a dotfile to do it. This is the ONLY
 *     environment with a default, and it is a loopback address, so a
 *     misconfiguration here cannot reach anybody else's data.
 *   · `staging` and `production` — NO DEFAULT AT ALL. A missing URL throws at
 *     import time. `app.config.ts` also fails the EAS build itself, so a
 *     misconfigured binary never leaves the queue; this is the second line of
 *     defence for a local `eas build --local` or a differently-invoked bundler.
 *
 * A URL that is present but retired, or not http(s), is rejected the same way.
 * FQ-HOSTING (`docs/FOUNDER_QUEUE.md`) owns the actual channel URLs; this only
 * refuses to guess one, and refuses to accept a known-dead one.
 */
export function resolveBaseUrl(
  configured: string | undefined,
  environment: AppEnvironment,
): string {
  if (configured !== undefined && configured !== '') {
    const url = configured.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(
        `EXPO_PUBLIC_API_URL must be an absolute http(s) URL. Got: ${url}`,
      );
    }
    if (RETIRED_API_HOSTS.some((host) => url.includes(host))) {
      throw new Error(
        `EXPO_PUBLIC_API_URL points at a retired API host (${url}). That service has had no ` +
          'active deployment since 11 August 2026 and every request to it fails. Set the URL ' +
          `for the "${environment}" environment — see docs/FOUNDER_QUEUE.md FQ-HOSTING.`,
      );
    }
    return url;
  }
  if (environment === 'development') return 'http://localhost:3000';
  throw new Error(
    `EXPO_PUBLIC_API_URL is not set for the "${environment}" build. Refusing to fall back to a ` +
      'guessed API URL — set it in the eas.json build profile (or the hosting environment) for ' +
      'this channel. See docs/FOUNDER_QUEUE.md FQ-HOSTING.',
  );
}

export const APP_ENVIRONMENT: AppEnvironment = resolveAppEnvironment(
  process.env.EXPO_PUBLIC_APP_ENV,
  __DEV__,
);

const BASE_URL = resolveBaseUrl(process.env.EXPO_PUBLIC_API_URL, APP_ENVIRONMENT);

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `Idempotency-Key` — SENT ONLY WHEN THE CALLER OWNS AN ATTEMPT. R16.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The key is NOT minted here, and that is the whole point. A key minted per call
 * would be a new key on every retry, which executes a second mutation — exactly
 * the duplicate R16 exists to prevent. Only the logical attempt knows when it
 * began and when it ended, so the attempt holds the key and passes it down.
 * `attempt.ts` is where one comes from.
 *
 * NO KEY, NO HEADER, and that path stays first-class: R16 is
 * `WIRE_BREAKING_CHANGE = NO` and a request without the header is the R15
 * behaviour byte for byte, server-side. Every one of the six creates below can
 * still be called without an attempt key and still works.
 */
function idempotency(attemptKey: string | undefined): Record<string, string> {
  return attemptKey ? { [IDEMPOTENCY_HEADER]: attemptKey } : {};
}

type RequestOptions = RequestInit & {
  /** Attach the access token, and refresh once on a 401. Default false. */
  auth?: boolean;
  /** Internal: this call IS the refresh, so it must never trigger another. */
  isRefresh?: boolean;
};

/**
 * WHICH PLATFORM IS ASKING — R14 A4.2, sent on EVERY request.
 *
 * The server resolves each capability for the platform that asked and returns
 * the answer already resolved (`ReleaseCapabilities.platform`). A build that
 * sends nothing gets the release-wide set and therefore CANNOT SEE ITS OWN
 * NARROWING — it would offer a surface the server has switched off for it. That
 * is the whole reason this is not scoped to one endpoint: `/search` reports the
 * consequence (`degraded: ['party_name_disabled']`) and `/release/capabilities`
 * reports the cause, and a client that identified itself to only one of them
 * would hold two different beliefs about the same switch.
 *
 * IT IS NOT A SECURITY BOUNDARY AND THIS CLIENT DOES NOT TREAT IT AS ONE. A
 * platform override may take a capability DOWN and never UP (R14 A4.8, asserted
 * by committed server tests), so lying about the platform gains nothing and
 * nothing here defends against one.
 *
 * ONLY A NAME THE CONTRACT DEFINES IS EVER SENT. `Platform.OS` can in principle
 * be a target we do not ship (`windows`, `macos`); rather than invent a platform
 * name, the header is OMITTED, which is exactly the no-selector case the server
 * already answers with the release-wide set. Adding a value here means adding it
 * to the contract first.
 *
 * The OS is an ARGUMENT with a default, for the same reason `resolveBaseUrl`
 * takes its inputs: the mapping can then be tested for every target without
 * mutating a module-level global or re-importing the client per case.
 */
export function clientPlatformHeader(os: string = Platform.OS): Record<string, string> {
  return os === 'ios' || os === 'android' || os === 'web'
    ? { 'x-lawmind-platform': os satisfies ClientPlatform }
    : {};
}

async function once<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const token = options?.auth ? bridge?.accessToken() : null;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        ...clientPlatformHeader(),
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

    /**
     * `Retry-After` — THE ONE HEADER THIS CLIENT READS, AND ONLY ON A FAILURE.
     *
     * R16 answers a follower that could not wait for the executor with `409
     * IDEMPOTENCY_IN_PROGRESS` and `Retry-After: 1`. Until now `once()` parsed
     * the JSON body and DROPPED the response object, so that instruction could
     * not reach the caller at all and a retry would have had to guess.
     *
     * IT IS ONE FIELD ON THE ERROR, NOT THE WHOLE `Response`. Plumbing headers
     * through the app would put a transport object in every screen for the sake
     * of one integer; `attempt.ts` reads it, bounds it, and nothing else needs
     * to know a header exists.
     *
     * PARSED, NEVER ASSUMED. Only the delay-seconds form, only a finite
     * positive number. `1` is what today's server sends and hardcoding it would
     * bake a server constant into a shipped binary; anything unusable is left
     * undefined so `retryAfterMs` can apply its bounded fallback rather than
     * this layer inventing a number the server did not say.
     */
    if (body.ok === false) {
      /**
       * ONE SENTENCE FOR THE CORPUS-GENERATION STATE, ON EVERY ROUTE AT ONCE.
       *
       * Eight server call sites across seven routes can answer that the corpus
       * generation this request was pinned to does not carry a judgment (LCC bus
       * 1758). Four render sites printed the server's own words for it, and
       * before LCC R29 those words were *"no judgment with that id"* — a claim
       * about the law, which after a rollback is false.
       *
       * Applied at the one place every response passes through, so a screen
       * added later cannot opt out of it by forgetting, and so both wires are
       * handled in one place: R29's `CORPUS_TARGET_UNAVAILABLE` and the pre-R29
       * `NOT_FOUND`, which a shipped binary still meets during a rolling
       * release. `api/corpusAbsence.ts` carries the whole argument.
       *
       * The CODE is untouched — callers branch on it, and a code this client
       * invented would be a contract this client invented.
       */
      const error = corpusSafeError(body.error);
      const raw = Number(response.headers?.get?.('retry-after'));
      if (Number.isFinite(raw) && raw > 0) {
        return { ok: false, error: { ...error, retryAfterSeconds: raw } };
      }
      return { ok: false, error };
    }

    return body;
  } catch (cause) {
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * WE KNOW WE ABORTED BECAUSE WE ABORTED — the signal, not the exception.
     * ─────────────────────────────────────────────────────────────────────────
     *
     * This used to ask the REJECTION what happened: `cause.name === 'AbortError'`.
     * That is the standard identity for a cancelled `fetch`, it is what
     * `whatwg-fetch` rejects with, and on a physical Galaxy S24 it is never
     * what arrives.
     *
     * MEASURED 1 SEPTEMBER 2026, SM-S921B / Android 16, this HEAD, with a probe
     * on this exact line:
     *
     *     { name: "Error", ctor: "FetchError", isError: true,
     *       msg: "fetch failed: Fetch request has been canceled" }
     *
     * `instanceof Error` holds and the NAME does not. Expo's native fetch has
     * replaced React Native's `whatwg-fetch` polyfill, and it rejects a
     * cancelled request with a `FetchError` named `Error`. So `aborted` was
     * false on every timeout, the code fell through to `network`, and
     * `SearchScreen` — which correctly maps only `network` to offline — told an
     * advocate on full WiFi that they were offline while the server was
     * answering them.
     *
     * That is the SAME defect RCC fixed on 31 August 2026, and the fix did not
     * hold: it corrected the screen's mapping, which was right, while the code
     * feeding it stayed wrong. Reproduced here at 15,243 ms against a 15,000 ms
     * budget, with `POST /search status 200` in the server's own log.
     *
     * THE SIGNAL IS THE AUTHORITY AND CANNOT DRIFT. `controller.signal.aborted`
     * is our own state: it is true exactly when this function's own timer fired,
     * whoever implements `fetch` and whatever they throw. The name check is kept
     * beside it because it is correct where it does hold and costs nothing —
     * but it is now the fallback, not the test.
     */
    const aborted =
      controller.signal.aborted || (cause instanceof Error && cause.name === 'AbortError');
    return {
      ok: false,
      error: {
        code: aborted ? 'timeout' : 'network',
        message: aborted
          ? // OUR deadline, not a fact about their connection — a timed-out request
            // may well have been answered a moment later. Observed 31 Aug 2026:
            // `/search` returned 200 in 15,334ms against a 15,000ms budget.
            //
            // AND IT NAMES NO OPERATION. This is the TRANSPORT's message, so it
            // is what every route gets, and a screen with no timeout copy of its
            // own renders it verbatim. It read "The search took longer..." until
            // 17 Sep 2026, when the SIGN-IN screen said exactly that on a dead
            // cellular link: a sentence about a search, on a screen that has no
            // search on it, about a sign-in link that was never sent. Observed on
            // the physical S24, docs/ai/rcc-r31/ROUND.md.
            //
            // Being confidently wrong about WHICH operation failed is worse than
            // being unspecific about it, so this sentence is unspecific on
            // purpose. A screen that wants to name the operation owns copy of its
            // own, as `SearchScreen` does.
            'That took longer than we wait for. It may still have gone through.'
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
      { isRefresh: true },
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
   * THE SERVER'S OWN CAPABILITY REGISTRY -- `RELEASE_CAPABILITIES_R8_3.3`.
   *
   * Public, no auth, and read once at launch. `state/capabilities.ts` ANDs it
   * with the product's frozen v1 decision: this registry may CLOSE a surface
   * and may never open one. RCC_V1_API_CONTRACT_R12 1.6 -- read it rather than
   * hardcoding the list, so a capability the server withdraws disappears from
   * the app without a release.
   */
  releaseCapabilities: () => get<ReleaseCapabilities>('/release/capabilities'),


  /**
   * `held` is derived live at query time server-side — never cached there, so
   * this is never cached here either. Public route, no auth.
   */
  corpusCoverage: () => get<CorpusCoverage>('/corpus/coverage'),

  /**
   * HOW CURRENT THE CORPUS IS — mounted since R8, called by nothing until
   * 1 September 2026 (founder design D-5, NEW3 R16 `R16-RCC-03`).
   *
   * The response carries TWO lag numbers and the registry's rule is to quote
   * both or neither. `screens/settings/corpusFreshness.ts` is where that rule
   * lives; nothing else may read `naive.lagDays` on its own.
   */
  corpusFreshness: () => get<CorpusFreshness>('/corpus/freshness'),

  /**
   * The published upstream-parity observation — how far behind the SOURCE we
   * are, which nothing computed from our own rows can answer. A SEPARATE call
   * because it is a separate question and because it may be unavailable on its
   * own: a failure here says so and never degrades the two lags above.
   */
  corpusFreshnessObject: () => get<CorpusFreshnessObject>('/corpus/freshness/object'),

  /**
   * PD-8 — consent, recorded with its VERSION and never inferred from any other
   * action. The version is sent back so the server can reject consent to text
   * that is no longer current.
   */
  acceptTerms: (version: string) =>
    send<{ termsAcceptedAt: string; termsVersion: string }>(
      '/me/accept-terms',
      { version },
      { auth: true },
    ),

  /**
   * DPDP Act 2023 s. 6 — separate from `acceptTerms`/PD-8 above. `granted`,
   * `grantedAt`, `version`, `currentVersion` and `isCurrent` all come back on
   * every call, so a client never has to infer state from a bare boolean.
   */
  trainingConsent: () => get<TrainingConsent>('/me/training-consent', { auth: true }),

  /** `version` is `currentVersion` off a prior read, echoed back — never a client constant, so a stale build cannot record agreement to a notice it never displayed. */
  grantTrainingConsent: (version: string, attemptKey?: string) =>
    send<TrainingConsent>('/me/training-consent', { version }, {
      auth: true,
      headers: idempotency(attemptKey),
    }),

  /** s. 6(4)–(6): withdrawal must be as easy as granting. Idempotent — succeeds even where nothing was granted. */
  withdrawTrainingConsent: () =>
    request<TrainingConsent>('/me/training-consent', { method: 'DELETE', auth: true }),

  /**
   * `POST /me/data-requests` — DPDP export/correction/erasure. Creates a
   * REQUEST, never executes one (`DataRequest`'s own doc comment).
   * `alreadyOpen: true` means an identical open request already existed and
   * this returned it rather than opening a second — the server's own
   * idempotency, not a client-side guess.
   */
  createDataRequest: (kind: DataRequestKind, note?: string, attemptKey?: string) =>
    send<{ request: DataRequest; alreadyOpen: boolean }>(
      '/me/data-requests',
      note ? { kind, note } : { kind },
      { auth: true, headers: idempotency(attemptKey) },
    ),

  /** Every request this advocate has ever raised, newest first. */
  listDataRequests: () => get<{ requests: DataRequest[] }>('/me/data-requests', { auth: true }),

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
  /**
   * R17 §1: the response also carries `unavailableAuthorities[]` — the saved
   * rows whose immutable `judgmentId` the request-pinned corpus generation does
   * not hold. An R17 server always sends it, `[]` included, so an empty array
   * is "nothing unavailable" and never evidence of an older server.
   */
  matterAuthorities: (matterId: string) =>
    get<MatterAuthoritiesResponse>(`/matters/${encodeURIComponent(matterId)}/authorities`, {
      auth: true,
    }),

  /**
   * Deterministic premium preview only. The server flag defaults OFF and
   * answers `NOT_ENABLED`; callers hide the card in that state. A successful
   * read also records the durable `premium_intent` activation step server-side.
   */
  premiumPreview: (matterId: string) =>
    get<PremiumPreview>(`/matters/${encodeURIComponent(matterId)}/premium-preview`, {
      auth: true,
    }),

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
    /*
      TWO SUCCESS SHAPES SINCE R17 §1: `{ authority }` when the pinned corpus
      generation resolves the target, `{ unavailableAuthority }` when it does not
      and this exact row is already saved. `citation/saveAuthorityOutcome.ts` is
      the only place that narrows it — a call site reading `.authority` off the
      shell would get `undefined` where a case title was expected.
    */
    send<AddAuthorityResponse>(
      `/matters/${encodeURIComponent(args.matterId)}/authorities`,
      {
        judgmentId: args.judgmentId,
        ...(args.citationCheckId ? { citationCheckId: args.citationCheckId } : {}),
      },
      { auth: true },
    ),

  removeAuthorityFromMatter: (matterId: string, authorityId: string) =>
    request<{ removedAt: string }>(
      `/matters/${encodeURIComponent(matterId)}/authorities/${encodeURIComponent(authorityId)}`,
      { method: 'DELETE', auth: true },
    ),

  createMatter: (matter: Omit<Matter, 'matterId'>, attemptKey?: string) =>
    send<{ matter: Matter }>('/matters', matter, {
      auth: true,
      headers: idempotency(attemptKey),
    }),

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
    },
    attemptKey?: string,
  ) =>
    send<{ event: MatterEvent }>(`/matters/${encodeURIComponent(matterId)}/events`, event, {
      auth: true,
      headers: idempotency(attemptKey),
    }),

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
      },
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
      { method: 'DELETE', auth: true },
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
      { auth: true },
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
      { auth: true },
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
  /**
   * `page` is 1-based and additive — omitted means page 1, byte-identical to
   * every existing caller. Passing it re-runs the SAME query against the
   * server's `page`/`pageSize` params (`docs/API_CONTRACTS.md` §Search), not a
   * cursor: the rankers re-run per page, so page 2 of a query typed a minute
   * ago is the next slice of the current ranking, never a stale snapshot.
   */
  search: (query: string, language: 'en' | 'hi', filters?: SearchFilters, page?: number) =>
    request<SearchResponse>('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        language,
        filters: serverFilters(filters),
        ...(page && page > 1 ? { page } : {}),
      }),
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
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''),
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
      `/judgments/${encodeURIComponent(judgmentId)}/graph?depth=${depth}&limit=${limit}`,
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
  createAnnotation: (judgmentId: string, draft: AnnotationDraft, attemptKey?: string) =>
    send<{ annotation: Annotation }>(
      `/judgments/${encodeURIComponent(judgmentId)}/annotations`,
      draft,
      {
        auth: true,
        headers: idempotency(attemptKey),
      },
    ),

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
  /**
   * `auth: true` IS LOAD-BEARING, NOT DECORATIVE — found 22 Aug 2026 while
   * auditing the outbox's permanent-failure handling. `recordCopy` in
   * `services/api/src/citations/copies.ts` requires `userId` and returns 401
   * `AUTH_REQUIRED` without one; `once()` in this file attaches the bearer
   * token ONLY when `options.auth` is `true`. Without this flag EVERY copy
   * record was sent with no Authorization header, so every one 401'd, forever
   * — `useOutbox`'s `MAX_ATTEMPTS` retried a request that could never succeed,
   * then left it queued permanently, silently defeating the one mechanism
   * `SCHEMA_TRUTH.md#citation_copies` exists for: warning "the advocate at
   * highest risk" when an authority they copied out of the app later moves.
   */
  recordCitationCopy: (copy: CitationCopy) =>
    request<{ ok: true }>('/citations/copies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(copy),
      auth: true,
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
  /**
   * `auth: true` IS LOAD-BEARING HERE TOO — missing until 2 September 2026, and
   * the same defect class as `recordCitationCopy` above.
   *
   * `services/api/src/app.ts` resolves the principal (`await userFor(c)`) before
   * `handleConfirm` runs and the row it writes is scoped to that advocate, so
   * every confirm this client ever sent answered `AUTH_REQUIRED` and wrote
   * nothing — while `UnverifiedCitationScreen` had already painted "You
   * confirmed this". Tier 3 is a human vouching and we were recording none of
   * it.
   *
   * IT IS ALSO THE PRECONDITION FOR R16 ON THIS ROUTE. `withIdempotency` passes
   * straight through when there is no principal — "No principal, no scope" — so
   * an unauthenticated confirm cannot be made duplicate-safe by any key. The
   * auth flag is not a separate tidy-up; without it the key below is inert.
   */
  verifyConfirm: (citationText: string, judgmentId: string, attemptKey?: string) =>
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
      auth: true,
      headers: { 'content-type': 'application/json', ...idempotency(attemptKey) },
      body: JSON.stringify({ citationText, judgmentId }),
    }),

  /**
   * `coverage` HAS ALWAYS BEEN ON THIS RESPONSE and was undeclared until
   * 11 Aug 2026, so the acts index showed a list with no statement of what was
   * missing from it. See `StatuteCoverage` for the three fields that must not
   * be read naively.
   */
  statutes: () =>
    get<{ statutes: Statute[]; coverage: StatuteCoverage; asOf: string }>('/statutes'),

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
      `/statutes/sections?actId=${encodeURIComponent(actId)}&limit=${Math.min(limit, 600)}`,
    ),

  /**
   * `GET /statutes/:statuteId/linked-judgments` — HELD, and expected to REFUSE.
   *
   * LCC R19 at `69d2a9bb`, NEW3 R16 `R16-RCC-08`. The server answers
   * `409 CAPABILITY_DISABLED` unless `STATUTE_LINKED_JUDGMENTS_ROUTE=enabled` is
   * set in ITS environment, and that is set in no environment this client will
   * ever meet. **A 409 from this method is the correct, expected answer**, not a
   * fault to retry or to report as an outage.
   *
   * It exists so NEW3 can acceptance-test the surface before it is released.
   * Nothing an advocate can reach calls it: there is no route file, no
   * navigation entry and no deep link, which is the same way `semanticSearch`
   * has been held — built, measured, unreachable.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * `evidence` DEFAULTS TO THE SERVER'S DEFAULT BY OMISSION, DELIBERATELY.
   * ─────────────────────────────────────────────────────────────────────────
   *
   * The parameter is not sent unless a caller names it, so the tier is whatever
   * the server says its default is rather than whatever this client last
   * believed. `structural_unreviewed` is DEVELOPMENT AND ACCEPTANCE ONLY — it
   * returns the 905,853-row unclassified population, which is not a set of
   * confirmed links and must never be rendered to an advocate as one.
   *
   * `sectionId` and `sectionNumber` are mutually exclusive on the wire (both is
   * a 400), so they are mutually exclusive here too, in the type, rather than
   * being arbitrated silently at the call site.
   */
  statuteLinkedJudgments: (
    statuteId: string,
    options: {
      section?: { sectionId: string } | { sectionNumber: string };
      evidence?: StatuteLinkedEvidence;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const params: string[] = [];
    const section = options.section;
    if (section && 'sectionId' in section) {
      params.push(`sectionId=${encodeURIComponent(section.sectionId)}`);
    } else if (section && 'sectionNumber' in section) {
      params.push(`sectionNumber=${encodeURIComponent(section.sectionNumber)}`);
    }
    if (options.evidence !== undefined) params.push(`evidence=${options.evidence}`);
    if (options.limit !== undefined) params.push(`limit=${Math.min(Math.max(options.limit, 1), 50)}`);
    if (options.offset !== undefined) {
      params.push(`offset=${Math.min(Math.max(options.offset, 0), 10_000)}`);
    }
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return get<StatuteLinkedJudgmentsResponse>(
      `/statutes/${encodeURIComponent(statuteId)}/linked-judgments${query}`,
    );
  },
};
