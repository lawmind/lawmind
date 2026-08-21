/**
 * NEW1 P4 — which documents, if any, are worth more than one vector?
 *
 * THE QUESTION, AND WHY THE OLD ANSWER DOES NOT TRANSFER
 * -----------------------------------------------------
 * The representation lab measured five vectors per document beating a
 * 32.82-vector full-chunk ceiling at 15.2% of the cost, and found that TAIL and
 * ISSUE — two hand-designed legal-structure layers — contributed nothing. That
 * work ran on a small, Supreme-Court-heavy pool. Tier A is 26 courts and
 * overwhelmingly High Court, and the directive is explicit that a multi-vector
 * policy must be validated OUTSIDE an SC-only pool and stratified by document
 * band rather than scaled globally.
 *
 * THE DESIGN: RESCORE THE POOL THE ONE-VECTOR INDEX ALREADY CHOSE
 * ---------------------------------------------------------------
 * Building a second 250k-document index in five representations would cost days
 * of GPU that the Tier-A walk needs. It is also the wrong experiment: what a
 * product would actually do is retrieve with a cheap representation and rescore
 * with a richer one.
 *
 * So each query's top-K pool comes from the existing HEAD:4800 index, and the
 * pool is then rescored by MAX similarity over several windows of each candidate's
 * text. If multi-vector helps, it shows up as gold rising inside a pool the single
 * vector already produced. It cannot show up as gold ENTERING the pool — that is a
 * recall question a rescoring experiment cannot answer, and this file does not
 * claim to.
 *
 * THE WINDOWS ARE POSITIONAL, NOT LEGAL
 * -------------------------------------
 * HEAD / EARLY / MIDDLE / LATE / TAIL, evenly spaced over the document. Not
 * "issue", "holding", "ratio". The hand-designed legal layers were measured at
 * zero contribution once already, and a positional split has the property that it
 * cannot be wrong about a document's structure — it makes no claim about it.
 *
 * The whole point is the BAND breakdown. A 2,000-character order has nothing
 * outside its head; a 60,000-character judgment has almost all of itself outside.
 * A single global verdict on "multi-vector" would average those two and answer
 * neither.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadNew3Gold } from './new3-gold-adapter.ts';
import { assertFeatureAllowed } from './gold-contract.ts';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const GPU = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const TABLE = process.env.PROBE_TABLE ?? 'new1_probe_fp32_250k';
const EF_SEARCH = Number(process.env.EF_SEARCH ?? 200);
/** Pool depth. 50 keeps distinct-document count affordable on a contended GPU. */
const POOL = Number(process.env.POOL ?? 50);
const WINDOW_CHARS = Number(process.env.WINDOW_CHARS ?? 4800);
const OUT = new URL('../../../docs/ai/new1-tier-a/multivector-bands.json', import.meta.url);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 600_000 }, onnotice: () => {} });

const loaded = loadNew3Gold('docs/ai/new3-semantic-expansion-gold.json');
const rows = loaded.rows.filter((r) => r.queryType === 'proposition');
for (const r of rows) assertFeatureAllowed(r, 'dense_similarity');
console.log(`queries ${rows.length}, pool ${POOL}, window ${WINDOW_CHARS}`);

async function embedAll(texts, batch = 24) {
  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const res = await fetch(GPU, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: texts.slice(i, i + batch) }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error('sidecar ' + res.status);
    out.push(...(await res.json()).vectors);
  }
  return out;
}

const qVectors = await embedAll(rows.map((r) => r.query));
console.log('queries embedded');
await sql.unsafe(`SET hnsw.ef_search = ${EF_SEARCH}`);

// ── pools, and the distinct documents they contain ───────────────────────────
const pools = [];
const needed = new Set();
for (const [i, row] of rows.entries()) {
  const lit = '[' + qVectors[i].join(',') + ']';
  const cands = await sql.unsafe(
    `SELECT judgment_id, (embedding <=> $1::vector) AS dist FROM ${TABLE}
     ORDER BY embedding <=> $1::vector LIMIT ${POOL}`,
    [lit],
  );
  pools.push({ queryId: row.queryId, gold: row.goldAuthorityId, cands: cands.map((c) => ({ id: c.judgment_id, dense: 1 - Number(c.dist) })) });
  for (const c of cands) needed.add(c.judgment_id);
}
console.log(`pools built, ${needed.size} distinct documents`);

/**
 * Five evenly spaced windows. The first is exactly the production recipe, so the
 * one-vector arm inside this experiment is the SAME representation the index was
 * built with rather than a re-derivation of it — if those two disagreed, the
 * comparison would be measuring the disagreement.
 */
function windows(text) {
  const n = text.length;
  if (n <= WINDOW_CHARS) return [text];
  const starts = [0, 0.2, 0.4, 0.6, 0.8].map((f) => Math.min(Math.floor(n * f), Math.max(0, n - WINDOW_CHARS)));
  return [...new Set(starts)].map((s) => text.slice(s, s + WINDOW_CHARS));
}

