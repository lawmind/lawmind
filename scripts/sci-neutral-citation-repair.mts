/** Repair only demonstrably unsafe neutral citations produced by page-number concatenation. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { neutralCitation } from '../services/ingest/src/sci-live.ts';

const APPLY = process.argv.includes('--apply');
const match = /^DATABASE_URL=(.+)$/m.exec(readFileSync(join(process.cwd(), '.env'), 'utf8'));
const url = process.env['DATABASE_URL'] ?? match?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!url) throw new Error('DATABASE_URL not found');

const sql = postgres(url, { max: 1, prepare: false });
try {
  const rows = await sql<{ id: string; neutral_citation: string; full_text: string; source_url: string }[]>`
    SELECT id::text, neutral_citation, full_text, source_url
      FROM judgments
     WHERE source_url LIKE 'https://www.sci.gov.in/sci-get-pdf/%'
       AND neutral_citation IS NOT NULL
  `;
  const unsafe = rows
    .map((row) => ({ ...row, reparsed: neutralCitation(row.full_text) }))
    .filter((row) => row.reparsed === null);
  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY_RUN', inspected: rows.length, unsafe: unsafe.map(({ full_text: _fullText, ...row }) => row) }, null, 2));
  if (APPLY && unsafe.length > 0) {
    for (const row of unsafe) {
      await sql`
        UPDATE judgments
           SET neutral_citation = NULL
         WHERE id = ${row.id}::uuid
           AND neutral_citation = ${row.neutral_citation}
      `;
    }
    console.log(`cleared=${unsafe.length}`);
  }
} finally {
  await sql.end({ timeout: 10 });
}
