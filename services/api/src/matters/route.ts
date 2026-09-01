/**
 * Matters — the retention moat, and what a briefing hangs off.
 *
 * Shapes from `docs/API_CONTRACTS.md` §Matters. Two product rules do the real
 * work here and both are about what NOT to let through.
 *
 * **PD-4 — notes are private by default, and the default lives in the column.**
 * `matter_events.note_visibility` defaults to `private` in the database, not in
 * this file. A note that becomes shared through a missed branch in application
 * code is exactly the failure that rule exists to prevent, and application
 * defaults are how that happens. `order_text` is the court record and always
 * travels with a share; `notes` are what the advocate thinks, and they do not.
 *
 * **`set_aside` disables add-to-matter.** It is the one case where Lawmind
 * refuses to let an authority be used at all. Adding a set-aside judgment to a
 * matter is how it ends up in a draft and then in a filing — so the refusal is
 * enforced on the server, where it cannot be styled away, and it NAMES the
 * judgment that displaced it rather than simply saying no.
 *
 * **Ownership is checked on every read and every write.** A matter carries client
 * names, party details and privileged notes. Sharing is per-matter by invitation
 * (PD-3) and is not built yet, so today the owner is the only reader — and that
 * is enforced in the WHERE clause of each statement rather than by a separate
 * lookup, so there is no path that forgets it.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { recordStepInBackground } from '../product/activation.ts';
import { logger } from '../logger.ts';

export const createMatterBody = z.object({
  caseTitle: z.string().min(1).max(300),
  cnrNumber: z.string().max(40).nullable().optional(),
  court: z.string().min(1).max(200),
  caseType: z.enum(['criminal', 'civil']),
  parties: z.record(z.string(), z.unknown()),
  clientName: z.string().min(1).max(200),
  ourSide: z.enum(['petitioner', 'respondent', 'accused', 'complainant', 'other']),
  nextHearingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const patchMatterBody = z
  .object({
    caseTitle: z.string().min(1).max(300).optional(),
    cnrNumber: z.string().max(40).nullable().optional(),
    court: z.string().min(1).max(200).optional(),
    clientName: z.string().min(1).max(200).optional(),
    ourSide: z.enum(['petitioner', 'respondent', 'accused', 'complainant', 'other']).optional(),
    nextHearingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    status: z.enum(['active', 'disposed', 'archived']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });

export const createEventBody = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventType: z.enum(['hearing', 'order', 'filing', 'note']),
  /** The court record. Always visible to a share. */
  orderText: z.string().max(20000).nullable().optional(),
  /** The advocate's own thinking. Obeys `noteVisibility`, which defaults private. */
  notes: z.string().max(20000).nullable().optional(),
  noteVisibility: z.enum(['private', 'shared']).optional(),
});

type MatterRow = {
  id: string;
  case_title: string;
  cnr_number: string | null;
  court: string;
  case_type: string;
  parties: unknown;
  client_name: string;
  our_side: string;
  next_hearing_date: string | null;
  status: string;
  source: string;
  created_at: string;
};

const MATTER_COLUMNS = `id, case_title, cnr_number, court, case_type, parties, client_name,
       our_side, next_hearing_date::text AS next_hearing_date, status, source,
       ${isoColumn('created_at')} AS created_at`;

const shapeMatter = (r: MatterRow) => ({
  matterId: r.id,
  caseTitle: r.case_title,
  cnrNumber: r.cnr_number,
  court: r.court,
  caseType: r.case_type,
  parties: r.parties,
  clientName: r.client_name,
  ourSide: r.our_side,
  nextHearingDate: r.next_hearing_date,
  status: r.status,
  source: r.source,
  createdAt: r.created_at,
});

function requireUser(c: Context, userId: string | undefined): Response | null {
  if (userId) return null;
  return fail(c, 'AUTH_REQUIRED', 'a matter belongs to an advocate — sign in to continue', 401);
}

