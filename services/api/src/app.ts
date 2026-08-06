import { Hono } from 'hono';
import { requestId } from 'hono/request-id';

import { buildSha } from './build-info.ts';
import { fail, ok } from './envelope.ts';
import { getJudgment, judgmentParams } from './judgments/route.ts';
import { logger } from './logger.ts';
import { handleSearch, searchRequest, type SearchDeps } from './search/route.ts';
import { listSections, listStatutes, sectionQuery } from './statutes/route.ts';
import { validate } from './validate.ts';

export type AppDeps = {
  /** Injected so the health check can be exercised without a live server. */
  ping: () => Promise<void>;
  /** Absent in tests that do not exercise search. */
  search?: SearchDeps | undefined;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('*', requestId());

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

  const search = deps.search;
  if (search) {
    const sql = search.sql;
    app.post('/search', validate('json', searchRequest), (c) =>
      handleSearch(c, search, c.req.valid('json')),
    );
    // The reading view's route. Without it a judgment found by search could not
    // be opened, and the reading view could only be exercised against fixtures.
    app.get('/judgments/:id', validate('param', judgmentParams), (c) =>
      getJudgment(c, sql, c.req.valid('param').id),
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
