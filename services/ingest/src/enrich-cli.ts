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
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import {
  type Claim,
  ENRICH_MODEL,
  type EnrichTask,
  PROMPT_VERSION,
  buildArgumentsPrompt,
  buildAuthoritiesPrompt,
  buildCaseStructurePrompt,
  buildCitationPrompt,
  buildHoldingPrompt,
  buildMetadataPrompt,
  buildTopicsPrompt,
  buildTreatmentPrompt,
  claimsFromArguments,
  claimsFromAuthorities,
  claimsFromCaseStructure,
  claimsFromCitations,
  claimsFromHolding,
  claimsFromMetadata,
  claimsFromTopics,
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
import { callOpenRouter, openRouterKeyFromEnv, openRouterModelFromEnv } from './openrouter.ts';
import { installCrashGuard } from './crash-guard.ts';
import { isTransientDbOrNetworkError } from './db-transient.ts';
import { sslFor } from './db-ssl';


// Silent deaths cost three runs today; log the cause instead of vanishing.
installCrashGuard('enrich');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const TASK = arg('task', 'metadata') as EnrichTask;
const LIMIT = Number(arg('limit', '20'));
/** The five 0051 tasks that together build the structured legal object. */
const LEGAL_OBJECT_TASKS: EnrichTask[] = ['case_structure', 'holding', 'arguments', 'authorities', 'topics'];
const IS_LEGAL_OBJECT = (t: EnrichTask): boolean => LEGAL_OBJECT_TASKS.includes(t);
const VALID: EnrichTask[] = ['citation_extraction', 'metadata', 'treatment', ...LEGAL_OBJECT_TASKS];
if (!VALID.includes(TASK)) {
  console.error(`--task must be one of ${VALID.join(', ')}`);
  process.exit(2);
}

/**
 * THE FREEZE SWITCH, CHECKED IN THE WRITER RATHER THAN IN THE LAUNCHER.
 *
 * `services/ingest/.checkpoints/STOP` quiesces every writer during a database
 * cutover. It used to be enforced only by `supervise.mjs` and
 * `enrich-worker.cmd`, and NEW2's `scripts/check-stop-coverage.mjs` found that
 * `legal-object-stage1.cmd` and `legal-object-stage2.cmd` call THIS FILE
 * directly — no supervisor, no wrapper, no check. During a freeze that is a live
 * path to the database being migrated, and the freeze had already been broken
 * once by exactly this class of gap (301,422 rows written after a baseline).
 *
 * Putting it here rather than in the two launchers is the point: a launcher-level
 * guard protects the launchers someone has already written, and this file is
 * reachable by `npx tsx` from anywhere. `hc-load-cli.ts` and `hc-classify-cli.ts`
 * both hold it at the worker for the same reason.
 *
 * Checked per document, at a boundary where nothing is in flight: the enrichment
 * for the current document is either fully written or not started, so a pause
 * costs at most one model call and never a half-written row. An `existsSync` on
 * a local path is not measurable against a model call that takes seconds.
 *
 * Exits 0, not 1 — a requested pause is a success, and a non-zero exit here would
 * read as a crash to every supervisor and burn its restart budget.
 */
// Resolved from THIS MODULE's location, never from `process.cwd()` — the two
// legal-object launchers `cd` before invoking, and a guard that silently looks
// in the wrong directory is worse than no guard: it reports safe and writes anyway.
// Same construction as `hc-load-cli.ts`'s CHECKPOINT_DIR, one level shallower.
const STOP_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.checkpoints', 'STOP');
function stopIfRequested(): void {
  if (!existsSync(STOP_FILE)) return;
  console.log(
    `PAUSED by ${STOP_FILE} at a document boundary — nothing in flight, no partial enrichment written. ` +
      `Delete the file and relaunch to resume.`,
  );
  process.exit(0);
}

// BEFORE the database is even reached, so a launcher started during a freeze
// opens no connection and writes nothing at all.
stopIfRequested();

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const apiKeys = inferxKeysFromEnv();
const openRouterKey = openRouterKeyFromEnv();
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
  ssl: sslFor(dbUrl),
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
      /**
       * `isTransientDbOrNetworkError` FIRST, because this regex tests a message
       * and a restarting Postgres does not use any of its words. On 17 Aug the
       * postmaster restarted and every worker in the harvest fleet died on
       * `PostgresError: the database system is not yet accepting connections`
       * — an errno/message classifier exactly like this one let it through as
       * a defect, and `supervise.mjs` then abandoned every scope. See
       * `../db-transient.ts`.
       */
      if (
        attempt >= MAX_DB_ATTEMPTS ||
        (!isTransientDbOrNetworkError(err) && !TRANSIENT.test(message))
      )
        throw err;
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LEGAL-OBJECT WINDOW — WHY 20k + 8k AND WHAT IT KNOWINGLY GIVES UP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `HEAD_CHARS = 4_000` is right for metadata, which lives in the cause title,
 * and catastrophically wrong for `holding`: the operative direction is the LAST
 * thing in a judgment. A head-only excerpt would ask the model where the court
 * decided while showing it only the part where the court recites.
 *
 * Measured over 20,000 substantive documents (`hc_document_class` in
 * `decided`/`decided_brief`): **p50 4,977 chars · p90 22,146 · p99 125,929**.
 * So a 28,000-character budget sends **more than 90% of substantive judgments
 * WHOLE**, with no elision at all, and the head+tail split only ever applies to
 * the long tail.
 *
 * **What is given up, stated plainly: on a document past the budget, the middle
 * is not shown, so reasoning that lives only there cannot be found.** That is a
 * recall loss and it is invisible in the output — a claim never made leaves no
 * trace, and no verification catches it. It is accepted because the alternative
 * is either paying for 125,929 characters on the 1% or letting the model write
 * a holding it was never shown, and the second is not a trade this pipeline
 * makes.
 *
 * The elision marker is safe by construction: `verifyClaims` runs against the
 * FULL source text, not the excerpt, so a quote from either side still
 * verifies, and the model cannot quote what it was never sent.
 */
const OBJECT_BUDGET = 28_000;
const OBJECT_HEAD = 20_000;
const OBJECT_TAIL = 8_000;

export function legalObjectExcerpt(fullText: string): string {
  if (fullText.length <= OBJECT_BUDGET) return fullText;
  return `${fullText.slice(0, OBJECT_HEAD)}\n\n[… omitted from this excerpt …]\n\n${fullText.slice(-OBJECT_TAIL)}`;
}

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
      : IS_LEGAL_OBJECT(TASK)
        ? legalObjectExcerpt(r.sourceText)
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
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE ELIGIBLE POPULATION FOR THE STRUCTURED LEGAL OBJECT
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `RING_PROGRAM.md` §2b is the governing rule and it is stated before the
   * query rather than discovered after it: **this pass will never cover the
   * corpus and is not trying to.** Enrichment runs at a few documents a minute
   * against an ingest of ~34,000 an hour. A pass with no stated scope silently
   * acquires an infinite one.
   *
   * **WHAT THIS EXPLICITLY DOES NOT COVER:** bail orders, procedural disposals
   * and reference stubs (57,876 + 20,641 of them, measured) — they contain no
   * facts, no issues and no reasoning to find, so a call against one buys a
   * correctly empty answer at full price. Also excluded: anything under 2,000
   * characters, and anything a `status = 'ok'` row already exists for.
   *
   * THE ORDER IS THE FOUNDER'S PRIORITY LIST, IN THEIR WORDS:
   *   1. repaired / extraction-improved documents — their text changed, so
   *      anything derived from them was derived from a different document.
   *   2. substantive judgments, by the classifier's own verdict.
   *   3. newly ingested high-value judgments — `created_at DESC` drains the
   *      queue toward the ingest head rather than away from it.
   *   4. citation- and treatment-rich authorities — a judgment other judgments
   *      lean on is worth more structure than one nothing cites.
   *   5. statute-heavy judgments.
   *
   * NULL `hc_document_class` sorts WITH the substantive group, deliberately:
   * unclassified is not evidence of being trivial, and treating it as such
   * would quietly exclude every newly ingested document from enrichment
   * forever.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * TWO STAGES, BECAUSE PRIORITIES 4 AND 5 CANNOT BE PAID FOR ON 4.8M ROWS
   * ───────────────────────────────────────────────────────────────────────────
   *
   * "Citation-rich" and "statute-heavy" are counts over `judgment_citations`
   * and `judgment_statute_refs`. Put those in an `ORDER BY` over the whole
   * eligible population and Postgres computes them for **every candidate row
   * before it can sort** — 4.8M correlated subqueries to return 100 ids. That
   * is not a priority list, it is a way to never start.
   *
   * So the cheap tiers (repaired · substantive · newest) narrow to a bounded
   * POOL, and the expensive tiers rank inside it. The pool is `LIMIT * 20`, so
   * the counts are paid for on thousands of rows rather than millions, and the
   * founder's ordering still decides which documents are actually chosen.
   *
   * **Priority 1 currently selects nothing, and that is recorded rather than
   * hidden.** Measured 14 Aug 2026: `text_extraction_method` is
   * `pdftotext_fallback` on **0** rows, `unpdf` on 4,504,033, NULL on 333,788.
   * The repair pass has not written a row yet. The tier stays, with the value
   * checked against migration `0048` rather than guessed — an earlier draft of
   * this query invented `'repaired'`, which would have been a priority that
   * silently ranked nothing for a reason no one could see.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * WHY THIS DOES **NOT** DRAIN TOWARD THE INGEST HEAD, UNLIKE EVERY OTHER PASS
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Every other queue in this file sorts `created_at DESC` so it follows the
   * ingest. **Measured 14 Aug 2026, and it reverses the decision here: of the
   * newest 200,000 judgments, 199,444 — 99.7% — have `hc_document_class` NULL.**
   * The rule-based classifier is far behind the harvest.
   *
   * So at the head there is nothing to prioritise WITH. "Substantive first"
   * ranks 184 documents out of 200,000 and the exclusion filter removes 304;
   * a newest-first legal-object pass would therefore spend almost its entire
   * budget on unclassified documents that are, by the corpus-wide ratio,
   * mostly bail orders and procedural disposals. That is precisely the spend
   * `RING_PROGRAM.md` §2b names as drift, arrived at by following a sensible
   * rule off a cliff.
   *
   * **The eligible population is therefore the CLASSIFIED SUBSTANTIVE one:
   * 194,610 `decided` + 39,046 `decided_brief` = 233,656 documents**, served by
   * the existing partial index `judgments_hc_document_class_idx`. It is bounded,
   * it is where structure actually exists, and it grows as `hc-classify-cli`
   * catches up — which is the correct dependency, since a document nobody has
   * classified is a document nobody has established is worth reading.
   *
   * The length filter moved to the SECOND stage on purpose. `length(full_text)`
   * detoasts the column for every row it touches; over the eligible population
   * that is hundreds of thousands of decompressions to return 100 ids, and it
   * is what made the first version of this query return nothing in ten minutes.
   * Applied to the bounded pool instead, it costs a few thousand.
   */
  if (IS_LEGAL_OBJECT(TASK)) {
    /**
     * ── THE POOL IS TIER-A, NOT `hc_document_class IN (…)`. CHANGED 19 AUG 2026.
     *
     * This selector used to require a KNOWN class of `decided` or
     * `decided_brief`. Measured against the full corpus the same day:
     *
     *     hc_document_class NULL            16,811,480   93.7%
     *     'decided' + 'decided_brief'          478,421    2.7%
     *
     * So the factory could reach 2.7% of the corpus, and no amount of running it
     * would change that — the remaining 97.3% is not a backlog, it is outside the
     * predicate. NEW2 measured that 51.2% of everything ever ASSESSED could not be
     * classified at all, so waiting for coverage is waiting for something that
     * will not converge.
     *
     * **UNKNOWN IS NOT BAD.** A document nobody has looked at is not a document
     * without a holding. The eligibility contract exists precisely so that
     * absence of a verdict never disqualifies, and `hc_document_class IS NOT NULL`
     * is the collapse it was written to prevent.
     *
     * So class becomes a PRIORITISER and Tier A becomes the filter. Known
     * substantive judgments still go first — they are the best bet per call — but
     * an unclassified 6,000-character judgment is now reachable instead of
     * invisible.
     *
     * ── ONE REPRESENTATIVE PER BYTE-IDENTICAL TEXT
     *
     * The join to `embedding_content_representative` is not an optimisation.
     * 301,531 texts in Tier A have more than one judgment row and the largest is
     * a Madras common order shared by 7,118 writ petitions. Without this the
     * factory would spend 7,118 DeepSeek calls extracting the same holding from
     * the same bytes, and store 7,118 copies of it.
     *
     * No case identity is lost: every petition keeps its row, and an object
     * extracted from the representative is an object about that one decision.
     *
     * ── THE LENGTH FILTER STAYS IN THE SECOND STAGE
     *
     * `length(full_text)` detoasts, and over a 9.7M-row pool that is millions of
     * decompressions to return 100 ids — the thing that made an earlier version
     * of this query return nothing in ten minutes. The bounded pool pays it for a
     * few thousand rows instead. Same reason the eligibility view's own band is
     * not used as the outer filter here.
     */
    return sql<UnitRef[]>`
      WITH pool AS (
        SELECT r.representative_judgment_id AS id
        FROM embedding_content_representative r
        WHERE NOT EXISTS (
          SELECT 1 FROM document_enrichments e
          WHERE e.judgment_id = r.representative_judgment_id AND e.task = ${TASK}
            AND e.prompt_version = ${PROMPT_VERSION} AND e.status = 'ok'
        )
        ORDER BY r.representative_judgment_id
        LIMIT ${LIMIT * 20}
      )
      SELECT p.id AS "judgmentId", j.case_title AS "caseTitle", j.court
      FROM pool p
      JOIN judgments j ON j.id = p.id
      WHERE j.full_text IS NOT NULL AND length(j.full_text) > 2000
      ORDER BY
        -- Repaired documents first: their text roughly doubled, so anything
        -- derived from them before was derived from half a judgment.
        (j.text_extraction_method = 'pdftotext_fallback') DESC,
        -- Then the classifier's verdict WHERE IT HAS ONE — a prioritiser now,
        -- never a filter. NULL sorts last here rather than being excluded.
        (j.hc_document_class IN ('decided', 'decided_brief')) DESC NULLS LAST,
        (SELECT count(*) FROM judgment_citations c WHERE c.cited_judgment_id = p.id) DESC,
        (SELECT count(*) FROM judgment_statute_refs s WHERE s.judgment_id = p.id) DESC,
        md5(p.id::text || 'enrich-v1')
      LIMIT ${LIMIT}`;
  }

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
      /**
       * THE QUEUE IS PRIORITISED, NOT RANDOM — enrichment must not fall
       * permanently behind ingestion, and it will: the High Court ingest lands
       * ~34,000 documents an hour while this worker manages a few a minute. A
       * uniform random draw over a corpus growing that fast spends most of its
       * budget on two-line adjournments.
       *
       * 1. REPAIRED DOCUMENTS FIRST. Their text roughly doubled today, so
       *    whatever was derived from them was derived from half a judgment.
       * 2. SUBSTANTIVE JUDGMENTS NEXT, by the classifier's own verdict — a
       *    reasoned decision earns a model call, a bail order does not. NULL
       *    sorts with the substantive group deliberately: unclassified is not
       *    evidence of being trivial, and treating it as such would quietly
       *    exclude every newly ingested document from enrichment forever.
       * 3. NEWEST FIRST within a tier, so the queue drains toward the ingest
       *    head rather than away from it.
       * 4. The id hash last, purely so ties are stable across runs and a
       *    restart hits cache instead of re-paying.
       */
      ORDER BY
        (j.court IN ('Bombay High Court', 'Allahabad High Court')) DESC,
        (j.hc_document_class IN ('bail_order', 'procedural_disposal', 'reference_stub')) ASC,
        j.created_at DESC,
        md5(j.id::text || 'enrich-v1')
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
  if (TASK === 'case_structure') return buildCaseStructurePrompt(u.excerpt);
  if (TASK === 'holding') return buildHoldingPrompt(u.excerpt);
  if (TASK === 'arguments') return buildArgumentsPrompt(u.excerpt);
  if (TASK === 'authorities') return buildAuthoritiesPrompt(u.excerpt);
  if (TASK === 'topics') return buildTopicsPrompt(u.excerpt);
  return buildTreatmentPrompt(u.excerpt, u.citedCase ?? u.caseTitle);
}

