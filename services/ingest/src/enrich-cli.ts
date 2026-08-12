/**
 * `pnpm --filter @lawmind/ingest enrich -- --task <t> --limit <n>`
 *
 * Runs a real DeepSeek pass over real corpus documents, persists every call
 * with its provenance, and then VERIFIES each claim against the source text
 * before believing any of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS WRITES, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Writes: `document_enrichments` (candidates + evidence + verification) and
 * `llm_calls` (the token ledger `CLAUDE.md` §5 requires of every model call).
 *
 * Does NOT write: `judgments`, `judgment_citations`, `judgment_citation_aliases`,
 * `judgment_judges`, or anything else the product reads. Promotion out of the
 * enrichment table is a separate, measured step. `docs/ai/
 * CITATION_CONCORDANCE_EVALUATION.md` is why that boundary is not negotiable —
 * the same model, asked to answer where the corpus was silent, invented an
 * authority 10.8% of the time and was confident about half of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCURRENCY IS ONE, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/DEEPSEEK_DATA_MOAT.md` §1 recorded this the hard way: running
 * several callers at once against the free InferX pool measurably worsened its
 * 429 rate. One caller, with `inferx.ts`'s existing backoff, finishes sooner
 * than three fighting each other.
 */
import postgres from 'postgres';

import {
  type Claim,
  ENRICH_MODEL,
  type EnrichTask,
  PROMPT_VERSION,
  buildCitationPrompt,
  buildMetadataPrompt,
  buildTreatmentPrompt,
  claimsFromCitations,
  claimsFromMetadata,
  claimsFromTreatment,
  enrichmentInputHash,
  headExcerpt,
  parseJson,
  sha256,
  verificationState,
  verifyClaims,
  windowAround,
} from './enrich.ts';
import { callInferxPooled, inferxKeysFromEnv } from './inferx.ts';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const TASK = arg('task', 'metadata') as EnrichTask;
const LIMIT = Number(arg('limit', '20'));
const VALID: EnrichTask[] = ['citation_extraction', 'metadata', 'treatment'];
if (!VALID.includes(TASK)) {
  console.error(`--task must be one of ${VALID.join(', ')}`);
  process.exit(2);
}

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const apiKeys = inferxKeysFromEnv();
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
if (apiKeys.length === 0) {
  console.error('No INFERX_API_KEY* is set.');
  process.exit(2);
}

/**
 * `connect_timeout` is raised from the 30s default because the Railway proxy is
 * shared with the High Court ingest, the citation rescan and the re-extraction
 * workers, and under that load a new connection routinely takes longer than 30s
 * to establish. The first detached run of this worker died on exactly that —
 * `write CONNECT_TIMEOUT` thrown out of `selectUnits`, before a single document
 * was processed.
 */
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('localhost') ? false : 'require',
  max: 2,
  connect_timeout: 120,
  idle_timeout: 0,
});

/**
 * A LONG RUN OUTLIVES A RAILWAY CONNECTION, and that must not end the run.
 *
 * Measured: both the 1,000-document metadata pass and the corruption scan died
 * with `read ECONNRESET` partway through — the proxy drops idle-ish TLS
 * connections and `postgres` reconnects, but the in-flight query has already
 * thrown by then. No enrichment was lost either time, because every document is
 * committed as it completes, but the LOOP stopped, and a worker that needs a
 * human to restart it is not the resumable worker this pipeline is supposed to
 * be.
 *
 * Retries only transient transport failures. A constraint violation or a bad
 * column name is a real defect and is rethrown immediately — retrying those
 * just repeats the same mistake more slowly, the same distinction `inferx.ts`
 * draws between a 429 and a 400.
 */
/**
 * **`ENOTFOUND` and `EAI_AGAIN` are DNS failures and belong here — leaving them
 * out cost three concurrent jobs.** A network interruption on the host stopped
 * `hayabusa.proxy.rlwy.net` resolving for a few minutes, and because the first
 * version of this list covered only socket errors, every worker rethrew
 * immediately instead of waiting the blip out. A name that fails to resolve is
 * the most ordinary transient failure there is.
 */
const TRANSIENT =
  /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_ENDED|socket|getaddrinfo/i;

/**
 * Eight attempts with exponential backoff capped at 30s — roughly two minutes
 * of patience. The outage that killed the first run lasted longer than the five
 * short attempts it was given, and the cost of waiting is nothing: every
 * document already processed is committed, so the alternative to waiting is a
 * dead worker, not faster progress.
 */
const MAX_DB_ATTEMPTS = 8;

