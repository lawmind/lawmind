/**
 * The advocate's own side of DPDP: asking for an export, a correction, or
 * deletion of their account.
 *
 * `admin/data-requests.ts` has always had the operator half — list, complete,
 * refuse — and said so plainly: *"No creation endpoint is specced or built;
 * intake is out of this surface's scope."* That made the whole obligation
 * unreachable in the product: a table with a clock on it that nothing could put
 * a row into.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `due_at` IS AN OPERATIONAL COMMITMENT, NOT A CLAIM ABOUT THE STATUTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The DPDP Act 2023 does not itself fix a numeric deadline for responding to a
 * data-principal request; the timelines live in Rules that this repository has
 * no counsel's opinion on. So {@link RESPONSE_DAYS} is **our own service
 * commitment**, chosen conservatively, and it is deliberately not described
 * anywhere as "the legal deadline". Inventing a statutory number is exactly the
 * failure `CLAUDE.md` §7 forbids — and getting it wrong in the direction of
 * "later" is a compliance failure, not a cosmetic one.
 *
 * `docs/FOUNDER_QUEUE.md` carries the item: counsel confirms the real window,
 * and the constant moves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REQUESTING IS NOT EXECUTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `POST /me/data-requests { kind: 'erasure' }` creates a REQUEST. It does not
 * erase, and there is no route on this surface that does. Erasure runs from the
 * admin side (`POST /admin/data-requests/:id/erase`), because it is
 * irreversible, it destroys rows other advocates' shares depend on, and a
 * mis-tapped button on a phone must not be able to do it. An advocate who wants
 * out is not made to wait for a human decision — they are made to wait for a
 * human to press the button, which is a different and much smaller thing.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

/** Our commitment, not the statute's. See the module note. */
export const RESPONSE_DAYS = Number(process.env['DATA_REQUEST_RESPONSE_DAYS'] ?? 30);

export const dataRequestBody = z
  .object({
    kind: z.enum(['export', 'correction', 'erasure']),
    /**
     * Free text for a correction ("my enrolment number is wrong"). Bounded, and
     * NOT stored for an erasure request — there is nothing to say, and a note
     * attached to a deletion request is one more thing to delete.
     */
    note: z.string().max(1000).optional(),
  })
  .strict();

type Row = {
  id: string;
  kind: string;
  status: string;
  due_at: string;
  completed_at: string | null;
  refusal_reason: string | null;
  created_at: string;
};

const shape = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  dueAt: r.due_at,
  completedAt: r.completed_at,
  refusalReason: r.refusal_reason,
  createdAt: r.created_at,
});

const COLUMNS = (sql: Sql) => sql`
  id, kind, status,
  ${sql.unsafe(isoColumn('due_at'))} AS due_at,
  ${sql.unsafe(isoColumn('completed_at'))} AS completed_at,
  refusal_reason,
  ${sql.unsafe(isoColumn('created_at'))} AS created_at`;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CALLER IS AN IDENTITY, NOT A PROFILE — NEW3 R21 §4, SR-1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `authId` is the authenticated principal and is what this route now requires.
 * `userId` is the profile and is `undefined` for an `identity_only` account —
 * an advocate who verified an email and never finished onboarding.
 *
 * **That population is not "an account with nothing to erase."** With no `users`
 * row we still durably hold their EMAIL ADDRESS and name (`auth_user`), an IP
 * ADDRESS AND USER-AGENT PER SESSION (`auth_session`), a provider row
 * (`auth_account`), magic-link artifacts keyed by the email with no foreign key
 * to cascade from (`auth_verification`), and a hashed token family
 * (`refresh_tokens`). That is personal data under DPDP whether or not anyone
 * finished onboarding, and `eraseUser` already deletes every one of those rows.
 * The only thing missing was a way to ASK.
 *
 * No profile is created here, by the client or silently on their behalf: making
 * a `users` row in order to delete a `users` row is the product manufacturing
 * personal data as the price of erasing personal data.
 */
export async function createDataRequest(
  c: Context,
  sql: Sql,
  authId: string | undefined,
  userId: string | undefined,
  body: z.infer<typeof dataRequestBody>,
): Promise<Response> {
  // A data request is about a specific person's data, so there is no meaningful
  // anonymous version of it. 401 rather than a queue nobody can be matched to.
  // This is now the ONLY 401: a caller with no auth identity at all.
  if (!authId) {
    return fail(c, 'AUTH_REQUIRED', 'Sign in to make a data request about your account.', 401);
  }

  /**
   * One OPEN request per kind — SR-6, and scoped to the PRINCIPAL.
   *
   * Not a rate limit — an advocate hitting "delete my account" three times
   * because the first tap did not obviously do anything should not create three
   * clocks, three audit trails and three chances for an operator to erase an
   * account twice. The existing request is returned, so the client can show its
   * status either way and the second tap looks like it worked, because it did.
   *
   * Keyed on `auth_id` rather than `user_id`, which also closes the gap SR-4
   * names: an advocate who asks to be deleted and THEN completes onboarding has
   * one open request, not two, because the identity did not change when the
   * profile appeared.
   */
  const [existing] = await sql<Row[]>`
    SELECT ${COLUMNS(sql)} FROM data_requests
     WHERE auth_id = ${authId} AND kind = ${body.kind}
       AND status IN ('received', 'in_progress')
     ORDER BY created_at DESC LIMIT 1`;
  if (existing) return ok(c, { request: shape(existing), alreadyOpen: true });

  const [created] = await sql<Row[]>`
    INSERT INTO data_requests (auth_id, user_id, kind, status, due_at)
    VALUES (${authId}, ${userId ?? null}::uuid, ${body.kind}, 'received',
            now() + ${`${RESPONSE_DAYS} days`}::interval)
    RETURNING ${COLUMNS(sql)}`;
  if (!created) return fail(c, 'REQUEST_FAILED', 'The request could not be recorded.', 500);
  return ok(c, { request: shape(created), alreadyOpen: false }, 201);
}

/**
 * The same principal shift as the create. An `identity_only` advocate who has
 * asked to be deleted must be able to SEE that request — the client renders its
 * status from this list, and a create that succeeds followed by a list that
 * 401s would read to them as the request having failed.
 */
export async function listOwnDataRequests(
  c: Context,
  sql: Sql,
  authId: string | undefined,
): Promise<Response> {
  if (!authId) {
    return fail(c, 'AUTH_REQUIRED', 'Sign in to see your data requests.', 401);
  }
  const rows = await sql<Row[]>`
    SELECT ${COLUMNS(sql)} FROM data_requests
     WHERE auth_id = ${authId} ORDER BY created_at DESC`;
  return ok(c, { requests: rows.map(shape) });
}
