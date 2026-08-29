import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { Sql } from 'postgres';

import { buildFreshnessObject, type CourtMonthFreshness } from './freshness-object.ts';

type New2Cell = Omit<CourtMonthFreshness, 'sourceUnavailableCount'> & {
  sourceUnavailableCount?: number;
  unavailableSourceCount?: number;
};
type New2Source = {
  source: string;
  latestUpstreamDecisionDate: string | null;
  latestLocalDecisionDate: string | null;
  lastSuccessfulIngestAt: string | null;
  upstreamLocalCompleteness: number | null;
  sourceLagDays: number | null;
  sourceUnavailableCount?: number;
  unavailableSourceCount?: number;
  courtMonthDetail: New2Cell[];
};
type New2Artifact = {
  definitionVersion?: string;
  contract: { definitionVersion?: string };
  sources: New2Source[];
};

const sqlMustNotRun = new Proxy(function () {}, {
  apply() {
    throw new Error('freshness request attempted a database query');
  },
}) as unknown as Sql;
const SOURCE_FRESHNESS = fileURLToPath(
  new URL('../../../../docs/ai/new2-r10/source-freshness.json', import.meta.url),
);
const PARITY_DEFINITION = fileURLToPath(
  new URL('../../../../docs/ai/new2-r10/hc-parity-definition-v2.json', import.meta.url),
);
const PARITY_MEASUREMENT = fileURLToPath(
  new URL('../../../../docs/ai/new2-r10/parity-matrix.json', import.meta.url),
);

describe('corpus freshness object', () => {
  it('is an exact bounded projection of NEW2 HC summary and court/month rows', async () => {
    const result = await buildFreshnessObject(sqlMustNotRun);
    const artifact = JSON.parse(await readFile(SOURCE_FRESHNESS, 'utf8')) as New2Artifact;
    const new2 = artifact.sources.find((source) => source.source === 'aws_open_data_hc');
    assert.ok(new2);
    const definition = await readFile(PARITY_DEFINITION);
    const parity = JSON.parse(await readFile(PARITY_MEASUREMENT, 'utf8')) as {
      definitionSha256: string;
    };

    assert.equal(
      result.definitionVersion,
      artifact.definitionVersion ?? artifact.contract.definitionVersion,
    );
    assert.equal(
      result.definitionArtifactSha256,
      createHash('sha256').update(definition).digest('hex'),
    );
    assert.equal(result.definitionArtifactSha256, parity.definitionSha256);
    assert.deepEqual(
      {
        latestUpstreamDecisionDate: result.latestUpstreamDecisionDate,
        latestLocalDecisionDate: result.latestLocalDecisionDate,
        lastSuccessfulIngestAt: result.lastSuccessfulIngestAt,
        upstreamLocalCompleteness: result.upstreamLocalCompleteness,
        sourceLagDays: result.sourceLagDays,
        sourceUnavailableCount: result.sourceUnavailableCount,
      },
      {
        latestUpstreamDecisionDate: new2.latestUpstreamDecisionDate,
        latestLocalDecisionDate: new2.latestLocalDecisionDate,
        lastSuccessfulIngestAt: new2.lastSuccessfulIngestAt,
        upstreamLocalCompleteness: new2.upstreamLocalCompleteness,
        sourceLagDays: new2.sourceLagDays,
        sourceUnavailableCount: new2.sourceUnavailableCount ?? new2.unavailableSourceCount,
      },
    );
    assert.deepEqual(
      result.courtMonthDetail,
      new2.courtMonthDetail.map((cell) => {
        const { unavailableSourceCount: legacy, ...rest } = cell;
        return {
          ...rest,
          sourceUnavailableCount: cell.sourceUnavailableCount ?? legacy,
        };
      }),
    );
    assert.equal(result.courtMonthDetail.length, new2.courtMonthDetail.length);
    assert.ok(result.courtMonthDetail.length < 10_000, 'shape must stay court/month-bounded');
    assert.ok(!('freshnessScore' in result));
  });

  it('refuses a measurement made under any other denominator definition', async () => {
    const salt = `${process.pid}-${Date.now()}`;
    const definition = join(tmpdir(), `lawmind-freshness-definition-${salt}.json`);
    const measurement = join(tmpdir(), `lawmind-freshness-measurement-${salt}.json`);
    await writeFile(definition, JSON.stringify({ definitionVersion: 'HC_PARITY_V2' }));
    await writeFile(
      measurement,
      JSON.stringify({ definitionVersion: 'HC_PARITY_V1', sources: [] }),
    );

    await assert.rejects(
      buildFreshnessObject(sqlMustNotRun, { definition, measurement }),
      /definition mismatch/,
    );
  });
});
