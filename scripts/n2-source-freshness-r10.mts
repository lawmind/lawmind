/**
 * NEW2 — R10 §5. THE PER-SOURCE FRESHNESS OBJECT. NO SINGLE HEADLINE NUMBER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RECENCY AND COMPLETENESS ARE TWO FACTS AND THEY NEVER COLLAPSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `sourceLagDays` can be 0 while `upstreamLocalCompleteness` is 0.34, and both
 * are true: we hold the single newest judgment the publisher has, and a third of
 * that month. A product that reports only the lag says "current"; one that
 * reports only the completeness says "a third of the law". Every consumer of
 * this object gets both, per source, or neither.
 *
 * That is also why `honestCurrencyFrontier` from the R9 ledger is not repeated
 * here as a headline. It compressed the two facts into one date by walking back
 * to the newest month that passed a completeness floor — useful, but a single
 * number again, and derived against a TRAILING BASELINE rather than against the
 * source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DENOMINATOR, WHICH IS THE WHOLE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `upstreamLocalCompleteness` divides by **upstream unique records in the
 * measured window, after upstream-side dedup** — not by a trailing average of
 * our own ingest, which is what the R9 ledger's `shareOfBaseline` did. A
 * baseline built from our own throughput cannot see a month where the publisher
 * released twice as much and we took the usual amount; it reads 1.0 and says
 * COMPLETE_ENOUGH.
 *
 * "Upstream unique records after upstream-side dedup" is defined once, in
 * `n2-hc-parity-matrix.mts`, and read from its artifact here: distinct
 * `pdfUrlFor(partition, basename(pdf_link))` per court, resolved to exactly one
 * month, with the publisher's fixture partitions excluded and objects appearing
 * in both parquet variants counted once. **LCC computes it from the same
 * artifact and the same field so the two lanes cannot drift.**
 *
 * `upstreamCases` — distinct `cnr` — is published beside it as the case-level
 * dedup, and is deliberately NOT the denominator: the ingest ledger terminalises
 * per object, and dividing an object-level numerator by a case-level denominator
 * is how a complete court reports 3% coverage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `unavailableSourceCount` IS ACCOUNTING, NOT COMPLETENESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It counts objects the publisher named and never uploaded — `pdf_absent`
 * (404/403/410) and the metadata-defect outcomes — proven per artifact. It
 * closes the books on a record; it does not put the judgment in the corpus, and
 * it is never netted out of the completeness ratio.
 *
 * **It is NOT `hc_ingest_ledger.permanent`.** That flag means a retry budget was
 * exhausted, and 410 of 410 sampled `no_text` rows carrying it are live real
 * PDFs — scans we cannot yet read, filed under the publisher's name. Those are
 * `retryExhaustedOurs`, a separate field, and they belong to us.
 *
 * Usage:
 *   tsx scripts/n2-source-freshness-r10.mts [--window 12] [--out docs/ai/new2-r10/source-freshness.json]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const WINDOW_MONTHS = Number(arg('window', '12'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r10/source-freshness.json'));
const PARITY = join(ROOT, arg('parity', 'docs/ai/new2-r10/parity-matrix.json'));
const FRONTIER = join(ROOT, arg('frontier', 'docs/ai/new2-r10/coverage-frontier.json'));
const DEFINITION = join(ROOT, 'docs/ai/new2-r10/hc-parity-definition-v2.json');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Cell = {
  court: string;
  month: string;
  upstreamObjects: number;
  upstreamCases: number;
  held: number;
  sourceUnavailableCurrent: number;
  policyRefused: number;
  actionableFailures: number;
  neverAttempted: number;
};

const days = (a: string, b: string) =>
  Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000);

const sql = postgres(databaseUrl(), {
  max: 2,
  idle_timeout: 20,
  connect_timeout: 60,
  onnotice: () => {},
});

try {
  const takenAt = new Date().toISOString();
  if (!existsSync(PARITY))
    throw new Error(`parity matrix absent at ${PARITY} — run n2-hc-parity-matrix.mts first`);
  const parity = JSON.parse(readFileSync(PARITY, 'utf8')) as {
    definitionVersion: string;
    takenAt: string;
    totals: Record<string, number>;
    courtMonth: Cell[];
    byCourt: (Cell & { courtName: string | null })[];
  };
  const definition = JSON.parse(readFileSync(DEFINITION, 'utf8')) as {
    definitionVersion?: unknown;
    freshnessSummary?: { measuredWindowMonths?: unknown };
  };
  if (
    typeof definition.definitionVersion !== 'string' ||
    parity.definitionVersion !== definition.definitionVersion
  ) {
    throw new Error(
      `parity definition mismatch: parity=${String(parity.definitionVersion)} ` +
        `definition=${String(definition.definitionVersion)}`,
    );
  }
  if (definition.freshnessSummary?.measuredWindowMonths !== WINDOW_MONTHS) {
    throw new Error(
      `freshness window mismatch: requested=${WINDOW_MONTHS} ` +
        `definition=${String(definition.freshnessSummary?.measuredWindowMonths)}`,
    );
  }
  const frontier = existsSync(FRONTIER)
    ? (JSON.parse(readFileSync(FRONTIER, 'utf8')) as {
        corpusWide?: { newestUpstreamDecision?: string; newestLocalDecision?: string };
        courts?: {
          court: string;
          newestUpstreamDecision: string;
          newestLocalDecision: string | null;
        }[];
      })
    : null;

  const realMonths = parity.courtMonth.filter((c) => /^\d{4}-\d{2}$/.test(c.month));
  const allMonths = [...new Set(realMonths.map((c) => c.month))].sort();
  const windowMonths = new Set(allMonths.slice(-WINDOW_MONTHS));

  const inWindow = realMonths.filter((c) => windowMonths.has(c.month));
  const sum = (rows: Cell[], f: (c: Cell) => number) => rows.reduce((a, c) => a + f(c), 0);
  const ratio = (num: number, den: number) => (den === 0 ? null : Number((num / den).toFixed(4)));

  // ── High Court ────────────────────────────────────────────────────────────
  const [hcLocal] = await sql<{ newest: string | null; held: string }[]>`
    SELECT to_char(max(judgment_date),'YYYY-MM-DD') AS newest, count(*)::text AS held
      FROM judgments
     WHERE source_url LIKE 'https://indian-high-court-judgments.s3%'`;
  const [hcIngest] = await sql<{ at: string | null }[]>`
    SELECT to_char(max(created_at),'YYYY-MM-DD"T"HH24:MI:SSOF') AS at
      FROM judgments WHERE source_url LIKE 'https://indian-high-court-judgments.s3%'`;

  const hcUpstreamNewest = frontier?.corpusWide?.newestUpstreamDecision ?? null;
  const hcLocalNewest = hcLocal?.newest ?? null;

  /**
   * A LAG COMPUTED ACROSS TWO DIFFERENT MEASUREMENT TIMES IS NOT A LAG.
   *
   * `latestUpstreamDecisionDate` comes from the coverage-frontier artifact and
   * `latestLocalDecisionDate` from a live query. Against a source that writes
   * daily and a fleet that ingests hourly, an artifact from yesterday subtracted
   * from a reading from now produces a number about the clock, not the corpus.
   *
   * Observed the first time this ran: frontier taken 2026-08-28T02:47Z said
   * upstream 2026-08-25, live local had reached 2026-08-27, and the object
   * published **-2 days**. A negative lag is the tell, and only because it
   * happened to go negative — the same skew in the other direction would have
   * published a plausible, wrong, flattering number in silence.
   *
   * So the two sides must have been measured within `SKEW_TOLERANCE_HOURS` of
   * each other. Outside it, the lag is null with the reason attached, never a
   * number. `verify-the-founders-live-numbers`.
   */
  const SKEW_TOLERANCE_HOURS = 6;
  const frontierTakenAt = (frontier as { takenAt?: string } | null)?.takenAt ?? null;
  const skewHours = frontierTakenAt
    ? (Date.parse(takenAt) - Date.parse(frontierTakenAt)) / 3_600_000
    : null;
  const lagIsMeasurable = skewHours !== null && skewHours <= SKEW_TOLERANCE_HOURS;
  const lagRefusal =
    frontierTakenAt === null
      ? 'no coverage-frontier artifact — latestUpstreamDecisionDate was never measured'
      : !lagIsMeasurable
        ? `the upstream frontier was measured ${skewHours!.toFixed(1)}h before this object (tolerance ${SKEW_TOLERANCE_HOURS}h). ` +
          `Against a daily source that difference is about the clock, not the corpus. Re-run n2-coverage-frontier.mts.`
        : null;

  const hcCourtMonthDetail = inWindow
    .map((c) => ({
      court: c.court,
      month: c.month,
      upstreamRecords: c.upstreamObjects,
      upstreamCases: c.upstreamCases,
      held: c.held,
      sourceUnavailableCount: c.sourceUnavailableCurrent,
      retryExhaustedOurs: c.actionableFailures,
      neverAttempted: c.neverAttempted,
      upstreamLocalCompleteness: ratio(c.held, c.upstreamObjects),
      accountedUpstream: ratio(
        c.held + c.sourceUnavailableCurrent + c.policyRefused,
        c.upstreamObjects,
      ),
    }))
    .sort((a, b) =>
      a.month === b.month ? a.court.localeCompare(b.court) : b.month.localeCompare(a.month),
    );

  const hc = {
    source: 'aws_open_data_hc',
    label: 'AWS Open Data — Indian High Court judgments',
    authorization: {
      state: 'AUTHORIZED',
      basis: 'AWS Open Data, CC-BY-4.0; Copyright Act s.52(1)(q)(iv)',
    },
    latestUpstreamDecisionDate: hcUpstreamNewest,
    latestUpstreamMeasuredAt: frontierTakenAt,
    latestLocalDecisionDate: hcLocalNewest,
    lastSuccessfulIngestAt: hcIngest?.at ?? null,
    sourceLagDays:
      lagIsMeasurable && hcUpstreamNewest && hcLocalNewest
        ? days(hcUpstreamNewest, hcLocalNewest)
        : null,
    sourceLagRefusedBecause: lagRefusal,
    upstreamLocalCompleteness: ratio(
      sum(inWindow, (c) => c.held),
      sum(inWindow, (c) => c.upstreamObjects),
    ),
    sourceUnavailableCount: sum(inWindow, (c) => c.sourceUnavailableCurrent),
    measuredWindow: {
      months: [...windowMonths].sort(),
      upstreamRecords: sum(inWindow, (c) => c.upstreamObjects),
      upstreamCases: sum(inWindow, (c) => c.upstreamCases),
      held: sum(inWindow, (c) => c.held),
      upstreamLocalCompleteness: ratio(
        sum(inWindow, (c) => c.held),
        sum(inWindow, (c) => c.upstreamObjects),
      ),
      sourceUnavailableCount: sum(inWindow, (c) => c.sourceUnavailableCurrent),
      policyRefused: sum(inWindow, (c) => c.policyRefused),
      retryExhaustedOurs: sum(inWindow, (c) => c.actionableFailures),
      neverAttempted: sum(inWindow, (c) => c.neverAttempted),
    },
    allTime: {
      upstreamRecords: parity.totals['upstreamObjects'] ?? null,
      held: parity.totals['held'] ?? null,
      sourceUnavailableCount:
        parity.totals['sourceUnavailableCurrent'] ?? parity.totals['terminal'] ?? null,
      retryExhaustedOurs: parity.totals['retryExhausted'] ?? null,
      neverAttempted: parity.totals['neverAttempted'] ?? null,
      upstreamLocalCompleteness: ratio(
        parity.totals['held'] ?? 0,
        parity.totals['upstreamObjects'] ?? 0,
      ),
      accountedUpstream: ratio(
        (parity.totals['held'] ?? 0) + (parity.totals['terminal'] ?? 0),
        parity.totals['upstreamObjects'] ?? 0,
      ),
      heldRowsInCorpus: Number(hcLocal?.held ?? 0),
    },
    courtMonthDetail: hcCourtMonthDetail,
  };

  // ── Supreme Court ─────────────────────────────────────────────────────────
  const [scLocal] = await sql<{ newest: string | null; held: string; ingest: string | null }[]>`
    SELECT to_char(max(judgment_date),'YYYY-MM-DD') AS newest,
           count(*)::text AS held,
           to_char(max(created_at),'YYYY-MM-DD"T"HH24:MI:SSOF') AS ingest
      FROM judgments
     WHERE source_url LIKE 'https://indian-supreme-court-judgments.s3%'`;
  const scRecon = existsSync(join(ROOT, 'docs/ai/new2-r10/sc-reconciliation.json'))
    ? (JSON.parse(
        readFileSync(join(ROOT, 'docs/ai/new2-r10/sc-reconciliation.json'), 'utf8'),
      ) as Record<string, unknown>)
    : existsSync(join(ROOT, 'docs/ai/new2-r9/sc-reconciliation.json'))
      ? (JSON.parse(
          readFileSync(join(ROOT, 'docs/ai/new2-r9/sc-reconciliation.json'), 'utf8'),
        ) as Record<string, unknown>)
      : null;
  const scUpstream =
    (scRecon?.['upstream'] as { englishPdfObjects?: number } | undefined)?.englishPdfObjects ??
    null;

  const sc = {
    source: 'aws_open_data_sc',
    label: 'AWS Open Data — Indian Supreme Court judgments',
    authorization: { state: 'AUTHORIZED', basis: 'AWS Open Data, CC-BY-4.0' },
    latestUpstreamDecisionDate: null as string | null,
    latestLocalDecisionDate: scLocal?.newest ?? null,
    lastSuccessfulIngestAt: scLocal?.ingest ?? null,
    sourceLagDays: null as number | null,
    upstreamLocalCompleteness: scUpstream ? ratio(Number(scLocal?.held ?? 0), scUpstream) : null,
    sourceUnavailableCount: 3,
    unavailableDetail:
      'three English PDF objects are upstream soft-404s: the publisher serves 200 with Content-Type application/pdf carrying a 403 page (S_1996_2_866_868_EN.pdf, 199 B) and two "Page not Found" pages (1998_1_937_947_EN.pdf, 1998_1_948_960_EN.pdf, 129 B each). Proven per artifact, from two different upstream error surfaces.',
    measuredWindow: null,
    allTime: {
      upstreamRecords: scUpstream,
      upstreamRecordsNote:
        'ENGLISH pdf objects only. The bucket holds 177,563 pdf objects in total; the ~134,000 non-English are authorized, unacquired, and out of scope — recorded so the denominator is not mistaken for the whole bucket.',
      held: Number(scLocal?.held ?? 0),
      upstreamLocalCompleteness: scUpstream ? ratio(Number(scLocal?.held ?? 0), scUpstream) : null,
    },
    courtMonthDetail: [],
    caveat:
      'latestUpstreamDecisionDate is null rather than guessed: the SC metadata parquet was not re-walked this round. The AWS SC drop is also materially incomplete at source for the current year, so a small lag here would not mean the corpus is current.',
  };

  // ── eCourts ───────────────────────────────────────────────────────────────
  const [ec] = await sql<{ obs: string }[]>`SELECT count(*)::text AS obs FROM ecourts_observation`;
  const ledger = await sql<{ outcome: string; refusal_reason: string | null; n: string }[]>`
    SELECT outcome, refusal_reason, count(*)::text AS n FROM ecourts_fetch_ledger GROUP BY 1,2 ORDER BY 3 DESC`;
  const ecourts = {
    source: 'ecourts',
    label: 'eCourts India — registrar grant of 7 Aug 2026',
    authorization: {
      state: 'AUTHORIZED_NOT_OPERATING',
      basis: 'registrar grant, terms transcribed in court/authorisation.ts',
    },
    latestUpstreamDecisionDate: null,
    latestLocalDecisionDate: null,
    lastSuccessfulIngestAt: null,
    sourceLagDays: null,
    upstreamLocalCompleteness: null,
    sourceUnavailableCount: 0,
    observations: Number(ec?.obs ?? 0),
    fetchLedger: ledger.map((r) => ({
      outcome: r.outcome,
      refusalReason: r.refusal_reason,
      count: Number(r.n),
    })),
    courtMonthDetail: [],
    caveat:
      'every field is null because zero requests have ever been made, not because the source is current. The ledger holds only refusals. A null here must never be read as "no lag".',
  };

  const artifact = {
    artifact: 'NEW2_SOURCE_FRESHNESS_R10',
    definitionVersion: definition.definitionVersion,
    lane: 'NEW2',
    takenAt,
    contract: {
      note: 'per source, never a single headline number. Recency and completeness are reported together or not at all.',
      fields: [
        'latestUpstreamDecisionDate',
        'latestLocalDecisionDate',
        'lastSuccessfulIngestAt',
        'upstreamLocalCompleteness',
        'sourceLagDays',
        'sourceUnavailableCount',
        'courtMonthDetail',
      ],
      denominator:
        'top-level upstreamLocalCompleteness and sourceUnavailableCount use the newest 12 decisionMonth buckets under HC_PARITY_V2. Identity is distinct pdfUrlFor(partition, basename(pdf_link)) per court, resolved to one month with fixtures excluded. All-time values remain nested. Defined in the parity artifact and consumed without recomputation.',
      denominatorSource: 'docs/ai/new2-r10/parity-matrix.json',
      denominatorTakenAt: parity.takenAt,
      measuredWindowMonths: WINDOW_MONTHS,
      unavailableIsAccounting:
        'sourceUnavailableCount closes accounting, never completeness, and is never netted out of upstreamLocalCompleteness.',
    },
    sources: [hc, sc, ecourts],
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1));
  console.log(
    `[freshness] HC ${WINDOW_MONTHS}-month unique completeness ${hc.upstreamLocalCompleteness} · lag ${hc.sourceLagDays}d`,
  );
  console.log(
    `[freshness] HC all-time completeness ${hc.allTime.upstreamLocalCompleteness} · accounted ${hc.allTime.accountedUpstream}`,
  );
  console.log(
    `[freshness] SC completeness ${sc.upstreamLocalCompleteness} · held ${sc.allTime.held}`,
  );
  console.log(
    `[freshness] eCourts observations ${ecourts.observations}, ledger ${JSON.stringify(ecourts.fetchLedger)}`,
  );
  console.log(`[freshness] wrote ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
