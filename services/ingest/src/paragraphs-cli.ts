/**
 * `pnpm --filter @lawmind/ingest paragraphs --apply` — paragraph-level evidence
 * coverage for the whole corpus, without embeddings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION THIS EXECUTES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder call, 13 Aug 2026: fund chunk-text coverage now; start embeddings only
 * once every court is held, every case and citation is in, and the corpus is
 * structured. **Data first, vectors second.**
 *
 * The gap this closes was NEW1's: 94.5% of successfully-retrieved queries came
 * back with an empty `operativeParagraph`, because only **40,161 of 600,073
 * judgments (6.7%)** had any passage stored at all. That is not an evidence bug;
 * it is a corpus that grew 7× under a table which only ever covered the Supreme
 * Court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOES NOT TOUCH `judgment_chunks`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That is the VECTOR table, and `retrieve.ts`'s dense query is
 * `ORDER BY c.embedding <=> $1 LIMIT n` over it with **no
 * `WHERE embedding IS NOT NULL`** — checked in the source, not assumed. Adding
 * ~550,000 embedding-less rows would grow it roughly 15× and invite the planner
 * to drop the HNSW index for a sequential scan. Paying for evidence display
 * with production search latency is not a trade worth making quietly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESUMABLE, AND SAFE UNDER A CONCURRENT INGEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Keyset pagination, `connect_timeout`, retry on transient transport failure —
 * the three things that killed four workers in this lane today, all present from
 * the start rather than added after the first crash. `--resume` skips judgments
 * that already have paragraphs, so an interrupted run costs only what is left.
 */
import { createHash } from 'node:crypto';

import postgres from 'postgres';

import { splitParagraphs, spansAreContiguous } from './paragraphs.ts';
import { installCrashGuard } from './crash-guard.ts';


// Silent deaths cost three runs today; log the cause instead of vanishing.
installCrashGuard('paragraphs');
const APPLY = process.argv.includes('--apply');
const RESUME = process.argv.includes('--resume');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const PAGE = Number(arg('page', '300'));
const LIMIT = Number(arg('limit', '0'));

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('localhost') ? false : 'require',
  max: 2,
  connect_timeout: 120,
  idle_timeout: 0,
});

const TRANSIENT =
  /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_ENDED|socket|getaddrinfo/i;
async function withRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const m = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ''}` : String(err);
      if (attempt >= 8 || !TRANSIENT.test(m)) throw err;
      const wait = Math.min(30_000, 1000 * 2 ** attempt);
      console.log(`\n    db ${what} failed (${m.trim()}) — retry in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

console.log('PARAGRAPH EVIDENCE COVERAGE');
console.log('='.repeat(74));
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · ${RESUME ? 'resume' : 'full walk'} · page ${PAGE}`);

let cursor = '00000000-0000-0000-0000-000000000000';
let scanned = 0;
let written = 0;
let paragraphs = 0;
let numbered = 0;
let lostText = 0;
const started = Date.now();

for (;;) {
  if (LIMIT > 0 && scanned >= LIMIT) break;

  const page = await withRetry('select', () =>
    sql<{ id: string; fullText: string }[]>`
      SELECT id, full_text AS "fullText" FROM judgments
      WHERE id > ${cursor}::uuid AND full_text IS NOT NULL AND length(full_text) > 100
        ${RESUME ? sql`AND NOT EXISTS (SELECT 1 FROM judgment_paragraphs p WHERE p.judgment_id = judgments.id)` : sql``}
      ORDER BY id LIMIT ${PAGE}`,
  );
  if (page.length === 0) break;
  cursor = page[page.length - 1]!.id;

  const rows: {
    judgment_id: string;
    paragraph_index: number;
    paragraph_number: number | null;
    char_offset: number;
    char_length: number;
    paragraph_text: string;
    source_text_hash: string;
  }[] = [];

  for (const j of page) {
    scanned++;
    const paras = splitParagraphs(j.fullText);
    if (paras.length === 0) continue;

    /**
     * THE ONE INVARIANT WORTH FAILING OVER. If the spans do not reconstruct the
     * source exactly, this judgment's evidence would point at text that is not
     * where we say it is. Skip it and count it, rather than store a span nobody
     * can trust — a wrong offset is worse than an absent one, because the
     * product would render it as a quotation.
     */
    if (!spansAreContiguous(paras, j.fullText)) {
      lostText++;
      continue;
    }

    const hash = sha256(j.fullText);
    for (const p of paras) {
      paragraphs++;
      if (p.number !== null) numbered++;
      rows.push({
        judgment_id: j.id,
        paragraph_index: p.index,
        paragraph_number: p.number,
        char_offset: p.charOffset,
        char_length: p.charLength,
        paragraph_text: p.text,
        source_text_hash: hash,
      });
    }
    written++;
  }

  if (APPLY && rows.length > 0) {
    // Chunked, because a few thousand rows exceeds the bind-parameter limit.
    for (let i = 0; i < rows.length; i += 1000) {
      const slice = rows.slice(i, i + 1000);
      await withRetry('insert', () =>
        sql`INSERT INTO judgment_paragraphs ${sql(slice)}
            ON CONFLICT (judgment_id, paragraph_index) DO NOTHING`,
      );
    }
  }

  const rate = scanned / Math.max(1, (Date.now() - started) / 1000);
  process.stdout.write(
    `\r  scanned ${scanned.toLocaleString()} · ${paragraphs.toLocaleString()} paragraphs ` +
      `(${numbered.toLocaleString()} court-numbered) · ${rate.toFixed(1)}/s`,
  );
  if (page.length < PAGE) break;
}

console.log('');
console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`judgments scanned        ${scanned.toLocaleString()}`);
console.log(`judgments with evidence  ${written.toLocaleString()}${APPLY ? ' (written)' : ' (dry run)'}`);
console.log(`paragraphs               ${paragraphs.toLocaleString()}`);
console.log(
  `  carrying a court number ${numbered.toLocaleString()}` +
    `${paragraphs > 0 ? ` = ${((100 * numbered) / paragraphs).toFixed(1)}%` : ''}` +
    ` — the rest are cause titles, coram lines and unnumbered preambles`,
);
console.log(`REFUSED (spans lost text) ${lostText}  <-- stored nothing rather than a span nobody can trust`);
console.log(`mean paragraphs/judgment ${written > 0 ? (paragraphs / written).toFixed(1) : '0'}`);
console.log(`wall clock               ${((Date.now() - started) / 1000).toFixed(0)}s`);

await sql.end();
