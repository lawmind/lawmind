import postgres from 'postgres';
import { writeFileSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30 });
const q = await sql`select state, reason, count(*)::int c, sum(attempts)::int attempts, count(*) filter (where last_error is not null)::int with_error from judgment_recovery_queue group by 1,2 order by 3 desc`;
const r = await sql`select method, engine_version, digit_trust, count(*)::int c,
    round(avg(char_count))::int avg_chars, round(avg(pages_read),1) avg_pages,
    round(avg(control_density)::numeric,4) avg_control, round(avg(english_rate)::numeric,4) avg_english
  from judgment_text_recovery group by 1,2,3 order by 4 desc`;
const cmp = await sql`select count(*)::int docs,
    count(*) filter (where tr.char_count > length(j.full_text))::int longer_than_original,
    count(*) filter (where tr.char_count <= length(j.full_text))::int not_longer,
    round(avg(tr.char_count::numeric / greatest(length(j.full_text),1)),2) avg_ratio
  from judgment_text_recovery tr join judgments j on j.id = tr.judgment_id`;
const still = await sql`select count(*)::int c from judgment_text_recovery tr join judgments j on j.id=tr.judgment_id where j.script_quality is not null`;
const out = { generatedAt: new Date().toISOString(), queue: q, recoveries: r, vs_original: cmp[0], recovered_docs_still_convicted_damaged: still[0].c,
  note: 'full_text is never overwritten — recovered text lives in judgment_text_recovery and the original conviction stands on judgments.script_quality. A recovered document is therefore still TEXT_DAMAGED in the contract, which is correct: the damage happened, and the recovery is a separate, provenanced artifact.' };
writeFileSync('docs/ai/new2/recovery-measurement.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await sql.end();
