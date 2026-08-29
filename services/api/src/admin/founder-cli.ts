/**
 * Create the FIRST real account, from the shell, so an audit row can name a
 * real person.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES, AND WHY IT IS NOT THE ONE IT LOOKS LIKE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The account path is complete and this does NOT replace any of it:
 *
 *   magic link verified  ->  auth_user row (email, nothing else)
 *   PATCH /me            ->  users row (the first point a name and phone exist)
 *   role-cli --apply     ->  users.role = 'admin', audited
 *
 * Every step of that works. What has no path at all is the FIRST one, off the
 * phone: `auth_user` is created by better-auth when a magic link is verified,
 * and verifying a magic link needs a running mailer and a device. So on a box
 * with a database and no app there is no way to bring a real identity into
 * existence, and `role-cli` cannot grant a role to a user that does not exist.
 *
 * That is not theoretical. `FQ-ECOURTS-ACTOR` has been open since 17 Aug 2026
 * asking the founder for a `users.id` to stamp on the eCourts kill-switch audit
 * row. `audit_log.actor_user_id` is NOT NULL and naming an arbitrary user as the
 * person who authorised a change is a FALSE audit record, which is worse than no
 * record at all. Measured 29 Aug 2026: `users` holds 390 rows, 87 of them
 * already `role = 'admin'`, and they are fixtures — the eCourts switch is still
 * off because there is nobody honest to name.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It does not grant a role.** It creates an identity and a profile, both at
 * the default `advocate`, and stops. `role-cli.ts` is still the only way to
 * become an admin, it still writes its own audit row, and the two steps stay
 * two steps on purpose: one command that both invents a person and makes them
 * an administrator is a privilege-escalation primitive with a friendly name.
 *
 * **It does not create a session or a credential.** No password, no token, no
 * `auth_session` row. The account it makes is one the founder then signs into
 * through the ordinary magic link, against the email recorded here. Anything
 * else would be a back door that outlives its reason.
 *
 * **It does not mark the email verified.** `email_verified` is false, exactly as
 * it would be before the first link is clicked. Setting it true would be this
 * command asserting something it did not witness.
 *
 * **It does not accept the terms.** `terms_accepted_at` stays NULL. PD-8: consent
 * is recorded, never inferred, and a CLI cannot consent on a person's behalf.
 *
 * **There is no HTTP route and there will not be one.** Same rule `role-cli`
 * states: the person who can run this on the server can already read the
 * database, and nothing is weakened by making them say so in a ledger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node --import tsx src/admin/founder-cli.ts \
 *     --email me@lawmind.in --name "Full Name" --phone "+91..." \
 *     --reason "first operator account, no admin exists" --apply
 *
 * Dry run unless `--apply`. Idempotent: an existing `auth_user` or `users` row
 * for the email is REPORTED and reused, never overwritten — re-running after a
 * partial failure completes the missing half rather than erroring or duplicating.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AN APPLIED RUN IS PERMANENT. THERE IS NO UNDO, AND THAT IS CORRECT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Found by running it: the account this creates **cannot be deleted**, and the
 * chain is airtight rather than a bug.
 *
 *   audit_log is APPEND-ONLY at the database level — 0002's REVOKE plus an
 *   `audit_log_append_only()` trigger, which raises 23001 on any DELETE;
 *   audit_log.actor_user_id has an FK to users, so the users row it names
 *   cannot be deleted while that audit row exists;
 *   and that audit row is the one this command writes.
 *
 * So `--apply` is not reversible by deletion. The product's own answer to
 * exactly this is `auth/erasure.ts`, and it is the right one here too:
 * **anonymise the identity, destroy the credential.** Drop the `auth_user` row
 * (which makes the account unreachable by any login) and redact the `users` row
 * to `redacted()`'s placeholder — `Deleted account` / `''` /
 * `erased+<id>@invalid`. The audit row stays, naming an anonymised id, which is
 * what an audit ledger is for.
 *
 * The practical consequence: **do not run `--apply` to try it out.** The dry
 * run is the whole rehearsal, and it is the default for this reason.
 */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

import { writeAudit } from './audit.ts';
import { sslFor } from '../db-ssl.ts';

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}
function usage(message: string): never {
  console.error(`${message}

usage: founder-cli --email <address> --name "<full name>" --phone "<phone>"
                   --reason "<why>" [--apply]

Creates an auth_user identity and its users profile, both at role 'advocate'.
Does NOT grant admin — run role-cli afterwards, which writes its own audit row.
Does NOT verify the email, create a session, or accept the terms.

Dry run unless --apply. Idempotent: existing rows are reused, never overwritten.`);
  process.exit(2);
}

