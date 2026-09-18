/**
 * `pnpm --filter @lawmind/harness advocate100` — P9. Execute NEW2's
 * primary-source-bound gold against the real search path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SET AND NOT THE ONE THIS LANE ALREADY HAD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every semantic number NEW1 has published this round is CONDITIONAL_RECALL on a
 * gold whose queries are verbatim substrings of their own targets
 * (`QUERY_NOT_IN_GOLD = 0`, measured). That gold cannot answer "does an advocate
 * find the right authority", and `DENSE_FAILURE_ANALYSIS.md` says so at length.
 *
 * ADVOCATE-100 (`docs/ai/new2/ADVOCATE100.json`, bus 1028) is the set that can:
 * 100 tasks bound to 281 held judgments, 42 proposition families, a measured
 * leakage guard, and 27 tasks whose CORRECT answer is a refusal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO SCORES, KEPT APART ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ENGINEERING          did the bound target come back, and where
 *   TASK_COMPLETION      did the product BEHAVE correctly for this task's
 *                        expectation — which for 27 of them means NOT answering
 *
 * Pooling them would let 46 `RESOLVE_UNIQUE` tasks carry 5 `REFUSE_FALSE_PREMISE`
 * ones, and the whole point of the refusal tasks is that a system which answers
 * everything scores well on retrieval and badly on law.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS CANNOT GRADE, STATED BEFORE ANY NUMBER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `/search` returns AUTHORITIES, not an answer. So:
 *
 *   - "the proposition is not mischaracterised" is UNGRADEABLE here — there is
 *     no generated answer to characterise anything.
 *   - currentness WORDING is ungradeable for the same reason; what IS gradeable
 *     is whether the fields the wording must be built from came back correctly
 *     (`overruledStatus` live, `bodyTextSafe`, `ambiguous`).
 *   - a REFUSAL task can only be graded on what search did: whether it returned
 *     an authority at all, and whether that authority is one the task says does
 *     not exist. A product-level refusal lives in the answer surface, not here.
 *
 * Those are recorded as `UNGRADEABLE_BY_SEARCH` per task rather than scored as
 * passes. A benchmark that quietly grades what it cannot see is worse than one
 * that scores lower.
 *
 * The six `CURRENTLY_UNSUPPORTED` long-input tasks ARE gradeable, and they are
 * the sharpest thing in the set: the correct behaviour is an honest refusal, and
 * a silent truncation to 500 characters is a failure. This measures which one
 * happens.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { createApp } from '@lawmind/api/app';
import { toVectorLiteral } from '@lawmind/embed';
// GPU sidecar, not the in-process CPU embedder. See harness-embedder.ts: the CPU
// default is right for production and was silently starving the Tier-A walk here.
import { getHarnessEmbedder } from './harness-embedder.ts';
import postgres from 'postgres';

import { sslFor } from './db-url.js';

const GOLD = new URL('../../../docs/ai/new2/ADVOCATE100.json', import.meta.url);
const OUT = new URL('../../../docs/ai/new1-tier-a/advocate100-results.json', import.meta.url);
const CKPT = new URL(
  '../../../docs/ai/new1-tier-a/advocate100-results.checkpoint.jsonl',
  import.meta.url,
);
/** Production's own input cap, from `searchRequest`. */
const PRODUCTION_QUERY_MAX_CHARS = 500;
const EMBED_TIMEOUT_MS = Number(process.env['EMBED_TIMEOUT_MS'] ?? 5_000);
const PAGE_SIZE = Number(process.env['PAGE_SIZE'] ?? 20);

type Task = {
  task_id: string;
  query_class: string;
  query: string;
  targets: string[];
  expected: string;
  proposition_family: string;
  targets_bound: { judgment_id: string; overruled_status: string | null }[];
};

