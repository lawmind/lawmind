/**
 * NEW2 — R7 §10 Data Moat Ledger census.
 *
 * WHY THIS IS SEVERAL PASSES AND NOT ONE QUERY
 * ────────────────────────────────────────────
 * A single joined aggregate over judgments (22 GB heap) × judgment_citations
 * (22.3M) × judgment_paragraphs (91.2M) is one statement that either finishes or
 * produces nothing, and this repo has already lost a 283-query artifact to a
 * teardown that happened before the single write at the end. Each pass here is
 * one scan, independently killable, and **writes its own file the moment it
 * completes**. A kill loses at most the pass in flight.
 *
 * WHY NOT reltuples / n_live_tup
 * ──────────────────────────────
 * Every planner statistic on this database reads ~0 since the crash —
 * `judgments.n_live_tup` is 3 against a real 18,698,984. Sampling off the
 * statistics produces a confident wrong number, so every count here is exact.
 *
 * WHAT A STRATUM IS
 * ─────────────────
 * court × year-of-judgment_date. `judgment_date IS NULL` is its own year bucket
 * spelled `unknown`, never folded into a real year and never dropped — a corpus
 * whose date is unknown is a fact about the moat, not an inconvenience.
 */
import postgres from 'postgres';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'docs/ai/new2-r7/data-moat-census';
mkdirSync(OUT, { recursive: true });

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, {
  ssl: false,
  max: 1,
  idle_timeout: 30,
  connect_timeout: 20,
  statement_timeout: 3_600_000,
});

const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const FORCE = process.argv.includes('--force');

/** court × year, with judgment_date NULL kept as its own bucket. */
const STRATUM = `j.court AS court,
  CASE WHEN j.judgment_date IS NULL THEN 'unknown'
       ELSE extract(year FROM j.judgment_date)::int::text END AS year`;

/** The despatch-stamp shape, kept identical to the builder's own gate so the
 * ledger's "real neutral citation" means exactly what the key index means. */
const STAMP = `upper(regexp_replace(SRC,'[^A-Za-z0-9]','','g')) !~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$'`;
const REAL_NEUTRAL = `j.neutral_citation IS NOT NULL AND j.neutral_citation <> '' AND ${STAMP.replace('SRC', 'j.neutral_citation')}`;

