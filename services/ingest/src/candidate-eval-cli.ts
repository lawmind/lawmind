/**
 * NEW2 — AN INDEPENDENT EVALUATION OF LCC'S MODEL CLASSIFICATION CANDIDATES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS INDEPENDENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC's own audit (bus 0911) measures the model against ITSELF: fabrication rate
 * via span verification, and reproducibility via a second run. Both are the right
 * measurements and neither uses any evidence from outside the model.
 *
 * This uses evidence the model was never shown and that LCC's audit does not
 * consult:
 *
 *   1. **A deterministic bail screen.** `proposed_class = 'bail_order'` is
 *      checkable against a regex over the document's own text. Agreement is not
 *      proof the label is right, but a `bail_order` candidate in a document with
 *      no bail phrase anywhere is a defect visible without a second model.
 *   2. **The English-density screen.** A document whose text is not language in
 *      any script cannot support a class, and a span "verified" inside it is a
 *      substring match against garbage. LCC reports 16.9% `span_not_found`; this
 *      asks how much of the population was unreadable in the first place.
 *   3. **The value band.** `decided_brief`'s rule is `decided` minus length, so a
 *      `decided_brief` candidate on a 40,000-character document disagrees with
 *      the definition of the class it is proposing.
 *
 * None of these can say a candidate is RIGHT. Each can say a candidate is
 * inconsistent with something the document itself says, which is the only kind of
 * disagreement worth reporting from a second lane.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WRITES NOTHING AND PROMOTES NOTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc_class_candidate` is LCC's table and `judgments.hc_document_class` is not
 * touched by this tool at all. The output is a report. A lane that evaluates
 * another lane's output and can also promote it is not an evaluator.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/candidate-eval-cli.ts [--json ../../docs/ops/migration/new2-candidate-eval.json]
 */
import { writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';
import { BAIL_PHRASE, ENGLISH_RATE_FLOOR, englishRate } from './quality-state.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const JSON_OUT = argOf('json');
const PROBE = 20000;

type Row = {
  judgment_id: string;
  proposed_class: string | null;
  span_verdict: string | null;
  trust_state: string | null;
  evidence: string | null;
  court: string | null;
  text_len: number | null;
  probe: string | null;
};

const sql = await openDb(url, 2, 10 * 60_000);

try {
  const rows = (await sql`
    SELECT c.judgment_id,
           c.proposed_class,
           c.span_verdict,
           c.trust_state,
           c.evidence,
           j.court,
           length(substr(j.full_text, 1, 200001)) AS text_len,
           substr(j.full_text, 1, ${PROBE})       AS probe
      FROM hc_class_candidate c
      JOIN judgments j ON j.id = c.judgment_id`) as unknown as Row[];

  const band = (n: number) =>
    n >= 8000
      ? 'substantial'
      : n >= 4000
        ? 'full'
        : n >= 2000
          ? 'standard'
          : n >= 1000
            ? 'brief'
            : 'stub';

  const disagreements: {
    judgmentId: string;
    kind: string;
    proposedClass: string | null;
    spanVerdict: string | null;
    court: string | null;
    textLength: number | null;
    englishRate: number;
    detail: string;
  }[] = [];

  const tally = new Map<string, number>();
  const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);

  let unreadable = 0;
  let unreadableSpanVerified = 0;

  for (const r of rows) {
    const text = r.probe ?? '';
    const en = englishRate(text);
    const len = r.text_len ?? 0;
    const b = band(len);
    const hasBail = BAIL_PHRASE.test(text);
    const spanVerified = r.span_verdict === 'verified';

    bump(`class:${r.proposed_class ?? 'NULL'}`);
    bump(`span:${r.span_verdict ?? 'NULL'}`);
    bump(`band:${b}`);

    /* 1. The document is not language. Whatever class was proposed, and whatever
     *    the span verdict says, the model was reading glyph codes. A "verified"
     *    span here is a substring match inside garbage — the check passes and
     *    means nothing, which is a worse failure than the check failing. */
    if (en < ENGLISH_RATE_FLOOR && len > 0) {
      unreadable++;
      if (spanVerified) unreadableSpanVerified++;
      disagreements.push({
        judgmentId: r.judgment_id,
        kind: spanVerified ? 'UNREADABLE_TEXT_WITH_VERIFIED_SPAN' : 'UNREADABLE_TEXT',
        proposedClass: r.proposed_class,
        spanVerdict: r.span_verdict,
        court: r.court,
        textLength: len,
        englishRate: Number(en.toFixed(2)),
        detail: `englishRate ${en.toFixed(2)} is below the floor of ${ENGLISH_RATE_FLOOR}`,
      });
      continue;
    }

    /* 2. `bail_order` proposed where no bail phrase occurs anywhere in the
     *    document. Not proof the label is wrong — a bail order can be phrased in
     *    ways the screen has no entry for — but it is a candidate with no
     *    independent support. */
    if (r.proposed_class === 'bail_order' && !hasBail) {
      disagreements.push({
        judgmentId: r.judgment_id,
        kind: 'BAIL_CLASS_NO_BAIL_PHRASE',
        proposedClass: r.proposed_class,
        spanVerdict: r.span_verdict,
        court: r.court,
        textLength: len,
        englishRate: Number(en.toFixed(2)),
        detail: 'no bail phrase in the first 20,000 characters',
      });
    }

    /* 3. A bail phrase present and a substantive class proposed. This is the
     *    direction that costs the most — it is how 58% of one merits branch
     *    turned out to be bail applications before `BAIL_PHRASE` existed. */
    if (hasBail && (r.proposed_class === 'decided' || r.proposed_class === 'decided_brief')) {
      disagreements.push({
        judgmentId: r.judgment_id,
        kind: 'SUBSTANTIVE_CLASS_WITH_BAIL_PHRASE',
        proposedClass: r.proposed_class,
        spanVerdict: r.span_verdict,
        court: r.court,
        textLength: len,
        englishRate: Number(en.toFixed(2)),
        detail: 'document carries a bail phrase',
      });
    }

    /* 4. `decided_brief` is `decided` MINUS the length. `BRIEF_MAX_CHARS` is
     *    1,500, so proposing it on a longer document contradicts the definition
     *    of the class rather than merely being a debatable call. */
    if (r.proposed_class === 'decided_brief' && len > 1500) {
      disagreements.push({
        judgmentId: r.judgment_id,
        kind: 'DECIDED_BRIEF_TOO_LONG',
        proposedClass: r.proposed_class,
        spanVerdict: r.span_verdict,
        court: r.court,
        textLength: len,
        englishRate: Number(en.toFixed(2)),
        detail: `${len} characters, against BRIEF_MAX_CHARS of 1,500`,
      });
    }
  }

  const byKind = new Map<string, number>();
  for (const d of disagreements) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);

  const group = (prefix: string) =>
    Object.fromEntries(
      [...tally.entries()]
        .filter(([k]) => k.startsWith(`${prefix}:`))
        .map(([k, v]) => [k.slice(prefix.length + 1), v])
        .sort((a, b) => (b[1] as number) - (a[1] as number)),
    );

  const out = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    evaluates: 'hc_class_candidate, produced by LCC (bus 0911)',
    independence:
      'uses only evidence the model was not shown and LCC did not consult: a deterministic bail screen, the English-density screen, and the value band',
    candidates: rows.length,
    proposedClass: group('class'),
    spanVerdict: group('span'),
    valueBand: group('band'),
    unreadable: {
      documents: unreadable,
      share: Number((unreadable / Math.max(1, rows.length)).toFixed(4)),
      withVerifiedSpan: unreadableSpanVerified,
      note: 'a span verified inside unreadable text is a substring match against glyph codes — the check passes and carries no information',
    },
    disagreementsByKind: Object.fromEntries([...byKind.entries()].sort((a, b) => b[1] - a[1])),
    disagreements: disagreements.slice(0, 200),
    caveats: [
      'None of these checks can say a candidate is RIGHT. Each can say a candidate is inconsistent with something the document itself carries, which is the only disagreement worth reporting from a second lane.',
      'BAIL_CLASS_NO_BAIL_PHRASE is a weak signal in one direction only. The screen has finite recall, so its silence is not evidence of absence; a candidate flagged this way needs a human, not a correction.',
      'The screens read the first 20,000 characters. A bail phrase appearing only beyond that point is missed, and the document is longer than that in a minority of cases.',
      'This tool writes nothing. hc_class_candidate belongs to LCC and judgments.hc_document_class is not touched, because a lane that can both evaluate and promote is not an evaluator.',
    ],
  };

  console.log(
    [
      `candidates                 ${rows.length}`,
      '',
      'proposed class:',
      ...Object.entries(out.proposedClass).map(
        ([k, v]) => `  ${k.padEnd(24)} ${String(v).padStart(5)}`,
      ),
      '',
      'span verdict:',
      ...Object.entries(out.spanVerdict).map(
        ([k, v]) => `  ${k.padEnd(24)} ${String(v).padStart(5)}`,
      ),
      '',
      `unreadable documents       ${unreadable}  ${((100 * unreadable) / Math.max(1, rows.length)).toFixed(1)}%`,
      `  ...with a VERIFIED span  ${unreadableSpanVerified}`,
      '',
      'disagreements:',
      ...Object.entries(out.disagreementsByKind).map(
        ([k, v]) => `  ${k.padEnd(38)} ${String(v).padStart(5)}`,
      ),
    ].join('\n'),
  );

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwritten ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
