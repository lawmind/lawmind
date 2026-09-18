/**
 * ONE canonical publication operation for an upstream parity/freshness
 * observation, and the only thing `GET /corpus/freshness/object` is allowed to
 * read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO CLOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The definition `HC_PARITY_V2_2026-08-29` passed. The *publication* did not.
 * NEW2's gate run measured upstream at `10:19Z` and wrote its evidence to
 * parallel `*-gate.json` files, while the route kept projecting the `05:35Z`
 * measurement from the canonical filenames. Production served an observation
 * that was real, coherent and four hours stale, and nothing in the system could
 * tell the difference — because "the newest measurement" and "the measurement
 * the API reads" were two unrelated facts.
 *
 * The fix is NOT to point the route at gate filenames. A gate artifact is
 * evidence for one audit; the route needs a *published* observation, and
 * publication needs to be an act with a name, a generation and a validation
 * step in front of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ONE FILE AND NOT THREE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A freshness observation is three artifacts — the immutable definition, the
 * parity denominator, and the measurement taken against it — and they are only
 * meaningful together. Read as three files they can be torn: a reader arriving
 * mid-republish sees a new measurement against an old denominator, which is a
 * number nobody ever measured. Three atomic renames are not one atomic
 * publication.
 *
 * So publication writes **one file**, temp-then-rename inside the same
 * directory, and the reader opens exactly that one file. A rename on one
 * filesystem is atomic, so a reader sees the whole previous observation or the
 * whole new one and there is no third possibility to test for. The 2.6 MB
 * parity matrix is carried by identity (path, sha256, `takenAt`) rather than by
 * value — the route never needed its body, only the proof that the measurement
 * was taken against it.
 *
 * The immutable definition and the dynamic observation stay separate concepts:
 * the definition is embedded verbatim and fingerprinted, and a publication is
 * refused outright if the measurement or the parity matrix was computed under a
 * different one.
 */
import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The published observation. The only file the route reads. */
export const PUBLISHED_OBSERVATION_PATH = join(
  REPO_ROOT,
  'docs/ai/new2-r10/freshness-observation.json',
);
export const CANONICAL_DEFINITION_PATH = join(
  REPO_ROOT,
  'docs/ai/new2-r10/hc-parity-definition-v2.json',
);
export const CANONICAL_MEASUREMENT_PATH = join(REPO_ROOT, 'docs/ai/new2-r10/source-freshness.json');
export const CANONICAL_PARITY_PATH = join(REPO_ROOT, 'docs/ai/new2-r10/parity-matrix.json');

export const PUBLISHED_OBSERVATION_ARTIFACT = 'LCC_FRESHNESS_OBSERVATION_V1';

/** The one source whose court/month detail the product surface projects. */
export const PROJECTED_SOURCE = 'aws_open_data_hc';

/** Cells are rounded to four decimals by NEW2; compare at half a unit of that. */
const RATIO_TOLERANCE = 5e-5;

export type PublishedParityIdentity = {
  artifact: string;
  sha256: string;
  definitionVersion: string;
  definitionSha256: string;
  takenAt: string;
};

export type PublishedObservationBody = {
  definition: Record<string, unknown>;
  parity: PublishedParityIdentity;
  measurement: Record<string, unknown>;
};

export type PublishedObservation = {
  artifact: string;
  generation: string;
  publishedAt: string;
  definitionVersion: string;
  definitionSha256: string;
  bodySha256: string;
  body: PublishedObservationBody;
};

export class FreshnessPublicationError extends Error {
  override name = 'FreshnessPublicationError';
}

function fail(message: string): never {
  throw new FreshnessPublicationError(message);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what} is not a JSON object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${what} is missing or not a string`);
  return value;
}

function finiteNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${what} is not a finite number`);
  return value;
}

/**
 * The body is serialised exactly once and hashed over that serialisation, so a
 * reader can prove it holds the whole thing. `JSON.stringify` preserves the key
 * order it was given and round-trips through `JSON.parse` unchanged, which is
 * what makes recomputing the hash on read a real check rather than a ritual.
 */
function serialiseBody(body: PublishedObservationBody): string {
  return JSON.stringify(body);
}

type Cell = {
  court: string;
  month: string;
  upstreamRecords: number;
  held: number;
  sourceUnavailableCount: number;
  retryExhaustedOurs: number;
  neverAttempted: number;
  upstreamLocalCompleteness: number;
};

