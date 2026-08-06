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
 * The query is embedded by the SAME model and dtype as the corpus — see
 * `services/embed/src/embed.ts`. If the model cannot load, search degrades to
 * lexical-only rather than failing: half a hybrid is still a usable search, and
 * an outage that returns nothing looks identical to an empty corpus.
 */
const embedQuery = async (text: string): Promise<string | null> => {
  try {
    const embedder = await getEmbedder();
    const [embedded] = await embedder.embed([text]);
    return embedded ? toVectorLiteral(embedded.vector) : null;
  } catch (error) {
    logger.error({ err: error }, 'query embedding unavailable — falling back to lexical search');
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
