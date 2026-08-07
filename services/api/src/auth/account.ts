/**
 * The profile, and consent.
 *
 * `PATCH /me` is where an identity becomes an advocate: it is the call that
 * creates the `users` row, because it is the first point at which the NOT NULL
 * columns — a name and a phone number — actually exist. Before it, there is a
 * verified email address and nothing else, and `GET /me` says so.
 *
 * **PD-2 — enrolment is captured and never gates.** `barEnrolmentNumber` is
 * accepted, stored, and marked `unverified` for manual review. A `rejected`
 * enrolment keeps full access. Nothing in this file, or anywhere else in the
 * service, branches on `enrolment_status`, and `auth.test.ts` asserts that.
 *
 * **PD-8 — consent is recorded, never inferred.** `POST /me/accept-terms` is the
 * only thing that writes `terms_accepted_at`, it writes the version alongside it
 * in the same statement, and it refuses a version that is not the current one.
 * The version rather than a boolean, because when the terms change, *which text
 * somebody accepted* is the only thing that matters.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

/**
 * The terms an advocate is asked to accept.
 *
 * Versioned by date and held in the repo so that what was accepted is reviewable
 * in git rather than being whatever the database happened to hold. Changing the
 * text means a new version, and everyone re-accepts — which is the point.
 */
export const CURRENT_TERMS_VERSION = '2026-08-07';

export const CURRENT_TERMS_BODY = [
  'Lawmind assists with legal research and drafting. It does not practise law.',
  '',
  'You remain responsible for everything you file. Verify every authority and every',
  'draft before it leaves your hands — the duty is yours and it is not delegable.',
  '',
  'Citations are checked against our corpus and independent public sources. Where a',
  'citation cannot be confirmed, we say so plainly and never present it as confirmed.',
  'We do not silently drop a citation we could not verify.',
  '',
  'Documents you upload are pseudonymised before any AI model sees them. Automated',
  'detection of personal information is partial, not complete, and we do not claim',
  'otherwise. Do not upload material whose exposure you could not tolerate.',
  '',
  'Your Bar Council enrolment number is recorded if you give it. It is never a',
  'condition of access.',
].join('\n');

export const patchMeBody = z
  .object({
    fullName: z.string().min(1).max(200).optional(),
    phone: z.string().min(5).max(20).optional(),
    preferredLanguage: z.enum(['en', 'hi']).optional(),
    barEnrolmentNumber: z.string().max(60).nullable().optional(),
    /**
     * The device's Expo push token. Sent by the client after the OS prompt is
     * accepted, and explicitly `null` when the advocate turns notifications off —
     * which is why it is nullable rather than merely optional: omitted means "no
     * change", null means "stop sending to this device".
     */
    expoPushToken: z.string().min(1).max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });

export const acceptTermsBody = z.object({
  version: z.string().min(1).max(40),
});

export async function getTerms(c: Context): Promise<Response> {
  return ok(c, { version: CURRENT_TERMS_VERSION, body: CURRENT_TERMS_BODY });
}

export async function patchMe(
  c: Context,
  sql: Sql,
  authId: string | undefined,
  email: string | undefined,
  body: z.infer<typeof patchMeBody>,
): Promise<Response> {
  if (!authId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);

  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE auth_id = ${authId}`;

  if (!existing) {
    // Creating the profile. Both NOT NULL columns must arrive together — a
    // half-profile would need a placeholder name, and a row that asserts a name
    // nobody gave is worse than no row.
    if (!body.fullName || !body.phone) {
      return fail(
        c,
        'PROFILE_INCOMPLETE',
        'creating your profile needs both fullName and phone; they are required and we will not invent either',
        422,
      );
    }
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, bar_enrolment_number,
                         expo_push_token, enrolment_status, preferred_language)
      VALUES (${authId}, ${body.fullName}, ${body.phone}, ${email ?? ''},
              ${body.barEnrolmentNumber ?? null}, ${body.expoPushToken ?? null},
              -- Captured, queued for manual review, and gating nothing. PD-2.
              'unverified', ${body.preferredLanguage ?? 'en'})
      RETURNING id
    `;
    return ok(c, { user: await readProfile(sql, created!.id), created: true });
  }

  await sql`
    UPDATE users SET
      full_name            = coalesce(${body.fullName ?? null}, full_name),
      phone                = coalesce(${body.phone ?? null}, phone),
      preferred_language   = coalesce(${body.preferredLanguage ?? null}, preferred_language),
      bar_enrolment_number = ${
        body.barEnrolmentNumber === undefined ? sql`bar_enrolment_number` : body.barEnrolmentNumber
      },
      expo_push_token = ${
        body.expoPushToken === undefined ? sql`expo_push_token` : body.expoPushToken
      }
    WHERE id = ${existing.id}
  `;
  return ok(c, { user: await readProfile(sql, existing.id), created: false });
}

/**
 * Record consent.
 *
 * Refuses any version that is not current. Accepting a superseded version would
 * record agreement to text the advocate was never shown, which is precisely the
 * failure the version column exists to prevent.
 */
export async function acceptTerms(
  c: Context,
  sql: Sql,
  authId: string | undefined,
  body: z.infer<typeof acceptTermsBody>,
): Promise<Response> {
  if (!authId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);

  if (body.version !== CURRENT_TERMS_VERSION) {
    return fail(
      c,
      'TERMS_VERSION_STALE',
      `these are not the current terms. Fetch GET /terms/current (${CURRENT_TERMS_VERSION}) and present that text before accepting.`,
      409,
    );
  }

  const [row] = await sql<{ terms_accepted_at: string; terms_version: string }[]>`
    UPDATE users
       -- Written together, in one statement. A timestamp without its version
       -- records that somebody agreed to something unidentifiable.
       SET terms_accepted_at = now(), terms_version = ${CURRENT_TERMS_VERSION}
     WHERE auth_id = ${authId}
    RETURNING ${sql.unsafe(isoColumn('terms_accepted_at'))} AS terms_accepted_at, terms_version
  `;

  if (!row) {
    return fail(
      c,
      'PROFILE_INCOMPLETE',
      'finish creating your profile before accepting the terms',
      409,
    );
  }

  return ok(c, { termsAcceptedAt: row.terms_accepted_at, termsVersion: row.terms_version });
}

async function readProfile(sql: Sql, userId: string) {
  const [row] = await sql<
    {
      id: string;
      full_name: string;
      phone: string;
      email: string;
      bar_enrolment_number: string | null;
      enrolment_status: string;
      preferred_language: string;
      subscription_tier: string;
      terms_accepted_at: string | null;
      terms_version: string | null;
      expo_push_token: string | null;
    }[]
  >`
    SELECT id, full_name, phone, email, bar_enrolment_number, enrolment_status,
           preferred_language, subscription_tier, expo_push_token,
           ${sql.unsafe(isoColumn('terms_accepted_at'))} AS terms_accepted_at, terms_version
    FROM users WHERE id = ${userId}
  `;
  return {
    userId: row!.id,
    fullName: row!.full_name,
    phone: row!.phone,
    email: row!.email,
    barEnrolmentNumber: row!.bar_enrolment_number,
    enrolmentStatus: row!.enrolment_status,
    preferredLanguage: row!.preferred_language,
    subscriptionTier: row!.subscription_tier,
    /**
     * A boolean, never the token. The token is a device secret; nothing needs to
     * read it back, and echoing it would put it in every client log and crash
     * report that captures a profile response.
     */
    pushRegistered: row!.expo_push_token !== null,
    termsAcceptedAt: row!.terms_accepted_at,
    termsVersion: row!.terms_version,
  };
}
