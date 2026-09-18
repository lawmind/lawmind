/** Pre-apply check: where the headnote pass and the deployed adjacency pass
 *  produce the same alias_key, do they name the SAME judgment? A disagreement
 *  is a citation pointing two ways, which is the one thing this must never do. */
import { aliasKey, reconcile, type ParallelPair } from './concordance.ts';
import { openDb } from './db-host.ts';
import { concordancePairs, parseHeadnoteDispositions } from './headnote-dispositions.ts';

const sql = await openDb(process.env['DATABASE_URL']!, 3);
const PAIRED = String.raw`SCR [0-9]+ : \([0-9]{4}\)`;
const js = await sql<{ id: string; neutral_citation: string | null; full_text: string }[]>`
  SELECT id, neutral_citation, full_text FROM judgments WHERE full_text ~ ${PAIRED}`;
const sightings: ParallelPair[] = [];
for (const j of js)
  for (const p of concordancePairs(parseHeadnoteDispositions(j.full_text ?? '')))
    sightings.push({ alias: p.scc, aliasReporter: 'SCC', scr: p.scr, evidence: p.name });
const cands = reconcile(sightings);

const holders = await sql<{ id: string; reporter_citations: string[] | null }[]>`
  SELECT id::text, reporter_citations FROM judgments
   WHERE reporter_citations IS NOT NULL AND array_length(reporter_citations,1) > 0`;
const keyToIds = new Map<string, Set<string>>();
for (const h of holders)
  for (const rc of h.reporter_citations ?? []) {
    const k = aliasKey(rc);
    if (!k) continue;
    (keyToIds.get(k) ?? keyToIds.set(k, new Set()).get(k)!).add(h.id);
  }
const mine = new Map<string, string>();
for (const c of cands) {
  const ids = keyToIds.get(c.scrKey);
  if (ids?.size === 1) mine.set(c.aliasKey, [...ids][0]!);
}

const existing = await sql<{ alias_key: string; judgment_id: string }[]>`
  SELECT alias_key, judgment_id::text FROM judgment_citation_aliases
   WHERE alias_key = ANY(${[...mine.keys()]})`;
let agree = 0;
const disagree: string[] = [];
for (const e of existing) {
  if (mine.get(e.alias_key) === e.judgment_id) agree++;
  else disagree.push(e.alias_key);
}
console.log(`overlapping alias_keys: ${existing.length}`);
console.log(`  AGREE on the judgment:    ${agree}`);
console.log(`  DISAGREE:                 ${disagree.length}`);
for (const d of disagree.slice(0, 12))
  console.log(
    `     ${d}  mine=${mine.get(d)?.slice(0, 8)}  theirs=${existing.find((e) => e.alias_key === d)?.judgment_id.slice(0, 8)}`,
  );
await sql.end();
