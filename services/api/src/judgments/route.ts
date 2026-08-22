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
} from './precedential-effect.ts';
import { numberedShare, segmentParagraphs } from './paragraphs.ts';

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
  full_text: string;
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
  const treatment = await sql<{ relationship: string }[]>`
    SELECT DISTINCT relationship
      FROM judgment_citations
     WHERE cited_judgment_id = ${row.id}
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;
  const effect = precedentialEffect({
    overruledStatus: row.overruled_status as OverruledStatus,
    inboundRelationships: treatment.map((t) => t.relationship),
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
    caseNumber: row.case_number,
    caseType: row.case_type,
    language: row.language,
    sourceUrl: row.source_url,
    fullText: row.full_text,
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
    overruledByJudgmentId: row.overruled_by_judgment_id,
    overruledParas: row.overruled_paras,
    overruledNote: row.overruled_note,
    asOf,
  });
}
