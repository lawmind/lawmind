/**
 * Authorities saved to a matter.
 *
 * `matters/route.ts`'s own header comment already described this feature —
 * *"`set_aside` disables add-to-matter... it NAMES the judgment that
 * displaced it"* — before anything existed behind it. RCC found the gap
 * 11 Aug 2026 reading the code rather than the docs: no table, no route, and
 * the client's "Add to a matter" button had never had an `onPress`.
 * `docs/SCHEMA_TRUTH.md` §matter_authorities.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WRITES ARE OWNER-ONLY — MATCHING `createMatterEvent`, NOT `getMatter`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `getMatter` uses `accessToMatter` so a sharee can READ a matter. Every write
 * in `matters/route.ts` checks `user_id = ${userId}` directly instead — a
 * sharee can see the file but cannot add to it. This module follows the write
 * convention for create/remove and the read convention for list, exactly as
 * the rest of the module already splits it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `set_aside` REFUSES, AND NAMES THE REPLACEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The one case Lawmind refuses to let an authority be used at all — enforced
 * here, server-side, so it cannot be styled away by a client that forgot to
 * grey out a button. Naming what replaced it is not a courtesy: an advocate
 * who is told "no" and nothing else has to go and find the current authority
 * themselves, which is the exact task this refusal should be saving them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GOOD-LAW STATUS IS READ LIVE, EVERY REQUEST — RCC BUS 0048
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This route shipped 11 Aug 2026 selecting seven columns, none of which said
 * whether the law still stood. RCC found it the same day and called it a P0,
 * correctly: a matter is where an authority sits for MONTHS, which makes it the
 * likeliest surface in the product for the law to move underneath a citation,
 * and the only one where the advocate has already decided to rely on it.
 * `docs/CITATION_HARNESS.md` sets the stale-overruled threshold at zero.
 *
 * And silence is not neutral in our UI. Verified is silent, so a row with no
 * mark reads as "checked, not decorated" — a bare row here did not read as "we
 * do not know", it read as "this is fine".
 *
 * `addAuthority` below already refuses `set_aside` at write time, so the status
 * was in hand once. Nothing re-read it afterwards, which is precisely the case
 * the harness exists for: the judgment WAS good law when it was saved.
 *
 * Hence `overruled_*` is joined from `judgments` on every read and never copied
 * onto `matter_authorities` — a status stored at save time is the cached value
 * the harness forbids.
 *
 * **`verificationState`/`verifiedBySource` do NOT come from a column.** Bus 0048
 * asked for `j.verification_state, j.verified_by_source`; `judgments` carries
 * neither — they live on `citation_checks` and `verification_cache`
 * (`docs/SCHEMA_TRUTH.md` §"three fields, three homes"). `judgment_id` is a NOT
 * NULL foreign key into our own corpus, so this row IS the corpus and resolves
 * to itself: `verified`/`corpus` by construction, exactly as
 * `briefings/route.ts`, `judgments/route.ts`, `search/route.ts` and
 * `search/saved.ts` each state it. The linked `citation_check_id` is
 * deliberately not consulted — it can only name a STRONGER source than `corpus`,
 * never a weaker one, and both render silently, so reading it would change no
 * mark on any screen.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { judgmentFacts } from '../judgments/hydrate.ts';
import {
  precedentialEffect,
  precedentialPolicy,
  type OverruledStatus,
  type PrecedentialEffect,
  attributionOf,
  mayStateAsHolding,
  precedentialEffectFromEdges,
  type TreatmentEdge,
  type TreatmentProvenance,
} from '../judgments/precedential-effect.ts';
import { logger } from '../logger.ts';
import { recordStepInBackground } from '../product/activation.ts';

export const addAuthorityBody = z.object({
  judgmentId: z.string().uuid(),
  citationCheckId: z.string().uuid().optional(),
});

type AuthorityRow = {
  id: string;
  judgment_id: string;
  case_title: string;
  neutral_citation: string | null;
  reporter_citations: string[];
  added_by_user_id: string;
  added_at: string;
  removed_at: string | null;
  overruled_status: string;
  overruled_by_judgment_id: string | null;
  overruled_by_title: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
};

/**
 * The three fields R14 §A6 added to this shape, derived from layer 2 HERE, on
 * this request. `precedentialPolicy` is the one table that decides product
 * behaviour (`precedential-effect.ts`), and calling it at render time is the
 * whole point of the amendment: nothing about a judgment's standing may be
 * copied onto `matter_authorities`, for exactly the reason `overruledStatus`
 * already is not.
 */
