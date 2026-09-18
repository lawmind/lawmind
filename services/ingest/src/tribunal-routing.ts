/**
 * Where a tribunal / regulator record is allowed to land.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A ROUTER RATHER THAN "INSERT INTO judgments"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CCI, CAT and Maharashtra RERA are all reachable and all measured
 * (`docs/TRIBUNAL_ACQUISITION_MEASUREMENT.md`; bus 0605, 0609, 0610). The
 * temptation is to point the existing loader at them, because a PDF with a case
 * title and a date looks exactly like a judgment. Three of these populations are
 * not judgments, and the damage from treating them as such is not cosmetic:
 *
 * - **85% of Maharashtra RERA is `Roznama`** — 41,791 of 49,167 records. A
 *   Roznama is the daily order sheet: "matter adjourned to 14th", "respondent
 *   absent". It is a listing event, not a reasoned decision, and it cites
 *   nothing. Loaded into `judgments` it would inflate that court's holding
 *   four-fold, dilute every retrieval ranking that treats a row as an authority,
 *   and put 41,791 documents in front of an advocate looking for law.
 * - **CCI orders are regulator-shaped, not court-shaped** (bus 0570). They carry
 *   a case number and a date and no bench, no coram, and no precedential
 *   relationship to a High Court.
 *
 * The reasoned RERA population is **7,376**, and that is the number this project
 * should ever quote for it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT DECIDE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There is no `legal_documents` table in `packages/db/src/schema.ts` today, and
 * creating one is LCC's lane, not this one — the proposal went to them as bus
 * 0613 rather than as an edit. So this module names the DESTINATION and refuses
 * to guess the columns. It is a pure classifier: no database, no fetch, no
 * schema dependency, so it is correct before the table exists and stays correct
 * after.
 *
 * It also decides nothing about authorisation. `CLAUDE.md` §6a names the three
 * authorised sources and CCI/CAT/RERA are not among them; NEW3 holds
 * FQ-CCI-PERMISSION. A route of `legal_document` here means "this is the shape
 * it would take", never "fetch it".
 */

export type TribunalSource = 'cci' | 'cat' | 'rera_mh' | 'rera_dl';

export type TribunalRoute =
  /** A reasoned decision. Citable, may carry precedential weight for its forum. */
  | 'legal_document'
  /**
   * A procedural or listing record. Real, worth storing as observed court state
   * (`docs/JUDICIAL_STATE_MODEL.md`), and never an authority.
   */
  | 'procedural_record'
  /** Shape not recognised. Held, never guessed into either bucket. */
  | 'unclassified';

export type TribunalRouting = {
  readonly source: TribunalSource;
  readonly route: TribunalRoute;
  /**
   * May this row ever enter a precedent-like authority dataset — retrieval,
   * citation resolution, treatment graph, training? `procedural_record` is
   * false by construction, and so is anything unclassified.
   */
  readonly authorityEligible: boolean;
  readonly rawType: string;
  readonly reason: string;
};

/**
 * Maharashtra RERA's own `judgment_order_type`, as returned by
 * `Getjudgment_orderBySubjectDate`. Compared after case-folding and whitespace
 * collapse because the live data carries whitespace variants of `Roznama` —
 * measured, not anticipated — and an exact-string match would have let the
 * variants through into the authority bucket, which is the failure this whole
 * module exists to prevent.
 */
const RERA_REASONED = new Set([
  'order',
  'judgement',
  'judgment',
  'operative part in appeal / application',
]);
const RERA_PROCEDURAL = new Set(['roznama']);

const fold = (value: string) => value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase();

