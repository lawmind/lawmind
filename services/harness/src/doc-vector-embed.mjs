/**
 * NEW1 P4 — REAL staged document embedding on the GPU.
 *
 * Input: a Tier-A batch file from `pnpm --filter @lawmind/embed run doc-vector-batches`
 * (`{judgmentId, contentHash, memberCount, court, year, textLength, valueBand}` per
 * line). The batch carries its own `idsHash`, so the population this run embedded
 * can be re-identified later — a quality figure about a population you cannot name
 * again is unfalsifiable.
 *
 * Representation: HEAD — one vector over the opening `HEAD_CHARS` characters.
 * NOT a new recipe. It is the exact shape NEW1 measured at 89-96% of full-chunk
 * quality for 3% of the vectors (`docs/ai/NEW1_REPRESENTATION_LAB.md`), and the
 * directive is explicit that production bootstrap uses the measured recipe rather
 * than inventing one mid-run.
 *
 * Storage: `new1_doc_vector_stage`, a NEW1-owned staging table, `vector(1024)`
 * and NOT `halfvec`. Two reasons, both deliberate:
 *   · the halfvec task-fidelity verdict (C3/C4) is not issued yet, and writing the
 *     lossy representation before the verdict would pre-decide it;
 *   · fp32 casts DOWN to halfvec losslessly-in-one-direction later, and halfvec
 *     cannot cast back up. At 10k-100k documents the storage difference is
 *     irrelevant; at 8.5M it will matter, and by then the verdict exists.
 * It is not a schema change: `packages/db` is LCC's, and nothing here touches it.
 *
 * Idempotent per document (`ON CONFLICT DO NOTHING`), resumable by re-running —
 * documents already staged are skipped by the same key.
 */
import postgres from 'postgres';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const BATCH_FILE = process.env.BATCH_FILE;
const GPU_URL = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const HEAD_CHARS = Number(process.env.HEAD_CHARS ?? 4800);
const EMBED_BATCH_CHARS = Number(process.env.EMBED_BATCH_CHARS ?? 240000);
const FETCH_PAGE = Number(process.env.FETCH_PAGE ?? 200);
const LIMIT = Number(process.env.STAGE_LIMIT ?? Infinity);
const LOG = new URL('../../../docs/ai/new1-tier-a/stage-embed.log', import.meta.url);

/**
 * Classes the DEPLOYED eligibility view refuses. Not a NEW1 opinion — these are
 * `axis_c_role`'s `procedural_disposal` / `reference_stub` and `is_bail_order`'s
 * `bail_order`, plus `decided_brief`, which the length bands already exclude in
 * full (all 205,731 of its rows sit in `stub` and `brief`, measured) and which is
 * named here so a future band change cannot let a 15.6%-precise class in silently.
 */
const REFUSED_CLASSES = new Set(['procedural_disposal', 'reference_stub', 'bail_order', 'decided_brief']);

const log = (m) => {
  const line = new Date().toISOString() + '  ' + m + '\n';
  process.stdout.write(line);
  appendFileSync(LOG, line);
};

if (!BATCH_FILE) {
  console.error('BATCH_FILE is required');
  process.exit(1);
}

const rows = readFileSync(BATCH_FILE, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .slice(0, LIMIT);

const sql = postgres(url, { ssl: false, max: 2, connection: { statement_timeout: 0 } });

async function embed(texts) {
  const out = [];
  let i = 0;
  while (i < texts.length) {
    const batch = [];
    let chars = 0;
    while (i < texts.length && (batch.length === 0 || chars + texts[i].length < EMBED_BATCH_CHARS)) {
      batch.push(texts[i]);
      chars += texts[i].length;
      i += 1;
    }
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
      signal: AbortSignal.timeout(600000),
    });
    if (!res.ok) throw new Error('sidecar ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const body = await res.json();
    for (let j = 0; j < body.vectors.length; j += 1)
      out.push({ vector: body.vectors[j], tokens: body.tokenCounts[j] ?? 0 });
  }
  return out;
}

