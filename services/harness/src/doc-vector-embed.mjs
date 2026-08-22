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
import { createHash } from 'node:crypto';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const BATCH_FILE = process.env.BATCH_FILE;
const GPU_URL = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const HEAD_CHARS = Number(process.env.HEAD_CHARS ?? 4800);
const EMBED_BATCH_CHARS = Number(process.env.EMBED_BATCH_CHARS ?? 240000);
const FETCH_PAGE = Number(process.env.FETCH_PAGE ?? 200);
const LIMIT = Number(process.env.STAGE_LIMIT ?? Infinity);
// The log path is overridable so an ad-hoc batch does not pollute the walk's
// own log. stage-milestone.mjs derives attempted/written/throughput by parsing
// that file, and a 26-row side run landing in it would show up as a batch.
const LOG = new URL(process.env.STAGE_LOG_PATH ?? '../../../docs/ai/new1-tier-a/stage-embed.log', import.meta.url);

/**
 * Classes the DEPLOYED eligibility view refuses — `axis_c_role`'s three, as of
 * migration `0066`.
 *
 * ── `bail_order` WAS in this set and has been removed, 21 Aug ────────────────
 *
 * It was here because `is_bail_order` excluded bail orders from Tier A when this
 * skip was written. Migration `0066` (commit `c6a3150`, 21 Aug 02:14) changed
 * that, in response to this lane's own measurement: 12 of NEW3's 250
 * citation-verified gold authorities are bail orders that a real judge really
 * cited, and the exclusion rested on "bail orders are not precedent" — a claim
 * about WEIGHT, not about RETRIEVABILITY. They are now their own tier,
 * `BAIL_ORDER_REACHABLE`, and 489,444 of them pass the base gate.
 *
 * Between those two facts this file spent an afternoon discarding roughly 1,380
 * bail orders per batch that the contract had started admitting. The deployed
 * view's hash is the thing that catches this — `e76879ab6bbcd452` became
 * `5efa4c8decef699e` — and a copy of a predicate that does not check the hash is
 * a copy that will drift again, so `assertContractHash()` below now refuses to
 * run against a definition the file has not been reconciled with.
 */
/**
 * SECOND RECONCILIATION, 21 Aug 2026 — `5efa4c8decef699e` -> `6e87c83ac05da264`.
 *
 * The guard did its job again and stopped the walk mid-worklist rather than let
 * it drift. What changed is that a refused CLASS is no longer refused
 * unconditionally: the deployed view now exempts documents that other judgments
 * have actually cited.
 *
 *   WHEN length(full_text) < 2000 THEN
 *        CASE WHEN ca.judgment_id IS NOT NULL THEN 'CITED_AUTHORITY_REACHABLE'
 *             ELSE 'NOT_ELIGIBLE' END
 *   WHEN hc_document_class = ANY (decided_brief, procedural_disposal, reference_stub) THEN
 *        CASE WHEN ca.judgment_id IS NOT NULL THEN 'CITED_AUTHORITY_REACHABLE'
 *             ELSE 'UNRESOLVED_EXPERIMENTAL' END
 *
 * So the class list below is still exactly `axis_c_role`'s refusals, but it is
 * now a NECESSARY and no longer a SUFFICIENT condition for skipping. Measured
 * against the deployed view, 1,007 rows carrying one of these three classes are
 * `CITED_AUTHORITY_REACHABLE` — documents a judge cited, which this file would
 * have gone on discarding.
 *
 * That is the same failure shape as the bail-order episode above, one contract
 * revision later: the counter goes up, the batches complete, the rate holds, and
 * the only thing wrong is the population. Hence the exemption is read from the
 * SAME materialised view the contract reads (`cited_authority`), not
 * re-derived from a citation count of this file's own choosing.
 */
const REFUSED_CLASSES = new Set(['procedural_disposal', 'reference_stub', 'decided_brief']);

/**
 * The deployed definition this skip list was reconciled against. NOT a hash of
 * this file: hashing a constant here would certify the copy, which is precisely
 * the thing that cannot drift from itself.
 */
