/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCOUNT DELETION — WHAT GOES, WHAT STAYS, AND WHY EACH IS NOT A CHOICE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `PRIVACY_PII.md` §Retention is the specification and it is unusually blunt:
 *
 *   > *"Deletion purges R2 objects, Postgres rows, embeddings and caches. **A
 *   > soft delete flag is not deletion.**"*
 *
 * So nothing here sets a `deleted_at` and calls it done. Twenty-one tables carry
 * a foreign key to `users`; every one of them is named below with a decision and
 * a reason, because the failure mode of this function is a table nobody thought
 * about still holding an advocate's client's name a year after they left.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE ROW THAT CANNOT BE DELETED, AND WHY THAT IS CORRECT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `audit_log.actor_user_id` references `users`, and `audit_log` is APPEND-ONLY
 * at the database level — `0002_audit_log_append_only.sql` REVOKEs UPDATE and
 * DELETE and adds a raising trigger. An admin who upheld a citation dispute in
 * March cannot have that record erased in August by closing their account, and
 * the governance property that makes the ledger worth keeping is exactly that
 * nobody can.
 *
 * The reconciliation is **anonymisation of the identity, deletion of the
 * content**: the `users` row survives as an opaque key so the ledger keeps its
 * referential integrity, and every field on it that identifies a human is
 * destroyed. What is left is a uuid that points at nobody.
 *
 * That is a real limitation and it is disclosed rather than hidden —
 * `PRIVACY_PII.md` opens by saying there is no PII solution that guarantees
 * complete erasure. This function's job is to make the residue as small and as
 * honest as it can be, not to claim it is zero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DELETING THE CONTENT IS HALF OF IT. THE OTHER HALF IS THE IDENTITY.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Until 23 Aug 2026 this function deleted an advocate's matters and anonymised
 * their profile, returned 200, and **left them able to sign in**. Three
 * mechanisms, each independent of the others:
 *
 *   1. `refresh_tokens` was never touched. It keys on `auth_user.id`, not on
 *      `users.id`, so a function that walks `users` never reaches it — and
 *      `rotateRefreshToken` mints a fresh access token on a 30-day sliding
 *      window for as long as the family is alive.
 *   2. `auth_user` was never touched, so it kept the advocate's real name and
 *      email, AND it is the existence check `rotateRefreshToken` performs
 *      before minting. Keeping it is what made (1) exploitable rather than
 *      merely untidy.
 *   3. the `auth_session` delete could not match anything. It resolved the auth
 *      id through `(SELECT auth_id FROM users …)` in a statement that ran
 *      AFTER the same transaction had already rewritten that column to
 *      `erased-<uuid>`. It deleted zero rows every time and reported `0`, which
 *      is indistinguishable from a user who had no sessions.
 *
 * The ordering bug in (3) is the one worth remembering: **the anonymisation
 * destroys the key the identity cleanup needs.** So the auth id and the email
 * are now captured FIRST, before anything is redacted, and every identity
 * statement uses the captured values.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT DO YET, STATED RATHER THAN SILENTLY OMITTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **R2 objects.** `documents.storage_key` and `ocr_jobs` point at objects in
 *   Cloudflare R2, and so does `data_requests.artefact_storage_key` — the
 *   EXPORT of this advocate's own data, which is the single most concentrated
 *   object we ever write about one person and which this function used not to
 *   name at all. The rows go; the objects need an R2 client and a credential
 *   this service does not hold, so `erasedStorageKeys` RETURNS them and the
 *   caller is responsible. A function that silently left them would let us
 *   report "deleted" while the file is still fetchable by key.
 * - **An unexpired access token.** A signed JWT cannot be un-signed, so one
 *   already issued stays cryptographically valid for the rest of its short TTL.
 *   What it can REACH is the property that matters, and that is gone: the
 *   profile lookup goes through `users.auth_id`, which no longer matches. The
 *   bearer of such a token sees a signed-in shell with no profile, not the
 *   advocate's account.
 * - **Backups.** A restore of yesterday's dump restores yesterday's user. The
 *   backup pack's retention window is the real bound on erasure and it belongs
 *   in the privacy disclosure, not in a comment here.
 */
