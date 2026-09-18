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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sslFor } from './db-ssl';

const APPLY = process.argv.includes('--apply');
/**
 * Run against a citation-key index that is behind the corpus. Refused by
 * default, and the refusal is the point: a stale index does not produce wrong
 * resolutions, it produces MISSING ones reported as `no key in our corpus` —
 * a silent under-resolution that looks exactly like a corpus gap.
 */
const ALLOW_STALE = process.argv.includes('--allow-stale');
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

const sql = postgres(url, { ssl: sslFor(url), max: 3 });

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LOOKUP INDEX IS A TABLE NOW, AND ONLY THE KEYS THE EDGES ASK FOR ARE READ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This used to be a CTE that materialised `judgments × unnest(reporter_citations)`
 * UNION the neutral citations UNION the aliases, ran a LATERAL `regexp_matches`
 * over every one of those strings, and grouped the lot — **four times in one
 * `--apply --external` run**, because the same CTE appeared in four statements.
 * Written against 38,341 judgments; the corpus is 7,296,068. NEW1 measured the
 * result as a 16.4-hour query blocking a second copy of itself (bus 0523).
 *
 * Two things changed and only the second one is about speed:
 *
 * 1. **The keys live in `judgment_citation_keys`**, maintained incrementally by
 *    `citation-keys-cli.ts` with a `(created_at, id)` keyset walk. Deriving them
 *    is no longer part of resolving.
 * 2. **`wanted` bounds the read to the keys the unresolved edges actually
 *    contain.** That is the architectural change: the old pass grouped every key
 *    in the corpus in order to use a few hundred thousand of them, and the join
 *    now runs through `judgment_citation_keys_key_idx` instead of a scan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A DEFECT THE REWRITE EXPOSED — AND IT COULD RESOLVE AN AMBIGUOUS KEY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The old shape was `FROM corpus, LATERAL (SELECT (regexp_matches(src, …))[1])`.
 * A set-returning function in a LATERAL that yields no rows **drops the corpus
 * row entirely** — so a citation form with no extractable year vanished before
 * `count(DISTINCT id)` ever saw it.
 *
 * That silently lowers the target count. A key held by two judgments, where one
 * of them carries a yearless form, counted as `targets = 1` and was therefore
 * **RESOLVABLE** — the exact ambiguity guard #1 exists to refuse, defeated by an
 * unrelated year-extraction artefact. A wrong `cited_judgment_id` points an
 * advocate at the wrong case, which `docs/CITATION_HARNESS.md` §A3d.4 treats as
 * worse than no resolution at all.
 *
 * `LEFT JOIN LATERAL unnest(ck.years)` fixes it: the target count is now taken
 * over judgments, the years are aggregated beside it, and a key with no years
 * survives to be refused BY THE YEAR GUARD — which is the honest verdict — rather
 * than disappearing into `no key in our corpus`.
 */
const KEYED = (wanted: ReturnType<typeof sql>) => sql`
  SELECT ck.citation_key                       AS k,
         count(DISTINCT ck.judgment_id)::int   AS targets,
         min(ck.judgment_id::text)             AS target,
         coalesce(array_agg(DISTINCT y) FILTER (WHERE y IS NOT NULL), '{}') AS years
  FROM (${wanted}) w
  JOIN judgment_citation_keys ck ON ck.citation_key = w.k
  LEFT JOIN LATERAL unnest(ck.years) AS y ON true
  GROUP BY ck.citation_key
`;

/**
 * The index is derived, so it can be behind — and being behind is invisible in
 * the output, which is why this refuses rather than warns. An index missing the
 * newest judgments reports their citations as `no key in our corpus`: identical
 * on screen to a genuine coverage gap, and it would be written up as one.
 */
