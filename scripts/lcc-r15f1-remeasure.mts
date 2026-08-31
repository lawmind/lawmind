/**
 * LCC R15-F1 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * The gate is re-measured on TWO populations, against the SHIPPED module rather
 * than against a copy of it, so the numbers are about the artifact:
 *
 *   1. NEW2's temporal holdout (T0 2026-08-18) — the same 226 keys, the same 180
 *      reachable positives and the same 2,295 controls the previous LCC round
 *      used, so before/after is one comparison and not two rounds.
 *   2. NEW2's own R15 blind package — the 472 would-be-`UNIQUE` rows on which
 *      the gate was REACHED and saw nothing (bus 1637). That is the population
 *      the defect was reported on, and a fix measured only on the holdout would
 *      never have to face it.
 *
 * The pre-fix grammar is frozen inline, verbatim from `cohort.ts` at `93ca23f4`.
 *
 *   pnpm exec tsx scripts/lcc-r15f1-remeasure.mts [controlSample]
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import {
  CAUSE_TITLE_CHARS,
  cohortBlocksUnique,
  cohortVerdict,
  declaredCohort,
} from '../services/api/src/citations/cohort.ts';

const T0 = '2026-08-18';
const W = CAUSE_TITLE_CHARS;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

// ─────────────────── the pre-fix grammar, frozen at 93ca23f4 ───────────────────
const S_LONG =
  /([A-Z][A-Z.&'-]*(?:[ \t]+[A-Z][A-Z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/g;
const S_SLASH = /([A-Z][A-Z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/g;
const S_CONN = [
  /\bC\s*\/\s*W\b/i,
  /\bA\s*\/\s*W\b/i,
  /\bconnected\s+with\b/i,
  /\balong\s*with\b/i,
  /(^|\n)\s*with\b/i,
];
const S_PARENT = /\b(?:IN|ARISING\s+(?:OUT\s+)?(?:OF|FROM)|FROM)[ \t]*$/i;
const S_NOT =
  /^(SECTION|SECTIONS|ACT|ACTS|ARTICLE|ARTICLES|RULE|RULES|ORDER|ORDERS|CHAPTER|PART|SCHEDULE|CLAUSE|REGULATION|NOTIFICATION|AMENDMENT|ANNEXURE|PARA|PARAGRAPH|VOLUME|PAGE|EDITION|ITEM)$/;

function preFixDeclared(head: string | null | undefined): number {
  if (!head) return 0;
  const w = head.slice(0, W);
  const found = new Set<string>();
  for (const re of [S_LONG, S_SLASH]) {
    re.lastIndex = 0;
    for (let m = re.exec(w); m !== null; m = re.exec(w)) {
      if (S_PARENT.test(w.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (/^(?:IN|ARISING|FROM)\b/i.test(m[1]!.trim())) continue;
      const t = m[1]!.trim().split(/[ \t]+/).slice(-2).join('').toUpperCase().replace(/[^A-Z]/g, '');
      if (t.length === 0 || S_NOT.test(t)) continue;
      found.add(`${t}|${m[2]!.replace(/^0+/, '') || '0'}|${m[3]}`);
    }
  }
  return found.size;
}
const preFixBlocks = (head: string, held: number) =>
  S_CONN.some((r) => r.test(head.slice(0, W))) && preFixDeclared(head) > held;

// ───────────────────────────── population 1: holdout ───────────────────────────
type Row = { citation_key: string; head: string; same_court: boolean; same_date: boolean };

const positives = await sql<Row[]>`
  WITH shape AS (
    SELECT f.citation_key,
           count(DISTINCT j.court) = 1 AS same_court,
           count(DISTINCT j.judgment_date) = 1 AS same_date
      FROM lcc_r15_falseunique f
      JOIN judgment_citation_keys k ON k.citation_key = f.citation_key
      JOIN judgments j ON j.id = k.judgment_id
     GROUP BY f.citation_key
  )
  SELECT DISTINCT ON (s.citation_key) s.citation_key, s.same_court, s.same_date,
         left(j.full_text, 2400) AS head
    FROM shape s
    JOIN judgment_citation_keys k ON k.citation_key = s.citation_key AND k.created_at < ${T0}::timestamptz
    JOIN judgments j ON j.id = k.judgment_id
   ORDER BY s.citation_key, k.created_at`;

const controls = await sql<{ citation_key: string; head: string }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), still AS (
    SELECT k.citation_key, min(k.judgment_id::text) AS jid
      FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) = 1
  )
  SELECT s.citation_key, left(j.full_text, 2400) AS head
    FROM still s JOIN judgments j ON j.id = s.jid::uuid
   WHERE mod(abs(hashtext(s.citation_key)), 397) = 11
   LIMIT ${Number(process.argv[2] ?? 6000)}`;

const reachable = positives.filter((p) => p.same_court && p.same_date);
const nowPos = reachable.filter((p) => cohortBlocksUnique(declaredCohort(p.head), 1)).length;
const wasPos = reachable.filter((p) => preFixBlocks(p.head, 1)).length;
const nowCtl = controls.filter((c) => cohortBlocksUnique(declaredCohort(c.head), 1)).length;
const wasCtl = controls.filter((c) => preFixBlocks(c.head, 1)).length;
const nowRead = controls.filter((c) => declaredCohort(c.head).declaredMatters >= 1).length;
const wasRead = controls.filter((c) => preFixDeclared(c.head) >= 1).length;
const unreadable = controls.filter(
  (c) => cohortVerdict(declaredCohort(c.head), 1) === 'INSUFFICIENT_TO_PROVE_UNIQUE',
).length;

// ─────────────────── population 2: NEW2's R15 blind package ────────────────────
const adjudicated = readFileSync('docs/ai/new2-r15/falsifier-adjudicated.jsonl', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as { resolverState: string; pinned: string | null; key: string | null });
const uniqueRows = adjudicated.filter((r) => r.resolverState === 'UNIQUE' && r.pinned);
const pinnedIds = [...new Set(uniqueRows.map((r) => r.pinned!))];

const pinnedHeads = new Map<string, string | null>();
for (let i = 0; i < pinnedIds.length; i += 200) {
  const rows = await sql<{ id: string; head: string | null }[]>`
    SELECT id::text, left(full_text, ${W}) AS head
      FROM judgments WHERE id = ANY(${pinnedIds.slice(i, i + 200)}::uuid[])`;
  for (const r of rows) pinnedHeads.set(r.id, r.head);
}

const hist = { pre: {} as Record<string, number>, post: {} as Record<string, number> };
let n2NowRefused = 0;
let n2WasRefused = 0;
let n2Unreadable = 0;
for (const r of uniqueRows) {
  const head = pinnedHeads.get(r.pinned!) ?? null;
  const d = declaredCohort(head);
  const pre = preFixDeclared(head);
  hist.pre[String(pre)] = (hist.pre[String(pre)] ?? 0) + 1;
  hist.post[String(d.declaredMatters)] = (hist.post[String(d.declaredMatters)] ?? 0) + 1;
  if (!d.causeTitleAvailable) n2Unreadable++;
  if (cohortBlocksUnique(d, 1)) n2NowRefused++;
  if (head && preFixBlocks(head, 1)) n2WasRefused++;
}

const out = {
  measuredAt: new Date().toISOString(),
  t0: T0,
  causeTitleChars: W,
  holdout: {
    COHORT_TITLES_SCANNED: controls.length,
    COHORT_TITLES_RECOGNIZED: { preFix: wasRead, postFix: nowRead },
    WOULD_BE_UNIQUE_ROWS: controls.length + reachable.length,
    positives: positives.length,
    positivesReachable: reachable.length,
    positivesOutOfScope: positives.length - reachable.length,
    REACHABLE_FALSE_UNIQUE_CLOSED: { preFix: wasPos, postFix: nowPos, of: reachable.length },
    RECALL_COST_KEYS: { preFix: wasCtl, postFix: nowCtl, of: controls.length },
    UNREADABLE_FAIL_CLOSED: unreadable,
  },
  new2BlindPackage: {
    source: 'docs/ai/new2-r15/falsifier-adjudicated.jsonl',
    WOULD_BE_UNIQUE_ROWS: uniqueRows.length,
    distinctPinnedJudgments: pinnedIds.length,
    declaredMattersHistogram: hist,
    UNIQUE_WITHHELD_BY_COHORT: { preFix: n2WasRefused, postFix: n2NowRefused },
    UNREADABLE_FAIL_CLOSED: n2Unreadable,
  },
};

console.log('── NEW2 temporal holdout, T0', T0, '─────────────────────────────');
console.log(`COHORT_TITLES_SCANNED            ${controls.length}`);
console.log(
  `COHORT_TITLES_RECOGNIZED         ${wasRead} -> ${nowRead}` +
    `  (${((wasRead / controls.length) * 100).toFixed(1)}% -> ${((nowRead / controls.length) * 100).toFixed(1)}%)`,
);
console.log(`REACHABLE_FALSE_UNIQUE_CLOSED    ${wasPos} -> ${nowPos}  of ${reachable.length}`);
console.log(`RECALL_COST_KEYS                 ${wasCtl} -> ${nowCtl}  of ${controls.length}`);
console.log(`UNREADABLE_FAIL_CLOSED           ${unreadable}`);
console.log('\n── NEW2 R15 blind package (the population the defect was found on) ──');
console.log(`WOULD_BE_UNIQUE_ROWS             ${uniqueRows.length}`);
console.log(`distinct pinned judgments        ${pinnedIds.length}`);
console.log(`declaredMatters pre-fix          ${JSON.stringify(hist.pre)}`);
console.log(`declaredMatters post-fix         ${JSON.stringify(hist.post)}`);
console.log(`UNIQUE_WITHHELD_BY_COHORT        ${n2WasRefused} -> ${n2NowRefused}`);
console.log(`UNREADABLE_FAIL_CLOSED           ${n2Unreadable}`);

mkdirSync('docs/ai/lcc-r15f1', { recursive: true });
writeFileSync('docs/ai/lcc-r15f1/remeasure.json', JSON.stringify(out, null, 2) + '\n');
console.log('\nwrote docs/ai/lcc-r15f1/remeasure.json');
await sql.end();
