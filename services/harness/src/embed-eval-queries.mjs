/**
 * Embed the 283 CONTROLLED eval queries once, on the GPU sidecar, and freeze the
 * vectors to disk.
 *
 * Every downstream probe in this lane (halfvec C3/C4, candidate depth) needs the
 * SAME query vectors. Re-embedding per experiment would make two runs differ by
 * the embedder as well as by the thing under test, and BGE-M3 through onnxruntime
 * is not bit-identical across providers — `services/embed/gpu/verify.py` exists
 * precisely because that equivalence has to be checked rather than assumed.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ENDPOINT = process.env.EMBED_ENDPOINT ?? 'http://127.0.0.1:8799';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/queries.eval.json', import.meta.url), 'utf8'),
);
const OUT = new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url);

const queries = fixture.queries;
console.log(`embedding ${queries.length} queries via ${ENDPOINT}`);
const vectors = [];
const BATCH = 8;
const t0 = Date.now();
for (let i = 0; i < queries.length; i += BATCH) {
  const slice = queries.slice(i, i + BATCH);
  const res = await fetch(`${ENDPOINT}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: slice.map((q) => q.query) }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  slice.forEach((q, j) => {
    const v = body.vectors[j];
    if (!v || v.length !== 1024) throw new Error(`bad vector for ${q.id}`);
    vectors.push({ id: q.id, group: q.group, gold: q.goldJudgmentIds, tokens: body.tokenCounts[j], vector: v });
  });
  console.log(`  ${vectors.length}/${queries.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
writeFileSync(
  OUT,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), endpoint: ENDPOINT, model: 'BGE-M3 onnx fp32, CLS-pooled, L2-normalised', dimensions: 1024, queries: vectors }, null, 0)}\n`,
);
console.log(`wrote ${vectors.length} vectors in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
