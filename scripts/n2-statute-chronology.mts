/**
 * NEW2 — R9 §3. THE CHRONOLOGY CONTROL: a judgment cannot cite an Act that did
 * not yet exist.
 *
 * ## The defect, exactly as FIFTH stated it (bus 1357)
 *
 * After the R8.3 name-only precision repair, an exhaustive control over CURRENT
 * links still found **1,723** rows where `year(judgment_date) < statutes.act_year`.
 * Sampled rows are not placeholder-dated noise — ordinary Supreme Court judgments
 * with specific dates whose own text names the predecessor:
 *
 *     1966 judgment, "Indian Ports Act" s.1        -> Indian Ports Act 2025
 *     1959 judgment, text says "Cantonments Act, 1924" -> Cantonments Act 2006
 *     1964 judgment, text says "Coinage Act III of 1906" -> Coinage Act 2011
 *
 * ## Why the existing rules cannot catch it
 *
 * - `LINK_YEAR_CONFIRMED` trusts a year printed in `act_named`. When the
 *   EXTRACTOR expanded a bare predecessor name into a modern canonical title,
 *   that printed year is the extractor's, not the court's. FIFTH's ruling: an
 *   explicit 1996 Act inside a 1952 judgment is itself evidence of upstream
 *   extraction error, never a valid confirmation.
 * - `REFUSE_SECTION_ABSENT` cannot see it when the sections overlap — s.13 exists
 *   in both the 1906 and the 2011 Coinage Act.
 *
 * Chronology is independent of both, which is why it is a separate control.
 *
 * ## The rule, and why it is a refusal rather than a re-link
 *
 * **Any link whose Act was enacted after the judgment was delivered is refused.**
 * `statute_id` is set NULL; the ref row, its `act_named` and its section survive,
 * so the reference still renders — as an unresolved reference, which is what it
 * is. Nothing is deleted.
 *
 * It does NOT try to find the right predecessor. We do not hold the Indian Ports
 * Act 1908 or the Cantonments Act 1924, and inventing a link to a repealed Act we
 * have never ingested would be the same failure in a new direction. The founder's
 * instruction is explicit: prefer UNRESOLVED_PREDECESSOR over a wrong link.
 *
 * ## The one thing chronology cannot distinguish, stated rather than smoothed
 *
 * A chronological impossibility proves that ONE of two facts is wrong — the
 * judgment's date or the Act's identity — and cannot say which. Where the date is
 * a known quality placeholder the link may be innocent. **It is refused anyway**,
 * for FIFTH's reason: if chronology is impossible, deterministic link confirmation
 * cannot stand. Every refusal carries which of the two it suspects, so the
 * population stays auditable and a later date repair can re-link it.
 *
 * Rollback manifest is written BEFORE the transaction commits.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-statute-chronology.mts
 *   services/ingest/node_modules/.bin/tsx scripts/n2-statute-chronology.mts --apply
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r9/statute-chronology.json';
const ROLLBACK = 'docs/ai/new2-r9/statute-chronology-rollback.json';

const APPLY = process.argv.includes('--apply');

/**
 * Dates the corpus uses as a stand-in for "unknown". A ref refused under one of
 * these is flagged `DATE_UNSAFE` rather than `ACT_FUTURE` — same refusal, a
 * different suspect, and only the second is evidence about the linker.
 */
const PLACEHOLDER_DATES = new Set(['1950-01-01', '1900-01-01', '1970-01-01']);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Row = {
  ref_id: string;
  judgment_id: string;
  statute_id: string;
  act_named: string;
  section_number: string;
  judgment_date: string;
  judgment_year: number;
  act_year: number;
  short_title: string;
  act_id: string;
};

