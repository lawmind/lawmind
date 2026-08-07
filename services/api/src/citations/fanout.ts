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
 * `copiedCount` IS REAL NOW — IT WAS NULL WHEN THIS FILE WAS WRITTEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citation_copies` did not exist when `applyOverruledChange` was first written,
 * so `copiedCount` was null on principle: an absent check is not a negative
 * result, and claiming 0 would have asserted nobody copied this out — a claim
 * with nothing behind it. The table landed later (`0017_citation_copies.sql`,
 * `POST /citations/copies`) and this file was never updated to use it, which is
 * its own instance of exactly the failure the null was written to prevent:
 * stale reasoning surviving past the fact that made it true. It is real now.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALERTS — WHAT `docs/API_CONTRACTS.md` MEANS BY "ALREADY IMPLEMENTED"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `API_CONTRACTS.md` §Citator alerts states triggers 1 and 2 are implemented
 * HERE, and that the push for an exported `set_aside` is "already pushed by the
 * fan-out". Neither was true before this change — the alerts table did not
 * exist and this function never called a pusher. Both are now real:
 *
 * - `saved_authority_moved` alerts for the broader "has seen this" audience
 *   (via `citation_checks`, resolved through `searches`/`documents`), always
 *   in-app only, gated by `users.alert_saved_authority_moved`;
 * - `filed_citation_moved` alerts for the exported-draft audience AND the
 *   copied-out audience — CITATION_HARNESS.md: "a copy is treated exactly as
 *   an export" — never gated by a setting, matching "trigger 2 cannot be
 *   disabled";
 * - a user in the filed/copied audience does NOT also get a saved alert for
 *   the SAME event. Telling one advocate about one flip twice, at two
 *   severities, is the redundancy PD-6 warns trains people to stop reading.
 *
 * Push (not email — see below) fires for `set_aside`/`partly_set_aside` on the
 * filed/copied audience, AFTER the transaction commits: an external HTTP call
 * has no business inside a database transaction, and the in-app alert row is
 * the durable truth regardless of whether the push is accepted. `doubted`
 * never pushes — CITATION_HARNESS.md: "waking someone at night for it would be
 * crying wolf."
 *
 * **Email is not built in this pass.** The severity matrix calls for push +
 * in-app + email on an exported `set_aside`; `packages/auth/src/mail.ts` has a
 * working `Mailer` but no template for this notice. Documented rather than
 * silently dropped, matching the same rule this file applies to its own
 * `copiedCount` history: state what is missing, and why, rather than let a
 * comment assert something that stopped being true.
 */
import { createHash } from 'node:crypto';

import type { Sql } from 'postgres';

import type { PushMessage, Pusher } from '../push/expo.ts';

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
  copiedCount: number;
  notifiedCount: number;
  /** Rows written to `alerts`. Zero is real now — this is a count, not a guess. */
  alertsWritten: number;
  /** Push tickets accepted by Expo. Undefined when no `pusher` was passed in. */
  pushedCount: number | undefined;
};

export function idempotencyKey(c: OverruledChange): string {
  return createHash('sha256')
    .update(`${c.judgmentId}|${c.toStatus}|${c.trigger}|${c.triggerRef ?? ''}`)
    .digest('hex');
}

/** One alert per user per event: `sha256(fanoutId | kind | userId)`. */
function alertDedupeKey(fanoutId: string, kind: string, userId: string): string {
  return createHash('sha256').update(`${fanoutId}|${kind}|${userId}`).digest('hex');
}

/** Push copy for the one channel this pass builds — CITATION_HARNESS.md §When the law moves. */
function overruledPush(
  caseTitle: string,
  toStatus: 'set_aside' | 'partly_set_aside',
): { title: string; body: string } {
  return toStatus === 'set_aside'
    ? {
        title: 'A case in your filed draft has been overruled',
        body: `${caseTitle} was set aside. You cited it in a filed document.`,
      }
    : {
        title: 'A case you cited has been partly set aside',
        body: `${caseTitle} was partly set aside. You cited it in a filed document.`,
      };
}

/**
 * Apply a good-law status change and tell everyone who needs to know.
 *
 * Returns `applied: false` when an identical fan-out already ran — the caller
 * should treat that as success, not as an error: the work was done, by whoever
 * got there first.
 *
 * `pusher` is optional. Omit it (as every caller does today) and the alert
 * rows still get written — they are the durable, in-app truth — but nobody is
 * pushed. This is the same "refuses honestly, does not fabricate delivery"
 * shape as `packages/auth/src/mail.ts`: a caller that wants immediate push for
 * `set_aside`/`partly_set_aside` passes one, built the same way
 * `sweep-cli.ts` builds one for briefings (`pusherFrom`).
 */
export async function applyOverruledChange(
  sql: Sql,
  change: OverruledChange,
  pusher?: Pusher,
): Promise<FanoutResult> {
  if (change.toStatus === 'partly_set_aside' && (change.overruledParas ?? []).length === 0) {
    // SCHEMA_TRUTH requires the affected paragraphs. "Partly set aside, we will
    // not say which part" is not information an advocate can act on, and it
    // renders a banner that cannot be read.
    throw new Error('partly_set_aside requires overruledParas — which paragraphs were affected');
  }

  const key = idempotencyKey(change);

  const outcome = await sql.begin(async (tx) => {
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
        result: {
          fanoutId: existing!.id,
          applied: false,
          fromStatus,
          toStatus: change.toStatus,
          savedCount: 0,
          filedCount: 0,
          copiedCount: 0,
          notifiedCount: existing!.notified_count ?? 0,
          alertsWritten: 0,
          pushedCount: undefined,
        },
        pushAudience: [],
      };
    }
    const fanoutId = claimed[0]!.id;

    // 1 — the corpus. `overruled_status_changed_at` moves in the SAME write, or
    // the stale-overruled rate cannot separate a badge that was wrong when
    // rendered from one the world invalidated afterwards.
    const [updatedJudgment] = await tx<{ case_title: string }[]>`
      UPDATE judgments SET
        overruled_status            = ${change.toStatus},
        overruled_status_changed_at = now(),
        overruled_by_judgment_id    = ${change.overruledByJudgmentId ?? null},
        overruled_paras             = ${change.overruledParas ?? null},
        overruled_note              = ${change.overruledNote ?? null}
      WHERE id = ${change.judgmentId}
      RETURNING case_title
    `;
    const caseTitle = updatedJudgment?.case_title ?? 'this judgment';

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

    // 3 — the advocates who EXPORTED it, WITH their user id and expo token —
    // trigger 2's audience, highest severity, and PD-5 says it cannot be
    // disabled. Includes matter_id when the exporting document has one, for
    // the alert's provenance.
    const filedRows = await tx<
      { user_id: string; matter_id: string | null; expo_push_token: string | null }[]
    >`
      SELECT DISTINCT ON (d.user_id) d.user_id, d.matter_id, u.expo_push_token
      FROM citation_checks cc
      JOIN documents d ON d.id = cc.document_id
      JOIN users u ON u.id = d.user_id
      WHERE cc.judgment_id_matched = ${change.judgmentId} AND cc.document_id IS NOT NULL`;
    const filedCount = filedRows.length;

    // 4 — the advocates who COPIED it out of the app. Real now: `citation_copies`
    // exists (0017). CITATION_HARNESS.md: "a copy is treated exactly as an
    // export" — same audience treatment, same severity, as trigger 2.
    const copiedRows = await tx<
      { user_id: string; matter_id: string | null; expo_push_token: string | null }[]
    >`
      SELECT DISTINCT ON (cp.user_id) cp.user_id, cp.matter_id, u.expo_push_token
      FROM citation_copies cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.judgment_id = ${change.judgmentId}`;
    const copiedCount = copiedRows.length;

    // The "saved" audience (trigger 1) is everyone who saw it, resolved to a
    // user via the search or the document that surfaced it, MINUS anyone
    // already in the filed/copied audience above. A user in both would
    // otherwise get told the same flip twice at two severities — the exact
    // redundancy PD-6 warns trains advocates to stop reading notifications.
    // Gated by the setting AT THE QUERY, not filtered in application code
    // afterwards — same reasoning as PD-4's column-level default.
    const highSeverityUserIds = new Set([
      ...filedRows.map((r) => r.user_id),
      ...copiedRows.map((r) => r.user_id),
    ]);
    const savedAudienceRows = await tx<{ user_id: string; matter_id: string | null }[]>`
      SELECT DISTINCT ON (u.user_id) u.user_id, u.matter_id
      FROM (
        SELECT s.user_id, s.matter_id
        FROM citation_checks cc JOIN searches s ON s.id = cc.search_id
        WHERE cc.judgment_id_matched = ${change.judgmentId} AND cc.shown_to_user = true
        UNION
        SELECT d.user_id, d.matter_id
        FROM citation_checks cc JOIN documents d ON d.id = cc.document_id
        WHERE cc.judgment_id_matched = ${change.judgmentId} AND cc.shown_to_user = true
      ) u
      JOIN users usr ON usr.id = u.user_id AND usr.alert_saved_authority_moved = true`;
    const savedAudience = savedAudienceRows.filter((r) => !highSeverityUserIds.has(r.user_id));

    // set_aside / partly_set_aside on the filed+copied audience push
    // immediately; `doubted` never pushes — CITATION_HARNESS.md §When the law
    // moves. `none` cannot reach here (validated by the caller's status enum;
    // a flip back to good law is worth an in-app note, never a push).
    const highSeverity: 'immediate' | 'batched' =
      change.toStatus === 'set_aside' || change.toStatus === 'partly_set_aside'
        ? 'immediate'
        : 'batched';

    const payloadCommon = {
      fromStatus,
      toStatus: change.toStatus,
      judgmentTitle: caseTitle,
      overruledParas: change.overruledParas ?? null,
    };

    let alertsWritten = 0;
    const pushAudience: { token: string; caseTitle: string }[] = [];

    for (const row of [...filedRows, ...copiedRows]) {
      const dedupe = alertDedupeKey(fanoutId, 'filed_citation_moved', row.user_id);
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO alerts (user_id, kind, severity, judgment_id, matter_id, fanout_id, payload, dedupe_key)
        VALUES (${row.user_id}, 'filed_citation_moved', ${highSeverity}, ${change.judgmentId},
                ${row.matter_id}, ${fanoutId}, ${sql.json(payloadCommon)}, ${dedupe})
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING id
      `;
      if (inserted.length > 0) alertsWritten += 1;
      if (highSeverity === 'immediate' && row.expo_push_token) {
        pushAudience.push({ token: row.expo_push_token, caseTitle });
      }
    }
    for (const row of savedAudience) {
      const dedupe = alertDedupeKey(fanoutId, 'saved_authority_moved', row.user_id);
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO alerts (user_id, kind, severity, judgment_id, matter_id, fanout_id, payload, dedupe_key)
        VALUES (${row.user_id}, 'saved_authority_moved', 'batched', ${change.judgmentId},
                ${row.matter_id}, ${fanoutId}, ${sql.json(payloadCommon)}, ${dedupe})
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING id
      `;
      if (inserted.length > 0) alertsWritten += 1;
    }

    // Notified: filed + copied, deduplicated by user — the two audiences can
    // overlap (exported AND separately copied) and a user counted twice would
    // overstate reach for no reason. savedAudience is deliberately excluded,
    // matching the original reasoning here: it is a different severity, and
    // folding it in would make one number answer two questions.
    const notifiedCount = highSeverityUserIds.size;

    await tx`
      UPDATE citation_fanouts SET
        status = 'complete', completed_at = now(),
        saved_count = ${savedCount}, filed_count = ${filedCount},
        copied_count = ${copiedCount}, notified_count = ${notifiedCount}
      WHERE id = ${fanoutId}
    `;

    return {
      result: {
        fanoutId,
        applied: true,
        fromStatus,
        toStatus: change.toStatus,
        savedCount,
        filedCount,
        copiedCount,
        notifiedCount,
        alertsWritten,
        pushedCount: undefined,
      },
      pushAudience,
    };
  });

  // Push happens AFTER commit — an external HTTP call has no business inside a
  // database transaction, and the alert row already written is the durable
  // truth regardless of whether Expo accepts this. No pusher passed in, or
  // nobody to push to, is a normal, honest skip — the same shape as
  // `expo_push_token` being null.
  const toStatus = change.toStatus;
  if (!pusher || outcome.pushAudience.length === 0) return outcome.result;
  if (toStatus !== 'set_aside' && toStatus !== 'partly_set_aside') return outcome.result;

  const copy = overruledPush(outcome.pushAudience[0]!.caseTitle, toStatus);
  const messages: PushMessage[] = outcome.pushAudience.map((a) => ({
    to: a.token,
    title: copy.title,
    body: copy.body,
    data: { type: 'citation_overruled', judgmentId: change.judgmentId },
  }));
  const tickets = await pusher.send(messages);
  const pushedCount = tickets.filter((t) => t.ok).length;
  // A dead token is cleared here too, same rule as the briefing delivery —
  // retrying a permanent failure nightly forever hides real ones.
  for (const t of tickets) {
    if (!t.ok && t.deviceGone) {
      await sql`UPDATE users SET expo_push_token = NULL WHERE expo_push_token = ${t.to}`;
    }
  }
  return { ...outcome.result, pushedCount };
}
