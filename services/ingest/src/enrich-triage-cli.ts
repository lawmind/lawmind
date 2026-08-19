/**
 * `node --import tsx --env-file=.env services/ingest/src/enrich-triage-cli.ts --task case_structure`
 *
 * WHY THE REJECTED CLAIMS WERE REJECTED. No model calls, no writes.
 *
 * Reads `raw_output` for every stored enrichment of a task, re-derives its
 * claims, re-runs the REAL verifier, and then diagnoses each claim the verifier
 * refused. `enrich-cli --reverify` already proves this is free: verification is
 * a pure function of (stored output, source text), which is the entire reason
 * `raw_output` is persisted.
 *
 * It writes nothing. `--examples <n>` prints worked cases per bucket, because a
 * bucket count with no example is a claim nobody can check.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  type Claim,
  type EnrichTask,
  MIN_EVIDENCE_CHARS,
  PROMPT_VERSION,
  claimsFromArguments,
  claimsFromAuthorities,
  claimsFromCaseStructure,
  claimsFromCitations,
  claimsFromHolding,
  claimsFromMetadata,
  claimsFromTopics,
  claimsFromTreatment,
  parseJson,
  verifyClaims,
} from './enrich.ts';
import {
  type Bucket,
  BUCKET_OWNER,
  diagnose,
  divergence,
  looksLikePageFurniture,
  reconstructWithSkips,
  substitutionAlign,
} from './enrich-triage.ts';
import { openDb } from './db-host.ts';

const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const TASK = arg('--task', 'case_structure') as EnrichTask;
const EXAMPLES = Number(arg('--examples', '3'));
const OUT = arg('--out', '');
/** Print the divergence point for every claim in one bucket. `--drill truncation_drift` */
const DRILL = arg('--drill', '');
const DRILL_LIMIT = Number(arg('--drill-limit', '40'));

/**
 * The excerpt window, reproduced from `enrich-cli.ts` rather than imported —
 * importing that module runs the worker. A copy is a drift risk, so it is not
 * trusted: every row's reconstruction is checked against the stored
 * `input_hash`, and any mismatch is REPORTED rather than silently tolerated.
 * If these constants ever diverge, the run says so instead of mis-attributing
 * excerpt artefacts to the model.
 */
const OBJECT_BUDGET = 28_000;
const OBJECT_HEAD = 20_000;
const OBJECT_TAIL = 8_000;
const HEAD_CHARS = 4_000;
const LEGAL_OBJECT: ReadonlySet<string> = new Set([
  'case_structure',
  'holding',
  'arguments',
  'authorities',
  'topics',
]);

function legalObjectExcerpt(fullText: string): string {
  if (fullText.length <= OBJECT_BUDGET) return fullText;
  return `${fullText.slice(0, OBJECT_HEAD)}\n\n[… omitted from this excerpt …]\n\n${fullText.slice(-OBJECT_TAIL)}`;
}

function excerptFor(task: EnrichTask, fullText: string): string {
  if (LEGAL_OBJECT.has(task)) return legalObjectExcerpt(fullText);
  return fullText.slice(0, task === 'citation_extraction' ? HEAD_CHARS * 2 : HEAD_CHARS);
}

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

function claimsFor(task: EnrichTask, parsed: unknown): Claim[] {
  if (task === 'metadata') return claimsFromMetadata(parsed);
  if (task === 'citation_extraction') return claimsFromCitations(parsed);
  if (task === 'case_structure') return claimsFromCaseStructure(parsed);
  if (task === 'holding') return claimsFromHolding(parsed);
  if (task === 'arguments') return claimsFromArguments(parsed);
  if (task === 'authorities') return claimsFromAuthorities(parsed);
  if (task === 'topics') return claimsFromTopics(parsed);
  return claimsFromTreatment(parsed);
}

const sql = await openDb(process.env['DATABASE_URL']!, 2);

