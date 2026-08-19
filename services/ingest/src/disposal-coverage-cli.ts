/**
 * NEW2 — WHAT WOULD TODAY'S RULES SAY ABOUT THE ROWS RECORDED AS UNCLASSIFIABLE?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION THIS ANSWERS, AND WHY IT IS NOT THE QUESTION THAT WAS ASKED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The standing direction is to attack `disposal_nature` coverage on the reading
 * that **~50.9% of the assessed population is unclassifiable and the first lever
 * is therefore rule quality**. That reading is what this tool was built to act
 * on, and the first thing it has to establish is the denominator: of the rows
 * sitting at `hc_class_method = 'unclassified_disposal:…'`, how many are strings
 * **today's `classifyHcDocument` already claims**?
 *
 * That number is not derivable from the database. `hc_class_method` records the
 * verdict of whatever version of the rules ran at the time, and the vocabulary
 * was extended substantially on 14 Aug 2026 (`hc-classify.ts` MEASURED_VOCABULARY
 * — `DISMISSED AS WITHDRAWN`, `DISMISSED AS INFRUCTUOUS`, the `DISMISED`
 * misspelling, the `26-`/`38-` registry stage codes). **A row classified before
 * that change is indistinguishable in the column from a row the current rules
 * genuinely cannot claim**, and the two want opposite work: one wants a re-run,
 * the other wants a new rule.
 *
 * So this replays the CURRENT function over the raw disposal strings the column
 * recorded, and splits the population three ways:
 *
 *   STALE       today's rules classify it — the row is unclassified only because
 *               it has not been re-assessed since the rules changed.
 *   RESIDUE     today's rules refuse it, deliberately (the `DISPOSED*`/`CLOSED`
 *               family the module header argues at length must stay refused).
 *   CANDIDATE   today's rules refuse it and the refusal is NOT the documented
 *               deliberate one — the only population where a new rule is the
 *               answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CALLS THE REAL FUNCTION, WITH ONE SUBSTITUTION THAT IS STATED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `classifyHcDocument` reads three inputs: `disposalNature`, `caseNumber` and
 * `fullText`. Only the first is under test here, so the other two are held at a
 * value that cannot fire their branches — a long text with no pointer phrase and
 * no bail phrase. That is a substitution, not a simulation: the disposal
 * branches are reached with exactly the code that runs in production, and the
 * two text-reading rules (`reference_stub`, `text_bail_phrase`) are held OFF on
 * purpose so this measures the disposal vocabulary alone.
 *
 * **What that means for the output, said plainly rather than left to be
 * discovered:** a row this tool calls STALE would be re-classified as
 * `reference_stub` instead if its real text is under 500 characters. That moves
 * it between two classified buckets; it does not move it back to unclassified.
 * The STALE count is therefore a claim about *classifiability*, which is what
 * the direction asks about, and not a prediction of the final class.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/disposal-coverage-cli.ts [--limit 400] [--json path]
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { classifyHcDocument } from './hc-classify.js';
import { sslFor } from './db-ssl.js';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const LIMIT = Number(argOf('limit', '400'));
const JSON_OUT = argOf('json');

/**
 * A text long enough to reach the disposal branches and inert enough not to
 * fire the two rules that read prose. Both exclusions are deliberate; see the
 * header.
 */
const INERT_TEXT = 'x'.repeat(5000);

/**
 * The `DISPOSED*` / `CLOSED` family the module refuses on purpose.
 *
 * Held here as its own list rather than inferred from "the rules said no",
 * because the distinction between *refused deliberately* and *not yet thought
 * about* is the entire output of this tool. NEW2 measured the cost of getting
 * this wrong: a rule mapping `DISPOSED OFF` to `decided` would have moved
 * **32.5%** of a 200-document sample into the authority class on a word that
 * covers a reasoned decision, a consent order and an infructuous closure alike
 * (bus 0628, `docs/HC_PLAIN_VARIANT_COMPOSITION.md`).
 *
 * `ORDERED`, `RELAXED`, `PREMPTORY` and the bare `ANY OTHER MODE` stage codes
 * are in the same position: they name that something happened, not what.
 */
