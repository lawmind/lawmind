/**
 * better-auth's own tables, transcribed from what the library actually declares.
 *
 * **Not written from documentation or memory.** These columns were read out of
 * `getAuthTables()` in the installed better-auth 1.6.26 with our exact plugin set
 * and printed field by field. A hand-written guess at another library's schema is
 * a migration that applies cleanly and fails at the first login.
 *
 * **Prefixed `auth_`, and mapped back by the adapter.** better-auth asks for
 * models named `user`, `session`, `account` and `verification`. Those are
 * generic names in a schema that already holds `users`, and `session` sitting
 * beside `searches` and `matters` tells a reader nothing about who owns it. The
 * drizzle adapter takes a `schema` map, so the library keeps its model names and
 * the database gets names that say where they came from.
 *
 * **`users` is the profile; `auth_user` is the identity.** They are different
 * things and the split is deliberate — see `packages/auth/src/index.ts`.
 */
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Identity. Created the moment a magic link is verified — email and nothing else. */
export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSession = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
});

/**
 * Present because better-auth requires it, not because we use it. There is no
 * OAuth provider and no password in this product — the only credential is a link
 * sent to an email address the advocate already controls.
 */
export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Where the magic-link token lives between being emailed and being used. */
export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Refresh tokens — ours, not better-auth's.
 *
 * `SPRINT_5.md` specifies JWT plus a rotating refresh on a 30-day sliding window.
 * The access token is a short-lived JWT so the common path costs no database
 * round trip; the refresh token is **opaque and stored only as a SHA-256 hash**,
 * because a readable token table is a table whose leak is a login for everyone in
 * it.
 *
 * **Rotation with reuse detection.** Each refresh mints a successor and revokes
 * its parent. If a token that has already been used is presented again, that is
 * either a stolen token or a client bug, and both are answered the same way:
 * **the whole family is revoked and the advocate signs in again.** `replaced_by`
 * is what makes the family walkable.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  /** SHA-256 of the token. The token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Set when rotated or revoked. Null means live. */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  /** The successor this token was rotated into. Walks the family on reuse. */
  replacedBy: text('replaced_by'),
});
