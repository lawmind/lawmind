/**
 * `GET /statutes/:statuteId/linked-judgments` — STRUCTURED statute-linked
 * judgments. LCC R19, built against NEW3 R16 `R16-RCC-08`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE CLAIMS, AND THE FOUR THINGS IT REFUSES TO CLAIM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It answers exactly one question: **which judgments carry a structurally
 * extracted reference to this canonical Act, or to this section of it.** That
 * is a citation fact about the text of a judgment. It is NOT any of:
 *
 *   - "judgments that apply this section"       — applicability is a legal
 *                                                 conclusion; nothing here can
 *                                                 support it.
 *   - "judgments interpreting this section"     — the extractor recorded a
 *                                                 mention, not a holding.
 *   - "good judgments under this section"       — no ordering here is merit.
 *   - "the successor provision's cases"         — an IPC→BNS correspondence is
 *                                                 never applied automatically.
 *
 * `semantics` is on the wire for that reason: the client renders the server's
 * own words rather than a phrase a designer chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVIDENCE QUALIFICATION — WHY THE DEFAULT RETURNS NOTHING TODAY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/SCHEMA_TRUTH.md` §judgment_statute_refs resolution state is explicit:
 * a NULL `resolution_state` *"means a legacy or not-yet-classified decision,
 * **never a confirmed link**"*. Measured on this corpus, 1 September 2026:
 *
 *     905,944 references total
 *     905,853 resolution_state IS NULL       (703,768 of them carry a statute_id)
 *          49 refused_pre_enactment
 *          42 unresolved_pre_commencement
 *           0 linked_exact
 *           0 linked_chronology_permitted
 *
 * **Every state the resolver has actually written is a REFUSAL.** So the
 * default tier — `resolver_confirmed` — returns an empty page for every input
 * in the corpus as it stands, and that is the correct answer rather than a
 * defect: NEW3's `RELEASE_EVIDENCE_REQUIRED` names an honest empty state, and
 * promoting 905,853 unclassified rows to "confirmed" to make the route look
 * alive is the precise failure `CITATION_HARNESS.md` exists to prevent.
 *
 * The second tier, `structural_unreviewed`, is opt-in, is labelled on every row
 * it returns, and is what makes the route testable and useful before the
 * resolver has run. It never claims confirmation. It is bounded by the same
 * chronology gate the resolver applies, enforced HERE in the query rather than
 * trusted from the data — see {@link chronologyGate}.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING IS SILENTLY DROPPED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A reference the requested tier excludes is COUNTED and NAMED in `withheld`,
 * by resolution state. `CITATION_HARNESS.md`'s silent-drop rule is about
 * citations, and this is the same act: a client that shows "no cases" when the
 * corpus holds 40,134 references it declined to vouch for has told the advocate
 * something false. `withheld` populated with `links: []` is a different
 * sentence from `withheld` empty with `links: []`, and both are sayable.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { derivedEffects } from '../judgments/derived-effects.ts';
import { capabilityRefusal, isUserReachable } from '../release/capabilities.ts';

export const linkedJudgmentsParams = z.object({ statuteId: z.string().uuid() });

/**
 * Section identity, in the statute API's OWN vocabulary.
 *
 * `sectionId` is the canonical identifier `/statutes/sections` already returns;
 * `sectionNumber` is the one it already accepts as a query filter. Both are
 * offered because both are things a caller legitimately holds, and NEITHER is
 * free text: there is no act-name matching in this route at all, deliberately —
 * `judgment_statute_refs.act_key` exists precisely because the corpus names one
 * Act a dozen ways, and re-opening that door on a canonical-identity route
 * would make the Act being asked about a matter of spelling.
 *
 * They are mutually exclusive. Two identities for one section is a question we
 * would have to arbitrate, and arbitrating it silently is how a caller gets an
 * answer to a question it did not ask.
 */
