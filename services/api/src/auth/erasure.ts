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
 * WHAT THIS DOES NOT DO YET, STATED RATHER THAN SILENTLY OMITTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **R2 objects.** `documents.storage_key` and `ocr_jobs` point at objects in
 *   Cloudflare R2. The rows go; the objects need an R2 client and a credential
 *   this service does not hold, so `erasedStorageKeys` RETURNS them and the
 *   caller is responsible. A function that silently left them would let us
 *   report "deleted" while the file is still fetchable by key.
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

    // Storage keys FIRST, while the rows still exist to be read.
    const docs = await tx<{ storage_key: string | null }[]>`
      SELECT storage_key FROM documents WHERE user_id = ${userId}::uuid`;
    const erasedStorageKeys = docs.map((d) => d.storage_key).filter((k): k is string => k !== null);

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

    // ── THE IDENTITY ITSELF ────────────────────────────────────────────────
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
    // The better-auth identity and its sessions. Deleting this is what actually
    // ends the ability to sign in.
    await count('auth_session', tx`
      DELETE FROM auth_session WHERE user_id IN (
        SELECT id FROM auth_user WHERE id = (SELECT auth_id FROM users WHERE id = ${userId}::uuid)
      )`);

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