async function assertIndexFresh(): Promise<void> {
  const checkpoint = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '.checkpoints',
    'citation-keys.json',
  );
  const [{ rows } = { rows: 0 }] = await sql<{ rows: number }[]>`
    SELECT count(*)::int AS rows FROM judgment_citation_keys`;
  if (rows === 0) {
    console.error(
      'judgment_citation_keys is EMPTY. Nothing can resolve and every edge would be reported\n' +
        'as "no key in our corpus". Build it first:\n' +
        '  pnpm --filter @lawmind/ingest citation-keys',
    );
    process.exit(2);
  }

  if (!existsSync(checkpoint)) {
    console.log('  index freshness: no checkpoint file — cannot measure lag, continuing');
    return;
  }
  let cursorAt: string | undefined;
  let cursorId: string | undefined;
  try {
    const c = JSON.parse(readFileSync(checkpoint, 'utf8')) as {
      cursorAt?: string;
      cursorId?: string;
    };
    cursorAt = c.cursorAt;
    cursorId = c.cursorId;
  } catch {
    console.log('  index freshness: checkpoint unreadable — cannot measure lag, continuing');
    return;
  }
  if (!cursorAt || !cursorId) return;

  // Counts only the TAIL above the cursor, through judgments_created_at_idx —
  // this is a range count, not the full-table count the old pass would have done.
  const [{ behind } = { behind: 0 }] = await sql<{ behind: number }[]>`
    SELECT count(*)::int AS behind FROM judgments
    WHERE (created_at, id) > (${cursorAt}::timestamptz, ${cursorId}::uuid)`;

  if (behind === 0) {
    console.log(`  index freshness: up to date (cursor ${cursorAt})`);
    return;
  }
  const msg =
    `judgment_citation_keys is BEHIND by ${behind.toLocaleString()} judgments (cursor ${cursorAt}).\n` +
    'Their citations would be reported as "no key in our corpus", which is indistinguishable\n' +
    'from a real coverage gap. Run `pnpm --filter @lawmind/ingest citation-keys` first.';
  if (!ALLOW_STALE) {
    console.error(msg);
    console.error('Pass --allow-stale to proceed anyway and treat the numbers as a FLOOR.');
    process.exit(2);
  }
  console.log(
    `  index freshness: STALE, proceeding under --allow-stale\n  ${msg.replace(/\n/g, '\n  ')}`,
  );
}

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

  await assertIndexFresh();

  /* ------------------------------------------------------- the candidates -- */
  // `edges` is declared FIRST now, because `keyed` reads from it — that ordering
  // IS the fix. The old version built the key index and then looked at the edges;
  // this one lets the edges decide which keys are worth reading at all.
  const stats = await sql<{ verdict: string; edges: number }[]>`
    WITH edges AS (
      SELECT jc.id,
             jc.citing_judgment_id                                            AS citing,
             upper(regexp_replace(jc.citation_text, '[^A-Za-z0-9]', '', 'g')) AS k,
             substring(jc.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])')        AS year
      FROM judgment_citations jc
      WHERE jc.cited_judgment_id IS NULL AND jc.citation_text <> ''
    ),
    keyed AS (${KEYED(sql`SELECT DISTINCT k FROM edges`)})
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
    WITH edges AS (
      SELECT jc.id,
             jc.citing_judgment_id                                            AS citing,
             upper(regexp_replace(jc.citation_text, '[^A-Za-z0-9]', '', 'g')) AS k,
             substring(jc.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])') AS year
      FROM judgment_citations jc
      WHERE jc.cited_judgment_id IS NULL AND jc.citation_text <> ''
    ),
    keyed AS (${KEYED(sql`SELECT DISTINCT k FROM edges`)})
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
      WITH edges AS (
        SELECT ec.id, ec.citation_key AS k,
               substring(ec.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])') AS year
        FROM external_citations ec
        WHERE ec.cited_judgment_id IS NULL
      ),
      keyed AS (${KEYED(sql`SELECT DISTINCT k FROM edges`)})
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
        WITH edges AS (
          SELECT ec.id, ec.citation_key AS k,
                 substring(ec.citation_text from '(1[89][0-9][0-9]|20[0-9][0-9])') AS year
          FROM external_citations ec
          WHERE ec.cited_judgment_id IS NULL
        ),
        keyed AS (${KEYED(sql`SELECT DISTINCT k FROM edges`)})
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
