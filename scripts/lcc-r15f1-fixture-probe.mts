/**
 * LCC R15-F1 — MEASUREMENT ONLY. Runs the candidate grammars over named LIVE
 * judgments so a design choice is checked against the court's own text before
 * it is written into `cohort.ts`, not after.
 */
import postgres from 'postgres';

const W = 800;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

const IDS = [
  ['UK title-case With', 'c2e629b9-5398-441e-be64-207f8c5b5abc'],
  ['UK title-case With 2', 'e2666b34-63ce-4899-a1ba-d024a7697476'],
  ['HP title-case a/w list', '0acfc6f4-1ffd-4e92-8ab4-1d0146709f4b'],
  ['RJ single, title case', '086eb79a-a9e9-4ff4-bcee-2dc82e32c175'],
  ['RJ single 2', '0ccd938c-297f-4ecd-a91d-fb6aa14d207d'],
  ['RJ parent "in"', '0e5d2868-4fd3-4613-97b7-61f368ce4b9e'],
  ['RJ ordinal type', '0f7a8f04-3585-43a7-8f86-51183dfebf97'],
  ['JHHC falsifier', '66f8a648-d0a8-40b1-bc9b-6221da840401'],
] as const;

const S_LONG =
  /([A-Z][A-Z.&'-]*(?:[ \t]+[A-Z][A-Z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/g;
const S_SLASH = /([A-Z][A-Z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/g;

/** Candidate: case-insensitive, a dash word and an ordinal word allowed inside
 *  the type, everything else as shipped. */
const TYPEWORD = "(?:[A-Za-z][A-Za-z.&'-]*|[-–—]|\\d{1,2}(?:st|nd|rd|th))";
const I_LONG = new RegExp(
  `([A-Za-z][A-Za-z.&'-]*(?:[ \\t]+${TYPEWORD}){0,4})[ \\t]*(?:Nos?\\.?)[ \\t]*[-.:]?[ \\t]*(\\d{1,7})[ \\t]*(?:of|\\/)[ \\t]*((?:19|20)\\d{2})\\b`,
  'gi',
);
const I_SLASH = /([A-Za-z][A-Za-z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/gi;
const A_LONG = new RegExp('^' + I_LONG.source, 'i');
const A_SLASH = new RegExp('^' + I_SLASH.source, 'i');

const CONNECTORS = [
  { re: /\bC\s*\/\s*W\b/i, name: 'C/W' },
  { re: /\bA\s*\/\s*W\b/i, name: 'A/W' },
  { re: /\bconnected\s+with\b/i, name: 'CONNECTED WITH' },
  { re: /\balong\s*with\b/i, name: 'ALONG WITH' },
  { re: /(^|\n)\s*with\b/i, name: 'WITH' },
];
const CONNECTOR_SPLIT =
  /\bC\s*\/\s*W\b|\bA\s*\/\s*W\b|\bconnected\s+with\b|\balong\s*with\b|\bwith\b/gi;
const LEAD = /^[\s(\[*\-–—.:;,#•]*(?:\d{1,4}\s*[.)\]]?[ \t]*)?[\s(\[*\-–—.:;,#•]*/;
const LABEL = /^(?:case|matter|item)[ \t]*:[-–—\s]*/i;
const PARENT_MATTER = /\b(?:IN|ARISING\s+(?:OUT\s+)?(?:OF|FROM)|FROM)[ \t\r\n]*$/i;
const PARENT_LEADING = /^(?:IN|ARISING|FROM)\b/i;
const NOT_A_MATTER =
  /^(SECTION|SECTIONS|ACT|ACTS|ARTICLE|ARTICLES|RULE|RULES|ORDER|ORDERS|CHAPTER|PART|SCHEDULE|CLAUSE|REGULATION|NOTIFICATION|AMENDMENT|ANNEXURE|PARA|PARAGRAPH|VOLUME|PAGE|EDITION|ITEM)$/;

const typeToken = (c: string) =>
  c.trim().split(/[ \t]+/).slice(-2).join('').toUpperCase().replace(/[^A-Z]/g, '');

function add(found: Map<string, string>, type: string, serial: string, year: string) {
  const t = typeToken(type);
  if (t.length === 0 || NOT_A_MATTER.test(t)) return;
  const n = serial.replace(/^0+/, '') || '0';
  const k = `${n}|${year}`;
  if (!found.has(k)) found.set(k, `${t} ${n}/${year}`);
}

function shipped(w: string) {
  const found = new Map<string, string>();
  for (const re of [S_LONG, S_SLASH]) {
    re.lastIndex = 0;
    for (let m = re.exec(w); m !== null; m = re.exec(w)) {
      if (/\b(?:IN|ARISING\s+(?:OUT\s+)?(?:OF|FROM)|FROM)[ \t]*$/i.test(w.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      add(found, m[1]!, m[2]!, m[3]!);
    }
  }
  return found;
}

function unanchored(w: string) {
  const found = new Map<string, string>();
  for (const re of [I_LONG, I_SLASH]) {
    re.lastIndex = 0;
    for (let m = re.exec(w); m !== null; m = re.exec(w)) {
      if (PARENT_MATTER.test(w.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      add(found, m[1]!, m[2]!, m[3]!);
    }
  }
  return found;
}

function segments(w: string): { text: string; before: string }[] {
  const out: { text: string; before: string }[] = [];
  let prevTail = '';
  for (const line of w.split(/\r?\n/)) {
    let last = 0;
    CONNECTOR_SPLIT.lastIndex = 0;
    for (let m = CONNECTOR_SPLIT.exec(line); m !== null; m = CONNECTOR_SPLIT.exec(line)) {
      out.push({ text: line.slice(last, m.index), before: prevTail });
      prevTail = line.slice(last, m.index);
      last = m.index + m[0].length;
    }
    out.push({ text: line.slice(last), before: prevTail });
    prevTail = line.slice(last);
  }
  return out;
}

function anchored(w: string) {
  const found = new Map<string, string>();
  for (const s of segments(w)) {
    const seg = s.text.replace(LEAD, '').replace(LABEL, '').replace(LEAD, '');
    if (PARENT_MATTER.test(s.before)) continue;
    for (const re of [A_LONG, A_SLASH]) {
      const m = re.exec(seg);
      if (m === null) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      add(found, m[1]!, m[2]!, m[3]!);
    }
  }
  return found;
}

const conn = (w: string) => CONNECTORS.find((c) => c.re.test(w))?.name ?? null;

for (const [label, id] of IDS) {
  const [row] = await sql<{ head: string }[]>`
    SELECT left(full_text, ${W}) AS head FROM judgments WHERE id = ${id}::uuid`;
  if (!row) {
    console.log(`${label.padEnd(24)} NOT HELD`);
    continue;
  }
  const w = row.head;
  const c = conn(w);
  const S = shipped(w);
  const U = unanchored(w);
  const A = anchored(w);
  console.log(`\n${label}  (${id})`);
  console.log(`  connector ${c ?? 'null'}`);
  console.log(`  SHIPPED    ${S.size}  ${[...S.values()].join(' · ')}`);
  console.log(`  UNANCHORED ${U.size}  ${[...U.values()].join(' · ')}`);
  console.log(`  ANCHORED   ${A.size}  ${[...A.values()].join(' · ')}`);
}
await sql.end();
