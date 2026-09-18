/**
 * Report-only pass over the BPRD correspondence tables.
 *
 *   npx tsx services/ingest/src/statute-correspondence-cli.ts <dir-of-txt>
 *
 * **WRITES NOTHING.** The founder's instruction is explicit: report first,
 * validate, and only then consider a write path. `statute_mappings` is not
 * touched here and this file holds no database client at all.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PARSER_VERSION, parseCorrespondence } from './statute-correspondence.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: <dir containing bns.txt bnss.txt bsa.txt>');
  process.exit(2);
}

/** Sections each new Act actually contains — the denominator for "missed". */
const EXPECTED: Record<string, number> = { 'BNS-IPC': 358, 'BNSS-CrPC': 531, 'BSA-IEA': 170 };

console.log(`BPRD correspondence — REPORT ONLY · parser v${PARSER_VERSION}\n`);
for (const f of ['bns', 'bnss', 'bsa']) {
  const path = join(dir, `${f}.txt`);
  const { pair, rows, unparsed, ambiguous } = parseCorrespondence(readFileSync(path, 'utf8'));
  const expected = EXPECTED[pair] ?? 0;
  const multi = rows.filter((r) => r.oldRefs.length > 1);
  const withPara = rows.filter((r) => r.oldRefs.some((o) => o.paragraph !== null));
  const newly = rows.filter((r) => r.newlyAdded);
  const distinct = new Set(rows.map((r) => r.newSection)).size;

  console.log(`${pair}   (${f}.pdf)`);
  console.log(`  rows parsed          ${rows.length}   distinct new-sections ${distinct}`);
  console.log(
    `  source sections      ${expected}   coverage ${expected ? ((100 * distinct) / expected).toFixed(1) : '?'}%`,
  );
  console.log(`  MISSED (unmapped)    ${Math.max(0, expected - distinct)}`);
  console.log(`  multi-section rows   ${multi.length}   (never collapsed to a partial)`);
  console.log(`  paragraph-qualified  ${withPara.length}`);
  console.log(`  newly added ("New")  ${newly.length}`);
  console.log(`  ambiguous            ${ambiguous.length}`);
  console.log(`  unparsed             ${unparsed.length}`);
  if (multi.length) {
    console.log('  sample multi-section:');
    for (const m of multi.slice(0, 3)) {
      console.log(
        `     ${pair.split('-')[0]} ${m.newSection} -> ${m.oldRefs.map((o) => o.section + (o.paragraph ? `,para ${o.paragraph}` : '')).join(' + ')}`,
      );
    }
  }
  if (ambiguous.length) {
    console.log('  sample ambiguous:');
    ambiguous.slice(0, 2).forEach((a) => console.log(`     L${a.line}: ${a.text.slice(0, 68)}`));
  }
  console.log('');
}
console.log('Nothing written. statute_mappings untouched.');
