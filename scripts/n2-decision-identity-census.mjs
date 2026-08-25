/**
 * NEW2 — R7 §10 / §7.5 DECISION IDENTITY census.
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION. This script has no UPDATE, no DELETE, no
 * MERGE and no INSERT into any table another lane reads. It counts, classifies
 * and writes JSON. Nothing here can collapse two rows into one.
 *
 * WHY A SHARED content_hash IS NOT A DUPLICATE
 * ────────────────────────────────────────────
 * 1,701,630 documents share a content_hash with at least one other. Treating
 * that as "1,201,091 duplicates to delete" would be wrong in three different
 * ways at once, and the three are separated here:
 *
 *   - a COMMON ORDER disposing of forty connected matters is genuinely one
 *     decision text and genuinely forty matter identities. Both are true. It is
 *     not a duplicate and its rows must not be merged;
 *   - an EXTRACTOR CONTAMINATION — the same failure text written into thousands
 *     of rows — is not one decision at all, and merging would create a single
 *     "authority" out of nothing;
 *   - a genuine SAME_DECISION_DIFFERENT_SOURCE pair (the *Chipade* case) does
 *     NOT share a content_hash, because the two OCRs differ. So the hash both
 *     over-counts and under-counts, in opposite directions, and neither error is
 *     visible from the hash alone.
 *
 * The discriminators used are all primary metadata already on the row: how many
 * distinct courts, case numbers and dates the group spans.
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'docs/ai/new2-r7';
mkdirSync(OUT, { recursive: true });

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, { ssl: false, max: 1, idle_timeout: 30, statement_timeout: 3_600_000 });

const QUERIES = {
  /* Classify every exact-content-hash group by what its members disagree about. */
  hash_group_composition: `
    WITH g AS (
      SELECT content_hash,
             count(*)                                        AS members,
             count(DISTINCT court)                           AS courts,
             count(DISTINCT case_number)                     AS case_numbers,
             count(DISTINCT judgment_date)                   AS dates,
             count(DISTINCT cnr)                             AS cnrs,
             count(DISTINCT nullif(neutral_citation,''))     AS neutrals
      FROM judgments
      WHERE content_hash IS NOT NULL
      GROUP BY content_hash
      HAVING count(*) > 1
    )
    SELECT CASE
             WHEN members >= 100                    THEN 'f_EXTRACTOR_CONTAMINATION_SUSPECT (>=100 identical)'
             WHEN courts > 1                        THEN 'e_NOT_SAME_DECISION (same text, different courts)'
             WHEN case_numbers > 1 AND dates = 1    THEN 'c_COMMON_ORDER_CONNECTED_MATTERS (one court, one date, many case numbers)'
             WHEN case_numbers > 1 AND dates > 1    THEN 'd_UNKNOWN (many case numbers AND many dates)'
             WHEN case_numbers = 1 AND dates > 1    THEN 'b_UNKNOWN (one case number, many dates)'
             ELSE                                        'a_EXACT_DOCUMENT_DUPLICATE (one court, one case number, one date)'
           END AS state,
           count(*)::bigint            AS groups,
           sum(members)::bigint        AS documents,
           sum(members - 1)::bigint    AS documents_beyond_first,
           max(members)::bigint        AS largest_group
    FROM g GROUP BY 1 ORDER BY 1`,

  /* The biggest groups by name, so a contamination class can be recognised
   * rather than guessed at. Titles only — no full text is read. */
  largest_groups: `
    WITH g AS (
      SELECT content_hash, count(*) AS members
      FROM judgments WHERE content_hash IS NOT NULL
      GROUP BY content_hash HAVING count(*) > 500
    )
    SELECT g.members::bigint,
           (SELECT count(DISTINCT j.court) FROM judgments j WHERE j.content_hash = g.content_hash)::int AS courts,
           (SELECT min(j.case_title) FROM judgments j WHERE j.content_hash = g.content_hash) AS a_title,
           (SELECT min(j.court) FROM judgments j WHERE j.content_hash = g.content_hash) AS a_court,
           (SELECT min(j.judgment_date)::text FROM judgments j WHERE j.content_hash = g.content_hash) AS first_date,
           (SELECT max(j.judgment_date)::text FROM judgments j WHERE j.content_hash = g.content_hash) AS last_date
    FROM g ORDER BY g.members DESC LIMIT 25`,

  /* The OTHER direction: one decision held twice under DIFFERENT hashes. The
   * strongest primary-metadata signal we hold is CNR, which is a court-issued
   * case identifier — so a CNR appearing on two rows with two different hashes
   * is a same-decision-different-source candidate the hash cannot see. */
  cnr_collisions: `
    WITH c AS (
      SELECT cnr, count(*) AS rows,
             count(DISTINCT content_hash) AS hashes,
             count(DISTINCT court) AS courts,
             count(DISTINCT judgment_date) AS dates
      FROM judgments WHERE cnr IS NOT NULL AND cnr <> ''
      GROUP BY cnr HAVING count(*) > 1
    )
    SELECT CASE
             WHEN courts > 1                  THEN 'd_UNKNOWN (same CNR, different courts)'
             WHEN hashes = 1                  THEN 'a_EXACT_DOCUMENT_DUPLICATE (same CNR, same text)'
             WHEN dates > 1                   THEN 'c_SAME_CASE_DIFFERENT_DATE (same CNR, different text, different date)'
             ELSE                                  'b_SAME_DECISION_DIFFERENT_SOURCE candidate (same CNR, same date, different text)'
           END AS state,
           count(*)::bigint         AS cnr_groups,
           sum(rows)::bigint        AS documents,
           sum(rows - 1)::bigint    AS documents_beyond_first
    FROM c GROUP BY 1 ORDER BY 1`,

  /* Shared neutral citation — the second identity arm, same question. */
  neutral_collisions: `
    WITH c AS (
      SELECT upper(regexp_replace(neutral_citation,'[^A-Za-z0-9]','','g')) AS k,
             count(*) AS rows,
             count(DISTINCT content_hash) AS hashes,
             count(DISTINCT court) AS courts,
             count(DISTINCT case_number) AS case_numbers
      FROM judgments
      WHERE neutral_citation IS NOT NULL AND neutral_citation <> ''
        AND upper(regexp_replace(neutral_citation,'[^A-Za-z0-9]','','g'))
            !~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$'
      GROUP BY 1 HAVING count(*) > 1
    )
    SELECT CASE
             WHEN courts > 1                        THEN 'e_SHARED_CITATION_AMBIGUOUS (different courts)'
             WHEN hashes = 1 AND case_numbers = 1   THEN 'a_EXACT_DOCUMENT_DUPLICATE'
             WHEN hashes = 1 AND case_numbers > 1   THEN 'c_COMMON_ORDER_CONNECTED_MATTERS'
             WHEN case_numbers > 1                  THEN 'd_SHARED_CITATION_AMBIGUOUS (same court, many case numbers, different text)'
             ELSE                                        'b_SAME_DECISION_DIFFERENT_SOURCE candidate'
           END AS state,
           count(*)::bigint      AS citation_keys,
           sum(rows)::bigint     AS documents,
           sum(rows - 1)::bigint AS documents_beyond_first
    FROM c GROUP BY 1 ORDER BY 1`,

  /* How much of the corpus can be given an identity at all. A row with no CNR,
   * no real neutral citation and no case number cannot be deduplicated by any
   * rule that does not read its text. */
  identity_arms: `
    SELECT
      count(*)::bigint AS documents,
      count(*) FILTER (WHERE cnr IS NOT NULL AND cnr <> '')::bigint AS has_cnr,
      count(*) FILTER (WHERE case_number IS NOT NULL AND case_number <> '')::bigint AS has_case_number,
      count(*) FILTER (WHERE neutral_citation IS NOT NULL AND neutral_citation <> ''
        AND upper(regexp_replace(neutral_citation,'[^A-Za-z0-9]','','g'))
            !~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$')::bigint AS has_real_neutral,
      count(*) FILTER (WHERE content_hash IS NOT NULL)::bigint AS has_content_hash,
      count(*) FILTER (WHERE (cnr IS NULL OR cnr = '') AND (case_number IS NULL OR case_number = ''))::bigint AS no_registry_identifier
    FROM judgments`,
};

const out = { artifact: 'DECISION_IDENTITY_CENSUS_V1', generated_at: new Date().toISOString(), steps: {} };
for (const [name, q] of Object.entries(QUERIES)) {
  const t0 = Date.now();
  console.log(`RUN  ${name} …`);
  try {
    const rows = await sql.unsafe(q);
    out.steps[name] = { ms: Date.now() - t0, sql: q, rows };
    console.log(`OK   ${name}: ${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const r of rows.slice(0, 8)) console.log('    ', JSON.stringify(r));
  } catch (err) {
    out.steps[name] = { ms: Date.now() - t0, sql: q, error: String(err.message) };
    console.log(`FAIL ${name}: ${err.message}`);
  }
  writeFileSync(`${OUT}/decision-identity-census.json`, JSON.stringify(out, null, 1));
}
await sql.end();
console.log(`\nwrote ${OUT}/decision-identity-census.json`);
