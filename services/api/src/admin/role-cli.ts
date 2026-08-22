/**
 * Grant or revoke the `admin` role. The ONLY supported way to create an admin.
 *
 * There is no self-service path and there will not be one: an HTTP endpoint that
 * grants admin is an HTTP endpoint that escalates privilege, and the population
 * this serves is a handful of people who already have shell access to the box.
 * `kill-switch-cli.ts` made exactly this call for exactly this reason and this
 * follows its shape deliberately — dry-run by default, `--apply` to write, an
 * `audit_log` row in the SAME transaction as the change.
 *
 * The first admin is a chicken-and-egg problem with only one honest answer: the
 * person who can run this command on the server is the person who can already
 * read the database. Nothing is weakened by letting them say so out loud, in a
 * ledger, instead of by an UPDATE nobody records.
 *
 *   node --import tsx src/admin/role-cli.ts --email a@b.com --role admin \
 *        --actor-email me@lawmind.in --reason "founder grant" --apply
 */
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

usage: role-cli --email <user> --role advocate|admin
                (--actor-email <admin> | --actor <uuid>)
                --reason "<why>" [--apply]

Dry run unless --apply is given. Every applied change writes audit_log in the
same transaction, so a grant that is not in the ledger did not happen.`);
  process.exit(2);
}

const email = flag('email');
const role = flag('role');
const actorEmail = flag('actor-email');
const actorId = flag('actor');
const reason = flag('reason');
const apply = args.includes('--apply');

if (!email) usage('--email is required');
if (role !== 'advocate' && role !== 'admin') usage('--role must be advocate or admin');
if (!actorEmail && !actorId) usage('one of --actor-email or --actor is required');
if (actorEmail && actorId) usage('give --actor-email or --actor, not both');
if (!reason) usage('--reason is required — an unexplained privilege change is not auditable');

const url =
  process.env['LOCAL_DATABASE_URL'] ??
  process.env['CORPUS_DATABASE_URL'] ??
  process.env['DATABASE_URL'];
if (!url) {
  console.error('no database URL is set (LOCAL_DATABASE_URL / CORPUS_DATABASE_URL / DATABASE_URL)');
  process.exit(2);
}

const sql = postgres(url, { ssl: sslFor(url), max: 1 });

try {
  const [target] = await sql<{ id: string; email: string; full_name: string; role: string }[]>`
    SELECT id, email, full_name, role FROM users WHERE email = ${email}`;
  if (!target) {
    console.error(`no user with email ${email}`);
    process.exit(1);
  }

  const [actor] = actorId
    ? await sql<{ id: string; email: string; role: string }[]>`
        SELECT id, email, role FROM users WHERE id = ${actorId}::uuid`
    : await sql<{ id: string; email: string; role: string }[]>`
        SELECT id, email, role FROM users WHERE email = ${actorEmail!}`;
  if (!actor) {
    console.error('the acting user does not exist — the ledger must name a real person');
    process.exit(1);
  }

  console.log(`target   ${target.id}  ${target.full_name}  ${target.email}`);
  console.log(`before   role=${target.role}`);
  console.log(`after    role=${role}`);
  console.log(`actor    ${actor.id}  ${actor.email}  (role=${actor.role})`);
  console.log(`reason   ${reason}`);

  if (target.role === role) {
    console.log('\nno change — the user already holds that role.');
    process.exit(0);
  }
  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE users SET role = ${role} WHERE id = ${target.id}::uuid`;
    await writeAudit(tx, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: role === 'admin' ? 'user.role.grant_admin' : 'user.role.revoke_admin',
      targetType: 'user',
      targetId: target.id,
      before: { role: target.role },
      after: { role },
      reason: reason ?? null,
    });
  });
  console.log('\nAPPLIED, with an audit_log row in the same transaction.');
} finally {
  await sql.end();
}
