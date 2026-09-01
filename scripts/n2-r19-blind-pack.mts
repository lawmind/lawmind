/**
 * NEW2 — R19 §8. THE PREDICTION-BLIND ADJUDICATION PACK.
 *
 * A rule cannot be validated against its own output. This builds a stratified
 * sample of the adjudicated population in which EVERY trace of the verdict is
 * removed — the R18 class, the R19 rule, the proposed value, whether the row is
 * a destructive candidate at all — leaving only what a person reading the
 * document would have: the court, the row's own case number and CNR from the
 * metadata record, the citation stored on the row, and the text around every
 * place that citation is printed.
 *
 * The other citations the document prints are shown for EVERY item, in document
 * order, so a replacement candidate is indistinguishable from a row that simply
 * has more than one citation on the page. Items are ordered by a hash of the id,
 * so the strata are interleaved and the reader cannot infer a class from a run.
 *
 * The answer file is written separately and joined afterwards by
 * `n2-r19-blind-score.mts`. Nothing here reads a verdict; nothing there is
 * allowed to change one.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-blind-pack.mts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r19');
const NL = String.fromCharCode(10);
const SEED = 'r19-blind';
const ROUND = Number((() => { const i = process.argv.indexOf('--round'); return i === -1 ? '1' : (process.argv[i + 1] ?? '1'); })());

/** How many of each rule to draw. The destructive rules carry the weight; the
 *  rest are decoys, and without them "everything is foreign" would score 100%. */
const STRATA_R1: Record<string, number> = {
  C2a_FOREIGN_CNR_CORROBORATED: 45,
  C2b_FOREIGN_CNR_UNCORROBORATED: 15,
  C3_CITED_PRECEDENT_LEAD: 20,
  D1_MONTH_IN_SERIES_POSITION: 10,
  R4a_TWO_SIDED_CNR: 5,
  R4b_TWO_SIDED_CASE_NUMBER: 12,
  C7_REFUSAL_ONLY: 20,
  C1b_OWN_CASE_NUMBER_BESIDE_STORED: 10,
  C5_OWN_IDENTITY_ABSENT: 5,
  C6_COMPETING_CITATIONS: 5,
  R2_SERIES_TOKEN_SCAN_CONFLICT: 5,
  R5_NO_TWO_SIDED_PROOF: 8,
};

/**
 * Round 2 is disjoint from round 1 by construction: every id drawn in round 1 is
 * excluded. It exists because round 1 refuted C2a, C2b and C3 outright and left
 * the two surviving rules resting on 10 and 17 readings — a per-rule zero that
 * small is not yet a zero-known-harm claim. Decoys again, from the classes the
 * surviving rules must not swallow.
 */
const STRATA_R2: Record<string, number> = {
  D1_MONTH_IN_SERIES_POSITION: 30,
  R4a_TWO_SIDED_CNR: 4,
  R4b_TWO_SIDED_CASE_NUMBER: 36,
  C1b_OWN_CASE_NUMBER_BESIDE_STORED: 12,
  R2_SERIES_TOKEN_SCAN_CONFLICT: 4,
  R5_NO_TWO_SIDED_PROOF: 8,
  C7_REFUSAL_ONLY: 6,
};
const STRATA = ROUND === 2 ? STRATA_R2 : STRATA_R1;

type Adj = { judgmentId: string; court: string; caseNumber: string | null; cnr: string | null; stored: string; rule: string };
type Ev = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  judgmentDate: string | null;
  storedNow: string;
  storedOccurrences: { at: number; window: string }[];
  distinctCitationsInText: { v: string; count: number; firstAt: number }[];
  textLen: number;
};

const h = (s: string): number => parseInt(createHash('sha256').update(SEED + s).digest('hex').slice(0, 12), 16);

const adj = readFileSync(join(OUTDIR, 'adjudication.jsonl'), 'utf8')
  .split(NL).filter((l) => l.trim()).map((l) => JSON.parse(l) as Adj);
