/**
 * NEW2 §8/NEW2-3b — the property the whole design exists for:
 * A DOCUMENT INGESTED AFTER A COMPLETED RUN MUST STAY `NEVER_SCREENED`.
 *
 * This is the half an id watermark would have got wrong. All 16 documents
 * created after the completed pass sit BELOW its final id cursor, so an id
 * watermark would have certified 16 of 16 documents the screen never saw. The
 * time watermark must certify 0 of 16.
 *
 * Corpus-wide, exact -- not a sample, because this is the safety claim.
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:1800000,onnotice:()=>{}});
try{
  const [w]=await sql`SELECT started_at FROM quality_screen_runs WHERE covers_corpus ORDER BY started_at DESC LIMIT 1`;
  console.log('coverage watermark:', w.started_at.toISOString());

  const [after]=await sql`
    SELECT count(*)::int AS created_after_the_run,
           count(*) FILTER (WHERE e.body_text_evidence = 'NEVER_SCREENED')::int      AS still_never_screened,
           count(*) FILTER (WHERE e.body_text_evidence = 'SCREENED_NO_DAMAGE_FOUND')::int AS WRONGLY_CERTIFIED
      FROM judgments j JOIN judgment_body_text_evidence e ON e.id = j.id
     WHERE j.created_at >= ${w.started_at}`;
  console.log('documents created AFTER the run:', JSON.stringify(after));
  if (after.wrongly_certified !== 0) { console.error('REFUSED -- a post-run document reads SCREENED_NO_DAMAGE_FOUND.'); process.exit(1); }
  console.log('PROPERTY HOLDS: 0 post-run documents are certified as screened.');

  const [tot]=await sql`
    SELECT count(*) FILTER (WHERE body_text_evidence='PROVEN_DAMAGED')::int            AS proven_damaged,
           count(*) FILTER (WHERE body_text_evidence='SCREENED_DAMAGED')::int          AS screened_damaged,
           count(*) FILTER (WHERE body_text_evidence='SCREENED_NO_DAMAGE_FOUND')::int  AS screened_no_damage_found,
           count(*) FILTER (WHERE body_text_evidence='NEVER_SCREENED')::int            AS never_screened,
           count(*)::int AS corpus
      FROM judgment_body_text_evidence`;
  console.log('\nCORPUS-WIDE, exact:');
  for (const [k,v] of Object.entries(tot)) console.log('  ', String(v).padStart(10), k);
  console.log('\n  refused as research evidence (both DAMAGED states):', (tot.proven_damaged+tot.screened_damaged).toLocaleString());

  writeFileSync('docs/ai/new2/body-text-evidence-corpus-state.json',
    JSON.stringify({generated_at:new Date().toISOString(),watermark:w.started_at,post_run:after,corpus:tot},null,2));
} finally { await sql.end({timeout:10}); }
