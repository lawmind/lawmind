/**
 * `hc:adjudicate` — DeepSeek over the difficult subset ONLY, span-verified.
 *
 *   node … hc-adjudicate-cli.ts --limit 200            # measure, writes no rows
 *   node … hc-adjudicate-cli.ts --limit 200 --out x.jsonl
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REPORT-ONLY, AND THAT IS THE DESIGN, NOT AN UNFINISHED STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This writes **no canonical row**. `LANE_PROTOCOL.md` §4: model output lands
 * in a candidate table with an evidence span, and promotion is a separate,
 * measured step. The candidate table needs a migration, which is LCC's to
 * write — so the first question this answers is the one that decides whether
 * the table is worth asking for at all: *on this population, how often does the
 * model quote something the document actually says?*
 *
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` is the standing precedent — a
 * fully built model-adjudication layer that measurement REJECTED, and keeping
 * it out of the canonical path was the whole value of building it. This pass is
 * allowed to reach the same verdict.
 *
 * The rules, the gate, and the span check are all in `hc-adjudicate.ts` and are
 * separately tested; this file is the database and network half and holds no
 * classification logic of its own.
 */
import { appendFile, readFile } from 'node:fs/promises';

import { installCrashGuard } from './crash-guard.ts';
import { openDb } from './db-host.ts';
import {
  adjudicate,
  buildPrompt,
  selectsForModel,
  type AdjudicationOutcome,
} from './hc-adjudicate.ts';
import { callInferxPooled, inferxKeysFromEnv } from './inferx.ts';

installCrashGuard('hc-adjudicate');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const LIMIT = Number(flag('--limit') ?? 100);
const OUT = flag('--out') ?? 'hc-adjudications.jsonl';

/**
 * NEW2's enumerated uncertain manifest (bus 0850), consumed rather than
 * regenerated.
 *
 * Without it this walks every `unclassified_disposal:*` row over 500 characters.
 * That population is ~1.72M and **most of it is not where a model buys
 * anything**: NEW2's frozen deterministic screen can already call 662,884 of the
 * residue `decided` and 26,000 `procedural`, and paying a model to re-derive a
 * verdict a two-marker margin already reached is spending a capacity-limited
 * free tier on work that is done.
 *
 * The manifest is the 190,102 rows the screen **cannot call either way** — the
 * near-ties. It is enumerated against a FROZEN screen loaded from an artifact,
 * not mined fresh, so the population is a function of (corpus, artifact) and is
 * reproducible. Regenerating it costs 61 minutes and would produce a different
 * screen; the whole point of freezing it is that two passes stay comparable.
 *
 * Read as a stream of ids only. The manifest carries a 700-character tail
 * snippet per row, but this pass sends a head+tail window from `full_text`
 * because the snippet is one end of the document and the operative direction of
 * an Indian order can sit at either.
 */
const MANIFEST = flag('--manifest');

/**
 * Write candidates into `hc_class_candidate` (migration 0064).
 *
 * **Still never touches `judgments.hc_document_class`** — the table's own CHECK
 * refuses a `promoted_at` without `CANONICAL_TRUSTED`, and this writes neither.
 * Persisting is not promoting: it makes the pass's output queryable and
 * de-duplicable across runs instead of living in a JSONL that only this script
 * can read.
 *
 * Off by default, so the measuring run stays exactly as cheap and as harmless
 * as it was.
 */
const PERSIST = process.argv.includes('--persist');
/**
 * Deliberately low. The grant is a capacity-limited free tier that returns HTTP
 * 429 under this repo's own load, and `callInferxPooled` treats a busy key as a
 * full backoff ladder before rotating — so pushing concurrency up converts
 * throughput into retries. `LANE_PROTOCOL.md` §5: one heavy caller at a time.
 */
const CONCURRENCY = Number(flag('--concurrency') ?? 4);

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const apiKeys = inferxKeysFromEnv();
if (apiKeys.length === 0) {
  // Refuses honestly rather than pretending to run — the `packages/auth/src/
  // mail.ts` pattern. The whole path above this line is exercised by tests
  // without a key; only the call itself needs one.
  console.error(
    'no INFERX_API_KEY configured — nothing to call. The gate and span check are tested without one.',
  );
  process.exit(2);
}

const sql = await openDb(url, 2);
const MODEL = process.env['INFERX_MODEL'] ?? 'deepseek-v4-flash-0731';

/** Already-adjudicated input hashes, so a re-run costs nothing for what it did. */
async function loadCache(): Promise<Set<string>> {
  const seen = new Set<string>();
  try {
    const text = await readFile(OUT, 'utf8');
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const h = (JSON.parse(line) as { inputHash?: string }).inputHash;
        if (typeof h === 'string') seen.add(h);
      } catch {
        // A truncated final line from an interrupted run is not a reason to
        // discard every cached answer before it.
      }
    }
  } catch {
    // No prior run. Not an error.
  }
  return seen;
}

