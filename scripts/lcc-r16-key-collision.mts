/**
 * LCC R16 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * THE NEGATIVE ATTACK ON `serial|year`, RUN ON PURPOSE AND ON A WIDER FIELD.
 *
 * `matterKey` in `services/api/src/citations/cohort.ts` dropped the matter TYPE
 * from a matter's identity, keying on `serial|year` alone. That choice decides
 * which way the gate fails:
 *
 *   TYPE|serial|year  counts one matter printed under two names as TWO.
 *                     Over-counting REFUSES — a recall cost, safe.
 *   serial|year       counts them as ONE. Under-counting lets a genuine
 *                     two-matter cohort through — a WRONG PIN, not safe.
 *
 * R15-F1 shipped the collapse having enumerated 623 events over 2,521
 * documents, all 25 type pairs an abbreviation beside its own expansion. 2,521
 * documents is a thin denominator on which to clear a fail-OPEN risk, and "no
 * collision found in the examples" is not the claim "no collision exists". This
 * re-runs the attack over a deterministic 1-in-10 sample of every key-bearing
 * judgment — a denominator two orders of magnitude wider.
 *
 * It does NOT introduce a fourth cohort grammar. The authoritative half — did
 * the SHIPPED parser actually collapse these two into one matter, and could the
 * gate have fired on this document at all — is answered by importing
 * `declaredCohort` and reading its output. This file's own regex is deliberately
 * BROADER and unanchored: its only job is to over-collect candidates, and
 * over-collection is the safe direction when the goal is to prove an absence.
 *
 *   pnpm exec tsx scripts/lcc-r16-key-collision.mts [modulus] [residue]
 */
import postgres from 'postgres';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CAUSE_TITLE_CHARS, declaredCohort } from '../services/api/src/citations/cohort.ts';

const MOD = Number(process.argv[2] ?? 10);
const RES = Number(process.argv[3] ?? 3);
const W = CAUSE_TITLE_CHARS;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 60, connect_timeout: 20 });

/** Deliberately broad and UNANCHORED — over-collects candidates on purpose. */
const BROAD_LONG =
  /([A-Za-z][A-Za-z.&'/\d-]*(?:[ \t]+[A-Za-z0-9][A-Za-z.&'/\d-]*){0,5})[ \t]*(?:Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|\/)[ \t]*((?:19|20)\d{2})\b/gi;
