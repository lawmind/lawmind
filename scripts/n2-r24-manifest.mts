/**
 * NEW2 R24 immutable artifact manifest.
 *
 * Hashes every committed R24 artifact, so a later audit can prove it is reading
 * the bytes this round produced. Run LAST, after Phase A and Phase B — it
 * deliberately refuses if any expected artifact is missing, because a manifest
 * over a partial round is a manifest that certifies a hole.
 *
 * The row-level candidate population is not hashed here: it is gitignored, and
 * its sha256, line count and byte count live inside
 * `edge-candidate-population.json`, which IS hashed here.
 *
 * Usage: pnpm exec tsx scripts/n2-r24-manifest.mts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r24');

const FILES = [
  'r24-exec-manifest.json',
  'prewrite-live-check.json',
  'transaction-result.json',
  'postcommit-readback.json',
  'receipt.json',
  'receipt-hash.json',
  'edge-candidate-population.json',
  'edge-candidate-source-readability.json',
  'furniture-guard-reach.json',
  'edge-falsifier.json',
  'zero-mutation-proof.json',
] as const;

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(join(OUT, name), 'utf8')) as T;

const files: Record<string, string> = {};
for (const name of FILES) files[name] = sha(readFileSync(join(OUT, name), 'utf8'));

const receipt = readJson<{ canonicalCorrection: string; execution: { populationId: string; populationHash: string } }>('receipt.json');
const receiptHash = readJson<{ sha256: string }>('receipt-hash.json');
const edges = readJson<{ populationId: string; populationHash: string; candidates: number; populationFile: { sha256: string; lines: number; bytes: number } }>(
  'edge-candidate-population.json',
);
const falsifier = readJson<{ readyForIndependentAudit: string }>('edge-falsifier.json');
const zero = readJson<{ edgesChangedByR24: number | string; aliasesChangedByR24: number | string; citationBulkApply: string }>('zero-mutation-proof.json');

if (files['receipt.json'] !== receiptHash.sha256) throw new Error('receipt.json does not hash to receipt-hash.json');

writeFileSync(
  join(OUT, 'artifact-manifest.json'),
  `${JSON.stringify(
    {
      artifact: 'NEW2_R24_IMMUTABLE_ARTIFACT_MANIFEST',
      executionPopulationId: receipt.execution.populationId,
      executionPopulationHash: receipt.execution.populationHash,
      parentPopulationId: 'NEW2-R23-SAFE-e5caecc2b05a4d04',
      parentPopulationHash: 'e5caecc2b05a4d047291f4b2bad45e108b6a7135006da502cced8d5b6ab990b4',
      receiptHash: receiptHash.sha256,
      edgeCandidatePopulationId: edges.populationId,
      edgeCandidatePopulationHash: edges.populationHash,
      edgeCandidates: edges.candidates,
      edgeCandidateRowFile: edges.populationFile,
      files,
      mutationLedger: { canonicalRows: 539, edges: 0, aliases: 0, migrations: 0, network: false },
      canonicalCorrection: receipt.canonicalCorrection,
      edgesChangedByR24: zero.edgesChangedByR24,
      aliasesChangedByR24: zero.aliasesChangedByR24,
      edgePopulationReadyForIndependentAudit: falsifier.readyForIndependentAudit,
      citationBulkApply: zero.citationBulkApply,
    },
    null,
    2,
  )}\n`,
);
console.log(`artifact-manifest.json written over ${FILES.length} files`);