const rows = await sql<
  { id: string; judgmentId: string; rawOutput: string; inputHash: string }[]
>`
  SELECT id, judgment_id AS "judgmentId", raw_output AS "rawOutput", input_hash AS "inputHash"
  FROM document_enrichments
  WHERE task = ${TASK} AND status = 'ok' AND raw_output IS NOT NULL
  ORDER BY created_at`;

console.log('REJECTION TRIAGE');
console.log('='.repeat(78));
console.log(`task ${TASK} · prompt ${PROMPT_VERSION} · stored rows ${rows.length} · no model calls, no writes`);

const bucketTally = new Map<Bucket, number>();
const kindTally = new Map<string, { total: number; bad: number }>();
const bucketByKind = new Map<string, Map<Bucket, number>>();
const examples = new Map<Bucket, { judgmentId: string; kind: string; quote: string; ratio: number }[]>();
let claimsTotal = 0;
let claimsBad = 0;
let excerptMismatch = 0;
let drilled = 0;
let missingText = 0;
let unparseable = 0;

for (const row of rows) {
  const [src] = await sql<{ fullText: string }[]>`
    SELECT full_text AS "fullText" FROM judgments WHERE id = ${row.judgmentId}`;
  const fullText = src?.fullText ?? '';
  if (!fullText) {
    missingText++;
    continue;
  }
  const parsed = parseJson(row.rawOutput);
  if (parsed === null) {
    unparseable++;
    continue;
  }
  const excerpt = excerptFor(TASK, fullText);
  /* The reconstruction is CHECKED, not assumed. A mismatch means the window
   * moved since the pass ran, and every elision verdict below it would be
   * measuring the wrong excerpt. */
  const reproduced = sha256(`${TASK}|${PROMPT_VERSION}|${excerpt}`) === row.inputHash;
  if (!reproduced) excerptMismatch++;

  const claims = claimsFor(TASK, parsed);
  const verdicts = verifyClaims(claims, fullText);
  for (const v of verdicts) {
    claimsTotal++;
    const k = kindTally.get(v.claim.kind) ?? { total: 0, bad: 0 };
    k.total++;
    if (v.verified) {
      kindTally.set(v.claim.kind, k);
      continue;
    }
    k.bad++;
    kindTally.set(v.claim.kind, k);
    claimsBad++;
    const d = diagnose({
      quote: v.claim.evidence ?? '',
      sourceText: fullText,
      /* An unreproducible excerpt must not be allowed to PROVE an excerpt
       * artefact, so it is withheld from the diagnosis rather than guessed. */
      excerpt: reproduced ? excerpt : '',
      minEvidenceChars: MIN_EVIDENCE_CHARS,
    });
    bucketTally.set(d.bucket, (bucketTally.get(d.bucket) ?? 0) + 1);
    const bk = bucketByKind.get(v.claim.kind) ?? new Map<Bucket, number>();
    bk.set(d.bucket, (bk.get(d.bucket) ?? 0) + 1);
    bucketByKind.set(v.claim.kind, bk);
    if (DRILL && d.bucket === DRILL && drilled < DRILL_LIMIT) {
      drilled++;
      const dv = divergence(v.claim.evidence ?? '', fullText);
      console.log(`\n[${drilled}] ${row.judgmentId}  ${v.claim.kind}  matched ${dv.at}/${d.quoteLen} chars`);
      console.log(`  QUOTE  …${dv.quoteNext}`);
      console.log(`  SOURCE …${dv.sourceNext}`);
      const rec = reconstructWithSkips(v.claim.evidence ?? '', fullText);
      for (const s of rec.skips) {
        console.log(`  SKIPPED@${s.atQuoteChar} ${looksLikePageFurniture(s.text) ? '[furniture]' : '[TEXT]'} "${s.text}"`);
      }
      const sub = substitutionAlign(v.claim.evidence ?? '', fullText);
      if (sub.diffs.length > 0) {
        console.log(
          `  CHARS  ${sub.ok ? 'aligned' : 'gave up'}: ${sub.diffs.map((c) => `${c.at}:'${c.quoteChar}'≠'${c.sourceChar}'`).join(' ')}`,
        );
      }
    }
    const ex = examples.get(d.bucket) ?? [];
    if (ex.length < EXAMPLES) {
      ex.push({
        judgmentId: row.judgmentId,
        kind: v.claim.kind,
        quote: (v.claim.evidence ?? '').slice(0, 260),
        ratio: Number(d.matchRatio.toFixed(2)),
      });
      examples.set(d.bucket, ex);
    }
  }
}

