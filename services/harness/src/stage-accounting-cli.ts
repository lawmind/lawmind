/**
 * `pnpm --filter @lawmind/harness stage:accounting` — P0.5. Does the Tier-A walk
 * ACCOUNT FOR every document it has walked, which is a different question from
 * "is it 100% staged"?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ACCOUNTING IS TAKEN FROM THE WALK'S OWN LOG AND NOT FROM A BIG JOIN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious implementation — join `judgment_embedding_eligibility` to
 * `judgments` to `new1_doc_vector_stage` and group — is correct and was written
 * first. It exceeded a 900-second budget on this box while the walk was staging,
 * which is the cost of three full passes over 18.7M rows to answer a question the
 * walk already answers for free, batch by batch, as it goes.
 *
 * Every `STAGE DONE` line carries the complete disposition of its batch, decided
 * against the LIVE eligibility view at the moment it ran:
 *
 *   rowsInBatch = inserted + skippedNowIneligible + skippedTextUnsafe
 *               + skippedAlreadyStaged + skippedNoText
 *
 * Summing those is an accounting of exactly the population the walk has reached,
 * with each document's disposition attributed to the rule that decided it. It
 * costs nothing, it cannot contend with the walk, and it is the honest answer to
 * "what has this run done so far".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CANNOT SAY, AND SAYS SO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The MANIFEST denominator (8,846,550 rows, `manifest-tier-a.json`) was generated
 * under eligibility definition `e76879ab6bbcd452` on 19 Aug. The deployed
 * definition is now `2e7b53afe35fa81c` — three revisions later, and two of those
 * revisions CHANGED WHICH DOCUMENTS ARE ELIGIBLE (bail orders became reachable,
 * then cited authorities were exempted from the refused classes). So the manifest
 * is a stale population, and a percentage against it would be a percentage of the
 * wrong denominator.
 *
 * This therefore reports the walked population exactly, the manifest as a
 * REFERENCE with its staleness stated, and the corpus-wide re-derivation as
 * DEFERRED — a measurement to take in a quiet window, never one to fake.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { createHash } from 'node:crypto';

import postgres from 'postgres';

import { sslFor } from './db-url.js';

const LOG = new URL('../../../docs/ai/new1-tier-a/stage-embed.log', import.meta.url);
const MANIFEST = new URL(
  '../../../docs/ai/embedding-manifests/document-vectors/manifest-tier-a.json',
  import.meta.url,
);
const OUT = new URL('../../../docs/ai/new1-tier-a/stage-accounting.json', import.meta.url);

type Done = {
  batchFile: string;
  rowsInBatch: number;
  inserted: number;
  skippedNoText: number;
  skippedNowIneligible: number;
  skippedTextUnsafe: number;
  skippedAlreadyStaged: number;
  admittedCitedAuthority?: number;
  skippedByRefusedClass?: Record<string, number>;
  finishedAt: string;
};

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');

  // ── the walk's own record, one line per completed batch ───────────────────
  const text = readFileSync(LOG, 'utf8').replace(/\0/g, '');
  const seen = new Map<string, Done>();
  for (const line of text.split('\n')) {
    const at = line.indexOf('STAGE DONE ');
    if (at === -1) continue;
    try {
      const d = JSON.parse(line.slice(at + 'STAGE DONE '.length)) as Done;
      // A batch re-walked after a restart replaces its earlier line: the later
      // run is the one whose dispositions reflect the current contract.
      seen.set(d.batchFile, d);
    } catch {
      /* a torn line from a killed run */
    }
  }
  const done = [...seen.values()];

  /**
   * A field the early batches did not write counts as ZERO, and the batches that
   * predate it are counted separately.
   *
   * The first batches of this run were written before `skippedNowIneligible`,
   * `skippedTextUnsafe` and `skippedAlreadyStaged` existed — the walk gained each
   * of them as the contract gained a refusal. Summing a missing field as `NaN`
   * poisons the whole accounting into a single meaningless value, and defaulting
   * it silently would attribute those rows to nothing. So they default to zero
   * AND `batchesPredatingFields` says how many lines could not answer.
   */
  const num = (x: number | undefined): number =>
    typeof x === 'number' && Number.isFinite(x) ? x : 0;
  const sum = (f: (d: Done) => number | undefined): number =>
    done.reduce((a, d) => a + num(f(d)), 0);
  const walked = sum((d) => d.rowsInBatch);
  const acc = {
    STAGED_THIS_RUN: sum((d) => d.inserted),
    ALREADY_STAGED: sum((d) => d.skippedAlreadyStaged),
    REFUSED_TEXT_UNSAFE: sum((d) => d.skippedTextUnsafe),
    REFUSED_CLASS_OR_TIER: sum((d) => d.skippedNowIneligible),
    NO_TEXT: sum((d) => d.skippedNoText),
    ADMITTED_AS_CITED_AUTHORITY: sum((d) => d.admittedCitedAuthority),
  };
  const batchesPredatingFields = done.filter(
    (d) =>
      d.skippedTextUnsafe === undefined ||
      d.skippedNowIneligible === undefined ||
      d.skippedAlreadyStaged === undefined,
  ).length;
  const attributed =
    acc.STAGED_THIS_RUN +
    acc.ALREADY_STAGED +
    acc.REFUSED_TEXT_UNSAFE +
    acc.REFUSED_CLASS_OR_TIER +
    acc.NO_TEXT;
  const unattributed = walked - attributed;

  /**
   * Split the residual by WHICH LOG FORMAT produced it, because the two mean
   * opposite things.
   *
   * A batch written before the refusal counters existed cannot attribute its
   * skips — the run knew what it was doing, the line just has nowhere to record
   * it. A batch written by the CURRENT format that still fails to add up is a
   * real hole, and that is the number the verdict must react to.
   */
  const residualOf = (d: Done): number =>
    num(d.rowsInBatch) -
    (num(d.inserted) +
      num(d.skippedNoText) +
      num(d.skippedNowIneligible) +
      num(d.skippedTextUnsafe) +
      num(d.skippedAlreadyStaged));
  const legacy = done.filter((d) => d.skippedTextUnsafe === undefined);
  const unattributedLegacy = legacy.reduce((a, d) => a + Math.max(0, residualOf(d)), 0);
  const unattributedCurrent = unattributed - unattributedLegacy;

  const refusedClasses: Record<string, number> = {};
  for (const d of done)
    for (const [k, v] of Object.entries(d.skippedByRefusedClass ?? {}))
      refusedClasses[k] = (refusedClasses[k] ?? 0) + v;

  // ── the only DB reads, both indexed counts ────────────────────────────────
  const sql = postgres(url, {
    max: 1,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 120_000 },
  });
  const [t] = await sql<{ stage: string; refused: string }[]>`
    SELECT (SELECT count(*)::text FROM new1_doc_vector_stage) AS stage,
           (SELECT count(*)::text FROM new1_doc_vector_stage_refused) AS refused`;
  const [v] = await sql<{ def: string }[]>`
    SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const viewHash = createHash('sha256').update(v!.def).digest('hex').slice(0, 16);
  await sql.end();

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    rowsEmitted: number;
    definitionHash: string;
    generatedAt: string;
  };

  const out = {
    kind: 'new1_stage_accounting',
    measuredAt: new Date().toISOString(),
    method:
      'summed from the walk’s own STAGE DONE lines; each disposition was decided against the LIVE eligibility view when that batch ran',
    deployedViewHash: viewHash,
    batchesCompleted: done.length,
    batchesPredatingRefusalFields: batchesPredatingFields,
    walkedRows: walked,
    accounting: acc,
    unattributedRows: unattributed,
    unattributedByCause: {
      LEGACY_LOG_FORMAT: unattributedLegacy,
      CURRENT_FORMAT_UNEXPLAINED: unattributedCurrent,
      note: 'legacy = batches from 19 Aug written before the refusal counters existed; those rows were decided, the line cannot say how. Only the current-format figure is a hole.',
    },
    refusedByClass: refusedClasses,
    liveTables: { stageRows: Number(t!.stage), quarantineRows: Number(t!.refused) },
    manifestReference: {
      rowsEmitted: manifest.rowsEmitted,
      definitionHash: manifest.definitionHash,
      generatedAt: manifest.generatedAt,
      deployedNow: viewHash,
      stale: manifest.definitionHash !== viewHash,
      warning:
        'the manifest population was generated under an older eligibility definition, and two later revisions changed WHICH documents are eligible. A completion percentage against it would use the wrong denominator.',
    },
    corpusWidePopulation:
      'DEFERRED — the three-way join over 18.7M rows exceeded a 900s budget while the walk was staging. Take it in a quiet window; do not estimate it.',
    verdict:
      unattributedCurrent === 0
        ? `EVERY walked document under the current log format is accounted for: staged, already staged, or refused by a named rule. ${unattributedLegacy} rows sit in 19-Aug batches whose format could not record a refusal reason.`
        : `${unattributedCurrent} walked rows carry no disposition under the CURRENT format — a real hole; investigate before trusting the coverage figure.`,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

await main();
