/**
 * NEW2 — settle the six ADVOCATE-100 queries the stemmed probe flagged.
 *
 * `phraseto_tsquery` matched them against judgments, which is weak evidence of
 * nothing: it drops stop words and stems the rest, so a composed question
 * reduces to two or three lexemes that ordinary legal English contains
 * everywhere. The decisive test is cheap once the candidate set is bounded to
 * the handful the index returned: does the LITERAL string appear in those
 * judgments' text?
 *
 * A literal test over 18.7M rows is unaffordable. A literal test over the six
 * documents the index already named is a primary-key lookup.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const FILE = 'docs/ai/new2/ADVOCATE100.json';
const gold = JSON.parse(readFileSync(FILE, 'utf8'));
const audit = gold.new1_construction_rule_audit;
const flagged = audit.per_task.filter((r) => r.screened && r.phrase_hits_capped_at_6 > 0);

const out = [];
try {
  await sql.unsafe('set statement_timeout = 15000');
  for (const r of flagged) {
    const ids = await sql`
      select id from judgments
       where full_text_tsv @@ phraseto_tsquery('english', ${r.probe_phrase})
       limit 6`;
    const idList = ids.map((x) => x.id);
    const lit = idList.length
      ? await sql`select count(*)::int c from judgments where id = any(${idList}::uuid[]) and position(${r.probe_phrase} in full_text) > 0`
      : [{ c: 0 }];
    out.push({
      task_id: r.task_id,
      query_class: r.query_class,
      probe_phrase: r.probe_phrase,
      judgments_matched_by_the_stemmed_probe: idList.length,
      of_those_containing_the_LITERAL_phrase: lit[0].c,
      verdict: lit[0].c === 0
        ? 'NOT_LIFTED — the stemmed probe matched, the literal string appears in none of them'
        : 'REVIEW — the literal string does appear',
    });
    console.log(r.task_id.padEnd(10) + String(idList.length).padStart(2) + ' stemmed matches, '
      + lit[0].c + ' literal  ' + (lit[0].c === 0 ? 'NOT_LIFTED' : 'REVIEW') + '   "' + r.probe_phrase + '"');
  }

  audit.R2_flagged_settled_by_literal_test = {
    method: 'for each flagged query, the judgments the stemmed probe returned were fetched by primary key and tested for the LITERAL phrase',
    checked: out.length,
    not_lifted: out.filter((o) => o.verdict.startsWith('NOT_LIFTED')).length,
    needing_human_review: out.filter((o) => o.verdict.startsWith('REVIEW')).length,
    detail: out,
  };
  writeFileSync(FILE, JSON.stringify(gold, null, 2));
  console.log('\nnot lifted: ' + audit.R2_flagged_settled_by_literal_test.not_lifted
    + ' / needing review: ' + audit.R2_flagged_settled_by_literal_test.needing_human_review);
} catch (e) {
  console.error('ERR ' + e.message);
  process.exitCode = 1;
}
await sql.end();