const BROAD_SLASH =
  /([A-Za-z][A-Za-z.&'-]{0,20})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/gi;

/** The WHOLE captured type, normalised — never the two-word token. */
const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The broad net captures text the SHIPPED parser never treats as a type, and
 * leaving it in manufactures collisions the gate cannot make.
 *
 *   `C/W WP No. 18599 of 2024`  — `segmentsOf` SPLITS on the conjunction, so the
 *                                 shipped type is `WP`, not `C/W WP`.
 *   `IN MFA NO.103418 OF 2014`  — `PARENT_LEADING` DISCARDS this outright: a
 *                                 matter introduced by `IN` is the proceeding
 *                                 this one arises from, not a sibling.
 *
 * Both are stripped here so the two parsers are comparing the same thing. The
 * `IN` form is dropped rather than cleaned, exactly as the shipped parser drops
 * it.
 */
const LEADING_CONNECTOR = /^(?:C\s*\/\s*W|A\s*\/\s*W|connected\s+with|along\s*with|with)\b[\s.:-]*/i;
const PARENT_LED = /^(?:IN|ARISING|FROM)\b/i;
const cleanType = (s: string): string | null => {
  const t = s.trim().replace(LEADING_CONNECTOR, '').trim();
  if (t.length === 0 || PARENT_LED.test(t)) return null;
  return t;
};
/** The type's words, for the abbreviation test. */
const words = (s: string) =>
  s
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0);

/**
 * Is `a` plausibly an abbreviation of `b`, or the reverse?
 *
 * Two deterministic tests. No similarity score, no threshold, no embedding:
 *   1. CONTAINMENT — every word of the short form is a word of the long form.
 *      `CRIMINAL APPEAL` beside `D.B. CRIMINAL APPEAL`.
 *   2. SUBSEQUENCE — the short form's letters appear in the long form's letters,
 *      in order. `MFA` inside `MISCELLANEOUSFIRSTAPPEAL`; `CRLP` inside
 *      `CRIMINALPETITION`. This replaced a strict initials test, which could not
 *      see `CRL.P` in `CRIMINAL PETITION` because the abbreviation takes three
 *      letters from one word, and so called every real abbreviation a collision.
 *
 * Anything failing both is reported as a POSSIBLE genuine collision and read by
 * hand. The test is deliberately GENEROUS: a generous SAFE test makes the unsafe
 * list an UPPER BOUND, which is the only direction that cannot hide a collision.
 */
function abbreviationOf(a: string, b: string): boolean {
  const [shortS, longS] = norm(a).length <= norm(b).length ? [a, b] : [b, a];
  const lw = words(longS);
  const sw = words(shortS);
  if (sw.length > 0 && sw.every((w) => lw.includes(w))) return true;
  const letters = norm(shortS);
  const hay = norm(longS);
  if (letters.length === 0) return false;
  let i = 0;
  for (const ch of hay) if (i < letters.length && letters[i] === ch) i++;
  return i === letters.length;
}

const rows = sql<{ id: string; head: string | null }[]>`
  SELECT j.id::text AS id, left(j.full_text, ${W}) AS head
    FROM judgments j
   WHERE j.id IN (SELECT DISTINCT judgment_id FROM judgment_citation_keys)
     AND mod(abs(hashtext(j.id::text)), ${MOD}) = ${RES}
     AND j.full_text IS NOT NULL`.cursor(2000);

type Event = {
  judgmentId: string;
  serialYear: string;
  types: string[];
  raws: string[];
  connector: string | null;
  shippedDeclaredMatters: number;
  shippedCollapsed: boolean;
  safeAbbreviation: boolean;
};

const events: Event[] = [];
const pairCount = new Map<string, number>();
let documentsRead = 0;
let documentsWithCollision = 0;
let documentsWithConnector = 0;
let collapsedWithConnector = 0;

for await (const batch of rows) {
  for (const r of batch) {
    const head = r.head ?? '';
    if (head.trim().length === 0) continue;
    documentsRead++;
    const window = head.slice(0, W);

    // Keyed by the NORMALISED type so one spelling counts once, but carrying the
    // court's RAW type text — the abbreviation test needs the word boundaries
    // that normalising destroys. `WP` against `WRITPETITION` has the initials
    // `W`, and testing the normalised forms called every real abbreviation a
    // collision.
    const bySy = new Map<string, Map<string, { rawType: string; rawMatch: string }>>();
    for (const re of [BROAD_LONG, BROAD_SLASH]) {
      re.lastIndex = 0;
      for (let m = re.exec(window); m !== null; m = re.exec(window)) {
        const type = cleanType(m[1]!);
        if (type === null || norm(type).length === 0) continue;
        const serial = m[2]!.replace(/^0+/, '') || '0';
        const sy = `${serial}|${m[3]}`;
        const types = bySy.get(sy) ?? new Map<string, { rawType: string; rawMatch: string }>();
        if (!types.has(norm(type))) types.set(norm(type), { rawType: type, rawMatch: m[0]!.trim() });
        bySy.set(sy, types);
      }
    }

    const shipped = declaredCohort(head);
    if (shipped.connector !== null) documentsWithConnector++;
    const shippedKeys = new Set(shipped.matters.map((mm) => mm.key));

    let any = false;
    for (const [sy, typeMap] of bySy) {
      if (typeMap.size < 2) continue;
      const types = [...typeMap.keys()];
      const rawTypes = [...typeMap.values()].map((v) => v.rawType);
      let safe = true;
      for (let i = 0; i < rawTypes.length && safe; i++)
        for (let j = i + 1; j < rawTypes.length && safe; j++)
          if (!abbreviationOf(rawTypes[i]!, rawTypes[j]!)) safe = false;

      const collapsed = shippedKeys.has(sy);
      any = true;
      if (collapsed && shipped.connector !== null) collapsedWithConnector++;
      for (let i = 0; i < types.length; i++)
        for (let j = i + 1; j < types.length; j++) {
          const k = [types[i], types[j]].sort().join(' + ');
          pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
        }
      events.push({
        judgmentId: r.id,
        serialYear: sy,
        types,
        raws: [...typeMap.values()].map((v) => v.rawMatch),
        connector: shipped.connector,
        shippedDeclaredMatters: shipped.declaredMatters,
        shippedCollapsed: collapsed,
        safeAbbreviation: safe,
      });
    }
    if (any) documentsWithCollision++;
  }
}

const unsafe = events.filter((e) => !e.safeAbbreviation);
const fireable = unsafe.filter((e) => e.shippedCollapsed && e.connector !== null);

const out = {
  measuredAt: new Date().toISOString(),
  scope: `key-bearing judgments, deterministic hash sample mod ${MOD} = ${RES}`,
  causeTitleChars: W,
  SERIAL_YEAR_COLLISION_SAMPLE: documentsRead,
  DOCUMENTS_WITH_CONNECTOR: documentsWithConnector,
  DOCUMENTS_WITH_COLLISION: documentsWithCollision,
  COLLISION_EVENTS: events.length,
  COLLAPSED_BY_SHIPPED_PARSER_WITH_A_CONNECTOR: collapsedWithConnector,
  SAFE_ABBREVIATION_EVENTS: events.length - unsafe.length,
  SERIAL_YEAR_REAL_COLLISIONS: unsafe.length,
  REAL_COLLISIONS_THAT_COULD_CHANGE_THE_GATE: fireable.length,
  distinctTypePairs: [...pairCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pair, n]) => ({ pair, n })),
  possibleRealCollisions: unsafe.slice(0, 500),
  possibleRealCollisionsThatCouldChangeTheGate: fireable.slice(0, 500),
};