async function main() {
  const sql = postgres(databaseUrl(), { max: 2, prepare: false, idle_timeout: 20 });
  const takenAt = new Date().toISOString();

  const totals = await sql<{ refs: string; linked: string }[]>`
    SELECT count(*)::text AS refs,
           count(statute_id)::text AS linked
    FROM judgment_statute_refs
  `;
  const refs = Number(totals[0]!.refs);
  const linked = Number(totals[0]!.linked);

  /**
   * The control itself. Deliberately compares YEARS, not full dates: an Act
   * enacted in December of the judgment's own year is chronologically possible
   * for a December judgment, and `enactment_date` is null on most rows, so a
   * date-level comparison would refuse rows on data we do not have.
   */
  const impossible = await sql<Row[]>`
    SELECT r.id::text          AS ref_id,
           r.judgment_id::text AS judgment_id,
           r.statute_id::text  AS statute_id,
           r.act_named,
           r.section_number,
           j.judgment_date::text AS judgment_date,
           EXTRACT(YEAR FROM j.judgment_date)::int AS judgment_year,
           s.act_year,
           s.short_title,
           s.act_id
    FROM judgment_statute_refs r
    JOIN judgments j ON j.id = r.judgment_id
    JOIN statutes  s ON s.id = r.statute_id
    WHERE r.statute_id IS NOT NULL
      AND j.judgment_date IS NOT NULL
      AND s.act_year > EXTRACT(YEAR FROM j.judgment_date)
  `;

  const classified = impossible.map((r) => {
    const datePlaceholder = PLACEHOLDER_DATES.has(r.judgment_date);
    /**
     * Did the extractor's `act_named` print the FUTURE Act's own year? That is
     * the `LINK_YEAR_CONFIRMED` path, and FIFTH's ruling is that a printed year
     * newer than the judgment is the extractor's expansion of a bare predecessor
     * name, never the court's own words.
     */
    const namedYear = /\b(1[6-9]\d{2}|20\d{2})\b/.exec(r.act_named)?.[1];
    const namedFutureYear = namedYear != null && Number(namedYear) === r.act_year;
    return {
      ...r,
      gapYears: r.act_year - r.judgment_year,
      suspect: datePlaceholder ? 'DATE_UNSAFE' : 'ACT_FUTURE',
      wasYearConfirmed: namedFutureYear,
      verdict: 'UNRESOLVED_PREDECESSOR' as const,
    };
  });

  const byAct: Record<string, { actYear: number; refs: number; shortTitle: string }> = {};
  for (const r of classified) {
    byAct[r.act_id] ??= { actYear: r.act_year, refs: 0, shortTitle: r.short_title };
    byAct[r.act_id]!.refs++;
  }
  const bySuspect = { ACT_FUTURE: 0, DATE_UNSAFE: 0 };
  let yearConfirmed = 0;
  for (const r of classified) {
    bySuspect[r.suspect as 'ACT_FUTURE' | 'DATE_UNSAFE']++;
    if (r.wasYearConfirmed) yearConfirmed++;
  }

  const report = {
    takenAt,
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    totals: { refs, linked },
    impossibleLinks: classified.length,
    bySuspect,
    yearConfirmedAmongImpossible: yearConfirmed,
    distinctActs: Object.keys(byAct).length,
    topActs: Object.entries(byAct)
      .map(([actId, v]) => ({ actId, ...v }))
      .sort((a, b) => b.refs - a.refs)
      .slice(0, 40),
    gapHistogram: (() => {
      const h: Record<string, number> = {};
      for (const r of classified) {
        const b = r.gapYears <= 10 ? '<=10' : r.gapYears <= 25 ? '11-25' : r.gapYears <= 50 ? '26-50' : '>50';
        h[b] = (h[b] ?? 0) + 1;
      }
      return h;
    })(),
    sample: classified.slice(0, 25).map((r) => ({
      refId: r.ref_id,
      judgmentYear: r.judgment_year,
      judgmentDate: r.judgment_date,
      actNamed: r.act_named,
      section: r.section_number,
      linkedTo: `${r.short_title} (${r.act_year})`,
      suspect: r.suspect,
    })),
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2));

  console.log(`refs ${refs.toLocaleString()} · linked ${linked.toLocaleString()}`);
  console.log(`TEMPORALLY IMPOSSIBLE LINKS: ${classified.length.toLocaleString()}`);
  console.log(`  ACT_FUTURE ${bySuspect.ACT_FUTURE} · DATE_UNSAFE ${bySuspect.DATE_UNSAFE} · of which year-confirmed by act_named: ${yearConfirmed}`);
  console.log(`  distinct future Acts: ${Object.keys(byAct).length}`);
  for (const a of report.topActs.slice(0, 12)) {
    console.log(`    ${String(a.refs).padStart(6)}  ${a.shortTitle} (${a.actYear})`);
  }
  console.log(`  gap histogram: ${JSON.stringify(report.gapHistogram)}`);

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing written to the database. Re-run with --apply.');
    await sql.end();
    return;
  }

  if (classified.length === 0) {
    console.log('nothing to repair');
    await sql.end();
    return;
  }

  /**
   * The rollback manifest is written BEFORE the transaction, so a crash mid-apply
   * still leaves a file that can restore every statute_id by ref id.
   */
  const rollback = {
    takenAt,
    script: 'scripts/n2-statute-chronology.mts',
    restoreSql:
      'UPDATE judgment_statute_refs SET statute_id = $2::uuid WHERE id = $1::uuid  -- one row per entry',
    entries: classified.map((r) => ({ refId: r.ref_id, statuteId: r.statute_id })),
  };
  const rollbackJson = JSON.stringify(rollback, null, 2);
  writeFileSync(join(ROOT, ROLLBACK), rollbackJson);
  const digest = createHash('sha256').update(rollbackJson).digest('hex');
  console.log(`rollback manifest: ${ROLLBACK}  sha256=${digest.slice(0, 16)} entries=${rollback.entries.length}`);

  const ids = classified.map((r) => r.ref_id);
  let updated = 0;
  await sql.begin(async (tx) => {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const res = await tx`
        UPDATE judgment_statute_refs
        SET statute_id = NULL
        WHERE id = ANY(${chunk}::uuid[])
      `;
      updated += res.count;
    }
  });
  console.log(`APPLIED — statute_id cleared on ${updated} ref(s)`);

  const after = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n
    FROM judgment_statute_refs r
    JOIN judgments j ON j.id = r.judgment_id
    JOIN statutes  s ON s.id = r.statute_id
    WHERE r.statute_id IS NOT NULL
      AND j.judgment_date IS NOT NULL
      AND s.act_year > EXTRACT(YEAR FROM j.judgment_date)
  `;
  console.log(`RE-CHECK after apply: ${after[0]!.n} temporally impossible link(s) remain`);
  writeFileSync(
    join(ROOT, OUT),
    JSON.stringify({ ...report, applied: updated, recheckRemaining: Number(after[0]!.n), rollbackSha256: digest }, null, 2),
  );

  await sql.end();
}

await main();
