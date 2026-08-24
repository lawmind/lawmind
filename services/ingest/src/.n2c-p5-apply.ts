/**
 * NEW2 P5c — WITHDRAW THE 19 TREATMENT CLAIMS MADE BY A HYPHEN INSIDE A WORD.
 *
 * §8/NEW2-5: correct known deterministic writer bugs, only where primary
 * evidence makes the correction deterministic, and do not broaden into a mass
 * treatment rewrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE 19 AND NOTHING ELSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `MARKER_RE` opened with a bare `[-–—]`, so any hyphen could be read as the
 * dash that closes a law report's Case Law Cited entry. It matched hyphens
 * sitting INSIDE words:
 *
 *     "has dis-approved the decision"            -> stored `approved`
 *     "as contra-distinguished from"             -> stored `distinguished`
 *     "well settled and un- doubted"             -> stored `doubted`
 *     "one of its earlier deci- sions"           -> stored `distinguished`
 *
 * Each stored the OPPOSITE of, or something unrelated to, what the court said.
 * The writer was fixed on 23 August with a `(?<![A-Za-z])` lookbehind — a
 * closing annotation dash follows a citation, which ends in a digit or a
 * bracket, never a letter.
 *
 * These 19 rows were written before that fix. They are the complete affected
 * set, established by re-deriving ALL 16,001 treatment-bearing edges against
 * BOTH writers — `detectTreatment` (citations.ts) and `readTreatment`
 * (treatment.ts) — and keeping only the rows NEITHER can reproduce from the
 * stored characters. 15,982 of 16,001 are reproduced; 0 rows are contradicted;
 * 0 rows have drifted off their offset.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS SAFE, ASSERTED RATHER THAN ASSUMED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1. WITHDRAWAL ONLY. Every row goes to `cites` with empty evidence — the value
 *     both current writers return. Nothing is manufactured, no new treatment is
 *     created, and no relationship is changed into a different treatment.
 *  2. NO BADGE MOVES. Measured first (`treatment-correction-impact.json`):
 *     18 of 19 are unpinned, the 1 pinned row targets a judgment whose
 *     `overruled_status` is `none`, and `approved` is not in
 *     `propagate-treatment.ts`'s IN-list at all. **0 rows would remove a LAW
 *     MOVED mark.** Removing a warning is the dangerous direction and this pass
 *     does not do it — the guard below re-asserts that at write time.
 *  3. THE GUARDS ARE IN THE STATEMENT. The UPDATE re-checks the relationship it
 *     expects to find and refuses any row whose target carries a live
 *     `overruled_status`. A precondition measured minutes ago is not a
 *     precondition; one in the WHERE clause is.
 *  4. REVERSIBLE. Every prior value is in `treatment-rederivation.json` and
 *     `treatment-correction-impact.json`, by edge id.
 *
 *   default    DRY RUN
 *   --apply    write
 */
import { readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const IMPACT = 'docs/ai/new2/treatment-correction-impact.json';
const OUT = 'docs/ai/new2/treatment-correction-applied.json';

type ImpactRow = {
  edge_id: string;
  relationship: string;
  evidence: string | null;
  would_remove_a_badge: boolean;
};

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Refusing rather than guessing a connection.');
    return 2;
  }
  const impact = JSON.parse(readFileSync(IMPACT, 'utf8')) as {
    rows: ImpactRow[];
    would_remove_a_badge: number;
  };

  /* The file itself is a precondition. If a later re-measure ever finds a badge
   * at risk, this refuses to run at all rather than skipping the row quietly. */
  if (impact.would_remove_a_badge !== 0) {
    console.error(
      `REFUSING: the impact file reports ${impact.would_remove_a_badge} row(s) that would remove a\n` +
        'LAW MOVED mark. An adverse withdrawal is adjudicated by hand against the primary\n' +
        'judgment, never by a batch.',
    );
    return 3;
  }

  const sql = postgres(url, { max: 1, prepare: false, statement_timeout: 120_000, onnotice: () => {} });
  try {
    const ids = impact.rows.map((r) => r.edge_id);
    const expected = impact.rows.map((r) => r.relationship);

    console.log(`${impact.rows.length} rows, all withdrawing to 'cites'`);
    for (const r of impact.rows) {
      console.log(`  ${r.edge_id.slice(0, 8)}  ${r.relationship.padEnd(18)} -> cites   was «${String(r.evidence).replace(/\s+/g, ' ')}»`);
    }

    if (!APPLY) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply.');
      return 0;
    }

    const updated = await sql`
      UPDATE judgment_citations c
         SET relationship = 'cites', evidence = ''
        FROM (SELECT unnest(${ids}::uuid[]) AS id,
                     unnest(${expected}::text[]) AS was) v
       WHERE c.id = v.id
         -- The row must still say what it said when this was measured.
         AND c.relationship = v.was
         -- And it must not be holding up a live LAW MOVED mark. Belt and braces:
         -- the impact file said zero, and this says zero again at write time.
         AND NOT EXISTS (
           SELECT 1 FROM judgments j
            WHERE j.id = c.cited_judgment_id
              AND j.overruled_status IS NOT NULL
              AND j.overruled_status <> 'none')`;

    console.log(`\napplied: ${updated.count} of ${ids.length}`);
    if (updated.count !== ids.length) {
      console.log('  (a row that did not update is a row whose state changed since the measure — read it before re-running)');
    }

    const after = await sql<{ relationship: string; n: number }[]>`
      SELECT relationship, count(*)::int AS n
        FROM judgment_citations WHERE id = ANY(${ids}::uuid[]) GROUP BY 1`;
    console.log('after:', JSON.stringify(after));

    const totals = await sql<{ relationship: string; n: number }[]>`
      SELECT relationship, count(*)::int AS n
        FROM judgment_citations WHERE relationship <> 'cites' GROUP BY 1 ORDER BY 2 DESC`;
    console.log('treatment population now:', JSON.stringify(totals));

    writeFileSync(
      OUT,
      JSON.stringify(
        {
          applied_at: new Date().toISOString(),
          defect: 'MARKER_RE read a hyphen INSIDE a word as the closing annotation dash',
          fixed_in_writer: 'services/ingest/src/citations.ts, (?<![A-Za-z]) lookbehind, 23 Aug 2026',
          rows_expected: ids.length,
          rows_applied: updated.count,
          badges_moved: 0,
          prior_values: impact.rows,
          treatment_population_after: totals,
        },
        null,
        2,
      ),
    );
    console.log(`wrote ${OUT}`);
    return 0;
  } finally {
    await sql.end({ timeout: 10 });
  }
}

main().then((c) => process.exit(c));