function claimsFor(parsed: unknown): Claim[] {
  if (TASK === 'metadata') return claimsFromMetadata(parsed);
  if (TASK === 'citation_extraction') return claimsFromCitations(parsed);
  if (TASK === 'case_structure') return claimsFromCaseStructure(parsed);
  if (TASK === 'holding') return claimsFromHolding(parsed);
  if (TASK === 'arguments') return claimsFromArguments(parsed);
  if (TASK === 'authorities') return claimsFromAuthorities(parsed);
  if (TASK === 'topics') return claimsFromTopics(parsed);
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
    await withDbRetry('write enrichment',
      () => sql`
      UPDATE document_enrichments SET
        parsed_output = ${sql.json({ claims: verdicts.map((v) => ({ ...v.claim, verified: v.verified, reason: v.reason })) } as unknown as Parameters<typeof sql.json>[0])},
        verification_state = ${state}, verified_count = ${ok.length}, rejected_count = ${bad.length},
        rejection_reasons = ${sql.json(bad.map((b) => b.reason))}
      WHERE id = ${row.id}`,
    );
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
let openRouterCalls = 0;
/** Consecutive InferX capacity failures. Resets the moment one succeeds. */
let inferxFailStreak = 0;
/** Documents processed, used to space the breaker's probe of the free pool. */
let processed = 0;
/** Three consecutive capacity failures is a saturated pool, not a blip. */
const BREAKER_THRESHOLD = 3;
/** With the breaker open, ask InferX again every N documents. */
const BREAKER_PROBE = 25;
let openRouterCost = 0;
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
  stopIfRequested();
  const u = await loadUnit(ref);
  if (u === null) {
    skippedMissing++;
    continue;
  }
  processed++;
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
        -- The status filter is LOAD-BEARING. A call_failed row records that the
        -- endpoint was unreachable, not an answer about the document, so reading
        -- one as a cache hit would permanently skip every document touched
        -- during an outage. 840 rows were in exactly that state after the
        -- model-alias outage; without this clause all 840 would have been
        -- abandoned rather than retried. Its counterpart is the DO UPDATE below,
        -- guarded on the same column: this clause makes a failure retryable,
        -- that one makes the retry stick.
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
  /**
   * FREE POOL FIRST, PAID FALLBACK SECOND, and the order is the whole point.
   *
   * All three InferX grants now answer `http 429 (capacity)` within seconds
   * under four lanes' load, so enrichment throughput had fallen to roughly zero
   * while the corpus grew at ~34,000 documents an hour. OpenRouter picks up
   * exactly those calls -- and only those, because reversing the order would
   * spend money on work the free pool would gladly have done.
   */
  const prompt = promptFor(u);
  let usedModel = ENRICH_MODEL;
  let costUsd = 0;

  /**
   * A CIRCUIT BREAKER, because the retry ladder is the slow part.
   *
   * Exhausting InferX costs 5 attempts x 3 grants with exponential backoff —
   * roughly two minutes — before the fallback is even reached. Paying that on
   * EVERY document while the pool is saturated meant the free-first policy was
   * costing more time than the free calls were worth: measured at 6 documents
   * in the time the fallback alone would have done dozens.
   *
   * So after `BREAKER_THRESHOLD` consecutive capacity failures the worker stops
   * asking InferX and goes straight to OpenRouter, then retries the free pool
   * once every `BREAKER_PROBE` documents to notice when capacity returns. Free
   * is still preferred; it is simply no longer asked a question it has answered
   * the same way ten times running.
   */
  const useInferx = openRouterKey === null || inferxFailStreak < BREAKER_THRESHOLD || processed % BREAKER_PROBE === 0;
  let result: { ok: true; text: string; inputTokens: number; outputTokens: number } | { ok: false; reason: string } =
    useInferx
      ? await callInferxPooled(prompt, { apiKeys, maxTokens: 2000 })
      : { ok: false, reason: 'inferx skipped: capacity breaker open' };

  if (useInferx) {
    if (result.ok) {
      if (inferxFailStreak >= BREAKER_THRESHOLD) console.log('    inferx capacity returned — breaker closed');
      inferxFailStreak = 0;
    } else if (/capacity|429|exhausted/i.test(result.reason)) {
      inferxFailStreak++;
      if (inferxFailStreak === BREAKER_THRESHOLD) {
        console.log(`    inferx failed ${BREAKER_THRESHOLD}x on capacity — breaker OPEN, using OpenRouter`);
      }
    }
  }

  if (!result.ok && openRouterKey !== null && /capacity|429|exhausted|breaker/i.test(result.reason)) {
    const fallback = await callOpenRouter(prompt, { apiKey: openRouterKey, maxTokens: 2000 });
    if (fallback.ok) {
      usedModel = openRouterModelFromEnv();
      costUsd = fallback.costUsd;
      openRouterCalls++;
      openRouterCost += fallback.costUsd;
      result = fallback;
    } else {
      result = { ok: false, reason: `inferx exhausted; openrouter: ${fallback.reason}` };
    }
  }
  const latency = Date.now() - startedAt;

  if (!result.ok) {
    failed++;
    console.log(`${label} CALL FAILED: ${result.reason}`);
    await withDbRetry('write enrichment',
      () => sql`
      INSERT INTO document_enrichments (judgment_id, task, prompt_version, model, input_hash,
        source_text_hash, status, error, latency_ms, verification_state)
      VALUES (${u.judgmentId}, ${TASK}, ${PROMPT_VERSION}, ${ENRICH_MODEL}, ${inputHash},
              ${sourceHash}, 'call_failed', ${result.reason}, ${latency}, 'unverified')
      ON CONFLICT (judgment_id, task, prompt_version, input_hash) DO UPDATE SET
        raw_output = EXCLUDED.raw_output,
        parsed_output = EXCLUDED.parsed_output,
        status = EXCLUDED.status,
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        latency_ms = EXCLUDED.latency_ms,
        verification_state = EXCLUDED.verification_state,
        verified_count = EXCLUDED.verified_count,
        rejected_count = EXCLUDED.rejected_count,
        rejection_reasons = EXCLUDED.rejection_reasons,
        error = EXCLUDED.error,
        attempts = document_enrichments.attempts + 1
      WHERE document_enrichments.status <> 'ok'`,
    );
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
      VALUES ('concordance', ${usedModel}, ${result.inputTokens}, ${result.outputTokens}, ${costUsd},
              ${latency}, 'public', false)`,
  );

  const parsed = parseJson(result.text);
  if (parsed === null) {
    unparseable++;
    console.log(`${label} UNPARSEABLE`);
    await withDbRetry('write enrichment',
      () => sql`
      INSERT INTO document_enrichments (judgment_id, task, prompt_version, model, input_hash,
        source_text_hash, raw_output, status, input_tokens, output_tokens, latency_ms, verification_state)
      VALUES (${u.judgmentId}, ${TASK}, ${PROMPT_VERSION}, ${ENRICH_MODEL}, ${inputHash},
              ${sourceHash}, ${result.text.slice(0, 8000)}, 'unparseable',
              ${result.inputTokens}, ${result.outputTokens}, ${latency}, 'unverified')
      ON CONFLICT (judgment_id, task, prompt_version, input_hash) DO UPDATE SET
        raw_output = EXCLUDED.raw_output,
        parsed_output = EXCLUDED.parsed_output,
        status = EXCLUDED.status,
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        latency_ms = EXCLUDED.latency_ms,
        verification_state = EXCLUDED.verification_state,
        verified_count = EXCLUDED.verified_count,
        rejected_count = EXCLUDED.rejected_count,
        rejection_reasons = EXCLUDED.rejection_reasons,
        error = EXCLUDED.error,
        attempts = document_enrichments.attempts + 1
      WHERE document_enrichments.status <> 'ok'`,
    );
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
              ${sql.json({ claims: verdicts.map((v) => ({ ...v.claim, verified: v.verified, reason: v.reason })) } as unknown as Parameters<typeof sql.json>[0])},
              'ok', ${result.inputTokens}, ${result.outputTokens}, ${latency},
              ${state}, ${ok.length}, ${bad.length},
              ${sql.json(bad.map((b) => b.reason))})
      ON CONFLICT (judgment_id, task, prompt_version, input_hash) DO UPDATE SET
        raw_output = EXCLUDED.raw_output,
        parsed_output = EXCLUDED.parsed_output,
        status = EXCLUDED.status,
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        latency_ms = EXCLUDED.latency_ms,
        verification_state = EXCLUDED.verification_state,
        verified_count = EXCLUDED.verified_count,
        rejected_count = EXCLUDED.rejected_count,
        rejection_reasons = EXCLUDED.rejection_reasons,
        error = EXCLUDED.error,
        attempts = document_enrichments.attempts + 1
      WHERE document_enrichments.status <> 'ok'`,
  );
}

/* ---------------------------------------------------------------- report -- */

console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`documents      ${refs.length}  (cache hits ${cacheHits}, new calls ${calls})`);
/**
 * `skippedMissing` was counted and never printed. Lint found it as an unused
 * variable, which is the shallow reading: a document whose unit fails to load
 * is absent from `cacheHits`, from `calls`, and from every tally below, while
 * `refs.length` still counts it as an input. The totals therefore did not add
 * up and nothing said so.
 *
 * Deleting the variable would have made the arithmetic consistent by making the
 * loss permanent. This lane's rule for citations is that nothing is ever
 * silently dropped; a skipped document is the same class of event, so it is
 * printed — and printed unconditionally, because "0 skipped" is a fact worth
 * seeing and a line that only appears on bad days is a line nobody trusts.
 */
console.log(
  `skipped        ${skippedMissing}  (unit did not load — counted as input, absent from every tally above)`,
);
console.log(`calls failed   ${failed}   unparseable ${unparseable}`);
console.log(
  `provider       inferx ${calls - openRouterCalls} · openrouter ${openRouterCalls}` +
    (openRouterCost > 0 ? ` ($${openRouterCost.toFixed(4)} actual, reported by OpenRouter)` : ''),
);
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
