/**
 * Bounded freshness projection of NEW2's versioned upstream-parity artifact.
 *
 * The HTTP request never scans judgments or parquet coverage. NEW2 performs the
 * expensive upstream walk once and publishes a source-scale artifact; LCC
 * verifies the definition version and projects that measurement without
 * changing its denominator or court/month assignments.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Sql } from 'postgres';

const DEFINITION_PATH = fileURLToPath(
  new URL('../../../../docs/ai/new2-r10/hc-parity-definition-v2.json', import.meta.url),
);
const MEASUREMENT_PATH = fileURLToPath(
  new URL('../../../../docs/ai/new2-r10/source-freshness.json', import.meta.url),
);
const PARITY_PATH = fileURLToPath(
  new URL('../../../../docs/ai/new2-r10/parity-matrix.json', import.meta.url),
);

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
  latestUpstreamDecisionDate: string | null;
  latestLocalDecisionDate: string | null;
  lastSuccessfulIngestAt: string | null;
  upstreamLocalCompleteness: number | null;
  sourceLagDays: number | null;
  sourceUnavailableCount: number;
  upstreamMeasuredAt: string;
  courtMonthDetail: CourtMonthFreshness[];
};

type DefinitionArtifact = {
  definitionVersion?: unknown;
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

type New2Measurement = {
  definitionVersion?: unknown;
  contract?: { definitionVersion?: unknown };
  sources?: New2Source[];
};

type New2Parity = {
  definitionVersion?: unknown;
  definitionSha256?: unknown;
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
  paths: { definition?: string; measurement?: string; parity?: string } = {},
): Promise<FreshnessObject> {
  const [definitionBytes, measurementBytes, parityBytes] = await Promise.all([
    readFile(paths.definition ?? DEFINITION_PATH),
    readFile(paths.measurement ?? MEASUREMENT_PATH),
    readFile(paths.parity ?? PARITY_PATH),
  ]);

  const definition = JSON.parse(definitionBytes.toString('utf8')) as DefinitionArtifact;
  const measurement = JSON.parse(measurementBytes.toString('utf8')) as New2Measurement;
  const parity = JSON.parse(parityBytes.toString('utf8')) as New2Parity;
  if (
    typeof definition.definitionVersion !== 'string' ||
    definition.definitionVersion.length === 0
  ) {
    throw new Error('NEW2 parity definition has no definitionVersion');
  }
  const measurementVersion =
    measurement.definitionVersion ?? measurement.contract?.definitionVersion;
  if (measurementVersion !== definition.definitionVersion) {
    throw new Error(
      `NEW2 freshness definition mismatch: measurement=${String(measurementVersion)} ` +
        `definition=${definition.definitionVersion}`,
    );
  }
  const definitionSha256 = createHash('sha256').update(definitionBytes).digest('hex');
  if (
    parity.definitionVersion !== definition.definitionVersion ||
    parity.definitionSha256 !== definitionSha256
  ) {
    throw new Error(
      `NEW2 parity artifact definition mismatch: parityVersion=${String(parity.definitionVersion)} ` +
        `paritySha256=${String(parity.definitionSha256)} definitionVersion=${definition.definitionVersion} ` +
        `definitionSha256=${definitionSha256}`,
    );
  }

  const source = measurement.sources?.find((candidate) => candidate.source === 'aws_open_data_hc');
  if (!source) throw new Error('NEW2 freshness artifact has no aws_open_data_hc source');
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
    definitionVersion: definition.definitionVersion,
    definitionArtifactSha256: definitionSha256,
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