/**
 * THIRD RECONCILIATION, 22 Aug 2026 — `6e87c83ac05da264` -> `2e7b53afe35fa81c`.
 *
 * Migration `0070` (LCC, bus 0995). The guard stopped the walk at 23:25:51Z on
 * `tier-a-batch-00063` and the runner aborted after its three attempts, exactly
 * as designed. **Unlike the two reconciliations above, the skip list does not
 * change, and that was checked against the deployed definition rather than
 * taken from the bus message that announced it.**
 *
 * What 0070 actually added, read from `pg_get_viewdef` this session:
 *
 *   CASE WHEN script_quality IS NULL
 *          OR script_quality = ANY (clean, mixed_script_ok)      THEN 'NONE'
 *        WHEN script_quality_method = ANY (ARRAY[]::text[])      THEN 'PROOF'
 *        ELSE 'SCREEN'
 *   END AS text_safety_grade
 *
 * One new column. Nothing in this file reads it. The three columns this file
 * DOES read are unchanged:
 *
 *   axis_c_role     same three classes (procedural_disposal, reference_stub,
 *                   decided_brief), so REFUSED_CLASSES stands as written
 *   text_safety     same CASE, so `UNSAFE_VERIFIED` matches the same rows and
 *                   the 64,083 already quarantined stay quarantined
 *   semantic_tier   same CITED_AUTHORITY_REACHABLE exemption on both branches
 *
 * `PROOF` is unreachable by construction — the method allow-list is an empty
 * array, so the middle branch is `= ANY (ARRAY[])`, which is false for every
 * input including NULL. Every unsafe row therefore grades `SCREEN` today. That
 * is deliberate on LCC's side and is NOT a filter this walk should adopt:
 * switching the refusal to `text_safety_grade = 'PROOF'` would quarantine
 * nothing at all and quietly re-admit 64,083 glyph dumps to the GPU.
 *
 * The reason this reconciliation is written out at length for a no-op change:
 * "the hash moved but nothing I read moved" is the single most dangerous
 * sentence available here, because it is the correct conclusion 99 times and
 * the bail-order episode the 100th. The evidence for it belongs next to the
 * pin, not in a bus message.
 */
const RECONCILED_VIEW_HASH = process.env.EXPECTED_VIEW_HASH ?? '2e7b53afe35fa81c';

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

/**
 * Refuse to run against an eligibility definition this file has not been
 * reconciled with.
 *
 * A warning would be read past. The failure this prevents is silent and
 * expensive: the skip list kept discarding bail orders for an afternoon after
 * migration 0066 started admitting them, and nothing anywhere looked wrong —
 * the counter went up, the batches completed, the rate held steady.
 *
 * `EXPECTED_VIEW_HASH` exists so that whoever reconciles the list next can run
 * once with the new hash before editing, rather than being blocked by their own
 * guard while they read the diff.
 */
