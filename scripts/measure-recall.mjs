#!/usr/bin/env node
/**
 * Measure the vector index against exact ground truth.
 *
 *   DATABASE_URL=… EMBED_ENDPOINT=http://127.0.0.1:8799 node scripts/measure-recall.mjs
 *   DATABASE_URL=… node scripts/measure-recall.mjs --ef 40,100,200,400
 *
 * **Why this is a checked-in script and not a one-off.** `hnsw.ef_search` and
 * `ivfflat.probes` are recall-for-latency knobs, and every number you will read
 * about them online was measured on somebody else's corpus. The only honest
 * setting is the one measured against an exact sequential scan of ours — and it
 * has to be re-measured after every ingest that changes the corpus materially,
 * because recall is a property of the data, not of the setting.
 *
 * It measures two things, and the second is the one that bites:
 *
 * 1. **recall@50** against an exact scan. The bar is 95%.
 * 2. **Whether the index fills the LIMIT.** pgvector returns FEWER rows than
 *    LIMIT when `ef_search` is below it — no error, it just stops early. At the
 *    default of 40 this returned short candidate lists on 40 of 40 queries while
 *    still reporting a plausible-looking recall@50, because recall measured at
 *    LIMIT 50 cannot see a list that was truncated at 200.
 *
 * Requires the embedding sidecar (`services/embed/gpu/server.py`) so queries are
 * embedded by the SAME model and dtype as the corpus. A query embedded anywhere
 * else measures nothing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';

const K = 50;
const TRUTH_FILE = new URL('./recall-ground-truth.json', import.meta.url);
const ENDPOINT = process.env['EMBED_ENDPOINT'] ?? 'http://127.0.0.1:8799';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const EF_VALUES = (arg('--ef') ?? '40,64,100,150,200,400').split(',').map(Number);

/**
 * The measurement set — how an advocate actually asks, not how a citation looks.
 * Lexical search already handles "Sushila Aggarwal" and "(2020) 5 SCC 1"; dense
 * retrieval exists for the paraphrase, and for Hindi against an English corpus.
 */
const QUERIES = [
  'can someone ask a court for protection from arrest before they are arrested',
  'what happens if the police do not file a chargesheet within ninety days',
  'when can a confession made to a police officer be used in evidence',
  'is it necessary to give reasons when refusing bail in a serious offence',
  'how does a court decide whether a dying declaration can be believed',
  'what is the difference between culpable homicide and murder',
  'can a magistrate order further investigation after taking cognizance',
  'when is an identification parade of the accused necessary',
  'grounds on which a criminal case can be quashed by the High Court',
  'what is the standard for granting default bail',
  'circumstantial evidence and the chain of circumstances required for conviction',
  'when can a court presume abetment of suicide by a husband',
  'when can an arbitration clause be enforced against a party who did not sign',
  'what is the limitation period for filing a suit for recovery of money',
  'can a landlord evict a tenant for personal necessity',
  'specific performance of an agreement to sell immovable property',
  'principles for setting aside an arbitral award for patent illegality',
  'when does a suit become barred by res judicata',
  'right to privacy as a fundamental right',
  'scope of judicial review of a policy decision of the government',
  'अग्रिम जमानत के लिए क्या शर्तें हैं',
  'चार्जशीट दाखिल न होने पर डिफ़ॉल्ट जमानत कब मिलती है',
  'दहेज हत्या में पति के विरुद्ध उपधारणा कब लागू होती है',
  'संपत्ति के बंटवारे में बेटी का अधिकार',
  'मध्यस्थता पंचाट को रद्द करने के आधार',
];

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, ssl: 'require', idle_timeout: 0, connect_timeout: 60 });
const pct = (n) => (n * 100).toFixed(1) + '%';
const quantile = (xs, q) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * q)];

