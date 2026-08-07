import { type Context, Hono } from 'hono';
import { requestId } from 'hono/request-id';

import {
  causeListQuery,
  escalateBody,
  escalateCauseList,
  listCauseLists,
  retryCauseList,
} from './admin/cause-lists.ts';
import { counterRequest, handleCounter } from './arguments/counter.ts';
import { acceptTerms, acceptTermsBody, getTerms, patchMe, patchMeBody } from './auth/account.ts';
import { authMiddleware, profileIdFor } from './auth/middleware.ts';
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
import { buildSha } from './build-info.ts';
import { getCitationCheck } from './citations/check.ts';
import {
  confirmRequest,
  ecourtsRequest,
  handleConfirm,
  handleEcourts,
} from './citations/verify.ts';
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
import { handleSearch, searchRequest, type SearchDeps } from './search/route.ts';
import {
  createSavedSearch,
  deleteSavedSearch,
  feedQuery,
  getSavedSearchFeed,
  listSavedSearches,
  savedSearchBody,
} from './search/saved.ts';
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

  const auth = deps.auth;
  if (auth) {
    // Answers identically whether or not the address has an account: a different
    // reply for a known email turns this into a membership oracle, and for this
    // customer base the membership list is a client list.
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
      handleCounter(c, { sql, embedQuery: search.embedQuery }, c.req.valid('json')),
    );
    // What each verification tier did, and when. Unblocks the verification sheet
    // and the unverified-citation screen, both of which were on a mock because
    // nothing exposed per-tier results.
    app.get('/citations/:id', (c) => getCitationCheck(c, sql, c.req.param('id')));
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
    // Bare acts. Additions to the frozen contract, not changes to it.
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
