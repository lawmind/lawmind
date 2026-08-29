/**
 * The projection must be exactly NEW2's measurement and nothing else — no
 * recomputed denominator, no invented score, no request-time database work.
 *
 * It now also asserts what the R10 gate exposed: the committed canonical
 * artifact and the published observation the route serves are the SAME
 * measurement. When those two drifted apart, every number below still looked
 * correct and production was four hours behind.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { Sql } from 'postgres';

import { buildFreshnessObject, type CourtMonthFreshness } from './freshness-object.ts';
import { readPublishedObservation } from './freshness-publication.ts';

type New2Cell = Omit<CourtMonthFreshness, 'sourceUnavailableCount'> & {
  sourceUnavailableCount?: number;
  unavailableSourceCount?: number;
};
type New2Source = {
  source: string;
  latestUpstreamDecisionDate: string | null;
  latestUpstreamMeasuredAt: string;
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

  /**
   * The R10 regression, stated as an assertion rather than a story: the newest
   * committed measurement and the observation the route serves must be the same
   * upstream walk. A gate run that writes evidence somewhere the route does not
   * read is a stale production surface, and this is what makes it fail loudly.
   */
  it('serves the measurement that is actually committed, not an older publication', async () => {
    const result = await buildFreshnessObject(sqlMustNotRun);
    const artifact = JSON.parse(await readFile(SOURCE_FRESHNESS, 'utf8')) as New2Artifact;
    const new2 = artifact.sources.find((source) => source.source === 'aws_open_data_hc')!;
    const published = await readPublishedObservation();

    assert.equal(result.upstreamMeasuredAt, new2.latestUpstreamMeasuredAt);
    assert.equal(result.publicationGeneration, published.generation);
    assert.ok(
      published.generation.startsWith(new2.latestUpstreamMeasuredAt),
      `the published generation ${published.generation} does not name the committed ` +
        `measurement ${new2.latestUpstreamMeasuredAt}`,
    );
  });
});
