/**
 * NEW2 R24 — how readable are the sources the edge candidates came from?
 *
 * `n2-r24-edges.mts` blocks a candidate whose source text cannot be read AT ALL.
 * It deliberately does NOT block on a quality score, because the score we have
 * certifies garbage: 1,187 of 1,187 measured unreadable rows sit above the 0.85
 * `text_quality` floor (`docs/ai/new2-r10`). A guard built on it would refuse
 * good sources and admit damaged ones, which is worse than recording the fact.
 *
 * So readability travels with every candidate as evidence, and this is its
 * census — computed by streaming the frozen population, no database, so it can
 * be re-derived from the same file the manifest hashes.
 *
 * Usage: pnpm exec tsx scripts/n2-r24-edge-readability.mts
 */
import { createInterface } from 'node:readline';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r24');
const POPULATION = join(OUT, 'edge-candidate-population.jsonl');

const frozen = JSON.parse(readFileSync(join(OUT, 'edge-candidate-population.json'), 'utf8')) as {
  populationId: string;
  candidates: number;
  populationFile: { lines: number };
};

const bucketOf = (quality: unknown): string => {
  if (quality === 'UNKNOWN' || quality === null || quality === undefined) return 'UNKNOWN';
  const value = Number(quality);
  if (!Number.isFinite(value)) return 'UNPARSEABLE';
  if (value < 0.5) return '<0.50';
  if (value < 0.85) return '0.50-0.85';
  if (value < 0.95) return '0.85-0.95';
  return '>=0.95';
};

const textQuality: Record<string, number> = {};
const scriptQuality: Record<string, number> = {};
const resolutionPath: Record<string, number> = {};
const crossCourt: Record<string, number> = {};
/**
 * Target concentration. `judgment_citation_aliases` has a UNIQUE index on
 * `alias_key`, so an alias can never resolve AMBIGUOUS — its uniqueness is
 * guaranteed by the index rather than observed in the corpus. With almost every
 * candidate arriving on that path, how few judgments absorb how many candidates
 * is the number an auditor should see first.
 */
const perTarget = new Map<string, number>();
let lines = 0;

for await (const line of createInterface({ input: createReadStream(POPULATION, 'utf8'), crlfDelay: Infinity })) {
  if (line.length === 0) continue;
  lines += 1;
  const row = JSON.parse(line) as Record<string, unknown>;
  const tq = bucketOf(row['sourceTextQuality']);
  textQuality[tq] = (textQuality[tq] ?? 0) + 1;
  const sq = String(row['sourceScriptQuality'] ?? 'UNKNOWN');
  scriptQuality[sq] = (scriptQuality[sq] ?? 0) + 1;
  const rp = String(row['resolutionPath'] ?? 'UNKNOWN');
  resolutionPath[rp] = (resolutionPath[rp] ?? 0) + 1;
  const cc = String(row['crossCourt']);
  crossCourt[cc] = (crossCourt[cc] ?? 0) + 1;
  const target = String(row['targetJudgmentId']);
  perTarget.set(target, (perTarget.get(target) ?? 0) + 1);
}

const ranked = [...perTarget.entries()].sort((a, b) => b[1] - a[1]);
const total = lines || 1;
const cumulative = (take: number): number => ranked.slice(0, take).reduce((sum, [, n]) => sum + n, 0);

const artifact = {
  artifact: 'NEW2_R24_EDGE_CANDIDATE_SOURCE_READABILITY',
  populationId: frozen.populationId,
  linesRead: lines,
  linesExpected: frozen.populationFile.lines,
  agreesWithFrozenCount: lines === frozen.populationFile.lines,
  sourceTextQuality: textQuality,
  sourceScriptQuality: scriptQuality,
  resolutionPath,
  crossCourt,
  targetConcentration: {
    distinctTargets: ranked.length,
    busiestTarget: ranked[0] ? { judgmentId: ranked[0][0], candidates: ranked[0][1] } : null,
    top10Candidates: cumulative(10),
    top100Candidates: cumulative(100),
    top1000Candidates: cumulative(1000),
    top10Share: Number((cumulative(10) / total).toFixed(4)),
    top100Share: Number((cumulative(100) / total).toFixed(4)),
    top1000Share: Number((cumulative(1000) / total).toFixed(4)),
    note:
      'An alias key is UNIQUE by index, so the alias path can never report AMBIGUOUS. Its uniqueness is a ' +
      'property of the index, not an observation about the corpus, and almost every candidate here arrives on it.',
  },
  guardNote:
    'Readability is EVIDENCE on the candidate, never a block. The generator refuses a candidate only ' +
    'when the source text is absent, because text_quality is known to score unreadable documents above ' +
    'its own floor and a guard built on it would refuse good sources while admitting damaged ones.',
};
writeFileSync(join(OUT, 'edge-candidate-source-readability.json'), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ lines, textQuality, scriptQuality, resolutionPath, crossCourt, targetConcentration: artifact.targetConcentration }, null, 1));
