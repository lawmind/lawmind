/**
 * `pnpm --filter @lawmind/ingest resolve` — re-resolve citation edges that are
 * unresolved but whose target we already hold.
 *
 * `docs/CURRENT_PLAN.md` §Q1.0b · `docs/CITATION_STRATEGY.md` §0. **Dry by
 * default; needs `--apply`.** It writes `cited_judgment_id`, which is what makes
 * a citation resolve in the product, and a wrong resolution points an advocate
 * at the wrong case.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY 49,605 EDGES ARE SITTING UNRESOLVED AGAINST JUDGMENTS WE HAVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two ordinary causes, measured against production on 11 Aug 2026.
 *
 * **1 · The index never included the concordance.** `citations-cli.ts` builds its
 * resolution index from `neutral_citation` and `reporter_citations` only. The
 * 4,097 rows in `judgment_citation_aliases` — the AIR and SCC names advocates
 * actually type — were derived *after* the edges were resolved and have never
 * been in the index. **All 16,848 edges containing `AIR` are unresolved.**
 *
 * **2 · `normaliseCitation` is stricter than extracted text.** It upper-cases,
 * swaps brackets, drops dots and collapses runs of whitespace — but it preserves
 * word spacing, so `"(1991) 1SCC598"` and `"(2014)14 SCC\n664"` never compare
 * equal to the same citation typeset normally. Those strings are **PDF
 * extraction artefacts of real citations**, and they are common.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE KEY IS LOOSER THAN `normaliseCitation`, SO THREE GUARDS REPLACE IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Matching on an alphanumeric-only key recovers the artefacts above. It is also
 * looser than the production rule, so it could in principle collapse two
 * different citations. **Nothing here relies on that not happening**; three
 * independent guards make a wrong resolution refuse itself:
 *
 * 1. **EXACTLY ONE TARGET.** A key reaching two judgments resolves to neither —
 *    `A3d.4`'s rule, and the reason a wrong alias is worse than a missing one.
 * 2. **THE YEAR GUARD.** The leading four-digit year in the edge's text must
 *    appear in the target's own citations. This is the guard that made the
 *    concordance safe (`A3d.2`) and it is what stops a digit-boundary collapse
 *    from pointing at a case from another decade.
 * 3. **NEVER OVERWRITES.** Only rows where `cited_judgment_id IS NULL` are
 *    touched. An edge some earlier pass resolved is left exactly as it is.
 *
 * Every refusal is counted and printed. A pass that silently discarded its
 * near-misses would be indistinguishable from one that had none.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE YEAR PATTERN USES `[0-9]`, NOT `\d`, AND THAT IS NOT STYLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `\d` does not survive the trip from a JS tagged template through the driver to
 * Postgres intact. Measured: `regexp_matches(rc, '(1[89]\d{2}|20\d{2})', 'g')`
 * inside a `sql` template **matched nothing at all** — the LATERAL then dropped
 * every corpus row, and `[1950] 1 S.C.R. 806` produced no year. It fails
 * **silently**, as an empty match set rather than an error, so a guard built on
 * it would have looked like a guard that never needed to fire.
 *
 * `[0-9]` contains no backslash and cannot be re-escaped by anything in that
 * chain. Verified directly: 38,431 corpus years extracted, `[1950] 1 S.C.R. 806`
 * → `1950`, and the artefact `"(2014)14 SCC\n664"` → `2014`.
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
/**
 * `--external` additionally resolves `external_citations.cited_judgment_id` —
 * High Court citation SIGHTINGS of a judgment we do not hold as a citing row,
 * as opposed to `judgment_citations`, edges between judgments we DO hold.
 * Off by default: this flag was added 12 Aug 2026 alongside
 * `internal-concordance-cli.ts`, which writes new `judgment_citation_aliases`
 * rows for High Court targets specifically — nothing before that CLI existed
 * had ever re-run `external_citations` against a grown alias table, so this
 * table's own resolution rate could only fall further behind on every future
 * `judgment_citation_aliases` write. Separate flag, not the default, because
 * the two tables have different owners and different call sites elsewhere in
 * this repo, and silently widening what a plain `resolve --apply` touches is
 * exactly the kind of scope creep the ponytail ladder forbids.
 */
