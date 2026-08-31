/**
 * LCC R15-F1 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * Two residues, both re-derived against the CORRECTED parser rather than carried
 * forward from the round that used the broken one.
 *
 * §5 THE UNREACHABLE MISSES. The previous round reported 83 of 180 reachable
 * false uniques as unreachable from any document we hold, because the court
 * issued SEPARATE orders under one neutral citation and each declares only its
 * own matter. That claim was made with a parser that could not read a title-case
 * cause title, so it is re-tested, not restated: for every miss, the T0 bearer's
 * cause title is searched for the SIBLING's own case number. Named but uncounted
 * is a parser defect. Not named at all is a data-contract gap.
 *
 * §6 THE OTHER 46. 43 same-court/different-date and 3 cross-court cases where a
 * judgment appears to carry ANOTHER judgment's neutral citation. Not a cohort,
 * not fixable in the resolver, and NOT folded into this gate's success metric.
 * Their exact identities are written out for NEW2.
 *
 *   pnpm exec tsx scripts/lcc-r15f1-residue.mts
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

import { CAUSE_TITLE_CHARS, cohortBlocksUnique, declaredCohort } from '../services/api/src/citations/cohort.ts';

const T0 = '2026-08-18';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

type Bearer = {
  citation_key: string;
  id: string;
  court: string;
  judgment_date: string;
  case_title: string | null;
  case_number: string | null;
  head: string | null;
  landed_at: string;
  same_court: boolean;
  same_date: boolean;
};

const bearers = await sql<Bearer[]>`
  WITH shape AS (
    SELECT f.citation_key,
           count(DISTINCT j.court) = 1 AS same_court,
           count(DISTINCT j.judgment_date) = 1 AS same_date
      FROM lcc_r15_falseunique f
      JOIN judgment_citation_keys k ON k.citation_key = f.citation_key
      JOIN judgments j ON j.id = k.judgment_id
     GROUP BY f.citation_key
  )
  SELECT s.citation_key, s.same_court, s.same_date,
         j.id::text, j.court, j.judgment_date::text AS judgment_date,
         j.case_title, j.case_number,
         left(j.full_text, ${CAUSE_TITLE_CHARS}) AS head,
         k.created_at::text AS landed_at
    FROM shape s
    JOIN judgment_citation_keys k ON k.citation_key = s.citation_key
    JOIN judgments j ON j.id = k.judgment_id
   ORDER BY s.citation_key, k.created_at`;

const byKey = new Map<string, Bearer[]>();
for (const b of bearers) {
  const e = byKey.get(b.citation_key) ?? [];
  e.push(b);
  byKey.set(b.citation_key, e);
}

/** `WP/11668/2020` -> the serial|year the parser keys a declared matter by. */
function serialYearOf(caseNumber: string | null): string | null {
  if (!caseNumber) return null;
  const m = /(\d{1,7})\s*\/\s*((?:19|20)\d{2})\s*$/.exec(caseNumber.trim());
  if (!m) return null;
  return `${m[1]!.replace(/^0+/, '') || '0'}|${m[2]}`;
}

// ───────────────────────────────── §5 ─────────────────────────────────────────
const reachable: { key: string; bearers: Bearer[] }[] = [];
const outOfScope: { key: string; bearers: Bearer[] }[] = [];
for (const [key, bs] of byKey) {
  (bs[0]!.same_court && bs[0]!.same_date ? reachable : outOfScope).push({ key, bearers: bs });
}

const caught: string[] = [];
/** The court printed NO conjunction. The gate requires one by design — this is
 *  not the parser failing to see a matter, it is the court not joining any. */
const missNoConnector: unknown[] = [];
/** A conjunction WAS printed and the sibling's own serial/year appears in the
 *  cause title, yet the parser did not count it. These are reachable. */
const missNamedButUncounted: unknown[] = [];
/** A conjunction was printed and the sibling is nowhere in the document. No
 *  amount of reading judgment A reveals judgment B — the data-contract gap. */
const missNotNamed: unknown[] = [];

