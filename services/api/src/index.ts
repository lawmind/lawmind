import { serve } from '@hono/node-server';
import { createDatabase } from '@lawmind/db';
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

import { createApp } from './app.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

const db = createDatabase(env.databaseUrl());
const rawSql = postgres(env.databaseUrl(), { max: 10 });

/**
 * A model that will not load must never take the API down.
 *
 * transformers.js throws "Unable to get model file path or buffer" from inside
 * its own async file loader — `at async <anonymous>`, a context nothing awaits.
 * The rejection therefore never reaches the `await` in `embedQuery`, its
 * try/catch cannot see it, and Node's default for an unhandled rejection is to
 * kill the process. That crash-looped production: `api listening`, one healthy
 * `/health`, then dead on the first `/search`.
 *
 * Logging and continuing is the right call HERE specifically, because the only
 * thing that can fail this way is optional: search degrades to lexical-only and
 * every other route is unaffected. This is not a licence to swallow rejections
 * generally.
 */
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection — process kept alive deliberately');
});

/**
 * The query is embedded by the SAME model and dtype as the corpus — see
 * `services/embed/src/embed.ts`. If the model cannot load, search degrades to
 * lexical-only rather than failing: half a hybrid is still a usable search, and
 * an outage that returns nothing looks identical to an empty corpus.
 *
 * The breaker matters because `getEmbedder` caches a rejected promise: without
 * it every subsequent search retries a load that has already failed, paying the
 * timeout each time and emitting another unhandled rejection.
 */
let embedderFailures = 0;
const EMBEDDER_FAILURE_LIMIT = 3;

const embedQuery = async (text: string): Promise<string | null> => {
  if (embedderFailures >= EMBEDDER_FAILURE_LIMIT) return null;
  try {
    const embedder = await getEmbedder();
    const [embedded] = await embedder.embed([text]);
    embedderFailures = 0;
    return embedded ? toVectorLiteral(embedded.vector) : null;
  } catch (error) {
    embedderFailures++;
    logger.error(
      { err: error, failures: embedderFailures },
      embedderFailures >= EMBEDDER_FAILURE_LIMIT
        ? 'query embedding disabled after repeated failures — search is lexical-only until restart'
        : 'query embedding unavailable — falling back to lexical search',
    );
    return null;
  }
};

const app = createApp({
  ping: async () => {
    await db.execute(sql`SELECT 1`);
  },
  search: { sql: rawSql, embedQuery },
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info({ port: info.port, env: env.nodeEnv }, 'api listening');

  /**
   * NO boot-time model warm. Removed after it crash-looped a deploy.
   *
   * The intent was sound — fp32 BGE-M3 is a large fetch on a cold container, so
   * the first search after a deploy otherwise pays all of it. The implementation
   * was not: transformers.js throws "Unable to get model file path or buffer"
   * from inside its own async file loader, and that rejection escapes a
   * `.catch()` on the chain and reaches the process. The API logged
   * `api listening` and then died, repeatedly, without a single request.
   *
   * Warming must not be able to take the process down. Until the model loads
   * reliably on a cold container, `embedQuery` handles this correctly on its own:
   * it catches its own failure and degrades to lexical-only, so an unreachable
   * model is a worse search rather than an outage.
   */
});
