import { type Context, Hono } from 'hono';
import { requestId } from 'hono/request-id';

import { auditQuery, listAudit } from './admin/audit.ts';
import {
  causeListQuery,
  escalateBody,
  escalateCauseList,
  listCauseLists,
  retryCauseList,
} from './admin/cause-lists.ts';
import { citationsMonitorQuery, getCitationsMonitor } from './admin/citations.ts';
import {
  disputesQuery,
  getDispute,
  listDisputes,
  reject,
  rejectBody,
  uphold,
  upholdBody,
} from './admin/disputes.ts';
import { getLlmCosts, llmCostsQuery } from './admin/llm-costs.ts';
import { listOcrQueue, ocrQueueQuery } from './admin/ocr-queue.ts';
import { runOverruledRecheck } from './admin/rechecks.ts';
import { getMetrics } from './admin/metrics.ts';
import {
  flagBody,
  getPlatform,
  killSwitchBody,
  maintenanceBody,
  setFlag,
  setKillSwitch,
  setMaintenance,
} from './admin/platform.ts';
import {
  completeDataRequest,
  completeRequestBody,
  dataRequestsQuery,
  eraseRequestBody,
  executeErasure,
  listDataRequests,
  refuseDataRequest,
  refuseRequestBody,
} from './admin/data-requests.ts';
import { createDataRequest, dataRequestBody, listOwnDataRequests } from './auth/data-requests.ts';
import { enrolmentBody, listUsers, patchEnrolment, usersQuery } from './admin/users.ts';
import {
  alertsQuery,
  alertSettingsBody,
  getAlertSettings,
  listAlerts,
  markAlertRead,
  patchAlertSettings,
} from './alerts/route.ts';
import {
  getTrainingConsent,
  grantBody,
  grantTrainingConsent,
  withdrawTrainingConsent,
} from './training/consent.ts';
import { counterRequest, handleCounter } from './arguments/counter.ts';
import { acceptTerms, acceptTermsBody, getTerms, patchMe, patchMeBody } from './auth/account.ts';
import { authMiddleware, profileIdFor, requireAuthenticated } from './auth/middleware.ts';
import { handleMagicLinkLanding } from './auth/magic-link-landing.ts';
import { requireAdmin } from './auth/admin.ts';
import { knownAddress, callerIdentity, rateLimit, RATE_LIMITS } from './rate-limit.ts';
import {
  type AuthDeps,
  handleLogout,
  handleMagicLink,
  handleMe,
  handleRefresh,
  handleVerify,
  magicLinkRequest,
  refreshRequest,
  verifyRequest,
} from './auth/routes.ts';
import { getBriefing, listMatterBriefings, markBriefingOpened } from './briefings/route.ts';
import { courtLookupRequest, handleCourtLookup } from './court/lookup.ts';
import { artifactDigest, buildSha, deployedAt } from './build-info.ts';
import { CONTRACT_VERSION, MIN_SUPPORTED_CONTRACT } from './contract-version.ts';
import { getCitationCheck } from './citations/check.ts';
import { copyRequest, recordCopy } from './citations/copies.ts';
import {
  confirmRequest,
  ecourtsRequest,
  handleConfirm,
  handleEcourts,
} from './citations/verify.ts';
import {
  addCitationBody,
  addDocumentCitation,
  getDocument,
  patchDocument,
  patchDocumentBody,
  removeDocumentCitation,
  listDocuments,
} from './documents/route.ts';
import {
  cancelPremiumJob,
  getEntitlements,
  getPremiumJob,
  getPremiumPreview,
  postPremiumJob,
  startJobBody,
} from './premium/route.ts';
import { listDocumentTypes } from './documents/types.ts';
import { fail, ok } from './envelope.ts';
import { capabilityRegistry, parsePlatform } from './release/capabilities.ts';
import { refuseIfDisabled } from './release/enforce.ts';
import { resolveServingEnv } from './ops/serving-contract.ts';
import {
  annotationBody,
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
} from './judgments/annotations.ts';
import { getAuthoritiesAsAt } from './judgments/as-at.ts';
import { getJudgment, judgmentParams } from './judgments/route.ts';
import { getGraph, getTreatment, graphQuery, treatmentQuery } from './judgments/treatment.ts';
import { logger } from './logger.ts';
import {
  addAuthority,
  addAuthorityBody,
  listAuthorities,
  removeAuthority,
} from './matters/authorities.ts';
import {
  createEventBody,
  createMatter,
  createMatterBody,
  createMatterEvent,
  getMatter,
  listMatters,
  patchMatter,
  patchMatterBody,
} from './matters/route.ts';
import {
  createShare,
  eventVisibilityBody,
  listShares,
  revokeShare,
  setEventVisibility,
  shareBody,
} from './matters/shares.ts';
import { handleSearch, searchRequest, type SearchDeps } from './search/route.ts';
import {
  createSavedSearch,
  deleteSavedSearch,
  feedQuery,
  getSavedSearchFeed,
  listSavedSearches,
  savedSearchBody,
} from './search/saved.ts';
import { getCorpusCoverage } from './corpus/coverage.ts';
import { getCorpusFreshness } from './corpus/freshness.ts';
import { buildFreshnessObject } from './corpus/freshness-object.ts';
import { listSections, listStatutes, sectionQuery } from './statutes/route.ts';
import {
  getLinkedJudgments,
  linkedJudgmentsParams,
  linkedJudgmentsQuery,
} from './statutes/linked-judgments.ts';
import { validate } from './validate.ts';
import { withIdempotency } from './idempotency.ts';

/**
 * What `GET /ready` reports. Every field is OBSERVED on the request, never
 * remembered from boot — a readiness probe that replays a startup verdict says
 * the deployment was fine once, which is not the question a load balancer asks.
 */
export type ReadinessReport = {
  /** Both roles answered a trivial statement. */
  corpusReachable: boolean;
  userReachable: boolean;
  /**
   * `single` or `split`, and whether the two handles were PROVEN to be two
   * databases by `(system_identifier, current_database())`. `null` in single
   * mode, where there is nothing to prove and a `true` would be a lie.
   */
  splitMode: 'single' | 'split';
  rolesDistinct: boolean | null;
  /** From `serving-contract.ts`. A serving deployment that got here has zero. */
  servingEnv: string;
  /**
   * N-4. Whether the corpus has been warmed on the serving path since this
   * process started — `ops/prewarm.ts`.
   *
   * `undefined` in a deployment that supplies no prewarm (tests, and any
   * single-database local run), where it is deliberately NOT treated as a
   * failure: absent and cold are different states and only one of them should
   * hold traffic back.
   */
  corpusWarm?: 'cold' | 'warming' | 'warm' | 'failed' | undefined;
  detail?: string | undefined;
};

