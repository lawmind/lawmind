/**
 * LCC R15-F1 — MEASUREMENT ONLY. Finds real title-case cohort cause titles so
 * the failure-first tests are written from court text rather than from strings
 * invented to make a regex pass (`a-phrase-list-scores-100-on-the-documents-it-
 * was-written-from`). Prints the judgment id beside each so a reader can check.
 */
import postgres from 'postgres';

const W = 800;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

const S_LONG =
  /([A-Z][A-Z.&'-]*(?:[ \t]+[A-Z][A-Z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/g;
const I_LONG =
  /([A-Za-z][A-Za-z.&'-]*(?:[ \t]+(?:[A-Za-z][A-Za-z.&'-]*|[-–—])){0,4})[ \t]*(?:Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|\/)[ \t]*((?:19|20)\d{2})\b/gi;
const CONN = /\bC\s*\/\s*W\b|\bA\s*\/\s*W\b|\bconnected\s+with\b|\balong\s*with\b|(^|\n)\s*with\b/i;

function count(re: RegExp, w: string) {
  re.lastIndex = 0;
  const seen = new Set<string>();
  for (let m = re.exec(w); m !== null; m = re.exec(w)) seen.add(`${m[2]}|${m[3]}`);
  return seen.size;
}

const rows = await sql<{ id: string; court: string; head: string }[]>`
  SELECT DISTINCT ON (j.id) j.id, j.court, left(j.full_text, ${W}) AS head
    FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
   WHERE mod(abs(hashtext(j.id::text)), 251) = 5
     AND j.full_text IS NOT NULL
   LIMIT 12000`;

let shown = 0;
for (const r of rows) {
  const w = r.head;
  if (!CONN.test(w)) continue;
  const upper = count(S_LONG, w);
  const ci = count(I_LONG, w);
  if (!(upper <= 1 && ci >= 2)) continue;
  console.log('='.repeat(72));
  console.log(r.id, '|', r.court, '| upperGrammar', upper, '| caseInsensitive', ci);
  console.log(w.split(/\r?\n/).slice(0, 12).join('\n'));
  if (++shown >= 8) break;
}
console.log(`\nscanned ${rows.length} key-bearing judgments, printed ${shown}`);
await sql.end();
