/**
 * LCC R15-F1 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * Choosing between two matter keys is choosing which way the gate fails.
 *
 *   `TYPE|serial|year`  counts `MFA No. 101864 of 2016` and
 *                       `MISCELLANEOUS FIRST APPEAL NO. 101864 OF 2016` as TWO
 *                       matters. Over-counting REFUSES a judgment that declared
 *                       one matter under two names — a recall cost, safe.
 *   `serial|year`       counts them as one. Under-counting would let a genuine
 *                       two-matter cohort through — a wrong pin, NOT safe.
 *
 * So `serial|year` may only be shipped if the pairs it collapses are in fact the
 * same matter renamed. This prints every collapse it makes, with the court's own
 * text on both sides, so the claim is checkable rather than assumed.
 *
 *   pnpm exec tsx scripts/lcc-r15f1-key-collapse.mts [controlSample]
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const T0 = '2026-08-18';
const W = 800;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

const I_LONG =
  /([A-Za-z][A-Za-z.&'-]*(?:[ \t]+(?:[A-Za-z][A-Za-z.&'-]*|[-–—])){0,4})[ \t]*(?:Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|\/)[ \t]*((?:19|20)\d{2})\b/gi;
const I_SLASH = /([A-Za-z][A-Za-z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/gi;
const A_LONG = new RegExp('^' + I_LONG.source, 'i');
const A_SLASH = new RegExp('^' + I_SLASH.source, 'i');
const CONNECTOR_SPLIT =
  /\bC\s*\/\s*W\b|\bA\s*\/\s*W\b|\bconnected\s+with\b|\balong\s*with\b|\bwith\b/gi;
const LEAD = /^[\s(\[*\-–—.:;,#•]*(?:\d{1,4}\s*[.)\]]?[ \t]+)?[\s(\[*\-–—.:;,#•]*/;
const LABEL = /^(?:case|matter|item)[ \t]*:[-–—\s]*/i;
const PARENT_LEADING = /^(?:IN|ARISING|FROM)\b/i;
const NOT_A_MATTER =
  /^(SECTION|SECTIONS|ACT|ACTS|ARTICLE|ARTICLES|RULE|RULES|ORDER|ORDERS|CHAPTER|PART|SCHEDULE|CLAUSE|REGULATION|NOTIFICATION|AMENDMENT|ANNEXURE|PARA|PARAGRAPH|VOLUME|PAGE|EDITION|ITEM)$/;

const typeToken = (c: string) =>
  c.trim().split(/[ \t]+/).slice(-2).join('').toUpperCase().replace(/[^A-Z]/g, '');

function segmentsOf(window: string): string[] {
  const out: string[] = [];
  for (const line of window.split(/\r?\n/)) {
    let last = 0;
    CONNECTOR_SPLIT.lastIndex = 0;
    for (let m = CONNECTOR_SPLIT.exec(line); m !== null; m = CONNECTOR_SPLIT.exec(line)) {
      out.push(line.slice(last, m.index));
      last = m.index + m[0].length;
    }
    out.push(line.slice(last));
  }
  return out;
}

/** Every anchored declaration, keeping the court's raw text and both keys. */
function declarations(window: string) {
  const out: { raw: string; type: string; serialYear: string }[] = [];
  const seen = new Set<string>();
  for (const rawSeg of segmentsOf(window)) {
    const seg = rawSeg.replace(LEAD, '').replace(LABEL, '').replace(LEAD, '');
    for (const re of [A_LONG, A_SLASH]) {
      const m = re.exec(seg);
      if (m === null) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      const t = typeToken(m[1]!);
      if (t.length === 0 || NOT_A_MATTER.test(t)) continue;
      const n = m[2]!.replace(/^0+/, '') || '0';
      const full = `${t}|${n}|${m[3]}`;
      if (seen.has(full)) continue;
      seen.add(full);
      out.push({ raw: m[0]!.trim(), type: t, serialYear: `${n}|${m[3]}` });
    }
  }
  return out;
}

const heads = await sql<{ citation_key: string; head: string; src: string }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), still AS (
    SELECT k.citation_key, min(k.judgment_id::text) AS jid
      FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) = 1
  )
  SELECT * FROM (
    SELECT s.citation_key, left(j.full_text, 2400) AS head, 'control' AS src
      FROM still s JOIN judgments j ON j.id = s.jid::uuid
     WHERE mod(abs(hashtext(s.citation_key)), 397) = 11
     LIMIT ${Number(process.argv[2] ?? 6000)}
  ) c
  UNION ALL
  SELECT * FROM (
    SELECT DISTINCT ON (f.citation_key) f.citation_key, left(j.full_text, 2400) AS head, 'positive' AS src
      FROM lcc_r15_falseunique f
      JOIN judgment_citation_keys k ON k.citation_key = f.citation_key AND k.created_at < ${T0}::timestamptz
      JOIN judgments j ON j.id = k.judgment_id
     ORDER BY f.citation_key, k.created_at
  ) p`;

const collapses: {
  citationKey: string;
  src: string;
  serialYear: string;
  types: string[];
  raws: string[];
}[] = [];
let docsWithCollapse = 0;

for (const h of heads) {
  const decls = declarations(h.head.slice(0, W));
  const bySy = new Map<string, { types: Set<string>; raws: Set<string> }>();
  for (const d of decls) {
    const e = bySy.get(d.serialYear) ?? { types: new Set(), raws: new Set() };
    e.types.add(d.type);
    e.raws.add(d.raw);
    bySy.set(d.serialYear, e);
  }
  let any = false;
  for (const [sy, e] of bySy) {
    if (e.types.size < 2) continue;
    any = true;
    collapses.push({
      citationKey: h.citation_key,
      src: h.src,
      serialYear: sy,
      types: [...e.types],
      raws: [...e.raws],
    });
  }
  if (any) docsWithCollapse++;
}

console.log(`documents read        ${heads.length}`);
console.log(`documents where serial|year collapses two type tokens  ${docsWithCollapse}`);
console.log(`collapse events       ${collapses.length}\n`);
for (const c of collapses.slice(0, 40)) {
  console.log(`${c.src.padEnd(8)} ${c.citationKey.padEnd(18)} ${c.serialYear.padEnd(12)} ${c.types.join(' + ')}`);
  for (const r of c.raws) console.log(`         "${r}"`);
}

mkdirSync('docs/ai/lcc-r15f1', { recursive: true });
writeFileSync(
  'docs/ai/lcc-r15f1/key-collapse.json',
  JSON.stringify(
    { measuredAt: new Date().toISOString(), documentsRead: heads.length, docsWithCollapse, collapses },
    null,
    2,
  ) + '\n',
);
console.log('\nwrote docs/ai/lcc-r15f1/key-collapse.json');
await sql.end();
