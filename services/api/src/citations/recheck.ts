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
 * draft** — not the whole corpus. It derives the banner the current treatment
 * policy would render from `judgments.overruled_status` and the verified inbound
 * edges, then compares that with `citation_checks.overruled_status_shown`, the
 * banner last rendered to somebody. A divergence means an advocate is looking at
 * a treatment that is no longer true.
 *
 * **It does not re-run verification tiers 1–3.** Existence is permanent and stays
 * cached; only good-law status moves. So this is an indexed corpus read, not an
 * external API spend — cost is bounded by corpus size, never by user count.
 *
 * Every flip calls the shared `applyOverruledChange`. There is no second fan-out
 * here, deliberately: `ADMIN_SURFACE.md` §15 warns that two implementations drift
 * and the one that drifts is the one that stops notifying.
 */
import { applyOverruledChange } from './fanout.ts';
import {
  precedentialEffectFromEdges,
  precedentialPolicy,
  type OverruledStatus,
  type TreatmentEdge,
} from '../judgments/precedential-effect.ts';
import type { Pusher } from '../push/expo.ts';
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

/** The same derived banner every user-facing judgment surface renders now. */
export function currentRenderedStatus(input: {
  storedStatus: OverruledStatus;
  edges: readonly TreatmentEdge[];
}): OverruledStatus {
  return precedentialPolicy(
    precedentialEffectFromEdges({
      overruledStatus: input.storedStatus,
      edges: input.edges,
    }),
  ).bannerStatus;
}

/**
 * `pusher` is optional for the same reason `applyOverruledChange`'s is: omit
 * it and the recheck still writes every alert row, it just does not push the
 * two immediate exceptions. `recheck-cli.ts` passes one — this signature
 * exists so a test can call `runRecheck` without standing up a transport.
 */
export async function runRecheck(sql: Sql, pusher?: Pusher): Promise<RecheckResult> {
  const startedAt = new Date().toISOString();

  /**
   * Judgments somebody is actually relying on. The same-layer comparison is
   * performed below after the current rendered status is derived from each row.
   *
   * `shown_to_user = true` is what makes this an audience rather than a log:
   * a citation_checks row nobody ever saw cannot have misled anybody.
   */
  const candidates = await sql<
    {
      judgment_id: string;
      case_title: string;
      shown: string;
      stored: OverruledStatus;
      edges: TreatmentEdge[];
    }[]
  >`
    SELECT DISTINCT
           j.id                       AS judgment_id,
           j.case_title,
           cc.overruled_status_shown  AS shown,
           j.overruled_status::text   AS stored,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'relationship', adverse.relationship,
                      'provenance', adverse.treatment_provenance
                    ))
             FROM (
               SELECT DISTINCT relationship, treatment_provenance
               FROM judgment_citations
               WHERE cited_judgment_id = j.id
                 AND relationship IN ('overruled', 'overruled_in_part', 'doubted')
             ) adverse
           ), '[]'::jsonb)             AS edges
    FROM citation_checks cc
    JOIN judgments j ON j.id = cc.judgment_id_matched
    WHERE cc.shown_to_user = true
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

  const diverged = candidates
    .map((row) => ({
      ...row,
      live: currentRenderedStatus({ storedStatus: row.stored, edges: row.edges }),
    }))
    .filter(
      (row) =>
        row.shown !== row.live &&
        // `applyOverruledChange` owns the canonical stored status as well as the
        // fan-out. A policy-only banner difference must never be written back as
        // legal truth or announced as a movement in the law.
        row.live === row.stored,
    );

  const outcomes: RecheckOutcome[] = [];

  for (const row of diverged) {
    try {
      const result = await applyOverruledChange(
        sql,
        {
          judgmentId: row.judgment_id,
          // The corpus is the authority here. The re-check does not decide that
          // law moved — it notices that the corpus already says so and that
          // somebody was shown otherwise.
          toStatus: row.live,
          trigger: 'recheck',
        },
        pusher,
      );
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
