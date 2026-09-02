/** LCC R23 step 1 — isolate the JSONB binding forms. Read-only: no table touched. */
import postgres from 'postgres';
const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 1, onnotice: () => {} });
const obj = { description: 'Ramesh Kumar v. State of NCT of Delhi' };

const [a] = await sql<{ t: string; v: string }[]>`
  SELECT jsonb_typeof(${JSON.stringify(obj)}::jsonb) AS t, (${JSON.stringify(obj)}::jsonb)::text AS v`;
console.log('JSON.stringify(obj)::jsonb ->', a);

const [b] = await sql<{ t: string; v: string }[]>`
  SELECT jsonb_typeof(${sql.json(obj)}) AS t, (${sql.json(obj)})::text AS v`;
console.log('sql.json(obj)              ->', b);

const [c] = await sql<{ t: string; v: string }[]>`
  SELECT jsonb_typeof(${sql.json(obj)}::jsonb) AS t, (${sql.json(obj)}::jsonb)::text AS v`;
console.log('sql.json(obj)::jsonb       ->', c);

await sql.end();
