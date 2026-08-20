/**
 * `pnpm --filter @lawmind/ingest enrich:telemetry [--since <ISO>] [--json]`
 *
 * TOKENS PER ACCEPTED VERIFIED OBJECT, per task. The one number that says
 * whether a task is worth running.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS NUMBER AND NOT THROUGHPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * We have a great deal of DeepSeek capacity and very little tolerance for
 * rubbish in the corpus, so the constraint is not spend — it is yield. A task
 * that burns 40k tokens to land one verified object is a task to fix or stop,
 * and a task that lands twelve for the same tokens should be scaled. Neither
 * fact is visible in "documents processed", which is what every progress line
 * in the factory prints today.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS ACCEPTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `verified_count` — claims whose evidence span was FOUND in the source text by
 * `verifyClaims`. Not the model's confidence, not a document-level state. A
 * document that came back `partial` still contributed its verified claims and
 * they count; a `rejected` document contributed none and its tokens still count
 * against the total. That asymmetry is the point: waste has to be visible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED — `CLAUDE.md` §P13
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One aggregate over `document_enrichments`, which is tens of thousands of rows,
 * plus one grouped read of `rejection_reasons`. No judgment text is touched and
 * `judgments` is joined only for the class breakdown, by primary key.
 */
import { openDb } from './db-host.ts';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SINCE = arg('since');
const AS_JSON = process.argv.includes('--json');

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
  process.exit(2);
}

type Row = {
  task: string;
  prompt_version: string;
  model: string;
  documents: number;
  calls_ok: number;
  calls_failed: number;
  unparseable: number;
  input_tokens: number;
  output_tokens: number;
  verified: number;
  rejected: number;
  docs_verified: number;
  docs_partial: number;
  docs_rejected: number;
};

const sql = await openDb(dbUrl, 2);

try {
  const rows = await sql<Row[]>`
    SELECT task, prompt_version, model,
           count(*)::int                                                        AS documents,
           count(*) FILTER (WHERE status = 'ok')::int                           AS calls_ok,
           count(*) FILTER (WHERE status = 'call_failed')::int                  AS calls_failed,
           count(*) FILTER (WHERE status = 'unparseable')::int                  AS unparseable,
           coalesce(sum(input_tokens), 0)::int                                  AS input_tokens,
           coalesce(sum(output_tokens), 0)::int                                 AS output_tokens,
           coalesce(sum(verified_count), 0)::int                                AS verified,
           coalesce(sum(rejected_count), 0)::int                                AS rejected,
           count(*) FILTER (WHERE verification_state = 'verified')::int         AS docs_verified,
           count(*) FILTER (WHERE verification_state = 'partial')::int          AS docs_partial,
           count(*) FILTER (WHERE verification_state = 'rejected')::int         AS docs_rejected
      FROM document_enrichments
     ${SINCE ? sql`WHERE created_at >= ${SINCE}::timestamptz` : sql``}
     GROUP BY task, prompt_version, model
     ORDER BY verified DESC, task`;

  /**
   * Rejection reasons are the actionable half. A task failing on
   * "evidence span not found" needs a prompt change; one failing on "evidence
   * shorter than 12 chars" needs a length instruction; they are different bugs
   * and a single rejection count cannot tell them apart.
   */
  /**
   * ── TWO ENCODINGS LIVE IN THIS COLUMN, AND THE OBVIOUS QUERY THROWS ON ONE
   *
   * 23,395 rows hold a jsonb ARRAY. 9,119 hold a jsonb STRING whose text is
   * itself an array — `"[\"evidence span not found in source text\"]"` — written
   * by a metadata/treatment pass on 12–13 Aug that double-encoded. Both current
   * writers use `sql.json(array)` and produce arrays, so this is legacy data and
   * not an open defect.
   *
   * `jsonb_array_elements` on the string rows raises `22023 cannot extract
   * elements from a scalar`, which is how this was found. Skipping the scalar
   * rows instead would silently drop **226 real rejection reasons** — the other
   * 8,893 are an empty `[]` either way.
   */
  const reasons = await sql<{ task: string; reason: string; n: number }[]>`
    WITH normalised AS (
      SELECT task,
             CASE jsonb_typeof(rejection_reasons)
               WHEN 'array'  THEN rejection_reasons
               WHEN 'string' THEN (rejection_reasons #>> '{}')::jsonb
               ELSE '[]'::jsonb
             END AS reasons
        FROM document_enrichments e
       ${SINCE ? sql`WHERE e.created_at >= ${SINCE}::timestamptz` : sql``}
    )
    SELECT task, r.value #>> '{}' AS reason, count(*)::int AS n
      FROM normalised, LATERAL jsonb_array_elements(reasons) AS r(value)
     GROUP BY task, reason
     ORDER BY n DESC
     LIMIT 40`;

  const enriched = rows.map((r) => {
    const tokens = r.input_tokens + r.output_tokens;
    const claims = r.verified + r.rejected;
    return {
      ...r,
      tokens,
      tokensPerVerifiedObject: r.verified > 0 ? Math.round(tokens / r.verified) : null,
      claimVerificationRate: claims > 0 ? r.verified / claims : null,
    };
  });

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        { generatedAt: new Date().toISOString(), since: SINCE ?? null, tasks: enriched, reasons },
        null,
        2,
      ),
    );
  } else {
    console.log(`LEGAL OBJECT TELEMETRY${SINCE ? ` — since ${SINCE}` : ''}\n`);
    console.log(
      'task                  docs   ok  fail  unpars      tokens  verified  rejected   tok/obj   claim%',
    );
    for (const r of enriched) {
      console.log(
        `${r.task.padEnd(20)} ${String(r.documents).padStart(5)} ${String(r.calls_ok).padStart(4)} ` +
          `${String(r.calls_failed).padStart(5)} ${String(r.unparseable).padStart(7)} ` +
          `${r.tokens.toLocaleString().padStart(11)} ${String(r.verified).padStart(9)} ${String(r.rejected).padStart(9)} ` +
          `${(r.tokensPerVerifiedObject === null ? '—' : r.tokensPerVerifiedObject.toLocaleString()).padStart(9)} ` +
          `${(r.claimVerificationRate === null ? '—' : (100 * r.claimVerificationRate).toFixed(1)).padStart(8)}`,
      );
    }
    const totalVerified = enriched.reduce((a, r) => a + r.verified, 0);
    const totalTokens = enriched.reduce((a, r) => a + r.tokens, 0);
    console.log(
      `\nALL TASKS  ${totalVerified.toLocaleString()} verified objects for ${totalTokens.toLocaleString()} tokens` +
        (totalVerified > 0
          ? ` = ${Math.round(totalTokens / totalVerified).toLocaleString()} tokens per verified object`
          : ''),
    );
    console.log('\nrejection reasons — each one is a claim that did NOT become data');
    for (const r of reasons.slice(0, 12)) {
      console.log(`  ${String(r.n).padStart(6)}  ${r.task.padEnd(20)} ${r.reason}`);
    }
  }
} finally {
  await sql.end();
}
