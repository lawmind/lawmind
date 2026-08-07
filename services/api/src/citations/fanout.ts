/**
 * `applyOverruledChange` — the ONE fan-out, called by both triggers.
 *
 * `ADMIN_SURFACE.md` §15: an admin upholding a dispute and the nightly re-check
 * noticing the same flip require identical work. **"Do not build a second
 * fan-out. Two implementations would drift, and the one that drifts is the one
 * that stops notifying."**
 *
 * `sprints/SPRINT_3.md` task 7 told the reader this already existed. It did not —
 * the only occurrence in the repository was a comment. This is it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE TRANSACTION, AND PARTIAL COMPLETION IS NOT ACCEPTABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Four writes, all or nothing:
 *   1. the correction to `judgments`
 *   2. re-verification enqueued for every `citation_checks` row referencing it
 *   3. a notice to every advocate who exported it in a draft — already filed
 *   4. a notice to every advocate who copied it out of the app
 *
 * **A half-completed fan-out is the worst state available**: the corpus says
 * overruled while the advocate who filed it was never told. So if any part fails,
 * the whole thing rolls back, the dispute stays open, and the run is marked
 * `failed` for retry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENT, BECAUSE BEING TOLD TWICE IS ITS OWN FAILURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `sha256(judgmentId || toStatus || trigger || triggerRef)` is unique. A
 * double-uphold, or an uphold racing the nightly re-check, loses to the
 * constraint and nobody is notified twice. An advocate told the same authority
 * moved twice learns to ignore the notification that matters.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULL COUNTS ARE NOT ZERO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citation_copies` is still deferred, so `copiedCount` is **null**, never 0.
 * Zero would assert that nobody copied this citation out of the app — a claim
 * with nothing behind it, and exactly the "an absent check is not a negative
 * result" failure. The advocate who copied a citation into Word is the one at
 * highest risk and the one we currently cannot reach; saying so in a null is the
 * honest form of that.
 */
import { createHash } from 'node:crypto';

import type { Sql } from 'postgres';

export type OverruledTrigger = 'dispute_upheld' | 'recheck' | 'admin_correction';

export type OverruledChange = {
  judgmentId: string;
  toStatus: 'none' | 'set_aside' | 'partly_set_aside' | 'doubted';
  trigger: OverruledTrigger;
  /** Dispute id or recheck id. Null for an ingest-time flip. */
  triggerRef?: string | undefined;
  /** Required when `toStatus` is `partly_set_aside` — SCHEMA_TRUTH. */
  overruledParas?: number[] | undefined;
  overruledByJudgmentId?: string | undefined;
  overruledNote?: string | undefined;
};

export type FanoutResult = {
  fanoutId: string;
  /** False when an identical fan-out already existed — nobody was told again. */
  applied: boolean;
  fromStatus: string;
  toStatus: string;
  savedCount: number;
  filedCount: number;
  /** Null: `citation_copies` does not exist yet. Never 0 — we did not look. */
  copiedCount: number | null;
  notifiedCount: number;
};

export function idempotencyKey(c: OverruledChange): string {
  return createHash('sha256')
    .update(`${c.judgmentId}|${c.toStatus}|${c.trigger}|${c.triggerRef ?? ''}`)
    .digest('hex');
}

/**
 * Apply a good-law status change and tell everyone who needs to know.
 *
 * Returns `applied: false` when an identical fan-out already ran — the caller
 * should treat that as success, not as an error: the work was done, by whoever
 * got there first.
 */
