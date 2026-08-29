/**
 * What a cause-list request is actually FOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * "COURT" WAS NEVER THE UNIT, AND MODELLING IT AS ONE WAS A COSTING ERROR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `fetchCauseList(sql, court)` took a court key and a date, which reads as "one
 * request returns a court's day". No licensed eCourts interface works that way,
 * and Master Roadmap v5 §3.4 already corrected v4 for assuming it. The High
 * Court service asks for a **High Court and a bench** before it will show a
 * list; the district service asks for a **state, district, court complex,
 * establishment and court**, and separately for **civil or criminal**. A court
 * with fourteen benches is fourteen requests, or twenty-eight once the list type
 * splits, and a quota plan built on "one court, one request" is wrong by more
 * than an order of magnitude.
 *
 * That matters here and not merely in the abstract: the grant allows 1,000
 * requests a day, and "how many matters can we monitor" is a division whose
 * denominator is this type.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR TIERS, AND TWO OF THEM ARE ADMISSIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `high_court` and `district` carry the dimensions the licensed interfaces
 * actually require. The other two exist so that a request we cannot yet
 * describe is not quietly written down as one we can:
 *
 * - `interface_probe` is the module's own entry point. Its dimensions are
 *   deliberately absent because discovering them is what the request is FOR.
 *   Nothing parsed out of a probe response may be written as a cause-list
 *   observation — a form page is not a court's day.
 * - `legacy_court_key` is the shape `cause_list_syncs` has carried since S3: a
 *   bare court string with no bench. It is under-specified and says so. It
 *   exists because `retryCauseList` has real rows in that shape and inventing a
 *   bench for them would put an unverifiable request on a ledger the registrar
 *   may read.
 *
 * Every tier produces a stable `sourceKeyId`, which is what
 * `official_source_artifact.source_document_key` stores. Two captures of the
 * same source on the same date therefore collide on identity by construction,
 * which is what makes the observation writer's idempotency checkable rather
 * than hopeful.
 */

/** ISO date, `YYYY-MM-DD`. The date the LIST is for, never when we asked. */
export type ListDate = string;

/**
 * Civil / criminal, where the interface demands the distinction.
 *
 * `null` is "this interface did not ask", which is a different fact from "we
 * asked for all of them" — and the difference is one request or two.
 */
export type ListType = string | null;

export type HighCourtSourceKey = {
  tier: 'high_court';
  /** The High Court as the licensed interface names it. */
  highCourtCode: string;
  /** The bench. A High Court is not a single listing surface. */
  benchCode: string;
  listDate: ListDate;
  listType: ListType;
};

export type DistrictSourceKey = {
  tier: 'district';
  stateCode: string;
  districtCode: string;
  courtComplexCode: string;
  /** The establishment inside the complex. */
  establishmentCode: string;
  /** The individual court/room, where the interface asks for one. */
  courtNumber: string | null;
  listDate: ListDate;
  listType: ListType;
};

export type InterfaceProbeSourceKey = {
  tier: 'interface_probe';
  /** A short name for what is being probed. Never a court. */
  probe: string;
  listDate: ListDate;
};

export type LegacyCourtSourceKey = {
  tier: 'legacy_court_key';
  /** The bare court string `cause_list_syncs` holds. Under-specified, knowingly. */
  court: string;
  listDate: ListDate;
};

export type CauseListSourceKey =
  | HighCourtSourceKey
  | DistrictSourceKey
  | InterfaceProbeSourceKey
  | LegacyCourtSourceKey;

/**
 * The value that goes in the ledger's `court` column.
 *
 * The ledger predates this type and has one column for it. Rather than widen the
 * schema for a value that is already derivable, the court dimension is projected
 * — and the projection is lossy ON PURPOSE for the tiers where the court is not
 * the whole story, which is why `sourceKeyId` exists beside it.
 */
export function ledgerCourt(key: CauseListSourceKey): string {
  switch (key.tier) {
    case 'high_court':
      return key.highCourtCode;
    case 'district':
      return `${key.stateCode}-${key.districtCode}`;
    case 'interface_probe':
      // Prefixed so it can never be mistaken for a court in a ledger query, and
      // so the data-quality artifact can exclude it from source coverage.
      return `PROBE_${key.probe}`;
    case 'legacy_court_key':
      return key.court;
  }
}

/**
 * The canonical, stable identity of one requestable source-and-date.
 *
 * Colon-delimited and ordered from broadest to narrowest so a `LIKE` prefix is
 * a meaningful subset — "everything for this High Court", "this bench across
 * dates". `UNSPECIFIED` is written out rather than left empty, because an empty
 * segment reads as a missing delimiter and a missing dimension must not be
 * silently indistinguishable from an empty one.
 */
export function sourceKeyId(key: CauseListSourceKey): string {
  const part = (v: string | null): string => (v === null || v === '' ? 'UNSPECIFIED' : v);
  switch (key.tier) {
    case 'high_court':
      return `ecourts:high_court:${key.highCourtCode}:${key.benchCode}:${part(key.listType)}:${key.listDate}`;
    case 'district':
      return (
        `ecourts:district:${key.stateCode}:${key.districtCode}:${key.courtComplexCode}:` +
        `${key.establishmentCode}:${part(key.courtNumber)}:${part(key.listType)}:${key.listDate}`
      );
    case 'interface_probe':
      return `ecourts:interface_probe:${key.probe}:${key.listDate}`;
    case 'legacy_court_key':
      return `ecourts:legacy_court_key:${key.court}:${key.listDate}`;
  }
}

/**
 * Whether a response for this key may become `ecourts_observation` rows.
 *
 * A probe is a request about the INTERFACE. Whatever comes back describes a
 * form, not a court's day, and writing it as an observation would be the exact
 * failure the observation writer exists to prevent: a confident claim about a
 * case that nobody observed. `legacy_court_key` is allowed because those rows
 * do name a court — under-specified is not the same as meaningless.
 */
export function mayProduceObservations(key: CauseListSourceKey): boolean {
  return key.tier !== 'interface_probe';
}
