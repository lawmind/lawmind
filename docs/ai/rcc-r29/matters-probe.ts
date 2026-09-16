/**
 * RCC R29 — READ-ONLY. Counts the smoke advocate's matters (the server truth the
 * cold-deep-link picker must agree with).
 *
 *   cd services/api && DATABASE_URL=… npx tsx ../../docs/ai/rcc-r29/matters-probe.ts
 */
import postgres from '../../../services/api/node_modules/postgres/src/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const matters = await sql`
  select m.id, m.case_title from matters m join users u on u.id = m.user_id
  where u.id::text like 'cd419982%' order by m.created_at`;
console.log(JSON.stringify({ serverMatterCount: matters.length, matters: matters.map((m) => m.case_title) }));
await sql.end();
