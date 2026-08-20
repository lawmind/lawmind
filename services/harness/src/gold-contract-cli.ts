/**
 * NEW1 — load a gold file through the leakage contract and report what it can and
 * cannot measure, BEFORE anything is scored with it.
 *
 * The point is the second half. A gold set's headline number is "250 authorities";
 * the number that decides what experiments are possible is "which feature families
 * are prohibited, and by which rows". That has never been printed before, and the
 * reranker experiment that wasted a week would have been refused on sight if it
 * had been.
 *
 *   pnpm --filter @lawmind/harness gold:contract
 *   pnpm --filter @lawmind/harness gold:contract -- --gold path/to/other.json
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
import { loadNew3Gold } from './new3-gold-adapter.ts';
import { allowedAcross, featurePolicy, splitByFamily, ALL_FEATURE_FAMILIES, type FeatureFamily } from './gold-contract.ts';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

// Paths are repo-relative, not cwd-relative: this runs from `services/harness`
// under pnpm and from the repo root by hand, and a report that lands in a
// different directory depending on where it was invoked is a report nobody finds.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const at = (p: string): string => (isAbsolute(p) ? p : join(ROOT, p));

const GOLD = at(arg('--gold', 'docs/ai/new3-semantic-expansion-gold.json'));
const OUT = at(arg('--out', 'docs/ai/new1-rerank/gold-contract.json'));

const loaded = loadNew3Gold(GOLD);

console.log(`gold file            ${GOLD}`);
console.log(`rows in file         ${loaded.totals.rowsInFile}`);
console.log(`distinct authorities ${loaded.totals.distinctAuthorities}`);
console.log(`distinct edges       ${loaded.totals.distinctEdges}`);
console.log(`rows usable          ${loaded.rows.length}`);

const byReason = new Map<string, number>();
for (const d of loaded.dropped) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
console.log(`rows dropped         ${loaded.dropped.length}`);
for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${reason.padEnd(22)} ${n}`);

// Per query type, because pooling them is the mistake this report exists to stop.
// `exact_citation` hands the authority's own citation string back as the query and
// `case_title` hands back its title; a single "success@5" over all three would be
// a number about nothing.
const types = [...new Set(loaded.rows.map((r) => r.queryType))].sort();
const perType: Record<string, { rows: number; allowed: FeatureFamily[]; prohibited: string[] }> = {};
console.log('\nper query type — what each can measure:');
for (const t of types) {
  const rows = loaded.rows.filter((r) => r.queryType === t);
  const allowed = allowedAcross(rows);
  const prohibited = [...new Set(rows.flatMap((r) => featurePolicy(r).prohibited.map((p) => `${p.family}: ${p.why}`)))];
  perType[t] = { rows: rows.length, allowed, prohibited };
  console.log(`\n  ${t}  (${rows.length} rows)`);
  console.log(`    allowed    ${allowed.join(', ')}`);
  for (const p of prohibited) console.log(`    PROHIBITED ${p}`);
}

const pooledAllowed = allowedAcross(loaded.rows);
console.log(`\nif pooled across all types, only these survive: ${pooledAllowed.join(', ') || '(none)'}`);
console.log(`  ${ALL_FEATURE_FAMILIES.length - pooledAllowed.length} of ${ALL_FEATURE_FAMILIES.length} families are lost to pooling`);

const { train, test } = splitByFamily(loaded.rows, 0.3);
const trainFamilies = new Set(train.map((r) => r.caseFamily));
const straddle = test.filter((r) => trainFamilies.has(r.caseFamily));
console.log(`\nsplit by case family: train ${train.length}, held ${test.length}, straddling ${straddle.length}`);

const report = {
  kind: 'new1_gold_contract_report',
  goldFile: GOLD,
  measuredAt: new Date().toISOString(),
  totals: loaded.totals,
  usableRows: loaded.rows.length,
  dropped: loaded.dropped,
  droppedByReason: Object.fromEntries(byReason),
  perQueryType: perType,
  pooledAllowed,
  split: { train: train.length, held: test.length, straddling: straddle.length },
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(`\nwrote ${OUT}`);
