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
import {
  createDataRequest,
  dataRequestBody,
  listOwnDataRequests,
} from './auth/data-requests.ts';
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
import { authMiddleware, profileIdFor } from './auth/middleware.ts';
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
import { buildSha, deployedAt } from './build-info.ts';
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
import { listSections, listStatutes, sectionQuery } from './statutes/route.ts';
import { validate } from './validate.ts';

export type AppDeps = {
  /** Injected so the health check can be exercised without a live server. */
  ping: () => Promise<void>;
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
  app.get('/version', (c) =>
    ok(c, {
      gitSha: buildSha,
      deployedAt,
      environment: process.env['RAILWAY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
      imageDigest: null,
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
          const body = await c.req.raw.clone().json().catch(() => null);
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
      rateLimit({ name: 'auth-verify', ...RATE_LIMITS.authPerAddress, key: (c) => knownAddress(c) }),
    );
    app.use(
      '/auth/refresh',
      rateLimit({ name: 'auth-refresh', ...RATE_LIMITS.authPerAddress, key: (c) => knownAddress(c) }),
    );
    app.post('/auth/magic-link', validate('json', magicLinkRequest), (c) =>
      handleMagicLink(c, auth, c.req.valid('json')),
    );
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
    app.patch('/me', validate('json', patchMeBody), (c) =>
      patchMe(c, auth.sql, c.get('authId'), c.get('authEmail'), c.req.valid('json')),
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
    app.post('/me/data-requests', validate('json', dataRequestBody), async (c) =>
      createDataRequest(c, auth.sql, await profileIdFor(auth.sql, c.get('authId')), c.req.valid('json')),
    );
    app.get('/me/data-requests', async (c) =>
      listOwnDataRequests(c, auth.sql, await profileIdFor(auth.sql, c.get('authId'))),
    );
    app.post('/me/accept-terms', validate('json', acceptTermsBody), (c) =>
      acceptTerms(c, auth.sql, c.get('authId'), c.req.valid('json')),
    );
  }

  const search = deps.search;
  if (search) {
    const sql = search.sql;
    /**
     * The profile id for the caller, or undefined.
     *
     * Routes below own data that belongs to an advocate, not to an email address,
     * so they resolve `users.id` rather than the identity id. An identity that
     * has not finished onboarding has no profile and these correctly behave as
     * signed out — there is no row to attach the write to.
     */
    const userFor = (c: Context) => profileIdFor(sql, c.get('authId'));

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
    if (deps.auth) app.use('/admin/*', requireAdmin(sql));

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
      getJudgment(c, sql, c.req.valid('param').id),
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
      listAnnotations(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/judgments/:id/annotations', validate('json', annotationBody), async (c) =>
      createAnnotation(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.delete('/annotations/:annotationId', async (c) =>
      deleteAnnotation(c, sql, c.req.param('annotationId'), await userFor(c)),
    );
    // Counter-arguments. Grounded in retrieved corpus authorities only; set_aside
    // authorities are excluded AND named, never silently dropped.
    app.post('/arguments/counter', validate('json', counterRequest), (c) =>
      handleCounter(
        c,
        {
          sql,
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
    app.get('/citations/:id', (c) => getCitationCheck(c, sql, c.req.param('id')));
    // The advocate at highest risk: somebody who copies a citation into Word has
    // taken it out of the app, and without this row nothing can warn them when
    // the authority moves. Offered in EVERY state including set_aside — refusing
    // the copy would destroy the only record that could reach them.
    app.post('/citations/copies', validate('json', copyRequest), async (c) =>
      recordCopy(c, sql, await userFor(c), c.req.valid('json')),
    );
    // Tier 3 — the eCourts door. We hand over a URL and the text to paste; the
    // advocate solves the CAPTCHA. Nothing here ever fetches from eCourts.
    app.post('/verify/ecourts', validate('json', ecourtsRequest), (c) =>
      handleEcourts(c, c.req.valid('json')),
    );
    app.post('/verify/confirm', validate('json', confirmRequest), async (c) =>
      handleConfirm(c, sql, await userFor(c), c.req.valid('json')),
    );
    // Saved searches — an in-app feed, never a notification. PD-5/PD-6: nothing
    // here emits anything, and `unseenCount` is for ordering, never a badge.
    app.get('/saved-searches', async (c) => listSavedSearches(c, sql, await userFor(c)));
    app.post('/saved-searches', validate('json', savedSearchBody), async (c) =>
      createSavedSearch(c, sql, await userFor(c), c.req.valid('json')),
    );
    app.delete('/saved-searches/:id', async (c) =>
      deleteSavedSearch(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.get('/saved-searches/:id/feed', validate('query', feedQuery), async (c) =>
      getSavedSearchFeed(
        c,
        sql,
        c.req.param('id'),
        await userFor(c),
        c.req.valid('query'),
        search.embedQuery,
        /* The third caller of hybridSearch, and the last one to get the gate. */
        search.admission,
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
      listDisputes(c, sql, await userFor(c), c.req.valid('query')),
    );
    app.get('/admin/disputes/:id', async (c) =>
      getDispute(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/admin/disputes/:id/uphold', validate('json', upholdBody), async (c) =>
      uphold(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/disputes/:id/reject', validate('json', rejectBody), async (c) =>
      reject(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // Platform controls — maintenance, kill switches (SIX, not five —
    // admin/platform.ts's module note), feature flags. Every write here is an
    // audit write first: config and ledger move in one transaction or neither
    // does.
    app.get('/admin/platform', async (c) => getPlatform(c, sql, await userFor(c)));
    app.post('/admin/platform/maintenance', validate('json', maintenanceBody), async (c) =>
      setMaintenance(c, sql, await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/platform/kill-switches/:key', validate('json', killSwitchBody), async (c) =>
      setKillSwitch(c, sql, c.req.param('key'), await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/platform/flags/:key', validate('json', flagBody), async (c) =>
      setFlag(c, sql, c.req.param('key'), await userFor(c), c.req.valid('json')),
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
    app.get('/admin/metrics', (c) => getMetrics(c, sql, { admission: search.admission }));
    // The audit ledger — read-only, append-only at the database level.
    app.get('/admin/audit', validate('query', auditQuery), async (c) =>
      listAudit(c, sql, await userFor(c), c.req.valid('query')),
    );
    // The citation monitor — production aggregates of the harness metrics.
    app.get('/admin/citations', validate('query', citationsMonitorQuery), async (c) =>
      getCitationsMonitor(c, sql, await userFor(c), c.req.valid('query')),
    );
    // The manual re-check. Synchronous — the contract chose a returned result
    // over a job id to poll, because the job log would have had one consumer.
    // No pusher: an operator reconciling at 3pm must not light up phones; the
    // alert rows are still written, which is the durable truth either way.
    app.post('/admin/overruled-rechecks/run', async (c) =>
      runOverruledRecheck(c, sql, await userFor(c)),
    );
    // No LLM has ever been called from this codebase — see the module note.
    // This reports the true, empty state, not a placeholder.
    app.get('/admin/llm-costs', validate('query', llmCostsQuery), async (c) =>
      getLlmCosts(c, sql, await userFor(c), c.req.valid('query')),
    );
    // POST /ocr/jobs is still SPECCED, so this queue is honestly empty today.
    app.get('/admin/ocr-queue', validate('query', ocrQueueQuery), async (c) =>
      listOcrQueue(c, sql, await userFor(c), c.req.valid('query')),
    );
    // PD-2 — enrolment is a credential, not a gate. This endpoint moves
    // enrolment_status and nothing else; nothing in this codebase reads that
    // column to permit or deny a request.
    app.get('/admin/users', validate('query', usersQuery), async (c) =>
      listUsers(c, sql, await userFor(c), c.req.valid('query')),
    );
    app.patch('/admin/users/:id/enrolment', validate('json', enrolmentBody), async (c) =>
      patchEnrolment(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // DPDP Act obligations — "a visible clock per request." No creation
    // endpoint is specced or built; intake is out of this surface's scope.
    // GET /admin/privacy/coverage is deliberately NOT here — see
    // admin/data-requests.ts's module note and docs/FOUNDER_QUEUE.md.
    app.get('/admin/data-requests', validate('query', dataRequestsQuery), async (c) =>
      listDataRequests(c, sql, await userFor(c), c.req.valid('query')),
    );
    app.post(
      '/admin/data-requests/:id/complete',
      validate('json', completeRequestBody),
      async (c) =>
        completeDataRequest(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.post('/admin/data-requests/:id/refuse', validate('json', refuseRequestBody), async (c) =>
      refuseDataRequest(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // The irreversible one. Deliberately NOT the same verb as `complete` —
    // see admin/data-requests.ts. Requires a reason, writes audit_log inside the
    // same transaction as the deletes, and RETURNS the R2 keys it could not
    // reach so nobody can report an erasure complete while the files remain.
    app.post('/admin/data-requests/:id/erase', validate('json', eraseRequestBody), async (c) =>
      executeErasure(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // Matters — the retention moat, and what a briefing hangs off. Every
    // statement scopes by user_id in its own WHERE clause rather than through a
    // separate ownership lookup, so there is no path that forgets it. "Does not
    // exist" and "is not yours" answer identically: a matter id that resolves is
    // itself a fact about another advocate's caseload.
    app.get('/matters', async (c) => listMatters(c, sql, await userFor(c)));
    app.post('/matters', validate('json', createMatterBody), async (c) =>
      createMatter(c, sql, await userFor(c), c.req.valid('json')),
    );
    app.get('/matters/:id', async (c) => getMatter(c, sql, c.req.param('id'), await userFor(c)));
    app.patch('/matters/:id', validate('json', patchMatterBody), async (c) =>
      patchMatter(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // PD-4 — note_visibility defaults to private IN THE COLUMN. An omitted field
    // inserts the SQL keyword DEFAULT, never a value chosen in application code.
    app.post('/matters/:id/events', validate('json', createEventBody), async (c) =>
      createMatterEvent(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    // PD-3 — sharing is PER MATTER, BY INVITATION. There is no chamber-wide
    // endpoint and there must never be one: chamber-wide default sharing is a
    // conflicts hazard, since two advocates in one chamber can be on opposing
    // sides of related matters. Revocation is a timestamp, never a delete.
    app.get('/matters/:id/shares', async (c) =>
      listShares(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/matters/:id/shares', validate('json', shareBody), async (c) =>
      createShare(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.delete('/matters/:id/shares/:shareId', async (c) =>
      revokeShare(c, sql, c.req.param('id'), c.req.param('shareId'), await userFor(c)),
    );
    // PD-4 — per note, reversibly. The court record always travels; what the
    // advocate thinks about it does not, until they say so.
    app.patch('/matters/:id/events/:eventId', validate('json', eventVisibilityBody), async (c) =>
      setEventVisibility(
        c,
        sql,
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
      listAuthorities(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/matters/:id/authorities', validate('json', addAuthorityBody), async (c) =>
      addAuthority(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.delete('/matters/:id/authorities/:authorityId', async (c) =>
      removeAuthority(c, sql, c.req.param('id'), c.req.param('authorityId'), await userFor(c)),
    );
    // Citator alerts — PD-5/PD-6. The app does not grow a notifications tab:
    // this feeds the briefing's "since yesterday" block, and `since` lets a
    // client re-read a window it already saw. `overruled_status` is re-read
    // LIVE per alert, same rule as the briefing below.
    app.get('/alerts', validate('query', alertsQuery), async (c) =>
      listAlerts(c, sql, await userFor(c), c.req.valid('query')),
    );
    app.post('/alerts/:id/read', async (c) =>
      markAlertRead(c, sql, c.req.param('id'), await userFor(c)),
    );
    // Trigger 2 (filed_citation_moved) has no settings key and cannot be
    // disabled — .strict() on the body schema rejects any attempt to send one.
    app.get('/me/alert-settings', async (c) => getAlertSettings(c, sql, await userFor(c)));
    app.patch('/me/alert-settings', validate('json', alertSettingsBody), async (c) =>
      patchAlertSettings(c, sql, await userFor(c), c.req.valid('json')),
    );
    /**
     * Training consent — SEPARATE from the PD-8 onboarding consent above, per
     * DPDP Act 2023 s. 6's requirement that consent be specific to a purpose.
     *
     * **DELETE sits beside POST deliberately.** s. 6(4)-(6): withdrawal must be
     * as easy as granting. It is one call on the same path, it needs nobody's
     * approval, and it is not a support ticket.
     */
    app.get('/me/training-consent', async (c) => getTrainingConsent(c, sql, await userFor(c)));
    app.post('/me/training-consent', validate('json', grantBody), async (c) =>
      grantTrainingConsent(c, sql, await userFor(c), c.req.valid('json')),
    );
    app.delete('/me/training-consent', async (c) =>
      withdrawTrainingConsent(c, sql, await userFor(c)),
    );
    // The 24-hour briefing — the wedge. `overruled_status` is re-read LIVE on
    // every render and is never served from the cached content: a briefing is
    // read standing outside court, which is the worst moment to be shown law
    // that moved after last night's sweep.
    app.get('/briefings/:id', async (c) =>
      getBriefing(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.get('/matters/:id/briefings', async (c) =>
      listMatterBriefings(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/briefings/:id/opened', async (c) =>
      markBriefingOpened(c, sql, c.req.param('id'), await userFor(c)),
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
    app.get('/me/entitlements', async (c) => getEntitlements(c, sql, await userFor(c)));
    app.get('/matters/:id/premium-preview', async (c) =>
      getPremiumPreview(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/premium/jobs', validate('json', startJobBody), async (c) =>
      postPremiumJob(c, sql, await userFor(c), c.req.valid('json')),
    );
    app.get('/premium/jobs/:id', async (c) =>
      getPremiumJob(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.post('/premium/jobs/:id/cancel', async (c) =>
      cancelPremiumJob(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.get('/documents/types', (c) => listDocumentTypes(c));
    // The advocate's drafts, newest first. ADDITIVE — the Drafts tab could not
    // list anything because GET /documents/:id needs an id the client had no
    // way to obtain.
    app.get('/documents', async (c) => listDocuments(c, sql, await userFor(c)));
    app.get('/documents/:id', async (c) =>
      getDocument(c, sql, c.req.param('id'), await userFor(c)),
    );
    app.patch('/documents/:id', validate('json', patchDocumentBody), async (c) =>
      patchDocument(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.post('/documents/:id/citations', validate('json', addCitationBody), async (c) =>
      addDocumentCitation(c, sql, c.req.param('id'), await userFor(c), c.req.valid('json')),
    );
    app.delete('/documents/:id/citations/:citationCheckId', async (c) =>
      removeDocumentCitation(
        c,
        sql,
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

    app.get('/statutes', (c) => listStatutes(c, sql));
    app.get('/statutes/sections', validate('query', sectionQuery), (c) =>
      listSections(c, sql, c.req.valid('query')),
    );
  }

  app.notFound((c) => fail(c, 'NOT_FOUND', `no route for ${c.req.method} ${c.req.path}`, 404));

  app.onError((error, c) => {
    logger.error({ request_id: c.get('requestId'), err: error }, 'unhandled error');
    return fail(c, 'INTERNAL', 'something went wrong', 500);
  });

  return app;
}