const policyFields = (effect: PrecedentialEffect) => {
  const policy = precedentialPolicy(effect);
  return {
    /** Layer 2 — what actually happened. Open-ended value set, R14 §A5. */
    precedentialEffect: effect,
    /** Layer 3 — what the product does. The same answer the write path enforces. */
    canAddToMatter: policy.addToMatter === 'allow',
    citableForUntouchedPropositions: policy.citableForUntouchedPropositions,
  };
};

/**
 * Every adverse inbound edge for a set of judgments, in ONE query.
 *
 * Character-for-character the SELECT `judgments/route.ts` runs for one judgment
 * and `addAuthority` runs for the one being saved, widened to `= ANY(...)`
 * because a matter's list is N authorities and N round trips is the wrong
 * shape. The QUESTION is unchanged, which is what makes the three fields mean
 * the same thing here as on `GET /judgments/:id`.
 *
 * A judgment with no adverse edge simply has no key in the map. That is the
 * honest reading and it is the same one the single-judgment path takes: no edge
 * recorded, which is not the same claim as "unknown".
 */
async function adverseEdgesByJudgment(
  sql: Sql,
  judgmentIds: readonly string[],
): Promise<Map<string, TreatmentEdge[]>> {
  const byJudgment = new Map<string, TreatmentEdge[]>();
  if (judgmentIds.length === 0) return byJudgment;

  const rows = await sql<
    { cited_judgment_id: string; relationship: string; treatment_provenance: string | null }[]
  >`
    SELECT DISTINCT cited_judgment_id, relationship, treatment_provenance
      FROM judgment_citations
     WHERE cited_judgment_id = ANY(${judgmentIds as string[]}::uuid[])
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;

  for (const r of rows) {
    const edges = byJudgment.get(r.cited_judgment_id) ?? [];
    edges.push({
      relationship: r.relationship,
      provenance: r.treatment_provenance as TreatmentProvenance | null,
    });
    byJudgment.set(r.cited_judgment_id, edges);
  }
  return byJudgment;
}

const shape = (r: AuthorityRow, effect: PrecedentialEffect) => ({
  authorityId: r.id,
  judgmentId: r.judgment_id,
  caseTitle: r.case_title,
  neutralCitation: r.neutral_citation,
  /**
   * RCC bus 0049. Absent until 11 Aug 2026, and its absence was not cosmetic:
   * the client reads citability as `neutralCitation === null AND
   * reporterCitations.length === 0` — `docs/CITATION_HARNESS.md`'s own rule —
   * so every Supreme Court judgment older than neutral citations (~2013) whose
   * only citation is a reporter citation rendered here as "No citation on file
   * — cannot be referenced in a filing". Wrong, and wrong in the direction that
   * makes a real, citable authority look unusable.
   */
  reporterCitations: r.reporter_citations,
  addedBy: r.added_by_user_id,
  addedAt: r.added_at,
  removedAt: r.removed_at,
  // Tier 1 by construction — see the module note. Not a placeholder.
  verificationState: 'verified' as const,
  verifiedBySource: 'corpus' as const,
  /** Read live, this request. Never a value stored when the authority was saved. */
  overruledStatus: r.overruled_status,
  overruledByJudgmentId: r.overruled_by_judgment_id,
  overruledByTitle: r.overruled_by_title,
  /** Required to render `partly_set_aside` at its own weight, not as a headline. */
  overruledParas: r.overruled_paras,
  overruledNote: r.overruled_note,
  /**
   * R14 §A6, additive and OPTIONAL on the wire — a client that ignores them
   * behaves exactly as it did before. Derived, never stored: the module note
   * above says why a status copied at save time is the cached value the harness
   * forbids, and that reasoning does not stop at `overruledStatus`.
   *
   * They do NOT weaken anything. `bannerStatus` is untouched, `overruledStatus`
   * still carries the stored column, and the one refusal in the product is still
   * enforced on the write path below.
   */
  ...policyFields(effect),
});

/** Only the OWNER writes. A sharee can read a matter but not add to it — see module note. */
async function ownedMatter(sql: Sql, matterId: string, userId: string) {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId}`;
  return row;
}

/**
 * The USER-owned half of a saved authority: everything `matter_authorities`
 * itself holds, and nothing that lives in the corpus.
 *
 * This is the row the read path actually selects now. `AuthorityRow` below stays
 * as the shape `shape()` consumes — the union of user and corpus fields — so the
 * response is assembled from two reads without either side learning about the
 * other's storage.
 */