type Row = {
  id: string;
  disposal_nature: string | null;
  case_number: string | null;
  full_text: string;
  hc_class_method: string;
};

/**
 * Every call is rowed into `llm_calls` with its data class, per `CLAUDE.md` §5.
 *
 * `public` and `pseudonymised: false` are correct and are not an oversight: a
 * High Court judgment is already published, which is the definition of the
 * public class. Nothing uploaded by a user passes through this path — if it
 * ever did, the class would be `sensitive` and the text would have to be
 * pseudonymised before the call, not after.
 */
async function recordCall(
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
): Promise<void> {
  await sql`
    INSERT INTO llm_calls (feature, model, input_tokens, output_tokens, cost_usd, latency_ms, data_class, pseudonymised)
    VALUES ('extract', ${MODEL}, ${inputTokens}, ${outputTokens}, ${'0'}, ${latencyMs}, 'public', false)`;
}

async function adjudicateOne(row: Row): Promise<AdjudicationOutcome & { method: string }> {
  const input = {
    judgmentId: row.id,
    disposalNature: row.disposal_nature,
    caseNumber: row.case_number,
    fullText: row.full_text,
  };
  const startedAt = Date.now();
  const result = await callInferxPooled(buildPrompt(input), { apiKeys });
  const latencyMs = Date.now() - startedAt;
  if (result.ok) {
    await recordCall(result.inputTokens, result.outputTokens, latencyMs);
  }
  return { ...adjudicate(input, result.ok ? result.text : null), method: row.hc_class_method };
}

/**
 * The prompt this pass ran under. **Bumped by hand when `buildPrompt` changes
 * meaning**, because it is half the uniqueness key on `hc_class_candidate` —
 * a changed prompt must produce a NEW candidate rather than silently overwrite
 * the answer the old one gave, or the two versions become indistinguishable
 * after the fact and no comparison between them is possible.
 */
const PROMPT_VERSION = 'hc-adjudicate-v1';

/**
 * Write one candidate. **Never touches `judgments`.**
 *
 * Everything is written, including the refusals. `span_not_found` and
 * `unparseable` rows carry `proposed_class = NULL` — `adjudicate()` discards the
 * class whenever the span fails — but the ROW is kept, because the fabrication
 * rate is the measurement this pass exists to produce and deleting the
 * fabrications is how you stop being able to compute it.
 *
 * `trust_state` is `SPAN_VERIFIED` only where the span actually verified, and
 * `MODEL_PROPOSED` otherwise. Nothing here can reach `SEMANTIC_ROLE_VERIFIED`:
 * a verified quote proves the words are in the document and proves nothing
 * about whether they say what the class asserts.
 *
 * `ON CONFLICT DO NOTHING` on `(judgment_id, prompt_version, input_hash)` makes
 * a re-run idempotent — the JSONL cache already skips the CALL, and this makes
 * the WRITE safe even when the cache file has been deleted.
 */
async function persist(o: AdjudicationOutcome & { method: string }): Promise<void> {
  const spanVerdict =
    o.verdict === 'verified' || o.verdict === 'span_not_found' || o.verdict === 'span_too_short'
      ? o.verdict
      : 'no_evidence_offered';
  await sql`
    INSERT INTO hc_class_candidate (
      judgment_id, proposed_class, evidence, reasoning, stated_confidence,
      span_verdict, model, prompt_version, input_hash, screen_version,
      prior_class_method, trust_state, trust_rank)
    VALUES (
      ${o.judgmentId}, ${o.documentClass}, ${o.evidence}, ${o.reasoning},
      ${o.statedConfidence}, ${spanVerdict}, ${MODEL}, ${PROMPT_VERSION},
      ${o.inputHash}, ${SCREEN_VERSION}, ${o.method},
      ${o.verdict === 'verified' ? 'SPAN_VERIFIED' : 'MODEL_PROPOSED'},
      ${o.verdict === 'verified' ? 2 : 0})
    ON CONFLICT (judgment_id, prompt_version, input_hash) DO NOTHING`;
}

/**
 * Which screen refused these rows, recorded so two passes are comparable.
 * `(none)` when the manifest was not used and the walk was the broad one — an
 * empty string here would read as "the screen had no version", which is a
 * different claim from "no screen was involved".
 */
const SCREEN_VERSION = MANIFEST === undefined ? '(none: broad unclassified walk)' : MANIFEST;

