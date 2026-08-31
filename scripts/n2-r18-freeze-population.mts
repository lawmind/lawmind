/**
 * NEW2 — R18 §5. THE IMMUTABLE CORRECTION CANDIDATE POPULATION.
 *
 * Reads the exhaustive walk's output and freezes every row the committed
 * extractor no longer agrees with. Nothing here writes a `judgments` row:
 * `EXISTING_CORRECTIONS_APPLIED = NO`.
 *
 * TWO FILES, on purpose. The population is 17k rows and a pretty-printed object
 * of that size is not a document anyone reads — it is a blob that hides what it
 * contains. So the rows go to a compact JSONL that is hashed as a whole, and the
 * header JSON beside it carries the id, the hash, the scope, the counts and a
 * readable sample per class. The hash is over the JSONL bytes, so "unchanged" is
 * checkable with one command.
 *
 * UNTESTABLE rows are NOT in the population. They are not correction candidates
 * — nothing can be proposed for a document whose text the damage screen rejects
 * — so they are counted in §6 as CURRENT_UNKNOWN and left out of a file whose
 * every row claims a proposal.
 *
 * Read-only. Database (evidence quotes for the sample only), no network.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs/ai/new2-r18');
const IN = join(DIR, 'candidate-rows.jsonl');
const CKPT = join(DIR, 'reparse-checkpoint.json');
const ROWS_OUT = join(DIR, 'existing-correction-population.jsonl');
const OUT = join(DIR, 'existing-correction-population.json');
const EXTRACTOR = 'services/ingest/src/harvest/hc-load.ts';
const NL = String.fromCharCode(10);
const S3 = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/';
const SAMPLE_PER_CLASS = 20;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}
const git = (...a: string[]): string => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

type Cand = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  judgmentDate: string | null;
  sourceUrl: string | null;
  contentHash: string | null;
  storedNeutralCitation: string;
  storedToken: string | null;
  tokenHomeCourt: string | null;
  tokenCorpusRows: number;
  offCourt: boolean;
  storedFoundInText: boolean;
  storedIsEligibleOccurrence: boolean;
  storedOccurrenceTiers: string[];
  candidateFromCommittedExtractor: string | null;
  candidateTier: string;
  distinctEligibleCitationsInText: number;
  reasonClass: string;
};

/** Rows that carry a proposal. UNTESTABLE does not, and is counted elsewhere. */
const IN_POPULATION = new Set([
  'CLEAR_TO_NULL',
  'REPLACE_WITH_DIFFERENT_OWN_CITATION',
  'AMBIGUOUS',
  'NOT_A_NEUTRAL_CITATION_DATE_STAMP',
  'SOURCE_GENUINE_FOREIGN_CITATION',
]);
const PROPOSAL: Record<string, string> = {
  CLEAR_TO_NULL: 'NO_SAFE_OWN_CITATION',
  NOT_A_NEUTRAL_CITATION_DATE_STAMP: 'NO_SAFE_OWN_CITATION',
  REPLACE_WITH_DIFFERENT_OWN_CITATION: 'OWN_NEUTRAL_CITATION',
  AMBIGUOUS: 'HUMAN_ADJUDICATION_REQUIRED',
  SOURCE_GENUINE_FOREIGN_CITATION: 'UNCHANGED_SOURCE_TRUTH',
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const all: Cand[] = readFileSync(IN, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Cand);
  const ckpt = JSON.parse(readFileSync(CKPT, 'utf8'));

  const untestable = all.filter((c) => !IN_POPULATION.has(c.reasonClass));
  const pop = all
    .filter((c) => IN_POPULATION.has(c.reasonClass))
    .sort((a, b) => (a.judgmentId < b.judgmentId ? -1 : 1));
  console.log(`[freeze] ${all.length} non-confirmed rows, ${pop.length} carry a proposal, ${untestable.length} do not`);

  // ---- the frozen rows ------------------------------------------------------
  writeFileSync(ROWS_OUT, '');
  const lines: string[] = [];
  for (const c of pop) {
    lines.push(
      JSON.stringify({
        judgmentId: c.judgmentId,
        court: c.court,
        caseNumber: c.caseNumber,
        cnr: c.cnr,
        judgmentDate: c.judgmentDate,
        // The retained source object IS the primary evidence pointer. The bucket
        // prefix is constant and dropped; the key is what identifies the object.
        sourceObjectKey: (c.sourceUrl ?? '').startsWith(S3) ? (c.sourceUrl ?? '').slice(S3.length) : c.sourceUrl,
        contentHash: c.contentHash,
        currentStoredNeutralCitation: c.storedNeutralCitation,
        proposedState: PROPOSAL[c.reasonClass],
        proposedValue: c.reasonClass === 'REPLACE_WITH_DIFFERENT_OWN_CITATION' ? c.candidateFromCommittedExtractor : null,
        reasonClass: c.reasonClass,
        storedFoundInText: c.storedFoundInText,
        storedIsEligibleOccurrence: c.storedIsEligibleOccurrence,
        storedOccurrenceVerdicts: c.storedOccurrenceTiers,
        candidateVerdictTier: c.candidateTier,
        distinctEligibleCitationsInText: c.distinctEligibleCitationsInText,
        seriesToken: c.storedToken,
        seriesHomeCourt: c.tokenHomeCourt,
        seriesIsAnotherCourts: c.offCourt,
      }),
    );
  }
  const body = lines.join(NL) + NL;
  appendFileSync(ROWS_OUT, body);
  const populationHash = createHash('sha256').update(body).digest('hex');
  const populationId = `NEW2-R18-EXISTING-${populationHash.slice(0, 16)}`;

  // ---- a readable sample, with the document quoted ---------------------------
  const wanted: Cand[] = [];
  const per: Record<string, number> = {};
  for (const c of pop) {
    per[c.reasonClass] = (per[c.reasonClass] ?? 0) + 1;
    if (per[c.reasonClass]! <= SAMPLE_PER_CLASS) wanted.push(c);
  }
  const quotes = new Map<string, string>();
  const ids = wanted.map((c) => c.judgmentId);
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await sql<{ id: string; full_text: string | null }[]>`
      SELECT id, full_text FROM judgments WHERE id = ANY(${ids.slice(i, i + 200)}::uuid[])`;
    const byId = new Map(rows.map((r) => [r.id, r.full_text ?? '']));
    for (const c of wanted.slice(i, i + 200)) {
      const t = byId.get(c.judgmentId) ?? '';
      const anchor = c.candidateFromCommittedExtractor ?? c.storedNeutralCitation;
      const at = t.indexOf(anchor);
      quotes.set(
        c.judgmentId,
        at < 0 ? `(${JSON.stringify(anchor)} does not occur in the retained text)` : t.slice(Math.max(0, at - 190), at + anchor.length + 130).replace(/\s+/g, ' ').trim(),
      );
    }
  }

  const tally = (xs: string[]): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const x of xs) o[x] = (o[x] ?? 0) + 1;
    return o;
  };
  const byClass = tally(pop.map((c) => c.reasonClass));
  const byCourt = tally(pop.map((c) => c.court));

  const artifact = {
    artifact: 'NEW2_R18_EXISTING_CORRECTION_POPULATION',
    lane: 'NEW2',
    takenAt: new Date().toISOString(),
    applied: false,
    EXISTING_CORRECTIONS_APPLIED: 'NO',
    CITATION_BULK_APPLY: 'HOLD',
    FINAL_FALSIFIER_RUN: 'NO',
    authorisation:
      'none sought and none implied. This population is evidence for a separate authorisation round; nothing in this round writes a judgments row.',
    rowsFile: 'existing-correction-population.jsonl',
    rowsFileSha256: populationHash,
    populationId,
    populationHash,
    size: pop.length,
    scope: {
      basis: 'EXHAUSTIVE',
      definition:
        'every AWS Open Data High Court row carrying a non-empty neutral_citation, walked on the judgments_neutral_citation_key expression index with a (key, id) keyset',
      rowsEvaluated: ckpt.rowsEvaluated,
      walkStartedAt: ckpt.startedAt,
      walkFinishedAt: ckpt.updatedAt,
      walkClasses: ckpt.classes,
      excludedFromPopulation: {
        UNTESTABLE: untestable.length,
        why: 'the damage screen rejects the retained text, or the row carries no year partition. Nothing can be PROPOSED for a document that cannot be read, so these are counted as CURRENT_UNKNOWN in §6 and are not given a proposal here.',
      },
    },
    extractorVersion: {
      path: EXTRACTOR,
      sha256: createHash('sha256').update(readFileSync(join(ROOT, EXTRACTOR))).digest('hex'),
      lastCommitTouchingIt: git('log', '-1', '--format=%H', '--', EXTRACTOR),
      uncommittedChangesPresent: git('status', '--porcelain', '--', EXTRACTOR).length > 0,
      repositoryHead: git('rev-parse', 'HEAD'),
    },
    summary: {
      CORRECTION_POPULATION_COUNT: pop.length,
      CLEAR_TO_NULL: byClass['CLEAR_TO_NULL'] ?? 0,
      REPLACE_WITH_DIFFERENT_OWN_CITATION: byClass['REPLACE_WITH_DIFFERENT_OWN_CITATION'] ?? 0,
      AMBIGUOUS: byClass['AMBIGUOUS'] ?? 0,
      NOT_A_NEUTRAL_CITATION_DATE_STAMP: byClass['NOT_A_NEUTRAL_CITATION_DATE_STAMP'] ?? 0,
      SOURCE_GENUINE_FOREIGN_CITATION: byClass['SOURCE_GENUINE_FOREIGN_CITATION'] ?? 0,
      UNTESTABLE_not_in_population: untestable.length,
      UNCHANGED_CONFIRMED: (ckpt.classes?.UNCHANGED_CONFIRMED ?? 0) as number,
      byCourt,
    },
    sample: wanted.map((c) => ({
      judgmentId: c.judgmentId,
      court: c.court,
      caseNumber: c.caseNumber,
      currentStoredNeutralCitation: c.storedNeutralCitation,
      proposedState: PROPOSAL[c.reasonClass],
      proposedValue: c.reasonClass === 'REPLACE_WITH_DIFFERENT_OWN_CITATION' ? c.candidateFromCommittedExtractor : null,
      reasonClass: c.reasonClass,
      storedOccurrenceVerdicts: c.storedOccurrenceTiers,
      candidateVerdictTier: c.candidateTier,
      distinctEligibleCitationsInText: c.distinctEligibleCitationsInText,
      sourceObjectKey: (c.sourceUrl ?? '').startsWith(S3) ? (c.sourceUrl ?? '').slice(S3.length) : c.sourceUrl,
      contentHash: c.contentHash,
      retainedTextQuote: quotes.get(c.judgmentId) ?? null,
    })),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1) + NL);
  console.log('[freeze] populationId  ', populationId);
  console.log('[freeze] populationHash', populationHash);
  console.log('[freeze] summary', JSON.stringify(artifact.summary, null, 1));
  console.log('[freeze] wrote', ROWS_OUT);
  console.log('[freeze] wrote', OUT);
} finally {
  await sql.end();
}
