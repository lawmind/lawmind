/**
 * OD-4 Stage 1 runner — Supreme Court, 1950 onward.
 *
 *   pnpm --filter @lawmind/ingest sci --from 1950 --to 2026 [--limit N] [--resume]
 *
 * Resumable by construction: `--resume` skips source URLs already in the table,
 * and the unique index means an interrupted run re-writes rather than duplicates
 * even without it.
 */
import postgres from 'postgres';

import { existingSourceUrls, upsertJudgments } from './load.ts';
import { readYearMetadata, sourceUrlFor, toJudgment, type JudgmentRecord } from './sci.ts';
import { fetchPdfText, isNativeText } from './text.ts';

type Args = { from: number; to: number; limit: number; resume: boolean; concurrency: number };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    from: Number(get('--from') ?? 1950),
    to: Number(get('--to') ?? new Date().getFullYear()),
    limit: Number(get('--limit') ?? Number.POSITIVE_INFINITY),
    resume: argv.includes('--resume'),
    concurrency: Number(get('--concurrency') ?? 8),
  };
}

/** Bounded parallelism — enough to saturate the link, polite to a sponsored bucket. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      const item = items[i];
      if (item === undefined) return;
      try {
        results[i] = { status: 'fulfilled', value: await fn(item) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 4 });

  let seen = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  // The same judgment is listed under two adjacent year partitions, so without
  // this ~29% of PDFs would be fetched and parsed twice to no effect.
  const seenUrls = new Set<string>();
  const failures: { url: string; error: string }[] = [];
  const startedAt = Date.now();

  try {
    for (let year = args.from; year <= args.to && seen < args.limit; year++) {
      let rows;
      try {
        rows = await readYearMetadata(year);
      } catch (error) {
        console.log(`year=${year} metadata unavailable (${String(error)}) — skipping`);
        continue;
      }

      const budget = args.limit - seen;
      const slice = rows.slice(0, Math.max(0, budget));
      seen += slice.length;

      // Within-run dedup first: a judgment already handled under the previous
      // partition must not be fetched again.
      let pending = slice.filter((r) => {
        const u = sourceUrlFor(r);
        if (seenUrls.has(u)) return false;
        seenUrls.add(u);
        return true;
      });
      skipped += slice.length - pending.length;

      if (args.resume) {
        const have = await existingSourceUrls(sql, pending.map(sourceUrlFor));
        const before = pending.length;
        pending = pending.filter((r) => !have.has(sourceUrlFor(r)));
        skipped += before - pending.length;
      }

      const settled = await mapPool(pending, args.concurrency, async (row) => {
        // Same URL for fetch and for provenance, by construction.
        const { text, pages, method } = await fetchPdfText(sourceUrlFor(row));
        return toJudgment(row, text, isNativeText(text.length, pages), method);
      });

      const records: JudgmentRecord[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') records.push(r.value);
        else {
          const row = pending[i];
          failures.push({
            url: row ? sourceUrlFor(row) : `year=${year} index=${i}`,
            error: String(r.reason).slice(0, 160),
          });
        }
      });

      const res = await upsertJudgments(sql, records);
      inserted += res.inserted;
      updated += res.updated;
      console.log(
        `year=${year} rows=${slice.length} skipped=${skipped} ` +
          `inserted=${res.inserted} updated=${res.updated} failed=${failures.length}`,
      );
    }

    const [count] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgments`;
    console.log(
      `\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ` +
        `inserted=${inserted} updated=${updated} skipped=${skipped} failed=${failures.length}`,
    );
    console.log(`judgments in database: ${count?.n}`);
    // Failures are printed, never swallowed — a silently short corpus is the
    // ingest equivalent of a silently dropped citation.
    for (const f of failures.slice(0, 20)) console.log(`  FAILED ${f.url} — ${f.error}`);
    if (failures.length > 20) console.log(`  ...and ${failures.length - 20} more`);
  } finally {
    await sql.end();
  }
}

await main();
