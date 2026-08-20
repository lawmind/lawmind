/**
 * NEW1 — is the retrieval ceiling a property of the RETRIEVER or of how the
 * queries were built?
 *
 * `docs/ai/NEW1_CROSSLINGUAL.md` closed the language question — BGE-M3 does
 * retrieve English judgments from Hindi questions — and left a sharper one open
 * in its own text: Hindi out-scored English 2:1 on the same five gold judgments,
 * and the two sides were not the same KIND of text.
 *
 *   the Hindi rows are hand-authored restatements of one legal issue;
 *   the English rows are raw citing passages cut from a later judgment, carrying
 *   procedural furniture, party names and cross-references.
 *
 * So the comparison as run was "a clean issue statement against a real passage",
 * and the clean statement won. That was recorded as INFER, not KNOW, with the
 * follow-up named: author English restatements of the same five issues and run
 * all three arms.
 *
 * THE THIRD ARM ALREADY EXISTED AS DATA
 * -------------------------------------
 * No authoring was needed. `queries.hand.json` carries `provenance.issue` on each
 * row — a hand-written English statement of exactly the issue the Hindi row
 * restates — put there to document what the Hindi query was a restatement OF.
 * Using it is not new gold: the gold judgment is unchanged, the issue text was
 * written from the derived query rather than from the target judgment, and
 * nothing about the pairing moves.
 *
 * WHY IT MATTERS BEYOND FIVE QUERIES
 * ----------------------------------
 * Every headline this lane has published — 21.5% success@5 on the expansion
 * benchmark, 21.9% on the CONTROLLED baseline — is measured on citing-passage
 * queries. An advocate does not type a citing passage. If a clean issue statement
 * retrieves materially better, those numbers understate the product and the
 * benchmark is measuring its own construction.
 *
 * n = 5. This cannot settle anything. It can say whether the effect is large
 * enough to be worth a properly powered set, which is the only question worth
 * five queries.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const GPU = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const TABLE = process.env.PROBE_TABLE ?? 'judgment_chunks';
const EF_SEARCH = Number(process.env.EF_SEARCH ?? 200);
const TOP_K = Number(process.env.TOP_K ?? 20);
const OUT = new URL('../../../docs/ai/new1-crosslingual/query-shape-arms.json', import.meta.url);

const hand = JSON.parse(readFileSync(new URL('./fixtures/queries.hand.json', import.meta.url), 'utf8'));
const derived = JSON.parse(readFileSync(new URL('./fixtures/queries.derived.json', import.meta.url), 'utf8'));
const handRows = Array.isArray(hand) ? hand : (hand.queries ?? []);
const derivedRows = Array.isArray(derived) ? derived : (derived.queries ?? []);
const derivedById = new Map(derivedRows.map((r) => [r.id, r]));

const pairs = handRows.map((h) => {
  const d = derivedById.get(h.provenance.derivedFrom);
  return {
    pairId: h.id.replace(/^hindi-/, ''),
    gold: h.goldJudgmentIds[0],
    goldCase: h.provenance.goldCase,
    arms: {
      hindiRestatement: h.query,
      englishIssue: h.provenance.issue,
      englishPassage: d?.query ?? null,
    },
  };
});
console.log(`pairs ${pairs.length}, all three arms present: ${pairs.every((p) => p.arms.englishPassage)}`);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 300_000 }, onnotice: () => {} });

async function embed(texts) {
  const res = await fetch(GPU, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error('sidecar ' + res.status);
  return (await res.json()).vectors;
}

await sql.unsafe(`SET hnsw.ef_search = ${EF_SEARCH}`);

/**
 * `judgment_chunks` holds several rows per judgment, so a rank over CHUNKS is not
 * a rank over authorities. Deduplicate to the best chunk per judgment before
 * ranking — otherwise one verbose judgment occupying five of the top five reads
 * as a hit at rank 1 and as four missed slots at the same time.
 */
async function rankOf(vector, gold) {
  const lit = '[' + vector.join(',') + ']';
  const hits = await sql.unsafe(
    `SELECT judgment_id FROM ${TABLE} ORDER BY embedding <=> $1::halfvec LIMIT 200`,
    [lit],
  ).catch(async () =>
    sql.unsafe(`SELECT judgment_id FROM ${TABLE} ORDER BY embedding <=> $1::vector LIMIT 200`, [lit]),
  );
  const seen = [];
  for (const h of hits) if (!seen.includes(h.judgment_id)) seen.push(h.judgment_id);
  const r = seen.indexOf(gold) + 1;
  return r || null;
}

const armNames = ['hindiRestatement', 'englishIssue', 'englishPassage'];
const results = [];
for (const p of pairs) {
  const vectors = await embed(armNames.map((a) => p.arms[a]));
  const ranks = {};
  for (const [i, a] of armNames.entries()) ranks[a] = await rankOf(vectors[i], p.gold);
  results.push({ pairId: p.pairId, goldCase: p.goldCase, chars: Object.fromEntries(armNames.map((a) => [a, p.arms[a].length])), ranks });
  console.log(`  ${p.pairId}  ${armNames.map((a) => `${a}=${ranks[a] ?? '-'}`).join('  ')}`);
}

const summary = {};
for (const a of armNames) {
  const rs = results.map((r) => r.ranks[a]);
  const at = (k) => Number(((100 * rs.filter((r) => r && r <= k).length) / rs.length).toFixed(1));
  summary[a] = {
    successAt5: at(5),
    recallAt20: at(20),
    found: rs.filter(Boolean).length,
    meanChars: Math.round(results.reduce((s, r) => s + r.chars[a], 0) / results.length),
    mrr: Number((rs.reduce((s, r) => s + (r ? 1 / r : 0), 0) / rs.length).toFixed(4)),
  };
}

const report = {
  kind: 'new1_query_shape_arms',
  measuredAt: new Date().toISOString(),
  table: TABLE,
  efSearch: EF_SEARCH,
  topK: TOP_K,
  n: results.length,
  caveat:
    'n=5. This cannot settle the question; it can only say whether the effect is large enough to justify a properly powered set.',
  summary,
  results,
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log('\nQUERY SHAPE ARMS  (same 5 gold judgments, same index)');
for (const a of armNames) {
  const s = summary[a];
  console.log(`  ${a.padEnd(20)} s@5 ${String(s.successAt5).padStart(5)}%  r@20 ${String(s.recallAt20).padStart(5)}%  found ${s.found}/${results.length}  MRR ${s.mrr}  mean ${s.meanChars} chars`);
}
console.log(`\nwrote ${OUT.pathname}`);
await sql.end({ timeout: 10 });