try {
  /**
   * Ground truth is cached, because an exact scan over the whole corpus costs
   * ~1.1s per query server-side and nothing about it changes between runs unless
   * the corpus does. Delete the file to force a recapture after an ingest.
   */
  let truth;
  if (existsSync(TRUTH_FILE)) {
    truth = JSON.parse(readFileSync(TRUTH_FILE, 'utf8'));
    console.log(`ground truth: reusing ${truth.length} cached queries`);
  } else {
    const res = await fetch(`${ENDPOINT.replace(/\/$/, '')}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: QUERIES }),
    });
    if (!res.ok) throw new Error(`embed sidecar ${res.status}: ${await res.text()}`);
    const { vectors } = await res.json();

    truth = [];
    for (let i = 0; i < QUERIES.length; i++) {
      const vector = `[${vectors[i].join(',')}]`;
      const rows = await sql.begin(async (tx) => {
        // Force the exact plan, so this stays ground truth after an index exists.
        await tx`SET LOCAL enable_indexscan = off`;
        await tx`SET LOCAL enable_bitmapscan = off`;
        return tx`SELECT id::text FROM judgment_chunks
                  ORDER BY embedding <=> ${vector}::vector LIMIT ${K}`;
      });
      truth.push({ query: QUERIES[i], vector, ids: rows.map((r) => r.id) });
      console.log(`  exact [${i + 1}/${QUERIES.length}] ${QUERIES[i].slice(0, 56)}`);
    }
    writeFileSync(TRUTH_FILE, JSON.stringify(truth));
    console.log(`ground truth: captured and cached (${truth.length} queries, k=${K})`);
  }

  console.log(`\nef_search   recall@${K}   median ms   p95 ms   short lists`);
  let chosen;
  for (const ef of EF_VALUES) {
    let hits = 0;
    let total = 0;
    let short = 0;
    const times = [];
    for (const t of truth) {
      const started = Date.now();
      const rows = await sql.begin(async (tx) => {
        await tx`SET LOCAL hnsw.ef_search = ${sql.unsafe(String(ef))}`;
        return tx`SELECT id::text FROM judgment_chunks
                  ORDER BY embedding <=> ${t.vector}::vector LIMIT ${K}`;
      });
      times.push(Date.now() - started);
      if (rows.length < K) short++;
      const got = new Set(rows.map((r) => r.id));
      hits += t.ids.filter((id) => got.has(id)).length;
      total += t.ids.length;
    }
    const recall = hits / total;
    if (!chosen && recall >= 0.95) chosen = { ef, recall };
    console.log(
      `${String(ef).padStart(9)}   ${pct(recall).padStart(9)}   ` +
        `${String(quantile(times, 0.5)).padStart(9)}   ${String(quantile(times, 0.95)).padStart(6)}   ${short}`,
    );
  }

  // The candidate depth production actually asks for. A short list here is a
  // silent recall loss that the recall@50 column above cannot see.
  console.log('\ncandidate depth — does the index fill the LIMIT retrieve.ts asks for?');
  for (const [limit, ef, iterative] of [
    [200, 200, 'off'],
    [2000, 1000, 'off'],
    [2000, 1000, 'relaxed_order'],
  ]) {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL hnsw.ef_search = ${sql.unsafe(String(ef))}`;
      await tx`SET LOCAL hnsw.iterative_scan = ${sql.unsafe(iterative)}`;
      return tx`SELECT id FROM judgment_chunks
                ORDER BY embedding <=> ${truth[0].vector}::vector LIMIT ${limit}`;
    });
    console.log(
      `  LIMIT ${String(limit).padStart(4)}  ef_search ${String(ef).padStart(4)}  ` +
        `iterative_scan=${iterative.padEnd(13)} -> ${String(rows.length).padStart(4)} rows` +
        (rows.length < limit ? '   ** SHORT **' : ''),
    );
  }

  if (chosen) {
    console.log(
      `\ncheapest ef_search reaching 95% recall@${K}: ${chosen.ef} (${pct(chosen.recall)})`,
    );
    console.log(
      'Set HNSW_EF_SEARCH no lower than the annDepth in retrieve.ts, whichever is larger.',
    );
  } else {
    console.log(
      `\nNO tested ef_search reached 95% recall@${K} — do not ship this index as configured`,
    );
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
