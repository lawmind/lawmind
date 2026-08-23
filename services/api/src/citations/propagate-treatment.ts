/**
 * Carry an overruling from the citation graph into the column that renders.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgment_citations` records that one judgment overruled, doubted or partly
 * set aside another — 95 such edges as of 8 Aug 2026, each with the phrase that
 * justified it in `evidence`. `judgments.overruled_status` is what every surface
 * actually reads (`CITATION_HARNESS.md` step 9, live, never cached).
 *
 * **Nothing connected the two.** Measured 8 Aug 2026: 29 judgments have an
 * inbound overruling edge and **7 of them still read `overruled_status =
 * 'none'`**, so search, briefings and drafts all render them as good law.
 *
 * `runRecheck` does not close this and was never meant to: it compares
 * `judgments.overruled_status` against `citation_checks.overruled_status_shown`
 * — the status last SHOWN to somebody — so it catches a badge that has gone
 * stale relative to the column, and assumes the column is right. When the column
 * itself was never written, both sides agree and the recheck reports nothing.
 * That is the blind spot `CITATION_HARNESS.md` names: *a corpus that never
 * learned an overruling reads 0.0% stale while advocates see stale badges,
 * because both sides of the comparison agree.*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT GOES THROUGH `applyOverruledChange`, NEVER A DIRECT UPDATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A bare `UPDATE judgments SET overruled_status` would be four lines and would
 * be wrong. Flipping the status is only the first of five things that must
 * happen: `overruled_status_changed_at` in the same write, the fan-out row, the
 * `citation_checks.overruled_status_shown` correction, and the alerts to every
 * advocate who saw it. `ADMIN_SURFACE.md` §15: two implementations drift, and
 * the one that drifts is the one that stops notifying.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **`overruled_in_part` needs its paragraphs, and skips without them.**
 * `SCHEMA_TRUTH.md` requires `overruled_paras` for `partly_set_aside`, because
 * "partly set aside, we will not say which part" renders a banner an advocate
 * cannot act on.
 *
 * Until 8 Aug 2026 nothing extracted paragraph numbers, so every such edge was
 * refused. `@lawmind/ingest/paragraph-refs` now reads them from the **citing
 * court's own words** near the citation, and the refusal moved rather than
 * disappeared: an edge whose paragraphs cannot be read with confidence is still
 * reported and left alone. **It is never widened to `set_aside`** — that
 * disables add-to-matter and tells an advocate the whole authority is gone.
 *
 * **Nothing is downgraded.** A judgment already carrying a status is never
 * touched, even by a stronger edge — an advocate or an admin may have set it
 * deliberately, and `dispute_upheld` outranks a regex over a citing sentence.
 *
 * **`--apply` is required.** Dry by default, because this writes the corpus and
 * notifies advocates. A wrong `set_aside` is not a small error in the other
 * direction: it tells an advocate the law moved when it did not, and disables
 * their ability to rely on it.
 */
import type { Sql } from 'postgres';

import { extractParagraphRefs, isTrustworthy } from '@lawmind/ingest/paragraph-refs';

import { applyOverruledChange } from './fanout.ts';
import type { Pusher } from '../push/expo.ts';

/**
 * Edge relationship → the status it justifies.
 *
 * `overruled_in_part` is deliberately absent rather than mapped to
 * `partly_set_aside`: see the module note. Absent from a lookup is a refusal
 * the type system can see; mapped-and-then-filtered is one a reader has to
 * find.
 */
const STATUS_FOR: Readonly<Record<string, 'set_aside' | 'partly_set_aside' | 'doubted'>> = {
  overruled: 'set_aside',
  doubted: 'doubted',
  /**
   * Added 8 Aug 2026, once `paragraph-refs.ts` existed.
   *
   * It was deliberately absent before, because `SCHEMA_TRUTH.md` requires
   * `overruled_paras` and nothing extracted them — and a mapping that produced
   * a status the writer would then reject is a refusal a reader has to find.
   *
   * It is present now, and the refusal moved rather than disappeared: an edge
   * whose paragraphs cannot be read **still skips**, and says so. The
   * difference is that most of them now can be read.
   */
  overruled_in_part: 'partly_set_aside',
};

