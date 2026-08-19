/**
 * NEW2 — THE AUDIT SAMPLE `hc_document_class` NEEDS BEFORE IT CAN BE A SELECTOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT NEW1 ASKED FOR, AND WHY THIS TOOL DOES NOT ANSWER IT BY ITSELF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1 (bus 0706): *"`hc_document_class` is not an input to the pilot, it is a
 * SELECTOR, and a selector whose per-class precision is unmeasured cannot be
 * used to choose 13.5 million vectors' worth of embedding work."* That is right,
 * and it has a consequence this file exists to be honest about:
 *
 * **Precision cannot be computed from the database.** Precision is agreement
 * between a label and a TRUTH, and there is no adjudicated truth for these rows.
 * Re-running `classifyHcDocument` over them measures only that the function is
 * deterministic — it would report 100% and mean nothing. A number produced that
 * way, handed to NEW1, would be worse than the absence of a number, because the
 * absence is at least visible.
 *
 * So this tool produces the SAMPLE, not the verdict: a stratified draw across
 * every class, each row carrying the evidence a human or a model needs to say
 * whether the label is right. The verdict is written by whoever adjudicates it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT EACH SAMPLED ROW CARRIES, AND WHY EACH FIELD IS THERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   hc_document_class   the label under audit.
 *   hc_class_method     WHICH RULE FIRED. This is the field that makes an
 *                       adjudication actionable: `disposal_nature_merits` being
 *                       wrong and `text_bail_phrase` being wrong are different
 *                       defects with different fixes, and a sample that recorded
 *                       only the class would send both to the same place.
 *   disposal_nature     the raw source string the rule read, verbatim.
 *   textHead / textLen  enough prose to judge, and the length that decided
 *                       `decided` against `decided_brief`.
 *   sourceUrl           so the adjudicator can open the PDF rather than trust
 *                       our extraction of it.
 *
 * That is NEW1's other request in the same message — *"whatever produced each
 * verdict, as data"* — applied here rather than deferred to a schema change.
 * None of it needs a new column; all of it already exists on the row.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE CLASS WORTH SAMPLING HARDEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `decided` is the Tier-A selector. It is also where this classifier has already
 * been caught being wrong once, by its own author: before `BAIL_PHRASE` existed,
 * **58% of what the merits branch called `decided` were bail applications**
 * (`hc-classify.ts`). A rule added to fix that is exactly the kind of rule an
 * audit should re-test rather than assume, so `decided` is drawn at the full
 * per-class size and its `text_bail_phrase` neighbours are drawn beside it.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/hc-class-precision-cli.ts [--per-class 50] \
 *     [--json ../../docs/ops/migration/new2-class-precision-sample.json]
 */
import { writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const PER_CLASS = Number(argOf('per-class', '50'));
const JSON_OUT = argOf('json');

const CLASSES = ['decided', 'decided_brief', 'bail_order', 'procedural_disposal', 'reference_stub'] as const;

type Sample = {
  id: string;
  court: string;
  hcDocumentClass: string;
  hcClassMethod: string;
  disposalNature: string | null;
  textLen: number;
  textHead: string;
  sourceUrl: string;
};

const sql = await openDb(url, 2, 10 * 60_000);

try {
  const out: Sample[] = [];
  const methodTally = new Map<string, number>();

  for (const cls of CLASSES) {
    /**
     * A random primary-key START, then a run — never `ORDER BY random()`.
     *
     * The same trap `legacy-font-pilot-cli.ts` fell into and is documented
     * there: `ORDER BY random()` must materialise every matching row before it
     * can order them, so the LIMIT bounds the output and not the work. On a
     * class holding 350,971 rows that is the whole class read to return fifty.
     *
     * The cost is stated rather than hidden: this is a contiguous run of the key
     * from a random start, not a uniform draw. `id` is a UUID so the run is not
     * one court or one year, but neighbouring rows share an insertion batch and
     * the spread is narrower than a true random sample. For an audit whose job
     * is to FIND defects that is acceptable; for a rate it would not be, and no
     * rate is computed here.
     */
    const start = `${Math.floor(Math.random() * 16).toString(16)}0000000-0000-0000-0000-000000000000`;
    const rows = (await sql`
      SELECT id, court, hc_document_class, hc_class_method, disposal_nature,
             length(full_text) AS len, left(full_text, 600) AS head, source_url
      FROM judgments
      WHERE hc_document_class = ${cls} AND id > ${start}::uuid
      ORDER BY id
      LIMIT ${PER_CLASS}`) as unknown as {
      id: string;
      court: string;
      hc_document_class: string;
      hc_class_method: string;
      disposal_nature: string | null;
      len: number;
      head: string;
      source_url: string;
    }[];

    for (const r of rows) {
      methodTally.set(r.hc_class_method, (methodTally.get(r.hc_class_method) ?? 0) + 1);
      out.push({
        id: r.id,
        court: r.court,
        hcDocumentClass: r.hc_document_class,
        hcClassMethod: r.hc_class_method,
        disposalNature: r.disposal_nature,
        textLen: Number(r.len),
        textHead: r.head,
        sourceUrl: r.source_url,
      });
    }
    console.log(`  ${cls.padEnd(22)} drew ${String(rows.length).padStart(4)}`);
  }

  console.log('\n  ── which RULE produced the sampled labels ──');
  for (const [m, n] of [...methodTally].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(4)}  ${m}`);
  }

  const report = {
    tool: 'hc-class-precision-cli',
    takenAt: new Date().toISOString(),
    perClass: PER_CLASS,
    drawn: out.length,
    methodTally: [...methodTally].sort((a, b) => b[1] - a[1]).map(([method, n]) => ({ method, rows: n })),
    adjudication: {
      status: 'NOT ADJUDICATED',
      instruction:
        'For each row decide whether hc_document_class is correct for what the document IS, ' +
        'using textHead and, where it does not settle it, sourceUrl. Record correct/incorrect ' +
        'per row. Per-class precision is then correct/(correct+incorrect) WITHIN each class.',
      warning:
        'Re-running classifyHcDocument over these rows measures determinism, not precision, ' +
        'and would report 100%. The label must be compared with the DOCUMENT, never with the rule.',
      priorDefect:
        'Before BAIL_PHRASE existed, 58% of merits-branch `decided` rows were bail applications ' +
        '(hc-classify.ts). Weight the `decided` class accordingly; it is the Tier-A selector.',
    },
    caveats: [
      'Contiguous primary-key run from a random start, per class. Not a uniform random sample; adequate for finding defects, not for estimating a rate.',
      'Classes are sampled at EQUAL size, so this is a stratified audit sample and its class mix is not the corpus mix.',
    ],
    rows: out,
  };

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\n  wrote ${JSON_OUT}  (${out.length} rows, NOT adjudicated)`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