export function routeTribunalRecord(source: TribunalSource, rawType: string): TribunalRouting {
  const type = fold(rawType);
  const base = { source, rawType };

  if (source === 'rera_mh') {
    if (RERA_PROCEDURAL.has(type)) {
      return {
        ...base,
        route: 'procedural_record',
        authorityEligible: false,
        reason:
          'Roznama is the daily order sheet — a listing event, not a reasoned decision. 41,791 of 49,167 records.',
      };
    }
    if (RERA_REASONED.has(type)) {
      return {
        ...base,
        route: 'legal_document',
        authorityEligible: true,
        reason: 'reasoned RERA decision — one of the 7,376',
      };
    }
    return {
      ...base,
      route: 'unclassified',
      authorityEligible: false,
      reason: `unrecognised judgment_order_type "${rawType}" — held rather than guessed into either bucket`,
    };
  }

  /**
   * DELHI RERA HAS NO TYPE COLUMN AT ALL, WHICH IS NOT THE SAME AS HAVING ONLY
   * REASONED TYPES.
   *
   * NEW3 measured it (bus 0634, `docs/RERA_STATE_MATRIX.md`): 481 documents,
   * server-rendered, four columns — Sr.No / Appeal Number / Date of Decision /
   * View Judgement. No `type` field exists to classify on. The URL path names
   * "Judgements/Final Orders" and the listing structurally resembles
   * Maharashtra's already-filtered `Judgement` + `Order` bucket.
   *
   * That is a reasonable inference and it is not evidence, and NEW3 said so
   * plainly rather than banking it. **Maharashtra is exactly why.** Its listing
   * also looked like a decision table; 85% of it — 41,791 records — turned out
   * to be Roznama, and the only reason we know is that the field was there to
   * read. Delhi removes the field, so the same error would be undetectable
   * rather than merely unnoticed.
   *
   * So Delhi routes `unclassified` until a content check exists. This is the
   * module's own rule applied to itself: a URL path is a label, and the whole
   * point of holding an unrecognised type is that we do not promote labels to
   * authority. The cost of being wrong in this direction is 481 documents
   * waiting; in the other it is procedural chaff entering retrieval as
   * precedent-like authority.
   *
   * The content check is CX1's, not this lane's, per the 17 Aug CX1
   * coordination addendum — NEW2 reviews the evidence and owns the integration.
   * When it lands, this becomes a `RERA_REASONED`-style membership test like
   * Maharashtra's, or a per-document classifier if Delhi genuinely has no
   * discriminator.
   */
  if (source === 'rera_dl') {
    return {
      ...base,
      route: 'unclassified',
      authorityEligible: false,
      reason:
        'Delhi RERA listing carries NO type column — 481 documents, path says "Judgements/Final Orders" ' +
        'but that is a label, not a field. Maharashtra looked the same and was 85% Roznama. ' +
        'Held pending a content check.',
    };
  }

  /**
   * CCI and CAT have ONE document class each in what has been measured so far,
   * and neither is a court judgment. They are routed rather than rejected: the
   * shape is right, the destination is not `judgments`.
   */
  if (source === 'cci' || source === 'cat') {
    return {
      ...base,
      route: 'legal_document',
      authorityEligible: true,
      reason:
        source === 'cci'
          ? 'CCI order — regulator-shaped, no bench or coram, never a judgments row'
          : 'CAT order — tribunal decision, date-enumerable listing',
    };
  }

  return {
    ...base,
    route: 'unclassified',
    authorityEligible: false,
    reason: `unknown tribunal source "${source}"`,
  };
}

/**
 * The one-line guard a loader should call before any write to `judgments`.
 *
 * Deliberately phrased as a refusal rather than a permission: the default answer
 * for every tribunal record is NO, and a caller has to be holding a specific
 * reason to get past it. None of these sources belongs in `judgments` at all —
 * the table is High Court and Supreme Court decisions — so this returns false
 * unconditionally and says why.
 */
export function mayEnterJudgments(routing: TribunalRouting): {
  readonly allowed: false;
  readonly reason: string;
} {
  return {
    allowed: false,
    reason:
      `${routing.source} records never enter judgments — that table holds court decisions. ` +
      `This one routes to ${routing.route}.`,
  };
}
