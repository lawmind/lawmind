/**
 * Exact-date chronology repair for judgment_statute_refs.
 *
 * Enactment and commencement are not interchangeable:
 * - before enactment: the target identity is impossible on the stored dates;
 * - after enactment but before commencement: a bare modern title may still be
 *   the predecessor, so the link is left unresolved rather than asserted;
 * - missing commencement: chronology cannot manufacture one, so the link is
 *   permitted only as identity and never as an applicability claim.
 *
 * Raw reference text survives every refusal. Only statute_id is cleared.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, 'docs/ai/new2-r9/statute-exact-date.json');
const ROLLBACK = join(ROOT, 'docs/ai/new2-r9/statute-exact-date-rollback.json');
const APPLY = process.argv.includes('--apply');
const PLACEHOLDER_DATES = new Set(['1900-01-01', '1950-01-01', '1970-01-01']);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const match = /^DATABASE_URL=(.+)$/m.exec(env);
  if (!match?.[1]) throw new Error('DATABASE_URL not found');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

type Candidate = {
  ref_id: string;
  judgment_id: string;
  statute_id: string;
  act_named: string;
  section_number: string;
  judgment_date: string;
  enactment_date: string;
  enforcement_date: string | null;
  short_title: string;
  context: string;
};

type Control = {
  ref_id: string;
  judgment_date: string;
  enactment_date: string;
  enforcement_date: string | null;
  act_named: string;
  short_title: string;
};

async function main(): Promise<void> {
  const sql = postgres(databaseUrl(), { max: 1, prepare: false, idle_timeout: 20 });
  try {
    const rows = await sql<Candidate[]>`
      SELECT r.id::text AS ref_id, r.judgment_id::text AS judgment_id,
             r.statute_id::text AS statute_id, r.act_named, r.section_number,
             j.judgment_date::text AS judgment_date,
             s.enactment_date::text AS enactment_date,
             s.enforcement_date::text AS enforcement_date,
             s.short_title,
             substring(j.full_text FROM greatest(1, r.first_offset - 240) FOR 600) AS context
        FROM judgment_statute_refs r
        JOIN judgments j ON j.id = r.judgment_id
        JOIN statutes s ON s.id = r.statute_id
       WHERE r.statute_id IS NOT NULL
         AND j.judgment_date IS NOT NULL
         AND s.enactment_date IS NOT NULL
         AND (
           j.judgment_date < s.enactment_date
           OR (s.enforcement_date IS NOT NULL AND j.judgment_date < s.enforcement_date)
         )
       ORDER BY j.judgment_date, r.id
    `;

    const classified = rows.map((row) => {
      const preEnactment = row.judgment_date < row.enactment_date;
      const placeholder = PLACEHOLDER_DATES.has(row.judgment_date);
      const state = placeholder
        ? 'unresolved_date_unsafe'
        : preEnactment
          ? 'refused_pre_enactment'
          : 'unresolved_pre_commencement';
      const reason = placeholder
        ? `stored judgment date ${row.judgment_date} is a known placeholder before enactment ${row.enactment_date}`
        : preEnactment
          ? `judgment ${row.judgment_date} predates official enactment ${row.enactment_date}`
          : `judgment ${row.judgment_date} is before official commencement ${row.enforcement_date}`;
      return { ...row, state, reason };
    });

    const positive = await sql<Control[]>`
      SELECT r.id::text AS ref_id, j.judgment_date::text AS judgment_date,
             s.enactment_date::text AS enactment_date,
             s.enforcement_date::text AS enforcement_date,
             r.act_named, s.short_title
        FROM judgment_statute_refs r
        JOIN judgments j ON j.id = r.judgment_id
        JOIN statutes s ON s.id = r.statute_id
       WHERE r.statute_id IS NOT NULL
         AND s.enactment_date IS NOT NULL
         AND j.judgment_date >= s.enactment_date
         AND (s.enforcement_date IS NULL OR j.judgment_date >= s.enforcement_date)
       ORDER BY j.judgment_date DESC
       LIMIT 12
    `;

    const report = {
      takenAt: new Date().toISOString(),
      mode: APPLY ? 'APPLY' : 'DRY_RUN',
      linkedExactDateViolations: classified.length,
      byState: classified.reduce<Record<string, number>>((counts, row) => {
        counts[row.state] = (counts[row.state] ?? 0) + 1;
        return counts;
      }, {}),
      negativeSamples: classified.slice(0, 20).map((row) => ({
        refId: row.ref_id,
        judgmentDate: row.judgment_date,
        enactmentDate: row.enactment_date,
        enforcementDate: row.enforcement_date,
        actNamed: row.act_named,
        target: row.short_title,
        state: row.state,
        context: row.context.slice(0, 350),
      })),
      positiveControls: positive,
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, violations: classified.length, byState: report.byState, positiveControls: positive.length }, null, 2));
    if (!APPLY || classified.length === 0) return;

    const rollback = {
      takenAt: report.takenAt,
      entries: classified.map((row) => ({ refId: row.ref_id, statuteId: row.statute_id })),
    };
    const rollbackJson = JSON.stringify(rollback, null, 2);
    writeFileSync(ROLLBACK, rollbackJson);
    const rollbackSha256 = createHash('sha256').update(rollbackJson).digest('hex');

    await sql.begin(async (tx) => {
      for (const row of classified) {
        await tx`
          UPDATE judgment_statute_refs
             SET statute_id = NULL,
                 resolution_state = ${row.state},
                 resolution_reason = ${row.reason},
                 resolved_at = now()
           WHERE id = ${row.ref_id}::uuid
             AND statute_id = ${row.statute_id}::uuid
        `;
      }
    });

    const after = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM judgment_statute_refs r
        JOIN judgments j ON j.id = r.judgment_id
        JOIN statutes s ON s.id = r.statute_id
       WHERE r.statute_id IS NOT NULL
         AND s.enactment_date IS NOT NULL
         AND (j.judgment_date < s.enactment_date
           OR (s.enforcement_date IS NOT NULL AND j.judgment_date < s.enforcement_date))
    `;
    writeFileSync(REPORT, JSON.stringify({ ...report, applied: classified.length, remaining: after[0]?.count ?? null, rollbackSha256 }, null, 2));
    console.log(`applied=${classified.length} remaining=${after[0]?.count ?? 'unknown'} rollback=${rollbackSha256}`);
  } finally {
    await sql.end({ timeout: 10 });
  }
}

await main();
