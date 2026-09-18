/**
 * `pnpm --filter @lawmind/harness cite:ambiguity` — P6. Re-grade the citation
 * gate as two metrics, because one of them was measuring luck.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE 97.38% NEEDS SPLITTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `launch:bench` measured the citation class at s@1 97.38%, p50 5 ms, and I
 * reported that as a passed gate. The same session found (bus 1017) that **at
 * least 100,000 neutral citations name more than one judgment** — a floor, not
 * a total, worst group 303.
 *
 * Ordinary success@1 is the wrong instrument wherever that is true. If
 * `2024:AHC-LKO:30534` legitimately names three judgments, then "the gold one
 * came back at rank 1" is a coin toss we happened to win, and "a different one
 * came back at rank 1" is not a retrieval failure — it is the product asserting
 * an identity it has no evidence for. Both readings are invisible in a pooled
 * s@1, and the same defect was just measured in the case_title class, where it
 * accounts for the entire gap between 94.2% and 67.69%.
 *
 * So this recomputes the class as the prompt specifies:
 *
 *   UNIQUE_CITATION_EXACTNESS            the citation names exactly one held
 *                                        judgment. s@1 is meaningful here and
 *                                        this is the number the gate should use.
 *   AMBIGUOUS_CITATION_CANDIDATE_COVERAGE the citation names several. Correct
 *                                        behaviour is NOT an arbitrary rank 1:
 *                                        it is every legitimate candidate
 *                                        reachable, and no false pin. Measured
 *                                        as: is gold anywhere in what came back,
 *                                        and did the page claim a single answer.
 *
 * The ambiguity count comes from the SAME normalised key `exactCitation` uses
 * (`upper(regexp_replace(coalesce(neutral_citation,''),'[^A-Za-z0-9]','','g'))`,
 * the expression `judgments_neutral_citation_key` is built on), so a citation
 * this tool calls ambiguous is exactly one the lookup would find two rows for.
 *
 * Read-only, and it re-reads the benchmark rather than re-running it: the
 * grading changes, the measurement does not.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const BENCH = new URL(
  '../../../docs/ai/new1-tier-a/launch-benchmark-v1-citation-v2.json',
  import.meta.url,
);
const OUT = new URL(
  '../../../docs/ai/new1-tier-a/citation-ambiguity-regrade.json',
  import.meta.url,
);

type BenchRow = {
  queryId: string;
  goldAuthorityId: string;
  rank: number | null;
  returned: number;
  topHitId?: string | null;
  wrongPin?: boolean;
  timedOut?: boolean;
  httpStatus?: number;
};

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  if (!existsSync(BENCH)) throw new Error(`no benchmark at ${BENCH.pathname}`);
  const bench = JSON.parse(readFileSync(BENCH, 'utf8')) as { rows: BenchRow[]; byClass?: unknown };
  const gold = buildLaunchGold();
  const goldById = new Map(gold.rows.map((r) => [r.queryId, r]));

  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 30_000 },
  });

  const rows: {
    queryId: string;
    query: string;
    goldId: string;
    heldWithThisCitation: number;
    ambiguous: boolean;
    rank: number | null;
    returned: number;
    topHitId: string | null;
    goldReachable: boolean;
    falsePin: boolean;
  }[] = [];

  for (const b of bench.rows) {
    const g = goldById.get(b.queryId);
    if (g === undefined || g.launchClass !== 'citation') continue;
    // The same key the lookup uses, applied to the QUERY.
    const [c] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
        FROM judgments j
       WHERE upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) =
             upper(regexp_replace(${g.query}, '[^A-Za-z0-9]', '', 'g'))`;
    const held = Number(c!.n);
    rows.push({
      queryId: b.queryId,
      query: g.query,
      goldId: b.goldAuthorityId,
      heldWithThisCitation: held,
      ambiguous: held > 1,
      rank: b.rank,
      returned: b.returned,
      topHitId: b.topHitId ?? null,
      goldReachable: b.rank !== null,
      // A false pin is a SINGLE result asserted for a citation that names several.
      falsePin: held > 1 && b.returned === 1,
    });
  }

  const uniq = rows.filter((r) => !r.ambiguous);
  const amb = rows.filter((r) => r.ambiguous);
  const pct = (a: number, b: number): number | null =>
    b === 0 ? null : Number(((100 * a) / b).toFixed(2));
  const summary = {
    kind: 'new1_citation_ambiguity_regrade',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    regradedFrom:
      'launch-benchmark-v1-citation-v2.json — the measurement is unchanged, the grading is not',
    queries: rows.length,
    UNIQUE_CITATION_EXACTNESS: {
      n: uniq.length,
      successAt1: pct(uniq.filter((r) => r.rank === 1).length, uniq.length),
      successAt5: pct(uniq.filter((r) => r.rank !== null && r.rank <= 5).length, uniq.length),
      note: 'the citation names exactly one held judgment — s@1 is meaningful here',
    },
    AMBIGUOUS_CITATION_CANDIDATE_COVERAGE: {
      n: amb.length,
      goldReachable: pct(amb.filter((r) => r.goldReachable).length, amb.length),
      arbitraryRankOne: pct(amb.filter((r) => r.rank === 1).length, amb.length),
      falsePins: amb.filter((r) => r.falsePin).length,
      maxHeldWithOneCitation: amb.reduce((m, r) => Math.max(m, r.heldWithThisCitation), 0),
      note: 'correct behaviour is every legitimate candidate reachable and no single-answer claim; rank 1 here is luck, not quality',
    },
    pooledForComparison: {
      successAt1: pct(rows.filter((r) => r.rank === 1).length, rows.length),
      note: 'the number previously reported as the gate result — retained only so the two can be compared',
    },
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify(
      {
        UNIQUE_CITATION_EXACTNESS: summary.UNIQUE_CITATION_EXACTNESS,
        AMBIGUOUS_CITATION_CANDIDATE_COVERAGE: summary.AMBIGUOUS_CITATION_CANDIDATE_COVERAGE,
        pooled: summary.pooledForComparison,
      },
      null,
      2,
    )}\nWROTE ${OUT.pathname}\n`,
  );
  await sql.end();
}

await main();