type UserAuthorityRow = {
  id: string;
  judgment_id: string;
  added_by_user_id: string;
  added_at: string;
  removed_at: string | null;
};

/**
 * A saved authority whose target the ACTIVE corpus generation does not carry.
 *
 * NEW3 R20's shell, and the field list is exhaustive BY DESIGN — every field
 * here is one the USER database already holds. There is deliberately no slot for
 * a title, a citation, a verification state or a currentness, because there is
 * no honest value for any of them and a nullable field is an invitation to fill
 * it in later from a cache.
 */
export type UnavailableAuthority = {
  authorityId: string;
  judgmentId: string;
  addedBy: string;
  addedAt: string;
  removedAt: string | null;
  availability: 'corpus_unavailable';
};

const AUTHORITY_COLUMNS = `a.id, a.judgment_id, j.case_title, j.neutral_citation,
       j.reporter_citations, a.added_by_user_id, ${isoColumn('a.added_at')} AS added_at,
       ${isoColumn('a.removed_at')} AS removed_at,
       j.overruled_status, j.overruled_by_judgment_id, j.overruled_paras,
       j.overruled_note, o.case_title AS overruled_by_title`;

/**
 * One FROM clause, both read paths. The `LEFT JOIN` is what lets a moved
 * authority NAME what displaced it rather than only saying that it moved.
 */
const AUTHORITY_FROM = `matter_authorities a
    JOIN judgments j ON j.id = a.judgment_id
    LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id`;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROW SURVIVES THE CORPUS. R20's LOAD-BEARING GATE-C PROPERTY.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * After the split, `matter_authorities.judgment_id` is a SOFT reference: an
 * opaque immutable judgment UUID in the user database, naming a row in a corpus
 * database that a rollback may have replaced with an earlier generation.
 *
 * NEW3 R20 (bus 1723) froze what happens then, and it is the one shape allowed:
 *
 *   - `authorities[]` keeps every authority whose target the ACTIVE corpus
 *     generation resolves, with live corpus fields exactly as before.
 *   - `unavailableAuthorities[]` carries the rest, and carries **only**
 *     `authorityId`, `judgmentId`, `addedBy`, `addedAt`, `removedAt` and
 *     `availability: 'corpus_unavailable'`.
 *   - **No case title, citation, verification source, currentness, treatment or
 *     replacement metadata may be fabricated or cached into that shell.** The
 *     advocate saved something; we cannot presently show what it was; inventing
 *     a title would be a citation surface asserting a fact it does not hold.
 *   - The row is **not deleted and not hidden**. When a later active release
 *     contains the same judgment id, it returns to `authorities[]` with live
 *     fields and no user-data write ever happened.
 *
 * `corpus_unavailable` is deliberately NOT the existing `SOURCE_UNAVAILABLE`.
 * That one means an upstream source observation failed; this one means the
 * selected corpus release does not carry the judgment. Different causes,
 * different remedies, and collapsing them would tell an advocate a rollback was
 * an outage.
 *
 * ── ACTIVATION ──────────────────────────────────────────────────────────────
 *
 * `unavailableAuthorities` is ADDITIVE and R17 activation is gated on RCC
 * consumption — an old client ignores an unknown array. It is therefore emitted
 * ONLY when it is non-empty, so the response shape a shipped client parses today
 * is byte-identical until the condition it describes actually occurs.
 */