/**
 * How this advocate reaches this matter: as its owner, through a live share,
 * or not at all.
 *
 * **PD-3 was half-built until 8 Aug 2026, and RCC found it.** `matter_shares`
 * rows were being written correctly by the owner-side endpoints, and no read
 * path ever consulted them — so an invited advocate could never open the
 * matter they had been invited to. A file handed over that the recipient
 * cannot open has not been handed over.
 *
 * `revoked_at IS NULL` is the whole of the access check on the share side.
 * Revocation is a timestamp rather than a delete precisely so that "who had
 * sight of this matter, and when" survives, which means every read must filter
 * on it — a revoked share that still granted access would make revocation
 * decorative.
 */
export type MatterAccess = 'owner' | 'shared' | 'none';

export async function accessToMatter(
  sql: Sql,
  matterId: string,
  userId: string,
): Promise<MatterAccess> {
  const [row] = await sql<{ access: MatterAccess }[]>`
    SELECT CASE
      WHEN m.user_id = ${userId} THEN 'owner'
      WHEN EXISTS (
        SELECT 1 FROM matter_shares s
        WHERE s.matter_id = m.id
          AND s.invited_user_id = ${userId}
          AND s.revoked_at IS NULL
      ) THEN 'shared'
      ELSE 'none'
    END AS access
    FROM matters m WHERE m.id = ${matterId}
  `;
  return row?.access ?? 'none';
}

export async function listMatters(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const rows = await sql<(MatterRow & { access: MatterAccess })[]>`
    SELECT ${sql.unsafe(MATTER_COLUMNS)},
           CASE WHEN user_id = ${userId!} THEN 'owner' ELSE 'shared' END AS access
    FROM matters
    WHERE user_id = ${userId!}
       -- PD-3: a matter shared WITH me belongs in my list. Without this the
       -- invitation is recorded and invisible, which is what it was until now.
       OR EXISTS (
         SELECT 1 FROM matter_shares s
         WHERE s.matter_id = matters.id
           AND s.invited_user_id = ${userId!}
           AND s.revoked_at IS NULL
       )
    -- Soonest hearing first, and matters with no date last rather than first:
    -- the list exists to answer "what is coming", and a matter with no listed
    -- date is not what is coming.
    ORDER BY next_hearing_date ASC NULLS LAST, created_at DESC
  `;
  return ok(c, {
    matters: rows.map((r) => ({
      ...shapeMatter(r),
      /**
       * Stated, never inferred from a missing field. A shared matter is not
       * the sharee's own caseload and the client should be able to say so
       * without guessing — and without us deciding on their behalf that the
       * distinction does not matter.
       */
      access: r.access,
    })),
    asOf: new Date().toISOString(),
  });
}

export async function createMatter(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof createMatterBody>,
  /**
   * Where the fire-and-forget activation write goes.
   *
   * Defaults to `sql`, so every existing caller is unchanged. It exists because
   * `sql` may now be a TRANSACTION — `withIdempotency` hands the handler the
   * same transaction the idempotency record commits in, which is the whole
   * point — and a background write on a transaction handle runs after that
   * transaction has committed, against a scope that no longer exists. The
   * funnel metric is explicitly allowed to be lost; it is not allowed to take
   * the matter with it.
   */
  pool: Sql = sql,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [row] = await sql<MatterRow[]>`
    INSERT INTO matters (user_id, case_title, cnr_number, court, case_type, parties,
                         client_name, our_side, next_hearing_date, status, source)
    VALUES (${userId!}, ${body.caseTitle}, ${body.cnrNumber ?? null}, ${body.court},
            ${body.caseType}, ${JSON.stringify(body.parties)}::jsonb, ${body.clientName},
            ${body.ourSide}, ${body.nextHearingDate ?? null}, 'active',
            -- Typed by the advocate. A date we were told is a first-class source
            -- (PD-12), not a fallback — next dates are given orally in open court.
            'manual')
    RETURNING ${sql.unsafe(MATTER_COLUMNS)}
  `;
  /**
   * Funnel step 5. Fire-and-forget: an advocate's matter must not fail to be
   * created because a metric could not be written. NEW3 bus 1077 — this and six
   * others were never wired, so `activation_events` was empty everywhere.
   */
  recordStepInBackground(
    pool,
    userId!,
    'created_matter',
    (err) =>
        logger.error(
          { request_id: c.get('requestId'), err, step: 'created_matter' },
          'activation step not recorded',
        ),
  );

  return ok(c, { matter: shapeMatter(row!) }, 201);
}