export type PropagationCandidate = {
  judgmentId: string;
  caseTitle: string;
  relationship: string;
  citingJudgmentId: string;
  citingTitle: string;
  citingDate: string;
  /**
   * `DATE_VERIFIED` | `DATE_SUSPECT` | `DATE_UNKNOWN` | `null` (nothing looked).
   * `DATE_SUSPECT` means this provenance date is contradicted by an independent
   * witness — the candidate is still applied, and an operator reading the dry run
   * can see that the "overruled on" date it will publish is doubted.
   */
  citingDateState: string | null;
  evidence: string | null;
  /** Read from the citing judgment's own words. Null when nothing was legible. */
  overruledParas: number[] | null;
  /** Null when the relationship has no safe mapping — reported, never applied. */
  toStatus: 'set_aside' | 'partly_set_aside' | 'doubted' | null;
  skipReason?: string;
};

/**
 * Everything the graph says has moved and the corpus still calls good law.
 *
 * One row per judgment, not per edge. Where several later judgments overrule the
 * same authority, the strongest treatment wins and the most recent citing
 * judgment supplies the provenance — an advocate needs the fact and the latest
 * word on it, not a list.
 */
export async function findUnappliedTreatment(sql: Sql): Promise<PropagationCandidate[]> {
  const rows = await sql<
    {
      judgment_id: string;
      case_title: string;
      relationship: string;
      citing_judgment_id: string;
      citing_title: string;
      citing_date: string;
      citing_date_state: string | null;
      evidence: string | null;
      char_offset: number;
      citing_full_text: string;
    }[]
  >`
    SELECT DISTINCT ON (jc.cited_judgment_id)
           jc.cited_judgment_id           AS judgment_id,
           cited.case_title               AS case_title,
           jc.relationship,
           jc.citing_judgment_id,
           citing.case_title              AS citing_title,
           citing.judgment_date::text     AS citing_date,
           cq.state                       AS citing_date_state,
           jc.evidence,
           jc.char_offset,
           citing.full_text               AS citing_full_text
      FROM judgment_citations jc
      JOIN judgments cited  ON cited.id  = jc.cited_judgment_id
      JOIN judgments citing ON citing.id = jc.citing_judgment_id
      -- NEW2's date state for the CITING judgment. LEFT because an absent row
      -- means nothing has looked, which must not remove a candidate.
      LEFT JOIN judgment_date_quality cq ON cq.judgment_id = citing.id
     WHERE jc.cited_judgment_id IS NOT NULL
       AND jc.relationship IN ('overruled', 'overruled_in_part', 'doubted')
       -- Never downgrade or re-decide. Only judgments the corpus still calls
       -- good law are candidates.
       AND cited.overruled_status = 'none'
     ORDER BY jc.cited_judgment_id,
              -- Strongest treatment first, then the latest court to say it.
              CASE jc.relationship
                WHEN 'overruled' THEN 1
                WHEN 'overruled_in_part' THEN 2
                ELSE 3
              END,
              -- DISTINCT ON keeps the FIRST row, so this key decides which citing
              -- judgment is shown to the advocate as the provenance of an
              -- overruling: "set aside by X on <date>". "The latest court to say
              -- it" is a chronology claim, and NEW2 measured 4.68% of the corpus
              -- carrying a date an independent witness CONTRADICTS. A candidate
              -- whose citing date is contradicted is therefore ranked BELOW an
              -- equally strong one whose date is not, rather than winning on a
              -- date we have reason to doubt.
              --
              -- It is a demotion, never an exclusion: where every candidate for a
              -- treatment is suspect, the strongest one still applies and the
              -- state travels with it as citingDateState. Silence does not
              -- demote -- DATE_UNKNOWN and a NULL row rank with DATE_VERIFIED,
              -- because we looked and found nothing, or never looked, and neither
              -- is a contradiction.
              (cq.state IS NOT DISTINCT FROM 'DATE_SUSPECT') ASC,
              citing.judgment_date DESC
  `;

  return rows.map((r) => {
    let toStatus = STATUS_FOR[r.relationship] ?? null;
    let skipReason: string | undefined;

    /**
     * `partly_set_aside` is the only status that needs more than the edge: it
     * needs the paragraphs, read from the citing court's own words near the
     * citation. Where they cannot be read the candidate is reported and left
     * alone — never widened to `set_aside`, which would tell an advocate the
     * whole authority is gone.
     */
    const finding =
      toStatus === 'partly_set_aside'
        ? extractParagraphRefs(r.citing_full_text, r.char_offset)
        : null;

    if (toStatus === 'partly_set_aside' && !isTrustworthy(finding)) {
      toStatus = null;
      skipReason =
        'partly_set_aside requires the affected paragraphs and none could be read with ' +
        'confidence near the citation. Reported rather than widened to set_aside: a wrong ' +
        'paragraph tells an advocate a live passage is dead.';
    }

    if (toStatus === null && skipReason === undefined) {
      skipReason = `no safe status mapping for relationship '${r.relationship}'`;
    }

    return {
      judgmentId: r.judgment_id,
      caseTitle: r.case_title,
      relationship: r.relationship,
      citingJudgmentId: r.citing_judgment_id,
      citingTitle: r.citing_title,
      citingDate: r.citing_date,
      citingDateState: r.citing_date_state,
      evidence: finding === null ? r.evidence : `${r.evidence ?? ''} · ${finding.evidence}`.trim(),
      overruledParas: finding?.paragraphs ?? null,
      toStatus,
      ...(skipReason === undefined ? {} : { skipReason }),
    };
  });
}

