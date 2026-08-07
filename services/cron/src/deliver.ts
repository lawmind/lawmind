/**
 * Delivering tonight's briefings — PD-6, batched into the evening.
 *
 * Runs after the sweep. **One push per advocate**, covering all of their
 * hearings, because "a wrong cadence trains advocates to disable notifications
 * permanently, and they do not come back". An advocate with four listings gets
 * one notification.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT DELIVERY DOES AND DOES NOT MEAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `briefings.delivered_at` is set when Expo **accepted** the message, which is
 * not the same as the advocate receiving it and is certainly not the same as
 * reading it. Three separate facts live in three separate columns —
 * `generated_at`, `delivered_at`, `opened_at` — and collapsing any two of them
 * would make the activation metric (two briefings opened in week one) meaningless.
 *
 * **An advocate with no push token is not a failure.** It is the normal state of
 * anyone who has not opened the app on a phone or declined the OS prompt. Their
 * briefing is generated and simply undelivered; the run reports it as `skipped`,
 * never as an error, because an error rate that includes normal states is an
 * error rate nobody reads.
 *
 * **A `DeviceNotRegistered` token is cleared.** It will never succeed again, and
 * retrying it nightly forever is a permanent failure that hides real ones.
 */
import { briefingPush, type Pusher } from '@lawmind/api/push/expo';
import type { Sql } from 'postgres';

export type DeliveryResult = {
  hearingDate: string;
  advocates: number;
  delivered: number;
  skippedNoToken: number;
  failed: number;
  tokensCleared: number;
};

export async function deliverBriefings(
  sql: Sql,
  pusher: Pusher,
  hearingDate: string,
): Promise<DeliveryResult> {
  /**
   * Everything undelivered for this date, with its advocate.
   *
   * `delivered_at IS NULL` makes this safe to re-run: a retry after a partial
   * night notifies only the advocates who were missed, never everyone again.
   * Sending a second identical push is worse than sending none.
   */
  const rows = await sql<
    {
      briefing_id: string;
      user_id: string;
      expo_push_token: string | null;
      case_title: string;
      court: string;
    }[]
  >`
    SELECT b.id AS briefing_id, u.id AS user_id, u.expo_push_token,
           m.case_title, m.court
    FROM briefings b
    JOIN matters m ON m.id = b.matter_id
    JOIN users   u ON u.id = m.user_id
    WHERE b.hearing_date = ${hearingDate}::date
      AND b.delivered_at IS NULL
    ORDER BY u.id, m.case_title
  `;

  const byUser = new Map<
    string,
    {
      token: string | null;
      briefingIds: string[];
      hearings: { caseTitle: string; court: string }[];
    }
  >();
  for (const r of rows) {
    const entry = byUser.get(r.user_id) ?? {
      token: r.expo_push_token,
      briefingIds: [],
      hearings: [],
    };
    entry.briefingIds.push(r.briefing_id);
    entry.hearings.push({ caseTitle: r.case_title, court: r.court });
    byUser.set(r.user_id, entry);
  }

  const withToken = [...byUser.entries()].filter(
    (
      e,
    ): e is [
      string,
      { token: string; briefingIds: string[]; hearings: { caseTitle: string; court: string }[] },
    ] => typeof e[1].token === 'string' && e[1].token.length > 0,
  );
  const skippedNoToken = byUser.size - withToken.length;

  if (withToken.length === 0) {
    return {
      hearingDate,
      advocates: byUser.size,
      delivered: 0,
      skippedNoToken,
      failed: 0,
      tokensCleared: 0,
    };
  }

  const messages = withToken.map(([, e]) => briefingPush(e.token, e.hearings, hearingDate));
  const tickets = await pusher.send(messages);

  let delivered = 0;
  let failed = 0;
  let tokensCleared = 0;

  for (const [i, [userId, entry]] of withToken.entries()) {
    const ticket = tickets[i];
    if (ticket?.ok) {
      // Accepted by Expo. Recorded against the briefings this push covered — one
      // notification, several briefings, all now delivered.
      await sql`
        UPDATE briefings SET delivered_at = now()
        WHERE id = ANY(${entry.briefingIds}::uuid[])`;
      delivered += entry.briefingIds.length;
      continue;
    }

    failed += entry.briefingIds.length;
    if (ticket && !ticket.ok && ticket.deviceGone) {
      // The app is gone or the token rotated. Clearing it turns a permanent
      // nightly failure into an honest absence — and the advocate re-registers
      // the moment they next open the app.
      await sql`UPDATE users SET expo_push_token = NULL WHERE id = ${userId}`;
      tokensCleared += 1;
    }
  }

  return {
    hearingDate,
    advocates: byUser.size,
    delivered,
    skippedNoToken,
    failed,
    tokensCleared,
  };
}