const email = flag('email')?.trim().toLowerCase();
const name = flag('name')?.trim();
const phone = flag('phone')?.trim();
const reason = flag('reason');
const apply = args.includes('--apply');

if (!email) usage('--email is required');
// Not a validator, a typo guard. An address with no @ cannot receive the magic
// link this account is meant to be signed into with, and the failure would
// surface days later as "the link never arrived".
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) usage(`--email does not look like an address: ${email}`);
if (!name) usage('--name is required — users.full_name is NOT NULL');
if (!phone) usage('--phone is required — users.phone is NOT NULL');
if (!reason) usage('--reason is required — an unexplained account creation is not auditable');

const url =
  process.env['LOCAL_DATABASE_URL'] ??
  process.env['CORPUS_DATABASE_URL'] ??
  process.env['DATABASE_URL'];
if (!url) {
  console.error('no database URL is set (LOCAL_DATABASE_URL / CORPUS_DATABASE_URL / DATABASE_URL)');
  process.exit(2);
}

const sql = postgres(url, { max: 1, ssl: sslFor(url), onnotice: () => {} });

try {
  const [existingAuth] = await sql<{ id: string; email_verified: boolean }[]>`
    SELECT id, email_verified FROM auth_user WHERE lower(email) = ${email}`;
  const [existingUser] = await sql<{ id: string; role: string; auth_id: string }[]>`
    SELECT u.id::text, u.role, u.auth_id FROM users u WHERE lower(u.email) = ${email}`;

  console.log(`email            ${email}`);
  console.log(`auth_user        ${existingAuth ? `EXISTS ${existingAuth.id}` : 'would be CREATED'}`);
  console.log(
    `users profile    ${existingUser ? `EXISTS ${existingUser.id} (role ${existingUser.role})` : 'would be CREATED'}`,
  );

  if (existingAuth && existingUser) {
    // Both halves present. Nothing to do, and saying so is the useful output —
    // the caller's real question is "can role-cli name this person yet", and the
    // answer is yes.
    console.log('\nnothing to do — both halves exist. role-cli can name this user:');
    console.log(`  --actor-email ${email}   (or --actor ${existingUser.id})`);
    process.exit(0);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  /**
   * Both halves in ONE transaction.
   *
   * A half-created founder is the worst outcome available here: an `auth_user`
   * with no profile lets a magic link succeed into an account `PATCH /me` then
   * has to finish, and a profile with a dangling `auth_id` is a row no login can
   * ever reach. Either way somebody debugs it at the moment they most need the
   * account to work.
   */
  const result = await sql.begin(async (tx) => {
    let authId = existingAuth?.id;
    if (!authId) {
      authId = randomUUID();
      await tx`
        INSERT INTO auth_user (id, name, email, email_verified)
        VALUES (${authId}, ${name}, ${email}, false)`;
    }

    let userId = existingUser?.id;
    if (!userId) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO users (auth_id, full_name, phone, email, role)
        VALUES (${authId}, ${name}, ${phone}, ${email}, 'advocate')
        RETURNING id::text`;
      userId = row!.id;
    }

    /**
     * The audit row names the created user as its own actor, and that is the
     * honest reading rather than a convenience.
     *
     * `audit_log.actor_user_id` is NOT NULL and at this instant there is no
     * other real person in the table — that absence is the entire reason this
     * command exists. Borrowing a fixture's id would be the exact false record
     * `kill-switch-cli` refuses to write. The `reason` carries who ran it and
     * why, and the operator had shell access to the database either way.
     */
    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'advocate',
      action: 'account.founder_bootstrap',
      targetType: 'users',
      targetId: userId,
      // Changed fields only, never a whole row. `before` is null because there
      // was nothing here — which is the fact this row exists to record.
      before: null,
      after: {
        email,
        authId,
        role: 'advocate',
        createdAuthUser: !existingAuth,
        createdProfile: !existingUser,
      },
      reason,
    });

    return { authId, userId };
  });

  console.log(`\napplied.  auth_user ${result.authId}  users ${result.userId}  role advocate`);
  console.log('audit_log row written in the same transaction.');
  console.log('\nNext, if this account should administer:');
  console.log(
    `  node --import tsx src/admin/role-cli.ts --email ${email} --role admin \\\n` +
      `    --actor-email ${email} --reason "<why>" --apply`,
  );
  console.log('\nThe email is NOT verified and there is no session. Sign in with the ordinary');
  console.log('magic link; the terms are accepted in the app, never here.');
} finally {
  await sql.end({ timeout: 5 });
}
