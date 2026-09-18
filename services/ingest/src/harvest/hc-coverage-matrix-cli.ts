/**
 * `pnpm --filter @lawmind/ingest hc:matrix` — the court x year coverage engine.
 *
 * Joins the AWS parquet-footer source counts (`docs/HC_METADATA_SURVEY.json`,
 * per court per year) against `judgments` grouped by court and year, and emits
 * source_total, held, coverage and remaining gap per band, plus the largest
 * absolute gaps. Read-only: it prints, it never writes a coverage row. Writing
 * `judgment_coverage` is `coverage-cli.ts`'s job and stays there.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN A PER-COURT PERCENTAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `COVERAGE_GAP_MATRIX.md` §5 asked for it and, the first time it was run
 * (15 Aug 2026), it immediately found a **7,690,230-document hole in 2016–2022**
 * — nearly double the pre-2016 backlog the `--to-year` work was built for, and
 * ranked below that backlog in every planning document. Ten courts held zero.
 *
 * The reason a per-court number could not see it: Allahabad sat at 17.6% of
 * `allYears`, which reads as a uniformly partial ingest. It was ~100% of 2026,
 * 36% of 2025, **0% of 2024**, 59% of 2023 and **0% of the seven years before**.
 *
 * > A per-court percentage cannot answer a per-year question. Each of those
 * > bands needs a different action and the single percentage recommends none.
 *
 * Two things it deliberately does NOT do:
 *   - it never uses `min(judgment_date)` as a coverage signal. `COVERAGE_GAP_MATRIX`
 *     §3z: an aggregate a single row can satisfy cannot answer a coverage question.
 *   - it never invents a court mapping. Matching is whitespace-and-case only, and
 *     a name that does not resolve is reported UNMATCHED, never bucketed. The
 *     check that this worked is that the printed source total reconciles to the
 *     survey's own 20,529,203 — if a court were silently dropped it would not.
 *
 * **The source side is a SNAPSHOT and AWS updates DAILY.** Every source figure
 * understates by however old `HC_METADATA_SURVEY.json` is; it prints its
 * `generatedAt` for exactly that reason. The held side is live.
 */
import { readFile } from 'node:fs/promises';

import { openDb } from '../db-host.ts';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(2);
}

type Survey = {
  generatedAt: string;
  perCourt: Array<{ code: string; name: string; allYears: number; last10Years: number }>;
  perCourtPerYear: Record<string, Record<string, number>>;
};

const survey = JSON.parse(
  await readFile(new URL('../../../../docs/HC_METADATA_SURVEY.json', import.meta.url), 'utf8'),
) as Survey;

/** Whitespace and case only. Nothing clever — a fuzzy match here would invent a mapping. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

const codeByName = new Map(survey.perCourt.map((c) => [norm(c.name), c.code]));

const sql = await openDb(dbUrl, 2);
try {
  const held = await sql<{ court: string; year: number; n: string }[]>`
    SELECT court, extract(year FROM judgment_date)::int AS year, count(*)::text AS n
    FROM judgments
    GROUP BY court, extract(year FROM judgment_date)
  `;

  const heldByCourtYear = new Map<string, Map<number, number>>();
  const unmatched = new Set<string>();
  for (const r of held) {
    const key = norm(r.court);
    if (!codeByName.has(key) && !key.includes('supreme court')) unmatched.add(r.court);
    let m = heldByCourtYear.get(key);
    if (!m) heldByCourtYear.set(key, (m = new Map()));
    m.set(r.year, Number(r.n));
  }

  console.log(`survey generated ${survey.generatedAt}`);
  console.log(`measured ${new Date().toISOString()}`);
  if (unmatched.size > 0) {
    console.log(`UNMATCHED court names (not scored, not dropped): ${[...unmatched].join(' | ')}`);
  }

  type Band = { label: string; from: number; to: number };
  const bands: Band[] = [
    { label: '1950-2015', from: 1950, to: 2015 },
    { label: '2016-2022', from: 2016, to: 2022 },
    { label: '2023', from: 2023, to: 2023 },
    { label: '2024', from: 2024, to: 2024 },
    { label: '2025', from: 2025, to: 2025 },
    { label: '2026', from: 2026, to: 2026 },
  ];

  const sum = (m: Record<string, number> | undefined, from: number, to: number) => {
    if (!m) return 0;
    let t = 0;
    for (const [y, n] of Object.entries(m)) {
      const yr = Number(y);
      if (yr >= from && yr <= to) t += n;
    }
    return t;
  };
  const sumHeld = (m: Map<number, number> | undefined, from: number, to: number) => {
    if (!m) return 0;
    let t = 0;
    for (const [y, n] of m) if (y >= from && y <= to) t += n;
    return t;
  };

  console.log('');
  console.log(['court', 'code', 'band', 'source', 'held', 'cov%', 'gap'].join('\t'));

  type GapRow = { court: string; code: string; band: string; source: number; heldN: number };
  const gaps: GapRow[] = [];

  for (const c of survey.perCourt) {
    const key = norm(c.name);
    const src =
      survey.perCourtPerYear[
        Object.keys(survey.perCourtPerYear).find((n) => norm(n) === key) ?? ''
      ];
    const h = heldByCourtYear.get(key);
    for (const b of bands) {
      const source = sum(src, b.from, b.to);
      const heldN = sumHeld(h, b.from, b.to);
      if (source === 0 && heldN === 0) continue;
      const cov = source > 0 ? (heldN / source) * 100 : Number.NaN;
      console.log(
        [
          c.name,
          c.code,
          b.label,
          source,
          heldN,
          Number.isNaN(cov) ? 'n/a' : cov.toFixed(2),
          Math.max(0, source - heldN),
        ].join('\t'),
      );
      if (source - heldN > 0)
        gaps.push({ court: c.name, code: c.code, band: b.label, source, heldN });
    }
  }

  gaps.sort((a, b) => b.source - b.heldN - (a.source - a.heldN));
  console.log('\n=== TOP 30 GAPS BY ABSOLUTE DOCUMENTS ===');
  console.log(['court', 'code', 'band', 'source', 'held', 'cov%', 'gap'].join('\t'));
  for (const g of gaps.slice(0, 30)) {
    console.log(
      [
        g.court,
        g.code,
        g.band,
        g.source,
        g.heldN,
        ((g.heldN / g.source) * 100).toFixed(2),
        g.source - g.heldN,
      ].join('\t'),
    );
  }
} finally {
  await sql.end();
}
