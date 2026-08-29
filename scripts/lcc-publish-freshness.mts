/**
 * THE canonical publication step for an upstream parity/freshness observation.
 *
 *   tsx scripts/lcc-publish-freshness.mts
 *   tsx scripts/lcc-publish-freshness.mts \
 *     --measurement docs/ai/new2-r10/source-freshness-gate.json \
 *     --parity      docs/ai/new2-r10/parity-matrix-gate.json
 *
 * NEW2 generates a measurement and the parity denominator it was taken against.
 * Whatever filenames that run used, this is the only thing that makes the pair
 * visible to `GET /corpus/freshness/object` — and it refuses unless the pair is
 * coherent, so a gate run and a production route can no longer drift apart
 * silently the way they did on 29 August.
 *
 * With `--promote`, the validated inputs also become the canonical
 * `source-freshness.json` / `parity-matrix.json` in the repo, so the committed
 * artifacts stop lagging the published observation. Promotion is a temp-then-
 * rename per file; the published observation is written last and is the only
 * thing the route reads, so ordering here cannot tear a reader.
 *
 * The route is never pointed at `*-gate.json`. A gate artifact is evidence for
 * one audit; publication is a separate, named act.
 */
import { copyFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_DEFINITION_PATH,
  CANONICAL_MEASUREMENT_PATH,
  CANONICAL_PARITY_PATH,
  PUBLISHED_OBSERVATION_PATH,
  publishFreshnessObservation,
  readPublishedObservation,
} from '../services/api/src/corpus/freshness-publication.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
  return isAbsolute(value) ? value : join(ROOT, value);
}

const measurement = arg('measurement', CANONICAL_MEASUREMENT_PATH);
const parity = arg('parity', CANONICAL_PARITY_PATH);
const definition = arg('definition', CANONICAL_DEFINITION_PATH);
const promote = process.argv.includes('--promote');

/** Same directory, so the swap is a rename and not a copy that can half-finish. */
async function atomicCopy(from: string, to: string): Promise<void> {
  if (from === to) return;
  const temp = `${to}.promoting-${process.pid}-${Date.now()}`;
  try {
    await copyFile(from, temp);
    await rename(temp, to);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

// Validate BEFORE promoting: a pair that cannot be published must not become
// the canonical pair either.
const dryRun = await publishFreshnessObservation({
  definitionPath: definition,
  measurementPath: measurement,
  parityPath: parity,
  outPath: `${PUBLISHED_OBSERVATION_PATH}.candidate-${process.pid}`,
});
await unlink(dryRun.path).catch(() => undefined);

if (promote) {
  await atomicCopy(measurement, CANONICAL_MEASUREMENT_PATH);
  await atomicCopy(parity, CANONICAL_PARITY_PATH);
}

const result = await publishFreshnessObservation({
  definitionPath: definition,
  measurementPath: promote ? CANONICAL_MEASUREMENT_PATH : measurement,
  parityPath: promote ? CANONICAL_PARITY_PATH : parity,
});

// Read it back through the same door the route uses. A publication nobody has
// re-read is a claim, not a result.
const served = await readPublishedObservation();
if (served.generation !== result.generation || served.bodySha256 !== result.bodySha256) {
  throw new Error(
    `published ${result.generation} but read back ${served.generation} — publication did not settle`,
  );
}

console.log(
  JSON.stringify(
    {
      published: result.path.slice(ROOT.length).split('\\').join('/'),
      generation: result.generation,
      publishedAt: result.publishedAt,
      definitionVersion: result.definitionVersion,
      definitionSha256: result.definitionSha256,
      bodySha256: result.bodySha256,
      upstreamMeasuredAt: result.upstreamMeasuredAt,
      latestUpstreamDecisionDate: result.latestUpstreamDecisionDate,
      promoted: promote,
    },
    null,
    2,
  ),
);
