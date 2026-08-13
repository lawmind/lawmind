/**
 * Classify the High Court corpus, and report what it actually contains.
 *
 *   pnpm --filter @lawmind/ingest run hc:classify              # report only
 *   pnpm --filter @lawmind/ingest run hc:classify --confirm    # write
 *   pnpm --filter @lawmind/ingest run hc:classify --sample 20  # validation sample
 *
 * Dry by default. The parser is pure and lives in `hc-classify.ts`; this file is
 * the database half and holds no classification rules of its own.
 *
 * `--sample N` prints N real rows per class with their text, for reading by a
 * human. A classifier validated only against its own author's test fixtures has
 * been validated against the author's idea of a High Court order.
 */
import type { Sql } from 'postgres';

import { openDb } from './db-host.ts';
import { classifyHcDocument, type HcDocumentClass } from './hc-classify.ts';

const BATCH = 1000;

type Row = {
  id: string;
  disposal_nature: string | null;
  case_number: string | null;
  full_text: string;
  len: number;
};

type Update = { id: string; cls: string | null; method: string };

/**
 * One page, folded into the running counters. Returns only the small
 * id/class/method triples — it never retains text beyond the caller's page,
 * which is the whole point of the streaming rewrite.
 */
function classifyPage(
  page: readonly Row[],
  byClass: Map<string, number>,
  byMethod: Map<string, number>,
  chars: Map<string, number>,
  samples: Map<string, Row[]>,
  sampleN: number,
): Update[] {
  const updates: Update[] = [];
  for (const r of page) {
    const { documentClass, method } = classifyHcDocument({
      disposalNature: r.disposal_nature,
      caseNumber: r.case_number,
      fullText: r.full_text,
    });
    const key = documentClass ?? '(unclassified)';
    byClass.set(key, (byClass.get(key) ?? 0) + 1);
    chars.set(key, (chars.get(key) ?? 0) + r.len);
    // Unclassified methods carry the offending value; keep only the head so the
    // report does not become a list of 9,800 disposal strings.
    const head = method.split(':')[0]!;
    byMethod.set(head, (byMethod.get(head) ?? 0) + 1);
    updates.push({ id: r.id, cls: documentClass, method });
    const bucket = samples.get(key) ?? [];
    if (bucket.length < sampleN) {
      bucket.push(r);
      samples.set(key, bucket);
    }
  }
  return updates;
}

