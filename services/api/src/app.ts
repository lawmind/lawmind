import { Hono } from 'hono';
import { requestId } from 'hono/request-id';

import { buildSha } from './build-info.ts';
import { fail, ok } from './envelope.ts';
import { logger } from './logger.ts';

export type AppDeps = {
  /** Injected so the health check can be exercised without a live server. */
  ping: () => Promise<void>;
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

  app.notFound((c) => fail(c, 'NOT_FOUND', `no route for ${c.req.method} ${c.req.path}`, 404));

  app.onError((error, c) => {
    logger.error({ request_id: c.get('requestId'), err: error }, 'unhandled error');
    return fail(c, 'INTERNAL', 'something went wrong', 500);
  });

  return app;
}