type Row = {
  taskId: string;
  queryClass: string;
  family: string;
  expected: string;
  queryChars: number;
  httpStatus: number;
  ms: number;
  returned: number;
  targetsBound: number;
  targetsReturned: number;
  bestRank: number | null;
  topHitIsTarget: boolean;
  ambiguous: boolean | null;
  exactTitleCandidates: number | null;
  overruledRendered: string[];
  degraded: string[];
  engineering: string;
  taskCompletion: string;
  note: string;
};

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    tasks: Task[];
    gold_set_version?: string;
  };
  const tasks = gold.tasks;

  const sql = postgres(url, {
    max: 4,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 25_000 },
  });
  const embedder = (await getHarnessEmbedder()).embedder;
  /** Same budget shape production uses: a bound, and lexical-only rather than a hang. */
  const embedQuery = async (text: string): Promise<string | null> => {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS);
    });
    try {
      const run = (async (): Promise<string | null> => {
        const [e] = await embedder.embed([text]);
        return e === undefined ? null : toVectorLiteral(e.vector);
      })();
      return await Promise.race([run, budget]);
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const app = createApp({
    ping: async () => void (await sql`SELECT 1`),
    search: { sql, embedQuery },
  });
  await embedQuery('warm');

  const done = new Set<string>();
  const rows: Row[] = [];
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const r = JSON.parse(line) as Row;
        done.add(r.taskId);
        rows.push(r);
      } catch {
        /* torn line */
      }
    }
  }

  for (const [i, t] of tasks.entries()) {
    if (done.has(t.task_id)) continue;
    const targets = new Set(t.targets ?? []);
    const overruledExpected = new Map(
      (t.targets_bound ?? []).map((b) => [b.judgment_id, b.overruled_status ?? 'none']),
    );
    const tooLong = t.query.length > PRODUCTION_QUERY_MAX_CHARS;

    const t0 = Date.now();
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: t.query, language: 'en', pageSize: PAGE_SIZE }),
    });
    const ms = Date.now() - t0;
    const body = (await res.json()) as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      data?: {
        results?: {
          judgmentId?: string;
          overruledStatus?: string;
          verificationState?: string;
          bodyTextSafe?: boolean;
        }[];
        degraded?: string[];
        ambiguous?: boolean;
        exactTitleCandidates?: number;
      };
    };
    const results = body.data?.results ?? [];
    const ids = results.map((r) => r.judgmentId ?? '');
    const hitIdx = ids.findIndex((id) => targets.has(id));

    const row: Row = {
      taskId: t.task_id,
      queryClass: t.query_class,
      family: t.proposition_family,
      expected: t.expected,
      queryChars: t.query.length,
      httpStatus: res.status,
      ms,
      returned: results.length,
      targetsBound: targets.size,
      targetsReturned: ids.filter((id) => targets.has(id)).length,
      bestRank: hitIdx === -1 ? null : hitIdx + 1,
      topHitIsTarget: ids.length > 0 && targets.has(ids[0] ?? ''),
      ambiguous: body.data?.ambiguous ?? null,
      exactTitleCandidates: body.data?.exactTitleCandidates ?? null,
      overruledRendered: results
        .filter((r) => targets.has(r.judgmentId ?? ''))
        .map((r) => r.overruledStatus ?? 'none'),
      degraded: body.data?.degraded ?? [],
      engineering: 'PENDING',
      taskCompletion: 'PENDING',
      note: '',
    };

    // ── ENGINEERING: did the bound target come back, and where ──────────────
    row.engineering =
      targets.size === 0
        ? 'NO_BOUND_TARGET'
        : res.status !== 200
          ? `HTTP_${res.status}`
          : row.bestRank === 1
            ? 'TARGET_AT_1'
            : row.bestRank !== null && row.bestRank <= 5
              ? 'TARGET_IN_5'
              : row.bestRank !== null
                ? 'TARGET_IN_PAGE'
                : 'TARGET_MISSED';

    // ── TASK_COMPLETION: did the product behave as this task requires ───────
    if (tooLong) {
      // The one class where a refusal is the pass and silence is the failure.
      row.taskCompletion =
        res.status === 400 && (body.error?.message ?? '').length > 0
          ? 'REFUSED_HONESTLY'
          : res.status === 200
            ? 'ANSWERED_A_QUERY_IT_CANNOT_SUPPORT'
            : `UNEXPECTED_HTTP_${res.status}`;
      row.note = `${t.query.length} chars against a ${PRODUCTION_QUERY_MAX_CHARS}-char cap; ${body.error?.code ?? 'no error code'}`;
    } else if (t.expected.startsWith('REFUSE') || t.expected.startsWith('REJECT')) {
      // Search cannot refuse; it can only fail to assert. What is gradeable is
      // whether it asserted an authority the task says is not the answer.
      row.taskCompletion = res.status !== 200 ? `HTTP_${res.status}` : 'UNGRADEABLE_BY_SEARCH';
      row.note =
        results.length === 0
          ? 'search returned nothing'
          : `search returned ${results.length} authorities`;
    } else if (t.expected === 'RESOLVE_TO_DISPOSAL_EVENT') {
      row.taskCompletion =
        row.targetsReturned === 0
          ? 'DISPOSAL_EVENT_MISSED'
          : row.ambiguous === true || row.exactTitleCandidates !== null
            ? 'DISPOSAL_EVENT_SIGNALLED'
            : 'ANSWERED_WITHOUT_SAYING_IT_IS_MANY';
      row.note = `${row.targetsReturned}/${row.targetsBound} of the event's judgments on page 1`;
    } else if (t.expected === 'RESOLVE_AND_MARK_LAW_MOVED') {
      const anyMoved = row.overruledRendered.some((s) => s !== 'none');
      const shouldMove = [...overruledExpected.values()].some((s) => s !== 'none' && s !== null);
      row.taskCompletion =
        row.bestRank === null
          ? 'TARGET_MISSED'
          : anyMoved
            ? 'LAW_MOVED_RENDERED'
            : shouldMove
              ? 'LAW_MOVED_NOT_RENDERED'
              : 'NO_TREATMENT_TO_RENDER';
    } else if (t.expected.startsWith('RESOLVE')) {
      row.taskCompletion =
        row.bestRank === null
          ? 'TARGET_MISSED'
          : row.bestRank === 1
            ? 'RESOLVED_AT_1'
            : 'RESOLVED_BELOW_1';
    } else {
      row.taskCompletion = 'UNGRADEABLE_BY_SEARCH';
      row.note = t.expected;
    }

    appendFileSync(CKPT, `${JSON.stringify(row)}\n`);
    rows.push(row);
    process.stdout.write(
      `${String(i + 1).padStart(3)}/${tasks.length} ${row.taskId} ${row.queryClass.padEnd(22)} ${row.engineering.padEnd(16)} ${row.taskCompletion.padEnd(30)} ${row.ms}ms\n`,
    );
  }

  // ── Summary, grouped by proposition family: one family is ONE observation ─
  const families = new Map<string, Row[]>();
  for (const r of rows) {
    const list = families.get(r.family);
    if (list) list.push(r);
    else families.set(r.family, [r]);
  }
  const familyResolved = [...families.values()].filter((rs) =>
    rs.some((r) => r.engineering === 'TARGET_AT_1' || r.engineering === 'TARGET_IN_5'),
  ).length;

  const count = <T extends string>(pick: (r: Row) => T): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const r of rows) m[pick(r)] = (m[pick(r)] ?? 0) + 1;
    return m;
  };
  const gradeable = rows.filter((r) => r.taskCompletion !== 'UNGRADEABLE_BY_SEARCH');
  const lat = rows.map((r) => r.ms).sort((a, b) => a - b);

  const summary = {
    kind: 'new1_advocate100_execution',
    measuredAt: new Date().toISOString(),
    goldSetVersion: gold.gold_set_version ?? null,
    conditions: 'LOCAL_CONTENDED — the Tier-A walk was staging throughout',
    tasks: rows.length,
    propositionFamilies: families.size,
    familiesWithTargetInTop5: familyResolved,
    ENGINEERING: count((r) => r.engineering),
    TASK_COMPLETION: count((r) => r.taskCompletion),
    byClass: Object.fromEntries(
      [...new Set(rows.map((r) => r.queryClass))].sort().map((c) => {
        const rs = rows.filter((r) => r.queryClass === c);
        return [
          c,
          {
            n: rs.length,
            targetAt1: rs.filter((r) => r.engineering === 'TARGET_AT_1').length,
            targetInTop5: rs.filter(
              (r) => r.engineering === 'TARGET_AT_1' || r.engineering === 'TARGET_IN_5',
            ).length,
            missed: rs.filter((r) => r.engineering === 'TARGET_MISSED').length,
          },
        ];
      }),
    ),
    gradeableTasks: gradeable.length,
    ungradeableBySearch: rows.length - gradeable.length,
    latencyMs: {
      p50: lat[Math.floor(lat.length * 0.5)] ?? null,
      p95: lat[Math.floor(lat.length * 0.95)] ?? null,
      max: lat[lat.length - 1] ?? null,
    },
    caveats: [
      'ENGINEERING and TASK_COMPLETION are never pooled: 27 tasks expect a refusal, and a system that answers everything scores well on the first and badly on the second.',
      '/search returns authorities, not an answer — proposition characterisation and currentness WORDING are UNGRADEABLE here and are counted as such, never as passes.',
      'One proposition family is ONE observation; paraphrases within a family are not independent.',
      'LOCAL_CONTENDED, single run, no confidence intervals claimed.',
    ],
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `\n${JSON.stringify(
      {
        ENGINEERING: summary.ENGINEERING,
        TASK_COMPLETION: summary.TASK_COMPLETION,
        families: `${familyResolved}/${families.size}`,
        latencyMs: summary.latencyMs,
      },
      null,
      2,
    )}\n`,
  );
  await sql.end();
  process.exit(0);
}

await main();
