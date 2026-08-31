/**
 * LCC R15-F1 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * Section 1 of the round: before choosing a grammar, measure the matter forms
 * the courts ACTUALLY print. `cohort.ts` shipped a type capture of `[A-Z]...`
 * and NEW2 (bus 1637, NEW2-R15-F1) showed it reads a title-case common order as
 * zero matters. The question this answers is not "does lowercase happen" — it
 * does — but "what exactly does a case-insensitive capture start matching, and
 * how much of it is a registry matter type rather than a run of prose".
 *
 *   pnpm exec tsx scripts/lcc-matter-form-census.mts [sampleN]
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const N = Number(process.argv[2] ?? 4000);
const WINDOW = 800;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

/** Case-INSENSITIVE twins of the shipped patterns. Identical in every other
 *  respect, so any difference in what they match is attributable to case alone. */
const LONG_I =
  /([A-Za-z][A-Za-z.&'-]*(?:[ \t]+[A-Za-z][A-Za-z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/gi;
const SLASH_I = /([A-Za-z][A-Za-z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/gi;

/** The shipped ones, verbatim from cohort.ts at 93ca23f4. */
const LONG_U =
  /([A-Z][A-Z.&'-]*(?:[ \t]+[A-Z][A-Z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/g;
const SLASH_U = /([A-Z][A-Z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/g;

function caseClass(s: string): 'UPPER' | 'lower' | 'Title' | 'Mixed' {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return 'Mixed';
  if (letters === letters.toUpperCase()) return 'UPPER';
  if (letters === letters.toLowerCase()) return 'lower';
  const words = s.trim().split(/[ \t]+/).filter(Boolean);
  if (words.every((w) => /^[A-Z]/.test(w))) return 'Title';
  return 'Mixed';
}

/** The last two words, as `typeToken` in cohort.ts computes them. */
function tail2(captured: string): string {
  return captured.trim().split(/[ \t]+/).slice(-2).join(' ');
}

function matchesOf(res: RegExp[], window: string) {
  const out: { type: string; full: string; index: number }[] = [];
  for (const re of res) {
    re.lastIndex = 0;
    for (let m = re.exec(window); m !== null; m = re.exec(window)) {
      out.push({ type: m[1]!, full: m[0]!.trim(), index: m.index });
    }
  }
  return out;
}

const rows = await sql<{ court: string; head: string }[]>`
  WITH k AS (
    SELECT DISTINCT judgment_id FROM judgment_citation_keys
     WHERE mod(abs(hashtext(judgment_id::text)), 997) = 3
  )
  SELECT j.court, left(j.full_text, ${WINDOW}) AS head
    FROM k JOIN judgments j ON j.id = k.judgment_id
   WHERE j.full_text IS NOT NULL AND length(j.full_text) > 0
   LIMIT ${N}`;

const typeCounts = new Map<string, { n: number; cls: string; example: string }>();
const clsCounts: Record<string, number> = { UPPER: 0, lower: 0, Title: 0, Mixed: 0 };
let headsWithUpperOnlyZero = 0;
let headsWithInsensitiveExtra = 0;

for (const r of rows) {
  const w = r.head;
  const u = matchesOf([LONG_U, SLASH_U], w);
  const i = matchesOf([LONG_I, SLASH_I], w);
  if (u.length === 0) headsWithUpperOnlyZero++;
  if (i.length > u.length) headsWithInsensitiveExtra++;
  const seenU = new Set(u.map((m) => m.full));
  for (const m of i) {
    if (seenU.has(m.full)) continue; // recovered by case alone only
    const t = tail2(m.type);
    const cls = caseClass(t);
    clsCounts[cls] = (clsCounts[cls] ?? 0) + 1;
    const key = `${cls}\u0000${t.toUpperCase().replace(/[^A-Z ]/g, '')}`;
    const e = typeCounts.get(key);
    if (e) e.n++;
    else typeCounts.set(key, { n: 1, cls, example: m.full.slice(0, 60) });
  }
}

const top = [...typeCounts.entries()]
  .map(([k, v]) => ({ cls: v.cls, type: k.split('\u0000')[1]!, n: v.n, example: v.example }))
  .sort((a, b) => b.n - a.n);

const out = {
  measuredAt: new Date().toISOString(),
  window: WINDOW,
  sampled: rows.length,
  headsUpperGrammarFindsNothing: headsWithUpperOnlyZero,
  headsWhereCaseInsensitiveFindsMore: headsWithInsensitiveExtra,
  newMatchCaseClasses: clsCounts,
  newTypeTokens: top.slice(0, 120),
};
mkdirSync('docs/ai/lcc-r15f1', { recursive: true });
writeFileSync('docs/ai/lcc-r15f1/matter-form-census.json', JSON.stringify(out, null, 2) + '\n');
console.log('sampled', rows.length);
console.log('heads where the UPPER grammar finds nothing:', headsWithUpperOnlyZero);
console.log('heads where case-insensitive finds MORE   :', headsWithInsensitiveExtra);
console.log('new-match case classes', clsCounts);
console.log('\nTOP NEW TYPE TOKENS (only matched once case is ignored)');
for (const t of top.slice(0, 60)) {
  console.log(String(t.n).padStart(6), t.cls.padEnd(6), t.type.padEnd(34), '|', t.example);
}
await sql.end();
