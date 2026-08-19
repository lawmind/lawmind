/**
 * `pnpm crosslingual` — the 5 Hindi queries against the live index, paired
 * with their English originals.
 *
 * P9 of the NEW1 GPU/embedding directive: "Hindi-query benchmark is
 * cross-lingual: Hindi query -> English SC text. Do not mix this with
 * Devanagari OCR." This is that comparison, kept separate from any OCR/script
 * quality work by construction — every gold judgment here is Supreme Court,
 * English full text, the same population the CONTROLLED baseline already
 * measures. Only the QUERY changes language.
 *
 * `services/harness/src/fixtures/queries.hand.json` carries exactly 5 Hindi
 * queries, each a `hindi-restatement-of-derived` of one query already in
 * `queries.eval.json` — same gold judgment, same issue, the Hindi text
 * authored fresh rather than translated mechanically. Both are run through
 * the SAME `scoreQuery` the harness scores everything with, so the only
 * variable between a pair is the language of the question.
 *
 * Live queries against the production index — BGE-M3 is multilingual, so this
 * is a real test of cross-lingual retrieval, not a synthetic one. Five pairs,
 * ten queries: cheap enough to run against the contended box without adding
 * meaningfully to its load.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import postgres from 'postgres';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { scoreQuery, type HarnessQuery } from './retrieval.ts';
import { sslFor } from './db-url.ts';

const require = createRequire(import.meta.url);
const OUT = process.env['CROSSLINGUAL_JSON'] ?? null;

type HandFixture = {
  readonly queries: readonly {
    readonly id: string;
    readonly group: string;
    readonly language: string;
    readonly query: string;
    readonly goldJudgmentIds: readonly string[];
    readonly provenance?: { readonly derivedFrom?: string };
  }[];
};

/**
 * Retrieval mode. Defaults to `hybrid`, which is what production serves.
 *
 * `dense` exists because of a measurement, not a preference: on 19 Aug 2026 a
 * single Hindi query's SPARSE arm ran for **1,994 seconds** against the 18M-row
 * `judgments` before it was cancelled. A Hindi query cannot match English lexemes
 * anyway — `to_tsquery('english', ...)` over Devanagari produces terms the corpus
 * does not contain — so on this fixture the sparse arm contributes nothing and
 * costs everything. Cross-lingual retrieval is a DENSE question; the hybrid run
 * stays the default so the two can be compared when the box is quiet enough to
 * finish one.
 */
const MODE = (process.env['CROSSLINGUAL_MODE'] ?? 'hybrid') as 'hybrid' | 'dense' | 'sparse';

async function main(): Promise<void> {
  const hand = require('./fixtures/queries.hand.json') as HandFixture;
  const evalFixture = JSON.parse(
    readFileSync(new URL('./fixtures/queries.eval.json', import.meta.url), 'utf8'),
  ) as { queries: HandFixture['queries'] };

  const hindiQueries = hand.queries.filter((q) => q.language === 'hi');
  console.log(`${hindiQueries.length} Hindi queries, paired against their English originals\n`);

  const byId = new Map(evalFixture.queries.map((q) => [q.id, q]));
  const pairs = hindiQueries.map((hi) => {
    const enId = hi.provenance?.derivedFrom;
    const en = enId ? byId.get(enId) : undefined;
    return { hi, en };
  });

  const missing = pairs.filter((p) => !p.en);
  if (missing.length > 0) {
    console.log(
      `${missing.length} Hindi quer(y/ies) have no English pair in the CURRENT eval set (derivedFrom not found) — reported, not skipped:`,
    );
    for (const m of missing) console.log(`  ${m.hi.id} -> ${m.hi.provenance?.derivedFrom ?? 'none recorded'}`);
    console.log('');
  }

  const url = process.env['DATABASE_URL'] ?? '';
  const sql = postgres(url, { ssl: sslFor(url), max: 2 });
  const embedder = await getEmbedder();
  const embedQuery = async (text: string): Promise<string | null> => {
    const [e] = await embedder.embed([text]);
    return e ? toVectorLiteral(e.vector) : null;
  };

  type Row = { id: string; language: string; foundAtAnyRank: number | null; precision: number };
  const rows: Row[] = [];

  for (const { hi, en } of pairs) {
    for (const [tag, q] of [
      ['hi', hi],
      ['en', en],
    ] as const) {
      if (!q) continue;
      const hq: HarnessQuery = {
        id: q.id,
        group: q.group,
        language: q.language,
        query: q.query,
        goldJudgmentIds: [...q.goldJudgmentIds],
      };
      const scored = await scoreQuery(sql, hq, embedQuery, 20, undefined, false, undefined, MODE, {});
      rows.push({
        id: q.id,
        language: tag,
        foundAtAnyRank: scored.foundAtAnyRank,
        precision: scored.precision,
      });
      console.log(
        `${tag}  ${q.id.padEnd(16)} foundAtAnyRank ${String(scored.foundAtAnyRank ?? 'none').padStart(5)}  ` +
          `top title: ${scored.topTitles[0]?.slice(0, 70) ?? '(none)'}`,
      );
    }
  }
  await sql.end();

  console.log('');
  const summarise = (lang: 'hi' | 'en'): { successAt5: number; recallAt20: number; n: number } => {
    const subset = rows.filter((r) => r.language === lang);
    const n = subset.length;
    return {
      n,
      successAt5:
        n === 0 ? 0 : subset.filter((r) => r.foundAtAnyRank !== null && r.foundAtAnyRank <= 5).length / n,
      recallAt20: n === 0 ? 0 : subset.filter((r) => r.foundAtAnyRank !== null).length / n,
    };
  };
  const hi = summarise('hi');
  const en = summarise('en');
  console.log(
    `Hindi     n=${hi.n}  success@5 ${(hi.successAt5 * 100).toFixed(1)}%  recall@20 ${(hi.recallAt20 * 100).toFixed(1)}%`,
  );
  console.log(
    `English   n=${en.n}  success@5 ${(en.successAt5 * 100).toFixed(1)}%  recall@20 ${(en.recallAt20 * 100).toFixed(1)}%`,
  );

  if (OUT) {
    const fs = await import('node:fs');
    fs.writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          kind: 'new1_crosslingual',
          createdAt: new Date().toISOString(),
          method: 'live production hybrid search, 5 Hindi queries paired with their English originals by shared gold judgment',
          missingPairs: missing.map((m) => m.hi.id),
          rows,
          summary: { hi, en },
          caveat:
            'n=5 pairs. This is a first measurement, not a settled benchmark — the directive itself calls for expanding the gold set before broad claims.',
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nwrote ${OUT}`);
  }
}

await main();