export async function getMatter(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const access = await accessToMatter(sql, matterId, userId!);
  // Same answer for "does not exist", "is not yours" and "your share was
  // revoked". A distinguishable response would let anyone enumerate which
  // matter ids are real, and a matter id that resolves is itself a fact about
  // another advocate's caseload.
  if (access === 'none') return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  const isOwner = access === 'owner';

  const [matter] = await sql<MatterRow[]>`
    SELECT ${sql.unsafe(MATTER_COLUMNS)} FROM matters WHERE id = ${matterId}
  `;
  if (!matter) return fail(c, 'NOT_FOUND', 'no matter with that id', 404);

  const events = await sql<
    {
      id: string;
      event_date: string;
      event_type: string;
      order_text: string | null;
      notes: string | null;
      note_visibility: string;
      source: string;
      created_at: string;
    }[]
  >`
    SELECT id, event_date::text AS event_date, event_type,
           -- PD-4: "order_text is the court record and is always visible to a
           -- share; notes obey note_visibility."
           order_text,
           -- **The redaction happens HERE, in the query, not in the mapper.**
           -- A note about fees or a client's circumstances must never travel
           -- with a file by accident, and the way that accident happens is a
           -- later branch in application code that forgets to check. If this
           -- row leaves the database already redacted, no downstream mistake
           -- can un-redact it. Same reasoning that put PD-4's default on the
           -- column rather than in a handler.
           CASE WHEN ${isOwner} OR note_visibility = 'shared' THEN notes ELSE NULL END AS notes,
           note_visibility, source, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM matter_events WHERE matter_id = ${matterId}
    ORDER BY event_date DESC, created_at DESC
  `;

  const briefings = await sql<
    {
      id: string;
      hearing_date: string;
      generated_at: string;
      opened_at: string | null;
      dates_confirmed_at: string | null;
      dates_not_confirmed_at: string | null;
      dates_not_confirmed_reason: string | null;
      hearing_date_source: string | null;
    }[]
  >`
    SELECT id, hearing_date::text AS hearing_date,
           ${sql.unsafe(isoColumn('generated_at'))} AS generated_at,
           ${sql.unsafe(isoColumn('opened_at'))} AS opened_at,
           ${sql.unsafe(isoColumn('dates_confirmed_at'))} AS dates_confirmed_at,
           ${sql.unsafe(isoColumn('dates_not_confirmed_at'))} AS dates_not_confirmed_at,
           dates_not_confirmed_reason, hearing_date_source
    FROM briefings WHERE matter_id = ${matterId}
      -- Same rule as documents. A briefing is generated FOR the owner and
      -- carries a preparation checklist derived from their matter — it is
      -- neither the court record nor a shared note.
      AND ${isOwner}
    ORDER BY hearing_date DESC
  `;

  const documents = await sql<
    { id: string; document_type: string; language: string; created_at: string }[]
  >`
    SELECT id, document_type, language, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM documents WHERE matter_id = ${matterId}
      -- PD-4 grants a share "the court record and shared notes only". A draft
      -- is neither: it is the owner's work product, often unfiled and
      -- mid-argument. Excluded for a sharee rather than included because the
      -- join was easy — the rule names what a share grants, and everything it
      -- does not name is withheld.
      AND ${isOwner}
    ORDER BY created_at DESC
  `;

  return ok(c, {
    matter: shapeMatter(matter),
    /**
     * How the caller reaches this matter. Stated so the client never has to
     * infer "this is shared with me" from an empty `documents` array — an
     * absence and a permission boundary look identical otherwise, and one of
     * those is a bug report waiting to happen.
     */
    access,
    events: events.map((e) => ({
      eventId: e.id,
      eventDate: e.event_date,
      eventType: e.event_type,
      orderText: e.order_text,
      notes: e.notes,
      noteVisibility: e.note_visibility,
      source: e.source,
      createdAt: e.created_at,
    })),
    briefings: briefings.map((b) => ({
      briefingId: b.id,
      hearingDate: b.hearing_date,
      generatedAt: b.generated_at,
      openedAt: b.opened_at,
      /**
       * Three states, never a boolean. Both null means nobody has checked this
       * date; the client must not render that as confirmed. Same rule as a
       * citation: an unconfirmed listing is never presented as confirmed.
       */
      datesConfirmedAt: b.dates_confirmed_at,
      datesNotConfirmedAt: b.dates_not_confirmed_at,
      datesNotConfirmedReason: b.dates_not_confirmed_reason,
      hearingDateSource: b.hearing_date_source,
    })),
    documents: documents.map((d) => ({
      documentId: d.id,
      documentType: d.document_type,
      language: d.language,
      createdAt: d.created_at,
    })),
    asOf: new Date().toISOString(),
  });
}

