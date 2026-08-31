/**
 * NEW2 — R17 §5. THE CANDIDATE CORRECTION POPULATION FOR ROWS ALREADY WRITTEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE APPLIES NOTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A safe future extractor does not authorise rewriting canonical judgments that
 * are already in front of advocates. `EXISTING_CORRECTIONS_APPLIED = NO` is a
 * property of this round, not a step that was skipped: the population below is
 * frozen, hashed and left for a separate authorisation round to inspect.
 *
 * Every proposed correction binds, per the round's requirement:
 *   judgment identity · current extracted citation · corrected state and value ·
 *   primary evidence · reason · extractor version · population hash
 *
 * The corrected state may be `NO_SAFE_OWN_CITATION`. **No replacement citation is
 * invented where the court printed none** — that is the whole defect being
 * corrected, and doing it in the other direction would be the same mistake.
 *
 * Scope is deliberately narrow: the 550 documents of the frozen evaluation
 * population, every one of which carries an adjudicated expected answer. A
 * corpus-wide sweep would produce a larger population with no evidence attached
 * to each row, and an unevidenced correction is not a correction.
 *
 * Pure transform of committed artifacts. No database, no network.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r17-existing-corrections.mts
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const ARMS = join(ROOT, arg('arms', 'docs/ai/new2-r17/arms-scored.json'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r17/existing-correction-population.json'));

const EXTRACTOR = 'services/ingest/src/harvest/hc-load.ts';

type Judged = {
  judgmentId: string;
  stratum: string;
  court: string;
  date: string;
  caseNumber: string | null;
  cnr: string | null;
  storedNeutralCitation: string | null;
  expected: string;
  expectedCitation: string | null;
  expectedWhy: string;
  handAdjudicated: boolean;
  predictions: Record<string, string | null>;
  evidence: string;
};

const arms = JSON.parse(readFileSync(ARMS, 'utf8')) as {
  takenAt: string;
  population: { populationId: string; populationHash: string; size: number };
  judged: Judged[];
};

/** The exact bytes of the extractor these corrections were computed from. */
const extractorSha = createHash('sha256').update(readFileSync(join(ROOT, EXTRACTOR))).digest('hex');
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const extractorCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', EXTRACTOR], { cwd: ROOT })
  .toString()
  .trim();
const extractorDirty =
  execFileSync('git', ['status', '--porcelain', '--', EXTRACTOR], { cwd: ROOT }).toString().trim() !== '';

const corrections = arms.judged
  .filter((j) => j.storedNeutralCitation !== j.predictions['SHIPPED'])
  .map((j) => {
    const proposed = j.predictions['SHIPPED'] ?? null;
    const correctedState = proposed === null ? 'NO_SAFE_OWN_CITATION' : 'OWN_NEUTRAL_CITATION';
    /**
     * Does the adjudicated truth support the change? Recorded per row rather
     * than assumed, because a correction the evidence does not back is exactly
     * what a separate authorisation round has to be able to see.
     */
    const supported =
      j.expected === 'OWN'
        ? proposed === j.expectedCitation
        : j.expected === 'NONE' || j.expected === 'AMBIGUOUS' || j.expected === 'UNTESTABLE'
          ? proposed === null
          : false;
    return {
      judgmentId: j.judgmentId,
      court: j.court,
      judgmentDate: j.date,
      caseNumber: j.caseNumber,
      cnr: j.cnr,
      currentExtractedCitation: j.storedNeutralCitation,
      correctedState,
      correctedValue: proposed,
      adjudicatedExpectation: j.expected,
      adjudicatedCitation: j.expectedCitation,
      evidenceSupportsCorrection: supported,
      primaryEvidence: j.evidence,
      reason: j.expectedWhy,
      handAdjudicated: j.handAdjudicated,
      stratum: j.stratum,
    };
  })
  .sort((a, b) => (a.judgmentId < b.judgmentId ? -1 : 1));

const identity = corrections
  .map((c) => `${c.judgmentId}:${c.currentExtractedCitation ?? ''}>${c.correctedValue ?? 'NULL'}`)
  .join('\n');
const populationHash = createHash('sha256').update(identity).digest('hex');
const populationId = `NEW2-R17-EXISTING-${populationHash.slice(0, 16)}`;

const tally = (xs: (string | boolean)[]): Record<string, number> =>
  xs.reduce<Record<string, number>>((a, v) => ((a[String(v)] = (a[String(v)] ?? 0) + 1), a), {});

const artifact = {
  artifact: 'NEW2_R17_EXISTING_CORRECTION_POPULATION',
  lane: 'NEW2',
  takenAt: new Date().toISOString(),
  applied: false,
  EXISTING_CORRECTIONS_APPLIED: 'NO',
  authorisation:
    'none sought and none implied. This population is evidence for a separate authorisation round; nothing in this round writes a judgments row.',
  extractorVersion: {
    path: EXTRACTOR,
    sha256: extractorSha,
    lastCommitTouchingIt: extractorCommit,
    uncommittedChangesPresent: extractorDirty,
    repositoryHead: headSha,
  },
  source: {
    arms: 'docs/ai/new2-r17/arms-scored.json',
    armsTakenAt: arms.takenAt,
    evaluationPopulationId: arms.population.populationId,
    evaluationPopulationHash: arms.population.populationHash,
    evaluationSize: arms.population.size,
  },
  populationId,
  populationHash,
  size: corrections.length,
  summary: {
    byCorrectedState: tally(corrections.map((c) => c.correctedState)),
    byEvidenceSupport: tally(corrections.map((c) => c.evidenceSupportsCorrection)),
    byStratum: tally(corrections.map((c) => c.stratum)),
    toNoSafeOwnCitation: corrections.filter((c) => c.correctedValue === null).length,
    toADifferentCitation: corrections.filter((c) => c.correctedValue !== null && c.currentExtractedCitation !== null)
      .length,
    fromNullToACitation: corrections.filter((c) => c.currentExtractedCitation === null && c.correctedValue !== null)
      .length,
  },
  corrections,
};

const body = JSON.stringify(artifact, null, 2);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body + '\n');
console.log('[existing]', populationId, 'size', corrections.length);
console.log('[existing]', JSON.stringify(artifact.summary, null, 1));
console.log('[existing] extractor sha256', extractorSha, 'dirty', extractorDirty);
console.log('[existing] wrote', OUT);
