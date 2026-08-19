/**
 * Materialise EXACT-duplicate groups (shared `content_hash`) into
 * `document_duplicate_groups`/`document_duplicate_members` — Stage 3 of the
 * DATA → RETRIEVAL EXECUTION PROGRAM, `docs/ai/DEDUPLICATION.md`.
 *
 *   pnpm --filter @lawmind/ingest run dedup:materialize [--confirm]
 *
 * `content_hash` is already 100% populated (`docs/ai/tasks/003-corpus-
 * inventory.md`, `backfill-provenance.ts`), so this reads no PDF, fetches
 * nothing, and touches no `judgments` row — it only writes membership rows
 * into the two tables migration `0036` added. Idempotent: the unique index
 * on `(method, group_key)` means re-running updates the same group rows
 * rather than duplicating them, and member inserts use `ON CONFLICT DO
 * NOTHING` on their composite primary key.
 *
 * **Never merges, never deletes.** No `judgments` row is touched by this
 * script — `docs/ai/CANONICAL_IDENTITY.md` §3's "never destructive" rule,
 * carried into the materialisation step it warned would need its own task.
 */
import postgres from 'postgres';
import { sslFor } from './db-ssl';

type GroupRow = { content_hash: string; ids: string[]; n: string };

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 5, ssl: sslFor(url) });
  const confirmed = process.argv.includes('--confirm');

  try {
    const groups = await sql<GroupRow[]>`
      SELECT content_hash, array_agg(id::text) AS ids, count(*)::text AS n
        FROM judgments
       WHERE content_hash IS NOT NULL
       GROUP BY content_hash
      HAVING count(*) > 1
       ORDER BY count(*) DESC`;

    const totalRows = groups.reduce((sum, g) => sum + Number(g.n), 0);
    console.log(`exact-duplicate groups (content_hash, count > 1): ${groups.length}`);
    console.log(`rows involved: ${totalRows}`);
    if (groups.length > 0) {
      console.log(`largest group: ${groups[0]!.n} rows, content_hash=${groups[0]!.content_hash.slice(0, 16)}...`);
    }

    if (groups.length === 0) {
      console.log('nothing to materialise.');
      return;
    }

    if (!confirmed) {
      console.log('\nsample — first 5 groups:');
      for (const g of groups.slice(0, 5)) {
        console.log(`  ${g.n} rows  content_hash=${g.content_hash.slice(0, 16)}...`);
      }
      console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
      return;
    }

    let written = 0;
    for (const g of groups) {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO document_duplicate_groups (relationship, method, group_key, member_count, evidence)
        VALUES ('exact_duplicate', 'content_hash', ${g.content_hash}, ${Number(g.n)},
                ${`shared content_hash across ${g.n} judgments rows`})
        ON CONFLICT (method, group_key)
        DO UPDATE SET member_count = excluded.member_count, evidence = excluded.evidence
        RETURNING id`;
      const groupId = row!.id;

      for (const judgmentId of g.ids) {
        await sql`
          INSERT INTO document_duplicate_members (group_id, judgment_id)
          VALUES (${groupId}, ${judgmentId})
          ON CONFLICT DO NOTHING`;
      }
      written += 1;
      if (written % 100 === 0) console.log(`  materialised ${written} of ${groups.length} groups...`);
    }

    console.log(`\nmaterialised ${written} groups, ${totalRows} member rows`);

    const [check] = await sql<{ groups: string; members: string }[]>`
      SELECT
        (SELECT count(*) FROM document_duplicate_groups WHERE method = 'content_hash')::text AS groups,
        (SELECT count(*) FROM document_duplicate_members)::text AS members`;
    console.log(`verified: document_duplicate_groups=${check?.groups}, document_duplicate_members=${check?.members}`);
  } finally {
    await sql.end();
  }
}

await main();
