/**
 * The one gate every other benchmark in this project skipped: it calls the
 * RUNNING SERVICE over HTTP, not the repository and not the database.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE HAS TO EXIST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `structured-gate.ts` calls `runStructured` in-process, against whatever code
 * is checked out locally. That proves the CODE is correct; it proves nothing
 * about what is actually deployed. On 11 Aug 2026 the fix for exactly this
 * failure had been in `origin/main` for three days while the deployed service —
 * `sha 721c99a`, 8 Aug — kept serving it: `cite:"(9999) 99 SCC 999"`, a citation
 * that cannot exist, returned five real Supreme Court authorities with no
 * `parsed` field and nothing saying the query was not understood. Every gate
 * this project had ever run was green throughout.
 *
 * `docs/ai/tasks/001-p0-citation-query-safety.md` §The gate that was missing:
 * *"A gate that cannot observe production cannot block a production
 * regression."* This is that gate. It knows nothing about the database schema
 * or the query compiler — it only knows the HTTP contract `docs/CITATION_HARNESS.md`
 * §The mechanism requires: exact match → exact case, zero match → zero /
 * explicit not-found, and — the one thing that must NEVER happen — a citation
 * that fails to resolve must never fall through to semantic search and return a
 * plausible different case.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A PASS, STATED BEFORE ANY RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every case here sends a `cite:"..."` query, which `looksStructured` always
 * treats as structured — so the honest response is `matched`, `no_match`, or
 * (for a malformed query, not used here) `invalid`. Both `matched` and
 * `no_match` carry a `parsed` field; the forbidden semantic-fallback path does
 * not, because it never touches `answerStructured`'s success branches. Absence
 * of `parsed` on a `cite:` query is therefore itself diagnostic, not merely a
 * missing nicety — it is what a bypassed structured path looks like from
 * outside.
 */

export type ProbeExpectation = 'zero' | 'resolves';

export type ProbeCase = {
  readonly id: string;
  /** What this case is checking, printed on failure. */
  readonly description: string;
  readonly query: string;
  readonly expectation: ProbeExpectation;
  /**
   * Required when `expectation` is `'resolves'`. A returned result passes only
   * if this matches — checked against `caseTitle` rather than a judgment id, so
   * the probe survives a corpus re-ingest that mints new ids for the same case.
   */
  readonly titleIncludes?: string;
};

/**
 * The fixed adversarial set for this gate — exactly the two queries that were
 * probed against production and used to state the P0, per
 * `docs/ai/tasks/001-p0-citation-query-safety.md` §CURRENT STATE. Not a sample:
 * these specific citations are the reproduction case, so this is the minimum
 * set that proves the regression is caught, and the set this task was scoped
 * to. Extending it is a future task, not this one.
 */
export const PROBE_CASES: readonly ProbeCase[] = [
  {
    id: 'nonexistent-citation',
    description: 'a citation that cannot exist must never return a plausible result',
    query: 'cite:"(9999) 99 SCC 999"',
    expectation: 'zero',
  },
  {
    id: 'bommai-exact',
    description: 'S.R. Bommai must resolve to itself, or an explicit not-found — never a different case',
    query: 'cite:"(1994) 3 SCC 1"',
    expectation: 'resolves',
    titleIncludes: 'BOMMAI',
  },
];

type SearchResultRow = {
  readonly caseTitle?: unknown;
};

type SearchEnvelope =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export type ProbeCaseResult = {
  readonly id: string;
  readonly query: string;
  readonly passed: boolean;
  readonly reason: string;
  readonly httpStatus: number | null;
  readonly resultCount: number | null;
  readonly parsedPresent: boolean | null;
};

export type ProbeReport = {
  readonly baseUrl: string;
  readonly ranAt: string;
  readonly cases: readonly ProbeCaseResult[];
  readonly passed: boolean;
};

async function callSearch(
  fetchImpl: typeof fetch,
  baseUrl: string,
  query: string,
): Promise<{ status: number; body: SearchEnvelope | null; parseError?: string }> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, language: 'en' }),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as SearchEnvelope };
  } catch {
    return { status: res.status, body: null, parseError: text.slice(0, 200) };
  }
}

/**
 * Run one case and grade it. Never throws — a network failure is a FAILED
 * case, not an unhandled rejection that takes the whole probe down and reports
 * nothing.
 */
