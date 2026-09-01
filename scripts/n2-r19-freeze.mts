/**
 * NEW2 — R19 §7. THE FROZEN DETERMINISTIC CORRECTION CANDIDATE.
 *
 * What survives R19 is not what R18 proposed. Of the four destructive rules the
 * adjudication produced, the prediction-blind reading refuted three outright, so
 * the population frozen here is deliberately much smaller than R18's 20,556: it
 * holds only the rows whose disposition rests on evidence a reader confirmed
 * without seeing the rule.
 *
 * It is named a CANDIDATE and nothing stronger. `CITATION_BULK_APPLY` is HOLD,
 * the -DB rows are quarantined until LCC reports committed API/ingest citation-
 * key parity, and no row in this file may be written to `judgments` on the
 * strength of this round.
 *
 * The hash is over the population's IDENTITY LINES — `judgmentId:current>proposed`
 * joined — the same construction R17 and R18 used, so the three are comparable
 * without reading three file formats.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-freeze.mts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r19');
const NL = String.fromCharCode(10);

const SAFE_NULL_RULES = new Set(['D1_MONTH_IN_SERIES_POSITION']);
const SAFE_REPLACE_RULES = new Set(['R4a_TWO_SIDED_CNR', 'R4b_TWO_SIDED_CASE_NUMBER']);
const QUARANTINE_RULES = new Set(['R3_SUFFIX_ONLY']);

type Adj = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  r18Class: string;
  stored: string;
  proposed: string | null;
  verdict: string;
  rule: string;
  destructive: string;
  evidence: Record<string, unknown>;
  firstWindow: string | null;
};

const adj = readFileSync(join(OUTDIR, 'adjudication.jsonl'), 'utf8')
  .split(NL).filter((l) => l.trim()).map((l) => JSON.parse(l) as Adj);
const dbRows = readFileSync(join(OUTDIR, 'db-suffix-rows.jsonl'), 'utf8')
  .split(NL).filter((l) => l.trim()).map((l) => JSON.parse(l) as { judgmentId: string; klass: string; storedNeutralCitation: string; suffixedForm: string; court: string });
const dbById = new Map(dbRows.map((r) => [r.judgmentId, r]));

const score1 = JSON.parse(readFileSync(join(OUTDIR, 'blind-score.json'), 'utf8')) as { byRule: Record<string, { n: number; falseDestructive: number }> };
const score2 = JSON.parse(readFileSync(join(OUTDIR, 'blind-score-2.json'), 'utf8')) as { byRule: Record<string, { n: number; falseDestructive: number }> };
const blindPerRule: Record<string, { adjudicated: number; falseDestructive: number }> = {};
for (const s of [score1, score2])
  for (const [rule, c] of Object.entries(s.byRule)) {
    const e = (blindPerRule[rule] ??= { adjudicated: 0, falseDestructive: 0 });
    e.adjudicated += c.n;
    e.falseDestructive += c.falseDestructive;
  }

const rows: unknown[] = [];
const identity: string[] = [];
const counts: Record<string, number> = {};
const bump = (k: string): void => {
  counts[k] = (counts[k] ?? 0) + 1;
};

for (const a of adj) {
  const inDbQuarantine = QUARANTINE_RULES.has(a.rule) || dbById.has(a.judgmentId);
  let disposition: string;
  if (inDbQuarantine) disposition = 'DB_SUFFIX_QUARANTINE';
  else if (SAFE_NULL_RULES.has(a.rule)) disposition = 'DETERMINISTIC_TO_NULL';
  else if (SAFE_REPLACE_RULES.has(a.rule)) disposition = 'DETERMINISTIC_TO_REPLACE';
  else disposition = 'NO_ACTION';
  bump(disposition);
  bump(`${disposition} :: ${a.verdict}`);
  if (disposition === 'NO_ACTION') continue;

  const proposed = disposition === 'DETERMINISTIC_TO_NULL' ? null : a.proposed;
  identity.push(`${a.judgmentId}:${a.stored}>${proposed ?? ''}`);
  rows.push({
    judgmentId: a.judgmentId,
    court: a.court,
    caseNumber: a.caseNumber,
    cnr: a.cnr,
    r18Class: a.r18Class,
    r19Verdict: a.verdict,
    r19Rule: a.rule,
    disposition,
    currentStoredNeutralCitation: a.stored,
    proposedValue: proposed,
    blindValidation: blindPerRule[a.rule] ?? null,
    evidence: a.evidence,
    quarantine: dbById.get(a.judgmentId) ?? null,
    firstWindow: a.firstWindow,
  });
}

const ROWS_FILE = join(OUTDIR, 'r19-candidate-population.jsonl');
writeFileSync(ROWS_FILE, rows.map((r) => JSON.stringify(r)).join(NL) + NL);
const populationHash = createHash('sha256').update(identity.join(NL)).digest('hex');
const rowsFileSha = createHash('sha256').update(readFileSync(ROWS_FILE)).digest('hex');

const summary = {
  artifact: 'NEW2_R19_DETERMINISTIC_CORRECTION_CANDIDATE',
  lane: 'NEW2',
  takenAt: new Date().toISOString(),
  naming:
    'CANDIDATE, deliberately. Not an apply population, not authorised, not safe-to-apply. Possible disposition is ELIGIBLE_FOR_SEPARATE_CORRECTION_AUDIT and nothing beyond it.',
  EXISTING_CORRECTIONS_APPLIED: 'NO',
  CITATION_BULK_APPLY: 'HOLD',
  FINAL_CITATION_FALSIFIER_RUN: 'NO',
  DB_MIGRATION: 'NONE',
  input: {
    r18PopulationId: 'NEW2-R18-EXISTING-9679cff06d0e6404',
    r18PopulationHash: '9679cff06d0e6404ac10481695f1ee4858f8f625755537a75086dcb981f303c9',
    r18Rows: adj.length,
  },
  populationId: `NEW2-R19-EXISTING-${populationHash.slice(0, 16)}`,
  populationHash,
  hashConstruction: 'sha256 over the newline-joined identity lines `judgmentId:current>proposed`, the construction R17 and R18 used',
  rowsFile: 'r19-candidate-population.jsonl',
  rowsFileSha256: rowsFileSha,
  size: rows.length,
  counts,
  blindValidationPerRule: blindPerRule,
  dispositionRules: {
    DETERMINISTIC_TO_NULL: [...SAFE_NULL_RULES],
    DETERMINISTIC_TO_REPLACE: [...SAFE_REPLACE_RULES],
    DB_SUFFIX_QUARANTINE: 'every row in db-suffix-rows.jsonl, plus the one REPLACE whose proposal differs from the stored value only by a printed -DB suffix',
    NO_ACTION: 'everything else, including all three rules the prediction-blind reading refuted',
  },
};
writeFileSync(join(OUTDIR, 'r19-candidate-population.json'), JSON.stringify(summary, null, 1) + NL);
console.log(JSON.stringify({ id: summary.populationId, size: rows.length, counts }, null, 1));
