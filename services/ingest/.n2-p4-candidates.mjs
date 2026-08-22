/**
 * NEW2 P4, step 1 — assemble the pool of BINDABLE target authorities.
 *
 * A gold set whose targets are not held is a wish list. Nothing enters
 * ADVOCATE-100 that is not a row in `judgments` with an id, a court, a date and
 * readable text, so every task is answerable in principle before any query is
 * written for it.
 *
 * This only COLLECTS. The queries are authored against these excerpts by hand,
 * and the leakage guard in step 3 then checks that the authored wording did not
 * borrow the target's own language.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const OUT = 'docs/ai/new2/advocate100-candidates.json';

const out = { generatedAt: new Date().toISOString(), pools: {} };

async function pool(name, query, params = []) {
  const rows = await sql.unsafe(query, params);
  out.pools[name] = rows.map((r) => ({
    id: r.id,
    case_title: r.case_title,
    court: r.court,
    date: r.judgment_date ? new Date(r.judgment_date).toISOString().slice(0, 10) : null,
    neutral_citation: r.neutral_citation,
    case_number: r.case_number,
    source_url: r.source_url,
    hc_document_class: r.hc_document_class,
    len: r.len,
    date_state: r.date_state ?? 'NOT_ANALYSED',
    script_quality: r.script_quality,
    overruled_status: r.overruled_status,
    excerpt: (r.excerpt ?? '').replace(/\s+/g, ' ').slice(0, 900),
  }));
  console.log(name.padEnd(34) + out.pools[name].length + ' candidates');
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}

const SELECT = `select j.id, j.case_title, j.court, j.judgment_date, j.neutral_citation, j.case_number,
       j.source_url, j.hc_document_class, j.script_quality, j.overruled_status,
       length(j.full_text) as len, d.state as date_state,
       substr(j.full_text, 1, 1400) as excerpt
  from judgments j left join judgment_date_quality d on d.judgment_id = j.id`;

try {
  await sql`set statement_timeout = 0`;

  await pool('sc_landmarks', SELECT + `
     where j.court = 'Supreme Court of India'
       and j.neutral_citation = any($1::text[])`,
  [[
    '1973 INSC 91', '1978 INSC 16', '1997 INSC 604', '1996 INSC 1508',
    '2013 INSC 748', '2012 INSC 108',
  ]]);

  await pool('sc_recent_bns_era', SELECT + `
     where j.court = 'Supreme Court of India'
       and j.judgment_date >= date '2024-07-01'
       and length(j.full_text) between 6000 and 120000
     order by j.judgment_date desc limit 40`);

  await pool('sc_pre_bns_criminal', SELECT + `
     where j.court = 'Supreme Court of India'
       and j.judgment_date between date '2018-01-01' and date '2024-06-30'
       and j.full_text ilike '%anticipatory bail%'
       and length(j.full_text) between 8000 and 90000
     order by j.judgment_date desc limit 25`);

  await pool('hc_bns_discussed', SELECT + `
     where j.court <> 'Supreme Court of India'
       and j.judgment_date >= date '2024-07-01'
       and j.full_text ilike '%Bharatiya Nyaya Sanhita%'
       and j.hc_document_class = 'decided'
       and j.script_quality is null
       and length(j.full_text) between 8000 and 60000
     order by md5(j.id::text) limit 40`);

  await pool('hc_bnss_discussed', SELECT + `
     where j.court <> 'Supreme Court of India'
       and j.judgment_date >= date '2024-07-01'
       and j.full_text ilike '%Bharatiya Nagarik Suraksha Sanhita%'
       and j.hc_document_class = 'decided'
       and j.script_quality is null
       and length(j.full_text) between 8000 and 60000
     order by md5(j.id::text) limit 30`);

  await pool('hc_bsa_discussed', SELECT + `
     where j.court <> 'Supreme Court of India'
       and j.judgment_date >= date '2024-07-01'
       and j.full_text ilike '%Bharatiya Sakshya%'
       and j.hc_document_class = 'decided'
       and j.script_quality is null
       and length(j.full_text) between 6000 and 60000
     order by md5(j.id::text) limit 25`);

  await pool('hc_decided_across_courts', SELECT + `
     where j.court <> 'Supreme Court of India'
       and j.hc_document_class = 'decided'
       and j.script_quality is null
       and j.neutral_citation is not null
       and length(j.full_text) between 12000 and 70000
       and j.judgment_date >= date '2023-01-01'
     order by md5(j.id::text) limit 60`);

  await pool('overruled_any', SELECT + `
     where j.overruled_status <> 'none' limit 25`);

  await pool('damaged_text_targets', SELECT + `
     where j.script_quality is not null
       and j.neutral_citation is not null
       and j.hc_document_class = 'decided'
     order by md5(j.id::text) limit 20`);

  await pool('date_suspect_targets', SELECT + `
     where d.state = 'DATE_SUSPECT'
       and j.neutral_citation is not null
       and length(j.full_text) > 8000
     order by md5(j.id::text) limit 20`);

  await pool('date_unknown_targets', SELECT + `
     where d.state = 'DATE_UNKNOWN'
       and length(j.full_text) > 6000
     order by md5(j.id::text) limit 15`);

  await pool('shared_citation_targets', SELECT + `
     where j.neutral_citation in (
       select sample_raw from new2_neutral_dupe_groups
        where n between 8 and 60 and distinct_content_hashes > 1
        order by md5(k) limit 6)
     order by j.neutral_citation limit 40`);

  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('written ' + OUT);
} catch (e) {
  console.error('ERR ' + e.message);
  out.error = e.message;
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  process.exitCode = 1;
}
await sql.end();