const band = (n) => (n >= 40000 ? 'very_long' : n >= 16000 ? 'long' : n >= 8000 ? 'medium' : 'short');

const ids = [...needed];
const docVectors = new Map();
const docBand = new Map();
const PAGE = 100;
let seen = 0;
for (let i = 0; i < ids.length; i += PAGE) {
  const slice = ids.slice(i, i + PAGE);
  const texts = await sql`
    SELECT id, full_text AS t, length(full_text) AS len
    FROM judgments WHERE id = ANY(${slice}::uuid[])
  `;
  const flat = [];
  const owner = [];
  for (const t of texts) {
    if (!t.t) continue;
    docBand.set(t.id, { band: band(Number(t.len)), len: Number(t.len) });
    for (const w of windows(t.t)) {
      flat.push(w);
      owner.push(t.id);
    }
  }
  const vs = await embedAll(flat);
  for (let k = 0; k < vs.length; k += 1) {
    const arr = docVectors.get(owner[k]) ?? [];
    arr.push(vs[k]);
    docVectors.set(owner[k], arr);
  }
  seen += slice.length;
  if (seen % 1000 < PAGE) console.log(`  embedded windows for ${seen}/${ids.length} documents`);
}
console.log(`window vectors built for ${docVectors.size} documents`);

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
};

const perQuery = [];
for (const [i, p] of pools.entries()) {
  const q = qVectors[i];
  const scored = p.cands.map((c) => {
    const vs = docVectors.get(c.id);
    // No windows means no text was read for this document; fall back to the
    // index's own score rather than dropping the candidate, because dropping it
    // would change the POOL between arms and make the two incomparable.
    const multi = vs && vs.length > 0 ? Math.max(...vs.map((v) => dot(q, v))) : c.dense;
    return { id: c.id, dense: c.dense, multi };
  });
  const rankIn = (key) => {
    const order = [...scored].sort((a, b) => b[key] - a[key]);
    const r = order.findIndex((x) => x.id === p.gold) + 1;
    return r || null;
  };
  const b = docBand.get(p.gold);
  perQuery.push({
    queryId: p.queryId,
    goldBand: b?.band ?? 'unknown',
    goldChars: b?.len ?? null,
    windows: docVectors.get(p.gold)?.length ?? 0,
    denseRank: rankIn('dense'),
    multiRank: rankIn('multi'),
  });
}

function summarise(rows) {
  const at = (key, k) => Number(((100 * rows.filter((r) => r[key] && r[key] <= k).length) / Math.max(rows.length, 1)).toFixed(2));
  const mrr = (key) => Number((rows.reduce((s, r) => s + (r[key] ? 1 / r[key] : 0), 0) / Math.max(rows.length, 1)).toFixed(4));
  const improved = rows.filter((r) => r.multiRank && r.denseRank && r.multiRank < r.denseRank).length;
  const worsened = rows.filter((r) => r.multiRank && r.denseRank && r.multiRank > r.denseRank).length;
  return {
    queries: rows.length,
    inPool: rows.filter((r) => r.denseRank).length,
    denseSuccessAt5: at('denseRank', 5),
    multiSuccessAt5: at('multiRank', 5),
    denseMrr: mrr('denseRank'),
    multiMrr: mrr('multiRank'),
    improved,
    worsened,
    tied: rows.length - improved - worsened,
  };
}

const byBand = {};
for (const b of [...new Set(perQuery.map((r) => r.goldBand))].sort()) {
  byBand[b] = summarise(perQuery.filter((r) => r.goldBand === b));
}

const report = {
  kind: 'new1_multivector_bands',
  measuredAt: new Date().toISOString(),
  probeTable: TABLE,
  pool: POOL,
  windowChars: WINDOW_CHARS,
  distinctDocuments: docVectors.size,
  note: 'RESCORING only. Gold that never reaches the pool cannot be rescued here, and this does not claim otherwise.',
  overall: summarise(perQuery),
  byBand,
  perQuery,
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

const line = (name, s) =>
  console.log(
    `  ${name.padEnd(12)} n=${String(s.queries).padStart(3)}  in pool ${String(s.inPool).padStart(3)}  s@5 ${String(s.denseSuccessAt5).padStart(6)}% -> ${String(s.multiSuccessAt5).padStart(6)}%  MRR ${s.denseMrr} -> ${s.multiMrr}  better ${s.improved} worse ${s.worsened} tied ${s.tied}`,
  );
console.log('\nMULTI-VECTOR RESCORING, BY GOLD DOCUMENT BAND');
line('ALL', report.overall);
for (const [b, s] of Object.entries(byBand)) line(b, s);
console.log(`\nwrote ${OUT.pathname}`);
await sql.end({ timeout: 10 });
