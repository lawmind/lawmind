#!/usr/bin/env node
/**
 * GUARD — THE PUBLISHED FRESHNESS OBSERVATION MUST BIND ARTIFACTS THE REPO HAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO CLOSE, TWICE OVER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `freshness-publication.ts` already refuses to PUBLISH an incoherent pair. It
 * cannot refuse a COMMIT. On 31 August `08baae98` rewrote
 * `docs/ai/new2-r10/parity-matrix.json` — a legitimate re-measurement — inside a
 * commit about India Code statutes, and did not republish the observation that
 * binds it by sha. From that commit the published observation named a
 * denominator no committed file had, and the repository could no longer
 * reproduce its own parity evidence. LCC found it (bus 1634/1636) because a
 * test in `services/api` went red; nothing in the evidence lane itself noticed.
 * `1a550cf5` was the same defect one round earlier — "the freshness triple
 * two-agreeing-one-behind" — so this is a recurrence, not an accident.
 *
 * The second hole, found while repairing the first and not previously named:
 * the observation published on 29 August recorded
 * `latestUpstreamMeasuredAt = 2026-08-29T14:38:58.523Z`, and the committed
 * `coverage-frontier.json` was taken at `05:35:52.659Z`. The frontier run that
 * produced the published upstream date was never committed either. An
 * observation whose upstream half exists only in a dead working tree is not
 * reproducible evidence, however coherent its internal hashes are.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CHECKS, AND WHY IT READS COMMITTED OBJECTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * With `--ref <git-ref>` every artifact is read with `git show`, so the answer
 * is about what a clone would find and not about what happens to be on this
 * disk. `verify-at-head-not-in-the-worktree`: a coupled set committed one file
 * at a time is green here and red in a clone, and the whole point of this guard
 * is the coupling.
 *
 * Exit 0 clean, 1 on a violation.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

const OBSERVATION = 'docs/ai/new2-r10/freshness-observation.json';
const PARITY = 'docs/ai/new2-r10/parity-matrix.json';
const MEASUREMENT = 'docs/ai/new2-r10/source-freshness.json';
const DEFINITION = 'docs/ai/new2-r10/hc-parity-definition-v2.json';
const FRONTIER = 'docs/ai/new2-r10/coverage-frontier.json';
const PROJECTED_SOURCE = 'aws_open_data_hc';

const refIndex = process.argv.indexOf('--ref');
const REF = refIndex === -1 ? null : process.argv[refIndex + 1];

/** Bytes, never a string: the sha is over the file, and utf8 round-tripping is not identity. */
function bytes(path) {
  if (REF === null) return readFileSync(path);
  return execFileSync('git', ['show', `${REF}:${path}`], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const violations = [];
const checked = [];
function check(name, ok, detail) {
  checked.push(name);
  if (!ok) violations.push(`${name}: ${detail}`);
  return ok;
}

const where = REF === null ? 'the working tree' : `git ${REF}`;
let observationBytes, parityBytes, measurementBytes, definitionBytes, frontierBytes;
try {
  observationBytes = bytes(OBSERVATION);
  parityBytes = bytes(PARITY);
  measurementBytes = bytes(MEASUREMENT);
  definitionBytes = bytes(DEFINITION);
  frontierBytes = bytes(FRONTIER);
} catch (error) {
  console.error(`cannot read the freshness artifacts from ${where}: ${error.message}`);
  process.exit(1);
}

const observation = JSON.parse(observationBytes.toString('utf8'));
const parity = JSON.parse(parityBytes.toString('utf8'));
const measurement = JSON.parse(measurementBytes.toString('utf8'));
const frontier = JSON.parse(frontierBytes.toString('utf8'));

check(
  'artifact name',
  observation.artifact === 'LCC_FRESHNESS_OBSERVATION_V1',
  `${OBSERVATION} declares artifact ${String(observation.artifact)}`,
);

/* The observation is self-describing before it is cross-checked: a body that
 * does not match its own hash has been edited by hand, and every comparison
 * below would then be about the edit rather than about the evidence. */
check(
  'body hash',
  sha256(Buffer.from(JSON.stringify(observation.body), 'utf8')) === observation.bodySha256,
  `body recomputes to ${sha256(Buffer.from(JSON.stringify(observation.body), 'utf8'))}, ` +
    `declared ${String(observation.bodySha256)}`,
);

const bound = observation.body?.parity ?? {};

check(
  'parity path',
  bound.artifact === PARITY,
  `the observation binds ${String(bound.artifact)}, not the canonical ${PARITY}`,
);

/* THE ONE `08baae98` BROKE. Everything else here is scaffolding around it. */
check(
  'parity sha',
  bound.sha256 === sha256(parityBytes),
  `the observation binds parity sha ${String(bound.sha256)} but ${PARITY} hashes to ` +
    `${sha256(parityBytes)}. The parity artifact was rewritten without republishing the ` +
    `observation that binds it — republish with scripts/lcc-publish-freshness.mts.`,
);

check(
  'parity takenAt',
  bound.takenAt === parity.takenAt,
  `the observation records the denominator as taken at ${String(bound.takenAt)}, ` +
    `${PARITY} says ${String(parity.takenAt)}`,
);

check(
  'denominator agreement',
  observation.body?.measurement?.contract?.denominatorTakenAt === parity.takenAt,
  `the measurement consumed a denominator computed at ` +
    `${String(observation.body?.measurement?.contract?.denominatorTakenAt)} and the bound ` +
    `parity artifact was computed at ${String(parity.takenAt)}`,
);

/* The embedded measurement must be the committed one, not a copy that has since
 * moved. Both sides went through JSON.parse, which preserves key order, so
 * stringify equality is exact rather than approximate. */
check(
  'measurement is the committed file',
  JSON.stringify(observation.body?.measurement) === JSON.stringify(measurement),
  `the measurement embedded in the observation is not byte-equal to ${MEASUREMENT} ` +
    `(embedded takenAt ${String(observation.body?.measurement?.takenAt)}, file takenAt ` +
    `${String(measurement.takenAt)})`,
);

check(
  'definition sha',
  observation.definitionSha256 === sha256(definitionBytes),
  `the observation names definition sha ${String(observation.definitionSha256)}, ` +
    `${DEFINITION} hashes to ${sha256(definitionBytes)}`,
);

/* The upstream half. `latestUpstreamDecisionDate` is read out of the coverage
 * frontier, so the frontier run that produced it has to be in the repository or
 * the published upstream date cannot be re-derived from anything a clone holds. */
const source = (observation.body?.measurement?.sources ?? []).find(
  (candidate) => candidate?.source === PROJECTED_SOURCE,
);
check(
  'projected source present',
  source !== undefined,
  `the observation has no ${PROJECTED_SOURCE} source`,
);
if (source !== undefined) {
  check(
    'frontier is committed',
    source.latestUpstreamMeasuredAt === frontier.takenAt,
    `the observation reports the upstream frontier as measured at ` +
      `${String(source.latestUpstreamMeasuredAt)} and the committed ${FRONTIER} was taken at ` +
      `${String(frontier.takenAt)}. The frontier run behind the published upstream date is ` +
      `not in the repository — re-run scripts/n2-coverage-frontier.mts and commit it with ` +
      `the observation.`,
  );
  check(
    'frontier decision date',
    source.latestUpstreamDecisionDate === (frontier.corpusWide?.newestUpstreamDecision ?? null),
    `the observation publishes newest upstream decision ` +
      `${String(source.latestUpstreamDecisionDate)}, the committed frontier says ` +
      `${String(frontier.corpusWide?.newestUpstreamDecision)}`,
  );
}

console.log(`checked ${checked.length} freshness bindings against ${where}`);
if (violations.length) {
  console.error(`\n${violations.length} VIOLATION(S) — the published freshness observation binds evidence this tree does not have:`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`OK — ${OBSERVATION} binds ${PARITY} at ${sha256(parityBytes).slice(0, 12)}…, and the definition, measurement and frontier behind it are all present.`);
