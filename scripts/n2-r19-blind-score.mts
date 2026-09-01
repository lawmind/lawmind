/**
 * NEW2 — R19 §8. SCORING THE PREDICTION-BLIND PACK.
 *
 * Joins `blind-answers.jsonl` — written from the documents with no verdict in
 * view — to `blind-key.json`. The join happens here and only here; the pack that
 * was read carried no rule, no class and no proposal.
 *
 * A destructive rule is FALSE on an item the blind reading calls OWN: the rule
 * would have emptied or overwritten a citation the document prints as its own.
 * `CANNOT_TELL` is counted as UNTESTABLE and never as agreement — it is the
 * reading refusing, and a refusal is not evidence for the rule.
 *
 * A protective rule firing on a foreign or cited citation is RECALL LOSS, not
 * harm: the row keeps a value it should not, which is the failure this round is
 * willing to accept.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-blind-score.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r19');
const NL = String.fromCharCode(10);
const ROUND = (() => { const i = process.argv.indexOf('--round'); return i === -1 ? '1' : (process.argv[i + 1] ?? '1'); })();
const ANSWERS = ROUND === '2' ? 'blind-answers-2.jsonl' : 'blind-answers.jsonl';
const KEYFILE = ROUND === '2' ? 'blind-key-2.json' : 'blind-key.json';
const SCORE = ROUND === '2' ? 'blind-score-2.json' : 'blind-score.json';

const DESTRUCTIVE_NULL = new Set(['C2a_FOREIGN_CNR_CORROBORATED', 'C2b_FOREIGN_CNR_UNCORROBORATED', 'C3_CITED_PRECEDENT_LEAD', 'D1_MONTH_IN_SERIES_POSITION']);
const DESTRUCTIVE_REPLACE = new Set(['R4a_TWO_SIDED_CNR', 'R4b_TWO_SIDED_CASE_NUMBER']);

const answers = new Map<string, { answer: string; why: string }>(
  readFileSync(join(OUTDIR, ANSWERS), 'utf8')
    .split(NL).filter((l) => l.trim())
    .map((l) => {
      const a = JSON.parse(l) as { token: string; answer: string; why: string };
      return [a.token, { answer: a.answer, why: a.why }] as [string, { answer: string; why: string }];
    }),
);
const key = (JSON.parse(readFileSync(join(OUTDIR, KEYFILE), 'utf8')) as {
  key: { token: string; judgmentId: string; rule: string }[];
}).key;

type Cell = { agree: number; falseDestructive: number; untestable: number; recallLoss: number; n: number };
const byRule = new Map<string, Cell>();
const falses: unknown[] = [];
const matrix: Record<string, number> = {};

for (const k of key) {
  const a = answers.get(k.token);
  if (!a) throw new Error(`no blind answer for ${k.token}`);
  const c = byRule.get(k.rule) ?? { agree: 0, falseDestructive: 0, untestable: 0, recallLoss: 0, n: 0 };
  c.n++;
  matrix[`${k.rule} :: ${a.answer}`] = (matrix[`${k.rule} :: ${a.answer}`] ?? 0) + 1;

  const destructive = DESTRUCTIVE_NULL.has(k.rule) || DESTRUCTIVE_REPLACE.has(k.rule);
  if (a.answer === 'CANNOT_TELL') c.untestable++;
  else if (destructive) {
    if (a.answer === 'OWN') {
      c.falseDestructive++;
      falses.push({ token: k.token, judgmentId: k.judgmentId, rule: k.rule, blindAnswer: a.answer, why: a.why });
    } else c.agree++;
  } else {
    // protective verdict: keeping a citation the reading says is foreign is a
    // recall loss, which this round accepts and records rather than hides.
    if (a.answer === 'OWN') c.agree++;
    else c.recallLoss++;
  }
  byRule.set(k.rule, c);
}

const falseNull = falses.filter((f) => DESTRUCTIVE_NULL.has((f as { rule: string }).rule)).length;
const falseReplace = falses.filter((f) => DESTRUCTIVE_REPLACE.has((f as { rule: string }).rule)).length;
const untestable = [...byRule.values()].reduce((s, c) => s + c.untestable, 0);

const out = {
  artifact: `NEW2_R19_BLIND_SCORE_ROUND_${ROUND}`,
  lane: 'NEW2',
  takenAt: new Date().toISOString(),
  method:
    'the pack was read and answered with the rule, the R18 class and the proposed value absent; blind-key.json was joined only after blind-answers.jsonl was complete',
  items: key.length,
  answerCounts: (() => {
    const c: Record<string, number> = {};
    for (const k of key) c[answers.get(k.token)!.answer] = (c[answers.get(k.token)!.answer] ?? 0) + 1;
    return c;
  })(),
  matrix,
  byRule: Object.fromEntries(byRule),
  FALSE_NULL: falseNull,
  FALSE_REPLACE: falseReplace,
  AMBIGUOUS: (() => {
    const c: Record<string, number> = {};
    for (const k of key) if (answers.get(k.token)!.answer === 'CANNOT_TELL') c[k.rule] = (c[k.rule] ?? 0) + 1;
    return c;
  })(),
  UNTESTABLE: untestable,
  falseDestructiveRows: falses,
  EXISTING_CORRECTION_GATE: falseNull === 0 && falseReplace === 0 ? 'PASS' : 'FAIL',
};
writeFileSync(join(OUTDIR, SCORE), JSON.stringify(out, null, 1) + NL);
console.log(JSON.stringify({ matrix, FALSE_NULL: falseNull, FALSE_REPLACE: falseReplace, UNTESTABLE: untestable, gate: out.EXISTING_CORRECTION_GATE }, null, 1));