async function assertContractHash() {
  const [row] = await sql`SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const live = createHash('sha256').update(row.def).digest('hex').slice(0, 16);
  if (live !== RECONCILED_VIEW_HASH) {
    throw new Error(
      `eligibility view has changed: deployed ${live}, this file reconciled against ${RECONCILED_VIEW_HASH}. ` +
        'Read the new definition and update REFUSED_CLASSES before embedding another batch — ' +
        'a stale skip list discards documents the contract admits, and nothing about that looks wrong at runtime.',
    );
  }
  log('contract hash OK ' + live);
}

/**
 * The DATA identity, recorded and never enforced.
 *
 * LCC crossed the boundary of what `assertContractHash` can certify (bus 0960):
 * they deployed a WRITER, not a rule. 62,215 damage verdicts were written and
 * `pg_get_viewdef` returned byte-identical text before and after, so two manifests
 * an hour apart carry the same definitionHash and describe different populations.
 * The hash was not wrong; it answers a different question.
 *
 * This is deliberately RECORDED rather than asserted, and the distinction is the
 * whole point:
 *
 *   definition changed -> REFUSE. A stale skip list is silently wrong, and the
 *                         walk must stop until someone reconciles it.
 *   data changed       -> RECORD. The screen writes at ~1,800 rows/s while this
 *                         walk runs, so a guard that threw on a data change would
 *                         halt the walk permanently and for no defect at all.
 *
 * Counting non-null `script_quality` rather than `max(script_quality_at)`: there
 * is a partial index on the former (`judgments_script_quality_idx ... WHERE
 * script_quality IS NOT NULL`) and none on the latter — measured 5.4s against
 * 23.5s, on an 18-minute batch.
 */
async function dataIdentity() {
  try {
    const [row] = await sql`SELECT count(*)::bigint AS n FROM judgments WHERE script_quality IS NOT NULL`;
    log('script_quality verdicts written ' + row.n);
    return Number(row.n);
  } catch (e) {
    // A provenance marker must never be the reason a batch dies.
    log('data identity unavailable: ' + (e?.message ?? e));
    return null;
  }
}

/** Corpus-wide count of written script_quality verdicts at batch start. Provenance, not a gate. */
let scriptQualityVerdicts = null;

try {
  log('STAGE START ' + BATCH_FILE + '  rows ' + rows.length + '  headChars ' + HEAD_CHARS);
  await assertContractHash();
  scriptQualityVerdicts = await dataIdentity();
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
  /** Rows a refused class would have discarded, kept because the contract cites them. */
  let admittedCitedAuthority = 0;
  /** Rows refused for PROVEN text damage — GPU time this check does not spend. */
  let skippedTextUnsafe = 0;
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
      SELECT j.id, left(j.full_text, ${HEAD_CHARS}) AS head, length(j.full_text) AS len,
             j.hc_document_class AS cls,
             (ca.judgment_id IS NOT NULL) AS is_cited_authority,
             e.text_safety
      FROM judgments j
      LEFT JOIN cited_authority ca ON ca.judgment_id = j.id
      JOIN judgment_embedding_eligibility e ON e.id = j.id
      WHERE j.id = ANY(${ids}::uuid[])
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
      // PROVEN TEXT DAMAGE, checked before anything else and exempted by nothing.
      //
      // LCC's TEXT_UNSAFE_CONTRACT_READY (bus 0960) started writing
      // `script_quality = 'damaged_other'`, and `axis_b_text` has refused a stored
      // damage verdict since 0056 — the rule was never missing, the WRITER was.
      // The screen is walking the corpus at ~1,800 rows/s WHILE this walk runs, so
      // a document eligible when the batch started can be refused before the batch
      // ends. Re-read per batch, exactly like the class.
      //
      // Unconditional, unlike the class check: `UNSAFE_VERIFIED` fails `axis_b_text`
      // and lands in the FIRST branch of the tier CASE, ahead of the
      // cited-authority exemption. Measured rather than assumed — of 63,757 such
      // staged rows, 0 were still eligible.
      //
      // This is also what makes quarantine terminate. Without it the walk re-stages
      // damaged documents as fast as they are moved out, which is what 88 rows
      // returning within minutes of the first quarantine actually was.
      if (t.text_safety === 'UNSAFE_VERIFIED') {
        skippedTextUnsafe += 1;
        continue;
      }
      if (t.cls && REFUSED_CLASSES.has(t.cls)) {
        // A cited authority is CITED_AUTHORITY_REACHABLE whatever its class, so
        // the class alone no longer decides. Counted rather than silently kept:
        // an exemption nobody can see is how the next drift hides.
        if (t.is_cited_authority) {
          admittedCitedAuthority += 1;
        } else {
          skippedNowIneligible += 1;
          byRefusedClass.set(t.cls, (byRefusedClass.get(t.cls) ?? 0) + 1);
          continue;
        }
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
        '  citedAuth ' + admittedCitedAuthority +
        '  textUnsafe ' + skippedTextUnsafe +
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
    scriptQualityVerdictsAtStart: scriptQualityVerdicts,
    batchFile: BATCH_FILE,
    rowsInBatch: rows.length,
    inserted,
    skippedNoText,
    skippedNowIneligible,
    admittedCitedAuthority,
    skippedTextUnsafe,
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
    new URL(process.env.SUMMARY_PATH_REL ?? '../../../docs/ai/new1-tier-a/stage-embed-summary.json', import.meta.url),
    JSON.stringify(summary, null, 2) + '\n',
  );
  log('STAGE DONE ' + JSON.stringify(summary));
} catch (e) {
  log('FAILED ' + e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