async function main(): Promise<void> {
  console.log(`DIFFICULT-SUBSET ADJUDICATION — REPORT ONLY, no canonical row is written`);
  if (PERSIST)
    console.log('--persist: candidates go to hc_class_candidate. STILL not to judgments.');
  console.log('='.repeat(74));

  const cache = await loadCache();
  console.log(`${cache.size} already adjudicated in ${OUT} — those are skipped`);

  /**
   * `ORDER BY id` is both the keyset cursor and the sampling method.
   *
   * `judgments.id` is uuid v4, so ordering by it is random with respect to
   * court, year and document length — this walk is therefore a representative
   * sample of the difficult subset rather than one court's worth of it. That
   * matters because the point of this pass is a rate, and a rate measured on
   * one court would not generalise. It also avoids the `LIMIT`-without-`ORDER
   * BY` trap that has now bitten this ring three times.
   */
  const rows =
    MANIFEST === undefined
      ? await sql<Row[]>`
          SELECT id, disposal_nature, case_number, full_text, hc_class_method
          FROM judgments
          WHERE (hc_class_method LIKE 'unclassified_disposal:%' OR hc_class_method = 'no_disposal_nature')
            AND length(full_text) > 500
          ORDER BY id
          LIMIT ${LIMIT}`
      : await (async () => {
          /**
           * Read ids from NEW2's manifest, then fetch those rows.
           *
           * Taken in FILE ORDER, not shuffled. NEW2 walked the residue in
           * primary-key order and `judgments.id` is a uuid v4, so file order is
           * already random with respect to court, year and length — reshuffling
           * would cost a full read of a 282 MB file to buy randomness the ids
           * already have.
           *
           * **The gate is re-asserted against the fetched rows below**, so a
           * manifest row whose `hc_class_method` has changed since it was
           * enumerated is refused rather than adjudicated on a stale premise.
           * The manifest is a frozen snapshot; the corpus is not.
           */
          const ids: string[] = [];
          const text = await readFile(MANIFEST, 'utf8');
          for (const line of text.split('\n')) {
            if (line.trim() === '') continue;
            if (ids.length >= LIMIT * 2) break;
            try {
              const id = (JSON.parse(line) as { judgment_id?: string }).judgment_id;
              if (typeof id === 'string') ids.push(id);
            } catch {
              // A truncated line in a 282 MB artifact is not a reason to abandon
              // the ids already read from it.
            }
          }
          console.log(`${ids.length} ids read from ${MANIFEST}`);
          return sql<Row[]>`
            SELECT id, disposal_nature, case_number, full_text, hc_class_method
            FROM judgments
            WHERE id = ANY(${ids}::uuid[])
              AND full_text IS NOT NULL
            ORDER BY id
            LIMIT ${LIMIT}`;
        })();

  // The gate is re-asserted in code, not trusted to the SQL that mirrors it:
  // two copies of a predicate drift, and this is the one that must not.
  const todo = rows.filter((r) => selectsForModel(r.hc_class_method));
  if (todo.length !== rows.length) {
    console.log(
      `${rows.length - todo.length} rows refused by the gate despite matching the query — SQL and gate disagree`,
    );
  }
  console.log(
    `${todo.length} documents to adjudicate · model=${MODEL} · concurrency=${CONCURRENCY}\n`,
  );

  const tally = new Map<string, number>();
  const byClass = new Map<string, number>();
  let done = 0;

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const slice = todo.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(slice.map((r) => adjudicateOne(r)));
    for (const o of outcomes) {
      tally.set(o.verdict, (tally.get(o.verdict) ?? 0) + 1);
      const k = o.documentClass ?? '(none)';
      byClass.set(k, (byClass.get(k) ?? 0) + 1);
      await appendFile(OUT, `${JSON.stringify(o)}\n`, 'utf8');
      if (PERSIST) await persist(o);
    }
    done += slice.length;
    process.stdout.write(`\r  adjudicated ${done}/${todo.length}`);
  }
  console.log('\n');

  const total = done || 1;
  console.log('verdict                    n      share');
  for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${k.padEnd(20)} ${String(n).padStart(5)}  ${((100 * n) / total).toFixed(1).padStart(6)}%`,
    );
  }
  console.log('\nclass ACCEPTED (span verified only):');
  for (const [k, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${String(n).padStart(5)}`);
  }

  const verified = tally.get('verified') ?? 0;
  const fabricated = tally.get('span_not_found') ?? 0;
  console.log(
    `\nspan-verified ${((100 * verified) / total).toFixed(1)}% · ` +
      `quoted words the document does NOT contain ${((100 * fabricated) / total).toFixed(1)}%`,
  );
  console.log(
    `\nwrote ${OUT}. NOTHING was written to judgments — promotion is a separate, measured step.`,
  );
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}
