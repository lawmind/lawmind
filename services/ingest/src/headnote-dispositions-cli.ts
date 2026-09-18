/**
 * `npx tsx --env-file=.env services/ingest/src/headnote-dispositions-cli.ts`
 *
 * Measures how many `overruled` relationships the citation extractor is missing,
 * and harvests the SCR↔SCC concordance printed in the same lists.
 *
 * **WRITES NOTHING.** `docs/ai/OVERRULED_GROUP_MARKERS.md` sets out why: this
 * touches `overruled_status`, whose stale threshold is ZERO, over a population
 * of 45 judgments — small enough that a human reads the output, which makes
 * writing automatically a choice rather than a necessity.
 *
 * `RING_PROGRAM.md` §2a: test the component against the failing population
 * before rewriting it. This IS that test. The `edges=0` incident cost days
 * because a working extractor was rewritten on an assumption; the assumption
 * here — "the marker scopes the group" — is checked against real text first.
 */
import { openDb } from './db-host.ts';
import type { HeadnoteEntry } from './headnote-dispositions.ts';
import {
  ADVERSE_DISPOSITIONS,
  concordancePairs,
  parseHeadnoteDispositions,
} from './headnote-dispositions.ts';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
  process.exit(2);
}

const sql = await openDb(dbUrl, 3);

const judgments = await sql<
  { id: string; neutral_citation: string | null; case_title: string; full_text: string }[]
>`
  SELECT id, neutral_citation, case_title, full_text
  FROM judgments
  WHERE full_text LIKE '%– overruled.%'
  ORDER BY judgment_date DESC NULLS LAST`;

console.log(`${judgments.length} judgments carry a grouped "– overruled." marker.\n`);

let totalAdverse = 0;
let wouldHaveCaught = 0;
const pairs = new Map<string, { scr: string; name: string; from: string }>();
const adverseAll: (HeadnoteEntry & { from: string })[] = [];

for (const j of judgments) {
  const entries = parseHeadnoteDispositions(j.full_text ?? '');
  if (entries.length === 0) continue;

  const adverse = entries.filter((e) => ADVERSE_DISPOSITIONS.has(e.disposition));
  if (adverse.length > 0) {
    totalAdverse += adverse.length;
    wouldHaveCaught += adverse.filter((e) => e.lastInGroup).length;
    const label = j.neutral_citation ?? j.case_title.slice(0, 40);
    for (const e of adverse) adverseAll.push({ ...e, from: label });

    console.log(
      `${label}  —  ${adverse.length} adverse, ${adverse.filter((e) => e.lastInGroup).length} caught today`,
    );
    for (const e of adverse) {
      console.log(
        `   ${e.lastInGroup ? '[caught]' : '[MISSED]'} ${e.disposition.padEnd(10)} ${(e.scc ?? e.scr ?? '?').padEnd(24)} ${e.name.slice(0, 52)}`,
      );
    }
  }

  for (const p of concordancePairs(entries)) {
    if (!pairs.has(p.scc))
      pairs.set(p.scc, { scr: p.scr, name: p.name, from: j.neutral_citation ?? j.id });
  }
}

console.log(`\n${'='.repeat(78)}`);
console.log(
  `ADVERSE DISPOSITIONS: ${totalAdverse} found · ${wouldHaveCaught} the extractor catches today`,
);
console.log(`MISSED: ${totalAdverse - wouldHaveCaught}`);
console.log(`CONCORDANCE PAIRS (SCR↔SCC): ${pairs.size} distinct`);

/**
 * The question that decides whether any of this is actionable: do the missed
 * cases correspond to judgments we actually HOLD? A missed `overruled` on a
 * judgment we do not have is a graph gap; on one we DO have, it is an authority
 * currently rendering as good law.
 */
const sccList = adverseAll.map((a) => a.scc).filter((s): s is string => Boolean(s));
if (sccList.length > 0) {
  const held = await sql<{ n: number }[]>`
    SELECT count(*)::int n FROM judgment_citations
    WHERE normalised_citation = ANY(${sccList}) AND cited_judgment_id IS NOT NULL`;
  console.log(
    `\nof ${sccList.length} adverse SCC citations, ${held[0]?.n ?? 0} already resolve to a held judgment`,
  );
}

// Do the harvested pairs actually unlock the 34 unresolved overruled edges?
const unresolved = await sql<{ normalised_citation: string; citation_text: string }[]>`
  SELECT DISTINCT normalised_citation, citation_text
  FROM judgment_citations
  WHERE relationship IN ('overruled','overruled_in_part','doubted') AND cited_judgment_id IS NULL`;

const unlocked = unresolved.filter((u) => pairs.has(u.normalised_citation));
console.log(
  `\nUNRESOLVED adverse edges: ${unresolved.length} · with a harvested SCR form: ${unlocked.length}`,
);
for (const u of unlocked.slice(0, 20)) {
  const p = pairs.get(u.normalised_citation)!;
  console.log(
    `   ${u.normalised_citation.padEnd(24)} -> ${p.scr.padEnd(22)} ${p.name.slice(0, 44)}`,
  );
}

console.log('\nNothing was written. This is a report.');
await sql.end();
