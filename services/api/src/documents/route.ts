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

import { toWireSourceUnsafe } from '../citations/source-strength.ts';
import { corpusTargetUnavailable } from '../corpus/target-unavailable.ts';
import { fail, ok } from '../envelope.ts';
import { judgmentFacts } from '../judgments/hydrate.ts';
import { isoColumn } from '../iso-time.ts';
import {
  loadOnePrecedentialState,
  loadPrecedentialState,
  type PrecedentialState,
} from '../judgments/treatment-lookup.ts';

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
    // 1976 (1) SCR 906 — year first, and the reports' own house style. Added
    // 11 Aug 2026: the ingest extractor was blind to this form across 13,834
    // judgments, and so was this one. Here it matters more. This function IS
    // the PD-7 lock, so a form it cannot see is a citation the advocate can
    // edit or remove without the server raising a 422 — the false negative the
    // note above calls the dangerous direction.
    /\b\d{4}\s*\(\s*\d{1,3}\s*\)\s*[A-Z.]{2,8}\s*\d+/g,
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
/**
 * `sql` is the USER role — `documents` and `citation_checks` are the
 * advocate's. `corpusSql` answers the two corpus questions: does this judgment
 * exist in the request-pinned generation, and what is its live precedential
 * effect. It defaults to `sql` for single-database callers.
 */
