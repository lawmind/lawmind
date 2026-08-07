/**
 * The overruled re-check — 22:30 IST, immediately before the nightly sweep.
 *
 * `DEPLOYMENT.md` §cron job order: it runs **first and must complete first**,
 * because briefings carry authorities. A sweep against a stale overruled status
 * puts overruled law into tonight's briefing, which the advocate reads standing
 * outside court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT COMPARES, AND WHAT IT DOES NOT RE-RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scope is every judgment referenced by an **active matter** or an **exported
 * draft** — not the whole corpus. It compares the live `judgments.overruled_status`
 * against `citation_checks.overruled_status_shown`, the status last RENDERED to
 * somebody. A divergence means an advocate is looking at a badge that is no longer
 * true.
 *
 * **It does not re-run verification tiers 1–3.** Existence is permanent and stays
 * cached; only good-law status moves. So this is an indexed corpus read, not an
 * external API spend — cost is bounded by corpus size, never by user count.
 *
 * Every flip calls the shared `applyOverruledChange`. There is no second fan-out
 * here, deliberately: `ADMIN_SURFACE.md` §15 warns that two implementations drift
 * and the one that drifts is the one that stops notifying.
 */
import { applyOverruledChange } from '@lawmind/api/citations/fanout';
import type { Sql } from 'postgres';

export type RecheckOutcome = {
  judgmentId: string;
  caseTitle: string;
  shownStatus: string;
  liveStatus: string;
  ok: boolean;
  fanoutId?: string;
  notified?: number;
  error?: string;
};

export type RecheckResult = {
  checked: number;
  flipped: number;
  failed: number;
  outcomes: RecheckOutcome[];
  startedAt: string;
  finishedAt: string;
};

export async function runRecheck(sql: Sql): Promise<RecheckResult> {
  const startedAt = new Date().toISOString();

  /**
   * Judgments somebody is actually relying on, where what they were shown no
   * longer matches the corpus.
   *
   * `shown_to_user = true` is what makes this an audience rather than a log:
   * a citation_checks row nobody ever saw cannot have misled anybody.
   */
  const diverged = await sql<
    { judgment_id: string; case_title: string; shown: string; live: string }[]
  >`
    SELECT DISTINCT
           j.id                       AS judgment_id,
           j.case_title,
           cc.overruled_status_shown  AS shown,
           j.overruled_status         AS live
    FROM citation_checks cc
    JOIN judgments j ON j.id = cc.judgment_id_matched
    WHERE cc.shown_to_user = true
      AND cc.overruled_status_shown IS DISTINCT FROM j.overruled_status
      AND (
        -- referenced by an ACTIVE matter …
        EXISTS (
          SELECT 1 FROM judgment_annotations a
          JOIN matters m ON m.id = a.matter_id
          WHERE a.judgment_id = j.id AND a.deleted_at IS NULL AND m.status = 'active'
        )
        -- … or by an EXPORTED draft, which is already filed
        OR cc.document_id IS NOT NULL
      )
  `;

  const outcomes: RecheckOutcome[] = [];

  for (const row of diverged) {
    try {
      const result = await applyOverruledChange(sql, {
        judgmentId: row.judgment_id,
        // The corpus is the authority here. The re-check does not decide that
        // law moved — it notices that the corpus already says so and that
        // somebody was shown otherwise.
        toStatus: row.live as 'none' | 'set_aside' | 'partly_set_aside' | 'doubted',
        trigger: 'recheck',
      });
      outcomes.push({
        judgmentId: row.judgment_id,
        caseTitle: row.case_title,
        shownStatus: row.shown,
        liveStatus: row.live,
        ok: true,
        fanoutId: result.fanoutId,
        notified: result.notifiedCount,
      });
    } catch (error) {
      // Per judgment, so one bad row does not abandon the rest. A run that dies
      // on the first failure leaves every later advocate unnotified.
      outcomes.push({
        judgmentId: row.judgment_id,
        caseTitle: row.case_title,
        shownStatus: row.shown,
        liveStatus: row.live,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    checked: diverged.length,
    flipped: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