export const linkedJudgmentsQuery = z
  .object({
    sectionId: z.string().uuid().optional(),
    sectionNumber: z.string().min(1).max(16).optional(),
    /**
     * `resolver_confirmed` — only references the exact-date resolver has
     * affirmatively classified as linked. The default, and today empty.
     * `structural_unreviewed` — additionally, references pinned to this Act by
     * the extractor but not yet reviewed by the resolver. Labelled per row.
     */
    evidence: z.enum(['resolver_confirmed', 'structural_unreviewed']).default('resolver_confirmed'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .refine((q) => !(q.sectionId && q.sectionNumber), {
    message: 'Give sectionId or sectionNumber, not both.',
  });

export type LinkedJudgmentsQuery = z.infer<typeof linkedJudgmentsQuery>;

/**
 * The resolver states that mean "this reference IS linked to this Act".
 *
 * The other six states in migration `0091` are refusals or open questions, and
 * NULL is neither of those — it is the absence of a decision. None of them
 * appears here, and the list is a positive constant rather than a `NOT IN` so
 * that a state added later is excluded until somebody deliberately adds it.
 */
const CONFIRMED_STATES: readonly string[] = ['linked_exact', 'linked_chronology_permitted'];

/**
 * The route gate, and why it is NOT the capability registry.
 *
 * NEW3 R16 §9: `STATUTE_LINKED_REGISTRY_STATE = POST_V1_ON_IOS_ANDROID_WEB_UNCHANGED`,
 * and the registry must not change. But `statute.linked_judgments` is `LIMITED`
 * in that registry, and `isUserReachable` returns true for `LIMITED` — so
 * gating this route on the registry alone would ship it enabled the moment it
 * mounted, which is the one outcome the handoff forbids.
 *
 * So the gate is an environment flag that is OFF unless explicitly set, AND the
 * registry check on top of it. Both must pass. `STATUTE_LINKED_JUDGMENTS_ROUTE`
 * is not a feature flag anybody is asked to flip in production: it exists so
 * that RCC and this repo's tests can exercise the contract while the public
 * answer stays 409. Removing the variable restores the refusal on its own,
 * which is the property a gate has to have.
 */
export function routeEnabled(): boolean {
  return process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] === 'enabled';
}

type ActRow = {
  id: string;
  short_title: string;
  hindi_title: string | null;
  act_number: string;
  act_year: number;
  enactment_date: string | null;
  enforcement_date: string | null;
  source_url: string;
  section_count: number;
};

type SectionRow = {
  id: string;
  statute_id: string;
  section_number: string;
  heading: string | null;
  source_url: string;
};

type RefPage = {
  judgment_id: string;
  occurrences: number;
  first_offset: number;
  act_named: string[];
  section_numbers: string[];
  resolution_states: (string | null)[];
  resolution_reasons: (string | null)[];
  resolved_at: string | null;
};

type JudgmentRow = {
  id: string;
  case_title: string;
  neutral_citation: string | null;
  court: string;
  judgment_date: string;
  case_number: string | null;
  case_type: string | null;
  overruled_status: string;
};

/**
 * The chronology gate, applied in the QUERY and not trusted from the data.
 *
 * Measured 1 September 2026 on the live corpus: of 703,768 references carrying
 * a `statute_id`, **zero** name an Act enacted after the judgment that cites
 * it, by act year, enactment date or enforcement date. The 1,723 anachronistic
 * links the capability registry records from FIFTH's August measurement do not
 * reproduce at this HEAD.
 *
 * That measurement is a reason to be confident, and it is NOT the gate. A count
 * taken today says nothing about the next ingest, and the failure it guards
 * against — *"1,117 CrPC references from before 1974 pinned to the 1973 Code"* —
 * is a wrong charge on an advocate's screen. So the predicate runs on every
 * request, costs one already-joined column, and the rows it excludes are
 * counted rather than vanishing.
 *
 * `enactment_date` is used where the source states one and `act_year` is the
 * fallback, never the other way round: they are different facts, and an Act
 * enacted in December of its year would wrongly refuse a judgment from earlier
 * that same year if the year were preferred. Commencement is deliberately NOT
 * used to refuse — a judgment between enactment and commencement may
 * legitimately discuss a provision not yet in force, and refusing it would be a
 * second, opposite error.
 */
function chronologyGate(sql: Sql, act: ActRow) {
  return act.enactment_date
    ? sql`AND j.judgment_date >= ${act.enactment_date}::date`
    : sql`AND extract(year from j.judgment_date) >= ${act.act_year}`;
}

export async function getLinkedJudgments(
  c: Context,
  sql: Sql,
  statuteId: string,
  query: LinkedJudgmentsQuery,
): Promise<Response> {
  if (!routeEnabled()) {
    return fail(
      c,
      'CAPABILITY_DISABLED',
      'This capability is not available in the current release.',
      409,
      {
        capability: 'statute.linked_judgments',
        gate: 'route',
        reason:
          'The statute-linked judgments route is held pending NEW3 acceptance of its evidence. ' +
          'It is not enabled on any platform.',
      },
    );
  }
  if (!isUserReachable('statute.linked_judgments')) {
    return fail(
      c,
      'CAPABILITY_DISABLED',
      'This capability is not available in the current release.',
      409,
      capabilityRefusal('statute.linked_judgments'),
    );
  }

  const [act] = await sql<ActRow[]>`
    SELECT s.id, s.short_title, s.hindi_title, s.act_number, s.act_year,
           s.enactment_date::text AS enactment_date,
           s.enforcement_date::text AS enforcement_date,
           s.source_url,
           (SELECT count(*)::int FROM statute_sections ss WHERE ss.statute_id = s.id)
             AS section_count
      FROM statutes s
     WHERE s.id = ${statuteId}`;

  if (!act) {
    // Unknown stays unknown. This says we do not hold the Act, never that no
    // such Act exists — 849 held out of a statute book nobody has enumerated.
    return fail(c, 'STATUTE_NOT_FOUND', 'We do not hold an Act with that identifier.', 404);
  }

  /**
   * Section identity resolution.
   *
   * A `sectionId` that belongs to a DIFFERENT Act is its own error rather than
   * an empty result: the caller holds two identities that disagree, and telling
   * it "no linked judgments" would let a mismatched pair look like a real
   * finding about the law.
   */
  let section: SectionRow | null = null;
  if (query.sectionId) {
    const [row] = await sql<SectionRow[]>`
      SELECT id, statute_id, section_number, heading, source_url
        FROM statute_sections WHERE id = ${query.sectionId}`;
    if (!row) {
      return fail(c, 'SECTION_NOT_FOUND', 'We do not hold a section with that identifier.', 404);
    }
    if (row.statute_id !== act.id) {
      return fail(
        c,
        'SECTION_NOT_IN_ACT',
        'That section belongs to a different Act. Nothing was looked up.',
        404,
        {
          sectionId: query.sectionId,
          belongsToStatuteId: row.statute_id,
          requestedStatuteId: act.id,
        },
      );
    }
    section = row;
  } else if (query.sectionNumber) {
    const [row] = await sql<SectionRow[]>`
      SELECT id, statute_id, section_number, heading, source_url
        FROM statute_sections
       WHERE statute_id = ${act.id}
         AND upper(section_number) = ${query.sectionNumber.toUpperCase()}`;
    if (!row) {
      /**
       * **"We do not hold that section", never "that section does not exist".**
       *
       * 849 Acts are held and four of them parsed no sections at all
       * (`statutes/route.ts` §sectionlessCount). A section absent from our copy
       * of an Act is ambiguous between an incomplete ingest and a provision that
       * was never there, and this route cannot tell those apart — so it reports
       * what it knows (`heldSectionCount`) and refuses to resolve the ambiguity
       * on the advocate's behalf.
       */
      return fail(c, 'SECTION_NOT_FOUND', 'We do not hold that section of this Act.', 404, {
        statuteId: act.id,
        sectionNumber: query.sectionNumber,
        heldSectionCount: act.section_count,
      });
    }
    section = row;
  }

  const scope = section ? 'section' : 'act';
  const sectionPredicate = section
    ? sql`AND upper(r.section_number) = ${section.section_number.toUpperCase()}`
    : sql``;
  const evidencePredicate =
    query.evidence === 'resolver_confirmed'
      ? sql`AND r.resolution_state = ANY(${CONFIRMED_STATES})`
      : sql`AND (r.resolution_state IS NULL OR r.resolution_state = ANY(${CONFIRMED_STATES}))`;

  /**
   * The page, deduplicated to CANONICAL JUDGMENT IDENTITY.
   *
   * `judgment_statute_refs` is unique on (`judgment_id`, `act_named`,
   * `section_number`), so one judgment yields one ROW PER SPELLING the court
   * used. Measured on CrPC s.482: **42,697 references over 40,134 judgments** —
   * 2,468 judgments would otherwise appear twice on one page, once as "CrPC"
   * and once as "Code of Criminal Procedure", reading as two authorities.
   *
   * `GROUP BY r.judgment_id` — the judgment's own primary key, and nothing
   * else. **Not case title, not citation, not content hash.** A neutral
   * citation names several connected matters and roughly a third of real case
   * titles are printed on more than one judgment; collapsing on any of those
   * would merge distinct decisions, which is a worse error than two rows.
   *
   * The spellings are kept, aggregated, because how a court named the Act is
   * evidence about the link and discarding it would make the row unauditable.
   *
   * **`judgments` is NOT joined here.** Measured, this box at rest, CrPC s.482:
   * 67.6 ms without the join and 199.5 ms with it — the join costs 42,697
   * `judgments_pkey` searches to return 20 rows, the same effect `retrieve.ts`
   * documents at 943 ms against 8,050 ms. The page's ids are joined once,
   * afterwards, bounded by `limit`.
   *
   * `ORDER BY sum(r.occurrences)` is written out rather than ordering by the
   * output alias: a bare `ORDER BY occurrences` resolves to the SELECT alias and
   * has already turned one keyset walk in this repo into a sequential scan.
   */
  const refs = await sql<RefPage[]>`
    SELECT r.judgment_id,
           sum(r.occurrences)::int AS occurrences,
           min(r.first_offset)::int AS first_offset,
           array_agg(DISTINCT r.act_named) AS act_named,
           array_agg(DISTINCT r.section_number) AS section_numbers,
           -- array_remove(..., NULL), and NOT a bare array_agg. A bare
           -- aggregate over an all-NULL column produces a one-element array
           -- holding NULL, postgres.js parses that unquoted token back as the
           -- STRING 'NULL', and a length check on the result then reads a row
           -- with no resolver decision as a confirmed one. Observed on CrPC
           -- s.482 before this line existed: three unclassified references
           -- came off the wire labelled resolver_confirmed.
           array_remove(array_agg(DISTINCT r.resolution_state), NULL) AS resolution_states,
           array_remove(array_agg(DISTINCT r.resolution_reason), NULL) AS resolution_reasons,
           ${sql.unsafe(isoColumn('max(r.resolved_at)'))} AS resolved_at
      FROM judgment_statute_refs r
     WHERE r.statute_id = ${act.id}
       ${sectionPredicate}
       ${evidencePredicate}
     GROUP BY r.judgment_id
     ORDER BY sum(r.occurrences) DESC, r.judgment_id
     LIMIT ${query.limit + 1} OFFSET ${query.offset}`;

  const hasMore = refs.length > query.limit;
  const page = hasMore ? refs.slice(0, query.limit) : refs;

  /**
   * What the tier excluded, named rather than merely absent.
   *
   * Counted over the SAME scope as the page and grouped by resolution state, so
   * `withheld` answers "how many references did you decline to show me, and on
   * what ground" as a number per ground. `unclassified` is the NULL population:
   * present, large, and not a confirmed link.
   */
  const withheldRows = await sql<{ state: string; refs: number; judgments: number }[]>`
    SELECT coalesce(r.resolution_state, 'unclassified') AS state,
           count(*)::int AS refs,
           count(DISTINCT r.judgment_id)::int AS judgments
      FROM judgment_statute_refs r
     WHERE r.statute_id = ${act.id}
       ${sectionPredicate}
     GROUP BY 1`;

  const judgments =
    page.length === 0
      ? []
      : await sql<JudgmentRow[]>`
          SELECT j.id, j.case_title, j.neutral_citation, j.court,
                 j.judgment_date::text AS judgment_date,
                 j.case_number, j.case_type::text AS case_type,
                 j.overruled_status::text AS overruled_status
            FROM judgments j
           WHERE j.id = ANY(${page.map((r) => r.judgment_id)})
             ${chronologyGate(sql, act)}`;

  const byId = new Map(judgments.map((j) => [j.id, j]));
  /**
   * Rows the chronology gate removed from THIS page, and rows whose judgment is
   * gone. Both are reported; neither is backfilled from the next page, because
   * silently topping the page back up to `limit` would hide exactly the event
   * worth seeing.
   */
  const refusedOnPage = page.length - judgments.length;

  const derived = await derivedEffects(
    sql,
    judgments.map((j) => ({ judgmentId: j.id, overruledStatus: j.overruled_status })),
  );

  const confirmedState = (s: string): boolean => CONFIRMED_STATES.includes(s);
  const shownByTier = (s: string): boolean =>
    query.evidence === 'structural_unreviewed'
      ? s === 'unclassified' || confirmedState(s)
      : confirmedState(s);

  const links = page
    .map((r) => {
      const j = byId.get(r.judgment_id);
      if (!j) return null;
      const d = derived.get(j.id);
      /**
       * A row is `resolver_confirmed` only when the resolver actually wrote a
       * confirming state for EVERY spelling aggregated into it. Non-empty is
       * not the test: a mixed row would otherwise inherit the stronger label
       * from its strongest reference, which is the direction that gets an
       * advocate hurt.
       */
      const states = r.resolution_states.filter((s): s is string => s !== null);
      const confirmed = states.length > 0 && states.every(confirmedState);
      return {
        judgmentId: j.id,
        caseTitle: j.case_title,
        neutralCitation: j.neutral_citation,
        court: j.court,
        judgmentDate: j.judgment_date,
        caseNumber: j.case_number,
        caseType: j.case_type,
        /**
         * Currentness, derived live through the one policy layer every other
         * surface uses. `overruledStatusStored` is the raw column beside it, as
         * `/search` returns it, so a client can never be shown a banner that
         * disagrees with the row it came from.
         */
        overruledStatus: d?.banner ?? j.overruled_status,
        overruledStatusStored: j.overruled_status,
        precedentialEffect: d?.effect ?? 'none',
        canAddToMatter: d?.canAdd ?? true,
        unappliedTreatment: d?.unapplied ?? null,
        treatmentAttribution: d?.attribution ?? null,
        link: {
          /** How the court itself named the Act. Evidence, not decoration. */
          actNamedInJudgment: r.act_named,
          sectionNumbers: r.section_numbers,
          occurrences: r.occurrences,
          firstOffset: r.first_offset,
          resolutionState: states.length > 0 ? states : null,
          resolutionReason: r.resolution_reasons.filter((s): s is string => s !== null),
          resolvedAt: r.resolved_at,
          evidence: confirmed ? 'resolver_confirmed' : 'structural_unreviewed',
        },
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return ok(c, {
    act: {
      statuteId: act.id,
      shortTitle: act.short_title,
      hindiTitle: act.hindi_title,
      actNumber: act.act_number,
      actYear: act.act_year,
      enactmentDate: act.enactment_date,
      enforcementDate: act.enforcement_date,
      sourceUrl: act.source_url,
      heldSectionCount: act.section_count,
      /**
       * **We hold no repeal record for any Act, so this is `null` and not
       * `false`.** `statutes` has no repeal column — NEW2 raised exactly this
       * gap on the bus and its repeal migration was retracted. A `false` here
       * would assert "this Act is in force", which is a claim about the law that
       * nothing in this database supports.
       */
      repealRecorded: null,
    },
    section: section
      ? {
          sectionId: section.id,
          sectionNumber: section.section_number,
          heading: section.heading,
          sourceUrl: section.source_url,
        }
      : null,
    scope,
    /**
     * Predecessor/successor identity, refused rather than approximated.
     *
     * `statute_mappings` holds seeded IPC/CrPC/Evidence → BNS/BNSS/BSA rows, and
     * the capability registry has `statute.old_new_correspondence` DISABLED
     * because *"a wrong section correspondence is a wrong charge"*. This route
     * does not reopen that: it says the correspondence is unavailable and never
     * widens a section query to a predecessor's or successor's case law.
     */
    correspondence: {
      available: isUserReachable('statute.old_new_correspondence'),
      reason: capabilityRefusal('statute.old_new_correspondence').reason,
    },
    evidence: query.evidence,
    relationship: 'cites_statute_reference',
    semantics:
      scope === 'section'
        ? 'Judgments whose text carries a structurally extracted reference to this section of this ' +
          'Act. It is not a finding that the section applied, was interpreted, or was decided under.'
        : 'Judgments whose text carries a structurally extracted reference to this Act. It is not a ' +
          'finding that the Act applied, was interpreted, or was decided under.',
    /**
     * Ordering, stated because it will be read as ranking otherwise.
     *
     * `occurrences` is how many times the judgment names the provision. It is
     * the cheapest available signal that a judgment turns on a section rather
     * than passing it, and it is NOT relevance, authority or merit. `judgmentId`
     * breaks ties so paging is exact — no row repeats, none is skipped.
     */
    ordering: 'occurrences_desc_then_judgment_id',
    links,
    page: {
      limit: query.limit,
      offset: query.offset,
      returned: links.length,
      hasMore,
    },
    withheld: {
      byResolutionState: Object.fromEntries(
        withheldRows
          .filter((w) => !shownByTier(w.state))
          .map((w) => [w.state, { references: w.refs, judgments: w.judgments }]),
      ),
      chronologyRefusedOnThisPage: refusedOnPage,
    },
    /**
     * Coverage, on every response, because an empty list and a partial list are
     * both routinely misread as "there is no law on this".
     */
    coverage: {
      note:
        'A judgment is reachable here only where the extractor recorded a statute reference AND ' +
        'the Act was named beside the section. Coverage is partial and is not complete.',
    },
    /** The instant the server read `overruled_status`. Never cached. */
    asOf: new Date().toISOString(),
  });
}
