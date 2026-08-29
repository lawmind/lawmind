/**
 * The publication is atomic or it is nothing.
 *
 * These tests are written against the failure that actually happened: a fresh
 * measurement existed, was correct, and never reached the route, while a
 * four-hour-old pair kept being served with no signal that anything was wrong.
 * Each case below either interrupts a publication or offers an incoherent pair,
 * and asserts the same two things — the old observation is still whole, and
 * nothing partial was ever readable.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildFreshnessObject } from './freshness-object.ts';
import {
  publishFreshnessObservation,
  readPublishedObservation,
} from './freshness-publication.ts';

import type { Sql } from 'postgres';

const sqlMustNotRun = new Proxy(function () {}, {
  apply() {
    throw new Error('freshness request attempted a database query');
  },
}) as unknown as Sql;

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

type Json = Record<string, unknown>;

/**
 * A minimal but genuinely coherent observation: two courts, one window month,
 * accounting that closes, and a denominator timestamp that matches its parity
 * artifact. Every test below breaks exactly one of those.
 */
function fixture(overrides: { takenAt?: string; measuredAt?: string; decisionDate?: string } = {}) {
  const takenAt = overrides.takenAt ?? '2026-08-29T10:24:14.563Z';
  const definition: Json = {
    definitionVersion: 'HC_PARITY_TEST_V2',
    identity: 'distinct pdfUrlFor(partition, basename(pdf_link)) per court',
  };
  const definitionBytes = Buffer.from(JSON.stringify(definition, null, 1), 'utf8');
  const definitionSha256 = createHash('sha256').update(definitionBytes).digest('hex');
  const cells = [
    {
      court: '1_12',
      month: '2026-08',
      upstreamRecords: 100,
      upstreamCases: 100,
      held: 97,
      sourceUnavailableCount: 2,
      retryExhaustedOurs: 0,
      neverAttempted: 1,
      upstreamLocalCompleteness: 0.97,
      accountedUpstream: 0.99,
    },
    {
      court: '10_8',
      month: '2026-08',
      upstreamRecords: 100,
      upstreamCases: 101,
      held: 100,
      sourceUnavailableCount: 0,
      retryExhaustedOurs: 0,
      neverAttempted: 0,
      upstreamLocalCompleteness: 1,
      accountedUpstream: 1,
    },
  ];
  const measurement: Json = {
    artifact: 'NEW2_SOURCE_FRESHNESS_TEST',
    definitionVersion: 'HC_PARITY_TEST_V2',
    contract: { definitionVersion: 'HC_PARITY_TEST_V2', denominatorTakenAt: takenAt },
    sources: [
      {
        source: 'aws_open_data_hc',
        latestUpstreamDecisionDate: overrides.decisionDate ?? '2026-08-28',
        latestUpstreamMeasuredAt: overrides.measuredAt ?? '2026-08-29T10:19:28.784Z',
        latestLocalDecisionDate: '2026-08-28',
        lastSuccessfulIngestAt: '2026-08-29T09:00:00.000Z',
        sourceLagDays: 1,
        upstreamLocalCompleteness: 0.985,
        sourceUnavailableCount: 2,
        measuredWindow: {
          months: ['2026-08'],
          upstreamRecords: 200,
          held: 197,
          sourceUnavailableCount: 2,
          neverAttempted: 1,
        },
        courtMonthDetail: cells,
      },
    ],
  };
  const parity: Json = {
    artifact: 'NEW2_HC_PARITY_MATRIX_TEST',
    definitionVersion: 'HC_PARITY_TEST_V2',
    definitionSha256,
    takenAt,
  };
  return { definition, definitionBytes, definitionSha256, measurement, parity };
}

async function bed(overrides?: Parameters<typeof fixture>[0]) {
  const dir = await mkdtemp(join(tmpdir(), `lawmind-freshness-${randomUUID().slice(0, 8)}-`));
  const f = fixture(overrides);
  const definitionPath = join(dir, 'definition.json');
  const measurementPath = join(dir, 'measurement.json');
  const parityPath = join(dir, 'parity.json');
  const outPath = join(dir, 'freshness-observation.json');
  await writeFile(definitionPath, f.definitionBytes);
  await writeFile(measurementPath, JSON.stringify(f.measurement, null, 1), 'utf8');
  await writeFile(parityPath, JSON.stringify(f.parity, null, 1), 'utf8');
  return { dir, definitionPath, measurementPath, parityPath, outPath, ...f };
}

async function rewrite(path: string, mutate: (json: Json) => void): Promise<void> {
  const json = JSON.parse(await readFile(path, 'utf8')) as Json;
  mutate(json);
  await writeFile(path, JSON.stringify(json, null, 1), 'utf8');
}