const PASSES = {
  /* ── A. base identity / citability / provenance ──────────────────────── */
  base: `
    SELECT ${STRATUM},
      CASE WHEN j.source_url LIKE '%indian-supreme-court-judgments%' THEN 'aws_open_data_sc'
           WHEN j.source_url LIKE '%indian-high-court-judgments%'   THEN 'aws_open_data_hc'
           WHEN j.source_url IS NULL                                THEN 'no_source_url'
           ELSE 'other' END AS source_class,
      count(*)::bigint AS raw_documents,
      count(*) FILTER (WHERE j.storage_key IS NOT NULL)::bigint AS source_document_held,
      count(*) FILTER (WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> '')::bigint AS has_neutral_raw,
      count(*) FILTER (WHERE ${REAL_NEUTRAL})::bigint AS has_neutral_real,
      count(*) FILTER (WHERE coalesce(array_length(j.reporter_citations,1),0) > 0)::bigint AS has_reporter_citation,
      count(*) FILTER (WHERE j.case_number IS NOT NULL)::bigint AS has_case_number,
      count(*) FILTER (WHERE j.cnr IS NOT NULL)::bigint AS has_cnr,
      count(*) FILTER (WHERE j.case_type IS NOT NULL)::bigint AS has_case_type,
      count(*) FILTER (WHERE j.bench IS NOT NULL AND j.bench <> '')::bigint AS has_bench,
      count(*) FILTER (WHERE j.judgment_date IS NOT NULL)::bigint AS has_date,
      count(*) FILTER (WHERE j.content_hash IS NOT NULL)::bigint AS has_content_hash,
      count(*) FILTER (WHERE j.disposal_nature IS NOT NULL)::bigint AS has_disposal_nature,
      count(*) FILTER (WHERE j.hc_document_class IS NOT NULL)::bigint AS has_doc_class,
      count(*) FILTER (WHERE j.language IS NOT NULL AND j.language <> 'en')::bigint AS lang_not_en,
      count(*) FILTER (WHERE j.native_text IS NOT NULL)::bigint AS has_native_text,
      count(*) FILTER (WHERE j.overruled_status <> 'none')::bigint AS overruled_marked
    FROM judgments j GROUP BY 1,2,3`,

  /* ── B. body evidence / damage / text ─────────────────────────────────
   * The four states are computed here rather than read from
   * judgment_body_text_evidence so the ledger carries its own definition and a
   * later change to that view cannot silently re-date this measurement. The
   * CASE arms are copied from the deployed viewdef verbatim. */
  body: `
    WITH screen AS (
      /* The view spells this as a correlated EXISTS per row, which is correct
       * and costs 18.7M subquery executions — the first attempt at this pass ran
       * 16 minutes and was killed. The set is three rows and the only thing that
       * varies is one timestamp, so it is hoisted to a scalar. Same predicate,
       * same answer: created_at < max(started_at) over corpus-covering runs is
       * identical to "some corpus-covering run started after this row landed".
       * NULL when no run covers the corpus, and a NULL comparison is false,
       * which correctly puts every row in NEVER_SCREENED. */
      SELECT max(started_at) AS cutoff FROM quality_screen_runs WHERE covers_corpus
    )
    SELECT ${STRATUM},
      count(*)::bigint AS rows,
      count(*) FILTER (WHERE j.script_quality IS NOT NULL AND j.script_quality NOT IN ('clean','mixed_script_ok')
                         AND j.script_quality_method = 'text-damage-v2.0')::bigint AS proven_damaged,
      count(*) FILTER (WHERE j.script_quality IS NOT NULL AND j.script_quality NOT IN ('clean','mixed_script_ok')
                         AND j.script_quality_method IS DISTINCT FROM 'text-damage-v2.0')::bigint AS screened_damaged,
      count(*) FILTER (WHERE (j.script_quality IS NULL OR j.script_quality IN ('clean','mixed_script_ok'))
                         AND j.created_at < s.cutoff)::bigint AS screened_no_damage_found,
      count(*) FILTER (WHERE (j.script_quality IS NULL OR j.script_quality IN ('clean','mixed_script_ok'))
                         AND NOT (j.created_at < s.cutoff) IS NOT FALSE)::bigint AS never_screened,
      count(*) FILTER (WHERE j.text_quality IS NULL)::bigint AS text_quality_null,
      count(*) FILTER (WHERE coalesce(j.text_quality,0) >= 0.85)::bigint AS text_quality_ge_085,
      /* NO length(full_text) HERE, DELIBERATELY. judgments is 22 GB of heap and
       * 129 GB of TOAST; length() on a TOASTed column detoasts every value, so
       * one corpus-wide text-length metric costs a 129 GB read. The first
       * attempt did exactly that and was killed at 7.5 minutes with no result.
       * IS NULL is free — it reads the null bitmap in the heap tuple and never
       * touches TOAST — so it stays. Length bands come from the text_bands
       * pass, on a bounded random sample, labelled as a sample. */
      count(*) FILTER (WHERE j.full_text IS NULL)::bigint AS full_text_null,
      count(*) FILTER (WHERE j.text_extraction_method = 'ocr')::bigint AS extracted_by_ocr
    FROM judgments j CROSS JOIN screen s GROUP BY 1,2`,

  /* ── B2. text-length bands, SAMPLED — see the note in `body` ───────────
   * TABLESAMPLE SYSTEM picks whole pages, so this is a cluster sample, not a
   * simple random one: rows sharing a page are correlated, and pages are filled
   * in ingest order, which is court-and-year ordered. Reported as a sample with
   * its own n and never mixed into an exact corpus count. */
  text_bands: `
    SELECT j.court AS court,
      CASE WHEN j.judgment_date IS NULL THEN 'unknown' ELSE extract(year FROM j.judgment_date)::int::text END AS year,
      count(*)::bigint AS sampled_rows,
      count(*) FILTER (WHERE j.full_text IS NULL)::bigint AS full_text_null,
      count(*) FILTER (WHERE length(j.full_text) < 1000)::bigint AS text_lt_1k,
      count(*) FILTER (WHERE length(j.full_text) BETWEEN 1000 AND 1999)::bigint AS text_1k_2k,
      count(*) FILTER (WHERE length(j.full_text) BETWEEN 2000 AND 7999)::bigint AS text_2k_8k,
      count(*) FILTER (WHERE length(j.full_text) >= 8000)::bigint AS text_ge_8k
    FROM judgments j TABLESAMPLE SYSTEM (0.25) REPEATABLE (20260825)
    GROUP BY 1,2`,

  /* ── C. REAL vector / chunk coverage, aggregated from the SMALL side ───
   * Not from judgment_embedding_eligibility: that view computes
   * length(j.full_text) for its value band and semantic tier, so reading it
   * corpus-wide detoasts 129 GB for a coverage number. The staged vectors are
   * 2.0M rows and the chunks 620k, and what we need is which documents are
   * covered — so drive from those and look the court/year up per hit.
   *
   * This answers coverage. It does NOT answer eligibility, which needs the
   * text length; the eligibility_tiers pass samples that separately. */
  vectors: `
    WITH staged AS (
      SELECT DISTINCT judgment_id FROM new1_doc_vector_stage
    ), chunked AS (
      SELECT DISTINCT judgment_id FROM judgment_chunks
    )
    SELECT j.court AS court,
      CASE WHEN j.judgment_date IS NULL THEN 'unknown' ELSE extract(year FROM j.judgment_date)::int::text END AS year,
      count(*) FILTER (WHERE s.judgment_id IS NOT NULL)::bigint AS documents_with_staged_vector,
      count(*) FILTER (WHERE c.judgment_id IS NOT NULL)::bigint AS documents_with_chunks
    FROM judgments j
    LEFT JOIN staged  s ON s.judgment_id = j.id
    LEFT JOIN chunked c ON c.judgment_id = j.id
    WHERE s.judgment_id IS NOT NULL OR c.judgment_id IS NOT NULL
    GROUP BY 1,2`,

  /* ── C2. eligibility tiers, SAMPLED, for the same detoast reason ─────── */
  eligibility_tiers: `
    SELECT e.court AS court,
      e.semantic_tier,
      e.text_safety,
      count(*)::bigint AS sampled_rows,
      count(*) FILTER (WHERE e.axis_a_identity)::bigint AS axis_a_identity,
      count(*) FILTER (WHERE e.axis_b_text)::bigint AS axis_b_text,
      count(*) FILTER (WHERE e.axis_c_role)::bigint AS axis_c_role
    FROM judgments t TABLESAMPLE SYSTEM (0.25) REPEATABLE (20260825)
    JOIN judgment_embedding_eligibility e ON e.id = t.id
    GROUP BY 1,2,3`,

  /* ── D. citation extraction / resolution / treatment, by CITING court ── */
  citations: `
    SELECT ${STRATUM},
      count(c.id)::bigint AS extracted_references,
      count(c.id) FILTER (WHERE c.cited_judgment_id IS NOT NULL)::bigint AS resolved_references,
      count(c.id) FILTER (WHERE c.relationship IS NOT NULL AND c.relationship <> 'cites')::bigint AS treatment_edges,
      count(c.id) FILTER (WHERE c.treatment_provenance IS NOT NULL)::bigint AS treatment_with_provenance,
      count(DISTINCT c.citing_judgment_id)::bigint AS citing_documents
    FROM judgments j JOIN judgment_citations c ON c.citing_judgment_id = j.id
    GROUP BY 1,2`,

  /* ── E. key index coverage + real lag, by court/year ─────────────────── */
  keys: `
    SELECT ${STRATUM},
      count(*) FILTER (WHERE ${REAL_NEUTRAL})::bigint AS real_neutral,
      count(*) FILTER (WHERE ${REAL_NEUTRAL} AND EXISTS (SELECT 1 FROM judgment_citation_keys k WHERE k.judgment_id = j.id AND k.source='neutral'))::bigint AS keyed_neutral,
      count(*) FILTER (WHERE coalesce(array_length(j.reporter_citations,1),0) > 0)::bigint AS has_reporter,
      count(*) FILTER (WHERE coalesce(array_length(j.reporter_citations,1),0) > 0 AND EXISTS (SELECT 1 FROM judgment_citation_keys k WHERE k.judgment_id = j.id AND k.source='reporter'))::bigint AS keyed_reporter
    FROM judgments j
    WHERE (j.neutral_citation IS NOT NULL AND j.neutral_citation <> '')
       OR coalesce(array_length(j.reporter_citations,1),0) > 0
    GROUP BY 1,2`,

  /* ── F. statute references, by citing court/year ─────────────────────── */
  statutes: `
    SELECT ${STRATUM},
      count(s.id)::bigint AS statute_refs,
      count(DISTINCT s.judgment_id)::bigint AS documents_with_statute_ref
    FROM judgments j JOIN judgment_statute_refs s ON s.judgment_id = j.id
    GROUP BY 1,2`,

  /* ── G. duplicate/common-order candidates by exact content hash ───────
   * NON-DESTRUCTIVE and DELIBERATELY NOT A DEDUP: this counts how many
   * documents share a content_hash with at least one other document. It is the
   * upper bound on EXACT_DOCUMENT_DUPLICATE and says nothing at all about the
   * other five §7.5 states. Nothing is deleted, merged or preferred. */
  duplicates: `
    WITH h AS (
      SELECT content_hash, count(*) AS n
      FROM judgments WHERE content_hash IS NOT NULL
      GROUP BY content_hash HAVING count(*) > 1
    )
    SELECT count(*)::bigint AS duplicate_hash_groups,
           coalesce(sum(n),0)::bigint AS documents_in_a_duplicate_group,
           coalesce(sum(n - 1),0)::bigint AS documents_beyond_the_first_in_their_group,
           coalesce(max(n),0)::bigint AS largest_group
    FROM h`,

  /* ── H. paragraph (passage) coverage ─────────────────────────────────── */
  passages: `
    SELECT count(*)::bigint AS paragraph_rows,
           count(DISTINCT judgment_id)::bigint AS documents_with_paragraphs
    FROM judgment_paragraphs`,
};