console.log('');
console.log(`claims ${claimsTotal} · verified ${claimsTotal - claimsBad} · rejected ${claimsBad}`);
console.log(
  `verification rate ${claimsTotal === 0 ? 0 : (((claimsTotal - claimsBad) / claimsTotal) * 100).toFixed(1)}%`,
);
if (missingText) console.log(`rows skipped, source text gone: ${missingText}`);
if (unparseable) console.log(`rows skipped, raw output unparseable: ${unparseable}`);
console.log(
  excerptMismatch === 0
    ? 'excerpt reproduced from input_hash for every row'
    : `WARNING: excerpt could not be reproduced for ${excerptMismatch} rows — elision verdicts withheld there`,
);

console.log('');
console.log('BY CAUSE');
console.log('-'.repeat(78));
const owners = new Map<string, number>();
for (const [bucket, n] of [...bucketTally.entries()].sort((a, b) => b[1] - a[1])) {
  const owner = BUCKET_OWNER[bucket];
  owners.set(owner, (owners.get(owner) ?? 0) + n);
  console.log(
    `${bucket.padEnd(22)} ${String(n).padStart(5)}  ${((n / Math.max(1, claimsBad)) * 100).toFixed(1).padStart(5)}%  owner: ${owner}`,
  );
}
console.log('');
console.log('BY OWNER');
console.log('-'.repeat(78));
for (const [owner, n] of [...owners.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${owner.padEnd(22)} ${String(n).padStart(5)}  ${((n / Math.max(1, claimsBad)) * 100).toFixed(1).padStart(5)}%`);
}

console.log('');
console.log('BY CLAIM KIND');
console.log('-'.repeat(78));
for (const [kind, k] of [...kindTally.entries()].sort((a, b) => b[1].bad - a[1].bad)) {
  const top = [...(bucketByKind.get(kind) ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([b, n]) => `${b} ${n}`)
    .join(', ');
  console.log(
    `${kind.padEnd(20)} total ${String(k.total).padStart(5)}  rejected ${String(k.bad).padStart(4)}  ${((k.bad / Math.max(1, k.total)) * 100).toFixed(1).padStart(5)}%  ${top}`,
  );
}

console.log('');
console.log('WORKED EXAMPLES');
console.log('-'.repeat(78));
for (const [bucket, ex] of examples.entries()) {
  console.log(`\n## ${bucket}  (owner: ${BUCKET_OWNER[bucket]})`);
  for (const e of ex) {
    console.log(`  ${e.judgmentId}  ${e.kind}  verbatim-match ${(e.ratio * 100).toFixed(0)}%`);
    console.log(`    "${e.quote.replace(/\s+/g, ' ')}"`);
  }
}

if (OUT) {
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        task: TASK,
        claimsTotal,
        claimsBad,
        excerptMismatch,
        buckets: Object.fromEntries(bucketTally),
        owners: Object.fromEntries(owners),
        byKind: Object.fromEntries([...kindTally.entries()].map(([k, v]) => [k, v])),
        bucketByKind: Object.fromEntries([...bucketByKind.entries()].map(([k, v]) => [k, Object.fromEntries(v)])),
        examples: Object.fromEntries(examples),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
}

console.log('\nRESULTS');
await sql.end();
process.exit(0);
