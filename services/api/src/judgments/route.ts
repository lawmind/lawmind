/**
 * `GET /judgments/:id` — `docs/API_CONTRACTS.md` §Search.
 *
 * The reading view's only route. Until it shipped, a judgment found by search
 * could not be opened: RCC could exercise the reading view against fixtures only,
 * and a deep link into the real corpus rendered an honest dead end.
 *
 * Every field comes from the `judgments` row. `overruled_status` is selected here
 * on every request, live — never cached, never denormalised, never carried across
 * a request. `docs/CITATION_HARNESS.md` §Overruled status is never cached.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { attachCitesJudgmentId } from './citations.ts';
import {
  precedentialEffect,
  precedentialPolicy,
  unappliedTreatment,
  type OverruledStatus,
  attributionOf,
  precedentialEffectFromEdges,
  type TreatmentEdge,
  type TreatmentProvenance,
} from './precedential-effect.ts';
import { numberedShare, segmentParagraphs } from './paragraphs.ts';
import { dateQualityOf, dateQualityState } from './date-quality.ts';
import {
  bodyTextGrade,
  bodyTextState,
  isBodyTextSafe,
} from '../search/body-text-safety.ts';
import { generationEvidenceEligible, textOriginOf } from './text-origin.ts';
import { logger } from '../logger.ts';
import { recordStepForAuthIdInBackground } from '../product/activation.ts';

export const judgmentParams = z.object({ id: z.string().uuid() });

type JudgmentRow = {
  id: string;
  case_title: string;
  neutral_citation: string | null;
  reporter_citations: string[];
  court: string;
  bench: string | null;
  judgment_date: string;
  case_number: string | null;
  case_type: string | null;
  language: string;
  source_url: string;
  source_id: string | null;
  source_edition: string | null;
  authorization_basis: string | null;
  provenance_recorded_at: string | null;
  full_text: string;
  script_quality: string | null;
  script_quality_method: string | null;
  overruled_status: string;
  overruled_by_judgment_id: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
};

export async function getJudgment(c: Context, sql: Sql, id: string): Promise<Response> {
  const [row] = await sql<JudgmentRow[]>`
    SELECT id, case_title, neutral_citation, reporter_citations, court, bench,
           -- ::text keeps this a calendar date. The column is a date; the driver
           -- otherwise hydrates it to a Date and JSON renders a midnight
           -- timestamp, so the client would show a time a judgment never had.
           judgment_date::text AS judgment_date,
           case_number, case_type, language, source_url, full_text,
           -- The four provenance columns migration 0092 added and nothing ever
           -- put on the wire. Populated for 5,830 of 18,758,460 rows (0.031%),
           -- so they are NULL for almost every judgment and are published as
           -- NULL rather than defaulted — see the provenance block below.
           source_id, source_edition, authorization_basis,
           provenance_recorded_at::text AS provenance_recorded_at,
           -- The body-text verdict, read LIVE on this request, exactly as
           -- retrieval reads it. Never from a staged table: a document
           -- convicted one second ago must be refused by the next read.
           script_quality, script_quality_method,
           overruled_status, overruled_by_judgment_id, overruled_paras, overruled_note
    FROM judgments WHERE id = ${id}
  `;

  if (!row) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE DERIVED EFFECT, ON THE SURFACE WHERE THE ADVOCATE ACTUALLY READS THE LAW
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `precedential-effect.ts` split treatment into three layers when OD-14 was
   * resolved — verified edge → derived effect → product policy — and was wired
   * into exactly ONE caller: add-to-matter. So the refusal knew the difference
   * between an overruling and a set aside, and the READING VIEW did not: it
   * rendered `overruled_status` raw, which is the coerced label OD-14 was about.
   *
   * Checked against the corpus, 22 Aug 2026: `P. KANNADASAN` (1996 INSC 800)
   * returned `overruledStatus: "set_aside"` here while its own verified edge
   * says `overruled`, and `BHARATI VIDYAPEETH` (2004 INSC 140) returned
   * `"none"` while carrying a verified `overruled_in_part` edge.
   *
   * `bannerStatus` remains one of the same four wire values and is what the
   * client renders — **nothing here weakens a warning**, and the amber LAW MOVED
   * mark is unchanged. `precedentialEffect` is the finer fact underneath it, for
   * the on-tap detail and the admin monitor. Both are ADDITIVE fields; a client
   * reading only `overruledStatus` behaves exactly as it does today.
   *
   * Read live, per request, never cached — `CITATION_HARNESS.md` §Overruled
   * status is never cached.
   */
  const treatment = await sql<{ relationship: string; treatment_provenance: string | null }[]>`
    SELECT DISTINCT relationship, treatment_provenance
      FROM judgment_citations
     WHERE cited_judgment_id = ${row.id}
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;
  /* WHO said it, carried alongside WHAT was said. 95.62% of the edges behind a
   * LAW MOVED badge are a reporter's headnote rather than the later court's own
   * words, and the wording has to be able to tell the difference. The banner is
   * unchanged either way -- see `precedential-effect.ts` §A FOURTH LAYER. */
  const edges = treatment.map((t) => ({
    relationship: t.relationship,
    provenance: t.treatment_provenance as TreatmentProvenance | null,
  }));
  const attribution = attributionOf(edges);
  const effect = precedentialEffectFromEdges({
    overruledStatus: row.overruled_status as OverruledStatus,
    edges,
  });
  const policy = precedentialPolicy(effect);
  /* A verified adverse edge the corpus has not applied. Reported, never acted
   * on — see `unappliedTreatment`. Null for all but 2 judgments today. */
  const unapplied = unappliedTreatment({
    overruledStatus: row.overruled_status as OverruledStatus,
    inboundRelationships: treatment.map((t) => t.relationship),
  });

  // The server's read time for `overruledStatus`, never the client's receipt
  // time. An offline surface renders the status it last read WITH this date.
  const asOf = new Date().toISOString();

  /**
   * NEW2's `judgment_date_quality`, on the surface where an advocate reads the
   * date and copies it into a filing.
   *
   * Additive and purely a STATE — this route makes no chronology claim, so
   * nothing here is refused and nothing is hidden. What it stops is the client
   * having to treat every printed date as equally sound when 4.68% of them are
   * contradicted by an independent witness. Four values, `null` meaning nothing
   * has looked, never collapsed into three. `date-quality.ts`.
   */
  const dateQuality = await dateQualityOf(sql, row.id);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE READER OBEYS THE SAME EVIDENCE GATE AS SEARCH — FIFTH bus 1322
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `search/body-text-safety.ts` states the split structurally: METADATA stays
   * discoverable for a damaged document, BODY TEXT is refused. Retrieval has
   * honoured that since it shipped. **This route did not**, and it is the route
   * whose entire purpose is to hand an advocate the body.
   *
   * FIFTH proved it on a live row, 26 Aug: judgment
   * `4c99fc8a-ed79-4ad6-afa3-7a1a617542e8` (`KAVALI THIPPANNA Vs S PRABHAVATHI`,
   * `script_quality = 'damaged_other'`, `english_density_screen_v1`). `POST
   * /search` returned `bodyText.evidenceWithheld: true` and no passage. `GET
   * /judgments/:id` returned 12,731 characters of control-corrupt text with no
   * envelope at all — so the withholding policy was not a policy, it was a
   * property of one route, and the deep link went round it.
   *
   * Withheld here means the same thing it means on search: the body-derived
   * fields are empty by REFUSAL, not by absence, and `bodyText` is the field
   * that says which. The judgment stays reachable, its citation, title, court,
   * date and treatment are all undamaged and all still returned — body damage
   * is no evidence against them.
   *
   * Deliberately NOT hidden in the client. A client-side rule is a rule that
   * holds until the next client, and the raw text is on the wire either way.
   */
  /**
   * WHOSE EDITION THIS IS — R8.3 §8.3, FIFTH bus 1367.
   *
   * Derived from PROVENANCE, never from a content classifier: the role
   * detector's reporter recall is 42.1%, so gating on it would let more than
   * half through while sounding like a guarantee. `text-origin.ts` carries the
   * measurement — every one of the 38,342 Supreme Court judgments from the
   * S.C.R. bucket is the reporter's paginated edition, and their bodies carry
   * its running head and marginal letters.
   *
   * The body is still served. An advocate must be able to read the authority,
   * and withholding 38,342 Supreme Court judgments would be a far larger defect
   * than the one being fixed. What changes is that the wire now SAYS whose text
   * it is, and says the body may not support a generated proposition.
   */
  const textOrigin = textOriginOf(row);

  const bodySafe = isBodyTextSafe(row.script_quality);
  const bodyText = {
    state: bodyTextState(row.script_quality),
    grade: bodyTextGrade(row.script_quality, row.script_quality_method),
    evidenceWithheld: !bodySafe,
  };
  if (!bodySafe) row.full_text = '';

  const segmented = segmentParagraphs(row.full_text);
  // `citesJudgmentId` — REB §14 / V2 §39.3, RCC bus 0028/0032. Resolved through
  // the same three-source match `cite:` search uses (`citations.ts`), never
  // guessed on an ambiguous or self-referencing match.
  const paragraphs = await attachCitesJudgmentId(sql, segmented, row.id);

  // One citation_checks row per citation per surface. Written here for the same
  // reason it is written on search: silent-drop and stale-overruled are computed
  // from these rows, and a surface that renders a citation without recording it
  // is invisible to both metrics.
  await sql`
    INSERT INTO citation_checks
      (search_id, citation_claimed, judgment_id_matched, verification_state,
       verified_by_source, shown_to_user, overruled_status_shown, surface)
    VALUES (NULL,
            ${row.neutral_citation ?? row.reporter_citations[0] ?? row.case_title},
            ${row.id}, 'verified', 'corpus', true, ${policy.bannerStatus}, 'judgment_detail')
  `;

  /**
   * Funnel step 3. Opening the full text of a judgment is the moment an
   * advocate stops looking at a result list and reads the primary source, which
   * is the thing this product exists to put in front of them.
   *
   * Only reached after the 404, so a bad id counts nothing.
   */
  recordStepForAuthIdInBackground(
    sql,
    c.get('authId'),
    'opened_primary_authority',
    (err) =>
      logger.error(
        { request_id: c.get('requestId'), err, step: 'opened_primary_authority' },
        'activation step not recorded',
      ),
  );

  return ok(c, {
    judgmentId: row.id,
    caseTitle: row.case_title,
    neutralCitation: row.neutral_citation,
    reporterCitations: row.reporter_citations,
    court: row.court,
    /**
     * The judges who sat, or NULL where the source publishes none.
     *
     * **NULL is now the majority case and was always possible.** Migration
     * `0040` moved 40,980 rows' worth of S3 partition key (`patnahcucisdb94`)
     * out of this column, so every High Court judgment we hold answers NULL
     * here — the plain metadata variant carries no judge field at all — and
     * 16 rows already did before that. The client types this `string`, which
     * was already a type that lies; RCC is told rather than left to find it.
     *
     * An absent coram must render as absent. It must NEVER render as a court
     * code, which is what shipped: opening any Patna judgment, the largest
     * court in our corpus, showed a database slug where the bench belongs.
     */
    bench: row.bench,
    judgmentDate: row.judgment_date,
    /**
     * `DATE_VERIFIED` | `DATE_SUSPECT` | `DATE_UNKNOWN` | `null` (nothing has
     * looked). The stored `judgmentDate` above is NEVER rewritten by this —
     * the state is published beside it.
     */
    dateQuality,
    /**
     * The same fact, named rather than absent — R8.3 §5.5, FIFTH bus 1322.
     *
     * `dateQuality: null` is what 96.19% of the corpus reads (713,136 of
     * 18,698,968 judgments have a `judgment_date_quality` row at all), and on
     * the wire `null` is indistinguishable from "this route does not carry the
     * fact". `DATE_UNCHECKED` says the true thing out loud. Nothing is merged:
     * `DATE_UNKNOWN` — we looked and found no witness — is still its own
     * string, and only `DATE_SUSPECT` refuses a chronology claim.
     */
    dateQualityState: dateQualityState(dateQuality),
    caseNumber: row.case_number,
    caseType: row.case_type,
    language: row.language,
    sourceUrl: row.source_url,
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * WHERE THIS DOCUMENT CAME FROM — additive, and mostly NULL on purpose
     * ─────────────────────────────────────────────────────────────────────────
     *
     * NEW3's data-trust contract asks a judgment to say its source, its source
     * EDITION and the basis on which we hold it. Migration `0092` added all four
     * columns and nothing ever put them on the wire.
     *
     * **Measured 30 August 2026: 5,830 of 18,758,460 rows carry them — 0.031%.**
     * The two populated shapes are `aws_hc / court_raw / aws_open_data` (5,828)
     * and `sci_pdf / court_raw / public_official` (2). Every other judgment
     * answers NULL here, and NULL is published rather than defaulted.
     *
     * **The temptation this refuses.** Every judgment we hold is in fact raw
     * court text — `CLAUDE.md` forbids a reporter's edition and the corpus is
     * built from AWS Open Data — so defaulting `sourceEdition` to `court_raw`
     * would be true of the corpus and unevidenced of the ROW. That is the
     * `is_bail_order` failure this repository has already measured twice: a NULL
     * meaning "nobody looked" rendered as a positive claim. `textOrigin` beside
     * this field is the EVIDENCED answer to the edition question and is derived
     * per row; `sourceEdition` is the recorded one, and it is recorded for
     * almost nothing.
     *
     * `basis` is an ingest-provenance note, NOT a rights determination. §8.2
     * keeps retain / index / display / generation-evidence / training separate
     * and the content-use decision is not the server's to make.
     */
    provenance: {
      source: row.source_id,
      sourceEdition: row.source_edition,
      basis: row.authorization_basis,
      recordedAt: row.provenance_recorded_at,
      /**
       * TRUE only when this ROW carries recorded provenance. A client must not
       * infer absence of provenance from absence of the object, and must not
       * render "source unknown" as a quality claim about the judgment — we can
       * always say where a document came from, because `sourceUrl` is present
       * for 100% of the corpus. What is missing here is the STRUCTURED record.
       */
      recorded: row.source_id !== null,
    },
    /**
     * Empty string, never `null`, when `bodyText.evidenceWithheld` is true —
     * the field keeps its type so a client that ignores the envelope renders an
     * empty reader rather than crashing on a shape change. `bodyText` is the
     * half it is meant to read.
     */
    fullText: row.full_text,
    /**
     * The body-text state in the quality contract's own vocabulary, identical
     * in shape to the field `POST /search` returns for the same judgment.
     *
     * `state` is never `CLEAN` and never will be — no writer in this repository
     * has ever proved an extraction faithful, so `TEXT_UNKNOWN` is the honest
     * value for nine documents in ten. `grade` is how well the damage is
     * PROVEN, which is a different axis and is never pooled with `state`.
     */
    bodyText,
    /**
     * `REPORTER_EDITION` | `COURT_SOURCE` | `UNKNOWN`.
     *
     * A statement about the RETAINED ARTIFACT, not a segmentation of the body:
     * nothing here can yet separate a reporter's headnote from the court's
     * reasoning inside the text, and claiming otherwise is the failure §8.3
     * names. It decides no rights question either — §8.2 keeps retain / index /
     * display / generation-evidence / training separate, and the content-use
     * decision is open and is not the server's to make.
     */
    textOrigin,
    /**
     * FALSE for a reporter edition. §8.3 fail-closed, made mechanical: reporter
     * or editorial text cannot be represented as the court's own words and
     * cannot support a generated legal proposition while content-use is open.
     *
     * This field must survive every route (§10 LCC-6). A consumer that drops it
     * is a consumer that will eventually argue from a headnote.
     */
    generationEvidenceEligible: generationEvidenceEligible(textOrigin),
    // PD-9 anchors the reading view on paragraph numbers, and the client cannot
    // derive them from `fullText` without inventing them. Segmented here, with
    // access to the source, so an advocate told "see paragraph 22" lands on the
    // paragraph the court numbered 22.
    //
    // `paragraphNumber` is null wherever the source carries no number — the
    // headnote, and every pre-1990s OCR'd scan whose numbering did not survive.
    // `numberedShare` lets the client hide anchors rather than show broken ones.
    paragraphs,
    numberedShare: numberedShare(paragraphs),
    // Tier 1 by construction: this row IS the corpus, so it resolves to itself.
    // Not a placeholder — `verified` / `corpus` is the honest value in S1.
    verificationState: 'verified' as const,
    verifiedBySource: 'corpus' as const,
    /**
     * The banner value, DERIVED — not the stored column read raw.
     *
     * Still one of the four wire values, still the strongest of them for an
     * overruling. The stored column is kept beside it as
     * `overruledStatusStored` so the admin monitor can see the two disagree,
     * which is the signal `propagate-treatment.ts` has a backlog.
     */
    overruledStatus: policy.bannerStatus,
    overruledStatusStored: row.overruled_status,
    /** Layer 2 — what actually happened, in five values rather than four. */
    precedentialEffect: effect,
    /** Layer 3 — what the product does. `because` is the on-tap explanation. */
    canAddToMatter: policy.addToMatter === 'allow',
    citableForUntouchedPropositions: policy.citableForUntouchedPropositions,
    precedentialBecause: policy.because,
    /**
     * Non-null ONLY when a later court's verified edge says this authority's
     * standing changed and the corpus has not recorded it yet. It is not a
     * banner and must never be rendered as one — the banner is
     * `overruledStatus`. It exists so the fact is not silent while
     * `applyOverruledChange` remains the single writer.
     */
    unappliedTreatment: unapplied,
    /**
     * Layer 4 — WHO the adverse treatment came from. ADDITIVE; the banner and
     * `canAddToMatter` are untouched by it, so a client reading only
     * `overruledStatus` behaves exactly as before.
     *
     * It exists because 95.62% of what drives LAW MOVED is a law reporter's
     * headnote and 3.65% is the later court's own reasoning, and the on-tap
     * detail must be able to say which. `COURT` is the only value that may be
     * worded as a holding.
     */
    treatmentAttribution: attribution,
    overruledByJudgmentId: row.overruled_by_judgment_id,
    overruledParas: row.overruled_paras,
    overruledNote: row.overruled_note,
    asOf,
  });
}