export type PropagationResult = {
  found: number;
  applied: number;
  skipped: number;
  failed: number;
  outcomes: {
    judgmentId: string;
    caseTitle: string;
    toStatus: string | null;
    applied: boolean;
    notified?: number;
    error?: string;
    skipReason?: string;
  }[];
};

/**
 * Apply what can be applied, one judgment at a time.
 *
 * Sequential rather than concurrent. Each call takes `FOR UPDATE` on the
 * judgment and writes a fan-out; a wrong status here is a citation failure
 * caused by the citation machinery, and throughput is worth nothing against
 * that.
 */
export async function propagateTreatment(
  sql: Sql,
  opts: { apply: boolean; pusher?: Pusher | undefined },
): Promise<PropagationResult> {
  const candidates = await findUnappliedTreatment(sql);
  const outcomes: PropagationResult['outcomes'] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    if (c.toStatus === null) {
      skipped += 1;
      outcomes.push({
        judgmentId: c.judgmentId,
        caseTitle: c.caseTitle,
        toStatus: null,
        applied: false,
        ...(c.skipReason === undefined ? {} : { skipReason: c.skipReason }),
      });
      continue;
    }

    if (!opts.apply) {
      outcomes.push({
        judgmentId: c.judgmentId,
        caseTitle: c.caseTitle,
        toStatus: c.toStatus,
        applied: false,
        skipReason: 'dry run — pass { apply: true } to write',
      });
      continue;
    }

    try {
      const result = await applyOverruledChange(
        sql,
        {
          judgmentId: c.judgmentId,
          toStatus: c.toStatus,
          /**
           * `recheck`, not `admin_correction`. No admin decided anything, and
           * the value has to be one the citation monitor already groups under
           * "the overruled machinery changed this" — which is what an operator
           * asking "what moved and why" wants to see. `overruled_by_judgment_id`
           * and `overruled_note` below carry the real provenance, which is the
           * citing judgment and the phrase it used.
           */
          trigger: 'recheck',
          overruledByJudgmentId: c.citingJudgmentId,
          ...(c.overruledParas === null ? {} : { overruledParas: c.overruledParas }),
          overruledNote:
            c.evidence === null
              ? `Treated as ${c.relationship} in ${c.citingTitle} (${c.citingDate}).`
              : `${c.citingTitle} (${c.citingDate}): ${c.evidence}`,
        },
        opts.pusher,
      );
      applied += result.applied ? 1 : 0;
      outcomes.push({
        judgmentId: c.judgmentId,
        caseTitle: c.caseTitle,
        toStatus: c.toStatus,
        applied: result.applied,
        notified: result.notifiedCount,
      });
    } catch (error) {
      failed += 1;
      outcomes.push({
        judgmentId: c.judgmentId,
        caseTitle: c.caseTitle,
        toStatus: c.toStatus,
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { found: candidates.length, applied, skipped, failed, outcomes };
}
