#!/usr/bin/env node
/**
 * NEW2 — THE PIPELINE GAP, printed as one funnel so a big number cannot hide it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE TOOL FROM EVERY COVERAGE REPORT WE HAVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every acquisition figure this lane produces answers "how much law do we
 * hold". None of them answers "how much of it can be found", and the two have
 * drifted apart far enough that quoting the first is now misleading:
 *
 *   `judgments`        7,296,068 (17 Aug)  ->  15,256,869 (18 Aug)
 *   `judgment_chunks`    620,300 (14 Aug)  ->      620,300 (18 Aug)
 *
 * NEW1 measured the consequence directly (bus, 18 Aug): the dense retrieval arm
 * is **unchanged by a 30.7% larger corpus — `recall@20` 40.6% both times, zero
 * discordant pairs across 283 queries** — because the embedded population did
 * not move. Roughly nine million documents cannot be retrieved semantically at
 * all, and no report that prints a corpus total says so.
 *
 * So this prints the funnel, in pipeline order, with each stage as a percentage
 * OF THE STAGE ABOVE IT. A stage that is 4% of its parent is visible; the same
 * fact expressed as "620,300 chunks" is not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT DOES NOT OWN — OR GUESS AT — CHUNKING AND EMBEDDING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Those are LCC's and NEW1's. This tool reads and reports; it has no `--apply`
 * and writes nothing but its own JSON. The standing direction is to EXPOSE the
 * gap, not to close it from this lane.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIER-A ELIGIBILITY IS REPORTED AS A RANGE, NOT A NUMBER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1 needs a selector for substantive authorities. `hc_document_class` is
 * that selector, and it covers a small fraction of the corpus — so "how many
 * documents are Tier-A eligible" has two honest answers and they are far apart:
 *
 *   CONFIRMED  rows classified `decided` today.
 *   POSSIBLE   confirmed, plus every row no classifier has assessed, since an
 *              unassessed row is not a row known to be procedural.
 *
 * Printing only the first understates the work by an order of magnitude;
 * printing only the second reads as a promise. Both are printed, and the gap
 * between them IS the classification backlog — which is the point.
 *
 *   node --env-file=.env scripts/migration/new2-semantic-backlog.mjs [--json]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sslFor } from './new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-semantic-backlog.json');

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set — run with node --env-file=.env');
  process.exit(2);
}

const sql = postgres(url, { ssl: sslFor(url), max: 1, idle_timeout: 20, connect_timeout: 60, prepare: false });

try {
  /**
   * ONE pass over `judgments` for every count that comes from it.
   *
   * `count(*) FILTER (WHERE …)` rather than six separate statements: the table
   * is 15M rows and ~65 GB, eight ingest scopes are writing to it, and six
   * sequential scans would both cost six times as much and produce six
   * snapshots taken minutes apart — a funnel whose stages disagree because they
   * were measured at different times is worse than no funnel.
   */
  const [j] = await sql`
    SELECT
      count(*)::bigint                                                          AS written,
      count(*) FILTER (WHERE hc_class_method IS NOT NULL)::bigint               AS assessed,
      count(hc_document_class)::bigint                                          AS classified,
      count(*) FILTER (WHERE hc_document_class = 'decided')::bigint             AS decided,
      count(*) FILTER (WHERE hc_document_class = 'decided_brief')::bigint       AS decided_brief,
      count(*) FILTER (WHERE hc_class_method IS NULL)::bigint                   AS never_assessed,
      count(*) FILTER (WHERE hc_class_method LIKE 'unclassified_disposal:%')::bigint AS unclassified_disposal,
      count(*) FILTER (WHERE hc_class_method = 'no_disposal_nature')::bigint    AS no_disposal
    FROM judgments`;

  /**
   * Chunks and their embedded subset, from the chunk table's own perspective —
   * and the DISTINCT judgment counts beside them, which is the number that
   * belongs in a document funnel. 620,300 chunks over some smaller number of
   * documents is the shape that has been quoted as though it were documents.
   */
  const [c] = await sql`
    SELECT
      count(*)::bigint                                                AS chunks,
      count(*) FILTER (WHERE embedding IS NOT NULL)::bigint           AS chunks_embedded,
      count(DISTINCT judgment_id)::bigint                             AS documents_chunked,
      count(DISTINCT judgment_id) FILTER (WHERE embedding IS NOT NULL)::bigint AS documents_embedded
    FROM judgment_chunks`;

  const n = (v) => Number(v);
  const written = n(j.written);
  const stages = [
    { stage: 'written', count: written, of: null },
    { stage: 'assessed by a classifier', count: n(j.assessed), of: 'written' },
    { stage: 'classified (a class, not a refusal)', count: n(j.classified), of: 'assessed by a classifier' },
    { stage: 'Tier-A CONFIRMED (decided)', count: n(j.decided), of: 'classified (a class, not a refusal)' },
    { stage: 'chunked (distinct documents)', count: n(c.documents_chunked), of: 'written' },
    { stage: 'embedded (distinct documents)', count: n(c.documents_embedded), of: 'chunked (distinct documents)' },
  ];

  const byName = new Map(stages.map((s) => [s.stage, s.count]));
  for (const s of stages) s.pctOfParent = s.of ? Number(((100 * s.count) / (byName.get(s.of) || 1)).toFixed(2)) : 100;
  for (const s of stages) s.pctOfCorpus = Number(((100 * s.count) / written).toFixed(2));

  const tierAPossible = n(j.decided) + n(j.never_assessed);

  const report = {
    tool: 'new2-semantic-backlog',
    takenAt: new Date().toISOString(),
    stages,
    classificationResidue: {
      neverAssessed: n(j.never_assessed),
      unclassifiedDisposal: n(j.unclassified_disposal),
      noDisposalNature: n(j.no_disposal),
      note:
        'unclassifiedDisposal means a classifier LOOKED and no rule claimed the row. ' +
        'neverAssessed means nothing has looked. hc_class_method is what separates them; ' +
        'hc_document_class IS NULL cannot.',
    },
    tierA: {
      confirmed: n(j.decided),
      confirmedIncludingBrief: n(j.decided) + n(j.decided_brief),
      possibleUpperBound: tierAPossible,
      note:
        'possibleUpperBound adds every never-assessed row, because an unassessed row is not ' +
        'a row known to be procedural. The distance between confirmed and possible IS the ' +
        'classification backlog and must not be reported as a single figure.',
    },
    chunks: { total: n(c.chunks), embedded: n(c.chunks_embedded) },
    unretrievable: {
      documents: written - n(c.documents_embedded),
      note: 'Documents held with no embedded chunk. These cannot be reached by the dense arm at all.',
    },
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!process.argv.includes('--json')) {
    const f = (x) => x.toLocaleString().padStart(12);
    console.log(`\nSEMANTIC BACKLOG — ${report.takenAt}\n`);
    console.log(`  ${'stage'.padEnd(38)} ${'count'.padStart(12)}  ${'of parent'.padStart(9)}  of corpus`);
    for (const s of stages) {
      console.log(
        `  ${s.stage.padEnd(38)} ${f(s.count)}  ${`${s.pctOfParent}%`.padStart(9)}  ${`${s.pctOfCorpus}%`.padStart(9)}`,
      );
    }
    console.log(`\n  NOT REACHABLE BY THE DENSE ARM      ${f(report.unretrievable.documents)}`);
    console.log(`\n  Tier-A confirmed (decided)          ${f(report.tierA.confirmed)}`);
    console.log(`  Tier-A possible (+ never assessed)  ${f(report.tierA.possibleUpperBound)}`);
    console.log(`\n  never assessed                      ${f(report.classificationResidue.neverAssessed)}`);
    console.log(`  looked at, no rule claimed it       ${f(report.classificationResidue.unclassifiedDisposal)}`);
    console.log(`  source field empty                  ${f(report.classificationResidue.noDisposalNature)}`);
    console.log(`\n  wrote ${OUT.replace(ROOT, '.')}\n`);
  } else {
    console.log(JSON.stringify(report));
  }
} finally {
  await sql.end({ timeout: 5 });
}