export type AppDeps = {
  /** Injected so the health check can be exercised without a live server. */
  ping: () => Promise<void>;
  /**
   * Readiness, as distinct from liveness.
   *
   * `/health` answers "is this container able to serve traffic" and pings ONE
   * handle. Under the physical split that is half the serving plane: a user
   * database that has gone away leaves `/health` green and every matter route
   * 500ing. Absent in tests and in single-database deployments that never
   * supplied one, where `/ready` says so rather than inventing a verdict.
   */
  readiness?: (() => Promise<ReadinessReport>) | undefined;
  /** Absent in tests that do not exercise search. */
  search?: SearchDeps | undefined;
  /** Absent in tests that do not exercise authentication. */
  auth?: AuthDeps | undefined;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('*', requestId());

  // Reads the bearer token and records who is calling. It never rejects — each
  // route states its own requirement, because they genuinely differ and a central
  // list of exempt paths is a list that silently gains entries.
  if (deps.auth) app.use('*', authMiddleware(deps.auth.secret));

  // One log line per request, carrying request_id. Every later route inherits it.
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    logger.info({
      request_id: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: Math.round(performance.now() - started),
    });
  });

  app.get('/health', async (c) => {
    const started = performance.now();
    try {
      await deps.ping();
      return ok(c, {
        status: 'ok',
        sha: buildSha,
        database: { reachable: true, latencyMs: Math.round(performance.now() - started) },
      });
    } catch (error) {
      // 503, not 200: a health check that stays green while the database is
      // unreachable is worse than no health check — Railway would keep routing to it.
      // The envelope holds even here; the SHA rides in the message rather than
      // growing a second success-shaped field on a failure response.
      logger.error({ request_id: c.get('requestId'), err: error }, 'health: database unreachable');
      return fail(c, 'DATABASE_UNREACHABLE', `database is not reachable (build ${buildSha})`, 503);
    }
  });

  /**
   * REB §1.3 — "expose deployed Git SHA, build provenance, relevant
   * build/version metadata." Deliberately separate from `/health`: `/health`
   * answers "is this container able to serve traffic", `/version` answers
   * "which code is this, and when did it get here" — different questions,
   * and a caller checking deploy integrity should not have to parse a
   * healthcheck's error path to get an honest answer to the second one.
   *
   * `gitSha`/`deployedAt` are exactly `build-info.ts`'s values — no new
   * resolution logic, so this cannot disagree with what `/health` already
   * reports. `imageDigest` and signed build provenance are NOT provided:
   * `railway.json` uses Railpack, not a Dockerfile this project controls the
   * build of, and nothing here computes or receives a content-addressed
   * digest. Recorded as a known gap rather than guessed at —
   * `docs/ai/V2_RECONCILIATION.md`.
   */
  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * READINESS IS A DIFFERENT QUESTION FROM LIVENESS, AND UNDER A SPLIT IT SHOWS
   * ─────────────────────────────────────────────────────────────────────────────
   *
   * `/health` pings the CORPUS handle. After R28 that is half the serving plane:
   * a user database that has gone away leaves `/health` green, the deployment in
   * rotation, and every matter, annotation and sign-in route 500ing. A probe
   * that cannot see that is a probe that keeps routing traffic into an outage.
   *
   * 503 when a role is unreachable or a declared split is not really two
   * databases. A load balancer may read this; nothing here is user-facing and
   * nothing here says anything about the law.
   */
  app.get('/ready', async (c) => {
    if (!deps.readiness) {
      return fail(
        c,
        'READINESS_NOT_CONFIGURED',
        `this process supplied no readiness probe (build ${buildSha}) — use /health for liveness`,
        503,
      );
    }
    try {
      const report = await deps.readiness();
      /**
       * N-4 — READINESS WAITS FOR WARM, WHICH IS THE POINT OF FIXING IT AT ALL.
       *
       * Gate C: "Corpus prewarm is a manual step; an unattended restart serves
       * cold until traffic warms it." An automated prewarm that did not gate
       * readiness would still let a load balancer send the first advocate into a
       * cold corpus — 6.5 s cold against 0.6 s warm, measured — and that advocate
       * is exactly who the mechanism exists to protect.
       *
       * `'warming'` and `'cold'` hold readiness. `'warm'` releases it. `'failed'`
       * ALSO releases it, and that asymmetry is deliberate: a prewarm that could
       * not run is a performance problem, and refusing to serve at all because the
       * corpus is slow would convert a latency defect into an outage. The failure
       * is logged at error level and reported in this response, so it is loud
       * rather than absorbed.
       *
       * `undefined` — no prewarm supplied — releases it too. Absent is not cold.
       */
      const warmEnough = report.corpusWarm !== 'cold' && report.corpusWarm !== 'warming';
      const ready =
        report.corpusReachable &&
        report.userReachable &&
        (report.splitMode === 'single' || report.rolesDistinct === true) &&
        warmEnough;
      if (!ready) {
        /**
         * A warming corpus is not a failure, and logging it as one is how a real
         * readiness error gets ignored. Every boot would emit `readiness failed`
         * for the ~60 s the warm pass takes, and an operator who has seen that a
         * hundred times stops reading it — which is the exact condition under
         * which the genuine one arrives.
         */
        const startingUp = !warmEnough && report.corpusReachable && report.userReachable;
        const line = { request_id: c.get('requestId'), readiness: report };
        if (startingUp) logger.info(line, 'not ready yet: corpus is still warming');
        else logger.error(line, 'readiness failed');
        return fail(
          c,
          'NOT_READY',
          `this deployment is not ready to serve (build ${buildSha})`,
          503,
          {
            ...report,
          },
        );
      }
      return ok(c, { status: 'ready', sha: buildSha, ...report });
    } catch (error) {
      logger.error({ request_id: c.get('requestId'), err: error }, 'readiness probe threw');
      return fail(c, 'NOT_READY', `readiness probe failed (build ${buildSha})`, 503);
    }
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * N-5 — ONE SOURCE FOR "WHICH DEPLOYMENT IS THIS", NOT TWO THAT AGREE BY LUCK
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Gate C observed `/version` reporting `environment: "production"` while
   * `/ready` reported `servingEnv: "staging"` on the same box at the same sha.
   * "One label is lying, and it misroutes an incident."
   *
   * Neither was lying. They were answering from **different variables**:
   * `/version` read `RAILWAY_ENVIRONMENT ?? NODE_ENV ?? 'development'`, and
   * `/ready` read the serving contract, which reads `LAWMIND_SERVING_ENV`. Two
   * sources for one question disagree the moment anything sets one and not the
   * other — and on that box something had.
   *
   * Both now derive from `resolveServingEnv`, so the mismatch is not fixed, it is
   * **unrepresentable**: there is one function and `/ready` already called it.
   *
   * `NODE_ENV` is deliberately NOT consulted, and `ops/serving-contract.ts` says
   * why in its own words: it "is read by build tooling, set to `production` by
   * every bundler and process manager for reasons that have nothing to do with
   * who the audience is, and a staging box legitimately runs
   * `NODE_ENV=production`". Reading it here is precisely how `/version` came to
   * claim production on a staging deployment.
   *
   * `RAILWAY_ENVIRONMENT` is gone with it. Railway production is
   * `HISTORICAL / RETIRED`, so that branch could only ever have been dead or
   * wrong, and a dead branch that still outranks the real one is worse than no
   * branch at all.
   *
   * A deployment that declares nothing reads `development` — from one place, and
   * loudly, because `evaluateServingContract` refuses to start a deployment that
   * says it is serving while its configuration says otherwise.
   */
  const environment = resolveServingEnv(process.env);

  app.get('/version', (c) =>
    ok(c, {
      gitSha: buildSha,
      deployedAt,
      environment,
      /**
       * N-2. Populated by the deploy action, `null` when this process cannot
       * prove which artifact it is. Never a placeholder — see `build-info.ts`.
       */
      imageDigest: artifactDigest,
      /**
       * P5.E. Which wire contract this deployment speaks, and the oldest it
       * still answers — so an installed app can say "update me" instead of
       * failing to parse a response, and an operator can see from one endpoint
       * whether a rollback moved the contract. `contract-version.ts` states the
       * rule these two numbers encode.
       */
      contract: CONTRACT_VERSION,
      minSupportedContract: MIN_SUPPORTED_CONTRACT,
    }),
  );

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * WHAT THIS RELEASE CLAIMS — R8.3 §6
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Unauthenticated and beside `/version` on purpose. A client must be able to
   * discover what the server will refuse BEFORE it renders a screen that offers
   * it, and a build that cannot reach this endpoint has no business assuming
   * anything is enabled.
   *
   * This is the mechanism that lets a LIMITED V1 unlock client work without
   * pretending broad semantic passed: RCC branches on the registry rather than
   * on a feature flag, and NEW3's acceptance runs against it rather than against
   * a screenshot.
   */
  // §9.5's claims register is PER PLATFORM. A caller that sends no platform gets
  // the release-wide set, byte-identical to what it always returned.
  app.get('/release/capabilities', (c) => {
    const raw = c.req.header('x-lawmind-platform') ?? c.req.query('platform');
    return ok(c, raw === undefined ? capabilityRegistry() : capabilityRegistry(parsePlatform(raw)));
  });

  const auth = deps.auth;
  if (auth) {
    // Answers identically whether or not the address has an account: a different
    // reply for a known email turns this into a membership oracle, and for this
    // customer base the membership list is a client list.
    /**
     * ───────────────────────────────────────────────────────────────────────
     * P5.B — THE MAIL CANNON, CLOSED
     * ───────────────────────────────────────────────────────────────────────
     *
     * This endpoint sends an email through Resend to any address a stranger
     * types, and it deliberately answers identically for known and unknown
     * addresses (the note above says why). Both properties are right; together
     * and unlimited they are a free mail cannon aimed at third parties and at
     * our sending reputation.
     *
     * TWO keys, because they stop different attacks: per-EMAIL stops one
     * address being flooded, per-ADDRESS stops one client walking a list.
     * `rate-limit.ts` records why the second is the weaker of the two.
     *
     * The email is read from the already-validated body, so a malformed request
     * is a 400 before it can occupy a bucket.
     */
    app.use(
      '/auth/magic-link',
      rateLimit({
        name: 'magic-link-email',
        ...RATE_LIMITS.magicLinkPerEmail,
        key: async (c) => {
          const body = await c.req.raw
            .clone()
            .json()
            .catch(() => null);
          const email = (body as { email?: unknown } | null)?.email;
          return typeof email === 'string' ? email.toLowerCase() : 'unparseable';
        },
      }),
    );
    app.use(
      '/auth/magic-link',
      rateLimit({
        name: 'magic-link-address',
        ...RATE_LIMITS.magicLinkPerAddress,
        // Null when no proxy has told us who is calling — see `callerIdentity`.
        // A shared "everyone we cannot identify" bucket locks out honest callers
        // and does not stop an abuser, who simply rotates the header.
        key: (c) => knownAddress(c),
      }),
    );
    // Token exchange and refresh — credential grinding, not mail.
    app.use(
      '/auth/verify',
      rateLimit({
        name: 'auth-verify',
        ...RATE_LIMITS.authPerAddress,
        key: (c) => knownAddress(c),
      }),
    );
    app.use(
      '/auth/refresh',
      rateLimit({
        name: 'auth-refresh',
        ...RATE_LIMITS.authPerAddress,
        key: (c) => knownAddress(c),
      }),
    );
    app.post('/auth/magic-link', validate('json', magicLinkRequest), (c) =>
      handleMagicLink(c, auth, c.req.valid('json')),
    );
    /**
     * WHERE THE EMAILED LINK LANDS. The ONE route the sign-in email points at,
     * and the reason it exists at all is that until 18 Sep 2026 nothing did:
     * better-auth minted `/api/auth/magic-link/verify` against
     * `AUTH_BASE_URL` and this API served a 404 there, so on the alpha an
     * advocate who followed the email could not sign in at all
     * (`docs/ai/rcc-r31/ROUND.md`, `docs/ai/lcc-r33/ROUND.md`).
     *
     * The path is written out rather than imported from
     * `MAGIC_LINK_LANDING_PATH`, because `scripts/check-contract-status.mjs`
     * reads this file as TEXT and a constant is invisible to it — an unmounted
     * route is exactly what that guard exists to catch. The join to the mailer
     * is therefore enforced where it is real instead: `magic-link-landing.test`
     * requests the URL the MAILER was handed, so the two drifting apart fails a
     * test rather than an advocate's sign-in.
     *
     * NOT rate limited, deliberately. It reads nothing, writes nothing and
     * decides nothing: it hands a token to the app, and `POST /auth/verify`
     * (which IS limited) is where a grinder meets resistance. A limiter here
     * would only add a way for an honest advocate behind a shared address to be
     * refused their own sign-in link.
     *
     * The mail-cannon limiters above are mounted on `/auth/magic-link` exactly,
     * not `/auth/magic-link/*`, so this sub-path does not consume their buckets
     * — `magic-link-landing.test.ts` asserts that rather than trusting it.
     */
    app.get('/auth/magic-link/open', (c) => handleMagicLinkLanding(c));
    app.post('/auth/verify', validate('json', verifyRequest), (c) =>
      handleVerify(c, auth, c.req.valid('json')),
    );
    app.post('/auth/refresh', validate('json', refreshRequest), (c) =>
      handleRefresh(c, auth, c.req.valid('json')),
    );
    app.post('/auth/logout', (c) => handleLogout(c, auth, c.get('authId')));
    app.get('/me', (c) => handleMe(c, auth, c.get('authId'), c.get('authEmail')));
    // The call that turns a verified email into an advocate: it creates the
    // `users` row, because it is the first point at which a name and a phone
    // number exist. PD-2 — the enrolment number is captured and gates nothing.
    app.patch(
      '/me',
      requireAuthenticated('sign in to continue'),
      validate('json', patchMeBody),
      (c) => patchMe(c, auth.sql, c.get('authId'), c.get('authEmail'), c.req.valid('json')),
    );
    // PD-8. Consent is recorded, never inferred, and the version is stored
    // alongside the timestamp so that WHICH text was accepted stays answerable.
    app.get('/terms/current', (c) => getTerms(c));
    /**
     * DPDP intake — the half `admin/data-requests.ts` said was missing.
     *
     * Creating a request is all this does. Erasure EXECUTES from the admin
     * surface only: it is irreversible, it destroys rows other advocates'
     * shares depend on, and a mis-tap on a phone must not be able to do it.
     */
    /**
     * R16 — `Idempotency-Key` is honoured here and on five other creates. It is
     * OPTIONAL: a request without it behaves exactly as it did under R15.
     * `idempotency.ts` holds the mechanism and the reasoning; the route template
     * is passed as a literal rather than read from the router so that the scope a
     * key lives in is answerable by reading this file.
     */
    app.post(
      '/me/data-requests',
      /**
       * N-7. Gated on the IDENTITY, which is exactly right here and is the
       * reason `requireAuthenticated` checks `authId` rather than the profile:
       * an `identity_only` advocate must be able to ask for erasure, and the
       * handler below deliberately resolves both identifiers to let them.
       */
      requireAuthenticated('Sign in to make a data request about your account.'),
      validate('json', dataRequestBody),
      async (c) => {
        /**
         * BOTH identifiers, and the ORDER of the two lines is the whole fix.
         *
         * `authId` is the principal: it exists the moment an email is verified.
         * `userId` is the profile, and it is `undefined` for an `identity_only`
         * advocate who never finished onboarding. This route used to resolve only
         * the profile and answer 401 to a real, authenticated account — the
         * defect RCC reported at bus 1722 — which meant the product demanded more
         * personal data as the price of deleting personal data.
         */
        const authId = c.get('authId');
        const userId = await profileIdFor(auth.sql, authId);
        const body = c.req.valid('json');
        return withIdempotency(
          c,
          auth.sql,
          { authId, userId, route: '/me/data-requests', body },
          (tx) => createDataRequest(c, tx, authId, userId, body),
        );
      },
    );
    app.get('/me/data-requests', (c) => listOwnDataRequests(c, auth.sql, c.get('authId')));
    app.post(
      '/me/accept-terms',
      requireAuthenticated('Sign in to accept the terms.'),
      validate('json', acceptTermsBody),
      (c) => acceptTerms(c, auth.sql, c.get('authId'), c.req.valid('json')),
    );
  }

  const search = deps.search;
  if (search) {
    /**
     * `sql` keeps its name and its meaning for every CORPUS read below.
     * `userSql` is the USER role and defaults to it, so a single-database
     * deployment — and every test and CLI that passes one handle — behaves
     * exactly as before. See `SearchDeps.userSql` and `ops/db-roles.ts`.
     */
    const sql = search.sql;
    const userSql = search.userSql ?? search.sql;
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * WHICH HANDLE A ROUTE GETS IS NOW A DECISION, NOT A DEFAULT
     * ─────────────────────────────────────────────────────────────────────────
     *
     * R28. Until this round `sql` was passed to every route below and the two
     * names existed for four of them. That is invisible on one database and
     * total on two: measured against a physically split pair with each role's
     * tables removed from the other, thirteen of the current-v1 routes answered
     * `500` naming a missing relation — `matters`, `documents`,
     * `saved_searches`, `judgment_annotations`, `citation_checks`, `users` —
     * including `GET /matters`, `POST /matters`, `/search` and every admin
     * surface, because `requireAdmin` reads `users`.
     *
     * The rule below is mechanical and `ops/db-roles.ts` is the authority for
     * it: a handler is passed `userSql` when the tables it owns are user
     * tables, `sql` when they are corpus tables, and BOTH — user handle first,
     * corpus handle trailing — when it genuinely needs the two. There is no
     * fallback: a handler given the wrong one fails, loudly, which is the point.
     * `scripts/lcc-db-role-audit.mjs` derives the roles each module needs
     * straight from its SQL, and `db-role-wiring.test.ts` fails when a module
     * appears that nothing here has decided about.
     */
    /**
     * The profile id for the caller, or undefined.
     *
     * Routes below own data that belongs to an advocate, not to an email address,
     * so they resolve `users.id` rather than the identity id. An identity that
     * has not finished onboarding has no profile and these correctly behave as
     * signed out — there is no row to attach the write to.
     *
     * **`userSql`, not `sql`.** `users` is a USER table — `ops/db-roles.ts` lists
     * it under identity — so resolving it through the CORPUS role is a read of a
     * table that role does not own. In single-database mode the two handles are
     * the same object and nothing changes; under the physical split the corpus
     * generation has no `users` at all, and every authenticated route answered
     * `500 relation "users" does not exist`. Found while building the R17
     * split-role suite, which could not authenticate a single request.
     */
    const userFor = (c: Context) => profileIdFor(userSql, c.get('authId'));

    /**
     * ─────────────────────────────────────────────────────────────────────────
     * EVERY `/admin/*` ROUTE, DENIED UNLESS `users.role = 'admin'`
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Mounted BEFORE the routes it protects, on the prefix rather than on each
     * one, so an admin endpoint added later is covered by existing. Until today
     * every route below gated on "is anyone signed in", which meant any advocate
     * who completed sign-up could read the audit ledger and flip a kill switch —
     * `auth/admin.ts` carries the full note and `admin/audit.ts` had documented
     * the gap since it was written.
     *
     * Conditional on `deps.auth` only because a test app constructed without
     * authentication has no way to BE an admin; those tests already assert the
     * unauthenticated behaviour of these routes.
     */
    /* `users` is a USER table, so the gate protecting every admin route was
     * itself the first thing to fail under the split — every `/admin/*` route
     * answered 500 before its handler ran. */
    if (deps.auth) app.use('/admin/*', requireAdmin(userSql));

    /**
     * P5.B for the expensive half. `search/admission.ts` caps how many searches
     * run AT ONCE, which protects the database; this caps how many one caller
     * may run over time, which is the difference between an advocate reading
     * results and a client harvesting the corpus.
     */
    app.use(
      '/search',
      rateLimit({
        name: 'research',
        ...RATE_LIMITS.researchPerIdentity,
        key: (c) => callerIdentity(c),
      }),
    );
    app.use(
      '/arguments/counter',
      rateLimit({
        name: 'research',
        ...RATE_LIMITS.researchPerIdentity,
        key: (c) => callerIdentity(c),
      }),
    );
    app.post('/search', validate('json', searchRequest), (c) =>
      handleSearch(c, search, c.req.valid('json')),
    );
    // The reading view's route. Without it a judgment found by search could not
    // be opened, and the reading view could only be exercised against fixtures.
    app.get('/judgments/:id', validate('param', judgmentParams), (c) =>
      getJudgment(c, sql, c.req.valid('param').id, userSql),
    );
    // Treatment analysis and the precedent graph. Both read judgment_citations
    // and state what courts DID — never what a court will do.
    app.get('/judgments/:id/treatment', validate('query', treatmentQuery), (c) =>
      getTreatment(c, sql, c.req.param('id'), c.req.valid('query')),
    );
    app.get('/judgments/:id/graph', validate('query', graphQuery), (c) =>
      getGraph(c, sql, c.req.param('id'), c.req.valid('query')),
    );
    // Was each authority this judgment relied on still good law ON THE DAY it
    // was delivered? States facts with two judgment ids behind them, never a
    // soundness rating.
    app.get('/judgments/:id/authorities', (c) => getAuthoritiesAsAt(c, sql, c.req.param('id')));
    // Highlight and save, PD-9 item 3. Anchored on the PRINTED paragraph number,
    // never on position — a re-ingest that moves a paragraph must not silently
    // relocate an advocate's note.
    app.get('/judgments/:id/annotations', async (c) =>
      listAnnotations(c, userSql, c.req.param('id'), await userFor(c)),
    );
    // R16. The judgment id is a PATH PARAMETER and so rides in the fingerprint:
    // one key reused against a second judgment is a mismatch, not a replay.
    app.post(
      '/judgments/:id/annotations',
      requireAuthenticated('annotations belong to an advocate — sign in to continue'),
      validate('json', annotationBody),
      async (c) => {
        const userId = await userFor(c);
        const judgmentId = c.req.param('id');
        const body = c.req.valid('json');
        /* `api_idempotency_records` is a USER table, and the transaction the
         * handler runs inside is therefore a USER transaction. The corpus handle
         * rides alongside it rather than inside it — there is no cross-database
         * transaction and R28 does not invent one. */
        return withIdempotency(
          c,
          userSql,
          {
            authId: c.get('authId'),
            userId,
            route: '/judgments/:id/annotations',
            params: { id: judgmentId },
            body,
          },
          (tx) => createAnnotation(c, tx, judgmentId, userId, body, sql),
        );
      },
    );
    app.delete('/annotations/:annotationId', async (c) =>
      deleteAnnotation(c, userSql, c.req.param('annotationId'), await userFor(c)),
    );
    // Counter-arguments. Grounded in retrieved corpus authorities only; set_aside
    // authorities are excluded AND named, never silently dropped.
    app.post(
      '/arguments/counter',
      validate('json', counterRequest),
      (c) =>
        // R8.3 §5.6 / §6. `generation.counterarguments` is DISABLED: the adverse
        // authority that would change the argument is exactly the one that did not
        // get ranked, and `adverse_authority` scores 0 for every representation
        // arm tested. The registry refuses the ROUTE here rather than letting it
        // produce a confident answer from a set nothing vouches for.
        refuseIfDisabled(c, 'search.semantic.counterarguments') ??
        handleCounter(
          c,
          {
            sql,
            /* The `citation_checks` write. Corpus for the ranker, user for the
             * record of what it showed. */
            userSql,
            // The SAME isolation /search gets. Until now this route ran the same
            // ranker on the core pool with no admission slot — see CounterDeps.
            researchSql: search.researchSql,
            admission: search.admission,
            embedQuery: search.embedQuery,
          },
          c.req.valid('json'),
        ),
    );
    // What each verification tier did, and when. Unblocks the verification sheet
    // and the unverified-citation screen, both of which were on a mock because
    // nothing exposed per-tier results.
    app.get('/citations/:id', (c) => getCitationCheck(c, userSql, c.req.param('id'), sql));
    // The advocate at highest risk: somebody who copies a citation into Word has
    // taken it out of the app, and without this row nothing can warn them when
    // the authority moves. Offered in EVERY state including set_aside — refusing
    // the copy would destroy the only record that could reach them.
    app.post(
      '/citations/copies',
      requireAuthenticated('a copy record belongs to an advocate — sign in to continue'),
      validate('json', copyRequest),
      async (c) => recordCopy(c, userSql, await userFor(c), c.req.valid('json'), sql),
    );
    // Tier 3 — the eCourts door. We hand over a URL and the text to paste; the
    // advocate solves the CAPTCHA. Nothing here ever fetches from eCourts.
    app.post('/verify/ecourts', validate('json', ecourtsRequest), (c) =>
      handleEcourts(c, c.req.valid('json')),
    );
    // R16. Tier 3 is still a human solving the CAPTCHA and vouching — nothing
    // about idempotency touches that. It stops a retried vouch from appending a
    // second permanent `citation_checks` row.
    app.post(
      '/verify/confirm',
      requireAuthenticated('a Tier 3 confirmation must be attributable — sign in to continue'),
      validate('json', confirmRequest),
      async (c) => {
        const userId = await userFor(c);
        const body = c.req.valid('json');
        return withIdempotency(
          c,
          userSql,
          { authId: c.get('authId'), userId, route: '/verify/confirm', body },
          (tx) => handleConfirm(c, tx, userId, body, sql),
        );
      },
    );
    // Saved searches — an in-app feed, never a notification. PD-5/PD-6: nothing
    // here emits anything, and `unseenCount` is for ordering, never a badge.
    app.get('/saved-searches', async (c) => listSavedSearches(c, userSql, await userFor(c)));
    app.post(
      '/saved-searches',
      requireAuthenticated('a saved search belongs to an advocate — sign in to continue'),
      validate('json', savedSearchBody),
      async (c) => createSavedSearch(c, userSql, await userFor(c), c.req.valid('json')),
    );
    app.delete('/saved-searches/:id', async (c) =>
      deleteSavedSearch(c, userSql, c.req.param('id'), await userFor(c)),
    );
    app.get('/saved-searches/:id/feed', validate('query', feedQuery), async (c) =>
      getSavedSearchFeed(
        c,
        userSql,
        c.req.param('id'),
        await userFor(c),
        c.req.valid('query'),
        search.embedQuery,
        /* The third caller of hybridSearch, and the last one to get the gate. */
        search.admission,
        /* ...and the ranker it calls runs on the CORPUS role. */
        sql,
      ),
    );
    // Cause list sync health. Built now and useful before a single cause list
    // exists: with the eCourts kill switch off, a retry is REFUSED and the
    // refusal is written to the ledger, which is how the gate is demonstrated
    // rather than asserted. The two privileged routes 401 until auth ships.
    app.get('/admin/cause-lists', validate('query', causeListQuery), (c) =>
      listCauseLists(c, sql, c.req.valid('query')),
    );
    app.post('/admin/cause-lists/:id/retry', async (c) =>
      retryCauseList(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/admin/cause-lists/:id/escalate', validate('json', escalateBody), async (c) =>
      escalateCauseList(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // Disputed citations — "the trust feedback loop. Outranks everything else
    // in the admin." Uphold delegates to the SAME applyOverruledChange the
    // nightly re-check calls; see admin/disputes.ts for why that must stay one
    // implementation.
    app.get('/admin/disputes', validate('query', disputesQuery), async (c) =>
      listDisputes(c, userSql, await userFor(c), c.req.valid('query')),
    );
    app.get('/admin/disputes/:id', async (c) =>
      getDispute(c, userSql, c.req.param('id'), await userFor(c), sql),
    );
    app.post('/admin/disputes/:id/uphold', validate('json', upholdBody), async (c) =>
      uphold(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/disputes/:id/reject', validate('json', rejectBody), async (c) =>
      reject(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // Platform controls — maintenance, kill switches (SIX, not five —
    // admin/platform.ts's module note), feature flags. Every write here is an
    // audit write first: config and ledger move in one transaction or neither
    // does.
    app.get('/admin/platform', async (c) => getPlatform(c, userSql, await userFor(c)));
    app.post('/admin/platform/maintenance', validate('json', maintenanceBody), async (c) =>
      setMaintenance(c, userSql, await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/platform/kill-switches/:key', validate('json', killSwitchBody), async (c) =>
      setKillSwitch(c, userSql, c.req.param('key'), await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/platform/flags/:key', validate('json', flagBody), async (c) =>
      setFlag(c, userSql, c.req.param('key'), await userFor(c), c.req.valid('json')),
    );
    /**
     * Operational truth a machine can read — `admin/metrics.ts`.
     *
     * Admin-gated like everything else under this prefix, though there is
     * nothing sensitive in it by construction: no query text, no identities.
     * `alerts[]` carries the CONDITIONS as well as the numbers, so a poller as
     * simple as curl+jq is a complete alerting system and no thresholds have to
     * be duplicated into a vendor we have not bought.
     */
    app.get('/admin/metrics', (c) =>
      getMetrics(c, userSql, { admission: search.admission, corpusSql: sql }),
    );
    // The audit ledger — read-only, append-only at the database level.
    app.get('/admin/audit', validate('query', auditQuery), async (c) =>
      listAudit(c, userSql, await userFor(c), c.req.valid('query')),
    );
    // The citation monitor — production aggregates of the harness metrics.
    app.get('/admin/citations', validate('query', citationsMonitorQuery), async (c) =>
      getCitationsMonitor(c, userSql, await userFor(c), c.req.valid('query'), sql),
    );
    // The manual re-check. Synchronous — the contract chose a returned result
    // over a job id to poll, because the job log would have had one consumer.
    // No pusher: an operator reconciling at 3pm must not light up phones; the
    // alert rows are still written, which is the durable truth either way.
    app.post('/admin/overruled-rechecks/run', async (c) =>
      runOverruledRecheck(c, userSql, await userFor(c), sql),
    );
    // No LLM has ever been called from this codebase — see the module note.
    // This reports the true, empty state, not a placeholder.
    app.get('/admin/llm-costs', validate('query', llmCostsQuery), async (c) =>
      getLlmCosts(c, userSql, await userFor(c), c.req.valid('query')),
    );
    // POST /ocr/jobs is still SPECCED, so this queue is honestly empty today.
    app.get('/admin/ocr-queue', validate('query', ocrQueueQuery), async (c) =>
      listOcrQueue(c, userSql, await userFor(c), c.req.valid('query')),
    );
    // PD-2 — enrolment is a credential, not a gate. This endpoint moves
    // enrolment_status and nothing else; nothing in this codebase reads that
    // column to permit or deny a request.
    app.get('/admin/users', validate('query', usersQuery), async (c) =>
      listUsers(c, userSql, await userFor(c), c.req.valid('query')),
    );
    app.patch('/admin/users/:id/enrolment', validate('json', enrolmentBody), async (c) =>
      patchEnrolment(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // DPDP Act obligations — "a visible clock per request." No creation
    // endpoint is specced or built; intake is out of this surface's scope.
    // GET /admin/privacy/coverage is deliberately NOT here — see
    // admin/data-requests.ts's module note and docs/FOUNDER_QUEUE.md.
    app.get('/admin/data-requests', validate('query', dataRequestsQuery), async (c) =>
      listDataRequests(c, userSql, await userFor(c), c.req.valid('query')),
    );
    app.post(
      '/admin/data-requests/:id/complete',
      validate('json', completeRequestBody),
      async (c) =>
        completeDataRequest(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/data-requests/:id/refuse', validate('json', refuseRequestBody), async (c) =>
      refuseDataRequest(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // The irreversible one. Deliberately NOT the same verb as `complete` —
    // see admin/data-requests.ts. Requires a reason, writes audit_log inside the
    // same transaction as the deletes, and RETURNS the R2 keys it could not
    // reach so nobody can report an erasure complete while the files remain.
    app.post('/admin/data-requests/:id/erase', validate('json', eraseRequestBody), async (c) =>
      executeErasure(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // Matters — the retention moat, and what a briefing hangs off. Every
    // statement scopes by user_id in its own WHERE clause rather than through a
    // separate ownership lookup, so there is no path that forgets it. "Does not
    // exist" and "is not yours" answer identically: a matter id that resolves is
    // itself a fact about another advocate's caseload.
    app.get('/matters', async (c) => listMatters(c, userSql, await userFor(c)));
    // R16. `createMatter` takes the pool as a fifth argument so its funnel metric
    // is not written on the transaction that is about to commit.
    app.post(
      '/matters',
      requireAuthenticated('a matter belongs to an advocate — sign in to continue'),
      validate('json', createMatterBody),
      async (c) => {
        const userId = await userFor(c);
        const body = c.req.valid('json');
        return withIdempotency(
          c,
          userSql,
          { authId: c.get('authId'), userId, route: '/matters', body },
          /* The fifth argument is the POOL the fire-and-forget activation write
           * goes to, and it is the USER pool: `activation_events` is user-owned.
           * It was `sql` — the corpus handle — which on a split deployment made
           * the funnel write throw against a database with no such table. */
          (tx) => createMatter(c, tx, userId, body, userSql),
        );
      },
    );
    app.get('/matters/:id', async (c) =>
      getMatter(c, userSql, c.req.param('id'), await userFor(c)),
    );
    app.patch(
      '/matters/:id',
      requireAuthenticated('a matter belongs to an advocate — sign in to continue'),
      validate('json', patchMatterBody),
      async (c) =>
        patchMatter(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // PD-4 — note_visibility defaults to private IN THE COLUMN. An omitted field
    // inserts the SQL keyword DEFAULT, never a value chosen in application code.
    // R16. Same key against two different matters is a mismatch: the matter id is
    // a path parameter and both requests match this one route template.
    app.post(
      '/matters/:id/events',
      requireAuthenticated('a matter belongs to an advocate — sign in to continue'),
      validate('json', createEventBody),
      async (c) => {
        const userId = await userFor(c);
        const matterId = c.req.param('id');
        const body = c.req.valid('json');
        return withIdempotency(
          c,
          userSql,
          {
            authId: c.get('authId'),
            userId,
            route: '/matters/:id/events',
            params: { id: matterId },
            body,
          },
          (tx) => createMatterEvent(c, tx, matterId, userId, body),
        );
      },
    );
    // PD-3 — sharing is PER MATTER, BY INVITATION. There is no chamber-wide
    // endpoint and there must never be one: chamber-wide default sharing is a
    // conflicts hazard, since two advocates in one chamber can be on opposing
    // sides of related matters. Revocation is a timestamp, never a delete.
    app.get('/matters/:id/shares', async (c) =>
      listShares(c, userSql, c.req.param('id'), await userFor(c)),
    );
    app.post(
      '/matters/:id/shares',
      requireAuthenticated('a matter belongs to an advocate — sign in to continue'),
      validate('json', shareBody),
      async (c) =>
        createShare(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.delete('/matters/:id/shares/:shareId', async (c) =>
      revokeShare(c, userSql, c.req.param('id'), c.req.param('shareId'), await userFor(c)),
    );
    // PD-4 — per note, reversibly. The court record always travels; what the
    // advocate thinks about it does not, until they say so.
    app.patch(
      '/matters/:id/events/:eventId',
      requireAuthenticated('a matter belongs to an advocate — sign in to continue'),
      validate('json', eventVisibilityBody),
      async (c) =>
        setEventVisibility(
          c,
          userSql,
          c.req.param('id'),
          c.req.param('eventId'),
          await userFor(c),
          c.req.valid('json'),
        ),
    );
    // Authorities saved to a matter. `set_aside` refuses the write and names
    // the replacement — the one authority Lawmind refuses to let be used at
    // all — enforced here so it cannot be styled away client-side.
    // `docs/SCHEMA_TRUTH.md` §matter_authorities.
    app.get('/matters/:id/authorities', async (c) =>
      listAuthorities(c, userSql, c.req.param('id'), await userFor(c), sql),
    );
    app.post(
      '/matters/:id/authorities',
      requireAuthenticated('a matter belongs to an advocate — sign in to continue'),
      validate('json', addAuthorityBody),
      async (c) =>
        addAuthority(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json'), sql),
    );
    app.delete('/matters/:id/authorities/:authorityId', async (c) =>
      removeAuthority(c, userSql, c.req.param('id'), c.req.param('authorityId'), await userFor(c)),
    );
    // Citator alerts — PD-5/PD-6. The app does not grow a notifications tab:
    // this feeds the briefing's "since yesterday" block, and `since` lets a
    // client re-read a window it already saw. `overruled_status` is re-read
    // LIVE per alert, same rule as the briefing below.
    app.get('/alerts', validate('query', alertsQuery), async (c) =>
      listAlerts(c, userSql, await userFor(c), c.req.valid('query'), sql),
    );
    app.post('/alerts/:id/read', async (c) =>
      markAlertRead(c, userSql, c.req.param('id'), await userFor(c)),
    );
    // Trigger 2 (filed_citation_moved) has no settings key and cannot be
    // disabled — .strict() on the body schema rejects any attempt to send one.
    app.get('/me/alert-settings', async (c) => getAlertSettings(c, userSql, await userFor(c)));
    app.patch(
      '/me/alert-settings',
      requireAuthenticated('alert settings belong to an advocate — sign in to continue'),
      validate('json', alertSettingsBody),
      async (c) => patchAlertSettings(c, userSql, await userFor(c), c.req.valid('json')),
    );
    /**
     * Training consent — SEPARATE from the PD-8 onboarding consent above, per
     * DPDP Act 2023 s. 6's requirement that consent be specific to a purpose.
     *
     * **DELETE sits beside POST deliberately.** s. 6(4)-(6): withdrawal must be
     * as easy as granting. It is one call on the same path, it needs nobody's
     * approval, and it is not a support ticket.
     */
    app.get('/me/training-consent', async (c) => getTrainingConsent(c, userSql, await userFor(c)));
    // R16. A grant is a `users` update AND a `training_consent_events` append, so
    // the handler opens its own transaction; under a key that becomes a savepoint
    // inside this one. `atomically` is what makes both spellings work.
    app.post(
      '/me/training-consent',
      requireAuthenticated('training consent belongs to an advocate — sign in to continue'),
      validate('json', grantBody),
      async (c) => {
        const userId = await userFor(c);
        const body = c.req.valid('json');
        return withIdempotency(
          c,
          userSql,
          { authId: c.get('authId'), userId, route: '/me/training-consent', body },
          (tx) => grantTrainingConsent(c, tx, userId, body),
        );
      },
    );
    app.delete('/me/training-consent', async (c) =>
      withdrawTrainingConsent(c, userSql, await userFor(c)),
    );
    // The 24-hour briefing — the wedge. `overruled_status` is re-read LIVE on
    // every render and is never served from the cached content: a briefing is
    // read standing outside court, which is the worst moment to be shown law
    // that moved after last night's sweep.
    app.get('/briefings/:id', async (c) =>
      getBriefing(c, userSql, c.req.param('id'), await userFor(c), sql),
    );
    app.get('/matters/:id/briefings', async (c) =>
      listMatterBriefings(c, userSql, c.req.param('id'), await userFor(c)),
    );
    app.post('/briefings/:id/opened', async (c) =>
      markBriefingOpened(c, userSql, c.req.param('id'), await userFor(c)),
    );
    // The vendor-agnostic court adapter. Returns available:false today and the
    // client falls back to the manual form — which is FIRST-CLASS (PD-12), not a
    // fallback: next dates are given orally in open court. Nothing above this
    // endpoint changes when OD-1 resolves.
    app.post('/court/lookup', validate('json', courtLookupRequest), (c) =>
      handleCourtLookup(c, sql, c.req.valid('json')),
    );
    // Drafting. PD-7 — PATCH takes paragraph prose only and rejects 422 on any
    // citation divergence: the client's lock glyph is presentation, this is the
    // enforcement. A hand-edited citation is the hallucination failure arriving
    // through a different door. Changing an authority goes through the citations
    // route, which takes a judgmentId and never a string.
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * PREMIUM — PROVISIONAL, ADDITIVE, AND OFF BY DEFAULT
     * ─────────────────────────────────────────────────────────────────────────
     *
     * NEW3 owns the paywall; the server owns whether it is TRUE. Every route
     * here is behind a `platform_config` flag that defaults OFF, so mounting
     * them changes nothing for any existing client until somebody deliberately
     * turns one on — a client carrying a paywall screen must never imply the
     * backend will serve it. `premium/gate.ts`.
     *
     * `GET /me/entitlements` is the ONLY premium truth a client may read. A
     * premium flag sent BY a client is a fact about what an app believes, and an
     * app can believe things because it is stale, jailbroken, or replaying a
     * receipt.
     */
    app.get('/me/entitlements', async (c) => getEntitlements(c, userSql, await userFor(c)));
    app.get('/matters/:id/premium-preview', async (c) =>
      getPremiumPreview(c, userSql, c.req.param('id'), await userFor(c), sql),
    );
    app.post(
      '/premium/jobs',
      requireAuthenticated('a generation job belongs to an advocate — sign in to continue'),
      validate('json', startJobBody),
      async (c) =>
        // R8.3 §5.4/§5.6. Premium generation is not required for LIMITED V1 and
        // every generation route depends on a semantic evidence set that is off.
        // Guarded at ADMISSION rather than at read: an already-running job may
        // still be polled and cancelled, and refusing those would strand a job a
        // user started before the freeze.
        refuseIfDisabled(c, 'generation.premium_jobs') ??
        (await postPremiumJob(c, userSql, await userFor(c), c.req.valid('json'))),
    );
    app.get('/premium/jobs/:id', async (c) =>
      getPremiumJob(c, userSql, c.req.param('id'), await userFor(c)),
    );
    app.post('/premium/jobs/:id/cancel', async (c) =>
      cancelPremiumJob(c, userSql, c.req.param('id'), await userFor(c)),
    );
    app.get('/documents/types', (c) => listDocumentTypes(c));
    // The advocate's drafts, newest first. ADDITIVE — the Drafts tab could not
    // list anything because GET /documents/:id needs an id the client had no
    // way to obtain.
    app.get('/documents', async (c) => listDocuments(c, userSql, await userFor(c)));
    app.get('/documents/:id', async (c) =>
      getDocument(c, userSql, c.req.param('id'), await userFor(c), sql),
    );
    app.patch(
      '/documents/:id',
      requireAuthenticated('a document belongs to an advocate — sign in to continue'),
      validate('json', patchDocumentBody),
      async (c) =>
        patchDocument(c, userSql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.post(
      '/documents/:id/citations',
      requireAuthenticated('a document belongs to an advocate — sign in to continue'),
      validate('json', addCitationBody),
      async (c) =>
        addDocumentCitation(
          c,
          userSql,
          c.req.param('id'),
          await userFor(c),
          c.req.valid('json'),
          sql,
        ),
    );
    app.delete('/documents/:id/citations/:citationCheckId', async (c) =>
      removeDocumentCitation(
        c,
        userSql,
        c.req.param('id'),
        c.req.param('citationCheckId'),
        await userFor(c),
      ),
    );
    // Bare acts. Additions to the frozen contract, not changes to it.
    // Coverage per court — what we hold against what exists. An ADDITION to the
    // frozen contract. `CLAUDE.md`: silence about a gap does the same damage as
    // a fabricated citation, and today every judgment we hold is Supreme Court.
    app.get('/corpus/coverage', (c) => getCorpusCoverage(c, sql));
    // How CURRENT what we hold is, as against how MUCH of it we hold. Also an
    // ADDITION. It reports the naive `max(judgment_date)` reading next to the
    // honest completeness ratio, because the naive one is what anybody computes
    // for themselves and the only way to stop it being believed is to show it
    // losing: 8 days against a real 56.
    app.get('/corpus/freshness', (c) => getCorpusFreshness(c, sql));
    /**
     * The STRUCTURED freshness object. An ADDITION beside `/corpus/freshness`,
     * not a change to it — that endpoint's shape is consumed already.
     *
     * It exists because `/corpus/freshness` reports our side only, and NEW2's
     * decomposition inverted the diagnosis: upstream wrote the same day, so the
     * gap is OUR ingest and not unpublished law. Recency and completeness are
     * separate fields and there is no combined score, deliberately.
     */
    app.get('/corpus/freshness/object', async (c) => ok(c, await buildFreshnessObject(sql)));

    app.get('/statutes', (c) => listStatutes(c, sql));
    app.get('/statutes/sections', validate('query', sectionQuery), (c) =>
      listSections(c, sql, c.req.valid('query')),
    );
    /**
     * Statute-linked judgments — NEW3 R16 `R16-RCC-08`, LCC R19.
     *
     * Mounted, and REFUSED unless `STATUTE_LINKED_JUDGMENTS_ROUTE=enabled`. It
     * is backend evidence for NEW3's acceptance, not a released surface: the
     * capability registry is unchanged, `STATUTE_LINKED_REGISTRY_STATE` stays
     * `POST_V1` on every platform, and there is no navigation to it.
     *
     * An ADDITION to the frozen contract, beside `/statutes` and
     * `/statutes/sections`, not a change to either.
     */
    app.get(
      '/statutes/:statuteId/linked-judgments',
      validate('param', linkedJudgmentsParams),
      validate('query', linkedJudgmentsQuery),
      (c) => getLinkedJudgments(c, sql, c.req.valid('param').statuteId, c.req.valid('query')),
    );
  }

  /**
   * PostgreSQL `57014 query_canceled` — what `statement_timeout` raises.
   *
   * Duck-typed on `code` rather than on an instanceof, because the error crosses
   * a driver boundary and arrives as a plain object often enough that an
   * instanceof check would silently stop matching. A missed match here is not
   * loud: it degrades to the old 500, which is exactly the behaviour being fixed.
   *
   * The nested `cause` walk matters for the same reason `retrieve.ts` has its own
   * copy of this test: a timeout raised inside a `sql.begin()` transaction is
   * re-thrown wrapped, and the outer error carries no `code` of its own.
   */
  function isStatementTimeout(error: unknown): boolean {
    for (let e: unknown = error, depth = 0; e && depth < 4; depth += 1) {
      if (typeof e === 'object' && 'code' in e && (e as { code?: unknown }).code === '57014') {
        return true;
      }
      e = typeof e === 'object' && 'cause' in e ? (e as { cause?: unknown }).cause : null;
    }
    return false;
  }

  app.notFound((c) => fail(c, 'NOT_FOUND', `no route for ${c.req.method} ${c.req.path}`, 404));

  app.onError((error, c) => {
    /**
     * ───────────────────────────────────────────────────────────────────────
     * A STATEMENT TIMEOUT IS A CAPACITY ANSWER, NOT A FAULT — M09
     * ───────────────────────────────────────────────────────────────────────
     *
     * `GET /judgments/:id` returned **500 after 40,024 ms** in the ten-matter
     * replay (M07, `0f4788ed-5399-4891-bc2b-327a71fcf47b`), and the body was
     * `INTERNAL / "something went wrong"` — indistinguishable from a genuine
     * bug in the reader.
     *
     * It was not a bug in the reader. Measured on the same row, this box, at
     * rest: the judgment SELECT plans at cost **2.78** (`Index Scan using
     * judgments_pkey`) and runs in **41 ms cold, 1 ms warm**; the treatment
     * query plans at **5.76** and runs in 3 ms. The document is 42,046
     * characters, 24 kB stored. Nothing about that request is slow.
     *
     * What made it 40 seconds is the queue in front of it. `pools.ts` says it
     * in its own opening comment: *"`postgres.js` then makes every other caller
     * WAIT. Not fail: wait, with no timeout of its own."* `CORE_STATEMENT_TIMEOUT_MS`
     * is 10 s and it bounds a STATEMENT; nothing bounds the wait for a core
     * connection. 40,024 ms against a 10 s statement cap is arithmetically
     * inconsistent with one slow query and entirely consistent with queue wait
     * plus a statement. The two-pool split stopped research starving core; it
     * did not make the core queue finite, and only research has an admission gate.
     *
     * So the advocate is told the server is broken when the true answer is that
     * it is busy. `/search` already gets this right — `SEARCH_BUSY`, 503, with a
     * `Retry-After` — and `pools.ts` argues for it explicitly: an admission gate
     * "makes exceeding it an ANSWER instead of a hang". This gives every other
     * route the same honesty, in one place rather than at thirty call sites.
     *
     * 503 rather than 500 is the load-bearing part. A 500 tells a client to
     * give up and tells an operator to look for a bug; a 503 with `Retry-After`
     * tells both the truth. It is also what keeps a capacity incident visible
     * as a capacity incident in the metrics rather than buried in the 5xx rate.
     */
    if (isStatementTimeout(error)) {
      logger.warn(
        { request_id: c.get('requestId'), path: c.req.path, method: c.req.method },
        'statement timeout — the request exceeded its budget, almost always queue wait under contention',
      );
      c.header('Retry-After', '2');
      return fail(
        c,
        'TIMEOUT',
        'That took longer than we allow and was stopped. Nothing is wrong with the ' +
          'record — the server is busy. Please try again in a moment.',
        503,
      );
    }
    logger.error({ request_id: c.get('requestId'), err: error }, 'unhandled error');
    return fail(c, 'INTERNAL', 'something went wrong', 500);
  });

  return app;
}
