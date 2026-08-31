/**
 * NEW2 R15 — the independent citation falsifier report.
 *
 * LCC shipped the connected-matter cohort gate at `bd2aa74a`. This lane does not
 * accept LCC's tests as the falsifier, so this is a SEPARATE run on a SEPARATE
 * population against the committed resolver.
 *
 * The instrument is `scripts/n2-citation-falsifier-r14.mts`, salted to a new
 * round. `--salt NEW2-R15-2026-08-31` changes the sampling rank, so R15 draws
 * 3,600 rows that overlap R14's by 254 (7.06%). A falsifier that re-drew the
 * rows the fix was written from would be measuring the fix against its own
 * evidence.
 *
 * One change to the instrument was NOT cosmetic and is the reason this round
 * can see anything at all: `resolveBatch` now takes `{ raw, citingJudgmentId }`
 * and answers `SELF_REFERENCE`. Passing a bare string still compiles, still
 * runs, and SILENTLY DISABLES that branch. Measured directly on three known
 * self-edges: bare string -> UNIQUE, reference form -> SELF_REFERENCE. A
 * falsifier that kept passing strings would have reported a clean self-edge
 * class by never reaching the code that decides one.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-citation-falsifier-r15-report.mts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.tmp-new2/r15');
const OUTDIR = join(ROOT, 'docs/ai/new2-r15');
mkdirSync(OUTDIR, { recursive: true });

type Adj = {
  edgeId: string;
  stratum: string;
  raw: string;
  key: string | null;
  resolverState: string;
  heldCandidates: number;
  pinned: string | null;
  verdict: string;
  reasons: string[];
  courtCheck: string;
  yearCheck: string;
  titleCorroboration: string;
  identityBasis: string;
  selfPin: boolean;
};

const pkg = JSON.parse(readFileSync(join(WORK, 'blind-package.meta.json'), 'utf8'));
const adj: Adj[] = readFileSync(join(WORK, 'adjudicated.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));
const reach = JSON.parse(readFileSync(join(WORK, 'cohort-reachability.json'), 'utf8'));
const caseExposure = JSON.parse(readFileSync(join(WORK, 'cause-title-case-exposure.json'), 'utf8'));

const r14pkg = JSON.parse(readFileSync(join(ROOT, 'docs/ai/new2-r14/blind-package.json'), 'utf8'));
const r14ids = new Set(
  readFileSync(join(ROOT, 'docs/ai/new2-r14/blind-package.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l).edgeId as string),
);
const overlap = adj.filter((a) => r14ids.has(a.edgeId)).length;

const tallyBy = <T,>(rows: T[], f: (r: T) => string) => {
  const t: Record<string, number> = {};
  for (const r of rows) t[f(r)] = (t[f(r)] ?? 0) + 1;
  return t;
};
const byStratum: Record<string, Record<string, number>> = {};
for (const a of adj) {
  byStratum[a.stratum] ??= {};
  byStratum[a.stratum]![a.resolverState] = (byStratum[a.stratum]![a.resolverState] ?? 0) + 1;
}

const falsePin = adj.filter((a) => a.verdict === 'FALSE_PIN').length;
const falseUnique = adj.filter((a) => a.verdict === 'FALSE_UNIQUE').length;
const ambiguous = adj.filter((a) => a.resolverState === 'AMBIGUOUS').length;
const untestable = adj.filter((a) => a.verdict === 'UNTESTABLE').length;

const report = {
  artifact: 'NEW2_R15_INDEPENDENT_CITATION_FALSIFIER',
  lane: 'NEW2',
  measuredAt: new Date().toISOString(),
  subject: {
    resolverGateCommit: 'bd2aa74a',
    what: 'the connected-matter / common-order cohort gate and the self-reference branch, as committed by LCC',
    verifiedCurrent:
      'services/api/src/citations/ was clean at HEAD when this ran; the gate is at HEAD, not in a working tree',
    lccClaimsNotInherited:
      "LCC's own tests were not run, read for correctness, or counted. Every number here comes from this lane's instrument on this lane's population.",
  },
  population: {
    newPopulationId: `NEW2-R15-PKG-${String(pkg.packageSha256).slice(0, 16)}`,
    packageSha256: pkg.packageSha256,
    sampled: pkg.sampledTotal,
    edgesScanned: pkg.edgesScanned,
    strata: pkg.strata,
    independenceFromR14: {
      r14PackageSha256: r14pkg.packageSha256,
      sharedEdges: overlap,
      sharedPercent: Number(((100 * overlap) / adj.length).toFixed(2)),
      note: 'the residual overlap is the small strata, which are taken whole; the two packages are different draws',
    },
    frozenR14CandidatesUntouched: [
      'docs/ai/new2-r14/citation-apply-candidate.json',
      'docs/ai/new2-r14/citation-apply-candidate-v2-no-self.json',
    ],
  },
  instrumentCorrection: {
    what: 'both resolve sites now pass { raw, citingJudgmentId } instead of a bare string',
    why: 'resolveBatch accepts either. The string form compiles, runs, and never reaches the SELF_REFERENCE branch.',
    provedDirectly: [
      { raw: '2025:AHC:79018', bareString: 'UNIQUE', referenceForm: 'SELF_REFERENCE' },
      { raw: '2023:KHC:33727', bareString: 'UNIQUE', referenceForm: 'SELF_REFERENCE' },
      { raw: '2025:BHC-AUG:6358', bareString: 'UNIQUE', referenceForm: 'SELF_REFERENCE' },
    ],
    consequence:
      'a falsifier that kept the string form would report a clean self-edge class without ever testing one',
  },
  results: {
    FALSE_PIN: falsePin,
    FALSE_UNIQUE: falseUnique,
    AMBIGUOUS: ambiguous,
    UNTESTABLE: untestable,
    resolverStateTally: tallyBy(adj, (a) => a.resolverState),
    verdictTally: tallyBy(adj, (a) => a.verdict),
    byStratum,
  },
  requiredRetests: {
    selfEdgeClass: {
      state: 'PASS',
      observed: adj.filter((a) => a.resolverState === 'SELF_REFERENCE').length,
      of: adj.length,
      note: 'the citer claiming the key now ends the question. R14 scored 1,146 of its 3,600 as SELF_EDGE while the resolver still called them UNIQUE; here 1,917 are refused at source. The extra rows are multi-candidate keys R14 answered AMBIGUOUS — a class that also moved into this branch.',
    },
    aliases: {
      state: 'PASS_WITH_A_KNOWN_STRUCTURAL_LIMIT',
      observed: byStratum['A_ALIAS_PATH'] ?? {},
      note: 'all 400 alias-path rows resolve UNIQUE and none is contradicted. The alias table carries a UNIQUE index, so this path can never return AMBIGUOUS; that limit is unchanged by this gate and is not evidence about it.',
    },
    crossCourtCollisions: {
      state: 'PASS',
      observed: byStratum['F_CROSS_COURT_COLLISION'] ?? {},
      note: '396 of 400 answered AMBIGUOUS and 4 SELF_REFERENCE. No cross-court key was pinned.',
    },
    predictionBlindPositives: {
      state: 'PASS',
      observed: adj.filter((a) => a.resolverState === 'UNIQUE').length,
      contradicted: falsePin,
      note: 'the package was written and hashed before any resolution existed; nothing here was selected after seeing a prediction.',
    },
    predictionBlindNegatives: {
      state: 'PASS',
      refusedForm: byStratum['I_REFUSED_FORM'] ?? {},
      targetNotHeld: byStratum['H_TARGET_NOT_HELD'] ?? {},
      note: '400 of 400 malformed strings refused before any lookup; 400 of 400 well-formed citations we do not hold answered TARGET_NOT_HELD. Neither difficult negative produced a pin.',
    },
    connectedMatterCommonOrder: {
      state: 'NOT_PASSED — UNTESTABLE ON THIS POPULATION, AND A FALSE NEGATIVE FOUND',
      gateReached: reach.cohortGateReached,
      gateVerdicts: reach.cohortVerdicts,
      declaredMattersHistogram: reach.declaredMattersHistogram,
      note: 'the gate was reached on every would-be-UNIQUE row and refused none — but it saw NO evidence on any of them.',
    },
  },
};

const finding = {
  id: 'NEW2-R15-F1',
  title:
    'the cohort gate reads matter numbers case-sensitively, so it fails OPEN on every title-case cause title',
  severity: 'the gate misses about as many cohorts as it catches',
  mechanism:
    "MATTER_LONG and MATTER_SLASH in services/api/src/citations/cohort.ts capture the matter TYPE as [A-Z][A-Z.&'-]* — upper case only. A cause title printing `(Civil Appeal No. 2047 of 2007)` yields zero matters; the same string upper-cased yields one.",
  provedPure: [
    { input: '(Civil appeal No. 2047 of 2007)', declaredMatters: 0 },
    { input: '(CIVIL APPEAL No. 2047 of 2007)', declaredMatters: 1 },
    {
      input: 'WRIT PETITION No. 123 of 2020 / WITH / WRIT PETITION No. 456 of 2020',
      declaredMatters: 2,
      connector: 'WITH',
    },
    {
      input: 'Writ Petition No. 123 of 2020 / With / Writ Petition No. 456 of 2020',
      declaredMatters: 0,
      connector: 'WITH',
    },
  ],
  whyItFailsOpen:
    'the connector is matched case-INSENSITIVELY while the matters are not, so a genuine two-matter common order in title case yields connector=WITH and declaredMatters=0. `declaredMatters > heldCandidates` is then `0 > 1`, false, and the reference is told it is the only one.',
  observedInThisRound: {
    gateEvaluations: reach.cohortGateReached,
    everyOneSawZeroMatters: true,
    reachedByStratum: reach.reachedByStratum,
    note: '472 of 472 would-be-UNIQUE rows had a READABLE cause title (causeTitleAvailable true, or the verdict would have been INSUFFICIENT_TO_PROVE_UNIQUE) and zero declared matters. Not one declared even the single matter an ordinary judgment prints.',
  },
  corpusExposure: {
    method:
      'a court-stratified md5 sample of key-bearing judgments, each head read twice — as the gate reads it, and upper-cased. The delta is exactly what letter case costs.',
    sampled: caseExposure.sampled,
    ...caseExposure.totals,
    readZeroPercent: Number(
      ((100 * caseExposure.totals.readZero) / caseExposure.totals.n).toFixed(2),
    ),
    recoveredAnyPercent: Number(
      ((100 * caseExposure.totals.recoveredAny) / caseExposure.totals.n).toFixed(2),
    ),
    joinedCohortMissedPercent: Number(
      ((100 * caseExposure.totals.recoveredCohort) / caseExposure.totals.n).toFixed(2),
    ),
    byCourt: caseExposure.byCourt,
    reading:
      'recoveredCohort is the shape the gate exists to refuse — a printed connector AND two or more matters — visible only once case is removed. 78 of 4,000 is 1.95%, the same order as the 1.48% recall cost the gate was measured to pay for the ones it does catch.',
  },
  whatThisIsNot: [
    'it is not a false PIN: nothing observed here pins a wrong judgment, and FALSE_PIN is 0 in 3,600',
    'it is not a claim that the gate is wrong where it fires; where it reads matters it behaves as documented',
    'it is not measured on query traffic, and the 1.95% is of key-bearing judgments, not of user searches',
  ],
  owner: "LCC — services/api/** is outside this lane's write set. No fix was attempted here.",
  suggestedShape: 'match the matter type case-insensitively, as the connector already is.',
  whyTheSuiteIsGreenAnyway:
    'cohort.test.ts already CONTAINS a title-case matter line and does not notice. The JHHC_24297 fixture prints `Miscellaneous Appeal No. 134 of 2018` on line 6; it is silently unmatched, and the assertion still passes because the same matter is also printed upper-case as `M.A. No. 134 of 2018` on line 2. Every matter an assertion actually depends on is upper case, so no test in the file can fail on letter case. A title-case-only fixture is the missing test.',
};

const gate = {
  FALSE_PIN: falsePin,
  FALSE_UNIQUE: falseUnique,
  AMBIGUOUS: ambiguous,
  UNTESTABLE: untestable,
  connectedMatterClass: 'NOT_PASSED',
  CITATION_BULK_APPLY: 'HOLD',
  why: [
    'the connected-matter class — the class the gate was built for and the one R14 failed on — is not demonstrated by this round. The gate ran on all 472 would-be-UNIQUE rows and had no evidence on any of them.',
    'independent of the sample, 1.95% of key-bearing judgments carry a joined multi-matter cohort the gate cannot see at all, because of letter case.',
    'a gate that cannot fire is not a gate that found nothing to fire on, and applying 1.5M edges on the strength of that distinction is exactly the failure this round exists to prevent.',
  ],
  newApplyPopulationFrozen: false,
  newApplyPopulationNote:
    'no apply candidate was frozen. A candidate binds rows to a resolver version, and this one is going to change: freezing 6.05M references against a resolver already known to be blind on this class would produce a hash that has to be thrown away. The population identity of record for this round is the blind package, not a candidate.',
};

const body = JSON.stringify({ ...report, finding, gate }, null, 1);
writeFileSync(join(OUTDIR, 'citation-falsifier-r15.json'), body);
writeFileSync(
  join(OUTDIR, 'falsifier-adjudicated.jsonl'),
  readFileSync(join(WORK, 'adjudicated.jsonl')),
);
writeFileSync(join(OUTDIR, 'cohort-reachability.json'), JSON.stringify(reach, null, 1));
writeFileSync(
  join(OUTDIR, 'cause-title-case-exposure.json'),
  JSON.stringify(caseExposure, null, 1),
);
writeFileSync(
  join(OUTDIR, 'citation-falsifier-r15.sha256'),
  `${createHash('sha256').update(body).digest('hex')}  citation-falsifier-r15.json\n`,
);
console.log(JSON.stringify({ population: report.population.newPopulationId, ...gate }, null, 1));
