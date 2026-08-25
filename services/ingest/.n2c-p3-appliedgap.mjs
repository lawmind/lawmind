import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,onnotice:()=>{}});
try{
  const rows=await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5`;
  console.log('newest 5 applied rows:', JSON.stringify(rows.map(r=>({id:r.id,at:new Date(Number(r.created_at)).toISOString()})),null,1));
  const [c]=await sql`SELECT count(*)::int AS n, min(created_at) AS first, max(created_at) AS last FROM drizzle.__drizzle_migrations`;
  console.log('count',c.n,'first',new Date(Number(c.first)).toISOString(),'last',new Date(Number(c.last)).toISOString());
} finally { await sql.end({timeout:5}); }