const RESOLVE_EXTERNAL = process.argv.includes('--external');

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 3 });

/**
 * Every citation form we hold → the judgment it names, plus that judgment's own
 * years for the year guard. Built in SQL so 38,341 judgments never cross the
 * wire — `CONTINUATION_PROMPT.md` §8: the work was never the database's.
 */
const CORPUS_KEYS = sql`
  SELECT upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) AS k, j.id, rc AS src
  FROM judgments j, unnest(j.reporter_citations) rc
  WHERE rc <> ''
  UNION ALL
  SELECT upper(regexp_replace(j.neutral_citation, '[^A-Za-z0-9]', '', 'g')), j.id, j.neutral_citation
  FROM judgments j WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
  UNION ALL
  SELECT a.alias_key, a.judgment_id, a.alias
  FROM judgment_citation_aliases a
`;

try {
  console.log('CITATION RE-RESOLUTION');
  console.log('='.repeat(74));

  const [before] = await sql<{ total: number; resolved: number; sentinels: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::int AS resolved,
           count(*) FILTER (WHERE citation_text = '')::int AS sentinels
    FROM judgment_citations`;

  /**
   * The denominator is REAL CITATION EDGES, never every row.
   *
   * `judgment_citations` also holds one sentinel per judgment that cites
   * nothing. Counting those as unresolved citations understated this figure by
   * 3.1 points for as long as it has been published — 40.4% over all rows
   * against 43.5% over citations. Both numbers are arithmetically true; only one
   * of them answers "of the citations we extracted, how many can we point at a
   * judgment we hold".
   *
   * Printed with its denominator every time, so the next reader cannot pick the
   * percentage up without the thing it is a percentage OF.
   */
  const edgesOf = (row: { total: number; sentinels: number } | undefined) =>
    Math.max((row?.total ?? 1) - (row?.sentinels ?? 0), 1);
  const pct = (n: number, row = before) => `${((n / edgesOf(row)) * 100).toFixed(1)}%`;
  console.log(
    `before: ${before?.resolved?.toLocaleString()} / ${edgesOf(before).toLocaleString()} citation edges ` +
      `resolved (${pct(before?.resolved ?? 0)})   [${before?.sentinels?.toLocaleString()} sentinels excluded]`,
  );

  /* ------------------------------------------------------- the candidates -- */
  const stats = await sql<
    { verdict: string; edges: number }[]
  >`
    WITH corpus AS (${CORPUS_KEYS}),
    keyed AS (
      SELECT k,
             count(DISTINCT id)::int AS targets,
             min(id::text)           AS target,
             -- every 4-digit year appearing in any form of this judgment's citations
             array_agg(DISTINCT y)   AS years
      FROM corpus, LATERAL (
        SELECT (regexp_matches(src, '(1[89][0-9][0-9]|20[0-9][0-9])', 'g'))[1] AS y
      ) yy
      GROUP BY k
    ),
    edges AS (
      SELECT jc.id,
             jc.citing_judgment_id                                            AS citing,
             upper(regexp_replace(jc.citation_text, '[^A-Za-z0-9]', '', 'g')) AS k,
             substring(jc.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])')        AS year
      FROM judgment_citations jc
      WHERE jc.cited_judgment_id IS NULL AND jc.citation_text <> ''
    )
    SELECT CASE
             WHEN kd.k IS NULL          THEN 'no key in our corpus'
             WHEN kd.targets > 1        THEN 'REFUSED: two or more targets'
             WHEN e.year IS NULL        THEN 'REFUSED: no year in the citation'
             WHEN NOT (e.year = ANY(kd.years)) THEN 'REFUSED: year guard'
             WHEN e.citing = kd.target::uuid   THEN 'REFUSED: self-citation'
             ELSE 'RESOLVABLE'
           END AS verdict,
           count(*)::int AS edges
    FROM edges e LEFT JOIN keyed kd ON kd.k = e.k
    GROUP BY 1 ORDER BY edges DESC`;

  console.log('');
  for (const s of stats) console.log(`  ${String(s.edges).padStart(7)}  ${s.verdict}`);

  const [empty] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM judgment_citations
    WHERE cited_judgment_id IS NULL AND citation_text = ''`;
  // NOT a defect, and it was recorded as one for a day. These are SENTINELS:
  // citations-cli writes one row with an empty citation_text to mark a judgment
  // that cites nothing, so the resumable pass does not re-scan it. Verified
  // against production — one per judgment, never beside a real edge.
  //
  // They are excluded from the percentages below because a row that is not a
  // citation does not belong in the denominator of "citations we resolved".
  console.log(
    `  ${String(empty?.n ?? 0).padStart(7)}  (sentinels: "this judgment cites nothing" — not citations, not a defect)`,
  );

  const resolvable = stats.find((s) => s.verdict === 'RESOLVABLE')?.edges ?? 0;
  console.log('');
  console.log(`RESOLVABLE: ${resolvable.toLocaleString()} edges`);
  console.log(
    `after apply: ${((before?.resolved ?? 0) + resolvable).toLocaleString()} / ${edgesOf(before).toLocaleString()} ` +
      `= ${pct((before?.resolved ?? 0) + resolvable)}`,
  );

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  /* ------------------------------------------------------------- the write -- */
  // One statement. 49,605 single-row updates over the proxy is the mistake
  // CONTINUATION_PROMPT.md §8 already recorded costing 34 minutes and a timeout.
  const updated = await sql`
    WITH corpus AS (${CORPUS_KEYS}),
    keyed AS (
      SELECT k, count(DISTINCT id)::int AS targets, min(id::text) AS target,
             array_agg(DISTINCT y) AS years
      FROM corpus, LATERAL (
        SELECT (regexp_matches(src, '(1[89][0-9][0-9]|20[0-9][0-9])', 'g'))[1] AS y
      ) yy
      GROUP BY k
    ),
    edges AS (
      SELECT jc.id,
             jc.citing_judgment_id                                            AS citing,
             upper(regexp_replace(jc.citation_text, '[^A-Za-z0-9]', '', 'g')) AS k,
             substring(jc.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])') AS year
      FROM judgment_citations jc
      WHERE jc.cited_judgment_id IS NULL AND jc.citation_text <> ''
    )
    UPDATE judgment_citations jc
    SET cited_judgment_id = kd.target::uuid
    FROM edges e JOIN keyed kd ON kd.k = e.k
    WHERE jc.id = e.id
      AND jc.cited_judgment_id IS NULL   -- never overwrite an existing resolution
      AND kd.targets = 1                 -- exactly one candidate, or nothing
      AND e.year IS NOT NULL
      AND e.year = ANY(kd.years)         -- the year guard
      -- A judgment does not cite itself. judgment_citations_no_self_citation
      -- refuses it at the database, and the first --apply hit exactly that:
      -- an Indian judgment's own citation appears in its header and headnote, so
      -- the extractor sees it and the key matches its own row. Filtered here so
      -- the pass reports it as a category rather than dying on the constraint.
      AND e.citing <> kd.target::uuid
  `;

  const [after] = await sql<{ total: number; resolved: number; sentinels: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::int AS resolved,
           count(*) FILTER (WHERE citation_text = '')::int AS sentinels
    FROM judgment_citations`;

  console.log('');
  console.log(`UPDATED ${updated.count.toLocaleString()} edges`);
  console.log(
    `after: ${after?.resolved?.toLocaleString()} / ${edgesOf(after).toLocaleString()} citation edges ` +
      `resolved (${pct(after?.resolved ?? 0, after)})   [${after?.sentinels?.toLocaleString()} sentinels excluded]`,
  );

  /* ============================================================================
   * `--external` — the same resolution against `external_citations`, added
   * 12 Aug 2026. Same three guards (exactly one target, the year guard, never
   * overwrite); no self-citation guard, because a High Court document sighted
   * here is not itself a row in `judgments` and cannot self-cite one.
   * ============================================================================ */
  if (RESOLVE_EXTERNAL) {
    console.log('');
    console.log('EXTERNAL CITATIONS RE-RESOLUTION');
    console.log('='.repeat(74));

    const [extBefore] = await sql<{ total: number; resolved: number }[]>`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::int AS resolved
      FROM external_citations`;
    console.log(
      `before: ${extBefore?.resolved?.toLocaleString()} / ${extBefore?.total?.toLocaleString()} ` +
        `external citation sightings resolved (${((100 * (extBefore?.resolved ?? 0)) / Math.max(extBefore?.total ?? 1, 1)).toFixed(1)}%)`,
    );

    const extStats = await sql<{ verdict: string; edges: number }[]>`
      WITH corpus AS (${CORPUS_KEYS}),
      keyed AS (
        SELECT k, count(DISTINCT id)::int AS targets, min(id::text) AS target,
               array_agg(DISTINCT y) AS years
        FROM corpus, LATERAL (
          SELECT (regexp_matches(src, '(1[89][0-9][0-9]|20[0-9][0-9])', 'g'))[1] AS y
        ) yy
        GROUP BY k
      ),
      edges AS (
        SELECT ec.id, ec.citation_key AS k,
               substring(ec.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])') AS year
        FROM external_citations ec
        WHERE ec.cited_judgment_id IS NULL
      )
      SELECT CASE
               WHEN kd.k IS NULL          THEN 'no key in our corpus'
               WHEN kd.targets > 1        THEN 'REFUSED: two or more targets'
               WHEN e.year IS NULL        THEN 'REFUSED: no year in the citation'
               WHEN NOT (e.year = ANY(kd.years)) THEN 'REFUSED: year guard'
               ELSE 'RESOLVABLE'
             END AS verdict,
             count(*)::int AS edges
      FROM edges e LEFT JOIN keyed kd ON kd.k = e.k
      GROUP BY 1 ORDER BY edges DESC`;

    for (const s of extStats) console.log(`  ${String(s.edges).padStart(7)}  ${s.verdict}`);
    const extResolvable = extStats.find((s) => s.verdict === 'RESOLVABLE')?.edges ?? 0;
    console.log(`\nRESOLVABLE: ${extResolvable.toLocaleString()} sightings`);

    if (APPLY) {
      const extUpdated = await sql`
        WITH corpus AS (${CORPUS_KEYS}),
        keyed AS (
          SELECT k, count(DISTINCT id)::int AS targets, min(id::text) AS target,
                 array_agg(DISTINCT y) AS years
          FROM corpus, LATERAL (
            SELECT (regexp_matches(src, '(1[89][0-9][0-9]|20[0-9][0-9])', 'g'))[1] AS y
          ) yy
          GROUP BY k
        ),
        edges AS (
          SELECT ec.id, ec.citation_key AS k,
                 substring(ec.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])') AS year
          FROM external_citations ec
          WHERE ec.cited_judgment_id IS NULL
        )
        UPDATE external_citations ec
        SET cited_judgment_id = kd.target::uuid
        FROM edges e JOIN keyed kd ON kd.k = e.k
        WHERE ec.id = e.id
          AND ec.cited_judgment_id IS NULL
          AND kd.targets = 1
          AND e.year IS NOT NULL
          AND e.year = ANY(kd.years)
      `;

      const [extAfter] = await sql<{ total: number; resolved: number }[]>`
        SELECT count(*)::int AS total, count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::int AS resolved
        FROM external_citations`;
      console.log(`\nUPDATED ${extUpdated.count.toLocaleString()} sightings`);
      console.log(
        `after: ${extAfter?.resolved?.toLocaleString()} / ${extAfter?.total?.toLocaleString()} ` +
          `external citation sightings resolved (${((100 * (extAfter?.resolved ?? 0)) / Math.max(extAfter?.total ?? 1, 1)).toFixed(1)}%)`,
      );
    } else {
      console.log('\nDRY RUN -- nothing written. Re-run with --apply.');
    }
  }
} finally {
  await sql.end();
}