describe('freshness publication is atomic', () => {
  it('publishes a coherent observation and reads back exactly what it published', async () => {
    const b = await bed();
    const published = await publishFreshnessObservation({
      definitionPath: b.definitionPath,
      measurementPath: b.measurementPath,
      parityPath: b.parityPath,
      outPath: b.outPath,
    });
    const served = await buildFreshnessObject(sqlMustNotRun, { observation: b.outPath });

    assert.equal(served.publicationGeneration, published.generation);
    assert.equal(served.upstreamMeasuredAt, '2026-08-29T10:19:28.784Z');
    assert.equal(served.latestUpstreamDecisionDate, '2026-08-28');
    assert.equal(served.definitionArtifactSha256, b.definitionSha256);
    assert.equal(served.courtMonthDetail.length, 2);
  });

  it('leaves the previous observation whole when a republish is interrupted', async () => {
    const b = await bed();
    const first = await publishFreshnessObservation({
      definitionPath: b.definitionPath,
      measurementPath: b.measurementPath,
      parityPath: b.parityPath,
      outPath: b.outPath,
    });

    // A newer measurement whose accounting does not close — the interruption is
    // a refusal partway through, which is the shape a crashed generator takes.
    await rewrite(b.measurementPath, (json) => {
      const source = (json['sources'] as Json[])[0]!;
      (source['latestUpstreamMeasuredAt'] as unknown) = '2026-08-29T12:00:00.000Z';
      const cell = (source['courtMonthDetail'] as Json[])[0]!;
      cell['held'] = 96; // one record now accounted nowhere at all
    });

    await assert.rejects(
      publishFreshnessObservation({
        definitionPath: b.definitionPath,
        measurementPath: b.measurementPath,
        parityPath: b.parityPath,
        outPath: b.outPath,
      }),
      /held\+sourceUnavailable\+retryExhausted\+neverAttempted/,
    );

    // The reader still sees the ENTIRE previous observation, not a mixed pair.
    const served = await buildFreshnessObject(sqlMustNotRun, { observation: b.outPath });
    assert.equal(served.publicationGeneration, first.generation);
    assert.equal(served.upstreamMeasuredAt, '2026-08-29T10:19:28.784Z');
    assert.equal(served.courtMonthDetail[0]!.held, 97);

    // And no half-written candidate was left where a reader could find one.
    const leftovers = (await readdir(b.dir)).filter((name) => name.includes('.publishing-'));
    assert.deepEqual(leftovers, []);
  });

  it('refuses the exact mixed pair that served a stale observation on 29 August', async () => {
    // The measurement was taken against a denominator computed at 10:24; the
    // parity artifact offered alongside it was computed at 08:08. Both files
    // are individually valid, which is precisely why this was invisible.
    const b = await bed();
    await rewrite(b.parityPath, (json) => {
      json['takenAt'] = '2026-08-29T08:08:52.955Z';
    });

    await assert.rejects(
      publishFreshnessObservation({
        definitionPath: b.definitionPath,
        measurementPath: b.measurementPath,
        parityPath: b.parityPath,
        outPath: b.outPath,
      }),
      /denominator computed at 2026-08-29T10:24:14\.563Z/,
    );
    await assert.rejects(readPublishedObservation(b.outPath), /no published freshness observation/);
  });

  it('refuses a measurement taken under another definition version', async () => {
    const b = await bed();
    await rewrite(b.measurementPath, (json) => {
      json['definitionVersion'] = 'HC_PARITY_TEST_V1';
      (json['contract'] as Json)['definitionVersion'] = 'HC_PARITY_TEST_V1';
    });
    await assert.rejects(
      publishFreshnessObservation({
        definitionPath: b.definitionPath,
        measurementPath: b.measurementPath,
        parityPath: b.parityPath,
        outPath: b.outPath,
      }),
      /definition mismatch/,
    );
  });

  it('refuses a parity artifact whose definition sha does not match the definition', async () => {
    const b = await bed();
    await rewrite(b.parityPath, (json) => {
      json['definitionSha256'] = 'f'.repeat(64);
    });
    await assert.rejects(
      publishFreshnessObservation({
        definitionPath: b.definitionPath,
        measurementPath: b.measurementPath,
        parityPath: b.parityPath,
        outPath: b.outPath,
      }),
      /definition sha mismatch/,
    );
  });

  it('refuses a window total that disagrees with its own cells', async () => {
    const b = await bed();
    await rewrite(b.measurementPath, (json) => {
      const source = (json['sources'] as Json[])[0]!;
      (source['measuredWindow'] as Json)['held'] = 190;
    });
    await assert.rejects(
      publishFreshnessObservation({
        definitionPath: b.definitionPath,
        measurementPath: b.measurementPath,
        parityPath: b.parityPath,
        outPath: b.outPath,
      }),
      /measuredWindow\.held = 190 but the window's cells sum to 197/,
    );
  });

  it('fails closed on a truncated publication rather than projecting half of it', async () => {
    const b = await bed();
    await publishFreshnessObservation({
      definitionPath: b.definitionPath,
      measurementPath: b.measurementPath,
      parityPath: b.parityPath,
      outPath: b.outPath,
    });
    const whole = await readFile(b.outPath, 'utf8');
    await writeFile(b.outPath, whole.slice(0, Math.floor(whole.length * 0.6)), 'utf8');

    await assert.rejects(
      buildFreshnessObject(sqlMustNotRun, { observation: b.outPath }),
      /torn or truncated publication is refused/,
    );
  });

  it('fails closed when a published observation is edited in place', async () => {
    const b = await bed();
    await publishFreshnessObservation({
      definitionPath: b.definitionPath,
      measurementPath: b.measurementPath,
      parityPath: b.parityPath,
      outPath: b.outPath,
    });
    const json = JSON.parse(await readFile(b.outPath, 'utf8')) as Json;
    const source = ((json['body'] as Json)['measurement'] as Json)['sources'] as Json[];
    source[0]!['latestUpstreamDecisionDate'] = '2026-09-30';
    await writeFile(b.outPath, JSON.stringify(json, null, 1), 'utf8');

    await assert.rejects(
      buildFreshnessObject(sqlMustNotRun, { observation: b.outPath }),
      /does not match its own bodySha256/,
    );
  });

  it('refuses to serve anything at all when nothing has been published', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lawmind-freshness-empty-'));
    await assert.rejects(
      buildFreshnessObject(sqlMustNotRun, { observation: join(dir, 'freshness-observation.json') }),
      /no published freshness observation/,
    );
  });

  it('every read during a live republish sees one whole generation, never a mix', async () => {
    const b = await bed();
    await publishFreshnessObservation({
      definitionPath: b.definitionPath,
      measurementPath: b.measurementPath,
      parityPath: b.parityPath,
      outPath: b.outPath,
    });

    // Two coherent observations that differ in every projected field, swapped
    // back and forth while a reader hammers the same path.
    const alternate = await bed({
      takenAt: '2026-08-30T04:00:00.000Z',
      measuredAt: '2026-08-30T04:05:00.000Z',
      decisionDate: '2026-08-29',
    });

    let stop = false;
    const republish = (async () => {
      for (let i = 0; i < 40 && !stop; i += 1) {
        const use = i % 2 === 0 ? alternate : b;
        await publishFreshnessObservation({
          definitionPath: use.definitionPath,
          measurementPath: use.measurementPath,
          parityPath: use.parityPath,
          outPath: b.outPath,
        });
      }
    })();

    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const served = await buildFreshnessObject(sqlMustNotRun, { observation: b.outPath });
      // Coherence, stated as a pairing: these two fields come from different
      // artifacts in the old three-file design and could disagree there.
      const pair = `${served.upstreamMeasuredAt}|${served.latestUpstreamDecisionDate}`;
      assert.ok(
        pair === '2026-08-29T10:19:28.784Z|2026-08-28' ||
          pair === '2026-08-30T04:05:00.000Z|2026-08-29',
        `a mixed observation was served: ${pair}`,
      );
      seen.add(pair);
    }
    stop = true;
    await republish;
    assert.ok(seen.size >= 1);
  });
});

describe('the committed observation is the one the route serves', () => {
  it('projects the repository publication and matches its own artifact', async () => {
    const served = await buildFreshnessObject(sqlMustNotRun);
    const published = await readPublishedObservation();
    const source = (published.body.measurement['sources'] as Json[]).find(
      (candidate) => candidate['source'] === 'aws_open_data_hc',
    )!;

    assert.equal(served.publicationGeneration, published.generation);
    assert.equal(served.definitionVersion, published.definitionVersion);
    assert.equal(served.upstreamMeasuredAt, source['latestUpstreamMeasuredAt']);
    assert.equal(served.latestUpstreamDecisionDate, source['latestUpstreamDecisionDate']);
    assert.equal(
      served.courtMonthDetail.length,
      (source['courtMonthDetail'] as unknown[]).length,
    );
    assert.ok(!('freshnessScore' in served));
    assert.ok(served.courtMonthDetail.length < 10_000, 'shape must stay court/month-bounded');

    // The published parity denominator is a real committed artifact, at the sha
    // the publication recorded.
    const parityBytes = await readFile(join(REPO_ROOT, published.body.parity.artifact));
    assert.equal(
      createHash('sha256').update(parityBytes).digest('hex'),
      published.body.parity.sha256,
    );
  });
});