import type { Sql, TransactionSql } from 'postgres';

import { writeAudit } from '../admin/audit.ts';

export type ErasureResult = {
  userId: string;
  /** Row counts per table, so the caller can prove what happened. */
  deleted: Record<string, number>;
  /**
   * R2 keys this function could not remove. **The caller must delete these**;
   * an empty array means there were none, never "we handled it".
   */
  erasedStorageKeys: string[];
};

/**
 * The placeholder identity. Deliberately not null: `users.full_name`, `phone`
 * and `email` are all NOT NULL, and widening them to nullable to support
 * deletion would let an ordinary bug create a nameless live account.
 *
 * The uuid suffix keeps `email` unique, which is a constraint the table already
 * has and which two erased accounts would otherwise collide on.
 */
function redacted(userId: string) {
  return {
    full_name: 'Deleted account',
    phone: '',
    email: `erased+${userId}@invalid`,
  };
}

/**
 * Erase one advocate, in ONE transaction.
 *
 * All-or-nothing on purpose: a partial erasure that deleted the matters and
 * failed on the annotations would leave orphaned client notes and a user who
 * believes their data is gone. Either every statement lands or none does.
 */
export async function eraseUser(
  sql: Sql,
  userId: string,
  actor: { userId: string; role: string },
  reason: string,
): Promise<ErasureResult> {
  return sql.begin(async (tx: TransactionSql) => {
    const deleted: Record<string, number> = {};
    const count = async (label: string, run: Promise<{ count: number }>) => {
      deleted[label] = (await run).count;
    };

    /**
     * IDENTITY FIRST, while it is still readable.
     *
     * The anonymisation below rewrites `users.auth_id`, which is the only link
     * from this profile to the better-auth identity that owns the sessions and
     * the refresh-token family. Reading it afterwards — as this function used
     * to — resolves to `erased-<uuid>`, matches nothing, and deletes nothing
     * while reporting a count of zero.
     */
    const [identity] = await tx<{ auth_id: string; email: string }[]>`
      SELECT auth_id, email FROM users WHERE id = ${userId}::uuid`;
    if (!identity) {
      throw new Error(`eraseUser: no users row for ${userId}`);
    }
    const authId = identity.auth_id;
    const email = identity.email;

    // Storage keys FIRST, while the rows still exist to be read.
    const docs = await tx<{ storage_key: string | null }[]>`
      SELECT storage_key FROM documents WHERE user_id = ${userId}::uuid`;
    /**
     * The data-export artefact is an R2 object too, and the one that concerns
     * this advocate most: a single file containing everything we held about
     * them. `data_requests` rows survive erasure (they are the record that the
     * erasure was asked for and carried out), so the key must be handed to the
     * caller or the object outlives the account silently.
     */
    const artefacts = await tx<{ artefact_storage_key: string | null }[]>`
      SELECT artefact_storage_key FROM data_requests WHERE user_id = ${userId}::uuid`;
    const erasedStorageKeys = [
      ...docs.map((d) => d.storage_key),
      ...artefacts.map((a) => a.artefact_storage_key),
    ].filter((k): k is string => k !== null);

    /**
     * ── CONTENT THE ADVOCATE CREATED — deleted outright ──────────────────────
     *
     * **Order is a constraint, not a preference, and it was read off the
     * database rather than assumed.** `documents`, `ocr_jobs`, `alerts`,
     * `citation_copies` and `searches` all reference `matters` with
     * `NO ACTION`, so deleting the matters first raises a foreign-key violation
     * and the whole transaction fails. Only `matter_authorities`,
     * `matter_events`, `matter_shares` and `briefings` CASCADE.
     *
     * So: everything that POINTS at a matter goes first, then the matters.
     */
    await count('documents', tx`DELETE FROM documents WHERE user_id = ${userId}::uuid`);
    await count('ocr_jobs', tx`DELETE FROM ocr_jobs WHERE user_id = ${userId}::uuid`);
    await count('judgment_annotations', tx`
      DELETE FROM judgment_annotations WHERE user_id = ${userId}::uuid`);
    await count('saved_searches', tx`DELETE FROM saved_searches WHERE user_id = ${userId}::uuid`);
    await count('alerts', tx`DELETE FROM alerts WHERE user_id = ${userId}::uuid`);
    // Named explicitly in `PRIVACY_PII.md`: *"Copied-citation records: deleted
    // with the account or on erasure request."* The warning path they exist for
    // cannot reach a closed account anyway.
    await count('citation_copies', tx`DELETE FROM citation_copies WHERE user_id = ${userId}::uuid`);
    await count('searches', tx`DELETE FROM searches WHERE user_id = ${userId}::uuid`);
    await count('training_consent_events', tx`
      DELETE FROM training_consent_events WHERE user_id = ${userId}::uuid`);
    /**
     * ── ANALYTICS AND PREMIUM STATE, NAMED BECAUSE THEY WERE MISSED ──────────
     *
     * All seven tables below carry `user_id` and none of them appeared in this
     * function before 23 Aug 2026. Every one is empty today — the premium spine
     * exists and nothing has been sold — which is exactly why they were easy to
     * miss and exactly why they are added now rather than after the first
     * paying advocate closes an account.
     *
     * `activation_events`, `experiment_assignments` and `experiment_exposures`
     * are behavioural records of one person. `PRIVACY_PII.md` treats an
     * analytics identifier as identifying, and the funnel is measurable in
     * aggregate without them.
     *
     * `premium_jobs` carries `matter_id` and a params hash — it points straight
     * back at a client's case and cannot outlive the matter it describes.
     *
     * `entitlements` is LIVE state: an entitlement that survives its owner is a
     * capability granted to a deleted account.
     */
    await count('activation_events', tx`
      DELETE FROM activation_events WHERE user_id = ${userId}::uuid`);
    await count('experiment_assignments', tx`
      DELETE FROM experiment_assignments WHERE user_id = ${userId}::uuid`);
    await count('experiment_exposures', tx`
      DELETE FROM experiment_exposures WHERE user_id = ${userId}::uuid`);
    await count('premium_jobs', tx`DELETE FROM premium_jobs WHERE user_id = ${userId}::uuid`);
    await count('entitlements', tx`DELETE FROM entitlements WHERE user_id = ${userId}::uuid`);
    // A share GRANTED to somebody else is that person's access to this
    // advocate's matter, and it must stop working. Deleted by both directions
    // before the matters, though the matter delete would cascade them anyway —
    // an invitation this user RECEIVED sits on another advocate's matter and
    // would otherwise survive.
    await count('matter_shares', tx`
      DELETE FROM matter_shares
       WHERE granted_by_user_id = ${userId}::uuid
          OR invited_user_id = ${userId}::uuid`);
    // Matters carry client names, notes and hearing detail — the most sensitive
    // rows this product holds. Last, for the reason above.
    await count('matters', tx`DELETE FROM matters WHERE user_id = ${userId}::uuid`);

    /**
     * ── RECORDS THAT ARE NOT THEIRS TO DELETE ────────────────────────────────
     *
     * `citation_disputes`, `verification_cache`, `matter_authorities` inside
     * ANOTHER advocate's shared matter, `llm_calls`, `audit_log`. Each of these
     * is a claim about the corpus or about the platform rather than about the
     * person: upholding a dispute changed a judgment's overruled status for
     * every advocate in the product, and a Tier 3 confirmation is a human
     * vouching that a citation exists (`CITATION_HARNESS.md`). Deleting them
     * would remove evidence other people rely on.
     *
     * **They are not detached with `SET user_id = NULL` either**, and the first
     * draft of this function was wrong to try: `citation_disputes
     * .reported_by_user_id` and `matter_authorities.added_by_user_id` are NOT
     * NULL, deliberately — a dispute that names no reporter is not a dispute —
     * so nulling them would have failed at runtime, and widening the columns to
     * permit it would weaken an invariant for every FUTURE row in order to
     * serve deletion.
     *
     * The anonymised `users` row below IS the detachment. These foreign keys
     * keep pointing at a uuid, and that uuid now names nobody: no name, no
     * phone, no email, no enrolment number, no sign-in. That is the same
     * privacy outcome with none of the schema damage, and it is why the row is
     * kept rather than deleted.
     */

    /**
     * ── DETACHED RATHER THAN DELETED ─────────────────────────────────────────
     *
     * `entitlement_events` is the payment provider's webhook ledger and its FK
     * is already `ON DELETE SET NULL` — the schema author's own statement that
     * the event record is meant to outlive the person. Reconciling a provider's
     * events against ours is how a double charge is found, and that is a claim
     * about the platform rather than about the advocate. The link goes; the
     * event stays.
     *
     * `credit_ledger` is money. A purchase record is a financial and tax
     * document, and erasing it would be destroying an accounting record to
     * satisfy a privacy request — the two obligations point in opposite
     * directions and only the founder can weigh them. It is LEFT, pointing at
     * the anonymised `users` row, and recorded in `docs/FOUNDER_QUEUE.md`
     * rather than decided here.
     *
     * `llm_calls.user_id` is nulled. The table holds NO prompt content — token
     * counts, model, cost, latency, `data_class`, `pseudonymised`, and nothing
     * else (verified against the live schema, and 0 of 40,121 rows carry a
     * user_id today). So there is no residue to delete; what there is, is a
     * link between an advocate and what they asked for, and cost accounting
     * does not need it.
     */
    await count('entitlement_events', tx`
      UPDATE entitlement_events SET user_id = NULL WHERE user_id = ${userId}::uuid`);
    await count('llm_calls', tx`
      UPDATE llm_calls SET user_id = NULL WHERE user_id = ${userId}::uuid`);

    /**
     * ── THE IDENTITY ITSELF ──────────────────────────────────────────────────
     *
     * Ordering here is load-bearing and was the bug. The better-auth rows are
     * destroyed FIRST, using the auth id captured before any redaction, and the
     * profile is anonymised after. Doing it the other way round is what made
     * the old `auth_session` delete a no-op.
     *
     * `auth_user` is deleted outright — unlike `users`, nothing references it
     * that must survive, and `auth_session`, `auth_account` and `refresh_tokens`
     * all CASCADE from it. They are nonetheless deleted EXPLICITLY and counted
     * first, because a cascade reports nothing: "auth_session: 1" is the
     * evidence that a session existed and is gone, and an erasure whose own
     * result cannot show what it terminated is one nobody can audit.
     *
     * `auth_verification` is keyed by email address, not by user id, so it
     * cascades from nothing. A magic link already sitting in the advocate's
     * inbox is a working credential for this account until it expires.
     */
    await count('refresh_tokens', tx`DELETE FROM refresh_tokens WHERE user_id = ${authId}`);
    await count('auth_session', tx`DELETE FROM auth_session WHERE user_id = ${authId}`);
    await count('auth_account', tx`DELETE FROM auth_account WHERE user_id = ${authId}`);
    await count('auth_verification', tx`
      DELETE FROM auth_verification WHERE identifier = ${email}`);
    await count('auth_user', tx`DELETE FROM auth_user WHERE id = ${authId}`);

    const redact = redacted(userId);
    // `auth_id` is rewritten too: leaving it would let the same identity sign
    // in and find an anonymised shell that is still "their" account.
    await tx`
      UPDATE users
         SET full_name = ${redact.full_name},
             phone = ${redact.phone},
             email = ${redact.email},
             auth_id = ${`erased-${userId}`},
             bar_enrolment_number = NULL,
             expo_push_token = NULL,
             terms_accepted_at = NULL,
             terms_version = NULL,
             training_consent_at = NULL,
             training_consent_version = NULL,
             role = 'advocate'
       WHERE id = ${userId}::uuid`;
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'user.erase',
      targetType: 'user',
      targetId: userId,
      // Counts only. Putting the erased values in the ledger would defeat the
      // erasure, and `audit_log` cannot be edited afterwards.
      before: null,
      after: deleted as Record<string, number>,
      reason,
    });

    return { userId, deleted, erasedStorageKeys };
  });
}