console.log(`SERIAL_YEAR_COLLISION_SAMPLE                     ${documentsRead}`);
console.log(`DOCUMENTS_WITH_CONNECTOR                         ${documentsWithConnector}`);
console.log(`DOCUMENTS_WITH_COLLISION                         ${documentsWithCollision}`);
console.log(`COLLISION_EVENTS                                 ${events.length}`);
console.log(`  collapsed by the shipped parser, connector set  ${collapsedWithConnector}`);
console.log(`SAFE_ABBREVIATION_EVENTS                         ${events.length - unsafe.length}`);
console.log(`SERIAL_YEAR_REAL_COLLISIONS (upper bound)        ${unsafe.length}`);
console.log(`  of those that could change the gate           ${fireable.length}`);
console.log(`distinct type pairs                              ${pairCount.size}`);
console.log('\ntop pairs:');
for (const { pair, n } of out.distinctTypePairs.slice(0, 25))
  console.log(`  ${String(n).padStart(6)}  ${pair}`);
console.log('\nfirst possible real collisions that could change the gate:');
for (const e of fireable.slice(0, 25))
  console.log(`  ${e.judgmentId}  ${e.serialYear.padEnd(12)} ${e.connector}  ${JSON.stringify(e.raws)}`);

mkdirSync('docs/ai/lcc-r16', { recursive: true });
writeFileSync('docs/ai/lcc-r16/key-collision.json', JSON.stringify(out, null, 2) + '\n');
console.log('\nwrote docs/ai/lcc-r16/key-collision.json');
await sql.end();