async function runCase(fetchImpl: typeof fetch, baseUrl: string, c: ProbeCase): Promise<ProbeCaseResult> {
  let status: number;
  let body: SearchEnvelope | null;
  try {
    const res = await callSearch(fetchImpl, baseUrl, c.query);
    status = res.status;
    body = res.body;
    if (!body) {
      return {
        id: c.id,
        query: c.query,
        passed: false,
        reason: `response body was not valid JSON: ${res.parseError ?? '(empty)'}`,
        httpStatus: status,
        resultCount: null,
        parsedPresent: null,
      };
    }
  } catch (error) {
    return {
      id: c.id,
      query: c.query,
      passed: false,
      reason: `request failed: ${(error as Error).message}`,
      httpStatus: null,
      resultCount: null,
      parsedPresent: null,
    };
  }

  if (!body.ok) {
    return {
      id: c.id,
      query: c.query,
      passed: false,
      reason: `server returned an error envelope: ${body.error.code} — ${body.error.message}`,
      httpStatus: status,
      resultCount: null,
      parsedPresent: null,
    };
  }

  const parsed = body.data['parsed'];
  const parsedPresent = typeof parsed === 'string';
  const results = Array.isArray(body.data['results']) ? (body.data['results'] as SearchResultRow[]) : null;

  if (!parsedPresent) {
    return {
      id: c.id,
      query: c.query,
      passed: false,
      reason:
        'no `parsed` field on a cite: query — this is the forbidden signature: ' +
        'exact citation failure fell through to semantic search',
      httpStatus: status,
      resultCount: results?.length ?? null,
      parsedPresent: false,
    };
  }

  if (results === null) {
    return {
      id: c.id,
      query: c.query,
      passed: false,
      reason: '`results` was missing or not an array',
      httpStatus: status,
      resultCount: null,
      parsedPresent: true,
    };
  }

  if (c.expectation === 'zero') {
    if (results.length === 0) {
      return {
        id: c.id,
        query: c.query,
        passed: true,
        reason: 'zero results, as required',
        httpStatus: status,
        resultCount: 0,
        parsedPresent: true,
      };
    }
    const titles = results.map((r) => String(r.caseTitle ?? '(no title)')).join(' · ');
    return {
      id: c.id,
      query: c.query,
      passed: false,
      reason: `returned ${results.length} result(s) for a citation that cannot exist — ${titles}`,
      httpStatus: status,
      resultCount: results.length,
      parsedPresent: true,
    };
  }

  // expectation === 'resolves'
  if (results.length === 0) {
    return {
      id: c.id,
      query: c.query,
      passed: true,
      reason: 'explicit not-found (zero results, parsed present) — an honest answer',
      httpStatus: status,
      resultCount: 0,
      parsedPresent: true,
    };
  }
  const wrong = results.filter(
    (r) => !String(r.caseTitle ?? '').toUpperCase().includes((c.titleIncludes ?? '').toUpperCase()),
  );
  if (wrong.length > 0) {
    const titles = wrong.map((r) => String(r.caseTitle ?? '(no title)')).join(' · ');
    return {
      id: c.id,
      query: c.query,
      passed: false,
      reason: `returned a different case than the one asked for — ${titles}`,
      httpStatus: status,
      resultCount: results.length,
      parsedPresent: true,
    };
  }
  return {
    id: c.id,
    query: c.query,
    passed: true,
    reason: `resolved to the correct case (${results.length} row(s), all matching "${c.titleIncludes}")`,
    httpStatus: status,
    resultCount: results.length,
    parsedPresent: true,
  };
}

/**
 * Run the whole adversarial set against one base URL.
 *
 * **Defaults to production**, per `docs/ai/tasks/001-p0-citation-query-safety.md`
 * §IMPLEMENTATION STEPS 3: the failure this gate exists to catch is a
 * deployment regression, and the repository is never the thing that regressed.
 */
export async function runDeployedSafetyProbe(
  baseUrl: string,
  cases: readonly ProbeCase[] = PROBE_CASES,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ProbeReport> {
  const results: ProbeCaseResult[] = [];
  for (const c of cases) {
    results.push(await runCase(fetchImpl, baseUrl, c));
  }
  return {
    baseUrl,
    ranAt: new Date().toISOString(),
    cases: results,
    passed: results.every((r) => r.passed),
  };
}