for (const { key, bearers: bs } of reachable) {
  const t0Bearer = bs.find((b) => b.landed_at < T0) ?? bs[0]!;
  const d = declaredCohort(t0Bearer.head);
  if (cohortBlocksUnique(d, 1)) {
    caught.push(key);
    continue;
  }
  const siblings = bs.filter((b) => b.id !== t0Bearer.id);
  const head = t0Bearer.head ?? '';
  const record = {
    citationKey: key,
    t0BearerId: t0Bearer.id,
    t0CaseNumber: t0Bearer.case_number,
    court: t0Bearer.court,
    connector: d.connector,
    declaredMatters: d.declaredMatters,
    declaredKeys: d.matters.map((m) => m.key),
    siblingCaseNumbers: siblings.map((s) => s.case_number),
  };
  const namesSibling = (b: Bearer[], head: string, self: Bearer) =>
    b.filter((x) => {
      const sy = serialYearOf(x.case_number);
      if (!sy) return false;
      const [serial, year] = sy.split('|');
      if (serial === serialYearOf(self.case_number)?.split('|')[0]) return false;
      return new RegExp(
        `\b${serial}\s*/\s*${year}\b|\bNos?\.?\s*[-.:]?\s*${serial}\s+of\s+${year}\b`,
        'i',
      ).test(head);
    });
  if (d.connector === null) {
    const n = namesSibling(siblings, head, t0Bearer);
    missNoConnector.push({ ...record, siblingNamedAnyway: n.length > 0, namedSiblings: n.map((x) => x.case_number) });
    continue;
  }
  // The sibling must appear in a DECLARATION shape — `No. 1234 of 2020` or
  // `1234/2020` — not merely as two numbers that happen to sit near each other.
  // A loose proximity match reported eight of these as reachable when half of
  // them had printed no conjunction at all.
  const named = siblings.filter((s) => {
    const sy = serialYearOf(s.case_number);
    if (!sy) return false;
    const [serial, year] = sy.split('|');
    if (serial === serialYearOf(t0Bearer.case_number)?.split('|')[0]) return false;
    return new RegExp(
      `\\b${serial}\\s*/\\s*${year}\\b|\\bNos?\\.?\\s*[-.:]?\\s*${serial}\\s+of\\s+${year}\\b`,
      'i',
    ).test(head);
  });
  if (named.length > 0)
    missNamedButUncounted.push({ ...record, namedSiblings: named.map((s) => s.case_number) });
  else missNotNamed.push(record);
}

// ───────────────────────────────── §6 ─────────────────────────────────────────
const other46 = outOfScope.map(({ key, bearers: bs }) => ({
  citationKey: key,
  class: bs[0]!.same_court ? 'SAME_COURT_DIFFERENT_DATE' : 'CROSS_COURT',
  bearers: bs.map((b) => ({
    judgmentId: b.id,
    court: b.court,
    judgmentDate: b.judgment_date,
    caseNumber: b.case_number,
    caseTitle: b.case_title,
    keyLandedAt: b.landed_at,
  })),
}));
const crossCourt = other46.filter((o) => o.class === 'CROSS_COURT');
const sameCourtDifferentDate = other46.filter((o) => o.class === 'SAME_COURT_DIFFERENT_DATE');

console.log('── §5 the reachable class, re-derived against the corrected parser ──');
console.log(`reachable positives              ${reachable.length}`);
console.log(`caught by the gate               ${caught.length}`);
const noConnNamed = (missNoConnector as { siblingNamedAnyway: boolean }[]).filter((m) => m.siblingNamedAnyway).length;
console.log(`missed, court printed NO conjunction ${missNoConnector.length}  <- gate requires one by design`);
console.log(`   of those, sibling named anyway    ${noConnNamed}  <- reachable only by dropping the connector`);
console.log(`   of those, sibling NOT named       ${missNoConnector.length - noConnNamed}  <- data-contract gap`);
console.log(`missed, conjunction + sibling NAMED  ${missNamedButUncounted.length}  <- parser could reach these`);
console.log(`missed, conjunction + NOT named      ${missNotNamed.length}  <- data-contract gap`);
console.log('\n── §6 the other class, not this gate\'s ──');
console.log(`out of scope total               ${outOfScope.length}`);
console.log(`  same court, different date     ${sameCourtDifferentDate.length}`);
console.log(`  cross court                    ${crossCourt.length}`);

for (const m of missNamedButUncounted.slice(0, 8)) console.log('  NAMED-BUT-UNCOUNTED', JSON.stringify(m));

mkdirSync('docs/ai/lcc-r15f1', { recursive: true });
writeFileSync(
  'docs/ai/lcc-r15f1/residue.json',
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      t0: T0,
      causeTitleChars: CAUSE_TITLE_CHARS,
      reachable: {
        total: reachable.length,
        caught: caught.length,
        missedNoConnector: missNoConnector.length,
        missedSiblingNamed: missNamedButUncounted.length,
        missedSiblingNotNamed: missNotNamed.length,
        noConnector: missNoConnector,
        namedButUncounted: missNamedButUncounted,
        notNamed: missNotNamed,
      },
      outOfScope: {
        total: outOfScope.length,
        sameCourtDifferentDate: sameCourtDifferentDate.length,
        crossCourt: crossCourt.length,
        cases: other46,
      },
    },
    null,
    2,
  ) + '\n',
);
console.log('\nwrote docs/ai/lcc-r15f1/residue.json');
await sql.end();