export async function listAuthorities(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  /**
   * The CORPUS role. Defaults to `sql` so single-database development and every
   * existing caller are unchanged — `db-split.ts` resolves the two roles to one
   * URL unless a deployment says otherwise.
   */
  corpusSql: Sql = sql,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);

  // Read follows accessToMatter's convention (owner or live share), not the
  // owner-only write check below — a sharee can see what was saved.
  const [access] = await sql<{ access: string }[]>`
    SELECT CASE
      WHEN m.user_id = ${userId} THEN 'owner'
      WHEN EXISTS (
        SELECT 1 FROM matter_shares s
        WHERE s.matter_id = m.id AND s.invited_user_id = ${userId} AND s.revoked_at IS NULL
      ) THEN 'shared'
      ELSE 'none'
    END AS access
    FROM matters m WHERE m.id = ${matterId}`;
  if (!access || access.access === 'none') {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  /**
   * STEP 1 — the USER database alone. No join, no corpus table, and the
   * `ORDER BY` that decides what the advocate sees lives here, where the rows
   * being ordered are owned.
   *
   * Removed authorities are returned too, same reasoning as revoked shares:
   * what was saved, and when it was taken off, is the question asked later.
   */
  const saved = await sql<UserAuthorityRow[]>`
    SELECT a.id, a.judgment_id, a.added_by_user_id,
           ${sql.unsafe(isoColumn('a.added_at'))} AS added_at,
           ${sql.unsafe(isoColumn('a.removed_at'))} AS removed_at
      FROM matter_authorities a
     WHERE a.matter_id = ${matterId}
     ORDER BY a.added_at DESC`;

  /**
   * STEP 2 — ONE batched read of the corpus for every id at once, and the
   * adverse edges beside it. Two statements for any number of authorities: the
   * N+1 the split makes tempting is the thing this shape exists to refuse.
   *
   * The edges are read LIVE, this request, for the same reason `overruledStatus`
   * is — a relationship recorded after an authority was saved is reflected on
   * the NEXT list, without the advocate resaving anything.
   */
  const ids = saved.map((r) => r.judgment_id);
  const [facts, edgesByJudgment] = await Promise.all([
    judgmentFacts(corpusSql, ids),
    adverseEdgesByJudgment(corpusSql, ids),
  ]);

  /**
   * STEP 3 — merge in the application, in the user database's order.
   *
   * Iterating the SAVED rows and looking each id up is what preserves both the
   * ordering and the completeness: a row whose target is missing falls into the
   * shell list, and cannot be silently joined away.
   */
  const authorities: ReturnType<typeof shape>[] = [];
  const unavailableAuthorities: UnavailableAuthority[] = [];
  for (const r of saved) {
    const f = facts.get(r.judgment_id);
    if (f === undefined) {
      unavailableAuthorities.push({
        authorityId: r.id,
        judgmentId: r.judgment_id,
        addedBy: r.added_by_user_id,
        addedAt: r.added_at,
        removedAt: r.removed_at,
        availability: 'corpus_unavailable',
      });
      continue;
    }
    authorities.push(
      shape(
        {
          id: r.id,
          judgment_id: r.judgment_id,
          added_by_user_id: r.added_by_user_id,
          added_at: r.added_at,
          removed_at: r.removed_at,
          case_title: f.caseTitle,
          neutral_citation: f.neutralCitation,
          reporter_citations: f.reporterCitations,
          overruled_status: f.overruledStatus,
          overruled_by_judgment_id: f.overruledByJudgmentId,
          overruled_by_title: f.overruledByTitle,
          overruled_paras: f.overruledParas,
          overruled_note: f.overruledNote,
        } as AuthorityRow,
        precedentialEffectFromEdges({
          overruledStatus: f.overruledStatus as OverruledStatus,
          edges: edgesByJudgment.get(r.judgment_id) ?? [],
        }),
      ),
    );
  }

  return ok(c, {
    authorities,
    /**
     * ALWAYS sent, including `[]` — R17 §1, verbatim: *"An R17 server always
     * sends `unavailableAuthorities`, including `[]`."*
     *
     * It is optional in the CONTRACT so an R17 client can talk truthfully to an
     * older R16 server, where the single-database foreign key guaranteed every
     * returned target was present. That is a statement about what a client must
     * tolerate, not a licence for this server to omit it: a client that cannot
     * distinguish "no unavailable authorities" from "this server does not know
     * about the concept" would have to guess, and the guess it would make is
     * that everything resolved.
     *
     * Emitting it conditionally was the first implementation here and was wrong
     * for exactly that reason.
     */
    unavailableAuthorities,
    asOf: new Date().toISOString(),
  });
}

