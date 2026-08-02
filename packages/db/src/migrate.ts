/**
 * Forward-only. Never edit an applied migration; never `drizzle-kit push` at all.
 * `DEPLOYMENT.md` §Migrations.
 */
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { databaseUrl } from './env.ts';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

async function main(): Promise<void> {
  // max: 1 — a migration run must not interleave across connections.
  const client = postgres(databaseUrl(), { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });

    // Verified by querying pg_extension, not by assuming — `sprints/SPRINT_0.md` §2.
    const extensions = await client<{ extname: string }[]>`
      SELECT extname FROM pg_extension ORDER BY extname
    `;
    const names = extensions.map((row) => row.extname);
    if (!names.includes('vector')) {
      throw new Error(`pgvector missing. pg_extension holds: ${names.join(', ')}`);
    }
    console.log(`migrations applied · pg_extension: ${names.join(', ')}`);
  } finally {
    await client.end();
  }
}

await main();