async function writeClasses(sql: Sql, updates: readonly Update[]): Promise<void> {
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await sql`
      UPDATE judgments AS j SET hc_document_class = v.cls, hc_class_method = v.method
      FROM (VALUES ${sql(slice.map((u) => [u.id, u.cls, u.method] as const))})
           AS v(id, cls, method)
      WHERE j.id = v.id::uuid`;
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const confirm = process.argv.includes('--confirm');
  const sampleAt = process.argv.indexOf('--sample');
  const sampleN = sampleAt === -1 ? 0 : Number(process.argv[sampleAt + 1] ?? 5);
  /**
   * `openDb()`, not `postgres()` directly. A stalled DNS lookup is NOT covered
   * by `connect_timeout`, and seven long-running passes died on exactly that
   * today before `db-host.ts` existed. This job walks the whole corpus, so it is
   * precisely the shape that gets caught by it.
   */
  const sql = await openDb(url, 2);

  try {
    /**
     * PAGED AND RESUMABLE, because the corpus outgrew the original query.
     *
     * This selected `full_text` for every non-Supreme-Court judgment in one
     * result set. That was fine at 40,980 documents and is not fine at 265,000+
     * — the High Court ingest is currently landing ~34,000 an hour, and the
     * whole set is several gigabytes of text in a single round trip over a
     * shared proxy.
     *
     * `--resume` restricts the walk to rows no rule has judged yet
     * (`hc_class_method IS NULL`), so a re-run after an interrupted pass costs
     * only what is left. Without it the walk covers everything, which is what a
     * changed rule set needs.
     */
    const RESUME = process.argv.includes('--resume');
    const PAGE = 2_000;
    const byClass = new Map<string, number>();
    const byMethod = new Map<string, number>();
    const chars = new Map<string, number>();
    const samples = new Map<string, Row[]>();
    let total = 0;

    /**
     * STREAMED, because accumulating the corpus no longer fits in memory.
     *
     * The query was paged, but the loop then did `rows.push(...page)` and held
     * every document's `full_text` until the walk finished. That was written for
     * 265,000 documents. At **833,149** it dies: a dry run reached 322,000 —
     * roughly 2 GB of text — and the process vanished with no summary and no
     * error, which is what heap exhaustion looks like from outside.
     *
     * Each page is now classified, written, and dropped. Peak memory is ONE
     * page, so the walk costs the same at 833k as at 80k, and the same again at
     * 17.8M — the only version that survives the corpus we are heading for.
     *
     * Writing per page also makes an interrupted run useful: completed pages
     * are already committed and `--resume` restarts from
     * `hc_class_method IS NULL`.
     */
    let cursor = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const page = await sql<Row[]>`
        SELECT id, disposal_nature, case_number, full_text, length(full_text) AS len
        FROM judgments
        WHERE court <> 'Supreme Court of India' AND id > ${cursor}::uuid
          ${RESUME ? sql`AND hc_class_method IS NULL` : sql``}
        ORDER BY id
        LIMIT ${PAGE}`;
      if (page.length === 0) break;
      cursor = page[page.length - 1]!.id;
      total += page.length;

      const pageUpdates = classifyPage(page, byClass, byMethod, chars, samples, sampleN);
      if (confirm) await writeClasses(sql, pageUpdates);

      process.stdout.write(`\r  ${confirm ? 'classified + wrote' : 'classified'} ${total.toLocaleString()}`);
      if (page.length < PAGE) break;
    }
    console.log(`\n${total} High Court documents${RESUME ? ' (unclassified only)' : ''}\n`);
    if (total === 0) {
      console.log('nothing to classify.');
      return;
    }
    console.log('class                    documents      share   mean chars');
    for (const [k, n] of [...byClass.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = ((n / total) * 100).toFixed(1);
      const mean = Math.round((chars.get(k) ?? 0) / n);
      console.log(`  ${k.padEnd(22)} ${String(n).padStart(6)}  ${pct.padStart(6)}%  ${String(mean).padStart(8)}`);
    }
    console.log('\nrule that fired:');
    for (const [k, n] of [...byMethod.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(34)} ${String(n).padStart(6)}`);
    }

    if (sampleN > 0) {
      console.log('\n──────── VALIDATION SAMPLE — read these, do not trust the counts ────────');
      for (const [k, bucket] of samples) {
        console.log(`\n████ ${k}`);
        for (const r of bucket) {
          console.log(`  [${r.len} chars] ${r.disposal_nature ?? '(no disposal)'} · ${r.case_number}`);
          console.log(`     ${r.full_text.replace(/\s+/g, ' ').slice(0, 240)}`);
        }
      }
    }

    if (!confirm) {
      console.log('\nreport only. re-run with --confirm to write.');
      return;
    }

    const [check] = await sql<{ classified: number; unclassified: number; methodless: number }[]>`
      SELECT count(hc_document_class)::int AS classified,
             count(*) FILTER (WHERE hc_document_class IS NULL AND hc_class_method IS NOT NULL)::int AS unclassified,
             count(*) FILTER (WHERE hc_class_method IS NULL)::int AS methodless
      FROM judgments WHERE court <> 'Supreme Court of India'`;
    console.log(
      `\nwritten: ${check?.classified} classified, ${check?.unclassified} deliberately unclassified, ` +
        `${check?.methodless} with no method (must be 0)`,
    );
  } finally {
    await sql.end();
  }
}

await main();
