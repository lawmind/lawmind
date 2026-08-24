/**
 * NEW2 P2f — the regression the key rebuild introduced, measured corpus-wide.
 *
 * Before the rebuild, registry despatch stamps on `judgments.neutral_citation`
 * ("2011:NOVEMBER:12") carried NO row in judgment_citation_keys, so the resolver
 * answered TARGET_NOT_HELD and they were harmless. The rebuild indexed
 * neutral_citation wholesale, so those stamps are now resolver INPUTS.
 *
 * A month stamp is not a citation. `canonicalKeyFor` cannot catch it: the key
 * `2011NOVEMBER12` has digits, has letters, and is longer than five characters.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:600000,onnotice:()=>{}});
const MONTHS = '(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)';
const RE = `^[0-9]{4}${MONTHS}[0-9]{1,2}$`;
try {
  const [a] = await sql`
    SELECT count(*)::int AS stamp_key_rows,
           count(DISTINCT citation_key)::int AS distinct_stamp_keys,
           count(DISTINCT judgment_id)::int AS judgments_carrying_one
      FROM judgment_citation_keys
     WHERE source = 'neutral' AND citation_key ~ ${RE}`;
  console.log('stamp keys now in the index:', JSON.stringify(a));

  const b = await sql`
    SELECT held, count(*)::int AS keys
      FROM (SELECT citation_key, count(DISTINCT judgment_id)::int AS held
              FROM judgment_citation_keys
             WHERE source='neutral' AND citation_key ~ ${RE}
             GROUP BY 1) t
     GROUP BY 1 ORDER BY 1`;
  console.log('by group size (held=1 would RESOLVE UNIQUE):', JSON.stringify(b));

  const c = await sql`
    SELECT k.citation_key, k.source_text, j.court, j.judgment_date::text AS date, left(j.case_title,52) AS title
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.source='neutral' AND k.citation_key ~ ${RE}
       AND k.citation_key IN (SELECT citation_key FROM judgment_citation_keys
                               WHERE source='neutral' AND citation_key ~ ${RE}
                               GROUP BY 1 HAVING count(DISTINCT judgment_id) = 1)
     ORDER BY k.citation_key LIMIT 12`;
  console.log('keys that would resolve UNIQUE:');
  for (const r of c) console.log('  ', r.citation_key.padEnd(18), r.source_text.padEnd(20), (r.court||'').slice(0,22), r.date, '|', r.title);

  const [d] = await sql`
    SELECT count(DISTINCT j.court)::int AS courts, min(j.judgment_date)::text AS first, max(j.judgment_date)::text AS last
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.source='neutral' AND k.citation_key ~ ${RE}`;
  console.log('spread:', JSON.stringify(d));

  writeFileSync('docs/ai/new2/resolver-monthstamp-regression.json', JSON.stringify({
    generated_at: new Date().toISOString(),
    pattern: RE,
    totals: a, by_group_size: b, unique_examples: c, spread: d,
  }, null, 2));
  console.log('wrote docs/ai/new2/resolver-monthstamp-regression.json');
} finally { await sql.end({timeout:10}); }
