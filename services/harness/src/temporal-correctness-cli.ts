/**
 * NEW1 — P11. TEMPORAL CORRECTNESS: can a future authority leak into a
 * historical-law answer?
 *
 *   pnpm --filter @lawmind/harness safety:temporal
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A RETRIEVAL PROPERTY AND NOT A NICETY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An advocate asking "what was the law as of March 2019" is asking a question
 * whose WRONG answer looks exactly like a right one. A 2023 judgment answering a
 * 2019 question is fluent, relevant, well-ranked, and useless — worse than
 * useless, because it will be relied on. Unlike a miss, this failure is invisible
 * to the person it harms.
 *
 * So retrieval quality includes temporal correctness, and it is measured here as
 * a hard property rather than an impression:
 *
 *   DATE_BOUND_RESPECTED   a request carrying `dateTo` must return NOTHING
 *                          decided after it. Threshold ZERO violations — this is
 *                          a filter, and a filter that leaks is broken, not
 *                          imprecise.
 *   DATE_SUSPECT_SURFACED  a returned judgment whose own date NEW2 marked
 *                          DATE_SUSPECT or DATE_UNKNOWN must not be presented as
 *                          if its date were known. A date filter applied to an
 *                          unreliable date is a confident wrong answer built on
 *                          an admitted unknown.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DELIBERATELY DOES NOT CLAIM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does NOT test "is this still good law". That is `overruled_status`, it is
 * never cached, it is read live at render, and it is a different system with
 * different evidence. A citation edge is not a treatment; a date bound is not a
 * currentness check. Conflating them is how a resolver's coverage gets reported
 * as currentness coverage, which is forbidden.
 *
 * It also does not test the WORDING of a currentness answer. `/search` returns
 * authorities, not answers, so "did it say the law had moved" is UNGRADEABLE
 * here and is not scored.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { toVectorLiteral } from '@lawmind/embed';

import { createApp } from '@lawmind/api/app';
import { getHarnessEmbedder } from './harness-embedder.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/temporal-correctness.json');

const STATEMENT_MS = 15_000;
const PER_QUERY_MS = 30_000;

/**
 * Queries that carry a real temporal intent, paired with the bound an advocate
 * means by them. Deliberately ordinary legal language, not synthetic filter
 * tests: the question is whether the PRODUCT honours the bound, not whether SQL
 * honours a WHERE clause.
 */
const PROBES: { id: string; query: string; dateTo?: string; dateFrom?: string; intent: string }[] =
  [
    {
      id: 'T-01',
      query: 'anticipatory bail conditions',
      dateTo: '2019-03-31',
      intent: 'law as of March 2019',
    },
    {
      id: 'T-02',
      query: 'dying declaration corroboration',
      dateTo: '2015-12-31',
      intent: 'law as of end 2015',
    },
    {
      id: 'T-03',
      query: 'cheque dishonour statutory notice',
      dateTo: '2010-01-01',
      intent: 'cases before 2010',
    },
    {
      id: 'T-04',
      query: 'quashing of criminal proceedings inherent powers',
      dateTo: '2020-06-30',
      intent: 'law as of mid-2020',
    },
    {
      id: 'T-05',
      query: 'default bail statutory period',
      dateTo: '2017-01-01',
      intent: 'cases before 2017',
    },
    {
      id: 'T-06',
      query: 'compassionate appointment policy',
      dateTo: '2012-12-31',
      intent: 'law as of 2012',
    },
    {
      id: 'T-07',
      query: 'anticipatory bail conditions',
      dateFrom: '2024-07-01',
      intent: 'post-BNSS only',
    },
    {
      id: 'T-08',
      query: 'dying declaration corroboration',
      dateFrom: '2024-07-01',
      intent: 'post-BSA only',
    },
  ];

