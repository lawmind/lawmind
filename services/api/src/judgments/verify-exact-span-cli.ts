/**
 * Evidence regression check — Stage 13's own invariant, measured against real
 * production data rather than assumed from the unit tests.
 *
 *   pnpm --filter @lawmind/api verify:exact-span [--n 500]
 *   pnpm --filter @lawmind/api verify:exact-span -- --stratified [--per-stratum 1000]
 *
 * `resolveExactSpan`/`locateParagraphByOffset` are pure and unit-tested, but a
 * pure function is only as good as what it is fed — both bugs this guards
 * against (`docs/CURRENT_PLAN.md` Q1.22 — `chunk.ts`'s old `text.indexOf`
 * fallback silently writing `char_offset: 0`, and a merge step silently
 * overshooting `bodyLength` by 1-2 characters) were invisible to every unit
 * test in the repo, because `chunk.ts` was internally self-consistent — it
 * reproduced the same wrong value every time it was asked. Both only showed
 * up against real rows, and the second one only showed up once the sample
 * was large enough (2/1000, not caught at n=500).
 *
 * **Default mode**: one random sample, `--n` controls size (unchanged
 * behaviour from the version that found both bugs).
 *
 * **`--stratified` mode**: the flat random sample under-represents rare but
 * real shapes — a random draw over a corpus that is mostly short, native-text,
 * single-paragraph SC judgments rarely lands on the long, OCR-damaged,
 * many-paragraph High Court judgment where a merge-driven offset bug actually
 * lives. Each stratum below is drawn independently so a corpus imbalance
 * cannot starve a stratum of samples the way one combined random draw would.
 *
 * Every failure is classified and PERSISTED to `--persist <path>` (default
 * `verify-exact-span-regressions.json`) as a replayable regression record:
 * enough identity (`document_id`, `chunk_id`, offsets, both text hashes) to
 * look the row up by hand or re-check it in a future run without re-deriving
 * anything from a log line.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { resolveExactSpan } from './paragraphs.ts';
import { sslFor } from '../db-ssl';

type FailureClass =
  | 'OFFSET_INVALID' // bounds check itself failed: offset/length don't fit inside full_text
  | 'TEXT_MISMATCH' // bounds fine, but the recovered slice isn't a suffix of the stored chunk_text
  | 'MISSING_OFFSET' // char_offset is NULL -- not a failure of a returned row, a coverage gap
  | 'OTHER';

type FailureRecord = {
  class: FailureClass;
  stratum: string;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  charOffset: number | null;
  charLength: number | null;
  fullTextLength: number;
  sourceTextHash: string;
  chunkTextHash: string;
  returnedTextSample: string | null;
  foundAt: string;
};

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

async function fetchStratum(
  sql: postgres.Sql,
  label: string,
  whereSql: ReturnType<postgres.Sql>,
  limit: number,
): Promise<
  {
    id: string;
    judgment_id: string;
    chunk_index: number;
    chunk_text: string;
    char_offset: number | null;
    char_length: number | null;
    full_text: string;
  }[]
> {
  const rows = await sql<
    {
      id: string;
      judgment_id: string;
      chunk_index: number;
      chunk_text: string;
      char_offset: number | null;
      char_length: number | null;
      full_text: string;
    }[]
  >`
    SELECT c.id, c.judgment_id, c.chunk_index, c.chunk_text, c.char_offset, c.char_length, j.full_text
    FROM judgment_chunks c JOIN judgments j ON j.id = c.judgment_id
    WHERE ${whereSql}
    ORDER BY random()
    LIMIT ${limit}
  `;
  console.log(`  stratum "${label}": drew ${rows.length} (requested ${limit})`);
  return rows;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const argv = process.argv;
  const stratified = argv.includes('--stratified');
  const nArg = argv.indexOf('--n');
  const n = nArg === -1 ? 500 : Number(argv[nArg + 1] ?? 500);
  const perArg = argv.indexOf('--per-stratum');
  const perStratum = perArg === -1 ? 1000 : Number(argv[perArg + 1] ?? 1000);
  const persistArg = argv.indexOf('--persist');
  const persistPath =
    persistArg === -1
      ? 'verify-exact-span-regressions.json'
      : (argv[persistArg + 1] ?? 'verify-exact-span-regressions.json');

  const sql = postgres(url, { max: 4, ssl: sslFor(url) });
  let exitCode = 0;
  const failures: FailureRecord[] = [];
  const byClass = new Map<FailureClass, number>();
  const byStratum = new Map<string, { ok: number; total: number }>();

  const record = (
    cls: FailureClass,
    stratum: string,
    row: {
      judgment_id: string;
      id: string;
      chunk_index: number;
      char_offset: number | null;
      char_length: number | null;
      full_text: string;
      chunk_text: string;
    },
    returnedText: string | null,
  ): void => {
    byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
    failures.push({
      class: cls,
      stratum,
      documentId: row.judgment_id,
      chunkId: row.id,
      chunkIndex: row.chunk_index,
      charOffset: row.char_offset,
      charLength: row.char_length,
      fullTextLength: row.full_text.length,
      sourceTextHash: sha256(row.full_text),
      chunkTextHash: sha256(row.chunk_text),
      returnedTextSample: returnedText ? returnedText.slice(0, 200) : null,
      foundAt: new Date().toISOString(),
    });
  };

  const check = (
    stratum: string,
    row: {
      id: string;
      judgment_id: string;
      chunk_index: number;
      chunk_text: string;
      char_offset: number | null;
      char_length: number | null;
      full_text: string;
    },
  ): void => {
    const bucket = byStratum.get(stratum) ?? { ok: 0, total: 0 };
    bucket.total++;
    byStratum.set(stratum, bucket);

    if (row.char_offset === null || row.char_length === null) {
      record('MISSING_OFFSET', stratum, row, null);
      return;
    }
    const span = resolveExactSpan(row.full_text, row.char_offset, row.char_length);
    if (!span) {
      record('OFFSET_INVALID', stratum, row, null);
      return;
    }
    if (!row.chunk_text.endsWith(span.text)) {
      record('TEXT_MISMATCH', stratum, row, span.text);
      return;
    }
    bucket.ok++;
  };

  try {
    // The known signature, checked table-wide (cheap: one indexed count, no
    // full_text fetch) rather than only within whatever sample is drawn.
    const [signature] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgment_chunks
      WHERE char_offset = 0 AND chunk_index > 0
    `;
    console.log(
      `chunks matching bug #1's signature (char_offset=0, chunk_index>0): ${signature?.n}`,
    );
    if (Number(signature?.n ?? 0) > 0) exitCode = 1;

    const [overshoot] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
      FROM judgment_chunks c JOIN judgments j ON j.id = c.judgment_id
      WHERE c.char_offset IS NOT NULL AND c.char_offset + c.char_length > length(j.full_text)
    `;
    console.log(
      `chunks matching bug #2's signature (offset+length overshoots full_text): ${overshoot?.n}`,
    );
    if (Number(overshoot?.n ?? 0) > 0) exitCode = 1;

    if (!stratified) {
      const rows = await fetchStratum(sql, 'random', sql`c.char_offset IS NOT NULL`, n);
      console.log(`\nexact-span invariant, sampled n=${rows.length} (requested ${n}):`);
      for (const row of rows) check('random', row);
    } else {
      console.log(`\nstratified sampling, up to ${perStratum} per stratum:`);
      const strata: { name: string; where: ReturnType<postgres.Sql> }[] = [
        // Rare but real shapes a flat random draw under-samples.
        { name: 'offset=0 (first chunk)', where: sql`c.char_offset = 0` },
        { name: 'null offset (not yet backfilled)', where: sql`c.char_offset IS NULL` },
        {
          name: 'short judgment (<5,000 chars)',
          where: sql`c.char_offset IS NOT NULL AND length(j.full_text) < 5000`,
        },
        {
          name: 'long judgment (>200,000 chars)',
          where: sql`c.char_offset IS NOT NULL AND length(j.full_text) > 200000`,
        },
        {
          name: 'early era (pre-1990)',
          where: sql`c.char_offset IS NOT NULL AND j.judgment_date < '1990-01-01'`,
        },
        {
          name: 'recent (2023+)',
          where: sql`c.char_offset IS NOT NULL AND j.judgment_date >= '2023-01-01'`,
        },
        {
          name: 'Supreme Court',
          where: sql`c.char_offset IS NOT NULL AND j.court = 'Supreme Court of India'`,
        },
        {
          name: 'High Court',
          where: sql`c.char_offset IS NOT NULL AND j.court != 'Supreme Court of India'`,
        },
        {
          name: 'low text_quality (OCR-damage proxy, <0.7)',
          where: sql`c.char_offset IS NOT NULL AND c.text_quality IS NOT NULL AND c.text_quality < 0.7`,
        },
        {
          name: 'high text_quality (native/clean, >=0.98)',
          where: sql`c.char_offset IS NOT NULL AND c.text_quality IS NOT NULL AND c.text_quality >= 0.98`,
        },
        {
          name: 'likely-merged chunk (char_length exceeds the single-unit budget)',
          // A single, unmerged unit (one paragraph, or one splitLongParagraph
          // piece) is bounded at maxChars (2,400 by default) by construction
          // -- it cannot exceed it on its own. Any chunk longer than that
          // was necessarily built by joining two or more units, which is
          // exactly the shape bug #2 lived in. Measured via chunk:qa
          // (services/ingest) before picking this threshold: real corpus
          // bodies top out around 2,700 at n=3,000, so 3,000 drew zero rows
          // in practice -- lowered to sit exactly at the real ceiling.
          where: sql`c.char_offset IS NOT NULL AND c.char_length > 2400`,
        },
        {
          name: 'final chunk of its judgment (edge offset)',
          where: sql`c.char_offset IS NOT NULL AND c.chunk_index = (
            SELECT max(c2.chunk_index) FROM judgment_chunks c2 WHERE c2.judgment_id = c.judgment_id
          )`,
        },
        {
          name: 'duplicate-group document (content_hash shared)',
          where: sql`c.char_offset IS NOT NULL AND j.content_hash IN (
            SELECT content_hash FROM judgments WHERE content_hash IS NOT NULL
            GROUP BY content_hash HAVING count(*) > 1
          )`,
        },
        { name: 'random baseline', where: sql`c.char_offset IS NOT NULL` },
      ];

      for (const stratum of strata) {
        const rows = await fetchStratum(sql, stratum.name, stratum.where, perStratum);
        for (const row of rows) check(stratum.name, row);
      }
    }

    console.log('\nRESULTS BY STRATUM');
    console.log('='.repeat(78));
    let totalOk = 0;
    let totalAll = 0;
    for (const [stratum, { ok, total }] of byStratum) {
      totalOk += ok;
      totalAll += total;
      const pct = total === 0 ? '—' : ((ok / total) * 100).toFixed(1);
      console.log(
        `  ${stratum.padEnd(55)} ${String(ok).padStart(6)}/${String(total).padEnd(6)} (${pct}%)`,
      );
    }
    console.log(
      `  ${'TOTAL'.padEnd(55)} ${String(totalOk).padStart(6)}/${String(totalAll).padEnd(6)}`,
    );

    console.log('\nFAILURES BY CLASS');
    console.log('='.repeat(78));
    for (const cls of [
      'OFFSET_INVALID',
      'TEXT_MISMATCH',
      'MISSING_OFFSET',
      'OTHER',
    ] as FailureClass[]) {
      console.log(`  ${cls.padEnd(20)} ${byClass.get(cls) ?? 0}`);
    }

    // MISSING_OFFSET is a coverage gap (a row genuinely not yet backfilled),
    // not evidence of a wrong value -- it should not fail the run, only be
    // reported. OFFSET_INVALID/TEXT_MISMATCH are real defects.
    const realFailures = failures.filter((f) => f.class !== 'MISSING_OFFSET');
    if (realFailures.length > 0) exitCode = 1;

    if (failures.length > 0) {
      const existing: FailureRecord[] = existsSync(persistPath)
        ? (JSON.parse(readFileSync(persistPath, 'utf8')) as FailureRecord[])
        : [];
      const seen = new Set(existing.map((f) => `${f.chunkId}:${f.class}`));
      const newOnes = failures.filter((f) => !seen.has(`${f.chunkId}:${f.class}`));
      const merged = [...existing, ...newOnes];
      writeFileSync(persistPath, JSON.stringify(merged, null, 2));
      console.log(
        `\n${newOnes.length} new failure record(s) appended to ${persistPath} (${merged.length} total, ${existing.length} pre-existing) -- a replayable regression corpus, not just a log line.`,
      );
    }
  } finally {
    await sql.end();
  }
  process.exitCode = exitCode;
}

await main();
