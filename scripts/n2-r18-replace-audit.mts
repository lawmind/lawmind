/**
 * NEW2 — R18. AUDIT OF THE `REPLACE` CLASS.
 *
 * A replacement is the only proposal in this round that puts a NEW value on a
 * canonical row, so it gets its own look. Two questions the class summary cannot
 * answer:
 *
 *   1. is the PROPOSED citation's series token a real one — a token with a home
 *      court — or is the replacement swapping one OCR-mangled series for another
 *   2. does the proposed value differ from the stored value only in the `-DB`
 *      suffix, i.e. is it the §4 boundary defect rather than an ownership defect
 *
 * Pure derivation over committed artifacts. No database, no network.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs/ai/new2-r18');
const NL = String.fromCharCode(10);

const ckpt = JSON.parse(readFileSync(join(DIR, 'reparse-checkpoint.json'), 'utf8'));
const homeOf = new Map<string, string>(Object.entries(ckpt.tokenHomeMap as Record<string, string>));
const totals = ckpt.tokenTotals as Record<string, { total: number; home: string | null; share: number }>;
const tokenOf = (c: string | null): string | null => (c ? (/^\d{4}:([A-Z][A-Z-]{1,13}):/.exec(c)?.[1] ?? null) : null);
const strip = (c: string): string => c.replace(/-(?:DB|FB)$/, '');

type Row = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  currentStoredNeutralCitation: string;
  proposedValue: string | null;
  reasonClass: string;
  candidateVerdictTier: string;
  sourceObjectKey: string | null;
};
const rows: Row[] = readFileSync(join(DIR, 'existing-correction-population.jsonl'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as Row)
  .filter((r) => r.reasonClass === 'REPLACE_WITH_DIFFERENT_OWN_CITATION');

const audited = rows.map((r) => {
  const st = tokenOf(r.currentStoredNeutralCitation);
  const pt = tokenOf(r.proposedValue);
  const suffixOnly = r.proposedValue !== null && strip(r.proposedValue) === strip(r.currentStoredNeutralCitation);
  const proposedTokenHome = pt ? (homeOf.get(pt) ?? null) : null;
  const proposedTokenRows = pt ? (totals[pt]?.total ?? 0) : 0;
  const storedTokenHome = st ? (homeOf.get(st) ?? null) : null;
  // The DIRECTION is the finding, not the fact that the token moved. A stored
  // token no court owns and a proposed token this court does own is an OCR
  // repair; the reverse REPLACES A CORRECT SERIES WITH A DAMAGED ONE, and
  // identity anchoring cannot tell the two apart because both occurrences sit
  // beside the row's own case number.
  const direction =
    st === pt
      ? 'unchanged'
      : storedTokenHome === null && proposedTokenHome !== null
        ? 'DAMAGED_TO_PLACED'
        : storedTokenHome !== null && proposedTokenHome === null
          ? 'PLACED_TO_DAMAGED'
          : storedTokenHome === null && proposedTokenHome === null
            ? 'DAMAGED_TO_DAMAGED'
            : 'PLACED_TO_PLACED';
  const kind = suffixOnly
    ? 'SUFFIX_ONLY_the_-DB_boundary_defect'
    : st !== pt
      ? 'SERIES_TOKEN_CHANGED_' + direction
      : 'SAME_SERIES_DIFFERENT_NUMBER';
  return {
    judgmentId: r.judgmentId,
    court: r.court,
    caseNumber: r.caseNumber,
    stored: r.currentStoredNeutralCitation,
    proposed: r.proposedValue,
    storedToken: st,
    storedTokenHomeCourt: storedTokenHome,
    proposedToken: pt,
    proposedTokenHomeCourt: proposedTokenHome,
    proposedTokenCorpusRows: proposedTokenRows,
    proposedTokenIsThisCourts: proposedTokenHome === r.court,
    tier: r.candidateVerdictTier,
    direction,
    kind,
    sourceObjectKey: r.sourceObjectKey,
  };
});

const tally = (xs: string[]): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const x of xs) o[x] = (o[x] ?? 0) + 1;
  return o;
};
const unplaceable = audited.filter((a) => a.proposedTokenHomeCourt === null);
const artifact = {
  artifact: 'NEW2_R18_REPLACE_AUDIT',
  lane: 'NEW2',
  takenAt: new Date().toISOString(),
  note: 'a REPLACE is the only proposal here that writes a new value onto a canonical row, so the class is audited rather than counted. Every row is tier OWN_ID by construction — the audit is about the VALUE, not the ownership.',
  total: audited.length,
  byKind: tally(audited.map((a) => a.kind)),
  bySeriesDirection: tally(audited.map((a) => a.direction)),
  byCourt: tally(audited.map((a) => a.court)),
  everyRowIsIdentityAnchored: audited.every((a) => a.tier === 'OWN_ID'),
  proposedValueTokenHasNoHomeCourt: {
    count: unplaceable.length,
    why: 'an OCR-mangled series token (Rajasthan prints `RJ-JP` and the scan reads `EU-JP`, `FU-JP`, `IU-JP`). The row identity anchors WHICH occurrence is the document\'s own, and it cannot repair how that occurrence was scanned — so the proposal is correct about ownership and may still carry a damaged token. Flagged, not hidden.',
    rows: unplaceable,
  },
  rows: audited,
};
const body = JSON.stringify(artifact, null, 1) + NL;
writeFileSync(join(DIR, 'replace-audit.json'), body);
console.log('[replace] total', audited.length);
console.log('[replace] byKind', JSON.stringify(artifact.byKind, null, 1));
console.log('[replace] identity-anchored everywhere:', artifact.everyRowIsIdentityAnchored);
console.log('[replace] proposed token with no home court:', unplaceable.length);
console.log('[replace] sha256', createHash('sha256').update(body).digest('hex'));