function readCell(raw: unknown, index: number): Cell {
  const cell = asRecord(raw, `courtMonthDetail[${index}]`);
  const at = (field: string): number =>
    finiteNumber(cell[field], `courtMonthDetail[${index}].${field}`);
  const unavailable =
    cell['sourceUnavailableCount'] === undefined
      ? at('unavailableSourceCount')
      : at('sourceUnavailableCount');
  return {
    court: nonEmptyString(cell['court'], `courtMonthDetail[${index}].court`),
    month: nonEmptyString(cell['month'], `courtMonthDetail[${index}].month`),
    upstreamRecords: at('upstreamRecords'),
    held: at('held'),
    sourceUnavailableCount: unavailable,
    retryExhaustedOurs: at('retryExhaustedOurs'),
    neverAttempted: at('neverAttempted'),
    upstreamLocalCompleteness: at('upstreamLocalCompleteness'),
  };
}

/**
 * The accounting the whole gate rests on, checked before anything is exposed.
 *
 * Every upstream record is in exactly one bucket — we hold it, the source could
 * not supply it, our retries were exhausted, or we never looked. A cell where
 * those four do not sum to the denominator is not a slightly-wrong percentage;
 * it is a completeness claim with a hole in it, and it must never reach a
 * surface that an advocate reads as coverage.
 */
function assertInternalAccounting(measurement: Record<string, unknown>): void {
  const sources = measurement['sources'];
  if (!Array.isArray(sources)) fail('measurement has no sources array');
  const raw = sources.find(
    (candidate) => asRecord(candidate, 'source')['source'] === PROJECTED_SOURCE,
  );
  if (!raw) fail(`measurement has no ${PROJECTED_SOURCE} source`);
  const source = asRecord(raw, PROJECTED_SOURCE);

  const detail = source['courtMonthDetail'];
  if (!Array.isArray(detail) || detail.length === 0) {
    fail(`${PROJECTED_SOURCE} has no courtMonthDetail`);
  }

  const cells = detail.map(readCell);
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.court}\u0000${cell.month}`;
    if (seen.has(key)) fail(`courtMonthDetail repeats ${cell.court} ${cell.month}`);
    seen.add(key);

    const accounted =
      cell.held + cell.sourceUnavailableCount + cell.retryExhaustedOurs + cell.neverAttempted;
    if (accounted !== cell.upstreamRecords) {
      fail(
        `${cell.court} ${cell.month}: held+sourceUnavailable+retryExhausted+neverAttempted ` +
          `= ${accounted}, upstreamRecords = ${cell.upstreamRecords}`,
      );
    }
    if (
      cell.held < 0 ||
      cell.sourceUnavailableCount < 0 ||
      cell.retryExhaustedOurs < 0 ||
      cell.neverAttempted < 0
    ) {
      fail(`${cell.court} ${cell.month}: a negative count is not an accounting state`);
    }
    const expected = cell.upstreamRecords === 0 ? 1 : cell.held / cell.upstreamRecords;
    if (Math.abs(cell.upstreamLocalCompleteness - expected) > RATIO_TOLERANCE) {
      fail(
        `${cell.court} ${cell.month}: upstreamLocalCompleteness ` +
          `${cell.upstreamLocalCompleteness} does not equal held/upstreamRecords ${expected}`,
      );
    }
  }

  const window = asRecord(source['measuredWindow'], 'measuredWindow');
  const months = window['months'];
  if (!Array.isArray(months) || months.length === 0) fail('measuredWindow has no months');
  const inWindow = new Set(months.map((month) => nonEmptyString(month, 'measuredWindow.months[]')));
  const totals = cells
    .filter((cell) => inWindow.has(cell.month))
    .reduce(
      (acc, cell) => ({
        upstreamRecords: acc.upstreamRecords + cell.upstreamRecords,
        held: acc.held + cell.held,
        sourceUnavailableCount: acc.sourceUnavailableCount + cell.sourceUnavailableCount,
        neverAttempted: acc.neverAttempted + cell.neverAttempted,
      }),
      { upstreamRecords: 0, held: 0, sourceUnavailableCount: 0, neverAttempted: 0 },
    );

  for (const field of ['upstreamRecords', 'held', 'sourceUnavailableCount', 'neverAttempted']) {
    const declared = finiteNumber(window[field], `measuredWindow.${field}`);
    const summed = totals[field as keyof typeof totals];
    if (declared !== summed) {
      fail(`measuredWindow.${field} = ${declared} but the window's cells sum to ${summed}`);
    }
  }

  // The headline the API serves is the window's, not a second number computed
  // somewhere else. A source-level total that disagrees with its own detail is
  // the mixed-pair defect wearing different clothes.
  const headline = finiteNumber(source['upstreamLocalCompleteness'], 'upstreamLocalCompleteness');
  const expectedHeadline = totals.upstreamRecords === 0 ? 1 : totals.held / totals.upstreamRecords;
  if (Math.abs(headline - expectedHeadline) > RATIO_TOLERANCE) {
    fail(
      `source upstreamLocalCompleteness ${headline} does not equal the window's ` +
        `held/upstreamRecords ${expectedHeadline}`,
    );
  }
  const headlineUnavailable = finiteNumber(
    source['sourceUnavailableCount'] ?? source['unavailableSourceCount'],
    'sourceUnavailableCount',
  );
  if (headlineUnavailable !== totals.sourceUnavailableCount) {
    fail(
      `source sourceUnavailableCount ${headlineUnavailable} does not equal the window's ` +
        `${totals.sourceUnavailableCount}`,
    );
  }
  nonEmptyString(source['latestUpstreamMeasuredAt'], 'latestUpstreamMeasuredAt');
}

