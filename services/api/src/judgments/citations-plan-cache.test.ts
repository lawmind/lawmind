/**
 * LCC R30 — `2022 INSC 690` answered 503 on every read, on a quiet server.
 *
 * `resolveOne` is one prepared statement run once per distinct citation. After
 * five executions on a connection PostgreSQL may switch a prepared statement to
 * its GENERIC plan, and for this one the generic plan is `Limit → Seq Scan on
 * judgments`: `LIMIT 2` against a generic estimate of ~100k matches makes a scan
 * look cheap, and a citation that matches at most one judgment then reads all of
 * them. The 16 citations in that judgment reached the sixth execution on every
 * pooled connection, and the statement timeout fired.
 *
 * This drives the real function against the real corpus through ONE connection,
 * so every lookup after the fifth is exactly that sixth execution. Before the
 * fix it dies with 57014 at the 5 s ceiling set here.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { attachCitesJudgmentId } from './citations.ts';
import type { JudgmentParagraph } from './paragraphs.ts';

const url = process.env['DATABASE_URL'];
const sql = url
  ? postgres(url, { max: 1, onnotice: () => {}, connection: { statement_timeout: 5_000 } })
  : null;

/** Real SCC-shaped citations; several match nothing, which is the expensive case. */
const CITATIONS = [
  '(2007) 12 SCC 1',
  '(2012) 1 SCC 40',
  '(2018) 11 SCC 1',
  '(2014) 8 SCC 273',
  '(2018) 5 SCC 743',
  '(2021) 2 SCC 485',
  '(2021) 1 SCC 676',
  '(1980) 1 SCC 81',
  '(2014) 9 SCC 177',
  '(2015) 13 SCC 605',
];

const paragraphs: JudgmentParagraph[] = CITATIONS.map((c, i) => ({
  paragraphNumber: i + 1,
  paragraphIndex: i,
  text: `As held in ${c}, the appeal fails.`,
}));

describe('citation resolution under the plan cache', { skip: !sql }, () => {
  after(async () => {
    await sql?.end();
  });

  it('more than five lookups on one connection stay on the indexed plan', async (t) => {
    const [populated] = await sql!<{ ok: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM judgments) AS ok`;
    if (!populated?.ok) {
      t.skip('no corpus in this database');
      return;
    }
    const own = '00000000-0000-0000-0000-000000000000';
    const started = performance.now();
    // Twice: twenty executions of the one statement on the one connection.
    await attachCitesJudgmentId(sql!, paragraphs, own);
    await attachCitesJudgmentId(sql!, paragraphs, own);
    const ms = performance.now() - started;
    assert.ok(ms < 3_000, `twenty indexed lookups took ${Math.round(ms)} ms`);
  });
});
