/**
 * RCC R28 B1 — READ-ONLY evidence probe. Writes nothing.
 *
 * Re-splits 2022 INSC 690 with the server's own `segmentParagraphs`, then checks
 * every annotation on that judgment against canonical ¶2: length, sha256, every
 * offset at which the stored quote occurs, and whether it equals the whole
 * paragraph. Also lists the smoke advocate's matters and the annotation-route
 * idempotency rows, so a row delta can be read off two runs.
 *
 *   cd services/api && DATABASE_URL=… npx tsx ../../docs/ai/rcc-r28/b1-probe.ts [marker…]
 *
 * Optional markers: strings that must NOT occur in any stored quote (the
 * tamper check). Published judgment text only; no user content is printed
 * beyond a 60-character head of each quote.
 */
import postgres from '../../../services/api/node_modules/postgres/src/index.js';
import { createHash } from 'node:crypto';
import { segmentParagraphs } from '../../../services/api/src/judgments/paragraphs.ts';

const USER_PREFIX = 'cd419982';
const markers = process.argv.slice(2);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const [j] = await sql`select id, full_text from judgments where neutral_citation = '2022 INSC 690' limit 1`;
const p2 = segmentParagraphs(j.full_text).find((p) => p.paragraphNumber === 2)!;
console.log(JSON.stringify({ judgmentId: j.id, p2Index: p2.paragraphIndex, p2Len: p2.text.length, p2Sha: sha(p2.text) }));

const offsets = (hay: string, needle: string) => {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
};

const rows = await sql`
  select id, user_id, paragraph_index, paragraph_number, quote, matter_id, deleted_at, created_at
  from judgment_annotations where judgment_id = ${j.id} order by created_at`;
console.log(`annotations on judgment: ${rows.length} (live ${rows.filter((r) => !r.deleted_at).length}); on para 2: ${rows.filter((r) => r.paragraph_number === 2).length}`);
for (const r of rows) {
  const on2 = r.paragraph_number === 2;
  const at = on2 ? offsets(p2.text, r.quote) : null;
  console.log(JSON.stringify({
    id: r.id, user: String(r.user_id).slice(0, 8), pi: r.paragraph_index, pn: r.paragraph_number,
    len: r.quote.length, sha: sha(r.quote), matter: r.matter_id, deleted: r.deleted_at, created: r.created_at,
    offsetsInP2: at, endOffsets: at?.map((s) => s + r.quote.length) ?? null,
    equalsWholeP2: on2 ? r.quote === p2.text : null,
    hasEllipsis: /…|\.\.\./.test(r.quote) && !(on2 && at && at.length > 0),
    markerHits: markers.filter((m) => r.quote.includes(m)),
    head: r.quote.slice(0, 60),
  }));
}

const matters = await sql`
  select id, case_title, created_at from matters where user_id::text like ${USER_PREFIX + '%'} order by created_at`;
console.log(`matters for ${USER_PREFIX}: ${matters.length}`);
for (const m of matters) console.log(JSON.stringify({ id: m.id, title: m.case_title }));

const [idem] = await sql`
  select count(*)::int as n from api_idempotency_records where route = '/judgments/:id/annotations'`;
console.log(`idempotency rows for /judgments/:id/annotations: ${idem.n}`);
await sql.end();