const DELIBERATE_RESIDUE =
  /(^\d{1,3}-\s*)?(DISPOSED|DISPOSAL|CLOSED|ORDERED|RELAXED|PRE?EMPTORY|ANY OTHER MODE|OTHERS? DISPOSED|MCA DISPOSED|CA DISPOSED|DATA NOT AVAILABLE|CASES NOT FALLING|ALONGWITH RECORDS|BOGUS)/;

const sql = postgres(url, {
  ssl: sslFor(url),
  max: 1,
  idle_timeout: 20,
  connect_timeout: 60,
  prepare: false,
});

type Row = { raw_disposal: string; n: string };

try {
  /**
   * The vocabulary comes from `hc_class_method`, not from `disposal_nature`.
   *
   * Deliberate: `hc_class_method` names the rows a classifier LOOKED AT and
   * could not claim, which is the population under discussion. Grouping
   * `disposal_nature` instead would sweep in the 12.6M rows nothing has ever
   * assessed and answer a different question — and would cost a full-table
   * aggregate on a 15M-row table while eleven ingest scopes are writing.
   *
   * `ORDER BY count(*)`, not `ORDER BY 2`. The count is cast to text so a
   * bigint does not reach JS as a lossy number, and ordinal ordering would
   * therefore sort it as a STRING — `"94"` above `"8586"`. The first run of
   * this tool did exactly that. It did not change any total (the whole
   * vocabulary is 332 strings and fits inside any sane LIMIT), but every
   * "top N" list it printed was ranked by the first digit.
   */
  const rows = (await sql`
    SELECT substring(hc_class_method FROM 23) AS raw_disposal, count(*)::text AS n
    FROM judgments
    WHERE hc_class_method LIKE 'unclassified_disposal:%'
    GROUP BY 1
    ORDER BY count(*) DESC
    LIMIT ${LIMIT}
  `) as unknown as Row[];

  const total = rows.reduce((a, r) => a + Number(r.n), 0);

  const buckets = { stale: [] as unknown[], residue: [] as unknown[], candidate: [] as unknown[] };
  const counts = { stale: 0, residue: 0, candidate: 0 };

  for (const r of rows) {
    const n = Number(r.n);
    const verdict = classifyHcDocument({
      disposalNature: r.raw_disposal,
      caseNumber: null,
      fullText: INERT_TEXT,
    });

    const entry = { disposal: r.raw_disposal, rows: n, wouldBe: verdict.documentClass, method: verdict.method };

    if (verdict.documentClass !== null) {
      buckets.stale.push(entry);
      counts.stale += n;
    } else if (DELIBERATE_RESIDUE.test(r.raw_disposal.toUpperCase())) {
      buckets.residue.push(entry);
      counts.residue += n;
    } else {
      buckets.candidate.push(entry);
      counts.candidate += n;
    }
  }

  const pct = (x: number) => `${((100 * x) / total).toFixed(1)}%`;

  console.log(`\nDISPOSAL COVERAGE REPLAY — top ${rows.length} distinct strings, ${total.toLocaleString()} rows\n`);
  console.log(`  STALE      ${String(counts.stale).padStart(9)}  ${pct(counts.stale).padStart(6)}  today's rules DO classify these`);
  console.log(`  RESIDUE    ${String(counts.residue).padStart(9)}  ${pct(counts.residue).padStart(6)}  refused on purpose (DISPOSED/CLOSED family)`);
  console.log(`  CANDIDATE  ${String(counts.candidate).padStart(9)}  ${pct(counts.candidate).padStart(6)}  refused, and NOT by a documented decision\n`);

  const show = (label: string, list: { disposal: string; rows: number; wouldBe: string | null }[], k: number) => {
    console.log(`  ── ${label} — top ${Math.min(k, list.length)} of ${list.length} distinct ──`);
    for (const e of list.slice(0, k)) {
      console.log(`     ${String(e.rows).padStart(8)}  ${(e.wouldBe ?? '—').padEnd(20)} ${e.disposal}`);
    }
    console.log('');
  };
  show('STALE', buckets.stale as never, 25);
  show('CANDIDATE', buckets.candidate as never, 40);

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          tool: 'disposal-coverage-cli',
          takenAt: new Date().toISOString(),
          distinctStringsExamined: rows.length,
          rowsCovered: total,
          counts,
          caveat:
            'STALE is a claim about classifiability, not about the final class: a short document would land in reference_stub instead. Both are classified.',
          buckets,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    console.log(`  wrote ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