try {
  log('STAGE START ' + BATCH_FILE + '  rows ' + rows.length + '  headChars ' + HEAD_CHARS);
  await sql`
    CREATE TABLE IF NOT EXISTS new1_doc_vector_stage (
      judgment_id uuid PRIMARY KEY,
      content_hash text,
      court text,
      year int,
      member_count int,
      text_chars int,
      embedded_chars int,
      tokens int,
      recipe text NOT NULL,
      model text NOT NULL,
      embedding vector(1024) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  let done = 0;
  let skippedNoText = 0;
  let skippedNowIneligible = 0;
  const byRefusedClass = new Map();
  let skippedAlreadyStaged = 0;
  let inserted = 0;
  let tokensTotal = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += FETCH_PAGE) {
    const page = rows.slice(i, i + FETCH_PAGE);
    const allIds = page.map((r) => r.judgmentId);

    // Skip what is already staged BEFORE the GPU sees it. `ON CONFLICT DO
    // NOTHING` made the write idempotent but not the WORK: batch lcc-00002 was
    // re-embedded in full and inserted 0 rows, because LCC's manifest is keyset
    // ordered by representative_judgment_id and deterministically produced the
    // same id range an earlier batch had already covered. That is 15 minutes of
    // GPU spent to discard every vector it produced.
    const already = await sql`
      SELECT judgment_id FROM new1_doc_vector_stage
      WHERE judgment_id = ANY(${allIds}::uuid[])
    `;
    const have = new Set(already.map((r) => r.judgment_id));
    skippedAlreadyStaged += have.size;
    const ids = allIds.filter((id) => !have.has(id));
    if (ids.length === 0) {
      done += page.length;
      continue;
    }
    // `hc_document_class` is read HERE, not trusted from the batch file.
    //
    // The manifest is a snapshot of a moving predicate. It was cut at
    // 2026-08-19T22:26Z and every row in it was eligible AT THAT MOMENT;
    // NEW2 has kept classifying since. A uniform 2,089-row sample of the
    // manifest, re-checked against the live table, found 1.87% of it now
    // carries a class the deployed eligibility view refuses — 1.8%
    // `bail_order` and 0.1% `procedural_disposal`. Over 8,846,550 rows that
    // is on the order of 165,000 documents, and an eleven-day walk only gets
    // staler as it runs.
    //
    // This does NOT invent a second eligibility definition — the four names
    // below are exactly `axis_c_role`'s two refusals plus `is_bail_order`'s
    // one, read from `pg_get_viewdef('judgment_embedding_eligibility')` this
    // session, with `reference_stub` included because axis C refuses it too.
    // A row with NO class is NOT skipped: unclassified is the other 82.5% and
    // refusing it would silently shrink Tier A to the 6.9% that a rule has
    // positively labelled.
    const texts = await sql`
      SELECT id, left(full_text, ${HEAD_CHARS}) AS head, length(full_text) AS len,
             hc_document_class AS cls
      FROM judgments WHERE id = ANY(${ids}::uuid[])
    `;
    const byId = new Map(texts.map((t) => [t.id, t]));
    const toEmbed = [];
    for (const r of page) {
      if (have.has(r.judgmentId)) continue;
      const t = byId.get(r.judgmentId);
      if (!t || !t.head || t.head.trim().length === 0) {
        skippedNoText += 1;
        continue;
      }
      if (t.cls && REFUSED_CLASSES.has(t.cls)) {
        skippedNowIneligible += 1;
        byRefusedClass.set(t.cls, (byRefusedClass.get(t.cls) ?? 0) + 1);
        continue;
      }
      toEmbed.push({ meta: r, head: t.head, len: t.len });
    }
    if (toEmbed.length === 0) continue;
    const vectors = await embed(toEmbed.map((x) => x.head));
    const values = toEmbed.map((x, j) => ({
      judgment_id: x.meta.judgmentId,
      content_hash: x.meta.contentHash ?? null,
      court: x.meta.court ?? null,
      year: x.meta.year ?? null,
      member_count: x.meta.memberCount ?? null,
      text_chars: x.len ?? null,
      embedded_chars: x.head.length,
      tokens: vectors[j].tokens,
      recipe: 'HEAD:' + HEAD_CHARS,
      model: 'BGE-M3 onnx fp32, CLS-pooled, L2-normalised, GPU sidecar',
      embedding: '[' + vectors[j].vector.join(',') + ']',
    }));
    tokensTotal += vectors.reduce((a, v) => a + v.tokens, 0);
    const res = await sql`
      INSERT INTO new1_doc_vector_stage ${sql(
        values,
        'judgment_id',
        'content_hash',
        'court',
        'year',
        'member_count',
        'text_chars',
        'embedded_chars',
        'tokens',
        'recipe',
        'model',
        'embedding',
      )}
      ON CONFLICT (judgment_id) DO NOTHING
    `;
    inserted += res.count ?? values.length;
    done += page.length;
    const secs = (Date.now() - t0) / 1000;
    log(
      'staged ' + done + '/' + rows.length +
        '  inserted ' + inserted +
        '  noText ' + skippedNoText +
        '  ineligible ' + skippedNowIneligible +
        '  dup ' + skippedAlreadyStaged +
        '  ' + secs.toFixed(1) + 's' +
        '  ' + (tokensTotal / Math.max(secs, 0.001)).toFixed(0) + ' tok/s',
    );
  }

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM new1_doc_vector_stage`;
  const [{ bad }] = await sql`
    SELECT count(*)::int AS bad FROM new1_doc_vector_stage
    WHERE abs(1 - (embedding <#> embedding) * -1) > 0.01
  `;
  const summary = {
    kind: 'new1_doc_vector_stage_run',
    batchFile: BATCH_FILE,
    rowsInBatch: rows.length,
    inserted,
    skippedNoText,
    skippedNowIneligible,
    skippedByRefusedClass: Object.fromEntries(byRefusedClass),
    skippedAlreadyStaged,
    tableRows: n,
    nonUnitNormVectors: bad,
    tokens: tokensTotal,
    elapsedSeconds: (Date.now() - t0) / 1000,
    tokensPerSecond: tokensTotal / Math.max((Date.now() - t0) / 1000, 0.001),
    recipe: 'HEAD:' + HEAD_CHARS,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(
    new URL('../../../docs/ai/new1-tier-a/stage-embed-summary.json', import.meta.url),
    JSON.stringify(summary, null, 2) + '\n',
  );
  log('STAGE DONE ' + JSON.stringify(summary));
} catch (e) {
  log('FAILED ' + e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
