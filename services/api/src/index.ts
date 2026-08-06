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
   * Warm the embedder in the background, after the port is open.
   *
   * fp32 BGE-M3 is a 2.16GB fetch on a cold container — `.models` is not on a
   * volume, so it is re-fetched on every deploy — and roughly 15s to load once
   * present. Left lazy, the FIRST search after a deploy pays all of it, which is
   * both a poor first request and long enough to look like an outage.
   *
   * Deliberately after `serve` and deliberately not awaited: `/health` must stay
   * answerable while this runs, or Railway's healthcheck fails the deploy and
   * rolls back a container that was working. A failure here is logged and
   * otherwise ignored — `embedQuery` already degrades to lexical-only, so a warm
   * that does not complete costs latency, never correctness.
   */
  const started = Date.now();
  getEmbedder()
    .then((embedder) => embedder.embed(['anticipatory bail']))
    .then(() => {
      logger.info({ warm_ms: Date.now() - started }, 'embedder warm — dense retrieval ready');
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'embedder warm failed — search stays lexical-only');
    });
});
