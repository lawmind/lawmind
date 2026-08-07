/**
 * Drafting — and the one rule that makes the whole product defensible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PD-7 — CITATIONS ARE LOCKED, AND THE SERVER IS THE LOCK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `PATCH /documents/:id` takes **paragraph prose only**. It re-extracts the
 * citation spans from the submitted text and **rejects `422` on any divergence**
 * from the authoritative set in `citation_checks`. The document is not partially
 * saved.
 *
 * **The client's lock glyph is presentation, not enforcement.** A second client,
 * a stale build, or a direct call has no glyph. This is the enforcement.
 *
 * Why it matters more than it looks: a hand-edited citation breaks the
 * verification chain while the badge continues to assert something we no longer
 * checked. That is **the hallucination failure arriving through a different
 * door**, and it is harder to catch because the citation was genuinely verified
 * once. Changing an authority goes through `POST /documents/:id/citations`, which
 * takes a **judgmentId and never a citation string**, and re-runs verification.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PD-8 — NO MARK ON THE DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There is no watermark, no hatched margin, and **`watermarkRemoved` is retired
 * and must never be accepted** — a request carrying it is rejected rather than
 * ignored, because silently accepting a retired field lets a client believe it
 * did something.
 *
 * Consent is taken once at onboarding and **gates draft generation, and nothing
 * else.** An account with no accepted terms cannot generate.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const patchDocumentBody = z
  .object({
    paragraphs: z
      .array(
        z.object({
          index: z.number().int().min(0),
          text: z.string().max(20000),
        }),
      )
      .min(1),
  })
  /**
   * `.strict()` is load-bearing, not tidiness. A body carrying `content` or
   * `watermarkRemoved` is REJECTED rather than ignored: silently dropping a
   * retired field lets a client believe it cleared a mark that no longer exists.
   */
  .strict();

