/**
 * The nightly hearing sweep — 23:00 IST, the last job in the chain.
 *
 * `DEPLOYMENT.md` §cron job order fixes the sequence and says why it is a
 * requirement rather than a preference:
 *
 *   22:15 cause list sync   → the sweep needs confirmed dates
 *   22:30 overruled re-check → briefings carry authorities
 *   23:00 nightly sweep      → this
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MUST NEVER DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Never skip a matter silently.** Every matter listed for tomorrow gets a
 * result — generated, or failed with a reason. A sweep that quietly produces 40
 * briefings out of 41 is indistinguishable from one that produced 41, and the
 * advocate whose matter was dropped finds out in court. The run returns per-matter
 * outcomes and the caller records the total.
 *
 * **Never let one matter's failure end the run.** A single unreadable matter must
 * not cost every other advocate their briefing. Each is caught individually.
 *
 * **Never generate for a date the advocate cannot act on.** Only matters whose
 * `next_hearing_date` is tomorrow. A briefing is a 24-hour document.
 *
 * **Never mark anything confirmed that a cause list did not confirm.** The sweep
 * writes `hearing_date_source`, which is a fact about provenance, and nothing
 * else about date confidence. `dates_confirmed_at` belongs to the cause list sync
 * and stays untouched here — a sweep that "confirmed" a date it merely read from
 * our own table would be the stale-date failure with our own fingerprints on it.
 */
import type { Sql } from 'postgres';

import { assembleBriefing, persistBriefing } from '@lawmind/api/briefings/assemble';

export type SweepOutcome =
  | { matterId: string; caseTitle: string; ok: true; briefingId: string; regenerated: boolean }
  | { matterId: string; caseTitle: string; ok: false; error: string };

export type SweepResult = {
  hearingDate: string;
  considered: number;
  generated: number;
  failed: number;
  outcomes: SweepOutcome[];
  startedAt: string;
  finishedAt: string;
};

/**
 * Tomorrow, in IST.
 *
 * The sweep runs at 23:00 IST and generates for the NEXT day, so the boundary
 * matters: computed in India Standard Time (UTC+05:30, no daylight saving),
 * never in the container's UTC. A sweep that used UTC would, at 23:00 IST,
 * still be on the previous UTC day and generate for today — the hearing the
 * advocate has already attended.
 */
export function tomorrowIst(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
}

/**
 * Generate tomorrow's briefings.
 *
 * Idempotent by construction: `persistBriefing` upserts on
 * (matter_id, hearing_date), so a re-run after a partial night updates rather
 * than duplicating, and never resets `opened_at`.
 */
export async function runSweep(sql: Sql, now: Date = new Date()): Promise<SweepResult> {
  const startedAt = new Date().toISOString();
  const hearingDate = tomorrowIst(now);

  const matters = await sql<{ id: string; case_title: string }[]>`
    SELECT id, case_title FROM matters
    WHERE next_hearing_date = ${hearingDate}::date
      -- Disposed and archived matters do not get briefings. An advocate does not
      -- want tomorrow's preparation for a case that ended.
      AND status = 'active'
    ORDER BY created_at
  `;

  const outcomes: SweepOutcome[] = [];

  for (const m of matters) {
    try {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM briefings
        WHERE matter_id = ${m.id} AND hearing_date = ${hearingDate}::date`;

      const assembled = await assembleBriefing(sql, m.id, hearingDate);
      if (!assembled) {
        outcomes.push({
          matterId: m.id,
          caseTitle: m.case_title,
          ok: false,
          error: 'matter disappeared between selection and assembly',
        });
        continue;
      }

      // The date came from our own matters row, which the advocate typed
      // (PD-12). Saying `advocate` here is a statement about provenance and
      // nothing more; whether a cause list agrees is the sync's answer to give.
      const briefingId = await persistBriefing(sql, assembled, 'advocate');
      outcomes.push({
        matterId: m.id,
        caseTitle: m.case_title,
        ok: true,
        briefingId,
        regenerated: existing !== undefined,
      });
    } catch (error) {
      // Caught per matter. One unreadable matter must not cost every other
      // advocate their briefing.
      outcomes.push({
        matterId: m.id,
        caseTitle: m.case_title,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    hearingDate,
    considered: matters.length,
    generated: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
