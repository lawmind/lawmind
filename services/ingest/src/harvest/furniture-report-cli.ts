/**
 * MEASURE the page-furniture cleaner against the real corpus. Reports only —
 * writes nothing, ever.
 *
 * The rule this exists to satisfy is "a cleaner cannot silently remove legal
 * text", and the only way to know is to run it over real documents and compare
 * the things that matter downstream:
 *
 *   - characters and lines removed (is the scale plausible, or is it eating text)
 *   - CITATIONS before vs after — the one loss this project cannot absorb. Any
 *     document where the count drops is printed in full, not aggregated away.
 *   - the distinct lines removed, longest first, because a false positive hides
 *     in the longest match and nowhere else.
 *
 * Usage:
 *   pnpm --filter @lawmind/ingest exec tsx src/harvest/furniture-report-cli.ts
 *   ... --sample 2000 --court "High Court of Kerala" --show 40
 */
import { readFileSync } from 'node:fs';
import { extractCitations } from '../citations.ts';
import { openDb } from '../db-host.ts';
import { stripPageFurniture } from './page-furniture.ts';

const argv = process.argv.slice(2);
const arg = (flag: string, fallback: string): string => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};

const SAMPLE = Number(arg('--sample', '1500'));
const SHOW = Number(arg('--show', '25'));
const COURT = argv.indexOf('--court') >= 0 ? arg('--court', '') : null;

const url =
  process.env['DATABASE_URL'] ??
  readFileSync('../../.env', 'utf8')
    .match(/^DATABASE_URL=(.*)$/m)?.[1]
    ?.trim();
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = await openDb(url, 3);

/**
 * TABLESAMPLE SYSTEM, not ORDER BY random(): random() sorts 6.9M rows and takes
 * minutes, measured. SYSTEM picks pages, which is biased toward clustered rows
 * and entirely good enough for a prevalence estimate — and it is the same method
 * bus 0512 used, so the numbers are comparable to LCC's.
 */
type Doc = { id: string; court: string; full_text: string; neutral_citation: string | null };
const rows = COURT
  ? await sql<Doc[]>`
      SELECT id, court, full_text, neutral_citation FROM judgments
      WHERE court = ${COURT} AND full_text IS NOT NULL AND length(full_text) > 2000
      LIMIT ${SAMPLE}`
  : await sql<Doc[]>`
      SELECT id, court, full_text, neutral_citation FROM judgments TABLESAMPLE SYSTEM (0.5)
      WHERE full_text IS NOT NULL AND length(full_text) > 2000
      LIMIT ${SAMPLE}`;

/** Compare on alphanumerics only: `NC: 2025:KHC-D:1` and `2025:KHC-D:1` are one citation. */
const key = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

type Agg = {
  docs: number;
  touched: number;
  chars: number;
  lines: number;
  citLost: number;
  citLostForeign: number;
};
const byCourt = new Map<string, Agg>();
const removedLines = new Map<string, number>();
const byRule: Record<string, number> = {};
const citationLosses: { id: string; court: string; lost: string[]; foreign: string[] }[] = [];

let charsBefore = 0;
let charsAfter = 0;

for (const r of rows) {
  const rep = stripPageFurniture(r.full_text);
  charsBefore += rep.charsBefore;
  charsAfter += rep.charsAfter;

  const a = byCourt.get(r.court) ?? {
    docs: 0,
    touched: 0,
    chars: 0,
    lines: 0,
    citLost: 0,
    citLostForeign: 0,
  };
  a.docs++;
  if (rep.linesRemoved > 0) a.touched++;
  a.chars += rep.charsBefore - rep.charsAfter;
  a.lines += rep.linesRemoved;

  for (const [k, n] of Object.entries(rep.removedByRule)) byRule[k] = (byRule[k] ?? 0) + n;
  for (const l of rep.removedLines) removedLines.set(l, (removedLines.get(l) ?? 0) + 1);

  /**
   * The citation check. Compared as a MULTISET of raw citation text, because a
   * count alone would hide the case that matters — one citation lost and one
   * spuriously gained would net to zero.
   */
  const before = extractCitations(r.full_text).map((c) => c.raw);
  const after = new Set(extractCitations(rep.text).map((c) => key(c.raw)));
  const lost = before.filter((c) => !after.has(key(c)));
  if (lost.length > 0) {
    /**
     * SELF vs FOREIGN is the whole question. Losing the document's own neutral
     * citation from the body text costs no citation EDGE — a judgment does not
     * cite itself — and the column is already persisted from ingest. Losing a
     * reference to ANOTHER judgment is a corpus defect and this cleaner would
     * not be fit to run.
     */
    const own = r.neutral_citation ? key(r.neutral_citation) : null;
    const foreign = lost.filter((c) => key(c) !== own);
    a.citLost += lost.length;
    a.citLostForeign += foreign.length;
    if (citationLosses.length < 40)
      citationLosses.push({ id: r.id, court: r.court, lost, foreign });
  }
  byCourt.set(r.court, a);
}

console.log(
  `\nPAGE FURNITURE — measured on ${rows.length} documents${COURT ? ` from ${COURT}` : ''}\n`,
);
console.log(
  'court'.padEnd(36),
  'docs'.padStart(5),
  'touched%'.padStart(9),
  'linesGone'.padStart(10),
  'charsGone'.padStart(10),
  'citLost'.padStart(8),
);
for (const [court, a] of [...byCourt.entries()].sort(
  (x, y) => y[1].touched / y[1].docs - x[1].touched / x[1].docs,
)) {
  if (a.docs < 5) continue;
  console.log(
    court.slice(0, 36).padEnd(36),
    String(a.docs).padStart(5),
    ((a.touched / a.docs) * 100).toFixed(1).padStart(9),
    String(a.lines).padStart(10),
    String(a.chars).padStart(10),
    String(a.citLost).padStart(8),
  );
}

console.log(`\nBY RULE`);
for (const [k, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${String(n).padStart(8)}`);
}

const totalLost = citationLosses.reduce((s, c) => s + c.lost.length, 0);
const totalForeign = citationLosses.reduce((s, c) => s + c.foreign.length, 0);
console.log(
  `\nTEXT      ${charsBefore.toLocaleString()} -> ${charsAfter.toLocaleString()} chars (${(((charsBefore - charsAfter) / charsBefore) * 100).toFixed(2)}% removed)`,
);
console.log(
  `CITATIONS lost ${totalLost} across ${citationLosses.length} of ${rows.length} documents`,
);
console.log(
  `   SELF    (the document's own neutral citation — no edge exists to lose) : ${totalLost - totalForeign}`,
);
console.log(
  `   FOREIGN (a reference to ANOTHER judgment — a defect) .................. : ${totalForeign}`,
);
if (totalForeign > 0) {
  console.log('\n  FOREIGN LOSSES ARE DEFECTS. DO NOT APPLY THIS CLEANER UNTIL THEY ARE ZERO:');
  for (const c of citationLosses.filter((x) => x.foreign.length > 0).slice(0, 15)) {
    console.log(`   ${c.court} ${c.id}`);
    for (const l of c.foreign.slice(0, 4)) console.log(`      ${JSON.stringify(l)}`);
  }
}

console.log(`\nLONGEST DISTINCT LINES REMOVED (a false positive hides here and nowhere else)`);
for (const l of [...removedLines.keys()].sort((a, b) => b.length - a.length).slice(0, SHOW)) {
  console.log(`   ${String(removedLines.get(l)).padStart(5)}x  ${JSON.stringify(l)}`);
}

await sql.end();