export const addCitationBody = z
  .object({
    /** A judgment id. **Never a citation string** — see the module note. */
    judgmentId: z.string().uuid(),
    replacesCitationCheckId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Pull citation-shaped spans out of prose.
 *
 * Deliberately **greedy**: it is better to flag a span that turns out to be
 * innocent than to miss an edited citation. A false positive costs the advocate
 * one rejected save with a clear message; a false negative ships an unverified
 * authority wearing a verified badge.
 *
 * Covers the forms an Indian citation actually takes — neutral citations, the
 * reporter series, and AIR — because a regex that only knows one format is a
 * lock with one key missing.
 */
export function extractCitationSpans(text: string): string[] {
  const patterns = [
    /\b\d{4}\s+INSC\s+\d+\b/gi, // neutral: 2024 INSC 123
    /\(\s*\d{4}\s*\)\s*\d+\s+[A-Z]{2,6}\s+\d+/g, // (2019) 4 SCC 221
    /\bAIR\s+\d{4}\s+[A-Z]{2,4}\s+\d+\b/gi, // AIR 1973 SC 1461
    /\[\s*\d{4}\s*\]\s*\d*\s*[A-Z.]{2,8}\s*\d+/g, // [1950] 1 S.C.R. 869
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    for (const m of text.matchAll(p)) found.add(m[0].replace(/\s+/g, ' ').trim());
  }
  return [...found];
}

/** Same citation, written differently, is the same citation. */
function normalise(s: string): string {
  return s
    .toUpperCase()
    .replace(/[[\]().,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ownedDocument(sql: Sql, documentId: string, userId: string) {
  const [row] = await sql<{ id: string; matter_id: string | null }[]>`
    SELECT id, matter_id FROM documents WHERE id = ${documentId} AND user_id = ${userId}`;
  return row;
}

export async function patchDocument(
  c: Context,
  sql: Sql,
  documentId: string,
  userId: string | undefined,
  body: z.infer<typeof patchDocumentBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedDocument(sql, documentId, userId))) {
    return fail(c, 'NOT_FOUND', 'no document with that id', 404);
  }

  /**
   * The authoritative set: every citation this document is allowed to contain.
   *
   * Read from `citation_checks`, which is what verification actually wrote —
   * never from the document text, which is the thing under suspicion.
   */
  const authorised = await sql<{ citation_claimed: string }[]>`
    SELECT citation_claimed FROM citation_checks WHERE document_id = ${documentId}`;
  const allowed = new Set(authorised.map((a) => normalise(a.citation_claimed)));

  const submitted = body.paragraphs.flatMap((p) => extractCitationSpans(p.text));
  const divergent = submitted.filter((s) => !allowed.has(normalise(s)));

  if (divergent.length > 0) {
    /**
     * `422`, and **nothing is saved** — not the offending paragraph, not the
     * others. A partial save would leave the document in a state neither the
     * advocate nor the verification record describes.
     *
     * The message names the spans, because "rejected" with no detail sends the
     * advocate hunting through their own draft.
     */
    return fail(
      c,
      'CITATION_LOCKED',
      `citations cannot be edited as text: ${divergent.join(', ')}. ` +
        'Use the citation picker to change an authority — it re-runs verification. ' +
        'Editing the words would leave the badge asserting something we no longer checked.',
      422,
    );
  }

  const [row] = await sql<{ id: string; generated_content: string; created_at: string }[]>`
    UPDATE documents
       SET generated_content = ${body.paragraphs
         .slice()
         .sort((a, b) => a.index - b.index)
         .map((p) => p.text)
         .join('\n\n')}
     WHERE id = ${documentId} AND user_id = ${userId}
    RETURNING id, generated_content, ${sql.unsafe(isoColumn('created_at'))} AS created_at
  `;

  return ok(c, { document: await readDocument(sql, row!.id) });
}

/**
 * Attach an authority — by id, never by string.
 *
 * This is the ONLY way a citation enters or changes in a document, and it is why
 * `PATCH` can safely reject every textual edit.
 */
export async function addDocumentCitation(
  c: Context,
  sql: Sql,
  documentId: string,
  userId: string | undefined,
  body: z.infer<typeof addCitationBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedDocument(sql, documentId, userId))) {
    return fail(c, 'NOT_FOUND', 'no document with that id', 404);
  }

  const [judgment] = await sql<
    { id: string; case_title: string; neutral_citation: string | null; overruled_status: string }[]
  >`
    SELECT id, case_title, neutral_citation, overruled_status
    FROM judgments WHERE id = ${body.judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  /**
   * `set_aside` is refused here too.
   *
   * The same rule as add-to-matter, for a stronger reason: a document is filed.
   * An authority the court has set aside must not enter a draft at all, and the
   * refusal names the status so the advocate can find a replacement.
   */
  if (judgment.overruled_status === 'set_aside') {
    return fail(
      c,
      'AUTHORITY_SET_ASIDE',
      `${judgment.case_title} has been set aside and cannot be cited in a draft. Find a replacement authority.`,
      409,
    );
  }

  const claimed = judgment.neutral_citation ?? judgment.case_title;

  const [check] = await sql<{ id: string }[]>`
    INSERT INTO citation_checks
      (document_id, citation_claimed, judgment_id_matched, verification_state,
       verified_by_source, shown_to_user, overruled_status_shown, surface)
    VALUES (${documentId}, ${claimed}, ${judgment.id}, 'verified', 'corpus', true,
            ${judgment.overruled_status}, 'draft')
    RETURNING id
  `;

  // Replacing an authority retires the old check rather than deleting it: what
  // was cited, and when, is the record a dispute is later argued from.
  if (body.replacesCitationCheckId) {
    await sql`
      UPDATE citation_checks SET document_id = NULL
      WHERE id = ${body.replacesCitationCheckId} AND document_id = ${documentId}`;
  }

  return ok(
    c,
    {
      citationCheck: {
        citationCheckId: check!.id,
        judgmentId: judgment.id,
        citationClaimed: claimed,
        verificationState: 'verified' as const,
        verifiedBySource: 'corpus' as const,
        /** Read live from the row. A judgment can be verified AND overruled. */
        overruledStatus: judgment.overruled_status,
      },
    },
    201,
  );
}

export async function removeDocumentCitation(
  c: Context,
  sql: Sql,
  documentId: string,
  citationCheckId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedDocument(sql, documentId, userId))) {
    return fail(c, 'NOT_FOUND', 'no document with that id', 404);
  }

  // Detached, never deleted — the check itself is evidence of what was verified.
  const [row] = await sql<{ id: string }[]>`
    UPDATE citation_checks SET document_id = NULL
    WHERE id = ${citationCheckId} AND document_id = ${documentId}
    RETURNING id`;
  if (!row) return fail(c, 'NOT_FOUND', 'no citation with that id on this document', 404);

  return ok(c, { ok: true });
}

async function readDocument(sql: Sql, documentId: string) {
  const [doc] = await sql<
    {
      id: string;
      document_type: string;
      matter_id: string | null;
      generated_content: string;
      language: string;
      created_at: string;
    }[]
  >`
    SELECT id, document_type, matter_id, generated_content, language,
           ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM documents WHERE id = ${documentId}`;

  /**
   * Citations are resolved LIVE, and `overruled_status` comes from the judgment
   * row on every read — never from what was stored when the draft was written.
   * A draft sitting for three weeks must not assert good law it no longer has.
   */
  const citations = await sql<
    {
      id: string;
      citation_claimed: string;
      judgment_id_matched: string | null;
      verification_state: string;
      verified_by_source: string;
      overruled_status: string | null;
      case_title: string | null;
    }[]
  >`
    SELECT cc.id, cc.citation_claimed, cc.judgment_id_matched, cc.verification_state,
           cc.verified_by_source, j.overruled_status, j.case_title
    FROM citation_checks cc
    LEFT JOIN judgments j ON j.id = cc.judgment_id_matched
    WHERE cc.document_id = ${documentId}
    ORDER BY cc.created_at`;

  return {
    documentId: doc!.id,
    documentType: doc!.document_type,
    matterId: doc!.matter_id,
    content: doc!.generated_content,
    language: doc!.language,
    createdAt: doc!.created_at,
    citations: citations.map((cc) => ({
      citationCheckId: cc.id,
      citationClaimed: cc.citation_claimed,
      judgmentId: cc.judgment_id_matched,
      caseTitle: cc.case_title,
      verificationState: cc.verification_state,
      verifiedBySource: cc.verified_by_source,
      overruledStatus: cc.overruled_status,
    })),
    /**
     * "4 of 4 citations verified" — derived at read time, rendered in the draft
     * footer IN-APP ONLY. It is never written into the document and never
     * exported (PD-8).
     */
    citationSummary: {
      total: citations.length,
      verified: citations.filter((cc) => cc.verification_state === 'verified').length,
    },
  };
}

export async function getDocument(
  c: Context,
  sql: Sql,
  documentId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedDocument(sql, documentId, userId))) {
    return fail(c, 'NOT_FOUND', 'no document with that id', 404);
  }
  return ok(c, { document: await readDocument(sql, documentId) });
}
