/**
 * `POST /citations/copies` — the record that makes a later warning possible.
 *
 * **This is the endpoint that 404'd.** It was specced, RCC built against it, and
 * it did not exist; every copy since has been sitting in their outbox, counted
 * and unsent. That is the designed offline behaviour rather than a failure — but
 * it is a growing list of advocates we could not have warned.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A COPY IS TRACKED AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An advocate who copies a citation into their own Word document has taken it
 * **out of the app entirely**. They saw the badge, they may file it, and without
 * this row nothing can reach them when the authority moves. `SCHEMA_TRUTH.md`
 * calls them "the advocate at highest risk", and plausibly a large share of early
 * users: the ones who trust the search but not yet the drafting.
 *
 * It is disclosed tracking, not silent: `PRIVACY_PII.md`. It is the advocate's
 * own activity about public judgments, it contains no third-party personal data,
 * and it is deleted on account deletion and through the DPDP erasure path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCY IS PER TAP, NOT PER CITATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Copy works offline and queues through the outbox, so the same request can
 * arrive twice — a retry, a flaky connection, a double tap. `clientKey` collapses
 * those.
 *
 * It must NOT be a content hash. The same citation copied a week apart is **two
 * real events**, and an advocate may need warning about both; merging them would
 * silently drop a warning. RCC send a per-tap key, which is exactly right.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COPY IS OFFERED IN EVERY STATE, INCLUDING set_aside
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `set_aside` disables **add-to-matter** and nothing else. Refusing the copy
 * would invent a second refusal the product does not have — and it would destroy
 * the only record that could warn the advocate later, which is precisely
 * backwards. What we record instead is `overruled_status_at_copy`: what they were
 * looking at when they took it.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const copyRequest = z.object({
  judgmentId: z.string().uuid(),
  matterId: z.string().uuid().optional(),
  citationCheckId: z.string().uuid().optional(),
  surface: z.enum(['search', 'judgment_detail', 'briefing', 'draft', 'matter']),
  /**
   * When the advocate tapped, not when it reached us. A copy made offline on
   * Tuesday and synced on Thursday happened on Tuesday, and the fan-out needs
   * the real time to say "you copied this before it moved".
   */
  copiedAt: z.string().datetime().optional(),
  /** Per tap. See the module note — never a content hash. */
  clientKey: z.string().min(1).max(200),
});

export async function recordCopy(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof copyRequest>,
): Promise<Response> {
  if (!userId) {
    return fail(
      c,
      'AUTH_REQUIRED',
      'a copy record belongs to an advocate — it exists to warn them later',
      401,
    );
  }

  /**
   * The status is read from the JUDGMENT ROW, now — never taken from the client.
   *
   * The client tells us WHAT was copied and WHEN; the corpus tells us what was
   * true. A client-supplied status could be stale or wrong, and this row's whole
   * purpose is to be the evidence behind a later warning.
   */
  const [judgment] = await sql<{ overruled_status: string }[]>`
    SELECT overruled_status FROM judgments WHERE id = ${body.judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const [row] = await sql<{ id: string; copied_at: string; inserted: boolean }[]>`
    INSERT INTO citation_copies
      (user_id, judgment_id, matter_id, citation_check_id, overruled_status_at_copy,
       surface, copied_at, client_key)
    VALUES (${userId}, ${body.judgmentId}, ${body.matterId ?? null},
            ${body.citationCheckId ?? null}, ${judgment.overruled_status},
            ${body.surface},
            -- The cast belongs in the SQL, not inside the parameter: interpolating
            -- "value::timestamptz" would send the cast as part of the string.
            coalesce(${body.copiedAt ?? null}::timestamptz, now()),
            ${body.clientKey})
    -- A replayed outbox item is a success, not a conflict: the client's job is to
    -- deliver at least once, and telling it "409" would make it retry forever.
    ON CONFLICT (user_id, client_key) DO UPDATE SET client_key = excluded.client_key
    RETURNING id, ${sql.unsafe(isoColumn('copied_at'))} AS copied_at,
              (xmax = 0) AS inserted
  `;

  return ok(
    c,
    {
      copyId: row!.id,
      copiedAt: row!.copied_at,
      /** False when this key had already been recorded — the client may drop it. */
      recorded: row!.inserted,
      /**
       * Echoed so the client can show the current state without a second call —
       * and note it is what the SERVER read just now, not what the client sent.
       */
      overruledStatus: judgment.overruled_status,
    },
    201,
  );
}
