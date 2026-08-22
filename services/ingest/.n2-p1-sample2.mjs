/**
 * NEW2 P1.3/P1.4, second pass — same design, larger sample, two stages.
 *
 * Stage A joins the whole table once to learn WHICH documents are in the
 * sampled groups, touching no document text. Stage B fetches the text signals
 * for a capped handful per group by primary key. That keeps a 25-per-stratum
 * sample affordable: one seq scan plus ~15k point lookups, instead of one seq
 * scan that detoasts every document in a 1,257-row group.
 *
 * Read-only against `judgments`. Rewrites nothing.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const ART = 'docs/ai/new2/shared-neutral-sample.json';
const PER_STRATUM = Number(process.env.PER_STRATUM ?? 25);
const MAX_ROWS_PER_GROUP = Number(process.env.MAX_ROWS_PER_GROUP ?? 6);

const COURTS = [
  'Allahabad High Court', 'High Court Of Rajasthan', 'High Court Of Chhattisgarh',
  'High Court of Karnataka', 'Gauhati High Court', 'High Court of Jharkhand',
  'High Court of Himachal Pradesh', 'High Court of Uttarakhand', 'Bombay High Court',
  'High Court of Punjab and Haryana', 'High Court of Kerala', 'High Court of Delhi',
  'High Court of Meghalaya', 'Madras High Court', 'Supreme Court of India',
  'High Court of Manipur', 'High Court of Tripura', 'Calcutta High Court',
  'High Court of Jammu and Kashmir', 'Patna High Court', 'Orissa High Court',
  'High Court of Madhya Pradesh', 'High Court of Gujarat', 'High Court  for State of Telangana',
];
const SIZE = [['2', 'n = 2'], ['3_9', 'n between 3 and 9'], ['10_49', 'n between 10 and 49'], ['50p', 'n >= 50']];
const IDENT = [['byte_identical', 'distinct_content_hashes = 1'], ['different_content', 'distinct_content_hashes > 1']];

const state = { startedAt: new Date().toISOString(), perStratum: PER_STRATUM, maxRowsPerGroup: MAX_ROWS_PER_GROUP, strata: [], groups: [] };
const save = () => writeFileSync(ART, JSON.stringify(state, null, 1));

const TEXT_SQL = [
  'select j.id, j.case_number, j.judgment_date, j.content_hash, length(j.full_text) as len,',
  '       s.k, s.sample_raw,',
  '       position(s.sample_raw in j.full_text) as first_pos,',
  "       (length(j.full_text) - length(replace(j.full_text, s.sample_raw, ''))) / greatest(length(s.sample_raw), 1) as occurrences,",
  "       j.full_text ~ ('(^|' || chr(10) || ')[ ]*(NC[ ]*:?[ ]*)?'",
  "                     || regexp_replace(s.sample_raw, '([.^$*+?()\\[\\]{}|\\\\-])', '\\\\\\1', 'g')",
  "                     || '[ ]*(' || chr(13) || ')?($|' || chr(10) || ')') as solo_line,",
  '       substr(j.full_text, greatest(1, position(s.sample_raw in j.full_text) - 260), 260 + length(s.sample_raw) + 120) as ctx,',
  '       left(j.full_text, 260) as head,',
  '       j.text_quality, j.hc_document_class, j.native_text, j.text_extraction_method',
  '  from judgments j',
  '  join new2_p1_sample_groups s on s.k = $2',
  ' where j.id = any($1::uuid[])',
].join('\n');

try {
  await sql`set statement_timeout = 0`;

  // ---- choose the sample, before reading any document ---------------------
  await sql`drop table if exists new2_p1_sample_groups`;
  await sql`create table new2_p1_sample_groups (k text primary key, sample_raw text, n int, distinct_case_numbers int, distinct_content_hashes int, a_court text, first_date date, last_date date, stratum_court text, stratum_size text, stratum_identity text)`;
  for (const court of COURTS) {
    for (const [sizeName, sizePred] of SIZE) {
      for (const [identName, identPred] of IDENT) {
        const ins = await sql.unsafe(
          'insert into new2_p1_sample_groups'
          + ' select k, sample_raw, n, distinct_case_numbers, distinct_content_hashes, a_court, first_date, last_date, $1, $2, $3'
          + ' from new2_neutral_dupe_groups where a_court = $1 and ' + sizePred + ' and ' + identPred
          + ' order by md5(k) limit ' + PER_STRATUM + ' on conflict (k) do nothing',
          [court, sizeName, identName],
        );
        state.strata.push({ court, size: sizeName, identity: identName, picked: ins.count });
      }
    }
  }
  const chosen = await sql`select count(*)::int c from new2_p1_sample_groups`;
  console.log('stage 0 — sample groups chosen: ' + chosen[0].c);
  save();

  // ---- stage A: which documents are in those groups, no text touched ------
  const tA = Date.now();
  const idRows = await sql.unsafe([
    'select s.k, j.id, j.judgment_date',
    '  from judgments j',
    '  join new2_p1_sample_groups s',
    "    on upper(regexp_replace(j.neutral_citation, '[^A-Za-z0-9]', '', 'g')) = s.k",
    ' where j.neutral_citation is not null',
  ].join('\n'));
  console.log('stage A — ' + idRows.length + ' member rows located in ' + Math.round((Date.now() - tA) / 1000) + 's');

  const byK = new Map();
  for (const r of idRows) {
    if (!byK.has(r.k)) byK.set(r.k, []);
    byK.get(r.k).push(r);
  }
  for (const [, list] of byK) list.sort((a, b) => String(a.judgment_date).localeCompare(String(b.judgment_date)));

  const meta = await sql`select * from new2_p1_sample_groups`;
  const metaByK = new Map(meta.map((m) => [m.k, m]));

  // ---- stage B: read the capped documents by primary key ------------------
  const tB = Date.now();
  let readCount = 0;
  const keys = [...byK.keys()];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const m = metaByK.get(k);
    if (!m) continue;
    const ids = byK.get(k).slice(0, MAX_ROWS_PER_GROUP).map((r) => r.id);
    const rows = await sql.unsafe(TEXT_SQL, [ids, k]);
    readCount += rows.length;
    state.groups.push({
      k,
      sample_raw: m.sample_raw,
      n: m.n,
      distinct_case_numbers: m.distinct_case_numbers,
      distinct_content_hashes: m.distinct_content_hashes,
      court: m.a_court,
      first_date: String(m.first_date).slice(0, 10),
      last_date: String(m.last_date).slice(0, 10),
      stratum: { court: m.stratum_court, size: m.stratum_size, identity: m.stratum_identity },
      rows_present: byK.get(k).length,
      rows: rows.map((r) => ({
        id: r.id,
        case_number: r.case_number,
        date: String(r.judgment_date).slice(0, 10),
        content_hash: (r.content_hash ?? '').slice(0, 12),
        len: r.len,
        first_pos: Number(r.first_pos),
        occurrences: Number(r.occurrences),
        solo_line: r.solo_line,
        text_quality: r.text_quality,
        hc_document_class: r.hc_document_class,
        native_text: r.native_text,
        extraction: r.text_extraction_method,
        head: (r.head ?? '').replace(/\s+/g, ' ').slice(0, 260),
        ctx: (r.ctx ?? '').replace(/\s+/g, ' ').slice(0, 460),
      })),
    });
    if (i % 200 === 0) {
      save();
      console.log('  stage B ' + i + '/' + keys.length + ' groups, ' + readCount + ' documents read');
    }
  }
  state.finishedAt = new Date().toISOString();
  save();
  console.log('stage B — ' + readCount + ' documents read in ' + Math.round((Date.now() - tB) / 1000) + 's');
  console.log('DONE ' + state.groups.length + ' groups');
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  state.error = e.message;
  save();
  process.exitCode = 1;
}
await sql.end();
