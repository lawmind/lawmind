/**
 * `pnpm --filter @lawmind/harness title:routing` — WHICH ARM answers a
 * case-name query, counted, before any ranking is discussed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ROUTING AND NOT RANKING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `title:decompose` measured the case-name PIN path and found it healthy on
 * unique titles (gold at probe rank 1 in 136 of 229). The launch benchmark
 * measured the whole request and found 67.69% s@1. Those two cannot both be
 * about the same code path, and the gap is decided BEFORE either ranker runs:
 * `/search` chooses an arm first.
 *
 * Three arms can answer, and only the third consults `exactCaseTitle`:
 *
 *   1. `answerStructured` — qlang. A query it can parse as a boolean/field
 *      expression is a FILTER and returns immediately (`route.ts` "STRUCTURE
 *      DECIDES, SEMANTICS FILLS"). Reproduced: `MATA DIN SINGH Vs D.D.C. AND
 *      OTHERS` parses as six ANDed containment terms, matches 10 judgments,
 *      returns 5 of them — and the judgment printed with EXACTLY that title is
 *      not among them. The exact-title pin never runs.
 *   2. `classifyQuery` → `shape: 'section'` — `SECTION_RE` runs BEFORE
 *      `CASE_NAME_RE`, so a title carrying the word "SECTION" followed by a
 *      number goes to the statute-reference lookup. Reproduced on
 *      `DR. MITHILESH KUMAR PANDEY … LEGISLATIVE SECTION 1 GOVT`.
 *   3. `shape: 'case_name'` → `caseNamePins` → the exact/trigram path that
 *      `title:decompose` measured.
 *
 * This counts, for the frozen gold's 229 case_title rows, which arm each query
 * actually reaches, and — for the ones the structured arm claims — whether the
 * gold authority is even among what it returns.
 *
 * Read-only. No embedding, no dense arm: routing is decided before either.
 */
import { writeFileSync } from 'node:fs';

import { classifyQuery } from '@lawmind/api/search/query-shape';
import { answerStructured } from '@lawmind/api/search/structured';
import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const RESULT_LIMIT = 5;
const OUT = new URL('../../../docs/ai/new1-tier-a/case-title-routing.json', import.meta.url);

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  const rows0 = gold.rows.filter((r) => r.launchClass === 'case_title');
  const sql = postgres(url, { max: 2, ssl: sslFor(url), onnotice: () => {}, connection: { statement_timeout: 30_000 } });

  const rows: {
    queryId: string;
    query: string;
    goldId: string;
    hasAnd: boolean;
    shape: string;
    structuredKind: string;
    structuredTotal: number | null;
    goldInStructuredPage: boolean | null;
    arm: string;
  }[] = [];

  for (const [i, g] of rows0.entries()) {
    const shape = classifyQuery(g.query).shape;
    let kind = 'error';
    let total: number | null = null;
    let goldIn: boolean | null = null;
    try {
      const s = (await answerStructured(sql, g.query, RESULT_LIMIT)) as {
        kind: string;
        total?: number;
        hits?: { judgmentId: string }[];
      };
      kind = s.kind;
      total = s.total ?? null;
      if (s.hits !== undefined) goldIn = s.hits.some((h) => h.judgmentId === g.goldAuthorityId);
    } catch {
      kind = 'threw';
    }
    // Which arm actually answers, per route.ts: structured wins outright when it
    // matches or is ambiguous; otherwise the shape decides the pin path.
    const arm =
      kind === 'matched' || kind === 'ambiguous'
        ? 'STRUCTURED'
        : kind === 'no_match'
          ? 'STRUCTURED_EMPTY'
          : shape === 'section'
            ? 'SECTION_LOOKUP'
            : shape === 'citation'
              ? 'CITATION_LOOKUP'
              : shape === 'case_name'
                ? 'CASE_NAME_PINS'
                : 'CONCEPT_ONLY';
    rows.push({
      queryId: g.queryId,
      query: g.query,
      goldId: g.goldAuthorityId,
      hasAnd: /\bAND\b/i.test(g.query),
      shape,
      structuredKind: kind,
      structuredTotal: total,
      goldInStructuredPage: goldIn,
      arm,
    });
    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${rows0.length}\n`);
  }

  const byArm: Record<string, number> = {};
  for (const r of rows) byArm[r.arm] = (byArm[r.arm] ?? 0) + 1;
  const hijacked = rows.filter((r) => r.arm === 'STRUCTURED');
  const summary = {
    kind: 'new1_case_title_routing',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    queries: rows.length,
    byArm,
    queriesContainingAnd: rows.filter((r) => r.hasAnd).length,
    structuredHijack: {
      n: hijacked.length,
      goldOnTheStructuredPage: hijacked.filter((r) => r.goldInStructuredPage === true).length,
      goldMissing: hijacked.filter((r) => r.goldInStructuredPage === false).length,
    },
    sectionHijack: rows.filter((r) => r.arm === 'SECTION_LOOKUP').length,
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `\n${JSON.stringify({ byArm, structuredHijack: summary.structuredHijack, sectionHijack: summary.sectionHijack }, null, 2)}\nWROTE ${OUT.pathname}\n`,
  );
  await sql.end();
}

await main();