export async function addAuthority(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  body: z.infer<typeof addAuthorityBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const [judgment] = await sql<
    {
      id: string;
      case_title: string;
      neutral_citation: string | null;
      reporter_citations: string[];
      overruled_status: string;
      overruled_by_judgment_id: string | null;
      overruled_paras: number[] | null;
      overruled_note: string | null;
      overruled_by_case_title: string | null;
      overruled_by_neutral_citation: string | null;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.reporter_citations, j.overruled_status,
           j.overruled_by_judgment_id, j.overruled_paras, j.overruled_note,
           r.case_title AS overruled_by_case_title,
           r.neutral_citation AS overruled_by_neutral_citation
    FROM judgments j
    LEFT JOIN judgments r ON r.id = j.overruled_by_judgment_id
    WHERE j.id = ${body.judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  /**
   * The one refusal Lawmind enforces server-side — now keyed on the ACT rather
   * than on the label. OD-14, resolved 21 Aug 2026 on the founder's direction.
   *
   * `overruled_status = 'set_aside'` was carrying two different acts: 73
   * judgments read `set_aside` for what their own verified edge calls
   * `overruled`, because `set_aside` was the value that produced the strongest
   * warning and an overruling deserved the strongest warning. The warning was
   * right; the refusal that came attached to it was not. An overruling leaves
   * the decision between the original parties standing, and Lawmind was
   * declining to let an advocate rely on law that is still law.
   *
   * `precedential-effect.ts` holds the reasoning and the table. Only two effects
   * refuse: a genuine `set_aside`, and `review_required` — a stored adverse
   * status no verified edge accounts for, where quietly becoming addable is the
   * dangerous direction.
   *
   * The banner is UNCHANGED in every case. Nothing here weakens a warning.
   */
  const treatment = await sql<{ relationship: string; treatment_provenance: string | null }[]>`
    SELECT DISTINCT relationship, treatment_provenance
      FROM judgment_citations
     WHERE cited_judgment_id = ${body.judgmentId}
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;

  /* Provenance-aware, and it can only ever REFUSE more here, never less: the
   * single case it changes is a stored adverse status whose only evidence is a
   * MODALITY_DEFECT edge, which used to be read as a deliberate human
   * determination and is now `review_required`. */
  const edges = treatment.map((t) => ({
    relationship: t.relationship,
    provenance: t.treatment_provenance as TreatmentProvenance | null,
  }));
  const attribution = attributionOf(edges);
  const effect = precedentialEffectFromEdges({
    overruledStatus: judgment.overruled_status as OverruledStatus,
    edges,
  });
  const policy = precedentialPolicy(effect);

  if (policy.addToMatter === 'refuse') {
    /* Copy is licence protection, not an audit (`CLAUDE.md`): it says what the
     * advocate can act on, and for `review_required` it does not claim a set
     * aside that nothing verified. */
    const what =
      effect === 'set_aside'
        ? mayStateAsHolding(attribution)
          ? 'was set aside and cannot be added to a matter.'
          : /* Reporter-derived, unclassified or defective. The refusal STANDS —
             * this is the one place Lawmind declines to let an authority be
             * used, and weakening it on provenance would be the dangerous
             * direction. What changes is only that we do not assert the later
             * court's holding when what we hold is a reporter's note. */
            'is recorded as set aside and cannot be added to a matter.'
        : 'has a recorded change of status we could not confirm, so it cannot be added to a matter yet.';
    return fail(
      c,
      'AUTHORITY_SET_ASIDE',
      effect === 'set_aside' && judgment.overruled_by_case_title
        ? `${judgment.case_title} was set aside and cannot be added to a matter. ` +
          `${judgment.overruled_by_case_title}${judgment.overruled_by_neutral_citation ? ` (${judgment.overruled_by_neutral_citation})` : ''} replaced it.`
        : `${judgment.case_title} ${what}`,
      409,
    );
  }

  if (body.citationCheckId) {
    const [check] = await sql<{ id: string }[]>`
      SELECT id FROM citation_checks WHERE id = ${body.citationCheckId}`;
    if (!check) return fail(c, 'INVALID_REQUEST', 'citationCheckId does not exist', 400);
  }

  const [row] = await sql<{ id: string; added_by_user_id: string; added_at: string; removed_at: string | null }[]>`
    INSERT INTO matter_authorities (matter_id, judgment_id, added_by_user_id, citation_check_id)
    VALUES (${matterId}, ${body.judgmentId}, ${userId}, ${body.citationCheckId ?? null})
    -- The partial unique index covers LIVE rows only, so re-adding one
    -- previously removed is allowed — matter_shares' "brought back onto a
    -- case" reasoning, applied to authorities.
    ON CONFLICT DO NOTHING
    RETURNING id, added_by_user_id, ${sql.unsafe(isoColumn('added_at'))} AS added_at,
              ${sql.unsafe(isoColumn('removed_at'))} AS removed_at
  `;

  if (row) {
    /**
     * Funnel steps 4 and 6, and the second is the ACTIVATION HYPOTHESIS.
     *
     * NEW3's `ACTIVATION_FUNNEL_V1.md` recommends `AUTHORITY_SAVED_TO_MATTER` —
     * specifically a SECOND authority on a matter that already had one — over
     * "two briefings opened", because it is cheaper to compute and does not
     * depend on the briefing feature that this round's own evidence (their
     * 10-matter walkthrough, bus 1075) says is not trustworthy yet.
     *
     * It is a HYPOTHESIS and is labelled as one. The old metric is not deleted.
     *
     * The count is taken AFTER the insert, so "2 or more" means this save is the
     * one that crossed the line. `recordStep` is idempotent per user and step,
     * so a third and fourth save cost one no-op insert each.
     */
    recordStepInBackground(
      sql,
      userId,
      'saved_authority',
      (err) =>
        logger.error(
          { request_id: c.get('requestId'), err, step: 'saved_authority' },
          'activation step not recorded',
        ),
    );

    const [saved] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM matter_authorities
       WHERE matter_id = ${matterId} AND removed_at IS NULL`;
    if (Number(saved?.n ?? 0) >= 2) {
      recordStepInBackground(
        sql,
        userId,
        'experienced_matter_value',
        (err) =>
        logger.error(
          { request_id: c.get('requestId'), err, step: 'experienced_matter_value' },
          'activation step not recorded',
        ),
      );
    }

    return ok(
      c,
      {
        authority: shape(
          {
            id: row.id,
            judgment_id: judgment.id,
            case_title: judgment.case_title,
            neutral_citation: judgment.neutral_citation,
            reporter_citations: judgment.reporter_citations,
            added_by_user_id: row.added_by_user_id,
            added_at: row.added_at,
            removed_at: row.removed_at,
            // From the same read that just enforced the `set_aside` refusal —
            // `doubted` and `partly_set_aside` are ADDABLE and must say so on the
            // way in, not only on the next list. An authority that arrives
            // unmarked and grows a mark on refresh reads as a bug, not a warning.
            overruled_status: judgment.overruled_status,
            overruled_by_judgment_id: judgment.overruled_by_judgment_id,
            overruled_by_title: judgment.overruled_by_case_title,
            overruled_paras: judgment.overruled_paras,
            overruled_note: judgment.overruled_note,
          },
          /* The effect computed above, from the read that just enforced the
           * refusal. The write path and the read path cannot disagree because
           * there is only one derivation. */
          effect,
        ),
      },
      201,
    );
  }

  /**
   * Already live. Idempotent rather than an error — the advocate's intent (this
   * authority is saved) is already satisfied.
   *
   * The corpus half is the `judgment` row this function ALREADY read and
   * validated above, reused rather than re-fetched: the write path proved the
   * target exists in the active corpus generation before it inserted, so a
   * second read could only tell us something different, which on this path would
   * be a corpus generation changing under one request.
   */
  const [saved] = await sql<UserAuthorityRow[]>`
    SELECT a.id, a.judgment_id, a.added_by_user_id,
           ${sql.unsafe(isoColumn('a.added_at'))} AS added_at,
           ${sql.unsafe(isoColumn('a.removed_at'))} AS removed_at
      FROM matter_authorities a
     WHERE a.matter_id = ${matterId} AND a.judgment_id = ${body.judgmentId}
       AND a.removed_at IS NULL`;
  const existing = saved
    ? ({
        ...saved,
        case_title: judgment.case_title,
        neutral_citation: judgment.neutral_citation,
        reporter_citations: judgment.reporter_citations,
        overruled_status: judgment.overruled_status,
        overruled_by_judgment_id: judgment.overruled_by_judgment_id,
        overruled_by_title: judgment.overruled_by_case_title,
        overruled_paras: judgment.overruled_paras,
        overruled_note: judgment.overruled_note,
      } as AuthorityRow)
    : undefined;
  // ON CONFLICT DO NOTHING with no existing live row means the unique index
  // did not fire, which should be unreachable — but never guess a response.
  if (!existing) return fail(c, 'INTERNAL_ERROR', 'could not add this authority', 500);
  return ok(c, { authority: shape(existing, effect) }, 200);
}

export async function removeAuthority(
  c: Context,
  sql: Sql,
  matterId: string,
  authorityId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const [row] = await sql<{ removed_at: string }[]>`
    UPDATE matter_authorities
       -- Never a DELETE — same reasoning as matter_shares.
       SET removed_at = now(), removed_by_user_id = ${userId}
     WHERE id = ${authorityId} AND matter_id = ${matterId} AND removed_at IS NULL
    RETURNING ${sql.unsafe(isoColumn('removed_at'))} AS removed_at
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no live authority with that id', 404);

  return ok(c, { removedAt: row.removed_at });
}
