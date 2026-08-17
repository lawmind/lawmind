/**
 * Build `lexeme_document_frequency` — the corpus's own answer to "is this word
 * worth searching for".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `sparseAny()` picked its 40 query terms by LENGTH, on the stated assumption
 * that the long word is nearly always the rarer one. NEW1 measured that
 * assumption and it is false here (bus 0664): `court` is five characters and
 * appears in 90.6% of documents, while the terms that actually discriminate are
 * also five characters and were being discarded. The result was an OR'd tsquery
 * matching 94.1% of the corpus and a `ts_rank` ordering that took 781,289 ms
 * against 4.47 ms for the same filter without the ranking.
 *
 * `ts_rank` carries no IDF. PostgreSQL will not tell us that `court` is
 * worthless in a corpus of court judgments — only this corpus can, and only by
 * being counted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SAMPLE, AND WHY `TABLESAMPLE SYSTEM` IS THE WRONG ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ts_stat` over the whole table reads every `tsvector` in `judgments` — the
 * exact read that costs 781 seconds. So this samples.
 *
 * `TABLESAMPLE SYSTEM (n)` picks whole PAGES, not rows. That is fast and, for
 * this measurement, biased in a way that matters: judgments arrive court by
 * court and year by year, so physically adjacent rows share a court, a
 * registry's vocabulary and often a template. A page sample of 1% can therefore
 * be a handful of courts rather than 1% of the corpus, which is precisely the
 * axis a term-frequency table must not be skewed along.
 *
 * `TABLESAMPLE BERNOULLI (n)` rolls per ROW. It costs a full scan of the table's
 * row headers but reads the `tsvector` only for the rows it keeps, which is the
 * expensive part. That is the trade taken here, and it is why this is a batch
 * job rather than something the query path could do inline.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Dry by default, like every other CLI in this repo. `--apply` writes.
 *
 * It writes ONLY `lexeme_document_frequency`, a derived table that asserts
 * nothing about the law. It never touches `judgments`, never calls a model, and
 * the table's own comment records that an ABSENT lexeme means "not seen in the
 * sample" and must be treated by the query path as RARE — dropping an unmeasured
 * term would cost recall, and a recall failure leaves no trace to find later.
 *
 *   pnpm --filter @lawmind/ingest lexeme-frequency
 *   pnpm --filter @lawmind/ingest lexeme-frequency --apply --sample 2
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

/** Percent of rows sampled, Bernoulli. 2% of 7.9M is ~158,000 documents. */
const SAMPLE_PCT = Number(arg('sample', '2'));
/**
 * A lexeme seen in only one or two sampled documents tells us nothing except
 * that it is rare, which the query path already assumes for anything absent.
 * Storing the long tail would multiply the table size for no decision it can
 * change.
 */
const MIN_DOCS = Number(arg('min-docs', '3'));

/**
 * The same pause sentinel every other writer in this service checks. A frequency
 * rebuild is exactly the kind of job that should stand aside for a cutover, and
 * `scripts/check-stop-coverage.mjs` enumerates the paths that must.
 */
const STOP_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.checkpoints', 'STOP');
function stopIfRequested(): void {
  if (existsSync(STOP_FILE)) {
    console.log(`PAUSED by ${STOP_FILE}. Nothing written. Delete the file to resume.`);
    process.exit(0);
  }
}

async function main(): Promise<void> {
  stopIfRequested();
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  if (!Number.isFinite(SAMPLE_PCT) || SAMPLE_PCT <= 0 || SAMPLE_PCT > 100) {
    throw new Error(`--sample must be a percentage in (0, 100], got ${SAMPLE_PCT}`);
  }

  const sql = postgres(url, { max: 1, idle_timeout: 0, connect_timeout: 20, onnotice: () => {} });
  try {
    console.log(
      `lexeme frequency · sample ${SAMPLE_PCT}% · min-docs ${MIN_DOCS} · ${APPLY ? 'APPLY' : 'DRY RUN'}`,
    );

    const started = Date.now();
    /**
     * THE SAMPLE IS MATERIALISED FIRST, and that is a correctness requirement
     * rather than a performance one.
     *
     * `ts_stat` takes a QUERY STRING and cannot see a CTE, so the obvious
     * single-statement shape — a `sample` CTE for the denominator and a
     * `ts_stat('… TABLESAMPLE …')` for the numerator — draws **two independent
     * samples** and divides one by the other. The first version of this file did
     * exactly that. Every ratio it produced would have been wrong by the
     * difference between two rolls of the dice, and nothing would have errored.
     *
     * One temp table, counted once, read once. It dies with the connection.
     */
    await sql.unsafe(`
      CREATE TEMP TABLE lexeme_sample ON COMMIT PRESERVE ROWS AS
      SELECT full_text_tsv
      FROM judgments TABLESAMPLE BERNOULLI (${SAMPLE_PCT})
      WHERE full_text_tsv IS NOT NULL
    `);
    const [den] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM lexeme_sample`;
    const sampled = Number(den!.n);
    console.log(
      `  sample materialised: ${sampled.toLocaleString()} documents · ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );

    /**
     * `ts_stat` returns `nentry` (total occurrences) and `ndoc` (documents). We
     * want `ndoc`: a word repeated ninety times in one judgment is still one
     * document, and it is document frequency that decides discrimination.
     */
    const rows = await sql<{ word: string; ndoc: string }[]>`
      SELECT word, ndoc::text AS ndoc
      FROM ts_stat('SELECT full_text_tsv FROM lexeme_sample')
      WHERE ndoc >= ${MIN_DOCS}
    `;
    console.log(
      `  ${rows.length.toLocaleString()} lexemes over ${sampled.toLocaleString()} sampled documents · ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );

    if (sampled === 0) {
      console.log('  sample is empty — nothing to write');
      return;
    }

    const ranked = [...rows].sort((a, b) => Number(b.ndoc) - Number(a.ndoc));
    console.log('\n  most common (these are what the length rule was keeping):');
    for (const r of ranked.slice(0, 8)) {
      console.log(`    ${r.word.padEnd(18)} ${((100 * Number(r.ndoc)) / sampled).toFixed(1)}%`);
    }

    const overHalf = ranked.filter((r) => Number(r.ndoc) / sampled > 0.5).length;
    console.log(`\n  lexemes in >50% of sampled documents: ${overHalf}`);

    if (!APPLY) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply.');
      return;
    }

    stopIfRequested();
    /**
     * Replaced wholesale inside ONE transaction. A half-rebuilt frequency table
     * is worse than a stale one: the query path would drop terms using
     * yesterday's numbers for some lexemes and today's for others, and no
     * measurement taken across that window would mean anything.
     */
    await sql.begin(async (tx) => {
      await tx`DELETE FROM lexeme_document_frequency`;
      const CHUNK = 5_000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK).map((r) => ({
          lexeme: r.word,
          document_count: Number(r.ndoc),
          sampled_documents: sampled,
        }));
        await tx`INSERT INTO lexeme_document_frequency ${tx(slice, 'lexeme', 'document_count', 'sampled_documents')}`;
      }
    });

    const [check] = await sql<
      { n: string }[]
    >`SELECT count(*)::text AS n FROM lexeme_document_frequency`;
    console.log(`\nwrote ${Number(check!.n).toLocaleString()} rows`);
  } finally {
    await sql.end({ timeout: 10 });
  }
}

await main();
