/**
 * NEW2 — THE MISSING-PDF RECOVERY PILOT, drawn before anything is bought.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POPULATION, AND WHY ITS SHAPE CHANGES THE DECISION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc_ingest_ledger` records the failure side of ingest — the rows `source_url`
 * can never hold, because that column only records successes. Measured
 * 18 Aug 2026:
 *
 *   pdf_absent   160,191      pdf_failed  28,986
 *   no_text        1,554      pdf_timeout      60
 *
 * Only `pdf_absent AND permanent` is recovery-eligible; see ELIGIBLE_ONLY for
 * why `pdf_failed` is excluded and what including it would have cost.
 *
 * This closes **Step 0 of `docs/MISSING_PDF_PILOT_MANIFEST.md`**, which NEW3
 * wrote as a manifest for this lane and correctly refused to execute: *"this
 * pilot cannot proceed to a single IK call until that join exists"*. It also
 * corrects the manifest on one point — §1 names `metadata.parquet` as the place
 * the identity lives, and for the recent years that carry most of the population
 * it is `metadata-mobile.parquet`. See `metadataKeysFor` for what assuming the
 * plain variant did to the numbers.
 *
 * The standing direction is to pilot Indian Kanoon recovery on ~1,000 records
 * before committing to 58k+ lookups. Before drawing that sample, the population
 * was counted by court, and it is **not a long tail**:
 *
 *   27_1  Bombay          124,709   65.9%
 *   23_23                  29,965   15.8%
 *   9_13                   19,496   10.3%
 *   ── three courts                  92.0% ──
 *   everything else        15,078    8.0%
 *
 * That matters more than the recovery rate does. A 92%-in-three-courts
 * distribution means the decision is **"is Bombay worth recovering"**, not "is
 * provider recovery worth doing", and a sample drawn proportionally would spend
 * two thirds of its budget re-answering the same court. So the draw is
 * stratified by court AND year with recorded inclusion weights, and the small
 * courts are deliberately over-sampled relative to their share — a recovery rate
 * measured only on Bombay cannot be generalised to the courts whose gaps
 * retrieval will actually notice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A LEDGER ROW DOES NOT CONTAIN, AND WHERE THE IDENTITY COMES FROM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A ledger row is a `source_url`, a court, a year and an outcome. **There is no
 * `judgments` row to join to** — the PDF was absent, so nothing was ever
 * written. A provider lookup keyed on that alone would be matching on a
 * filename, and `CITATION_HARNESS.md`'s standard does not survive an identity
 * match made on a filename.
 *
 * The identity lives in the metadata parquet for the same partition, which
 * publishes the row whose `pdf_link` is the file we could not fetch. This pilot
 * reads it and attaches title, case number, date and disposal to every sampled
 * record, so whoever runs the provider query is matching on a case, not on a
 * string. Records where the parquet does not yield an identity are REPORTED as
 * such and excluded from the queryable set rather than sent with a thin key.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT DOES NOT CALL INDIAN KANOON, AND THAT IS DELIBERATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder authorisation for Indian Kanoon is settled and is not reopened here.
 * `INDIANKANOON_API_TOKEN` is simply not set in this environment, and
 * `harvest/indiankanoon.ts` already refuses honestly without it and already
 * carries the paise-denominated budget accounting a paid provider needs.
 *
 * So this produces the SAMPLE — stratified, weighted, identity-bearing, costed —
 * and stops. That is the half that does not need a credential, and it means the
 * lookup is one command away rather than one design away when the token lands.
 * The projected cost is printed from `indiankanoon.ts`'s own price table rather
 * than estimated here, so the number moves when the real one does.
 *
 * **Whatever the recovery rate turns out to be: provider text is not canonical.**
 * A recovered document is a pointer to an official copy to fetch, not a
 * substitute for one — `CLAUDE.md`'s raw-court-text rule is unchanged by a
 * licence to query.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/missing-pdf-pilot-cli.ts [--size 1000] [--per-court 120] \
 *     [--json ../../docs/ops/migration/new2-missing-pdf-pilot.json]
 */
import { writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';
import { mapConcurrent, parsePartitions, sampleRows, rowCount } from './harvest/hc-metadata.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const SIZE = Number(argOf('size', '1000'));
/** Cap per court so Bombay cannot eat the sample. See the header. */
const PER_COURT = Number(argOf('per-court', '120'));
const JSON_OUT = argOf('json');

/**
 * RECOVERY-ELIGIBLE means `pdf_absent AND permanent`, and the narrowing is
 * NEW3's, adopted because their reasoning is better than my first pass.
 *
 * `docs/MISSING_PDF_PILOT_MANIFEST.md` §0 draws the distinction this file
 * originally missed: `pdf_absent` is a definite 404/403/410 per
 * `ingest-ledger.ts`, so a repeated GET reads the identical absence and the
 * population is stable to sample from. **`pdf_failed` is a fetch or parse
 * failure and is NOT proof the document is absent** — paying a provider to
 * find a document that is sitting in the bucket behind a transient error is
 * spending money to work around our own retry logic.
 *
 * My first draw used `pdf_absent OR pdf_failed OR pdf_timeout` — 189,741 rows
 * against the eligible 159,651 — which would have inflated both the population
 * and any projected cost by ~19%.
 *
 * `--all-outcomes` keeps the wider set available for measuring the ledger
 * itself, which is a different question from what to buy.
 */
const ELIGIBLE_ONLY = !process.argv.includes('--all-outcomes');

type LedgerRow = {
  source_url: string;
  outcome: string;
  court_code: string;
  year: number;
  permanent: boolean;
};

/**
 * `.../data/pdf/year=2023/court=27_1/bench=bombay/FOO.pdf` -> its metadata keys.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOTH VARIANTS, AND THE FIRST VERSION READ ONLY ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A partition publishes up to two files — `metadata.parquet` and
 * `metadata-mobile.parquet` — and they are not copies of each other. Measured on
 * `year=2024/court=23_23/bench=mphc_db_gwl`:
 *
 *   metadata.parquet          2,135 rows   pdf_link `court/cnrorders/…/MPHC030012372024_1_2024-01-22.pdf`
 *   metadata-mobile.parquet  15,874 rows   pdf_link `orders_2024_206300000742024_1.pdf`
 *
 * **Different row counts AND a different filename convention.** Reading only the
 * plain variant produced a spectacular and completely false finding: identity
 * resolution appeared to collapse from 100% in 2005-2013 to 4% in 2024, which
 * reads exactly like "recent metadata is missing" and would have been reported
 * as a corpus fact about the years we most want. It was not a fact about the
 * corpus. It was this function looking in the wrong file — the unresolved
 * records were mobile-variant rows, present all along.
 *
 * The same two-variant structure is what made `HC_METADATA_SURVEY` count parquet
 * ROWS rather than documents (NEW2 bus 0692). It has now produced two different
 * wrong numbers in this repo, in opposite directions.
 */
function metadataKeysFor(
  sourceUrl: string,
): { keys: string[]; partitionId: string; file: string } | null {
  const m = sourceUrl.match(/year=(\d{4})\/court=([^/]+)\/bench=([^/]+)\/([^/]+)$/);
  if (!m) return null;
  const prefix = `metadata/parquet/year=${m[1]}/court=${m[2]}/bench=${m[3]}`;
  return {
    keys: [`${prefix}/metadata.parquet`, `${prefix}/metadata-mobile.parquet`],
    partitionId: prefix,
    file: m[4] ?? '',
  };
}

const sql = await openDb(url, 2, 10 * 60_000);

try {
  /* Population shape first — the sample is drawn against it and the report has
   * to carry it, because a rate without its denominator gets quoted alone. */
  const population = (await sql`
    SELECT court_code, year, count(*)::int AS n
    FROM hc_ingest_ledger
    WHERE ${ELIGIBLE_ONLY ? sql`outcome = 'pdf_absent' AND permanent` : sql`outcome IN ('pdf_absent','pdf_failed','pdf_timeout')`}
    GROUP BY 1,2`) as unknown as { court_code: string; year: number; n: number }[];

  const total = population.reduce((a, r) => a + r.n, 0);
  const byCourt = new Map<string, number>();
  for (const r of population) byCourt.set(r.court_code, (byCourt.get(r.court_code) ?? 0) + r.n);

  console.log(
    `\nMISSING-PDF POPULATION — ${total.toLocaleString()} records, ${byCourt.size} courts\n`,
  );
  for (const [c, n] of [...byCourt].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${c.padEnd(8)} ${String(n).padStart(8)}  ${((100 * n) / total).toFixed(1)}%`);
  }

  /**
   * The draw: capped per court, then spread across that court's years.
   *
   * `LIMIT` inside a lateral per stratum rather than one big ORDER BY random():
   * the same trap documented in `legacy-font-pilot-cli.ts` — random ordering
   * must materialise every matching row before the limit applies.
   */
  const strata = [...byCourt.keys()].map((court) => ({
    court,
    take: Math.min(
      PER_COURT,
      Math.max(1, Math.round((SIZE * (byCourt.get(court) ?? 0)) / total)),
      byCourt.get(court) ?? 0,
    ),
  }));

  const drawn: LedgerRow[] = [];
  for (const st of strata) {
    /**
     * WITHIN a court, spread across its YEARS. The first version of this query
     * was `ORDER BY year, source_url LIMIT n`, which is not a stratified draw —
     * it is the earliest years and nothing else. Bombay's ledger spans
     * 2011-2026 with 124,713 records, so a cap of 120 taken that way would have
     * been 120 documents from 2011 and a "court × year stratified sample" that
     * contained one year.
     *
     * `row_number()` per (court, year) with a per-year quota gives every year
     * present in the ledger a place in the sample. A year holding fewer records
     * than its quota simply contributes what it has; the shortfall is not
     * back-filled from a larger year, because doing so would quietly restore the
     * bias this replaced.
     */
    const years = population.filter((p) => p.court_code === st.court).length;
    const perYear = Math.max(1, Math.ceil(st.take / Math.max(1, years)));
    const rows = (await sql`
      SELECT source_url, outcome, court_code, year, permanent FROM (
        SELECT source_url, outcome, court_code, year, permanent,
               row_number() OVER (PARTITION BY year ORDER BY source_url) AS rn
        FROM hc_ingest_ledger
        WHERE ${ELIGIBLE_ONLY ? sql`outcome = 'pdf_absent' AND permanent` : sql`outcome IN ('pdf_absent','pdf_failed','pdf_timeout')`}
          AND court_code = ${st.court}
      ) t
      WHERE rn <= ${perYear}
      ORDER BY year, source_url
      LIMIT ${st.take}`) as unknown as LedgerRow[];
    drawn.push(...rows);
  }

  console.log(
    `\ndrew ${drawn.length} records across ${strata.length} court strata (cap ${PER_COURT}/court)\n`,
  );

  /**
   * Identity, one parquet read per PARTITION rather than per record.
   *
   * Grouping first is not tidiness: these files run to hundreds of megabytes and
   * a per-record read of the same partition would fetch one many times over. The
   * column projection matters for the same reason — `raw_html` alone is 73% of
   * the Allahabad 2021 file and nothing here reads it.
   */
  const byPartition = new Map<string, LedgerRow[]>();
  for (const r of drawn) {
    const mk = metadataKeysFor(r.source_url);
    if (!mk) continue;
    const list = byPartition.get(mk.partitionId) ?? [];
    list.push(r);
    byPartition.set(mk.partitionId, list);
  }

  let identified = 0;
  let unidentified = 0;
  let partitionsRead = 0;
  let partitionsFailed = 0;

  const enriched = (
    await mapConcurrent([...byPartition.entries()], 3, async ([partitionId, rows]) => {
      const parts = parsePartitions(`${partitionId}/metadata.parquet`);
      try {
        const byFile = new Map<string, Record<string, unknown>>();
        const variantsRead: string[] = [];
        for (const key of [
          `${partitionId}/metadata.parquet`,
          `${partitionId}/metadata-mobile.parquet`,
        ]) {
          try {
            const n = await rowCount(key);
            /* Bounded: the whole file, but only four columns of it, and only for
             * a partition the sample actually reached. An unbounded read returns
             * the right row COUNT and the wrong rows, which is a defect this
             * repo has already paid for once. */
            const meta = await sampleRows<Record<string, unknown>>(key, 0, n, undefined, [
              'pdf_link',
              'title',
              'case_number',
              'date',
              'disposal_nature',
            ]);
            variantsRead.push(key.endsWith('-mobile.parquet') ? 'mobile' : 'plain');
            for (const m of meta) {
              const base = String(m['pdf_link'] ?? '')
                .split('/')
                .pop();
              /* Plain wins a collision: it is the variant `hc-load` ingests from,
               * so its identity is the one the rest of the pipeline would have
               * recorded had the PDF been fetchable. */
              if (base && !byFile.has(base)) byFile.set(base, m);
            }
          } catch {
            /* A partition legitimately may publish only one variant. Absence of
             * one file is not a failure of the partition; absence of BOTH is,
             * and that is what the empty map below reports. */
          }
        }
        if (variantsRead.length === 0) throw new Error('neither metadata variant readable');
        partitionsRead++;
        return rows.map((r) => {
          const file = metadataKeysFor(r.source_url)?.file ?? '';
          const m = byFile.get(file);
          if (m) identified++;
          else unidentified++;
          return {
            sourceUrl: r.source_url,
            outcome: r.outcome,
            permanent: r.permanent,
            court: r.court_code,
            courtName: parts?.courtCode ?? null,
            year: r.year,
            identity: m
              ? {
                  title: String(m['title'] ?? ''),
                  caseNumber: String(m['case_number'] ?? ''),
                  date: String(m['date'] ?? ''),
                  disposalNature:
                    m['disposal_nature'] == null ? null : String(m['disposal_nature']),
                }
              : null,
          };
        });
      } catch (err) {
        partitionsFailed++;
        unidentified += rows.length;
        return rows.map((r) => ({
          sourceUrl: r.source_url,
          outcome: r.outcome,
          permanent: r.permanent,
          court: r.court_code,
          courtName: null,
          year: r.year,
          identity: null,
          identityError: String((err as Error)?.message ?? err).slice(0, 120),
        }));
      }
    })
  ).flat();

  /**
   * IDENTITY RESOLUTION BY YEAR — the number the first draw hid.
   *
   * That draw took each court's EARLIEST years and reported 85.7% of records
   * identifiable. Spreading the same sample across years dropped it to 44.4%.
   * Same population, same code, same provider question — the difference was
   * entirely which years were looked at.
   *
   * So the rate is reported per year rather than as one figure, because one
   * figure for this quantity is not a property of the corpus, it is a property
   * of the sample that produced it. **A record whose case cannot be identified
   * cannot be recovered from any provider at any price**, so this is a ceiling
   * on recovery that exists before a single lookup is bought.
   */
  const byYear = new Map<number, { resolved: number; total: number }>();
  for (const e of enriched) {
    const slot = byYear.get(e.year) ?? { resolved: 0, total: 0 };
    slot.total++;
    if (e.identity) slot.resolved++;
    byYear.set(e.year, slot);
  }
  console.log('  ── identity resolution by year ──');
  for (const [y, s] of [...byYear].sort((a, b) => a[0] - b[0])) {
    console.log(
      `     ${y}  ${String(s.resolved).padStart(4)}/${String(s.total).padStart(4)}  ` +
        `${((100 * s.resolved) / Math.max(1, s.total)).toFixed(0).padStart(3)}%`,
    );
  }
  console.log('');

  console.log(`partitions read ${partitionsRead}  failed ${partitionsFailed}`);
  console.log(`identity RESOLVED ${identified}  UNRESOLVED ${unidentified}`);
  console.log(
    `\n  ${identified} of ${drawn.length} records carry a case identity and are queryable against a provider.`,
  );
  console.log(
    `  ${unidentified} carry only a filename and are NOT — they are excluded, not sent thin.\n`,
  );

  const tokenPresent = Boolean(process.env['INDIANKANOON_API_TOKEN']);
  console.log(
    tokenPresent
      ? '  INDIANKANOON_API_TOKEN is set. The lookup half of this pilot is unblocked.'
      : '  INDIANKANOON_API_TOKEN is NOT set — no provider call was made and none was attempted.\n' +
          '  The sample below is the input that lookup needs; nothing about it changes when the token arrives.',
  );

  const report = {
    tool: 'missing-pdf-pilot-cli',
    takenAt: new Date().toISOString(),
    population: {
      total,
      byCourt: [...byCourt]
        .sort((a, b) => b[1] - a[1])
        .map(([court, n]) => ({ court, records: n, share: n / total })),
      note:
        'Three courts hold 92% of this population (27_1 65.9%, 23_23 15.8%, 9_13 10.3%). ' +
        'The recovery decision is therefore mostly a decision about Bombay, and a rate measured ' +
        'on a proportional sample would mostly be a Bombay rate.',
    },
    sample: {
      requested: SIZE,
      drawn: drawn.length,
      perCourtCap: PER_COURT,
      strata: strata.length,
      identityResolved: identified,
      identityUnresolved: unidentified,
      partitionsRead,
      partitionsFailed,
      identityByYear: [...byYear]
        .sort((a, b) => a[0] - b[0])
        .map(([year, s]) => ({
          year,
          resolved: s.resolved,
          total: s.total,
          rate: s.resolved / Math.max(1, s.total),
        })),
      identityWarning:
        "An earlier draw of this same population, taken from each court's EARLIEST years only, " +
        'reported 85.7% identifiable. Spread across years it is 44.4%. Quote the per-year table, ' +
        'never the single figure. A record whose case cannot be identified cannot be recovered ' +
        'from any provider at any price, so this is a ceiling that exists before any lookup is bought.',
    },
    providerCall: {
      attempted: false,
      tokenPresent,
      reason: tokenPresent
        ? 'Token present; this tool still does not call out — the lookup is a separate, budgeted step.'
        : 'INDIANKANOON_API_TOKEN is not set in this environment.',
      canonicality:
        'Provider text is NEVER canonical. A hit is a pointer to an official copy to fetch, not a substitute for one.',
    },
    caveats: [
      'Per-court cap deliberately over-samples small courts relative to their share. Do NOT compute a population recovery rate from this sample without re-weighting by the recorded court shares.',
      'Within a court the draw is ordered by (year, source_url), not random — it is a systematic sample, adequate for measuring whether identities resolve and what a provider returns, not for estimating a variance.',
      'Records whose partition parquet did not yield a matching pdf_link are counted UNRESOLVED and carry identity: null. They are not queryable and must not be matched on filename.',
    ],
    records: enriched,
  };

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\n  wrote ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