async function withDbRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const message = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ''}` : String(err);
      if (attempt >= MAX_DB_ATTEMPTS || !TRANSIENT.test(message)) throw err;
      const waitMs = Math.min(30_000, 1000 * 2 ** attempt);
      console.log(
        `    db ${what} failed (${message.trim()}) — retry ${attempt + 1}/${MAX_DB_ATTEMPTS} in ${waitMs / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/** Excerpt sizes per task — the fields each one wants cluster in different places. */
const HEAD_CHARS = 4_000;
const TREATMENT_BEFORE = 1_200;
const TREATMENT_AFTER = 600;

type Unit = {
  judgmentId: string;
  caseTitle: string;
  court: string;
  excerpt: string;
  sourceText: string;
  /** Only for treatment: the earlier decision being treated. */
  citedCase?: string;
};

/**
 * THE COHORT QUERY MUST NOT CARRY THE CORPUS WITH IT.
 *
 * The first version selected `full_text` for every document in the cohort up
 * front: at `--limit 6000` and roughly 10 KB a judgment that is ~60 MB in one
 * result set, over a shared Railway proxy, before a single document could be
 * processed. Two detached runs died in `selectUnits` with `CONNECT_TIMEOUT`
 * without touching a document, and a worker that cannot survive its own first
 * query is not resumable in any useful sense.
 *
 * So the cohort query now returns IDENTIFIERS ONLY — cheap, fast, and stable —
 * and each document's text is fetched as it is reached. Startup is immediate,
 * the memory footprint is one judgment rather than six thousand, and a
 * connection blip costs one document instead of the entire run.
 */
type UnitRef = { judgmentId: string; caseTitle: string; court: string; charOffset?: number; citedCase?: string };


/**
 * Fetches one document's text at the moment it is needed. Returns null when the
 * row has vanished (the High Court ingest runs concurrently and rows do move),
 * which is skipped rather than treated as an error.
 */
async function loadUnit(ref: UnitRef): Promise<Unit | null> {
  /**
   * The window is computed HERE, not in SQL. `greatest(1, $1 - $2)` sends two
   * untyped parameters and Postgres cannot resolve `unknown - unknown`, so the
   * treatment worker died on its first document with `operator is not unique`.
   * Arithmetic on a number the caller already holds does not belong in the
   * query anyway.
   */
  const rows = await withDbRetry('load text', () =>
    sql<{ sourceText: string }[]>`
      SELECT full_text AS "sourceText" FROM judgments WHERE id = ${ref.judgmentId}`,
  );
  const r = rows[0];
  if (!r || !r.sourceText) return null;
  const excerpt =
    TASK === 'treatment'
      ? windowAround(r.sourceText, ref.charOffset ?? 0, TREATMENT_BEFORE, TREATMENT_AFTER)
      : headExcerpt(r.sourceText, TASK === 'citation_extraction' ? HEAD_CHARS * 2 : HEAD_CHARS);
  return {
    judgmentId: ref.judgmentId,
    caseTitle: ref.caseTitle,
    court: ref.court,
    excerpt,
    sourceText: r.sourceText,
    ...(ref.citedCase !== undefined ? { citedCase: ref.citedCase } : {}),
  };
}

/**
 * DETERMINISTIC COHORT SELECTION. Ordered by a hash of the id so a re-run draws
 * the SAME documents and hits cache, rather than paying again for a fresh
 * sample — the failure `concordance-gold-cli` was fixed for in `ac64cad`.
 */
async function selectRefs(): Promise<UnitRef[]> {
  if (TASK === 'metadata') {
    /**
     * High Court judgments hold ZERO `judgment_judges` rows — 40,996 documents
     * with no coram at all, measured against production. Deterministic parsing
     * never covered the High Court metadata variant, so this is a real gap
     * rather than a re-extraction of something we already have.
     */
    const rows = await sql<UnitRef[]>`
      SELECT j.id AS "judgmentId", j.case_title AS "caseTitle", j.court
      FROM judgments j
      WHERE j.court <> 'Supreme Court of India'
        AND j.full_text IS NOT NULL AND length(j.full_text) > 800
        AND NOT EXISTS (SELECT 1 FROM judgment_judges jj WHERE jj.judgment_id = j.id)
      ORDER BY md5(j.id::text || 'enrich-v1')
      LIMIT ${LIMIT}`;
    return rows;
  }

  if (TASK === 'citation_extraction') {
    /**
     * The sentinel population: 37,945 Patna High Court judgments carry a
     * `citation_text = ''` row, the extractor's marker for "this document cites
     * nothing". `Q1.0c` established that exactly this shape — an implausibly
     * large silent population — was an extractor blind spot on the Supreme
     * Court side. Whether it is genuine here (bail orders really do cite
     * nothing) or another blind spot is an empirical question, and this asks it.
     */
    const rows = await sql<UnitRef[]>`
      SELECT j.id AS "judgmentId", j.case_title AS "caseTitle", j.court
      FROM judgments j
      WHERE j.court <> 'Supreme Court of India'
        AND j.full_text IS NOT NULL AND length(j.full_text) > 2000
        AND EXISTS (SELECT 1 FROM judgment_citations c
                    WHERE c.citing_judgment_id = j.id AND c.citation_text = '')
        AND NOT EXISTS (SELECT 1 FROM judgment_citations c
                        WHERE c.citing_judgment_id = j.id AND c.citation_text <> '')
      ORDER BY md5(j.id::text || 'enrich-v1')
      LIMIT ${LIMIT}`;
    return rows;
  }

  /**
   * Treatment: real resolved citation edges currently labelled `cites`, which
   * is 257,460 of 273,383 rows. `cites` is the extractor's default when no
   * treatment verb was matched deterministically, so this population is exactly
   * where unrecognised treatment language would be hiding.
   */
  const rows = await sql<UnitRef[]>`
    SELECT jc.citing_judgment_id AS "judgmentId", cj.case_title AS "caseTitle", cj.court,
           jc.char_offset AS "charOffset",
           tj.case_title AS "citedCase"
    FROM judgment_citations jc
    JOIN judgments cj ON cj.id = jc.citing_judgment_id
    JOIN judgments tj ON tj.id = jc.cited_judgment_id
    WHERE jc.cited_judgment_id IS NOT NULL AND jc.char_offset > 0
      AND jc.relationship = 'cites'
    ORDER BY md5(jc.id::text || 'enrich-v1')
    LIMIT ${LIMIT}`;
  return rows;
}

function promptFor(u: Unit): string {
  if (TASK === 'metadata') return buildMetadataPrompt(u.excerpt);
  if (TASK === 'citation_extraction') return buildCitationPrompt(u.excerpt);
  return buildTreatmentPrompt(u.excerpt, u.citedCase ?? u.caseTitle);
}

function claimsFor(parsed: unknown): Claim[] {
  if (TASK === 'metadata') return claimsFromMetadata(parsed);
  if (TASK === 'citation_extraction') return claimsFromCitations(parsed);
  return claimsFromTreatment(parsed);
}

/* --------------------------------------------------------------- reverify -- */

/**
 * RE-RUN VERIFICATION OVER ALREADY-STORED MODEL OUTPUT, WITH NO MODEL CALLS.
 *
 * `raw_output` is persisted for every successful call and verification is a
 * pure function of (that output, the source text). So improving the verifier —
 * which happened immediately: the first pilot rejected 7 of 41 correct judge
 * names purely on letter case — must not cost a single token to apply.
 *
 * This is why `raw_output` is stored rather than only the parsed verdicts. A
 * pipeline that keeps just its conclusions has to re-buy them every time its
 * standards change, and would quietly discourage improving the standards.
 */
if (process.argv.includes('--reverify')) {
  const rows = await sql<{ id: string; judgmentId: string; task: EnrichTask; rawOutput: string }[]>`
    SELECT e.id, e.judgment_id AS "judgmentId", e.task, e.raw_output AS "rawOutput"
    FROM document_enrichments e
    WHERE e.status = 'ok' AND e.raw_output IS NOT NULL AND e.task = ${TASK}`;
  console.log(`REVERIFY — ${rows.length} stored ${TASK} rows, no model calls`);
  let changed = 0;
  let vBefore = 0;
  let vAfter = 0;
  for (const row of rows) {
    const [src] = await sql<{ fullText: string }[]>`
      SELECT full_text AS "fullText" FROM judgments WHERE id = ${row.judgmentId}`;
    const parsed = parseJson(row.rawOutput);
    if (parsed === null) continue;
    const claims = claimsFor(parsed);
    const verdicts = verifyClaims(claims, src?.fullText ?? '');
    const ok = verdicts.filter((v) => v.verified);
    const bad = verdicts.filter((v) => !v.verified);
    const state = verificationState(verdicts);
    const [prev] = await sql<{ verifiedCount: number }[]>`
      SELECT verified_count AS "verifiedCount" FROM document_enrichments WHERE id = ${row.id}`;
    vBefore += Number(prev?.verifiedCount ?? 0);
    vAfter += ok.length;
    if (Number(prev?.verifiedCount ?? 0) !== ok.length) changed++;
    await sql`
      UPDATE document_enrichments SET
        parsed_output = ${JSON.stringify({ claims: verdicts.map((v) => ({ ...v.claim, verified: v.verified, reason: v.reason })) })}::jsonb,
        verification_state = ${state}, verified_count = ${ok.length}, rejected_count = ${bad.length},
        rejection_reasons = ${JSON.stringify(bad.map((b) => b.reason))}::jsonb
      WHERE id = ${row.id}`;
  }
  console.log(`rows whose verified count changed: ${changed}`);
  console.log(`claims verified: ${vBefore} -> ${vAfter}`);
  await sql.end();
  process.exit(0);
}

/* -------------------------------------------------------------------- run -- */

/**
 * WRAPPED, because it was not. The cohort query is the FIRST database call the
 * worker makes and was the one call outside `withDbRetry` -- so a proxy that was
 * merely busy killed the whole run before any document was touched, which is
 * exactly the un-resumable failure this worker is supposed to be immune to.
 */
const refs = await withDbRetry('select cohort', selectRefs);
console.log('CORPUS ENRICHMENT PILOT');
console.log('='.repeat(74));
console.log(`task ${TASK} · prompt ${PROMPT_VERSION} · model ${ENRICH_MODEL} · units ${refs.length} · InferX grants ${apiKeys.length}`);
if (refs.length === 0) {
  console.log('no eligible documents — nothing to do.');
  await sql.end();
  process.exit(0);
}

let cacheHits = 0;
let calls = 0;
let failed = 0;
let unparseable = 0;
let inTok = 0;
let outTok = 0;
let claimsTotal = 0;
let claimsVerified = 0;
const rejectionTally = new Map<string, number>();
const stateTally = new Map<string, number>();
const startedRun = Date.now();

let skippedMissing = 0;
for (const [i, ref] of refs.entries()) {
  const u = await loadUnit(ref);
  if (u === null) {
    skippedMissing++;
    continue;
  }
  const excerpt = u.excerpt ?? '';
  const inputHash = enrichmentInputHash(TASK, PROMPT_VERSION, excerpt);
  const sourceHash = sha256(u.sourceText ?? '');
  const label = `[${i + 1}/${refs.length}] ${(u.caseTitle ?? '').slice(0, 34).padEnd(34)}`;

  /**
   * **`status = 'ok'` IS LOAD-BEARING AND WAS MISSING.**
   *
   * A failed call also writes a row, carrying the same `input_hash` — that is
   * deliberate, so a persistent failure is visible rather than silent. But the
   * cache lookup did not filter on status, so any document whose call had
   * failed counted as a CACHE HIT and was skipped forever after.
   *
   * Found when all three InferX grants began returning HTTP 401 mid-run: the
   * workers cheerfully wrote a `call_failed` row per document, and every one of
   * those documents would have been permanently excluded once the credentials
   * were restored. An outage would have quietly become a permanent hole in the
   * corpus, which is exactly the class of silent gap this project exists to
   * refuse.
   */
  const cached = await withDbRetry(
    'cache lookup',
    () => sql`
      SELECT verification_state, verified_count, rejected_count FROM document_enrichments
      WHERE judgment_id = ${u.judgmentId} AND task = ${TASK}
        AND prompt_version = ${PROMPT_VERSION} AND input_hash = ${inputHash}
        AND status = 'ok'
      LIMIT 1`,
  );
  if (cached.length > 0) {
    cacheHits++;
    const r = cached[0]!;
    stateTally.set(String(r['verification_state']), (stateTally.get(String(r['verification_state'])) ?? 0) + 1);
    claimsTotal += Number(r['verified_count']) + Number(r['rejected_count']);
    claimsVerified += Number(r['verified_count']);
    console.log(`${label} cached ${r['verification_state']}`);
    continue;
  }

  const startedAt = Date.now();
  const result = await callInferxPooled(promptFor(u), { apiKeys, maxTokens: 2000 });
  const latency = Date.now() - startedAt;

  if (!result.ok) {
    failed++;
    console.log(`${label} CALL FAILED: ${result.reason}`);
    await sql`
      INSERT INTO document_enrichments (judgment_id, task, prompt_version, model, input_hash,
        source_text_hash, status, error, latency_ms, verification_state)
      VALUES (${u.judgmentId}, ${TASK}, ${PROMPT_VERSION}, ${ENRICH_MODEL}, ${inputHash},
              ${sourceHash}, 'call_failed', ${result.reason}, ${latency}, 'unverified')
      ON CONFLICT (judgment_id, task, prompt_version, input_hash) DO NOTHING`;
    continue;
  }

  calls++;
  inTok += result.inputTokens;
  outTok += result.outputTokens;
  await withDbRetry(
    'ledger write',
    () => sql`
      INSERT INTO llm_calls (feature, model, input_tokens, output_tokens, cost_usd,
                             latency_ms, data_class, pseudonymised)
      VALUES ('concordance', ${ENRICH_MODEL}, ${result.inputTokens}, ${result.outputTokens}, 0,
              ${latency}, 'public', false)`,
  );

  const parsed = parseJson(result.text);
  if (parsed === null) {
    unparseable++;
    console.log(`${label} UNPARSEABLE`);
    await sql`
      INSERT INTO document_enrichments (judgment_id, task, prompt_version, model, input_hash,
        source_text_hash, raw_output, status, input_tokens, output_tokens, latency_ms, verification_state)
      VALUES (${u.judgmentId}, ${TASK}, ${PROMPT_VERSION}, ${ENRICH_MODEL}, ${inputHash},
              ${sourceHash}, ${result.text.slice(0, 8000)}, 'unparseable',
              ${result.inputTokens}, ${result.outputTokens}, ${latency}, 'unverified')
      ON CONFLICT (judgment_id, task, prompt_version, input_hash) DO NOTHING`;
    continue;
  }

  /**
   * VERIFIED AGAINST THE WHOLE DOCUMENT, not the excerpt it was shown. A span
   * quoted correctly from a part of the judgment outside the window is still a
   * true span; rejecting it would be measuring the window, not the model.
   */
  const claims = claimsFor(parsed);
  const verdicts = verifyClaims(claims, u.sourceText ?? '');
  const ok = verdicts.filter((v) => v.verified);
  const bad = verdicts.filter((v) => !v.verified);
  const state = verificationState(verdicts);
  claimsTotal += verdicts.length;
  claimsVerified += ok.length;
  stateTally.set(state, (stateTally.get(state) ?? 0) + 1);
  for (const b of bad) rejectionTally.set(b.reason!, (rejectionTally.get(b.reason!) ?? 0) + 1);

  console.log(`${label} ${state.padEnd(10)} ${ok.length} verified / ${verdicts.length} claimed`);

  /**
   * The checkpoint. Committed per document, so a dropped connection or a killed
   * session costs at most the one call in flight — everything before it is
   * cached and a restart replays it for free.
   */
  await withDbRetry(
    'enrichment write',
    () => sql`
      INSERT INTO document_enrichments (judgment_id, task, prompt_version, model, input_hash,
        source_text_hash, raw_output, parsed_output, status, input_tokens, output_tokens,
        latency_ms, verification_state, verified_count, rejected_count, rejection_reasons)
      VALUES (${u.judgmentId}, ${TASK}, ${PROMPT_VERSION}, ${ENRICH_MODEL}, ${inputHash},
              ${sourceHash}, ${result.text.slice(0, 8000)},
              ${JSON.stringify({ claims: verdicts.map((v) => ({ ...v.claim, verified: v.verified, reason: v.reason })) })}::jsonb,
              'ok', ${result.inputTokens}, ${result.outputTokens}, ${latency},
              ${state}, ${ok.length}, ${bad.length},
              ${JSON.stringify(bad.map((b) => b.reason))}::jsonb)
      ON CONFLICT (judgment_id, task, prompt_version, input_hash) DO NOTHING`,
  );
}

/* ---------------------------------------------------------------- report -- */

console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`documents      ${refs.length}  (cache hits ${cacheHits}, new calls ${calls})`);
console.log(`calls failed   ${failed}   unparseable ${unparseable}`);
console.log(`tokens         ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out = ${(inTok + outTok).toLocaleString()}`);
console.log(`wall clock     ${((Date.now() - startedRun) / 1000).toFixed(0)}s`);
console.log('');
console.log(
  `CLAIMS         ${claimsVerified}/${claimsTotal} verified against source text` +
    `${claimsTotal > 0 ? ` = ${((100 * claimsVerified) / claimsTotal).toFixed(1)}%` : ''}`,
);
console.log('document verification state:');
for (const [k, v] of [...stateTally].sort()) console.log(`  ${k.padEnd(11)} ${v}`);
if (rejectionTally.size > 0) {
  console.log('rejection reasons — each one is a claim that did NOT become data:');
  for (const [k, v] of [...rejectionTally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
}

await sql.end();
