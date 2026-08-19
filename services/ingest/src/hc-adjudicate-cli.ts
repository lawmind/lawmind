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
  console.error('no INFERX_API_KEY configured — nothing to call. The gate and span check are tested without one.');
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
async function recordCall(inputTokens: number, outputTokens: number, latencyMs: number): Promise<void> {
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

async function main(): Promise<void> {
  console.log(`DIFFICULT-SUBSET ADJUDICATION — REPORT ONLY, no canonical row is written`);
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
  const rows = await sql<Row[]>`
    SELECT id, disposal_nature, case_number, full_text, hc_class_method
    FROM judgments
    WHERE (hc_class_method LIKE 'unclassified_disposal:%' OR hc_class_method = 'no_disposal_nature')
      AND length(full_text) > 500
    ORDER BY id
    LIMIT ${LIMIT}`;

  // The gate is re-asserted in code, not trusted to the SQL that mirrors it:
  // two copies of a predicate drift, and this is the one that must not.
  const todo = rows.filter((r) => selectsForModel(r.hc_class_method));
  if (todo.length !== rows.length) {
    console.log(`${rows.length - todo.length} rows refused by the gate despite matching the query — SQL and gate disagree`);
  }
  console.log(`${todo.length} documents to adjudicate · model=${MODEL} · concurrency=${CONCURRENCY}\n`);

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
    }
    done += slice.length;
    process.stdout.write(`\r  adjudicated ${done}/${todo.length}`);
  }
  console.log('\n');

  const total = done || 1;
  console.log('verdict                    n      share');
  for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${String(n).padStart(5)}  ${((100 * n) / total).toFixed(1).padStart(6)}%`);
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
  console.log(`\nwrote ${OUT}. NOTHING was written to judgments — promotion is a separate, measured step.`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}