const ev = new Map<string, Ev>(
  readFileSync(join(OUTDIR, 'evidence.jsonl'), 'utf8')
    .split(NL).filter((l) => l.trim()).map((l) => {
      const e = JSON.parse(l) as Ev;
      return [e.judgmentId, e] as [string, Ev];
    }),
);

const byRule = new Map<string, Adj[]>();
for (const a of adj) {
  const l = byRule.get(a.rule) ?? [];
  l.push(a);
  byRule.set(a.rule, l);
}

const used = new Set<string>();
if (ROUND === 2) {
  const prior = JSON.parse(readFileSync(join(OUTDIR, 'blind-key.json'), 'utf8')) as { key: { judgmentId: string }[] };
  for (const k of prior.key) used.add(k.judgmentId);
  console.log(`[r19] round 2 excludes ${used.size} ids already read in round 1`);
}
const chosen: { a: Adj; e: Ev }[] = [];
for (const [rule, want] of Object.entries(STRATA)) {
  const pool = (byRule.get(rule) ?? []).filter((a) => !used.has(a.judgmentId)).sort((x, y) => h(x.judgmentId) - h(y.judgmentId));
  for (const a of pool.slice(0, want)) {
    const e = ev.get(a.judgmentId);
    if (e) chosen.push({ a, e });
  }
}
chosen.sort((x, y) => h('order' + x.a.judgmentId) - h('order' + y.a.judgmentId));

const PFX = ROUND === 2 ? 'C' : 'B';
const items = chosen.map(({ a, e }, i) => {
  const token = `${PFX}${String(i + 1).padStart(3, '0')}`;
  const others = e.distinctCitationsInText
    .filter((c) => c.v !== e.storedNow)
    .sort((p, q) => p.firstAt - q.firstAt)
    .slice(0, 4);
  return {
    token,
    court: e.court,
    caseNumberFromMetadata: e.caseNumber,
    cnrFromMetadata: e.cnr,
    judgmentDate: e.judgmentDate,
    documentLength: e.textLen,
    citationStoredOnThisRow: e.storedNow,
    timesPrintedInDocument: e.storedOccurrences.length,
    contextAroundEachPrinting: e.storedOccurrences.slice(0, 3).map((o) => o.window),
    otherCitationsPrintedInThisDocument: others.map((c) => ({ citation: c.v, timesPrinted: c.count })),
    question:
      'Is the citation stored on this row this document’s OWN neutral citation? Answer OWN | ANOTHER_CASE | CITED_PRECEDENT | NOT_A_CITATION | CANNOT_TELL.',
  };
});

writeFileSync(
  join(OUTDIR, ROUND === 2 ? 'blind-pack-2.json' : 'blind-pack.json'),
  JSON.stringify(
    {
      artifact: 'NEW2_R19_BLIND_PACK',
      lane: 'NEW2',
      takenAt: new Date().toISOString(),
      note: 'verdict, rule, R18 class and proposed value are ABSENT by construction. The key that maps tokens back to rows is written separately to blind-key.json and must not be read before the answers are written.',
      items: items.length,
      answerVocabulary: ['OWN', 'ANOTHER_CASE', 'CITED_PRECEDENT', 'NOT_A_CITATION', 'CANNOT_TELL'],
      pack: items,
    },
    null,
    1,
  ) + NL,
);
writeFileSync(
  join(OUTDIR, ROUND === 2 ? 'blind-key-2.json' : 'blind-key.json'),
  JSON.stringify(
    {
      artifact: `NEW2_R19_BLIND_KEY_ROUND_${ROUND}`,
      takenAt: new Date().toISOString(),
      key: chosen.map(({ a }, i) => ({ token: `${PFX}${String(i + 1).padStart(3, '0')}`, judgmentId: a.judgmentId, rule: a.rule })),
    },
    null,
    1,
  ) + NL,
);
const per: Record<string, number> = {};
for (const { a } of chosen) per[a.rule] = (per[a.rule] ?? 0) + 1;
console.log(`[r19] blind pack ${items.length} items`, JSON.stringify(per));