const order = [
  'duplicates',
  'base',
  'keys',
  'body',
  'citations',
  'statutes',
  'vectors',
  'passages',
  'text_bands',
  'eligibility_tiers',
];
const run = ONLY ? [ONLY] : order;

for (const name of run) {
  const file = join(OUT, `${name}.json`);
  if (existsSync(file) && !FORCE) {
    console.log(`SKIP ${name} — ${file} exists (use --force to redo)`);
    continue;
  }
  const q = PASSES[name];
  if (!q) {
    console.error(`no pass named ${name}`);
    process.exit(2);
  }
  const t0 = Date.now();
  console.log(`RUN  ${name} …`);
  try {
    const rows = await sql.unsafe(q);
    const ms = Date.now() - t0;
    writeFileSync(
      file,
      JSON.stringify({ pass: name, generated_at: new Date().toISOString(), ms, row_count: rows.length, sql: q, rows }, null, 1),
    );
    console.log(`OK   ${name}: ${rows.length} strata in ${(ms / 1000).toFixed(1)}s -> ${file}`);
  } catch (err) {
    console.log(`FAIL ${name} after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${err.message}`);
    writeFileSync(
      join(OUT, `${name}.FAILED.json`),
      JSON.stringify({ pass: name, error: String(err.message), at: new Date().toISOString() }, null, 1),
    );
  }
}
await sql.end();