export async function patchMatter(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  body: z.infer<typeof patchMatterBody>,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [row] = await sql<MatterRow[]>`
    UPDATE matters SET
      case_title        = coalesce(${body.caseTitle ?? null}, case_title),
      court             = coalesce(${body.court ?? null}, court),
      client_name       = coalesce(${body.clientName ?? null}, client_name),
      our_side          = coalesce(${body.ourSide ?? null}, our_side),
      status            = coalesce(${body.status ?? null}, status),
      -- Explicit null is a real instruction here: "the next date is no longer
      -- known" is a thing an advocate needs to be able to say, so undefined
      -- means leave alone and null means clear it.
      cnr_number        = ${body.cnrNumber === undefined ? sql`cnr_number` : body.cnrNumber},
      next_hearing_date = ${
        body.nextHearingDate === undefined ? sql`next_hearing_date` : body.nextHearingDate
      }
    WHERE id = ${matterId} AND user_id = ${userId!}
    RETURNING ${sql.unsafe(MATTER_COLUMNS)}
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  return ok(c, { matter: shapeMatter(row) });
}

export async function createMatterEvent(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  body: z.infer<typeof createEventBody>,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [owned] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId!}`;
  if (!owned) return fail(c, 'NOT_FOUND', 'no matter with that id', 404);

  const [row] = await sql<
    {
      id: string;
      event_date: string;
      event_type: string;
      order_text: string | null;
      notes: string | null;
      note_visibility: string;
      source: string;
      created_at: string;
    }[]
  >`
    INSERT INTO matter_events (matter_id, event_date, event_type, order_text, notes,
                               note_visibility, source)
    VALUES (${matterId}, ${body.eventDate}, ${body.eventType}, ${body.orderText ?? null},
            ${body.notes ?? null},
            -- PD-4: the literal SQL keyword DEFAULT when the client said nothing,
            -- so the COLUMN decides, not this file. Writing 'private' here would
            -- move the default into application code — which is precisely what
            -- the rule forbids, because a missed branch then produces a shared
            -- note and nobody notices until a fee discussion travels with a file.
            ${body.noteVisibility ? sql`${body.noteVisibility}` : sql`DEFAULT`},
            -- Typed by the advocate. vendor and ocr are written by the
            -- pipelines that produce them, never accepted from a client: the
            -- source of a hearing date is a fact about provenance, and a client
            -- that could claim vendor could launder an unverified date.
            'manual')
    RETURNING id, event_date::text AS event_date, event_type, order_text, notes,
              note_visibility, source, ${sql.unsafe(isoColumn('created_at'))} AS created_at
  `;

  return ok(
    c,
    {
      event: {
        eventId: row!.id,
        eventDate: row!.event_date,
        eventType: row!.event_type,
        orderText: row!.order_text,
        notes: row!.notes,
        /**
         * Echoed back so the client can show it without assuming. PD-4: the
         * default is `private` and it comes from the column, so an omitted field
         * cannot produce a shared note.
         */
        noteVisibility: row!.note_visibility,
        source: row!.source,
        createdAt: row!.created_at,
      },
    },
    201,
  );
}
