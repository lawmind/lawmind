import { openDb } from './db-host.ts';
const sql = await openDb(process.env['DATABASE_URL']!, 2);
console.log(JSON.stringify(await sql.unsafe(process.argv[2]!), null, 1));
await sql.end();