export async function addDocumentCitation(
  c: Context,
  sql: Sql,
  documentId: string,
  userId: string | undefined,
  body: z.infer<typeof addCitationBody>,
  corpusSql: Sql = sql,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedDocument(sql, documentId, userId))) {
    return fail(c, 'NOT_FOUND', 'no document with that id', 404);
  }

  const [judgment] = await corpusSql<
    { id: string; case_title: string; neutral_citation: string | null; overruled_status: string }[]
  >`
    SELECT id, case_title, neutral_citation, overruled_status
    FROM judgments WHERE id = ${body.judgmentId}`;
  /* A citation that cannot be validated against the pinned generation does not
   * enter a draft — and the refusal says which fact stopped it. A document is
   * filed; "no judgment with that id" on a drafting surface would be the
   * strongest possible false claim (`corpus/target-unavailable.ts`). */
  if (!judgment) {
    return corpusTargetUnavailable(c, 'it cannot be cited in this document right now', {
      write: true,
    });
  }

  /**
   * The same refusal as add-to-matter, for a stronger reason: a document is
   * filed. An authority whose own decision was undone must not enter a draft at
   * all, and the refusal names the status so the advocate can find a
   * replacement.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * OD-14 DID NOT REACH HERE EITHER
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This read `overruled_status === 'set_aside'` off the stored column. For the
   * 73 judgments whose verified edge says `overruled`, that refused a draft
   * citation to an authority whose decision between the original parties
   * stands and which the reading view, search, the matter and the briefing all
   * say is usable. A draft is where an advocate acts on that answer, so it was
   * the most expensive place to give a different one.
   *
   * `precedential-effect.ts` through `treatment-lookup.ts`, like everywhere
   * else. `citableForUntouchedPropositions` is the right question for a draft —
   * it is precisely "is there anything left of this authority to cite" — and it
   * is false for exactly the two effects that refuse add-to-matter, so the two
   * surfaces cannot diverge.
   */
  const treatment = await loadOnePrecedentialState(corpusSql, body.judgmentId);
  if (treatment && !treatment.policy.citableForUntouchedPropositions) {
    const what =
      treatment.effect === 'set_aside'
        ? 'has been set aside and cannot be cited in a draft. Find a replacement authority.'
        : 'has a recorded change of status we could not confirm, so it cannot be cited in a draft yet.';
    return fail(c, 'AUTHORITY_SET_ASIDE', `${judgment.case_title} ${what}`, 409);
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
        /**
         * WHO said the law moved, for the citation just attached to a draft.
         *
         * Reuses `treatment` from the citability gate a few lines above rather
         * than reading again — two reads of the same fact in one handler is how
         * a refusal and a badge end up disagreeing about one judgment.
         */
        treatmentAttribution: treatment?.attribution ?? 'UNKNOWN',
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

async function readDocument(sql: Sql, documentId: string, corpusSql: Sql = sql) {
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
           cc.verified_by_source, NULL::text AS overruled_status, NULL::text AS case_title
    FROM citation_checks cc
    WHERE cc.document_id = ${documentId}
    ORDER BY cc.created_at`;

  /**
   * The two corpus columns, read from the corpus role in ONE batched statement
   * and merged here — NEW3 R20's `SOFT_CORPUS_REFERENCE`: `citation_checks` is
   * user-owned and `judgments` is corpus-owned, so a `LEFT JOIN` between them
   * stops being possible once the roles are two databases.
   *
   * The liveness rule above is unchanged and is the reason this is a read rather
   * than a stored value: a draft sitting for three weeks must not assert good law
   * it no longer has. `LEFT` semantics are preserved — a citation whose match the
   * active corpus generation does not carry keeps both columns null and is still
   * listed, because a citation may never be silently dropped.
   */
  const citationJudgmentIds = [
    ...new Set(
      citations.map((r) => r.judgment_id_matched).filter((id): id is string => id !== null),
    ),
  ];
  if (citationJudgmentIds.length > 0) {
    const facts = await judgmentFacts(corpusSql, citationJudgmentIds);
    for (const r of citations) {
      const f = r.judgment_id_matched === null ? undefined : facts.get(r.judgment_id_matched);
      if (f === undefined) continue;
      r.overruled_status = f.overruledStatus;
      r.case_title = f.caseTitle;
    }
  }

  /**
   * The derived layers, from the SAME function the judgment screen, the search
   * results and the briefing checklist use.
   *
   * Two things were wrong with sending `j.overruled_status` straight out. It is
   * the STORED column, so an OD-14 authority — stored `set_aside`, verified
   * `overruled` edge — told an advocate in the draft footer that a judgment had
   * been set aside when the decision between the parties stands. And it carried
   * no provenance, so a reporter's editorial note and a later court's own
   * holding read identically on the one surface that ends up in a filing.
   *
   * `loadPrecedentialState` is a single batched read over at most the citations
   * on this draft — the same shape `treatment-lookup.ts` was written for.
   */
  const matched = citations
    .map((c) => c.judgment_id_matched)
    .filter((id): id is string => id !== null);
  const derived: Map<string, PrecedentialState> =
    matched.length > 0 ? await loadPrecedentialState(sql, matched) : new Map();

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
      verifiedBySource: toWireSourceUnsafe(cc.verified_by_source),
      /* The DERIVED banner, not the stored column. Same four wire values, so a
       * client reading only this behaves as before — it is simply now right for
       * the authorities OD-14 was about. Falls back to the stored value when the
       * citation matched no judgment, where there is nothing to derive from. */
      overruledStatus:
        (cc.judgment_id_matched
          ? derived.get(cc.judgment_id_matched)?.policy.bannerStatus
          : null) ?? cc.overruled_status,
      /** Layer 4 — WHO. Additive; never changes the banner above it. */
      treatmentAttribution:
        (cc.judgment_id_matched ? derived.get(cc.judgment_id_matched)?.attribution : null) ??
        'UNKNOWN',
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

/**
 * The advocate's drafts, newest first.
 *
 * **The Drafts tab is the only route in the app still wired to a bare
 * `ScreenShell`**, and this is why: five draft screens are built and tested —
 * `TemplatePicker`, `DocumentReview`, `CounterArguments`, `PrecedentPanel`,
 * `CompareSummary` — but nothing could list what an advocate had already
 * written, because `GET /documents/:id` needs an id the client had no way to
 * obtain. An ADDITION to the frozen contract, not a change.
 *
 * **It returns no `generated_content`.** A list of twenty drafts would ship
 * twenty full documents to render twenty titles, and that content is
 * sensitive-class — `PRIVACY_PII.md` — so the less of it that crosses the wire
 * for a screen that cannot display it, the better.
 *
 * **`citationCount` is counted live, and `unverifiedCount` with it.** A draft
 * carrying a citation we could not confirm is the one thing an advocate must see
 * before filing, and computing it here means the list can say so without
 * fetching every document. `overruled_status` is deliberately NOT summarised
 * into this list: it is read live at render on the surfaces that show a
 * citation, never cached into a count that ages.
 */
export async function listDocuments(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);

  /**
   * `m.case_title`, and it read `m.title` until RCC bus 0050.
   *
   * `matters` has never had a `title` column. Postgres rejects an unknown
   * column at PLAN time, so this route answered 500 **unconditionally** — every
   * call, every user, whether or not any document had a matter at all. The
   * Drafts tab shipped as R4 and has listed nothing for anybody since; the
   * client fails soft on a non-ok response, so there was no crash to notice.
   *
   * Every other query in this service reads the column correctly
   * (`matters/route.ts` BRIEFING_COLUMNS: `m.case_title, m.court`). This one
   * line did not, and **no test called `listDocuments` at all** — which is why
   * a one-word typo reached production and stayed there. There is one now.
   */
  const rows = await sql<
    {
      id: string;
      document_type: string;
      matter_id: string | null;
      matter_title: string | null;
      language: string;
      created_at: string;
      citation_count: number;
      unverified_count: number;
    }[]
  >`
    SELECT d.id, d.document_type, d.matter_id,
           m.case_title AS matter_title,
           d.language,
           ${sql.unsafe(isoColumn('d.created_at'))} AS created_at,
           count(cc.id)::int AS citation_count,
           count(cc.id) FILTER (
             WHERE cc.verification_state <> 'verified'
           )::int AS unverified_count
    FROM documents d
    LEFT JOIN matters m ON m.id = d.matter_id
    LEFT JOIN citation_checks cc ON cc.document_id = d.id
    WHERE d.user_id = ${userId}
    GROUP BY d.id, m.case_title
    ORDER BY d.created_at DESC`;

  return ok(c, {
    documents: rows.map((r) => ({
      documentId: r.id,
      documentType: r.document_type,
      matterId: r.matter_id,
      matterTitle: r.matter_title,
      language: r.language,
      createdAt: r.created_at,
      citationCount: r.citation_count,
      /**
       * **Counts `failed` with `unverified`, deliberately.** `CITATION_HARNESS.md`:
       * an advocate cannot act on the difference, and an outage must not read as
       * a corpus gap. The list says "could not confirm", never "verification
       * failed".
       */
      unverifiedCount: r.unverified_count,
    })),
  });
}

export async function getDocument(
  c: Context,
  sql: Sql,
  documentId: string,
  userId: string | undefined,
  corpusSql: Sql = sql,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedDocument(sql, documentId, userId))) {
    return fail(c, 'NOT_FOUND', 'no document with that id', 404);
  }
  /* `readDocument` has taken a corpus handle since the batched hydration
   * landed; until R28 nothing ever passed one, so the batched read ran against
   * the user role and found no `judgments` table at all. */
  return ok(c, { document: await readDocument(sql, documentId, corpusSql) });
}