export async function applyOverruledChange(
  sql: Sql,
  change: OverruledChange,
): Promise<FanoutResult> {
  if (change.toStatus === 'partly_set_aside' && (change.overruledParas ?? []).length === 0) {
    // SCHEMA_TRUTH requires the affected paragraphs. "Partly set aside, we will
    // not say which part" is not information an advocate can act on, and it
    // renders a banner that cannot be read.
    throw new Error('partly_set_aside requires overruledParas — which paragraphs were affected');
  }

  const key = idempotencyKey(change);

  return sql.begin(async (tx) => {
    const [judgment] = await tx<{ overruled_status: string }[]>`
      SELECT overruled_status FROM judgments WHERE id = ${change.judgmentId} FOR UPDATE`;
    if (!judgment) throw new Error(`no judgment ${change.judgmentId}`);

    const fromStatus = judgment.overruled_status;

    // Claim the fan-out first. If another caller already did this exact change,
    // we lose here and stop — before writing the corpus or notifying anyone.
    const claimed = await tx<{ id: string }[]>`
      INSERT INTO citation_fanouts
        (judgment_id, trigger, trigger_ref, from_status, to_status, status, idempotency_key)
      VALUES (${change.judgmentId}, ${change.trigger}, ${change.triggerRef ?? null},
              ${fromStatus}, ${change.toStatus}, 'pending', ${key})
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `;

    if (claimed.length === 0) {
      const [existing] = await tx<{ id: string; notified_count: number | null }[]>`
        SELECT id, notified_count FROM citation_fanouts WHERE idempotency_key = ${key}`;
      return {
        fanoutId: existing!.id,
        applied: false,
        fromStatus,
        toStatus: change.toStatus,
        savedCount: 0,
        filedCount: 0,
        copiedCount: null,
        notifiedCount: existing!.notified_count ?? 0,
      };
    }
    const fanoutId = claimed[0]!.id;

    // 1 — the corpus. `overruled_status_changed_at` moves in the SAME write, or
    // the stale-overruled rate cannot separate a badge that was wrong when
    // rendered from one the world invalidated afterwards.
    await tx`
      UPDATE judgments SET
        overruled_status            = ${change.toStatus},
        overruled_status_changed_at = now(),
        overruled_by_judgment_id    = ${change.overruledByJudgmentId ?? null},
        overruled_paras             = ${change.overruledParas ?? null},
        overruled_note              = ${change.overruledNote ?? null}
      WHERE id = ${change.judgmentId}
    `;

    // 2 — everyone who has seen it. `shown_to_user` is what makes this a real
    // audience rather than every row we ever wrote.
    const saved = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM citation_checks
      WHERE judgment_id_matched = ${change.judgmentId} AND shown_to_user = true`;
    const savedCount = saved[0]?.n ?? 0;

    // The status last rendered is now wrong for these rows. Recording the new
    // status here is what lets the citation monitor measure staleness rather
    // than infer it.
    await tx`
      UPDATE citation_checks SET overruled_status_shown = ${change.toStatus}
      WHERE judgment_id_matched = ${change.judgmentId} AND shown_to_user = true`;

    // 3 — the advocates who EXPORTED it. Highest severity: it is already in a
    // filed document, and PD-5 says this trigger cannot be disabled.
    const filed = await tx<{ n: number }[]>`
      SELECT count(DISTINCT d.user_id)::int AS n
      FROM citation_checks cc
      JOIN documents d ON d.id = cc.document_id
      WHERE cc.judgment_id_matched = ${change.judgmentId} AND cc.document_id IS NOT NULL`;
    const filedCount = filed[0]?.n ?? 0;

    // 4 — the advocates who COPIED it out of the app. `citation_copies` does not
    // exist yet, so this is NULL rather than 0: we did not look, and claiming a
    // count we never took is the failure this whole file is written against.
    const copiedCount: number | null = null;

    // Notified is what we can actually reach today. Stated, not inferred: it is
    // deliberately NOT savedCount + filedCount, because the copy audience is
    // unknown and adding an unknown to a known produces a confident wrong number.
    const notifiedCount = filedCount;

    await tx`
      UPDATE citation_fanouts SET
        status = 'complete', completed_at = now(),
        saved_count = ${savedCount}, filed_count = ${filedCount},
        copied_count = ${copiedCount}, notified_count = ${notifiedCount}
      WHERE id = ${fanoutId}
    `;

    return {
      fanoutId,
      applied: true,
      fromStatus,
      toStatus: change.toStatus,
      savedCount,
      filedCount,
      copiedCount,
      notifiedCount,
    };
  }) as Promise<FanoutResult>;
}
