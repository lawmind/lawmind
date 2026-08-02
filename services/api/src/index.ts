import { serve } from '@hono/node-server';
import { createDatabase } from '@lawmind/db';
import { sql } from 'drizzle-orm';

import { createApp } from './app.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

const db = createDatabase(env.databaseUrl());

const app = createApp({
  ping: async () => {
    await db.execute(sql`SELECT 1`);
  },
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info({ port: info.port, env: env.nodeEnv }, 'api listening');
});
