/**
 * NEW2 — R8.1 §7.18 language truth.
 *
 * `judgments.language` is an enum whose only value, across 18,698,984 rows, is
 * `en`. That is not a corpus that happens to be English; it is a column nothing
 * has ever written a measurement into. This measures what is actually there.
 *
 * TABLESAMPLE SYSTEM rather than LIMIT, deliberately. A bare `limit 20000`
 * returns the physically-first rows — insertion-ordered and court-skewed — and
 * nothing about the result says so. TABLESAMPLE draws random heap pages, so the
 * rate it returns is entitled to an extrapolation. The first pass here used
 * LIMIT and got 0.305% against this method's 0.387%; the two being close is
 * luck, not method.
 *
 * The Wilson interval is printed with the point estimate because 0.387% off
 * 9,306 rows would otherwise imply a five-significant-figure document count.
 *
 * Read-only. Writes nothing.
 */
import { readFileSync } from 'node:fs';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';
const env = readFileSync('.env','utf8');
const url = process.env.DATABASE_URL ?? /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(env)[1].replace(/^["']|["']$/g,'');
const sql = postgres(url,{max:1,idle_timeout:30});
const DEV = '[\u0900-\u097F]';
const devCount = (col)=>`(length(${col}) - length(regexp_replace(${col},'${DEV}','','g')))`;
try {
  // TABLESAMPLE SYSTEM draws random PAGES, so it is a real random sample of the
  // heap rather than the physically-first rows a bare LIMIT returns. 0.05% of
  // 18.7M is ~9,000 rows and costs a fraction of a scan.
  const r = await sql.unsafe(`
    select count(*)::int                                                as sampled,
           count(full_text)::int                                        as have_full_text,
           count(*) filter (where native_text)::int                     as native_text_true,
           count(*) filter (where full_text ~ '${DEV}')::int            as full_any_dev,
           count(*) filter (where ${devCount('full_text')} > 200)::int  as full_dev_over_200,

           count(distinct language)::int                                 as distinct_languages
      from judgments tablesample system (0.05)`);
  const s = r[0];
  console.log(JSON.stringify(s,null,1));
  const pct=(a,b)=>b?((a/b)*100).toFixed(3):'n/a';
  console.log(`\nfull_text  >200 devanagari : ${s.full_dev_over_200} / ${s.sampled}  = ${pct(s.full_dev_over_200,s.sampled)}%`);
  console.log(`native_text = true         : ${s.native_text_true} / ${s.sampled}  = ${pct(s.native_text_true,s.sampled)}%`);
  const rate=s.full_dev_over_200/s.sampled;
  // Wilson 95% interval — a point estimate off ~9k rows needs its interval.
  const n=s.sampled, z=1.96, p=rate;
  const d=1+z*z/n, c=(p+z*z/(2*n))/d, m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  console.log(`\ncorpus estimate, full_text substantially devanagari:`);
  console.log(`  ${(rate*100).toFixed(3)}%  95% CI [${((c-m)*100).toFixed(3)}, ${((c+m)*100).toFixed(3)}]`);
  console.log(`  -> ${Math.round(rate*18698984).toLocaleString()} documents  [${Math.round((c-m)*18698984).toLocaleString()}, ${Math.round((c+m)*18698984).toLocaleString()}]`);
} finally { await sql.end({timeout:10}); }