export type PublishInput = {
  /** The immutable definition. Never rewritten by a publication. */
  definitionPath?: string;
  /** The measurement to publish — this round's freshly generated artifact. */
  measurementPath?: string;
  /** The parity denominator that measurement was taken against. */
  parityPath?: string;
  /** Where the published observation lands. */
  outPath?: string;
  now?: Date;
};

export type PublishResult = {
  path: string;
  generation: string;
  publishedAt: string;
  definitionVersion: string;
  definitionSha256: string;
  bodySha256: string;
  upstreamMeasuredAt: string;
  latestUpstreamDecisionDate: string | null;
};

/**
 * Validate a complete observation and expose it, or expose nothing.
 *
 * Nothing is written until every check has passed, and the single write is a
 * temp-then-rename in the destination directory. An interruption anywhere before
 * the rename leaves the previous published observation exactly as it was.
 */
export async function publishFreshnessObservation(
  input: PublishInput = {},
): Promise<PublishResult> {
  const definitionPath = input.definitionPath ?? CANONICAL_DEFINITION_PATH;
  const measurementPath = input.measurementPath ?? CANONICAL_MEASUREMENT_PATH;
  const parityPath = input.parityPath ?? CANONICAL_PARITY_PATH;
  const outPath = input.outPath ?? PUBLISHED_OBSERVATION_PATH;

  const [definitionBytes, measurementBytes, parityBytes] = await Promise.all([
    readFile(definitionPath),
    readFile(measurementPath),
    readFile(parityPath),
  ]);

  const definition = asRecord(JSON.parse(definitionBytes.toString('utf8')), 'definition artifact');
  const measurement = asRecord(
    JSON.parse(measurementBytes.toString('utf8')),
    'measurement artifact',
  );
  const parity = asRecord(JSON.parse(parityBytes.toString('utf8')), 'parity artifact');

  const definitionVersion = nonEmptyString(
    definition['definitionVersion'],
    'definition.definitionVersion',
  );
  const definitionSha256 = sha256(definitionBytes);

  const contract = measurement['contract'];
  const measurementVersion =
    measurement['definitionVersion'] ??
    (contract === undefined
      ? undefined
      : asRecord(contract, 'measurement.contract')['definitionVersion']);
  if (measurementVersion !== definitionVersion) {
    fail(
      `definition mismatch: measurement=${String(measurementVersion)} ` +
        `definition=${definitionVersion}`,
    );
  }
  if (parity['definitionVersion'] !== definitionVersion) {
    fail(
      `definition mismatch: parity=${String(parity['definitionVersion'])} ` +
        `definition=${definitionVersion}`,
    );
  }
  if (parity['definitionSha256'] !== definitionSha256) {
    fail(
      `definition sha mismatch: parity=${String(parity['definitionSha256'])} ` +
        `computed=${definitionSha256}`,
    );
  }

  /**
   * The check that would have caught the served-stale defect on the day it
   * happened. NEW2 records which denominator run a measurement consumed; if
   * that is not the parity artifact being published beside it, the pair is
   * exactly the mixed observation this module exists to make impossible.
   */
  const parityTakenAt = nonEmptyString(parity['takenAt'], 'parity.takenAt');
  const denominatorTakenAt = nonEmptyString(
    asRecord(contract, 'measurement.contract')['denominatorTakenAt'],
    'measurement.contract.denominatorTakenAt',
  );
  if (denominatorTakenAt !== parityTakenAt) {
    fail(
      `the measurement was taken against a denominator computed at ${denominatorTakenAt}, ` +
        `but the parity artifact offered for publication was computed at ${parityTakenAt}. ` +
        'Publishing this pair would serve a completeness number nobody measured.',
    );
  }

  assertInternalAccounting(measurement);

  const source = (measurement['sources'] as Record<string, unknown>[]).find(
    (candidate) => candidate['source'] === PROJECTED_SOURCE,
  )!;
  const upstreamMeasuredAt = nonEmptyString(
    source['latestUpstreamMeasuredAt'],
    'latestUpstreamMeasuredAt',
  );
  const latestUpstreamDecisionDate =
    source['latestUpstreamDecisionDate'] === null
      ? null
      : nonEmptyString(source['latestUpstreamDecisionDate'], 'latestUpstreamDecisionDate');

  const body: PublishedObservationBody = {
    definition,
    parity: {
      artifact: parityPath.slice(REPO_ROOT.length).split('\\').join('/'),
      sha256: sha256(parityBytes),
      definitionVersion,
      definitionSha256,
      takenAt: parityTakenAt,
    },
    measurement,
  };
  const bodyJson = serialiseBody(body);
  const publishedAt = (input.now ?? new Date()).toISOString();
  const observation: PublishedObservation = {
    artifact: PUBLISHED_OBSERVATION_ARTIFACT,
    // Generation names the measurement, not the moment of publication: two
    // publications of the same observation are the same observation.
    generation: `${upstreamMeasuredAt}#${sha256(bodyJson).slice(0, 12)}`,
    publishedAt,
    definitionVersion,
    definitionSha256,
    bodySha256: sha256(bodyJson),
    body,
  };

  const temp = `${outPath}.publishing-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temp, JSON.stringify(observation, null, 1), 'utf8');
    // Same directory, same filesystem: the swap is atomic and a reader holds
    // either the whole previous observation or the whole new one.
    await atomicRename(temp, outPath);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }

  return {
    path: outPath,
    generation: observation.generation,
    publishedAt,
    definitionVersion,
    definitionSha256,
    bodySha256: observation.bodySha256,
    upstreamMeasuredAt,
    latestUpstreamDecisionDate,
  };
}

/**
 * Read the published observation, or refuse.
 *
 * There is no fallback to the three loose artifacts. A fallback would reopen
 * the hole: the route would keep answering during a botched publication, with
 * whichever pair happened to be on disk, and the failure would once again be
 * invisible from the outside. An unpublished observation is a 500, not a stale
 * 200.
 */
export async function readPublishedObservation(
  path: string = PUBLISHED_OBSERVATION_PATH,
): Promise<PublishedObservation> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    fail(
      `no published freshness observation at ${path}: run the canonical publisher ` +
        `(scripts/lcc-publish-freshness.mts). Underlying: ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(
      `the published freshness observation at ${path} is not parseable JSON — a torn or ` +
        `truncated publication is refused, never projected: ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }

  const observation = asRecord(parsed, 'published observation');
  if (observation['artifact'] !== PUBLISHED_OBSERVATION_ARTIFACT) {
    fail(
      `${path} is not a ${PUBLISHED_OBSERVATION_ARTIFACT} (found ` +
        `${String(observation['artifact'])})`,
    );
  }
  const body = asRecord(observation['body'], 'published observation body');
  const bodySha256 = nonEmptyString(observation['bodySha256'], 'bodySha256');
  const recomputed = sha256(serialiseBody(body as unknown as PublishedObservationBody));
  if (recomputed !== bodySha256) {
    fail(
      `the published freshness observation at ${path} does not match its own bodySha256 ` +
        `(declared ${bodySha256}, computed ${recomputed}). Refusing to project a partial ` +
        'or edited publication.',
    );
  }

  const definitionVersion = nonEmptyString(observation['definitionVersion'], 'definitionVersion');
  const definition = asRecord(body['definition'], 'body.definition');
  if (definition['definitionVersion'] !== definitionVersion) {
    fail(
      `the published observation header says ${definitionVersion} and its embedded ` +
        `definition says ${String(definition['definitionVersion'])}`,
    );
  }
  const parity = asRecord(body['parity'], 'body.parity');
  if (
    parity['definitionVersion'] !== definitionVersion ||
    parity['definitionSha256'] !== observation['definitionSha256']
  ) {
    fail('the published observation names a parity denominator under another definition');
  }

  return {
    artifact: PUBLISHED_OBSERVATION_ARTIFACT,
    generation: nonEmptyString(observation['generation'], 'generation'),
    publishedAt: nonEmptyString(observation['publishedAt'], 'publishedAt'),
    definitionVersion,
    definitionSha256: nonEmptyString(observation['definitionSha256'], 'definitionSha256'),
    bodySha256,
    body: {
      definition,
      parity: parity as unknown as PublishedParityIdentity,
      measurement: asRecord(body['measurement'], 'body.measurement'),
    },
  };
}

/** Where a publication would land, for callers that report paths. */
export function publishedObservationDirectory(): string {
  return dirname(PUBLISHED_OBSERVATION_PATH);
}

/**
 * Rename, with the one concession Windows requires.
 *
 * On Linux — where this serves — `rename(2)` over an open destination is atomic
 * and never fails for that reason. On Windows, which is the data factory, the
 * same call raises `EPERM` while any other handle has the destination open, so
 * a publication running against a live reader fails at the last step. The
 * failure lands on the WRITER, never the reader: a reader mid-republish still
 * holds a whole file, which is the guarantee that matters. Retrying briefly
 * turns a spurious platform refusal back into the single atomic swap the design
 * assumes, and a genuine permission problem still surfaces after the budget.
 */
async function atomicRename(from: string, to: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!transient || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}
