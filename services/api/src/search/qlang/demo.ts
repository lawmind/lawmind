/**
 * A demonstration against the REAL corpus, with cases we already know.
 *
 * Run: `npx tsx src/search/qlang/demo.ts`
 *
 * This exists because a query language is easy to believe in and hard to trust.
 * Every query below is one whose answer can be checked by a person against a law
 * report, and the negative cases matter more than the positive ones: a search
 * engine that finds *Kesavananda* is unremarkable, and one that refuses to
 * invent a judgment for a citation that does not exist is the product.
 */
import postgres from 'postgres';

import { explainQuery } from './explain.ts';
import { countStructured, runStructured } from './compile.ts';
import { QueryError } from './lex.ts';
import { parse } from './parse.ts';

const sql = postgres(process.env['DATABASE_URL']!, { ssl: 'require', max: 3 });

const QUERIES: readonly { q: string; expect: string }[] = [
  { q: 'cite:"(1994) 3 SCC 1"', expect: 'AN SCC CITATION — impossible before the concordance' },
  { q: 'cite:"AIR 1965 SC 845"', expect: 'AN AIR CITATION — impossible before the concordance' },
  { q: 'cite:"(1972) 1 SCC 660"', expect: 'another SCC alias, derived from the courts own text' },
  { q: 'party:"KESAVANANDA"', expect: 'by party name, however it is cited' },
  { q: 'judge:"CHANDRACHUD" AND type:criminal', expect: 'a judge AND a side — deterministic' },
  { q: 'judge:"GAJENDRAGADKAR" AND date:[1960 TO 1962]', expect: 'judge and a period' },
  { q: 'party:"MANEKA" AND party:"GANDHI"', expect: 'implicit AND across two party terms' },
  { q: '"basic structure" NEAR/6 "constitution"', expect: 'proximity, not mere co-occurrence' },
  { q: 'caseno:"WRIT PETITION (CIVIL) No. 37/1950"', expect: 'the exact case number' },
  { q: 'cite:"(2099) 9 SCC 9999"', expect: 'A CITATION THAT DOES NOT EXIST — must return ZERO' },
  { q: 'judge:"NOBODY AT ALL"', expect: 'A JUDGE WHO DOES NOT EXIST — must return ZERO' },
];

const BAD: readonly string[] = [
  'judge:"Kania" AND (court:"SC"',
  'judgw:"Kania"',
  'NOT section:302',
  '*bail',
  'date:[2024 TO 2019]',
];

try {
  console.log('='.repeat(78));
  console.log('STRUCTURED SEARCH — against the live corpus, 38,341 Supreme Court judgments');
  console.log('='.repeat(78));

  for (const { q, expect } of QUERIES) {
    console.log(`\n▸ ${q}`);
    console.log(`  expecting: ${expect}`);
    const started = Date.now();
    try {
      const ast = parse(q);
      console.log(`  understood as: ${explainQuery(ast)}`);
      const [n, hits] = await Promise.all([
        countStructured(sql, ast),
        runStructured(sql, ast, 3),
      ]);
      const ms = Date.now() - started;
      console.log(`  ${n} judgment(s) · ${ms} ms`);
      for (const h of hits) {
        const cite = h.neutralCitation ?? h.reporterCitations[0] ?? '(no citation)';
        const moved = h.overruledStatus === 'none' ? '' : `  [LAW MOVED: ${h.overruledStatus}]`;
        console.log(`     ${h.judgmentDate}  ${cite}  ${h.caseTitle.slice(0, 58)}${moved}`);
      }
      if (n === 0) console.log('     — nothing. No judgment was invented to fill the gap.');
    } catch (e) {
      console.log(`  REFUSED: ${e instanceof QueryError ? e.message : String(e)}`);
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log('QUERIES THAT MUST BE REFUSED, with the position of the mistake');
  console.log('='.repeat(78));
  for (const q of BAD) {
    try {
      parse(q);
      console.log(`\n▸ ${q}\n  ACCEPTED — this is a defect.`);
    } catch (e) {
      const err = e as QueryError;
      console.log(`\n▸ ${q}`);
      console.log(`  refused at character ${err.offset}: ${err.message}`);
      if (err.valid) console.log(`  valid fields: ${err.valid.join(', ')}`);
    }
  }
} finally {
  await sql.end();
}
