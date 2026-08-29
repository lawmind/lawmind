/**
 * Bounded freshness projection of the PUBLISHED upstream-parity observation.
 *
 * The HTTP request never scans judgments or parquet coverage. NEW2 performs the
 * expensive upstream walk once; LCC validates and publishes the result as one
 * coherent observation (`freshness-publication.ts`), and this module projects
 * that publication without changing its denominator or court/month assignments.
 *
 * It reads exactly ONE file. That is the point: this route used to open the
 * definition, the parity matrix and the measurement separately, which meant a
 * republish could hand a reader a new measurement against an old denominator —
 * and, in the R10 gate, meant the newest measurement simply never reached the
 * route at all. Projection is now downstream of publication, and there is no
 * path from here to a loose artifact.
 */
import type { Sql } from 'postgres';

import { PROJECTED_SOURCE, readPublishedObservation } from './freshness-publication.ts';

export type CourtMonthFreshness = {
  court: string;
  month: string;
  upstreamRecords: number;
  upstreamCases: number;
  held: number;
  sourceUnavailableCount: number;
  retryExhaustedOurs: number;
  neverAttempted: number;
  upstreamLocalCompleteness: number;
  accountedUpstream: number;
};

export type FreshnessObject = {
  definitionVersion: string;
  definitionArtifactSha256: string;
  /** Which published observation this response came from. Additive, R10. */
  publicationGeneration: string;
  publishedAt: string;
  latestUpstreamDecisionDate: string | null;
  latestLocalDecisionDate: string | null;
  lastSuccessfulIngestAt: string | null;
  upstreamLocalCompleteness: number | null;
  sourceLagDays: number | null;
  sourceUnavailableCount: number;
  upstreamMeasuredAt: string;
  courtMonthDetail: CourtMonthFreshness[];
};

type New2CourtMonth = Omit<CourtMonthFreshness, 'sourceUnavailableCount'> & {
  sourceUnavailableCount?: number;
  unavailableSourceCount?: number;
};

type New2Source = {
  source?: unknown;
  latestUpstreamDecisionDate?: string | null;
  latestUpstreamMeasuredAt?: string;
  latestLocalDecisionDate?: string | null;
  lastSuccessfulIngestAt?: string | null;
  upstreamLocalCompleteness?: number | null;
  sourceLagDays?: number | null;
  sourceUnavailableCount?: number;
  unavailableSourceCount?: number;
  courtMonthDetail?: New2CourtMonth[];
};

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`NEW2 freshness artifact has invalid ${field}`);
  }
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requiredNumber(value, field);
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`NEW2 freshness artifact has invalid ${field}`);
  }
  return value;
}

function sourceUnavailable(source: New2Source | New2CourtMonth, field: string): number {
  // The first name is the frozen R10 contract. The second keeps the reader
  // compatible with the immediately preceding NEW2 artifact during rollout.
  return requiredNumber(source.sourceUnavailableCount ?? source.unavailableSourceCount, field);
}

/**
 * `sql` remains in the signature so the route wiring is stable. It is
 * deliberately unused: a request-time corpus scan would violate this contract.
 */
export async function buildFreshnessObject(
  _sql: Sql,
  paths: { observation?: string } = {},
): Promise<FreshnessObject> {
  const published = await readPublishedObservation(paths.observation);
  const measurement = published.body.measurement as { sources?: New2Source[] };

  const source = measurement.sources?.find((candidate) => candidate.source === PROJECTED_SOURCE);
  if (!source) throw new Error(`NEW2 freshness artifact has no ${PROJECTED_SOURCE} source`);
  if (!Array.isArray(source.courtMonthDetail)) {
    throw new Error('NEW2 freshness artifact has no courtMonthDetail');
  }

  const courtMonthDetail = source.courtMonthDetail.map((cell, index) => ({
    court: nullableString(cell.court, `courtMonthDetail[${index}].court`)!,
    month: nullableString(cell.month, `courtMonthDetail[${index}].month`)!,
    upstreamRecords: requiredNumber(
      cell.upstreamRecords,
      `courtMonthDetail[${index}].upstreamRecords`,
    ),
    upstreamCases: requiredNumber(cell.upstreamCases, `courtMonthDetail[${index}].upstreamCases`),
    held: requiredNumber(cell.held, `courtMonthDetail[${index}].held`),
    sourceUnavailableCount: sourceUnavailable(
      cell,
      `courtMonthDetail[${index}].sourceUnavailableCount`,
    ),
    retryExhaustedOurs: requiredNumber(
      cell.retryExhaustedOurs,
      `courtMonthDetail[${index}].retryExhaustedOurs`,
    ),
    neverAttempted: requiredNumber(
      cell.neverAttempted,
      `courtMonthDetail[${index}].neverAttempted`,
    ),
    upstreamLocalCompleteness: requiredNumber(
      cell.upstreamLocalCompleteness,
      `courtMonthDetail[${index}].upstreamLocalCompleteness`,
    ),
    accountedUpstream: requiredNumber(
      cell.accountedUpstream,
      `courtMonthDetail[${index}].accountedUpstream`,
    ),
  }));

  return {
    definitionVersion: published.definitionVersion,
    definitionArtifactSha256: published.definitionSha256,
    publicationGeneration: published.generation,
    publishedAt: published.publishedAt,
    latestUpstreamDecisionDate: nullableString(
      source.latestUpstreamDecisionDate,
      'latestUpstreamDecisionDate',
    ),
    latestLocalDecisionDate: nullableString(
      source.latestLocalDecisionDate,
      'latestLocalDecisionDate',
    ),
    lastSuccessfulIngestAt: nullableString(source.lastSuccessfulIngestAt, 'lastSuccessfulIngestAt'),
    upstreamLocalCompleteness: nullableNumber(
      source.upstreamLocalCompleteness,
      'upstreamLocalCompleteness',
    ),
    sourceLagDays: nullableNumber(source.sourceLagDays, 'sourceLagDays'),
    sourceUnavailableCount: sourceUnavailable(source, 'sourceUnavailableCount'),
    upstreamMeasuredAt: nullableString(
      source.latestUpstreamMeasuredAt,
      'latestUpstreamMeasuredAt',
    )!,
    courtMonthDetail,
  };
}
