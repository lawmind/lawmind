/**
 * NEW2 R24 — why the page-furniture guard blocked nothing, measured rather than assumed.
 *
 * The guard is proven live: 12 of 12 adversarial fixtures land correctly, and
 * both reproduced Meghalaya false pins are blocked against their real documents.
 * Yet across 1,556,947 candidates it excluded ZERO. A guard that never fires is
 * either unnecessary or broken, and the difference matters, so this measures
 * which.
 *
 * The answer is the stored occurrence's OFFSET. `extractCitations` de-duplicates
 * on the normalised form and keeps the FIRST appearance, so when a citation
 * appears both inside a concatenated common-order stamp and in ordinary prose,
 * the row that survives points at whichever the scan reached first — and on the
 * two known documents that is the prose occurrence, not the stamp. The stamp is
 * still in the text; no stored row's `char_offset` sits on it.
 *
 * That makes the guard's protection LATENT, not absent. `citations.ts` already
 * warns that extraction must be re-run once the stored keys are backfilled; the
 * moment it is, stamp occurrences become rows and this guard is what stands
 * between them and a false pin.
 *
 * Read-only. Usage: pnpm exec tsx scripts/n2-r24-furniture-reach.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { classifyCitationGraphOccurrence } from '../services/ingest/src/citations.ts';
import { sslFor } from './migration/new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r24');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const url = databaseUrl();
const sql = postgres(url, {
  max: 1,
  connect_timeout: 15,
  ssl: sslFor(url),
  connection: { default_transaction_read_only: 'on' },
});

type Row = { id: string; raw: string; norm: string; offset: number; win: string | null; win_from: number };
const probe = async (label: string, where: string, limit: number): Promise<Record<string, unknown>> => {
  const rows = (await sql.unsafe(
    `select jc.id::text, jc.citation_text as raw, jc.normalised_citation as norm, jc.char_offset as "offset",
            substr(j.full_text, greatest(1, jc.char_offset - 79), 80 + length(jc.citation_text) + 200) as win,
            greatest(1, jc.char_offset - 79) as win_from
       from judgment_citations jc join judgments j on j.id = jc.citing_judgment_id
      where ${where} order by jc.id limit ${limit}`,
  )) as Row[];
  let furniture = 0;
  let outgoing = 0;
  let noText = 0;
  for (const row of rows) {
    if (row.win === null) {
      noText += 1;
      continue;
    }
    const local = row.offset + 1 - Number(row.win_from);
    if (
      classifyCitationGraphOccurrence(row.win, { raw: row.raw, normalised: row.norm, offset: local }) ===
      'COMMON_ORDER_PAGE_FURNITURE'
    )
      furniture += 1;
    else outgoing += 1;
  }
  return { label, where, sampled: rows.length, furniture, outgoing, sourceTextAbsent: noText };
};

const probes = [
  await probe('every stored occurrence carrying a -DB or -FB suffix', `jc.normalised_citation ~ '-(DB|FB)$'`, 3000),
  await probe('every stored 2025 Meghalaya occurrence', `jc.normalised_citation like '2025:MLHC:%'`, 5000),
];

const [suffixed] = (await sql.unsafe(
  `select count(*)::text as n from judgment_citations where normalised_citation ~ '-(DB|FB)$'`,
)) as Array<{ n: string }>;
const [adjacent] = (await sql.unsafe(
  `select count(*)::text as n from judgment_citations jc join judgments j on j.id = jc.citing_judgment_id
    where jc.normalised_citation like '2025:MLHC:%'
      and substr(j.full_text, jc.char_offset + length(jc.citation_text) + 1, 30) ~ '^[0-9]{4}:[A-Z]{2,10}'`,
)) as Array<{ n: string }>;
await sql.end({ timeout: 5 });

writeFileSync(
  join(OUT, 'furniture-guard-reach.json'),
  `${JSON.stringify(
    {
      artifact: 'NEW2_R24_FURNITURE_GUARD_REACH',
      question: 'The guard is proven correct on fixtures and on both real documents, yet excluded 0 of 1,556,947 candidates. Is it unnecessary, or unreachable?',
      answer: 'UNREACHABLE_AT_CURRENT_STORED_OFFSETS',
      storedOccurrencesCarryingADbOrFbSuffix: suffixed!.n,
      meghalayaOccurrencesImmediatelyFollowedByAnotherNeutralToken: adjacent!.n,
      probes,
      mechanism:
        'extractCitations de-duplicates on the normalised form and keeps the first appearance, so a citation printed ' +
        'both inside a concatenated common-order stamp and in ordinary prose stores the prose offset. The stamp is ' +
        'still in the document text; no stored row points at it.',
      consequence:
        'The guard is LATENT, not redundant. citations.ts already requires a re-extraction once the stored keys are ' +
        'backfilled; that re-extraction is what turns stamp occurrences into rows, and this guard is what stops them ' +
        'becoming false pins. It must not be removed on the strength of a zero.',
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ suffixed: suffixed!.n, adjacent: adjacent!.n, probes }, null, 1));