type Result = {
  id: string;
  query: string;
  intent: string;
  dateFrom: string | null;
  dateTo: string | null;
  httpStatus: number;
  returned: number;
  /** Results decided AFTER dateTo (or BEFORE dateFrom). Threshold zero. */
  violations: { judgmentId: string; judgmentDate: string | null; caseTitle: string | null }[];
  /** Returned rows whose own date NEW2 could not verify. */
  unreliableDates: { judgmentId: string; dateState: string | null; judgmentDate: string | null }[];
  ms: number;
  timedOut: boolean;
  degraded: string[];
};

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const sql = postgres(url, {
    max: 3,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: STATEMENT_MS },
  });

  const embedQuery = async (text: string): Promise<string | null> => {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 2_000);
    });
    try {
      const embed = (async (): Promise<string | null> => {
        const embedder = (await getHarnessEmbedder()).embedder;
        const [embedded] = await embedder.embed([text]);
        return embedded ? toVectorLiteral(embedded.vector) : null;
      })();
      return await Promise.race([embed, budget]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const app = createApp({
    ping: async () => void (await sql`SELECT 1`),
    search: { sql, embedQuery },
  });
  await embedQuery('warm');

  /**
   * Does the corpus even record a date reliability state? If the column is not
   * there, that is REPORTED as unmeasured rather than silently scored as clean —
   * "we found no unreliable dates" and "we could not look" are different claims.
   */
  let hasDateState = false;
  try {
    const [c] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM information_schema.columns
      WHERE table_name = 'judgments' AND column_name = 'date_state'`;
    hasDateState = Number(c?.n ?? 0) > 0;
  } catch {
    // Left as its initial `false`. A column we could not ask about is not a
    // column we may treat as present.
  }
  console.log('TEMPORAL_CORRECTNESS');
  console.log(`  ${PROBES.length} probes · date_state column present: ${hasDateState}`);
  if (!hasDateState) {
    console.log('  DATE_SUSPECT_SURFACED is UNMEASURED — the column does not exist here.');
  }

  const results: Result[] = [];
  for (const p of PROBES) {
    const t = Date.now();
    let httpStatus = 0;
    let returned = 0;
    let degraded: string[] = [];
    let timedOut = false;
    let ids: string[] = [];

    const request = (async (): Promise<void> => {
      /**
       * `filters: { dateFrom, dateTo }` — NESTED, not top-level.
       *
       * The first version of this file sent them at the top level. Zod strips
       * unknown keys, so the request was accepted, the search ran COMPLETELY
       * UNFILTERED, and the probe duly found "violations" in five of eight
       * probes — a 2026 judgment answering a 2019 question, exactly the failure
       * this file was written to catch, and entirely my own instrument.
       *
       * It is recorded here rather than quietly corrected because a temporal
       * leak is a serious claim about a shipped product, and the difference
       * between "the filter leaks" and "I did not send the filter" is one line
       * of the request schema (`services/api/src/search/route.ts:167`).
       */
      const filters: Record<string, unknown> = {};
      if (p.dateTo) filters['dateTo'] = p.dateTo;
      if (p.dateFrom) filters['dateFrom'] = p.dateFrom;
      const body: Record<string, unknown> = { query: p.query, language: 'en' };
      if (Object.keys(filters).length > 0) body['filters'] = filters;
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      httpStatus = res.status;
      if (res.status !== 200) return;
      const json = (await res.json()) as {
        data?: { results?: Record<string, unknown>[]; degraded?: string[] };
      };
      const hits = json.data?.results ?? [];
      returned = hits.length;
      degraded = json.data?.degraded ?? [];
      ids = hits.map((h) => String(h['judgmentId'] ?? '')).filter(Boolean);
    })();

    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, PER_QUERY_MS);
    });
    try {
      await Promise.race([request, budget]);
    } catch {
      httpStatus = httpStatus || 500;
    } finally {
      if (timer) clearTimeout(timer);
    }

    /**
     * Violations are checked against the DATABASE ROW, never against whatever the
     * response happened to carry. A response that omits or mis-states the date
     * would otherwise mark itself compliant.
     */
    const violations: Result['violations'] = [];
    const unreliableDates: Result['unreliableDates'] = [];
    if (ids.length > 0) {
      const rows = hasDateState
        ? await sql<
            {
              id: string;
              judgment_date: string | null;
              case_title: string | null;
              date_state: string | null;
            }[]
          >`
            SELECT id, judgment_date::text AS judgment_date, case_title, date_state
            FROM judgments WHERE id = ANY(${ids}::uuid[])`
        : await sql<
            {
              id: string;
              judgment_date: string | null;
              case_title: string | null;
              date_state: string | null;
            }[]
          >`
            SELECT id, judgment_date::text AS judgment_date, case_title, NULL::text AS date_state
            FROM judgments WHERE id = ANY(${ids}::uuid[])`;
      for (const r of rows) {
        if (p.dateTo && r.judgment_date && r.judgment_date > p.dateTo) {
          violations.push({
            judgmentId: r.id,
            judgmentDate: r.judgment_date,
            caseTitle: r.case_title,
          });
        }
        if (p.dateFrom && r.judgment_date && r.judgment_date < p.dateFrom) {
          violations.push({
            judgmentId: r.id,
            judgmentDate: r.judgment_date,
            caseTitle: r.case_title,
          });
        }
        if (hasDateState && r.date_state && r.date_state !== 'DATE_VERIFIED') {
          unreliableDates.push({
            judgmentId: r.id,
            dateState: r.date_state,
            judgmentDate: r.judgment_date,
          });
        }
      }
    }

    results.push({
      id: p.id,
      query: p.query,
      intent: p.intent,
      dateFrom: p.dateFrom ?? null,
      dateTo: p.dateTo ?? null,
      httpStatus,
      returned,
      violations,
      unreliableDates,
      ms: Date.now() - t,
      timedOut,
      degraded,
    });
    console.log(
      `  ${p.id}  returned=${String(returned).padStart(2)}  violations=${violations.length}  ` +
        `unreliableDates=${unreliableDates.length}  ${Date.now() - t}ms${timedOut ? ' TIMEOUT' : ''}`,
    );
  }

  const totalViolations = results.reduce((a, r) => a + r.violations.length, 0);
  const totalUnreliable = results.reduce((a, r) => a + r.unreliableDates.length, 0);
  const scorable = results.filter((r) => r.returned > 0);

  console.log('');
  console.log(
    `DATE_BOUND_RESPECTED   ${totalViolations} violation(s) across ${scorable.length} probes that returned results.`,
  );
  console.log('  Threshold ZERO. A date filter that leaks is broken, not imprecise.');
  if (totalViolations > 0) {
    for (const r of results) {
      for (const v of r.violations) {
        console.log(
          `  ${r.id} bound ${r.dateTo ?? r.dateFrom} -> ${v.judgmentDate} ${String(v.caseTitle).slice(0, 60)}`,
        );
      }
    }
  }
  console.log(
    hasDateState
      ? `DATE_SUSPECT_SURFACED  ${totalUnreliable} returned judgment(s) carry a date NEW2 did not verify.`
      : 'DATE_SUSPECT_SURFACED  UNMEASURED — no date_state column on judgments here.',
  );
  const empty = results.filter((r) => r.returned === 0).length;
  if (empty > 0) {
    console.log(
      `\nNOTE: ${empty} of ${results.length} probes returned NOTHING. A zero-violation score over an empty`,
    );
    console.log(
      'page is not evidence that the filter works — it is evidence that nothing was tested.',
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_temporal_correctness',
        generatedAt: new Date().toISOString(),
        scope:
          'Date-bound retrieval only. This does NOT test good-law status: overruled_status is never cached, is read live at render, and is a different system with different evidence. A date bound is not a currentness check.',
        dateStateColumnPresent: hasDateState,
        probes: PROBES.length,
        probesReturningResults: scorable.length,
        probesReturningNothing: empty,
        dateBoundViolations: totalViolations,
        unreliableDatesSurfaced: hasDateState ? totalUnreliable : null,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  await sql.end({ timeout: 5 });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
