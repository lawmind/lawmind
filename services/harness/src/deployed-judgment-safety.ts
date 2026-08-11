/**
 * Live production probe for `GET /judgments/:id` — REB §1.6's "citationless-
 * judgment live probe" and "wrong-metadata citation" probe, the two entries
 * `docs/ai/V2_RECONCILIATION.md` listed as missing alongside `deployed-
 * safety.ts`'s `/search` cases.
 *
 * `deployed-safety.ts` covers `/search`; this covers the judgment-detail read
 * path, which has its own two citation-safety failure modes:
 *
 *   1. A judgment with NO citation of any kind must round-trip null/empty —
 *      never a fabricated citation string. `docs/CITATION_HARNESS.md` §The
 *      fourth concern.
 *   2. An overruled judgment's `overruledStatus` must be exactly what is
 *      stored — never `none` served for a `set_aside` row. `docs/
 *      CITATION_HARNESS.md` §Overruled status is never cached.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE NEEDS A DATABASE CONNECTION AND `deployed-safety.ts` DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A citation string is content-addressable — `cite:"(1994) 3 SCC 1"` is the
 * same fixed literal forever, so `deployed-safety.ts` never needs to look
 * anything up. A judgment id is not: it is minted per row and would change
 * across a corpus re-ingest, so there is no fixed literal id that survives
 * one the way a citation string does. The database connection here is used
 * ONLY to pick a live target that has the property being tested ("some row
 * with a null citation exists", "some row is overruled") — it never
 * participates in grading. Every assertion below is graded purely against
 * what the HTTP call actually returned, exactly like `deployed-safety.ts`.
 */
import type { Sql } from 'postgres';

export type JudgmentProbeCaseResult = {
  readonly id: string;
  readonly passed: boolean;
  readonly reason: string;
  readonly httpStatus: number | null;
};

export type JudgmentProbeReport = {
  readonly baseUrl: string;
  readonly ranAt: string;
  readonly cases: readonly JudgmentProbeCaseResult[];
  readonly passed: boolean;
};

async function getJudgment(
  fetchImpl: typeof fetch,
  baseUrl: string,
  judgmentId: string,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/judgments/${judgmentId}`);
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { status: res.status, body: null };
  }
}

/**
 * No target row is a PASS, not a skip that hides as green — a corpus with
 * zero citationless judgments genuinely has nothing to probe here, and that
 * is different from the probe never having run. Distinguished in the reason
 * string so a report reader can tell the two apart.
 */
async function probeCitationless(
  fetchImpl: typeof fetch,
  baseUrl: string,
  sql: Sql,
): Promise<JudgmentProbeCaseResult> {
  const caseId = 'citationless-judgment';
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM judgments
     WHERE neutral_citation IS NULL AND array_length(reporter_citations, 1) IS NULL
     LIMIT 1`;
  if (!row) {
    return {
      id: caseId,
      passed: true,
      reason: 'no citationless judgment in this corpus — nothing to probe',
      httpStatus: null,
    };
  }

  const { status, body } = await getJudgment(fetchImpl, baseUrl, row.id);
  if (status !== 200 || !body || body['ok'] !== true) {
    return {
      id: caseId,
      passed: false,
      reason: `expected 200/ok for a real judgment id, got status ${status}`,
      httpStatus: status,
    };
  }

  const data = body['data'] as Record<string, unknown> | undefined;
  const neutralCitation = data?.['neutralCitation'];
  const reporterCitations = data?.['reporterCitations'];

  if (neutralCitation !== null) {
    return {
      id: caseId,
      passed: false,
      reason: `neutralCitation was "${String(neutralCitation)}", expected null — a citation was fabricated for a judgment that has none`,
      httpStatus: status,
    };
  }
  if (!Array.isArray(reporterCitations) || reporterCitations.length !== 0) {
    return {
      id: caseId,
      passed: false,
      reason: `reporterCitations was ${JSON.stringify(reporterCitations)}, expected []`,
      httpStatus: status,
    };
  }
  return {
    id: caseId,
    passed: true,
    reason: 'citation fields round-tripped null/empty, exactly as stored',
    httpStatus: status,
  };
}

async function probeOverruledMetadata(
  fetchImpl: typeof fetch,
  baseUrl: string,
  sql: Sql,
): Promise<JudgmentProbeCaseResult> {
  const caseId = 'overruled-metadata';
  const [row] = await sql<{ id: string; overruled_status: string }[]>`
    SELECT id, overruled_status FROM judgments WHERE overruled_status != 'none' LIMIT 1`;
  if (!row) {
    return {
      id: caseId,
      passed: true,
      reason: 'no overruled judgment in this corpus — nothing to probe',
      httpStatus: null,
    };
  }

  const { status, body } = await getJudgment(fetchImpl, baseUrl, row.id);
  if (status !== 200 || !body || body['ok'] !== true) {
    return {
      id: caseId,
      passed: false,
      reason: `expected 200/ok for a real judgment id, got status ${status}`,
      httpStatus: status,
    };
  }

  const data = body['data'] as Record<string, unknown> | undefined;
  const overruledStatus = data?.['overruledStatus'];
  if (overruledStatus !== row.overruled_status) {
    return {
      id: caseId,
      passed: false,
      reason: `overruledStatus was "${String(overruledStatus)}", the stored value is "${row.overruled_status}" — the live surface is not showing the true status`,
      httpStatus: status,
    };
  }
  return {
    id: caseId,
    passed: true,
    reason: `overruledStatus "${row.overruled_status}" matches the stored value exactly`,
    httpStatus: status,
  };
}

export async function runDeployedJudgmentSafetyProbe(
  baseUrl: string,
  sql: Sql,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<JudgmentProbeReport> {
  const cases: JudgmentProbeCaseResult[] = [
    await probeCitationless(fetchImpl, baseUrl, sql),
    await probeOverruledMetadata(fetchImpl, baseUrl, sql),
  ];
  return {
    baseUrl,
    ranAt: new Date().toISOString(),
    cases,
    passed: cases.every((c) => c.passed),
  };
}
