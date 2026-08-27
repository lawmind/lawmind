/**
 * NEW2 — R9. THE DELTA HANDOFF: a named, hashed list of the judgment ids one
 * ingest round wrote.
 *
 * ## Why a list and not "re-derive it from created_at"
 *
 * NEW1 asked for this and gave the right reason (bus 1391): re-deriving the
 * delta from `created_at >= 2026-08-27` works today only because my walk is the
 * only thing that wrote today. **That is a property of the afternoon, not of the
 * pipeline.** Two lanes writing on the same day makes the timestamp selector
 * silently wrong, and nothing about the result would look wrong.
 *
 * So the handoff is a list with an id and a hash. `idsHash` is over the SORTED
 * ids, so two producers of the same set agree regardless of scan order, and a
 * consumer can prove months later that it processed this exact population.
 *
 * ## What is in it, and the one field that is honest rather than convenient
 *
 * Every row carries `script_quality`. Most of them are NULL, and that is NOT a
 * gap this handoff is hiding — `script-quality-cli.ts` deliberately writes only
 * `legacy_font_ascii`, because `clean` would have to be asserted from the
 * ABSENCE of a signal and a pure-ASCII English judgment is byte-identical to a
 * Hindi one whose Devanagari the extractor deleted. Stamping `clean` on that
 * population would be the admission-by-absence failure pointing the other way.
 *
 * The counts are therefore reported as three populations, never as one
 * "screened" number.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-delta-handoff.mts --since 2026-08-27T00:00:00Z
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r9/delta-handoff-2026-08-27.json';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const SINCE = arg('since', '2026-08-27T00:00:00Z');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

async function main() {
  const sql = postgres(databaseUrl(), { max: 2, prepare: false, idle_timeout: 20 });
  const takenAt = new Date().toISOString();

  const rows = await sql<{
    id: string;
    court: string | null;
    judgment_date: string | null;
    script_quality: string | null;
    text_len: number;
  }[]>`
    SELECT id::text, court, judgment_date::text, script_quality,
           coalesce(length(full_text), 0) AS text_len
    FROM judgments
    WHERE created_at >= ${SINCE}::timestamptz
    ORDER BY id
  `;
  const ids = rows.map((r) => r.id);
  const idsHash = createHash('sha256').update(ids.join('\n')).digest('hex');

  const byCourt: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const byScript: Record<string, number> = {};
  for (const r of rows) {
    byCourt[r.court ?? '(null)'] = (byCourt[r.court ?? '(null)'] ?? 0) + 1;
    const m = r.judgment_date?.slice(0, 7) ?? '(null)';
    byMonth[m] = (byMonth[m] ?? 0) + 1;
    const s = r.script_quality ?? 'NULL';
    byScript[s] = (byScript[s] ?? 0) + 1;
  }

  const report = {
    handoffId: `NEW2_R9_DELTA_${SINCE.slice(0, 10)}`,
    takenAt,
    producer: 'NEW2',
    selector: `judgments.created_at >= ${SINCE}`,
    selectorCaveat:
      'The selector is recorded for provenance only. The AUTHORITY is the id list below and its hash — ' +
      're-deriving from created_at is correct only while one lane is the sole writer for that day.',
    count: ids.length,
    idsHash,
    idsHashAlgorithm: 'sha256 over the ids sorted ascending, newline-joined',
    scriptQuality: {
      counts: byScript,
      note:
        'script-quality-cli.ts writes exactly ONE verdict, legacy_font_ascii, and leaves the rest NULL ' +
        'on purpose: `clean` would have to be asserted from the ABSENCE of a signal, and a pure-ASCII ' +
        'English judgment is byte-identical to a Hindi one whose Devanagari the extractor deleted. ' +
        'A NULL here therefore means NOT ASSESSED, never assessed-and-fine. Anything reading it as ' +
        'a pass is admitting on absence of evidence.',
      screenRunAt: takenAt,
      screenScope: `created_at >= ${SINCE}`,
    },
    byMonth,
    byCourt: Object.fromEntries(Object.entries(byCourt).sort((a, b) => b[1] - a[1])),
    ids,
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 1));

  console.log(`handoff  ${report.handoffId}`);
  console.log(`count    ${ids.length.toLocaleString()}`);
  console.log(`idsHash  ${idsHash}`);
  console.log(`script_quality: ${JSON.stringify(byScript)}`);
  console.log(`months: ${JSON.stringify(byMonth)}`);
  console.log(`wrote ${OUT}`);
  await sql.end();
}

await main();
